"""Session lifecycle and request-state reconciliation for CGS agent turns."""

from __future__ import annotations

from dataclasses import dataclass

from agent.contract import CgsMcpChatRequest
from agent.reset_policy import LifecycleIntent, TurnResetPolicy
from agent.session import AgentSession, agent_session_store


@dataclass(frozen=True)
class TurnSessionState:
    session: AgentSession | None
    is_ephemeral: bool
    is_new_session: bool
    is_new_cgs_lifecycle: bool
    intent: LifecycleIntent
    should_reset: bool

    @property
    def reset_requested(self) -> bool:
        return self.should_reset and self.intent == LifecycleIntent.RESET

    def clear_after_successful_reset(self) -> None:
        if not self.reset_requested or self.session is None:
            return
        self.session.clear_work_state()


class SessionStateManager:
    def __init__(self, req: CgsMcpChatRequest) -> None:
        self._session_id = req.session_id
        self._llm = req.llm
        self._prompt = req.prompt
        self._candidate_hints = (
            [candidate.model_dump() for candidate in req.candidates]
            if req.candidates is not None
            else None
        )
        self._selection_hint = req.selection.model_dump() if req.selection is not None else None

    def begin_turn(self) -> TurnSessionState:
        session, is_ephemeral, is_new_session, is_new_cgs_lifecycle = agent_session_store.resolve(
            self._session_id,
            self._llm,
        )
        if session is not None:
            session.hydrate_request_hints(
                candidates=self._candidate_hints,
                selection=self._selection_hint,
            )
        intent, should_reset = TurnResetPolicy(
            prompt=self._prompt,
            is_new_session=is_new_cgs_lifecycle,
            is_ephemeral=is_ephemeral,
        ).decision()
        return TurnSessionState(
            session=session,
            is_ephemeral=is_ephemeral,
            is_new_session=is_new_session,
            is_new_cgs_lifecycle=is_new_cgs_lifecycle,
            intent=intent,
            should_reset=should_reset,
        )
