"""MCP tool-call execution boundary for one CGS agent turn."""

from __future__ import annotations

import json
from types import MappingProxyType
from collections.abc import Mapping
from typing import Any

from agent.candidate_context import CandidateContext
from agent.prompt_context import PromptMessageBuffer
from agent.prompt_templates import render_prompt
from agent.result_codec import McpResultCodec
from agent.submit_summary import SubmitSummaryEnricher


class ToolExecutionOutcome:
    def __init__(self, *, answered_call: dict[str, Any] | None = None) -> None:
        self._answered_call = answered_call
        self._events: list[tuple[str, dict[str, Any]]] = []
        self._submit_summary: dict[str, Any] | None = None
        self._submit_accepted = False
        self._read_progress_after_tool = False

    @classmethod
    def answering(cls, request: 'ToolCallRequest') -> 'ToolExecutionOutcome':
        return cls(answered_call=request.answered_call())

    def add_tool_step(self, request: 'ToolCallRequest', result: dict[str, Any]) -> None:
        self._events.append(request.tool_step(result))

    def add_event(self, event: tuple[str, dict[str, Any]]) -> None:
        self._events.append(event)

    def record_submit_summary(self, summary: dict[str, Any], *, accepted: bool) -> None:
        self._submit_summary = summary
        self._submit_accepted = accepted

    def request_progress_read(self) -> None:
        self._read_progress_after_tool = True

    def retain_answered_call(self, answered_calls: list[dict[str, Any]]) -> None:
        if self._answered_call is not None:
            answered_calls.append(self._answered_call)

    @property
    def events(self) -> tuple[tuple[str, dict[str, Any]], ...]:
        return tuple(self._events)

    @property
    def should_read_progress(self) -> bool:
        return self._read_progress_after_tool

    def apply_submit_state(self, turn_context: Any) -> None:
        if self._submit_summary is not None:
            turn_context.record_submit_result(
                self._submit_summary,
                accepted=self._submit_accepted,
            )


