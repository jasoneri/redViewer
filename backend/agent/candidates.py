"""CGS search candidate pooling and preview projection ownership."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from agent.contract import CgsMcpPreferencePromptContext
from agent.result_codec import DEFAULT_RESULT_CODEC, JsonText
from agent.session import CgsWorkState


@dataclass(frozen=True)
class CandidateSearchResult:
    result: Any
    text: str
    payload: dict[str, Any] | None

    @classmethod
    def from_result(cls, result: Any) -> 'CandidateSearchResult':
        text = DEFAULT_RESULT_CODEC.text_from_result(result)
        parsed = JsonText(text).parse()
        return cls(
            result=result,
            text=text,
            payload=parsed if isinstance(parsed, dict) else None,
        )

    @property
    def search_payload(self) -> dict[str, Any] | None:
        if self.payload is None or not isinstance(self.payload.get('books'), list):
            return None
        return self.payload

    def episode_lookup(self) -> dict[str, str] | None:
        if self.payload is None:
            return None
        episodes = self.payload.get('episodes')
        if not isinstance(episodes, list):
            return None
        episode_lookup: dict[str, str] = {}
        for episode in episodes:
            if not isinstance(episode, dict):
                continue
            episode_key = str(episode.get('episode_key') or '').strip()
            name = str(episode.get('name') or '').strip()
            if episode_key and name:
                episode_lookup[episode_key] = name
        return episode_lookup or None


class CandidatePreferenceView:
    def __init__(self, preference_context: CgsMcpPreferencePromptContext | None) -> None:
        self._match_preferences = tuple(preference_context.match_preferences) if preference_context else ()
        self._exclude_preferences = tuple(preference_context.exclude_preferences) if preference_context else ()

    def match_texts(self) -> list[str]:
        return [item.text for item in self._match_preferences if item.text.strip()]

    def exclude_texts(self) -> list[str]:
        return [item.text for item in self._exclude_preferences if item.text.strip()]

    def match_items(self) -> list[dict[str, Any]]:
        return [
            item.model_dump(mode='json')
            for item in self._match_preferences
            if item.text.strip()
        ]

    def exclude_items(self) -> list[dict[str, Any]]:
        return [
            item.model_dump(mode='json')
            for item in self._exclude_preferences
            if item.text.strip()
        ]

    def decision_payload(
        self,
        *,
        books: list[dict[str, Any]],
        pool_count: int,
        decision: dict[str, Any] | None,
    ) -> dict[str, Any]:
        match_preferences = self.match_texts()
        exclude_preferences = self.exclude_texts()
        payload = {
            'match_preferences': match_preferences,
            'exclude_preferences': exclude_preferences,
            'match_preference_items': self.match_items(),
            'exclude_preference_items': self.exclude_items(),
            'summary': '无 active 偏好，展示累计候选池' if not match_preferences and not exclude_preferences else '',
            'matched_count': len(books),
            'excluded_count': max(pool_count - len(books), 0),
            'empty_reason': None if books else 'candidate_pool_empty',
        }
        if decision:
            payload.update(decision)
            payload['match_preferences'] = match_preferences
            payload['exclude_preferences'] = exclude_preferences
            payload['match_preference_items'] = self.match_items()
            payload['exclude_preference_items'] = self.exclude_items()
        return payload


class CandidatePool:
    def __init__(self, work_state: CgsWorkState) -> None:
        self._work_state = work_state

    def books_snapshot(self) -> list[dict[str, Any]]:
        return self._work_state.candidate_books_snapshot()

    def candidates_snapshot(self) -> list[dict[str, Any]]:
        return self._work_state.candidates_snapshot()

    def projected_books_snapshot(self) -> list[dict[str, Any]]:
        return self._work_state.projected_books_snapshot()

    def searched_pages_snapshot(self) -> list[int]:
        return self._work_state.searched_pages_snapshot()

    def raw_count(self) -> int:
        return self._work_state.raw_count()

    def episode_lookup_snapshot(self) -> dict[str, str]:
        return self._work_state.episode_lookup_snapshot()

    def has_books(self) -> bool:
        return self._work_state.has_candidate_books()

    def update_from_search(self, payload: dict[str, Any], arguments: dict[str, Any]) -> list[dict[str, Any]]:
        """Merge one raw search page into the candidate pool.

        Empty pages are observations only. They update searched page metadata but
        do not erase earlier candidates for the same search intent.
        """
        identity = self.search_identity(payload, arguments)
        self._work_state.begin_candidate_search(identity)

        page_raw = payload.get('page') if payload.get('page') is not None else arguments.get('page')
        try:
            page = int(page_raw)
        except (TypeError, ValueError):
            page = 1
        self._work_state.record_candidate_search_page(page)

        books = payload.get('books')
        if not isinstance(books, list):
            return self.books_snapshot()
        book_items = [item for item in books if isinstance(item, dict)]
        self._work_state.add_candidate_books(
            books=book_items,
            identity_keys=[self.book_identity(item) for item in book_items],
        )
        candidate_books = self.books_snapshot()
        self._work_state.replace_candidates(self.candidate_hints_from_books(candidate_books))
        return candidate_books

    def set_projected_candidates(
        self,
        *,
        books: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        projection_unavailable: bool,
    ) -> list[dict[str, Any]]:
        return self._work_state.set_projected_candidates(
            books=books,
            candidates=candidates,
            projection_unavailable=projection_unavailable,
        )

    def preview_payload(
        self,
        *,
        payload: dict[str, Any],
        arguments: dict[str, Any],
        books: list[dict[str, Any]],
        preference_context: CgsMcpPreferencePromptContext | None,
        decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        preference_view = CandidatePreferenceView(preference_context)
        page_raw = payload.get('page') if payload.get('page') is not None else arguments.get('page')
        try:
            page = int(page_raw)
        except (TypeError, ValueError):
            page = 1
        site = payload.get('site') if payload.get('site') is not None else arguments.get('site')
        keyword = payload.get('keyword') if payload.get('keyword') is not None else arguments.get('keyword')
        session_id = payload.get('session_id') or payload.get('sessionId') or arguments.get('session_id')
        return {
            'schema_version': 1,
            'session_id': str(session_id or ''),
            'page': page if page > 0 else 1,
            'site': site,
            'keyword': '' if keyword is None else str(keyword),
            'searched_pages': self.searched_pages_snapshot(),
            'raw_count': self.raw_count(),
            'pool_count': len(self.books_snapshot()),
            'books': books,
            'preference_decision': preference_view.decision_payload(
                books=books,
                pool_count=len(self.books_snapshot()),
                decision=decision,
            ),
        }

    def book_identity(self, book: dict[str, Any]) -> str:
        key = book.get('book_key') or book.get('key')
        if key:
            return str(key)
        fallback = {
            'source': book.get('source'),
            'site': book.get('site'),
            'idx': book.get('idx'),
            'name': book.get('name') or book.get('title'),
            'pages': book.get('pages'),
        }
        return 'fallback:' + json.dumps(fallback, ensure_ascii=False, sort_keys=True, default=str)

    def candidate_hint_from_book(self, book: dict[str, Any]) -> dict[str, Any] | None:
        key = book.get('book_key') or book.get('key')
        if not key:
            return None
        label = str(book.get('name') or book.get('title') or '')
        return {'key': str(key), 'label': label, 'value': str(key)}

    def candidate_hints_from_books(self, books: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [candidate for book in books if (candidate := self.candidate_hint_from_book(book)) is not None]

    def search_identity(self, payload: dict[str, Any], arguments: dict[str, Any]) -> str:
        identity = {
            'session_id': payload.get('session_id') or payload.get('sessionId'),
            'site': payload.get('site') if payload.get('site') is not None else arguments.get('site'),
            'keyword': payload.get('keyword') if payload.get('keyword') is not None else arguments.get('keyword'),
        }
        return json.dumps(identity, ensure_ascii=False, sort_keys=True, default=str)
