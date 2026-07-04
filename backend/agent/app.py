"""Application boundary for CGS MCP agent turns."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import httpx

from agent.contract import AttachedBookContext, CgsMcpChatRequest
from agent.llm_turn import LlmTurnCollector
from agent.prompt_templates import render_prompt
from agent.progress_snapshot import CgsProgressReader
from agent.turn_runner import AgentTurnRunner

ClientFactory = Callable[[Any], Any]


_OUTCOME_RESULTS = {'changed', 'satisfied', 'waiting_user', 'blocked', 'skipped', 'cancelled', 'failed'}
_OUTCOME_REASONS = {
    'downloaded',
    'already_downloaded',
    'already_latest',
    'not_published',
    'remote_missing',
    'ambiguous_selection',
    'preference_skipped',
    'preview_only',
    'user_cancelled',
    'external_unavailable',
    'runtime_error',
}
_OUTCOME_COUNT_KEYS = ('changed', 'satisfied', 'waiting_user', 'blocked', 'skipped', 'cancelled', 'failed')


@dataclass(frozen=True)
class TextField:
    value: Any

    def text(self) -> str:
        return str(self.value or '').strip()


@dataclass(frozen=True)
class AttachedBookEvent:
    attached_book: AttachedBookContext

    def payload(self) -> dict[str, Any]:
        attached_book = self.attached_book
        return {
            'attach_book_id': attached_book.attach_book_id,
            'book_id': attached_book.book_id,
            'book': attached_book.book,
            'title': attached_book.title or attached_book.book_context.title or attached_book.book,
            'source': attached_book.source or attached_book.book_context.source,
        }


@dataclass(frozen=True)
class BadgeView:
    badge: dict[str, Any]

    def field(self, *keys: str) -> str:
        for key in keys:
            value = TextField(self.badge.get(key)).text()
            if value:
                return value
        return ''

    def kind(self) -> str:
        return 'ep' if TextField(self.badge.get('type')).text().lower() in {'ep', 'episode'} else 'book'

    def identity_key(self) -> str:
        badge_type = self.kind()
        book_key = self.field('book_key', 'bookKey', 'book_id', 'bookId')
        episode_key = self.field('episode_key', 'episodeKey')
        text = self.field('text', 'label', 'title', 'name')
        if badge_type == 'ep':
            return f'ep:{book_key}:{episode_key or text}'.lower()
        return f'book:{book_key or text}'.lower()

    def scoped(self, attached_payload: dict[str, Any]) -> dict[str, Any]:
        scope_key = BadgeView(attached_payload).field('book_id', 'attach_book_id', 'book', 'title')
        if not scope_key:
            return self.badge
        next_badge = dict(self.badge)
        next_view = BadgeView(next_badge)
        if not next_view.field('book_key', 'bookKey', 'book_id', 'bookId'):
            next_badge['bookKey'] = scope_key
        if not next_view.field('source'):
            next_badge['source'] = 'monitor_summary'
        return next_badge

    def completion_unit(self, attached_payload: dict[str, Any], index: int, total: int) -> dict[str, Any] | None:
        label = self.field('text', 'label', 'title', 'name')
        if not label:
            return None
        unit: dict[str, Any] = {'kind': self.kind(), 'label': label}
        unit_id = self.field('id')
        episode_key = self.field('episode_key', 'episodeKey')
        if unit_id:
            unit['unit_id'] = unit_id
        if episode_key:
            unit['episode_key'] = episode_key
        return {
            'scope': {
                'book_index': index,
                'book_total': total,
                'attach_book_id': attached_payload.get('attach_book_id'),
                'book_id': attached_payload.get('book_id'),
            },
            'unit': unit,
            'state': 'finished',
            'source': self.field('source') or 'monitor_summary',
        }


@dataclass(frozen=True)
class CompletionBadges:
    final_event: dict[str, Any]
    monitor_result: dict[str, Any]
    attached_payload: dict[str, Any]

    def finished(self) -> list[dict[str, Any]]:
        badges: list[dict[str, Any]] = []
        seen: set[str] = set()
        for group in (self.monitor_finished(), self.event_finished()):
            for badge in group:
                key = BadgeView(badge).identity_key()
                if key in seen:
                    continue
                seen.add(key)
                badges.append(BadgeView(badge).scoped(self.attached_payload))
        return badges

    def monitor_finished(self) -> list[dict[str, Any]]:
        finished = self.monitor_result.get('finishedBadges')
        return [badge for badge in finished if isinstance(badge, dict)] if isinstance(finished, list) else []

    def event_finished(self) -> list[dict[str, Any]]:
        finished = self.final_event.get('finished_badges')
        return [badge for badge in finished if isinstance(badge, dict)] if isinstance(finished, list) else []


@dataclass(frozen=True)
class CompletionUnits:
    finished_badges: list[dict[str, Any]]
    attached_payload: dict[str, Any]
    index: int
    total: int

    def items(self) -> list[dict[str, Any]]:
        units: list[dict[str, Any]] = []
        for badge in self.finished_badges:
            unit = BadgeView(badge).completion_unit(self.attached_payload, self.index, self.total)
            if unit is not None:
                units.append(unit)
        return units


@dataclass(frozen=True)
class FinalSummaryView:
    raw: dict[str, Any]

    def without_badges(self) -> dict[str, Any]:
        if not self.raw:
            return {}
        blocks = self.raw.get('blocks') if isinstance(self.raw.get('blocks'), list) else []
        return {
            **self.raw,
            'blocks': [block for block in blocks if not (isinstance(block, dict) and block.get('type') == 'badges')],
            'finished_badges': [],
        }

    def status(self) -> str:
        status = TextField(self.raw.get('status')).text().lower()
        return status if status in {'completed', 'partial', 'failed'} else ''


@dataclass(frozen=True)
class CompletionOutcome:
    final_event: dict[str, Any]
    attached_payload: dict[str, Any]
    monitor_result: dict[str, Any]
    final_summary: dict[str, Any]
    finished_badges: list[dict[str, Any]]
    summary: str

    def classify(self) -> dict[str, Any]:
        explicit = self.normalize(self.final_event.get('outcome'))
        if explicit is not None:
            return explicit

        terminal_status = TextField(self.monitor_result.get('terminalStatus')).text().lower()
        final_status = FinalSummaryView(self.final_summary).status()
        if self.final_event.get('success') is False or final_status == 'failed' or terminal_status in {'failed', 'failure', 'error'}:
            result, reason = 'failed', 'runtime_error'
        elif self.finished_badges:
            result, reason = 'changed', 'downloaded'
        elif final_status == 'partial':
            result, reason = 'waiting_user', 'ambiguous_selection'
        elif final_status == 'completed':
            result, reason = 'satisfied', 'already_latest'
        else:
            result, reason = 'blocked', 'external_unavailable'

        subject = self.subject()
        return {
            'schema_version': 1,
            'result': result,
            'reason': reason,
            'subject': subject,
            'evidence': self.evidence(),
            'assistant_message': self.message(result, reason, subject),
        }

    def subject(self) -> dict[str, str]:
        subject = {
            'attach_book_id': TextField(self.attached_payload.get('attach_book_id')).text(),
            'book_id': TextField(self.attached_payload.get('book_id')).text(),
            'book_title': TextField(self.attached_payload.get('title') or self.attached_payload.get('book')).text(),
            'source': TextField(self.attached_payload.get('source')).text(),
        }
        return {key: value for key, value in subject.items() if value}

    def evidence(self) -> list[dict[str, str]]:
        evidence: list[dict[str, str]] = []
        terminal_status = TextField(self.monitor_result.get('terminalStatus')).text()
        if terminal_status:
            evidence.append({'kind': 'monitor', 'label': 'terminalStatus', 'value': terminal_status})
        final_status = FinalSummaryView(self.final_summary).status()
        if final_status:
            evidence.append({'kind': 'tool_result', 'label': 'final_summary.status', 'value': final_status})
        if self.finished_badges:
            labels = [BadgeView(badge).field('text', 'label', 'title', 'name') for badge in self.finished_badges]
            evidence.append({'kind': 'monitor', 'label': 'finished_badges', 'value': '、'.join([label for label in labels if label])})
        if self.summary:
            evidence.append({'kind': 'tool_result', 'label': 'summary', 'value': self.summary[:160]})
        return evidence

    def message(self, result: str, reason: str, subject: dict[str, str]) -> dict[str, str]:
        title = subject.get('book_title') or '本书'
        messages = {
            ('changed', 'downloaded'): ('下载完成', f'{title} 已完成下载。'),
            ('satisfied', 'already_downloaded'): ('已在本地', f'{title} 请求的章节已在本地书库中，本次不重复下载。'),
            ('satisfied', 'already_latest'): ('已同步到最新', f'{title} 已同步到站点当前最新内容，本次没有新增下载。'),
            ('blocked', 'not_published'): ('尚未发布', f'{title} 请求的章节站点尚未发布，本次不能继续下载。'),
            ('blocked', 'remote_missing'): ('站点未找到', f'{title} 请求的章节当前站点未找到，需要确认是否下架、改名或换源。'),
            ('waiting_user', 'ambiguous_selection'): ('需要确认', f'{title} 存在候选或编号不确定，需要用户选择后继续。'),
            ('skipped', 'preference_skipped'): ('已按偏好跳过', f'{title} 已按偏好或过滤条件跳过。'),
            ('skipped', 'preview_only'): ('预览已停止', f'{title} 当前是预览模式，本次只返回候选不提交下载。'),
            ('cancelled', 'user_cancelled'): ('已取消', f'{title} 已按用户操作取消，本次未继续下载。'),
            ('blocked', 'external_unavailable'): ('外部条件阻塞', f'{title} 受站点、账号、限流或验证码等外部条件阻塞，处理未继续。'),
            ('failed', 'runtime_error'): ('处理失败', f'{title} 处理时出现运行或工具错误。'),
        }
        message = messages.get((result, reason), ('处理结果', f'{title} 本次结果：{result}/{reason}。'))
        return {'title': message[0], 'body': message[1]}

    def normalize(self, raw: Any) -> dict[str, Any] | None:
        if not isinstance(raw, dict):
            return None
        result = TextField(raw.get('result')).text().lower()
        reason = TextField(raw.get('reason')).text().lower()
        if result not in _OUTCOME_RESULTS or reason not in _OUTCOME_REASONS:
            return None
        subject = raw.get('subject') if isinstance(raw.get('subject'), dict) else {}
        normalized_subject = {**self.subject()}
        normalized_subject.update({
            key: TextField(value).text()
            for key, value in subject.items()
            if key in {'attach_book_id', 'book_id', 'book_title', 'source', 'episode_key', 'episode_label'} and TextField(value).text()
        })
        raw_evidence = raw.get('evidence') if isinstance(raw.get('evidence'), list) else []
        evidence = [
            {
                'kind': TextField(item.get('kind')).text() or 'tool_result',
                'label': TextField(item.get('label')).text() or 'evidence',
                'value': TextField(item.get('value')).text(),
            }
            for item in raw_evidence
            if isinstance(item, dict) and TextField(item.get('value')).text()
        ]
        raw_message = raw.get('assistant_message') if isinstance(raw.get('assistant_message'), dict) else {}
        assistant_message = {
            'title': TextField(raw_message.get('title')).text(),
            'body': TextField(raw_message.get('body')).text(),
        }
        if not assistant_message['title'] or not assistant_message['body']:
            assistant_message = self.message(result, reason, normalized_subject)
        return {
            'schema_version': 1,
            'result': result,
            'reason': reason,
            'subject': normalized_subject,
            'evidence': evidence,
            'assistant_message': assistant_message,
        }


@dataclass(frozen=True)
class AttachedBookCompletion:
    total: int
    index: int
    attached_book: AttachedBookContext
    final_event: dict[str, Any]

    def payload(self) -> dict[str, Any]:
        monitor_result = self.final_event.get('monitor_result') if isinstance(self.final_event.get('monitor_result'), dict) else {}
        raw_final_summary = self.final_event.get('final_summary') if isinstance(self.final_event.get('final_summary'), dict) else {}
        final_summary = FinalSummaryView(raw_final_summary).without_badges()
        attached_payload = AttachedBookEvent(self.attached_book).payload()
        finished_badges = CompletionBadges(self.final_event, monitor_result, attached_payload).finished()
        completion_units = CompletionUnits(finished_badges, attached_payload, self.index, self.total).items()
        summary = TextField(self.final_event.get('summary')).text() or TextField(final_summary.get('summary')).text()
        outcome = CompletionOutcome(
            final_event=self.final_event,
            attached_payload=attached_payload,
            monitor_result=monitor_result,
            final_summary=final_summary,
            finished_badges=finished_badges,
            summary=summary,
        ).classify()
        success = outcome['result'] != 'failed'
        return {
            'schema_version': 1,
            'success': success,
            'outcome': outcome,
            'terminal': False,
            'book_index': self.index,
            'book_total': self.total,
            'attached_book': attached_payload,
            'summary': summary or '子任务完成',
            **({'markdown': self.final_event.get('markdown')} if isinstance(self.final_event.get('markdown'), str) else {}),
            **({'finished_badges': finished_badges} if finished_badges else {}),
            **({'completion_units': completion_units} if completion_units else {}),
            **({'final_summary': final_summary} if final_summary else {}),
            'monitor_summary': monitor_result,
        }


@dataclass(frozen=True)
class OutcomeCounts:
    completions: list[dict[str, Any]]
    total: int

    def values(self) -> dict[str, int]:
        counts = {key: 0 for key in _OUTCOME_COUNT_KEYS}
        for payload in self.completions:
            outcome = payload.get('outcome') if isinstance(payload.get('outcome'), dict) else {}
            result = TextField(outcome.get('result')).text().lower()
            if result in counts:
                counts[result] += 1
            elif payload.get('success') is False:
                counts['failed'] += 1
            else:
                counts['changed'] += 1
        missing = max(0, self.total - len(self.completions))
        if missing:
            counts['failed'] += missing
        return counts

    def summary(self, counts: dict[str, int]) -> str:
        labels = (
            ('changed', '下载'),
            ('satisfied', '已满足'),
            ('waiting_user', '待确认'),
            ('blocked', '受阻'),
            ('skipped', '跳过'),
            ('cancelled', '取消'),
            ('failed', '失败'),
        )
        return '，'.join(f'{label} {counts.get(key, 0)}' for key, label in labels if counts.get(key, 0))


class AttachedBookListProgress:
    def __init__(self, *, total: int, completions: list[dict[str, Any]] | None = None) -> None:
        self._total = total
        self._completions = list(completions or [])

    def subtask_prompt(self, prompt: str, attached_book: AttachedBookContext, index: int) -> str:
        title = attached_book.title or attached_book.book_context.title or attached_book.book
        subtask_context = {
            'index': index,
            'total': self._total,
            'title': title,
            'book': attached_book.book,
            'source': attached_book.source or attached_book.book_context.source,
            'attach_book_id': attached_book.attach_book_id,
            'book_id': attached_book.book_id,
        }
        return render_prompt(
            'attached_book_subtask.md',
            subtask_context_json=json.dumps(subtask_context, ensure_ascii=False, default=str),
            user_prompt=prompt,
        )

    def record_completion(
        self,
        payload: dict[str, Any],
        attached_book: AttachedBookContext,
        index: int,
    ) -> dict[str, Any]:
        completion = AttachedBookCompletion(
            total=self._total,
            index=index,
            attached_book=attached_book,
            final_event=payload,
        ).payload()
        self._completions.append(completion)
        return completion

    def final_payload(self) -> dict[str, Any]:
        outcome_counts = OutcomeCounts(self._completions, self._total)
        counts = outcome_counts.values()
        failed = counts['failed']
        succeeded = self._total - failed
        success = failed == 0
        has_unresolved = any(counts[key] for key in ('waiting_user', 'blocked', 'cancelled'))
        status = 'completed' if success and not has_unresolved else 'partial'
        count_summary = outcome_counts.summary(counts) or f'已处理 {len(self._completions)}'
        prefix = 'attachedBookList 处理完成' if success and not has_unresolved else 'attachedBookList 部分完成'
        summary = f'{prefix}：{count_summary}'
        final_summary = {
            'schema_version': 1,
            'status': status,
            'title': '批量处理完成' if success else '部分完成',
            'headline': summary,
            'summary': summary,
            'blocks': [],
            'finished_badges': [],
            'warnings': [],
        }
        return {
            'schema_version': 1,
            'success': success,
            'terminal': True,
            'attached_book_list_final': True,
            'summary': summary,
            'final_summary': final_summary,
            'attached_book_list': {
                'book_total': self._total,
                'completed': len(self._completions),
                'succeeded': succeeded,
                'failed': failed,
                'outcomes': counts,
            },
        }


class CgsAgentApp:
    def __init__(
        self,
        *,
        endpoint: Any,
        make_client: ClientFactory,
        llm_transport: httpx.AsyncBaseTransport | None,
        progress_reader: CgsProgressReader | None = None,
    ) -> None:
        self._endpoint = endpoint
        self._make_client = make_client
        self._llm_transport = llm_transport
        self._progress_reader = progress_reader

    async def stream_turn(self, req: CgsMcpChatRequest) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        attached_book_list = req.attached_book_list or []
        if len(attached_book_list) <= 1:
            async for event in self.stream_single_turn(req):
                yield event
            return

        progress = AttachedBookListProgress(total=len(attached_book_list))
        batch_session_suffix = uuid4().hex[:12] if req.session_id else None
        for index, attached_book in enumerate(attached_book_list, start=1):
            sub_req = req.model_copy(update={
                'prompt': progress.subtask_prompt(req.prompt, attached_book, index),
                'book_context': attached_book.book_context,
                'attach_book_id': attached_book.attach_book_id,
                'attach_book_ids': [attached_book.attach_book_id],
                'attached_book_list': [attached_book],
                'session_id': f'{req.session_id}:batch-{batch_session_suffix}:book-{index}' if batch_session_suffix else None,
            })
            async for event, payload in self.stream_single_turn(sub_req):
                if event == 'final':
                    completion = progress.record_completion(payload, attached_book, index)
                    yield 'cgs_book_completed', completion
                    continue
                yield event, payload
        yield 'final', progress.final_payload()

    async def stream_single_turn(self, req: CgsMcpChatRequest) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        runner = AgentTurnRunner(
            req=req,
            endpoint=self._endpoint,
            make_client=self._make_client,
            llm_turn_collector=LlmTurnCollector(req=req, llm_transport=self._llm_transport),
            progress_reader=self._progress_reader,
        )
        async for event in runner.run():
            yield event
