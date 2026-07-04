"""Prompt-context assembly boundary for one CGS MCP agent turn."""

from __future__ import annotations

import json
from typing import Any

from agent.contract import CgsMcpChatRequest
from agent.prompt import IntentDirectiveBuilder, PreferencePrompt, PromptMessageBuilder
from agent.prompt_templates import prompt_system_message
from agent.session import AgentSession


class PromptMessageBuffer:
    _messages: list[dict[str, Any]]

    def __init__(self, messages: list[dict[str, Any]]) -> None:
        self._messages = messages

    def append_context(self, message: dict[str, Any] | None) -> None:
        if message is not None:
            self._messages.append(message)

    def append_system(self, content: str) -> None:
        self._messages.append({'role': 'system', 'content': content})

    def append_user(self, content: str) -> None:
        self._messages.append({'role': 'user', 'content': content})

    def append_assistant(self, message: dict[str, Any]) -> None:
        self._messages.append(message)

    def append_tool(self, message: dict[str, Any]) -> None:
        self._messages.append(message)

    def insert_before_user(self, message: dict[str, Any] | None) -> None:
        if message is not None:
            self._messages.insert(-1, message)

    def has_tool_message(self, name: str) -> bool:
        return any(
            message.get('role') == 'tool' and message.get('name') == name
            for message in self._messages
        )

    def as_llm_messages(self) -> list[dict[str, Any]]:
        return self._messages


class PromptContextBuilder:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        session: AgentSession | None,
        cached_sites_message: dict[str, Any] | None,
        is_ephemeral: bool,
        is_new_session: bool,
        reset_requested: bool,
    ) -> None:
        self._prompt = req.prompt
        self._book_context = req.book_context
        self._preference_context = req.preference_context
        self._attached_book_list = req.attached_book_list
        self._attach_book_ids = tuple(req.attach_book_ids or ())
        self._attach_book_id = req.attach_book_id
        self._request_candidates = tuple(req.candidates or ())
        self._request_selection = req.selection
        self._session = session
        self._cached_sites_message = cached_sites_message
        self._is_ephemeral = is_ephemeral
        self._is_new_session = is_new_session
        self._reset_requested = reset_requested

    def build(self) -> PromptMessageBuffer:
        ctx_message = self.context_state_message()
        intent_directive = IntentDirectiveBuilder(
            prompt=self._prompt,
            candidates=self._session.prompt_state()[0] if self._session else self.request_candidates(),
            book_context=self._book_context,
        ).build()
        fingerprint = self.attached_book_fingerprint()
        attached_book_changed = self._session is not None and self._session.attached_book_fingerprint != fingerprint
        rebuild_messages = self._is_ephemeral or self._is_new_session or attached_book_changed or self._reset_requested

        if rebuild_messages:
            messages = PromptMessageBuilder(
                prompt=self._prompt.strip(),
                book_context=self._book_context,
                preference_context=self._preference_context,
                attached_book_list=self._attached_book_list,
            ).build()
            buffer = PromptMessageBuffer(messages)
            buffer.insert_before_user(self._cached_sites_message)
            buffer.insert_before_user(ctx_message)
            buffer.insert_before_user(intent_directive)
            if self._session is not None:
                self._session.replace_messages(buffer.as_llm_messages())
                self._session.remember_attached_book_fingerprint(fingerprint)
            return buffer

        if self._session is None:
            raise RuntimeError('Prompt append requires an existing session')
        buffer = self._session.message_buffer()
        buffer.append_context(ctx_message)
        preference_message = PreferencePrompt(self._preference_context).message()
        buffer.append_context(preference_message)
        buffer.append_context(self._cached_sites_message)
        buffer.append_context(intent_directive)
        buffer.append_user(self._prompt.strip())
        return buffer

    def request_candidates(self) -> list[dict[str, Any]] | None:
        return [candidate.model_dump() for candidate in self._request_candidates] if self._request_candidates else None

    def context_state_message(self) -> dict[str, Any] | None:
        if self._session is not None:
            candidates, selection = self._session.prompt_state()
        else:
            candidates = self.request_candidates() or []
            selection = self._request_selection.model_dump() if self._request_selection else None
        if not candidates and not selection:
            return None
        candidate_rows: list[dict[str, Any]] = []
        if candidates:
            for i, candidate in enumerate(candidates):
                key = candidate['key'] if isinstance(candidate, dict) else candidate.key
                label = (candidate.get('label') if isinstance(candidate, dict) else candidate.label) or ''
                candidate_rows.append({'ordinal': i + 1, 'key': key, 'label': label})
        selection_payload = None
        if selection:
            selection_payload = {
                'book_key': selection.get('book_key'),
                'episode_keys': selection.get('episode_keys'),
            }
        payload = {
            'schema_version': 1,
            'candidates': candidate_rows,
            'selection': selection_payload,
        }
        return prompt_system_message(
            'session_state.md',
            session_state_json=json.dumps(payload, ensure_ascii=False, default=str),
        )

    def attached_book_fingerprint(self) -> str:
        if self._attached_book_list:
            ids = [book.attach_book_id for book in self._attached_book_list]
        elif self._attach_book_ids:
            ids = self._attach_book_ids
        else:
            ids = [self._attach_book_id] if self._attach_book_id else []
        return '\n'.join(clean_id for attach_book_id in ids if (clean_id := str(attach_book_id or '').strip()))
