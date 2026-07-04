"""High-level CGS MCP agent turn orchestration."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from typing import Any

from agent.candidate_context import CandidateContext
from agent.contract import CgsMcpChatRequest
from agent.final_summary import FinalSummaryBuilder
from agent.llm_turn import LlmTurnCollector, LlmTurnResult
from agent.mcp_toolbox import McpToolbox, McpToolboxLoader
from agent.progress_monitor import CgsMonitorHandoff, CgsMonitorHandoffRunner, CgsProgressMonitor
from agent.progress_snapshot import CgsProgressReader
from agent.prompt_context import PromptContextBuilder, PromptMessageBuffer
from agent.prompt_templates import render_prompt
from agent.session_state import SessionStateManager, TurnSessionState

ClientFactory = Callable[[Any], Any]


class AgentTurnContext:
    _turn_session: TurnSessionState
    _toolbox: McpToolbox
    _progress_monitor: CgsProgressMonitor
    _messages: PromptMessageBuffer
    _llm_turn_collector: LlmTurnCollector
    _last_submit_summary: dict[str, Any] | None = None
    _last_submit_accepted: bool = False
    _last_status_result: Any | None = None
    _last_events_result: Any | None = None
    _monitor_handoff: CgsMonitorHandoff | None = None

    def __init__(
        self,
        *,
        turn_session: TurnSessionState,
        toolbox: McpToolbox,
        progress_monitor: CgsProgressMonitor,
        messages: PromptMessageBuffer,
        llm_turn_collector: LlmTurnCollector,
    ) -> None:
        self._turn_session = turn_session
        self._toolbox = toolbox
        self._progress_monitor = progress_monitor
        self._messages = messages
        self._llm_turn_collector = llm_turn_collector
        self._last_submit_summary = None
        self._last_submit_accepted = False
        self._last_status_result = None
        self._last_events_result = None
        self._monitor_handoff = None

    def final_builder(self) -> FinalSummaryBuilder:
        return FinalSummaryBuilder(
            status_result=self._last_status_result,
            events_result=self._last_events_result,
            submit_summary=self._last_submit_summary,
            submit_accepted=self._last_submit_accepted,
        )

    def increment_turns(self) -> None:
        session = self._turn_session.session
        if session is not None:
            session.increment_turns()

    async def collect_llm_turn(self) -> LlmTurnResult:
        return await self._toolbox.collect_llm_turn(self._llm_turn_collector, self._messages)

    async def collect_final_turn(self) -> LlmTurnResult:
        return await self._llm_turn_collector.collect_without_tools(self._messages)

    def append_assistant_tool_request(self, llm_turn: LlmTurnResult) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        ordered_calls = llm_turn.ordered_tool_calls()
        assistant_message = llm_turn.assistant_tool_request_message()
        self._messages.append_assistant(assistant_message)
        return assistant_message, ordered_calls

    async def execute_tool_calls(
        self,
        assistant_message: dict[str, Any],
        ordered_calls: list[dict[str, Any]],
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        answered_calls: list[dict[str, Any]] = []
        for call in ordered_calls:
            outcome = await self._toolbox.execute_tool_call(call, self._messages)
            self.record_tool_outcome(outcome)
            outcome.retain_answered_call(answered_calls)
            for event in outcome.events:
                yield event
            if self.has_monitor_handoff():
                break
            if outcome.should_read_progress:
                progress = await self.progress_payload()
                if progress is not None:
                    yield 'cgs_progress', progress

        if answered_calls:
            assistant_message['tool_calls'] = answered_calls
            return
        assistant_message.pop('tool_calls', None)
        if assistant_message.get('content') is None:
            assistant_message['content'] = ''

    def append_final_only_message(self, message: str) -> None:
        self._messages.append_system(message)

    async def progress_payload(self) -> dict[str, Any] | None:
        snapshot = await self._progress_monitor.read_snapshot(submit_summary=self._last_submit_summary)
        if snapshot is None:
            return None
        self._last_status_result = snapshot.status_result()
        self._last_events_result = snapshot.events_result()
        return snapshot.to_progress()

    def record_tool_outcome(self, outcome: Any) -> None:
        outcome.apply_submit_state(self)

    def record_submit_result(self, submit_summary: dict[str, Any], *, accepted: bool) -> None:
        self._last_submit_summary = submit_summary
        if accepted:
            self._last_submit_accepted = True
            self._monitor_handoff = CgsMonitorHandoff(
                messages=self._messages,
                submit_summary=submit_summary,
                last_status_result=self._last_status_result,
                last_events_result=self._last_events_result,
            )

    def has_monitor_handoff(self) -> bool:
        return self._monitor_handoff is not None

    async def run_monitor_handoff(self) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        if self._monitor_handoff is None:
            return
        handoff_runner = CgsMonitorHandoffRunner(
            llm_turn_collector=self._llm_turn_collector,
            session=self._turn_session.session,
            handoff=self._monitor_handoff,
            progress_monitor=self._progress_monitor,
        )
        async for event in handoff_runner.run():
            yield event


class AgentTurnStart:
    def __init__(
        self,
        *,
        context: AgentTurnContext,
        startup_events: list[tuple[str, dict[str, Any]]],
    ) -> None:
        self._context = context
        self._startup_events = tuple(startup_events)

    def context(self) -> AgentTurnContext:
        return self._context

    def startup_events(self) -> tuple[tuple[str, dict[str, Any]], ...]:
        return self._startup_events


class AgentTurnBootstrap:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        client: Any,
        endpoint_base_url: str,
        llm_turn_collector: LlmTurnCollector,
        progress_reader: CgsProgressReader | None = None,
    ) -> None:
        self._req = req
        self._client = client
        self._endpoint_base_url = endpoint_base_url
        self._llm_turn_collector = llm_turn_collector
        self._progress_reader = progress_reader
        self._startup_events: list[tuple[str, dict[str, Any]]] = []

    async def start(self) -> AgentTurnStart:
        self._startup_events = []
        turn_session = SessionStateManager(self._req).begin_turn()
        session = turn_session.session
        candidate_context = CandidateContext(
            req=self._req,
            session=session,
            llm_turn_collector=self._llm_turn_collector,
        )
        toolbox = await McpToolboxLoader(
            client=self._client,
            endpoint_base_url=self._endpoint_base_url,
            turn_session=turn_session,
            candidate_context=candidate_context,
        ).load()
        progress_monitor = toolbox.progress_monitor(self._progress_reader)
        toolbox.require_required_tools()
        if turn_session.should_reset:
            self._startup_events.append(await toolbox.reset_work_state())
            progress_snapshot = await progress_monitor.read_snapshot()
            progress = progress_snapshot.to_progress() if progress_snapshot is not None else None
            if progress is not None:
                self._startup_events.append(('cgs_progress', progress))
        messages = PromptContextBuilder(
            req=self._req,
            session=session,
            cached_sites_message=toolbox.cached_sites_context_message(),
            is_ephemeral=turn_session.is_ephemeral,
            is_new_session=turn_session.is_new_session,
            reset_requested=turn_session.reset_requested,
        ).build()
        return AgentTurnStart(
            context=AgentTurnContext(
                turn_session=turn_session,
                toolbox=toolbox,
                progress_monitor=progress_monitor,
                messages=messages,
                llm_turn_collector=self._llm_turn_collector,
            ),
            startup_events=self._startup_events,
        )


class AgentTurnRunner:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        endpoint: Any,
        make_client: ClientFactory,
        llm_turn_collector: LlmTurnCollector,
        progress_reader: CgsProgressReader | None = None,
        loop_iteration_limit: int = 16,
        final_only_message: str | None = None,
    ) -> None:
        self._req = req
        self._endpoint = endpoint
        self._make_client = make_client
        self._llm_turn_collector = llm_turn_collector
        self._progress_reader = progress_reader
        self._loop_iteration_limit = loop_iteration_limit
        self._final_only_message = final_only_message or render_prompt('final_only.md')

    async def run(self) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        async with self._make_client(self._endpoint) as client:
            endpoint_base_url = str(getattr(self._endpoint, 'base_url', '') or '')
            turn_start = await AgentTurnBootstrap(
                req=self._req,
                client=client,
                endpoint_base_url=endpoint_base_url,
                llm_turn_collector=self._llm_turn_collector,
                progress_reader=self._progress_reader,
            ).start()
            context = turn_start.context()
            for event in turn_start.startup_events():
                yield event

            for _ in range(self._loop_iteration_limit):
                llm_turn = await context.collect_llm_turn()

                if not llm_turn.has_tool_calls():
                    raw_final_text = llm_turn.response_text('完成')
                    final_payload = context.final_builder().from_text(
                        raw_final_text,
                        prefer_raw_unparsed_summary=True,
                        summary_default='完成',
                    )
                    context.increment_turns()
                    yield 'final', final_payload
                    return

                for piece in llm_turn.assistant_deltas():
                    yield 'assistant_delta', {'text': piece}

                assistant_message, ordered_calls = context.append_assistant_tool_request(llm_turn)
                async for event, payload in context.execute_tool_calls(assistant_message, ordered_calls):
                    yield event, payload
                if context.has_monitor_handoff():
                    break

            if context.has_monitor_handoff():
                async for event, payload in context.run_monitor_handoff():
                    yield event, payload
                return

            context.append_final_only_message(self._final_only_message)
            final_turn = await context.collect_final_turn()
            raw_forced_text = final_turn.response_text('已停止继续调用工具')
            forced_text = raw_forced_text
            if final_turn.has_tool_calls_without_text():
                forced_text = '已达到工具轮次上限，模型仍请求继续调用工具；本次已停止继续调用。'
            final_payload = context.final_builder().from_text(
                forced_text or raw_forced_text,
                prefer_raw_unparsed_summary=True,
                summary_default=forced_text or final_turn.response_text('已停止继续调用工具'),
            )
            context.increment_turns()
            yield 'final', final_payload
