"""Candidate-pool and preview-projection boundary for CGS agent turns."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from agent.candidates import (
    CandidatePool,
    CandidateSearchResult,
)
from agent.contract import CgsMcpChatRequest
from agent.llm_turn import LlmTurnCollector
from agent.prompt_templates import prompt_system_message
from agent.result_codec import JsonText
from agent.session import AgentSession


class CandidateProjectionResult:
    def __init__(
        self,
        *,
        event: tuple[str, dict[str, Any]] | None,
        state_message: dict[str, Any],
    ) -> None:
        self._event = event
        self._state_message = state_message

    def add_event_to(self, outcome: Any) -> None:
        if self._event is not None:
            outcome.add_event(self._event)

    def append_state_message_to(self, buffer: Any) -> None:
        buffer.append_context(self._state_message)


@dataclass(frozen=True)
class CandidateProjectionText:
    raw_text: str

    def parsed(self) -> dict[str, Any] | None:
        parsed = JsonText(self.without_code_fence()).parse()
        if not isinstance(parsed, dict):
            return None
        raw_keys = parsed.get('book_keys')
        if not isinstance(raw_keys, list):
            return None
        keys = [str(key).strip() for key in raw_keys if str(key or '').strip()]
        return {
            'book_keys': keys,
            'summary': str(parsed.get('summary') or '').strip(),
            'empty_reason': str(parsed.get('empty_reason') or '').strip() or None,
        }

    def without_code_fence(self) -> str:
        text = self.raw_text.strip()
        if not text.startswith('```'):
            return text
        stripped = text.strip('`')
        if stripped.lower().startswith('json'):
            stripped = stripped[4:].strip()
        return stripped


class CandidateProjectionView:
    def __init__(
        self,
        *,
        pool_count: int,
        books: list[dict[str, Any]],
        decision: dict[str, Any] | None,
    ) -> None:
        self._pool_count = pool_count
        self._books = tuple(dict(book) for book in books)
        self._decision = dict(decision) if isinstance(decision, dict) else None

    def state_message(self) -> dict[str, Any]:
        projected = [
            {
                'book_key': book.get('book_key') or book.get('key'),
                'name': book.get('name') or book.get('title'),
            }
            for book in self._books
        ]
        payload = {
            'schema_version': 1,
            'pool_count': self._pool_count,
            'projected_count': len(projected),
            'projected_candidates': projected,
            'preference_decision': self._decision or {},
        }
        return prompt_system_message(
            'candidate_projection_state.md',
            projection_json=json.dumps(payload, ensure_ascii=False, default=str),
        )


class CandidateContext:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        session: AgentSession | None,
        llm_turn_collector: LlmTurnCollector,
    ) -> None:
        self._prompt = req.prompt
        self._preview_mode = req.preview_mode
        self._preference_context = req.preference_context
        self._match_preferences = tuple(req.preference_context.match_preferences) if req.preference_context else ()
        self._exclude_preferences = tuple(req.preference_context.exclude_preferences) if req.preference_context else ()
        self._session = session
        self._llm_turn_collector = llm_turn_collector
        self._pool = session.candidate_pool() if session is not None else None
        self._last_search_result: CandidateSearchResult | None = None
        self._last_search_payload: dict[str, Any] | None = None
        self._last_episode_lookup: dict[str, str] | None = None

    def is_preview_mode(self) -> bool:
        return self._preview_mode

    def has_active_preferences(self) -> bool:
        return bool(self._match_preferences or self._exclude_preferences)

    def record_search_result(self, result: Any, arguments: dict[str, Any]) -> dict[str, Any] | None:
        self._last_search_result = CandidateSearchResult.from_result(result)
        self._last_search_payload = self._last_search_result.search_payload
        if self._pool is not None and self._last_search_payload is not None:
            self._pool.update_from_search(self._last_search_payload, arguments)
        return self._last_search_payload

    def record_episode_lookup(self, result: Any) -> dict[str, str] | None:
        self._last_episode_lookup = CandidateSearchResult.from_result(result).episode_lookup()
        if self._session is not None:
            self._session.merge_episode_lookup(self._last_episode_lookup)
        return self._last_episode_lookup

    def has_candidate_books(self) -> bool:
        pool = self._pool
        return bool(pool and pool.has_books())

    def submit_display_context(self) -> tuple[list[dict[str, Any]] | None, dict[str, str] | None]:
        pool = self._pool
        if pool is None:
            return None, None
        if self._session is not None:
            return self._session.submit_display_context()
        return pool.candidates_snapshot(), pool.episode_lookup_snapshot()

    async def project_after_search(
        self,
        arguments: dict[str, Any],
    ) -> CandidateProjectionResult | None:
        pool = self._pool
        payload = self._last_search_payload
        if pool is None or payload is None:
            return None
        emit_preview = self.is_preview_mode()
        if not emit_preview and not self.has_active_preferences():
            return None

        books, decision = await self.preview_books_for_pool()
        projection_unavailable = (
            isinstance(decision, dict)
            and decision.get('empty_reason') == 'preference_projection_unavailable'
        )
        effective_books = pool.set_projected_candidates(
            books=books,
            candidates=pool.candidate_hints_from_books(
                pool.projected_books_snapshot() if projection_unavailable else books
            ),
            projection_unavailable=projection_unavailable,
        )
        state_message = CandidateProjectionView(
            pool_count=len(pool.books_snapshot()),
            books=effective_books,
            decision=decision,
        ).state_message()
        event = None
        if emit_preview:
            event = (
                'cgs_preview_candidates',
                pool.preview_payload(
                    payload=payload,
                    arguments=arguments,
                    books=effective_books,
                    preference_context=self._preference_context,
                    decision=decision,
                ),
            )
        return CandidateProjectionResult(event=event, state_message=state_message)

    async def preview_books_for_pool(self) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        pool = self._pool
        if pool is None:
            return [], {'summary': '候选池为空，无法按偏好生成预览', 'empty_reason': 'candidate_pool_empty'}
        books = pool.books_snapshot()
        if not self._match_preferences and not self._exclude_preferences:
            return books, None
        if not books:
            return [], {'summary': '候选池为空，无法按偏好生成预览', 'empty_reason': 'candidate_pool_empty'}

        compact_pool = [
            {
                'book_key': book.get('book_key') or book.get('key'),
                'name': book.get('name') or book.get('title'),
                'source': book.get('source'),
                'pages': book.get('pages'),
                'tags': book.get('tags'),
                'idx': book.get('idx'),
            }
            for book in books
            if isinstance(book, dict)
        ]
        projection_input = {
            'schema_version': 1,
            'user_prompt': self._prompt,
            'candidate_pool': compact_pool,
            'preference_context': self._preference_context.model_dump(mode='json') if self._preference_context else None,
        }
        messages = [
            prompt_system_message('candidate_projection.md'),
            {'role': 'user', 'content': json.dumps(projection_input, ensure_ascii=False, default=str)},
        ]
        llm_turn = await self._llm_turn_collector.collect(
            messages,
            [],
        )
        parsed = CandidateProjectionText(llm_turn.response_text()).parsed()
        if parsed is None:
            return [], {
                'summary': '偏好投影未返回可用结构化结果，未展示 raw 候选',
                'empty_reason': 'preference_projection_unavailable',
            }
        allowed = set(parsed['book_keys'])
        books = [
            book for book in books
            if str(book.get('book_key') or book.get('key') or '').strip() in allowed
        ]
        empty_reason = parsed['empty_reason']
        if not books and empty_reason is None:
            empty_reason = 'all_candidates_excluded'
        return books, {
            'summary': parsed['summary'],
            'matched_count': len(books),
            'excluded_count': max(len(compact_pool) - len(books), 0),
            'empty_reason': empty_reason,
        }
