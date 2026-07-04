"""In-memory rv-agent session store, keyed by ``cgsSessionId`` (R3 / R0.5).

The backend closes the contract: the mobile client sends only a session id +
the new turn, and the backend owns LLM messages, reasoning, candidate list,
last selection, and provider fingerprint here. Single-process, bounded by
``_MAX_SESSIONS`` with oldest-first eviction. Process restart drops all
sessions, which is acceptable for the MVP (PRD: no DB/Redis persistence).
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from agent.contract import CgsMcpLlmRequest

_MAX_SESSIONS = 64


class CgsWorkState:
    def __init__(self) -> None:
        self._candidates: list[dict[str, Any]] = []
        self._candidate_search_identity = ''
        self._candidate_books: list[dict[str, Any]] = []
        self._candidate_book_ids: list[str] = []
        self._candidate_searched_pages: list[int] = []
        self._candidate_raw_count = 0
        self._candidate_projection_books: list[dict[str, Any]] = []
        self._selection: dict[str, Any] | None = None
        self._episode_lookup: dict[str, str] = {}

    def hydrate_request_hints(
        self,
        *,
        candidates: list[dict[str, Any]] | None = None,
        selection: dict[str, Any] | None = None,
    ) -> None:
        if candidates is not None:
            self._candidates = [dict(candidate) for candidate in candidates]
        if selection is not None:
            self._selection = dict(selection)

    def snapshot(self) -> dict[str, Any]:
        return {
            'candidates': [dict(candidate) for candidate in self._candidates],
            'candidate_search_identity': self._candidate_search_identity,
            'candidate_books': [dict(book) for book in self._candidate_books],
            'candidate_book_ids': list(self._candidate_book_ids),
            'candidate_searched_pages': list(self._candidate_searched_pages),
            'candidate_raw_count': self._candidate_raw_count,
            'candidate_projection_books': [dict(book) for book in self._candidate_projection_books],
            'selection': dict(self._selection) if self._selection is not None else None,
            'episode_lookup': dict(self._episode_lookup),
        }

    def restore(self, snapshot: dict[str, Any]) -> None:
        self._candidates = [dict(candidate) for candidate in snapshot['candidates']]
        self._candidate_search_identity = str(snapshot['candidate_search_identity'])
        self._candidate_books = [dict(book) for book in snapshot['candidate_books']]
        self._candidate_book_ids = list(snapshot['candidate_book_ids'])
        self._candidate_searched_pages = list(snapshot['candidate_searched_pages'])
        self._candidate_raw_count = int(snapshot['candidate_raw_count'])
        self._candidate_projection_books = [dict(book) for book in snapshot['candidate_projection_books']]
        selection = snapshot['selection']
        self._selection = dict(selection) if isinstance(selection, dict) else None
        self._episode_lookup = dict(snapshot['episode_lookup'])

    def clear(self) -> None:
        self._candidates = []
        self._candidate_search_identity = ''
        self._candidate_books = []
        self._candidate_book_ids = []
        self._candidate_searched_pages = []
        self._candidate_raw_count = 0
        self._candidate_projection_books = []
        self._selection = None
        self._episode_lookup = {}

    def begin_candidate_search(self, identity: str) -> None:
        if self._candidate_search_identity == identity:
            return
        self._candidate_search_identity = identity
        self._candidate_books = []
        self._candidate_book_ids = []
        self._candidate_searched_pages = []
        self._candidate_raw_count = 0
        self._candidate_projection_books = []

    def record_candidate_search_page(self, page: int) -> None:
        if page > 0 and page not in self._candidate_searched_pages:
            self._candidate_searched_pages.append(page)
            self._candidate_searched_pages.sort()

    def add_candidate_books(self, *, books: list[dict[str, Any]], identity_keys: list[str]) -> None:
        self._candidate_raw_count += len(books)
        known = set(self._candidate_book_ids)
        for identity_key, book in zip(identity_keys, books, strict=False):
            if identity_key in known:
                continue
            known.add(identity_key)
            self._candidate_book_ids.append(identity_key)
            self._candidate_books.append(dict(book))

    def replace_candidates(self, candidates: list[dict[str, Any]]) -> None:
        self._candidates = [dict(candidate) for candidate in candidates]

    def set_projected_candidates(
        self,
        *,
        books: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        projection_unavailable: bool = False,
    ) -> list[dict[str, Any]]:
        if not projection_unavailable:
            self._candidate_projection_books = [dict(book) for book in books]
        effective_books = self._candidate_projection_books if projection_unavailable else books
        self.replace_candidates(candidates)
        return [dict(book) for book in effective_books]

    def merge_episode_lookup(self, episode_lookup: dict[str, str] | None) -> None:
        if episode_lookup is not None:
            self._episode_lookup.update(episode_lookup)

    def candidate_books_snapshot(self) -> list[dict[str, Any]]:
        return [dict(book) for book in self._candidate_books]

    def candidates_snapshot(self) -> list[dict[str, Any]]:
        return [dict(candidate) for candidate in self._candidates]

    def projected_books_snapshot(self) -> list[dict[str, Any]]:
        return [dict(book) for book in self._candidate_projection_books]

    def searched_pages_snapshot(self) -> list[int]:
        return list(self._candidate_searched_pages)

    def raw_count(self) -> int:
        return self._candidate_raw_count

    def episode_lookup_snapshot(self) -> dict[str, str]:
        return dict(self._episode_lookup)

    def has_candidate_books(self) -> bool:
        return bool(self._candidate_books)

    def prompt_state(self) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        return self.candidates_snapshot(), dict(self._selection) if self._selection is not None else None

    def submit_display_context(self) -> tuple[list[dict[str, Any]], dict[str, str]]:
        return self.candidates_snapshot(), self.episode_lookup_snapshot()


class LlmHistory:
    def __init__(self) -> None:
        self._messages: list[dict[str, Any]] = []

    def replace(self, messages: list[dict[str, Any]]) -> None:
        self._messages = messages

    def buffer(self):
        from agent.prompt_context import PromptMessageBuffer

        return PromptMessageBuffer(self._messages)

    def snapshot(self) -> list[dict[str, Any]]:
        return [dict(message) for message in self._messages]


@dataclass(frozen=True)
class ProviderProfile:
    base_url: str
    model: str

    @classmethod
    def from_llm(cls, llm: CgsMcpLlmRequest) -> ProviderProfile:
        return cls(base_url=llm.base_url, model=llm.model)

    @property
    def fingerprint(self) -> str:
        return f'{self.normalized_base_url}|{self.model}'

    @property
    def normalized_base_url(self) -> str:
        return self.base_url.strip().rstrip('/')

    def matches(self, session: AgentSession) -> bool:
        return session.provider_fingerprint == self.fingerprint


class AgentSession:
    def __init__(self, *, session_id: str, provider_fingerprint: str) -> None:
        self._session_id = session_id
        self._provider_fingerprint = provider_fingerprint
        self._attached_book_fingerprint = ''
        self._history = LlmHistory()
        self._work_state = CgsWorkState()
        self._turns = 0

    @property
    def provider_fingerprint(self) -> str:
        return self._provider_fingerprint

    @property
    def attached_book_fingerprint(self) -> str:
        return self._attached_book_fingerprint

    def replace_messages(self, messages: list[dict[str, Any]]) -> None:
        self._history.replace(messages)

    def message_buffer(self):
        return self._history.buffer()

    def message_snapshot(self) -> list[dict[str, Any]]:
        return self._history.snapshot()

    def remember_attached_book_fingerprint(self, fingerprint: str) -> None:
        self._attached_book_fingerprint = fingerprint

    def increment_turns(self) -> None:
        self._turns += 1

    def hydrate_request_hints(
        self,
        *,
        candidates: list[dict[str, Any]] | None = None,
        selection: dict[str, Any] | None = None,
    ) -> None:
        self._work_state.hydrate_request_hints(candidates=candidates, selection=selection)

    def clear_work_state(self) -> None:
        self._work_state.clear()

    def work_state_snapshot(self) -> dict[str, Any]:
        return self._work_state.snapshot()

    def restore_work_state_snapshot(self, snapshot: dict[str, Any]) -> None:
        self._work_state.restore(snapshot)

    def candidate_pool(self):
        from agent.candidates import CandidatePool

        return CandidatePool(self._work_state)

    def prompt_state(self) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        return self._work_state.prompt_state()

    def submit_display_context(self) -> tuple[list[dict[str, Any]], dict[str, str]]:
        return self._work_state.submit_display_context()

    def merge_episode_lookup(self, episode_lookup: dict[str, str] | None) -> None:
        self._work_state.merge_episode_lookup(episode_lookup)


class AgentSessionStore:
    """Owns CGS agent session lifecycle and provider re-keying."""

    def __init__(self, max_sessions: int = _MAX_SESSIONS) -> None:
        self._max_sessions = max_sessions
        self._lock = threading.Lock()
        self._sessions: OrderedDict[str, AgentSession] = OrderedDict()

    def get(self, session_id: str | None) -> AgentSession | None:
        if not session_id:
            return None
        with self._lock:
            return self._sessions.get(session_id)

    def create(self, session_id: str, llm: CgsMcpLlmRequest) -> AgentSession:
        with self._lock:
            return self._create_unlocked(session_id, ProviderProfile.from_llm(llm))

    def resolve(self, session_id: str | None, llm: CgsMcpLlmRequest) -> tuple[AgentSession | None, bool, bool, bool]:
        """Return ``(session, is_ephemeral, is_new_history, is_new_cgs_lifecycle)``."""
        if session_id is None:
            return None, True, True, True
        profile = ProviderProfile.from_llm(llm)
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None and not profile.matches(session):
                snapshot = session.work_state_snapshot()
                session = self._create_unlocked(session_id, profile)
                session.restore_work_state_snapshot(snapshot)
                return session, False, True, False
            if session is None:
                session = self._create_unlocked(session_id, profile)
                return session, False, True, True
            return session, False, False, False

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()

    def _create_unlocked(self, session_id: str, profile: ProviderProfile) -> AgentSession:
        session = AgentSession(session_id=session_id, provider_fingerprint=profile.fingerprint)
        if session_id in self._sessions:
            self._sessions.move_to_end(session_id)
        self._sessions[session_id] = session
        while len(self._sessions) > self._max_sessions:
            self._sessions.popitem(last=False)
        return session


agent_session_store = AgentSessionStore()