class ToolCallRequest:
    def __init__(self, call: dict[str, Any], allowed_names: set[str]) -> None:
        self._call = call
        self._allowed_names = set(allowed_names)
        function = self._call.get('function') or {}
        self.name = str(function.get('name') or '').strip()
        if self.name not in self._allowed_names:
            raise ValueError(f'LLM requested unknown MCP tool: {self.name}')
        arguments_text = str(function.get('arguments') or '{}')
        arguments = json.loads(arguments_text)
        if not isinstance(arguments, dict):
            raise ValueError(f'MCP tool arguments must be an object: {self.name}')
        self.arguments: Mapping[str, Any] = MappingProxyType(dict(arguments))

    def is_tool(self, name: str) -> bool:
        return self.name == name

    def is_progress_reader(self) -> bool:
        return self.name in {'cgs_submit_books', 'cgs_get_status', 'cgs_get_events'}

    def arguments_copy(self) -> dict[str, Any]:
        return dict(self.arguments)

    def argument(self, key: str) -> Any:
        return self.arguments.get(key)

    def answered_call(self) -> dict[str, Any]:
        return self._call

    def tool_message(self, content: str) -> dict[str, Any]:
        return {
            'role': 'tool',
            'tool_call_id': self._call.get('id') or self.name,
            'name': self.name,
            'content': content,
        }

    def tool_step(self, result: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        return 'tool_step', {'name': self.name, 'arguments': self.arguments_copy(), 'result': result}

    async def call_mcp(self, client: Any) -> Any:
        return await client.call_tool(self.name, self.arguments_copy())


class EpisodeSelectNudgeState:
    def __init__(self) -> None:
        self._count = 0

    def allow_next(self) -> bool:
        self._count += 1
        return self._count <= 2


class SubmitGuardrail:
    def __init__(
        self,
        *,
        request: ToolCallRequest,
        buffer: PromptMessageBuffer,
        candidate_context: CandidateContext,
        result_codec: McpResultCodec,
        nudge_state: EpisodeSelectNudgeState,
    ) -> None:
        self._request = request
        self._buffer = buffer
        self._candidate_context = candidate_context
        self._result_codec = result_codec
        self._nudge_state = nudge_state

    async def evaluate(self) -> ToolExecutionOutcome | None:
        if self._candidate_context.is_preview_mode():
            return self.blocked(
                {
                    'isError': True,
                    'code': 'preview_mode_submit_blocked',
                    'message': 'MCP 预览模式已开启：已阻止 cgs_submit_books，未开始下载。',
                },
            )
        if self._candidate_context.has_active_preferences() and self._candidate_context.has_candidate_books():
            projection_books, projection_decision = await self._candidate_context.preview_books_for_pool()
            projected_keys = {
                str(book.get('book_key') or book.get('key') or '').strip()
                for book in projection_books
            }
            submitted_keys = [
                str(key).strip()
                for key in self._request.argument('book_keys')
                if str(key or '').strip()
            ] if isinstance(self._request.argument('book_keys'), list) else []
            if not projected_keys or any(key not in projected_keys for key in submitted_keys):
                block_message = (
                    projection_decision.get('summary')
                    if isinstance(projection_decision, dict) and projection_decision.get('summary')
                    else '提交候选不在当前偏好投影内，已阻止自动提交。'
                )
                return self.blocked(
                    {
                        'isError': True,
                        'code': 'preference_projection_submit_blocked',
                        'message': block_message,
                        'preference_decision': projection_decision or {},
                    },
                )
        return self.episode_select_nudge()

    def episode_select_nudge(self) -> ToolExecutionOutcome | None:
        episode_selections = self._request.argument('episode_selections')
        episode_select = self._request.argument('episode_select')
        has_exact = isinstance(episode_selections, list) and len(episode_selections) > 0
        has_metric = isinstance(episode_select, dict)
        listed_episodes_this_turn = self._buffer.has_tool_message('cgs_list_book_episodes')
        if not (listed_episodes_this_turn and has_metric and not has_exact):
            return None

        if self._nudge_state.allow_next():
            nudge_text = render_prompt('episode_exact_nudge.md')
            self._buffer.append_tool(self._request.tool_message(nudge_text))
            outcome = ToolExecutionOutcome.answering(self._request)
            outcome.add_tool_step(
                self._request,
                {
                    'text': self._result_codec.truncate(nudge_text),
                    'tool': self._request.name,
                    'tone': 'warn',
                    'blocked': True,
                },
            )
            return outcome

        self._buffer.append_system(render_prompt('episode_mapping_failed.md'))
        return ToolExecutionOutcome()

    def blocked(self, result: dict[str, Any]) -> ToolExecutionOutcome:
        self._buffer.append_tool(self._request.tool_message(json.dumps(result, ensure_ascii=False)))
        outcome = ToolExecutionOutcome.answering(self._request)
        outcome.add_tool_step(self._request, result)
        return outcome


class ToolCallExecutor:
    def __init__(
        self,
        *,
        client: Any,
        candidate_context: CandidateContext,
        llm_tool_names: set[str],
        result_codec: McpResultCodec | None = None,
        nudge_state: EpisodeSelectNudgeState | None = None,
    ) -> None:
        self._client = client
        self._candidate_context = candidate_context
        self._llm_tool_names = llm_tool_names
        self._result_codec = result_codec or McpResultCodec()
        self._nudge_state = nudge_state or EpisodeSelectNudgeState()

    async def execute(
        self,
        call: dict[str, Any],
        messages: PromptMessageBuffer,
    ) -> ToolExecutionOutcome:
        return await ToolCallExecution(
            client=self._client,
            candidate_context=self._candidate_context,
            result_codec=self._result_codec,
            nudge_state=self._nudge_state,
            request=ToolCallRequest(call, self._llm_tool_names),
            buffer=messages,
        ).run()


class ToolCallExecution:
    def __init__(
        self,
        *,
        client: Any,
        candidate_context: CandidateContext,
        result_codec: McpResultCodec,
        nudge_state: EpisodeSelectNudgeState,
        request: ToolCallRequest,
        buffer: PromptMessageBuffer,
    ) -> None:
        self._client = client
        self._candidate_context = candidate_context
        self._result_codec = result_codec
        self._nudge_state = nudge_state
        self._request = request
        self._buffer = buffer

    async def run(self) -> ToolExecutionOutcome:
        if self._request.is_tool('cgs_submit_books'):
            blocked = await SubmitGuardrail(
                request=self._request,
                buffer=self._buffer,
                candidate_context=self._candidate_context,
                result_codec=self._result_codec,
                nudge_state=self._nudge_state,
            ).evaluate()
            if blocked is not None:
                return blocked

        if self._request.is_tool('cgs_list_sites'):
            raise ValueError('cgs_list_sites is backend-owned metadata and is not available as an LLM tool')

        result = await self._request.call_mcp(self._client)
        summary = self._result_codec.tool_summary(self._request.name, result)
        search_result: dict[str, Any] | None = None
        if self._request.is_tool('cgs_search_books'):
            search_result = self._candidate_context.record_search_result(result, self._request.arguments_copy())
            if search_result is not None:
                summary['search_result'] = search_result

        self._buffer.append_tool(self._request.tool_message(self._result_codec.text_from_result(result)))
        outcome = ToolExecutionOutcome.answering(self._request)

        if self._request.is_tool('cgs_list_book_episodes'):
            self._candidate_context.record_episode_lookup(result)
        if self._request.is_tool('cgs_submit_books'):
            candidates, episode_lookup = self._candidate_context.submit_display_context()
            enriched_summary = SubmitSummaryEnricher(
                arguments=self._request.arguments_copy(),
                summary=summary,
                candidates=candidates,
                episode_lookup=episode_lookup,
            ).enrich()
            submit_rejected = any(enriched_summary.get(key) is False for key in ('submitted', 'success'))
            accepted = not self._result_codec.is_error(result) and not submit_rejected
            outcome.record_submit_summary(enriched_summary, accepted=accepted)
            outcome.add_tool_step(self._request, enriched_summary)
            if accepted:
                return outcome
        else:
            outcome.add_tool_step(self._request, summary)
            if self._request.is_tool('cgs_search_books'):
                projection = await self._candidate_context.project_after_search(self._request.arguments_copy())
                if projection is not None:
                    projection.add_event_to(outcome)
                    projection.append_state_message_to(self._buffer)

        if self._request.is_progress_reader():
            outcome.request_progress_read()
        return outcome
