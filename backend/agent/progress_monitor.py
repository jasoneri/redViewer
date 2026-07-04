"""CGS progress polling and monitor-result shaping for agent turns."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, AsyncIterator

from fastapi import HTTPException

from agent.contract import CGS_MCP_ERR_PROTOCOL_INVALID, ExceptionCauseChain, McpChatErrorPayload
from agent.final_summary import FinalSummaryBuilder
from agent.llm_turn import LlmTurnCollector, LlmTurnResult
from agent.progress_snapshot import (
    CgsProgressReader,
    CgsProgressResultPayload,
    CgsProgressSnapshot,
    CgsProgressSnapshotBuilder,
)
from agent.prompt_context import PromptMessageBuffer
from agent.prompt_templates import prompt_system_message
from agent.result_codec import DEFAULT_RESULT_CODEC
from agent.session import AgentSession

DEFAULT_CGS_MONITOR_POLL_INTERVAL_SECONDS = 1.2
DEFAULT_CGS_MONITOR_POLL_LIMIT = 120
DEFAULT_CGS_MONITOR_TERMINAL_STATUS = frozenset({'completed', 'failed'})


class CgsMonitorHandoff:
    def __init__(
        self,
        *,
        messages: PromptMessageBuffer,
        submit_summary: dict[str, Any],
        last_status_result: Any | None,
        last_events_result: Any | None,
    ) -> None:
        self._messages = messages
        self._submit_summary = submit_summary
        self._last_status_result = last_status_result
        self._last_events_result = last_events_result
        self._monitor_result: CgsMonitorResult | None = None
        self._monitor_payload: dict[str, Any] | None = None

    async def monitor_events(
        self,
        progress_monitor: CgsProgressMonitor,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        async for monitor_item in progress_monitor.iter(self._submit_summary):
            if isinstance(monitor_item, CgsMonitorProgressItem):
                self._last_status_result = monitor_item.status_result()
                self._last_events_result = monitor_item.events_result()
                yield monitor_item.event()
                continue
            if isinstance(monitor_item, CgsMonitorCompletionItem):
                self._monitor_result = monitor_item.result
                self._monitor_payload = monitor_item.payload()
                self._last_status_result = monitor_item.status_result
                self._last_events_result = monitor_item.events_result
        if self._monitor_result is None:
            self._monitor_result = CgsMonitorResult(
                terminal_status='timeout',
                status_result=self._last_status_result,
                events_result=self._last_events_result,
                progress=None,
                submit_summary=self._submit_summary,
            )
        if self._monitor_payload is None:
            self._monitor_payload = self._monitor_result.payload()

    def finalizer(self, session: AgentSession | None) -> CgsMonitorFinalizer:
        return CgsMonitorFinalizer(
            session=session,
            submit_summary=self._submit_summary,
            last_status_result=self._last_status_result,
            last_events_result=self._last_events_result,
            monitor_payload=self.monitor_payload(),
        )

    def append_monitor_result(self) -> None:
        self._messages.append_context(self.monitor_result().message())
        self._messages.append_context(prompt_system_message('monitor_finalize.md'))

    async def collect_final_turn(self, llm_turn_collector: LlmTurnCollector) -> LlmTurnResult:
        return await llm_turn_collector.collect_without_tools(self._messages)

    def monitor_result(self) -> CgsMonitorResult:
        if self._monitor_result is None:
            raise RuntimeError('CGS monitor result is not available before monitoring completes')
        return self._monitor_result

    def monitor_payload(self) -> dict[str, Any]:
        if self._monitor_payload is None:
            raise RuntimeError('CGS monitor payload is not available before monitoring completes')
        return self._monitor_payload

    def monitor_success(self) -> bool:
        return self.monitor_payload().get('terminalStatus') == 'completed'

    def final_text(self, final_turn: LlmTurnResult) -> str:
        raw_final_text = (
            final_turn.response_text()
            or self.monitor_payload().get('summary')
            or '完成'
        )
        if final_turn.has_tool_calls_without_text():
            return 'CGS 监控已完成，模型仍请求继续调用工具；本次已停止继续调用。'
        return raw_final_text


@dataclass(frozen=True)
class CgsMonitorResult:
    terminal_status: str
    status_result: Any
    events_result: Any
    progress: dict[str, Any] | None
    submit_summary: dict[str, Any] | None

    @property
    def status_payload(self) -> dict[str, Any]:
        return CgsProgressResultPayload(self.status_result).payload() or {}

    @property
    def events_payload(self) -> dict[str, Any]:
        return CgsProgressResultPayload(self.events_result).payload() or {}

    def payload(self) -> dict[str, Any]:
        progress_payload = self.progress or {}
        badges = progress_payload.get('badges') if isinstance(progress_payload.get('badges'), list) else []
        finished_badges = (
            progress_payload.get('finished_badges')
            if isinstance(progress_payload.get('finished_badges'), list)
            else []
        )
        events = self.events_payload.get('events') if isinstance(self.events_payload.get('events'), list) else []
        logs = self.events_payload.get('logs') if isinstance(self.events_payload.get('logs'), list) else []
        return {
            'phase': 'cgs_monitor_completed',
            'terminalStatus': self.terminal_status,
            'progressPercent': progress_payload.get('percent'),
            'summary': self.summary(),
            'badges': badges,
            'finishedBadges': finished_badges or (badges if self.terminal_status == 'completed' else []),
            'eventCount': len(events),
            'logCount': len(logs),
            'submitted': bool((self.submit_summary or {}).get('submitted', True))
            if self.submit_summary is not None
            else False,
        }

    def message(self) -> dict[str, Any]:
        return {
            'role': 'system',
            'content': '【CGS 监控结果】' + json.dumps(self.payload(), ensure_ascii=False, default=str),
        }

    def summary(self) -> str:
        job = self.status_payload.get('job') if isinstance(self.status_payload.get('job'), dict) else {}
        for value in (
            job.get('stage'),
            job.get('message'),
            self.status_payload.get('message'),
        ):
            text = str(value or '').strip()
            if text:
                return DEFAULT_RESULT_CODEC.truncate(text)
        rows = self.events_payload.get('events') or self.events_payload.get('logs') or []
        if isinstance(rows, list):
            for row in reversed(rows):
                if not isinstance(row, dict):
                    continue
                for key in ('message', 'detail', 'stage', 'name', 'error'):
                    text = str(row.get(key) or '').strip()
                    if text:
                        return DEFAULT_RESULT_CODEC.truncate(text)
        if self.terminal_status == 'completed':
            return '下载完成'
        if self.terminal_status == 'failed':
            return '下载失败'
        if self.terminal_status == 'aborted':
            return '下载监控已停止'
        return '下载状态未确认'


@dataclass(frozen=True)
class CgsMonitorProgressItem:
    snapshot: CgsProgressSnapshot
    progress: dict[str, Any]

    def status_result(self) -> Any:
        return self.snapshot.status_result()

    def events_result(self) -> Any:
        return self.snapshot.events_result()

    def event(self) -> tuple[str, dict[str, Any]]:
        return 'cgs_progress', self.progress


@dataclass(frozen=True)
class CgsMonitorCompletionItem:
    result: CgsMonitorResult

    @property
    def status_result(self) -> Any:
        return self.result.status_result

    @property
    def events_result(self) -> Any:
        return self.result.events_result

    def payload(self) -> dict[str, Any]:
        return self.result.payload()


class CgsMonitorFinalizer:
    def __init__(
        self,
        *,
        session: AgentSession | None,
        submit_summary: dict[str, Any],
        last_status_result: Any | None,
        last_events_result: Any | None,
        monitor_payload: dict[str, Any],
    ) -> None:
        self._session = session
        self._submit_summary = submit_summary
        self._last_status_result = last_status_result
        self._last_events_result = last_events_result
        self._monitor_payload = monitor_payload

    def from_text(
        self,
        raw_final_text: str,
        *,
        monitor_success: bool,
    ) -> dict[str, Any]:
        final_payload = FinalSummaryBuilder(
            status_result=self._last_status_result,
            events_result=self._last_events_result,
            submit_summary=self._submit_summary,
            submit_accepted=True,
            monitor_result=self._monitor_payload,
        ).from_text(
            raw_final_text,
            fallback_success=monitor_success,
            require_fallback_success=True,
            prefer_raw_unparsed_summary=True,
            summary_default='完成',
        )
        self.finish_turn()
        return final_payload

    def failure(self, message: str) -> dict[str, Any]:
        final_payload = FinalSummaryBuilder(
            status_result=self._last_status_result,
            events_result=self._last_events_result,
            submit_summary=self._submit_summary,
            submit_accepted=True,
            monitor_result=self._monitor_payload,
        ).failure(message)
        self.finish_turn()
        return final_payload

    def finish_turn(self) -> None:
        if self._session is not None:
            self._session.increment_turns()


class CgsProgressMonitor:
    def __init__(
        self,
        *,
        client: Any,
        tool_names: set[str],
        progress_reader: CgsProgressReader | None = None,
        poll_interval_seconds: float = DEFAULT_CGS_MONITOR_POLL_INTERVAL_SECONDS,
        poll_limit: int = DEFAULT_CGS_MONITOR_POLL_LIMIT,
        terminal_status: frozenset[str] = DEFAULT_CGS_MONITOR_TERMINAL_STATUS,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._client = client
        self._tool_names = tool_names
        self._progress_reader = progress_reader
        self._poll_interval_seconds = poll_interval_seconds
        self._poll_limit = poll_limit
        self._terminal_status = terminal_status
        self._sleep = sleep

    async def read_snapshot(
        self,
        submit_summary: dict[str, Any] | None = None,
    ) -> CgsProgressSnapshot | None:
        return await CgsProgressSnapshotBuilder(
            client=self._client,
            tool_names=self._tool_names,
            submit_summary=submit_summary,
            progress_reader=self._progress_reader,
        ).read()

    async def iter(
        self,
        submit_summary: dict[str, Any] | None,
    ) -> AsyncIterator[CgsMonitorProgressItem | CgsMonitorCompletionItem]:
        last_status_result: Any | None = None
        last_events_result: Any | None = None
        last_progress: dict[str, Any] | None = None
        terminal_status = 'timeout'
        for index in range(self._poll_limit):
            snapshot = await self.read_snapshot(submit_summary=submit_summary)
            if snapshot is None:
                break
            progress = snapshot.to_progress()
            last_status_result = snapshot.status_result()
            last_events_result = snapshot.events_result()
            last_progress = progress
            status_key_value = snapshot.status_key()
            percent = snapshot.status_percent()
            if status_key_value not in self._terminal_status and percent is not None and percent >= 100:
                status_key_value = 'completed'
                progress = {**progress, 'status': 'completed', 'percent': 100}
                last_progress = progress
            yield CgsMonitorProgressItem(snapshot=snapshot, progress=progress)
            if status_key_value in self._terminal_status:
                terminal_status = status_key_value
                break
            if index + 1 < self._poll_limit:
                await self._sleep(self._poll_interval_seconds)
        monitor_result = CgsMonitorResult(
            terminal_status=terminal_status,
            status_result=last_status_result,
            events_result=last_events_result,
            progress=last_progress,
            submit_summary=submit_summary,
        )
        yield CgsMonitorCompletionItem(result=monitor_result)


class CgsMonitorHandoffRunner:
    def __init__(
        self,
        *,
        llm_turn_collector: LlmTurnCollector,
        session: AgentSession | None,
        handoff: CgsMonitorHandoff,
        progress_monitor: CgsProgressMonitor,
    ) -> None:
        self._llm_turn_collector = llm_turn_collector
        self._session = session
        self._handoff = handoff
        self._progress_monitor = progress_monitor

    async def run(self) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        async for event in self._handoff.monitor_events(self._progress_monitor):
            yield event
        finalizer = self._handoff.finalizer(self._session)
        self._handoff.append_monitor_result()
        try:
            final_turn = await self._handoff.collect_final_turn(self._llm_turn_collector)
        except HTTPException as exc:
            error_payload = McpChatErrorPayload(exc.detail).payload()
            message = str(error_payload.get('message') or '最终总结失败')
            yield 'error', error_payload
            yield 'final', finalizer.failure(message)
            return
        except Exception as exc:
            message = ExceptionCauseChain(exc).message()
            yield 'error', {
                'class': CGS_MCP_ERR_PROTOCOL_INVALID,
                'message': message,
                'fields': ['base_url'],
            }
            yield 'final', finalizer.failure(message)
            return
        final_payload = finalizer.from_text(
            self._handoff.final_text(final_turn),
            monitor_success=self._handoff.monitor_success(),
        )
        yield 'final', final_payload
