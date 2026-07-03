"""Final summary parsing, enrichment, and SSE payload shaping."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from agent.contract import CgsMcpFinalSummary
from agent.progress_snapshot import CgsProgressSnapshot
from agent.result_badges import ResultBadgeCollector
from agent.result_codec import DEFAULT_RESULT_CODEC, JsonText


class JsonSummaryCandidates:
    def __init__(self) -> None:
        self._candidates: list[Any] = []
        self._seen: set[str] = set()

    def add_json_text(self, candidate_text: str) -> None:
        parsed = JsonText(candidate_text).parse()
        if parsed is not None:
            self.add_parsed(parsed)

    def add_parsed(self, parsed: Any) -> None:
        try:
            key = json.dumps(parsed, sort_keys=True, ensure_ascii=False, default=DEFAULT_RESULT_CODEC.json_default)
        except TypeError:
            key = repr(parsed)
        if key in self._seen:
            return
        self._seen.add(key)
        self._candidates.append(parsed)

    def values(self) -> list[Any]:
        return list(self._candidates)


@dataclass(frozen=True)
class JsonSummaryText:
    raw_text: str

    def candidates(self) -> list[Any]:
        text = self.raw_text.strip()
        if not text:
            return []
        candidate_set = JsonSummaryCandidates()
        for candidate_text in (
            text,
            self.without_code_fence(),
            self.after_thinking_marker(),
        ):
            candidate_set.add_json_text(candidate_text)

        decoder = json.JSONDecoder()
        for index, char in enumerate(text):
            if char != '{':
                continue
            try:
                parsed, _ = decoder.raw_decode(text[index:])
            except ValueError:
                continue
            if isinstance(parsed, dict):
                candidate_set.add_parsed(parsed)
        return candidate_set.values()

    def without_code_fence(self) -> str:
        text = self.raw_text.strip()
        if not text.startswith('```'):
            return text
        lines = text.splitlines()
        if not lines:
            return text
        lines = lines[1:]
        if lines and lines[-1].strip().startswith('```'):
            lines = lines[:-1]
        return '\n'.join(lines).strip()

    def after_thinking_marker(self) -> str:
        value = self.raw_text
        marker = '</think>'
        index = value.rfind(marker)
        if index < 0:
            return value.strip()
        return value[index + len(marker):].strip()


@dataclass(frozen=True)
class CgsFinalSummaryText:
    raw_text: str

    def parse(self) -> CgsMcpFinalSummary | None:
        for parsed in JsonSummaryText(self.raw_text).candidates():
            if not isinstance(parsed, dict):
                continue
            try:
                return CgsMcpFinalSummary.model_validate(parsed)
            except Exception:
                continue
        return None


@dataclass(frozen=True)
class CgsFinalFallbackView:
    progress_snapshot: CgsProgressSnapshot
    submit_summary: dict[str, Any] | None
    llm_summary: str
    success: bool

    def title_status(self) -> tuple[str, str]:
        status = self.progress_snapshot.status_key()
        if not self.success or status == 'failed':
            return '执行失败', 'failed'
        if status == 'completed':
            return '下载完成', 'completed'
        if not self.submit_summary_indicates_submit():
            return '需要确认', 'partial'
        return '已提交下载', 'partial'

    def submit_summary_indicates_submit(self) -> bool:
        if not isinstance(self.submit_summary, dict) or not self.submit_summary:
            return False
        for key in ('submitted', 'success'):
            if self.submit_summary.get(key) is False:
                return False
        if str(self.submit_summary.get('tool') or '') == 'cgs_submit_books':
            return True
        return any(self.submit_summary.get(key) is True for key in ('submitted', 'success'))

    def status_text(self) -> str:
        payload = self.progress_snapshot.status_payload
        if not isinstance(payload, dict):
            return ''
        job = payload.get('job') if isinstance(payload.get('job'), dict) else {}
        for value in (
            job.get('stage'),
            job.get('message'),
            payload.get('message'),
            payload.get('status'),
        ):
            text = str(value or '').strip()
            if text:
                return DEFAULT_RESULT_CODEC.truncate_line(text, 120)
        return ''

    def events_text(self) -> str:
        for row in reversed(self.progress_snapshot.event_rows()):
            for key in ('message', 'detail', 'stage', 'name', 'error'):
                text = str(row.get(key) or '').strip()
                if text:
                    return DEFAULT_RESULT_CODEC.truncate_line(text, 120)
        return ''

    def status_rows(self) -> list[dict[str, str]]:
        payload = self.progress_snapshot.status_payload
        rows: list[dict[str, str]] = []
        if not isinstance(payload, dict):
            return rows
        status = self.progress_snapshot.status_key()
        percent = self.progress_snapshot.status_percent()
        if status:
            tone = 'error' if status == 'failed' else 'ok' if status == 'completed' else 'default'
            rows.append({'label': '状态', 'value': DEFAULT_RESULT_CODEC.truncate_line(status, 24), 'tone': tone})
        if percent is not None:
            rows.append({'label': '进度', 'value': f'{percent:g}%', 'tone': 'ok' if percent >= 100 else 'default'})
        events = self.progress_snapshot.event_rows()
        if events:
            rows.append({'label': '事件', 'value': str(len(events)), 'tone': 'default'})
        job = payload.get('job') if isinstance(payload.get('job'), dict) else {}
        stage = str(job.get('stage') or '').strip()
        if stage:
            rows.append({'label': '阶段', 'value': DEFAULT_RESULT_CODEC.truncate_line(stage, 40), 'tone': 'default'})
        return rows[:4]

    def badges(self) -> list[dict[str, str]]:
        collector = ResultBadgeCollector()
        for source in (
            self.submit_summary if isinstance(self.submit_summary, dict) else None,
            self.progress_snapshot.status_payload,
        ):
            collector.add_payload(source)
        for row in self.progress_snapshot.event_rows():
            collector.add_payload(row)
        return collector.rows()


class CgsFinalSummaryFallbackBuilder:
    def __init__(
        self,
        *,
        status_result: Any | None,
        events_result: Any | None,
        submit_summary: dict[str, Any] | None = None,
        llm_summary: str = '',
        success: bool = True,
    ) -> None:
        self._submit_summary = submit_summary
        self._llm_summary = llm_summary
        self._success = success
        self._progress_snapshot = CgsProgressSnapshot(status_result, events_result)

    def build(self) -> CgsMcpFinalSummary:
        view = CgsFinalFallbackView(
            progress_snapshot=self._progress_snapshot,
            submit_summary=self._submit_summary,
            llm_summary=self._llm_summary,
            success=self._success,
        )
        title, status = view.title_status()
        status_text = view.status_text()
        events_text = view.events_text()
        headline = DEFAULT_RESULT_CODEC.truncate_line(
            self._llm_summary or status_text or events_text or title,
            80,
        )
        summary = DEFAULT_RESULT_CODEC.truncate_line(
            status_text or events_text or self._llm_summary or title,
            220,
        )
        warnings: list[str] = []
        if status == 'failed' and summary and summary != title:
            warnings.append(summary)
        blocks: list[dict[str, Any]] = []
        if headline and headline != summary:
            blocks.append({'type': 'text', 'text': headline})
        rows = view.status_rows()
        if rows:
            blocks.append({'type': 'rows', 'rows': rows})
        badges = view.badges()
        if badges:
            blocks.append({'type': 'badges', 'badges': badges[:8]})
        return CgsMcpFinalSummary.model_validate(
            {
                'schema_version': 1,
                'status': status,
                'title': title,
                'headline': headline or title,
                'summary': summary or title,
                'blocks': blocks,
                'finished_badges': badges[:8],
                'warnings': warnings[:3],
            }
        )


@dataclass(frozen=True)
class CgsFinalSummaryEnricher:
    parsed: CgsMcpFinalSummary | None
    fallback: CgsMcpFinalSummary

    def enrich(self) -> CgsMcpFinalSummary:
        if self.parsed is None:
            return self.fallback
        blocks: list[dict[str, Any]] = [block.model_dump() for block in self.parsed.blocks]
        if not blocks:
            blocks = [block.model_dump() for block in self.fallback.blocks]
        finished_badges = self.parsed.finished_badges or self.fallback.finished_badges
        warnings = self.parsed.warnings or self.fallback.warnings
        headline = DEFAULT_RESULT_CODEC.truncate_line(self.parsed.headline or self.fallback.headline, 80)
        summary = DEFAULT_RESULT_CODEC.truncate_line(self.parsed.summary or self.fallback.summary, 220)
        title = DEFAULT_RESULT_CODEC.truncate_line(self.parsed.title or self.fallback.title, 24)
        return CgsMcpFinalSummary.model_validate(
            {
                'schema_version': 1,
                'status': self.fallback.status if self.parsed.status == 'completed' and self.fallback.status == 'failed' else self.parsed.status,
                'title': title or self.fallback.title,
                'headline': headline or self.fallback.headline,
                'summary': summary or self.fallback.summary,
                'blocks': blocks,
                'finished_badges': [
                    badge.model_dump() if hasattr(badge, 'model_dump') else badge
                    for badge in finished_badges
                ][:8],
                'warnings': [DEFAULT_RESULT_CODEC.truncate_line(str(item), 120) for item in warnings[:3]],
            }
        )


@dataclass(frozen=True)
class FinalEventPayload:
    success: bool
    summary: str
    final_summary: dict[str, Any]
    monitor_result: dict[str, Any] | None = None

    def payload(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            'success': self.success,
            'summary': DEFAULT_RESULT_CODEC.truncate(self.summary),
            'final_summary': self.final_summary,
            'schema_version': 1,
        }
        if self.monitor_result is not None:
            result['monitor_result'] = self.monitor_result
        return result


class FinalSummaryBuilder:
    def __init__(
        self,
        *,
        status_result: Any | None = None,
        events_result: Any | None = None,
        submit_summary: dict[str, Any] | None = None,
        submit_accepted: bool = False,
        monitor_result: dict[str, Any] | None = None,
    ) -> None:
        self._status_result = status_result
        self._events_result = events_result
        self._submit_summary = submit_summary
        self._submit_accepted = submit_accepted
        self._monitor_result = monitor_result

    def from_text(
        self,
        raw_text: str,
        *,
        fallback_success: bool = True,
        require_fallback_success: bool = False,
        prefer_raw_unparsed_summary: bool = False,
        summary_default: str = '完成',
    ) -> dict[str, Any]:
        parsed_final = CgsFinalSummaryText(raw_text).parse()
        fallback_final = CgsFinalSummaryFallbackBuilder(
            status_result=self._status_result,
            events_result=self._events_result,
            submit_summary=self._submit_summary if self._submit_accepted else None,
            llm_summary='' if parsed_final is not None else raw_text,
            success=fallback_success,
        ).build()
        enriched_final = CgsFinalSummaryEnricher(parsed_final, fallback_final).enrich()
        final_success = enriched_final.status != 'failed'
        if require_fallback_success:
            final_success = fallback_success and final_success
        display_summary = (
            raw_text
            if prefer_raw_unparsed_summary and parsed_final is None and raw_text
            else enriched_final.summary
        )
        return FinalEventPayload(
            success=final_success,
            summary=display_summary or fallback_final.summary or summary_default,
            final_summary=enriched_final.model_dump(mode='json'),
            monitor_result=self._monitor_result,
        ).payload()

    def failure(self, message: str, *, summary_default: str = '最终总结失败') -> dict[str, Any]:
        fallback_final = CgsFinalSummaryFallbackBuilder(
            status_result=self._status_result,
            events_result=self._events_result,
            submit_summary=self._submit_summary if self._submit_accepted else None,
            llm_summary=message,
            success=False,
        ).build()
        return FinalEventPayload(
            success=False,
            summary=message or fallback_final.summary or summary_default,
            final_summary=fallback_final.model_dump(mode='json'),
            monitor_result=self._monitor_result,
        ).payload()
