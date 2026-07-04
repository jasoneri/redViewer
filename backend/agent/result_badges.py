"""Badge collection owned by CGS result objects."""

from __future__ import annotations

from typing import Any

from agent.result_codec import DEFAULT_RESULT_CODEC


class ResultBadgeCollector:
    def __init__(self) -> None:
        self._badges: list[dict[str, str]] = []
        self._seen: set[tuple[str, str]] = set()

    def rows(self, *, limit: int | None = None) -> list[dict[str, str]]:
        return self._badges[:limit] if limit is not None else list(self._badges)

    def count(self) -> int:
        return len(self._badges)

    def sanitize_text(self, value: Any) -> str:
        text = str(value or '').replace('\r', ' ').replace('\n', ' ').strip()
        return DEFAULT_RESULT_CODEC.truncate_line(text, 120)

    def text_key(self, badge: dict[str, Any]) -> tuple[str, str] | None:
        text = self.sanitize_text(badge.get('text'))
        if not text:
            return None
        return ('ep' if badge.get('type') == 'ep' else 'book', text)

    def book_title_from_candidates(self, book_key: Any, candidates: list[dict[str, Any]] | None) -> str:
        key = str(book_key or '').strip()
        if not key or not isinstance(candidates, list):
            return ''
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            candidate_key = str(candidate.get('key') or candidate.get('value') or '').strip()
            if candidate_key == key:
                return self.sanitize_text(candidate.get('label') or candidate.get('title') or candidate.get('name'))
        return ''

    def add(self, badge_type: str, value: Any) -> None:
        text = self.sanitize_text(value)
        if not text:
            return
        normalized_type = 'ep' if badge_type == 'ep' else 'book'
        key = (normalized_type, text)
        if key in self._seen:
            return
        self._seen.add(key)
        self._badges.append({'type': normalized_type, 'text': text})

    def add_progress(self, badge: dict[str, Any]) -> None:
        badge_type = 'ep' if badge.get('type') == 'ep' else 'book'
        text = self.sanitize_text(badge.get('text') or badge.get('label') or badge.get('title') or badge.get('name'))
        if not text:
            return
        key = (badge_type, text)
        if key in self._seen:
            return
        self._seen.add(key)
        row = {'type': badge_type, 'text': text}
        for source_key, target_key in (
            ('id', 'id'),
            ('key', 'id'),
            ('unit_id', 'id'),
            ('task_id', 'id'),
            ('book_key', 'book_key'),
            ('bookKey', 'book_key'),
            ('episode_key', 'episode_key'),
            ('episodeKey', 'episode_key'),
            ('state', 'state'),
        ):
            value = self.sanitize_text(badge.get(source_key))
            if value and target_key not in row:
                row[target_key] = value
        self._badges.append(row)

    def add_episode_selections(self, rows: Any) -> None:
        if not isinstance(rows, list):
            return
        for row in rows:
            if not isinstance(row, dict):
                continue
            self.add('book', row.get('book_title') or row.get('book') or row.get('title'))
            for episode in row.get('episode_titles') or []:
                self.add('ep', episode)
            for episode in row.get('episode_names') or []:
                self.add('ep', episode)

    def payload_badges(self, data: Any) -> list[dict[str, str]]:
        collector = ResultBadgeCollector()
        collector.add_payload(data)
        return collector.rows()

    def add_payload(self, data: Any) -> None:
        if not isinstance(data, dict):
            return
        for raw_badge in data.get('badges') or []:
            if isinstance(raw_badge, dict):
                self.add(raw_badge.get('type') or 'book', raw_badge.get('text') or raw_badge.get('label'))
        for key in ('book_title', 'book', 'title'):
            self.add('book', data.get(key))
        for key in ('episode_title', 'episode', 'ep', 'name'):
            self.add('ep', data.get(key))
        self.add_episode_selections(data.get('episode_selections'))
