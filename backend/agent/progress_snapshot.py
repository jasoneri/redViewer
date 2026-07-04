"""CGS status/events snapshot reader and progress payload owner."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from agent.result_badges import ResultBadgeCollector
from agent.result_codec import DEFAULT_RESULT_CODEC, JsonText

CgsProgressReader = Callable[[], Awaitable[tuple[Any, Any]]]


class CgsProgressItem:
    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    def coerce_int(self, value: Any) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def coerce_percent(self, value: Any) -> int:
        try:
            return max(0, min(100, int(round(float(value)))))
        except (TypeError, ValueError):
            return 0

    def normalize_label(self) -> None:
        collector = ResultBadgeCollector()
        episode_title = collector.sanitize_text(self._data.get('episode_title') or self._data.get('episode_name'))
        book_title = collector.sanitize_text(self._data.get('book_title') or self._data.get('title'))
        task_title = collector.sanitize_text(self._data.get('task_title'))
        if episode_title:
            self._data['kind'] = 'ep'
            self._data['label'] = episode_title
        else:
            self._data['kind'] = 'book'
            self._data['label'] = book_title or task_title or collector.sanitize_text(self._data.get('task_id'))

    def is_finished(self) -> bool:
        status = str(self._data.get('status') or '').strip().lower()
        if status in {'completed', 'complete', 'finished', 'done', 'success', 'succeeded'}:
            return True
        downloaded = self.coerce_int(self._data.get('downloaded'))
        total = self.coerce_int(self._data.get('total_pages') or self._data.get('tasks_count'))
        return bool(total and downloaded is not None and downloaded >= total)

    def is_failed(self) -> bool:
        return str(self._data.get('status') or '').strip().lower() in {'failed', 'failure', 'error'}

    def badge(self, *, state: str | None = None) -> dict[str, Any] | None:
        collector = ResultBadgeCollector()
        if self._data.get('scope') == 'job':
            return None
        kind = str(self._data.get('kind') or '').strip().lower()
        badge_type = (
            'ep'
            if kind in {'ep', 'episode'} or self._data.get('episode_title') or self._data.get('episode_name')
            else 'book'
        )
        label = (
            self._data.get('label')
            or (self._data.get('episode_title') or self._data.get('episode_name') if badge_type == 'ep' else None)
            or self._data.get('book_title')
            or self._data.get('task_title')
            or self._data.get('title')
        )
        text = collector.sanitize_text(label)
        if not text:
            return None
        badge: dict[str, Any] = {'type': badge_type, 'text': text}
        for source_key, target_key in (
            ('unit_id', 'id'),
            ('task_id', 'id'),
            ('book_key', 'book_key'),
            ('episode_key', 'episode_key'),
        ):
            value = collector.sanitize_text(self._data.get(source_key))
            if value and target_key not in badge:
                badge[target_key] = value
        if state:
            badge['state'] = state
        return badge


@dataclass(frozen=True)
class CgsProgressResultPayload:
    result: Any

    def payload(self) -> dict[str, Any] | None:
        parsed = JsonText(DEFAULT_RESULT_CODEC.text_from_result(self.result)).parse()
        return parsed if isinstance(parsed, dict) else self.result if isinstance(self.result, dict) else None


@dataclass(frozen=True)
class CgsStatusProgressItems:
    payload: dict[str, Any] | None

    def items(self) -> list[CgsProgressItem]:
        if not isinstance(self.payload, dict):
            return []
        job = self.payload.get('job') if isinstance(self.payload.get('job'), dict) else {}
        for rows in (job.get('progress_items'), self.payload.get('progress_items')):
            if isinstance(rows, list):
                return [CgsProgressItem(dict(row)) for row in rows if isinstance(row, dict)]
        return []


@dataclass(frozen=True)
class CgsEventProgressItems:
    event_rows: list[dict[str, Any]]
    terminal_status: str

    def items(self) -> list[CgsProgressItem]:
        items: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        downloaded_keys: dict[str, set[tuple[Any, ...]]] = {}
        for row in self.event_rows:
            if row.get('type') != 'task':
                continue
            task_id = str(row.get('task_id') or row.get('task_title') or row.get('url') or len(order) + 1)
            if task_id not in items:
                items[task_id] = {'task_id': task_id, 'unit_id': task_id, 'status': 'queued', 'latest_message': '-'}
                downloaded_keys[task_id] = set()
                order.append(task_id)
            item = items[task_id]
            item.update({key: value for key, value in row.items() if value not in (None, '') and not str(key).startswith('_')})
            if row.get('is_new'):
                item['status'] = 'running'
                item['latest_message'] = 'task registered'
            page_key = row.get('page') or row.get('url')
            if page_key:
                if row.get('success', True) is not False:
                    downloaded_keys[task_id].add(('raw', row.get('page'), row.get('url')))
                    progress_item = CgsProgressItem(item)
                    item['downloaded'] = max(progress_item.coerce_int(item.get('downloaded')) or 0, len(downloaded_keys[task_id]))
                    item['status'] = 'running'
                    item['latest_message'] = f"saved page {row.get('page') or len(downloaded_keys[task_id])}"
                else:
                    item['status'] = 'failed'
                    item['latest_message'] = f"failed page {row.get('page') or '-'}"
                if not item.get('source_url'):
                    item['source_url'] = row.get('url')

        result: list[CgsProgressItem] = []
        for task_id in order:
            item = dict(items[task_id])
            progress_item = CgsProgressItem(item)
            total = progress_item.coerce_int(item.get('total_pages') or item.get('tasks_count')) or 0
            downloaded = progress_item.coerce_int(item.get('downloaded')) or len(downloaded_keys.get(task_id) or ())
            item['total_pages'] = total
            item['downloaded'] = downloaded
            item['percent'] = 100 if total and downloaded >= total else progress_item.coerce_percent(downloaded / total * 100) if total else 0
            if total and downloaded >= total and item.get('status') != 'failed':
                item['status'] = 'completed'
            if self.terminal_status == 'completed' and item.get('status') != 'failed':
                item['status'] = 'completed'
                item['downloaded'] = total or downloaded
                item['percent'] = 100
            progress_item = CgsProgressItem(item)
            progress_item.normalize_label()
            result.append(progress_item)
        return result


class CgsProgressSnapshot:
    def __init__(
        self,
        status_result: Any,
        events_result: Any,
        submit_summary: dict[str, Any] | None = None,
    ) -> None:
        self._status_result = status_result
        self._events_result = events_result
        self._submit_summary = submit_summary

    def status_result(self) -> Any:
        return self._status_result

    def events_result(self) -> Any:
        return self._events_result

    @property
    def status_payload(self) -> dict[str, Any] | None:
        return CgsProgressResultPayload(self._status_result).payload()

    @property
    def events_payload(self) -> dict[str, Any] | None:
        return CgsProgressResultPayload(self._events_result).payload()

    def event_rows(self) -> list[dict[str, Any]]:
        payload = self.events_payload
        if not isinstance(payload, dict):
            return []
        rows = payload.get('events') or payload.get('logs') or []
        return [row for row in rows if isinstance(row, dict)]

    def status_key(self) -> str:
        payload = self.status_payload
        if not isinstance(payload, dict):
            return ''
        job = payload.get('job') if isinstance(payload.get('job'), dict) else {}
        return str(job.get('status') or payload.get('status') or '').strip().lower()

    def status_percent(self) -> float | None:
        payload = self.status_payload
        if not isinstance(payload, dict):
            return None
        job = payload.get('job') if isinstance(payload.get('job'), dict) else {}
        progress = job.get('progress') if isinstance(job.get('progress'), dict) else payload.get('progress')
        if not isinstance(progress, dict):
            return None
        percent = progress.get('percent')
        if isinstance(percent, (int, float)):
            return round(float(percent), 2)
        return None

    def progress_payload(self) -> dict[str, Any]:
        status_text = DEFAULT_RESULT_CODEC.text_from_result(self._status_result)
        events_text = DEFAULT_RESULT_CODEC.text_from_result(self._events_result)
        payload: dict[str, Any] = {
            'status_summary': DEFAULT_RESULT_CODEC.truncate(status_text),
            'events_summary': DEFAULT_RESULT_CODEC.truncate(events_text),
        }
        status = self.status_payload
        if isinstance(status, dict):
            job = status.get('job')
            progress = job.get('progress') if isinstance(job, dict) else status.get('progress')
            percent = progress.get('percent') if isinstance(progress, dict) else None
            if isinstance(percent, (int, float)):
                payload['percent'] = round(float(percent), 2)
            state = job.get('status') if isinstance(job, dict) else status.get('status')
            if isinstance(state, str):
                payload['status'] = state
        events = self.events_payload
        if isinstance(events, dict):
            rows = events.get('events') or events.get('logs')
            if isinstance(rows, list):
                payload['event_count'] = len(rows)
        return payload

    def to_progress(self) -> dict[str, Any]:
        progress = self.progress_payload()
        finished_badges = self.finished_badges()
        badges = self.badges(finished_badges=finished_badges)
        if badges:
            progress['badges'] = badges
        if finished_badges:
            progress['finished_badges'] = finished_badges
        elif badges and self.status_key() == 'completed':
            progress['finished_badges'] = badges
        return progress

    def progress_items(self) -> list[CgsProgressItem]:
        return CgsStatusProgressItems(self.status_payload).items() or CgsEventProgressItems(
            self.event_rows(),
            self.status_key(),
        ).items()

    def finished_badges(self) -> list[dict[str, str]]:
        collector = ResultBadgeCollector()
        for item in self.progress_items():
            if item.is_failed() or not item.is_finished():
                continue
            badge = item.badge(state='finished')
            if badge is not None:
                collector.add_progress(badge)
        return collector.rows(limit=8)

    def badges(self, *, finished_badges: list[dict[str, str]] | None = None) -> list[dict[str, str]]:
        collector = ResultBadgeCollector()
        items = self.progress_items()
        finished_text_keys = {
            text_key
            for badge in (finished_badges or [])
            if (text_key := collector.text_key(badge)) is not None
        }
        if items:
            progress_badge_count = collector.count()
            for item in items:
                if item.is_failed() or item.is_finished():
                    continue
                badge = item.badge(state='running')
                if badge is not None:
                    collector.add_progress(badge)
            if collector.count() > progress_badge_count or finished_badges:
                return collector.rows(limit=8)
        for source in (
            self._submit_summary if isinstance(self._submit_summary, dict) else None,
            self.status_payload,
        ):
            for badge in collector.payload_badges(source):
                text_key = collector.text_key(badge)
                if text_key not in finished_text_keys:
                    collector.add(badge['type'], badge['text'])
        for row in self.event_rows():
            for badge in collector.payload_badges(row):
                text_key = collector.text_key(badge)
                if text_key not in finished_text_keys:
                    collector.add(badge['type'], badge['text'])
        return collector.rows(limit=8)


class CgsProgressSnapshotBuilder:
    def __init__(
        self,
        *,
        client: Any,
        tool_names: set[str],
        submit_summary: dict[str, Any] | None = None,
        progress_reader: CgsProgressReader | None = None,
    ) -> None:
        self._client = client
        self._tool_names = tool_names
        self._submit_summary = submit_summary
        self._progress_reader = progress_reader

    async def read(self) -> CgsProgressSnapshot | None:
        if self._progress_reader is not None:
            status, events = await self._progress_reader()
        else:
            if not {'cgs_get_status', 'cgs_get_events'}.issubset(self._tool_names):
                return None
            status = await self._client.call_tool('cgs_get_status', {})
            events = await self._client.call_tool('cgs_get_events', {})
        return CgsProgressSnapshot(status, events, self._submit_summary)
