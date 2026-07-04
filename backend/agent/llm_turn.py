"""LLM turn collection for the CGS MCP agent."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Awaitable, Callable

import httpx
from fastapi import HTTPException

from agent.contract import CgsMcpChatRequest
from agent.prompt_context import PromptMessageBuffer
from agent.result_codec import ToolCallDeltaAccumulator
from agent.transport.chat_completions import openai_chat_stream

DEFAULT_LLM_TURN_RETRIES = 3
DEFAULT_LLM_RETRY_BACKOFF_SECONDS = 1.5
DEFAULT_LLM_TRANSIENT_HTTPX_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.PoolTimeout,
)
DEFAULT_LLM_TRANSIENT_HTTP_STATUS = {500, 502, 503, 504}

LlmStream = Callable[
    [CgsMcpChatRequest, list[dict[str, Any]], list[dict[str, Any]], httpx.AsyncBaseTransport | None],
    AsyncIterator[dict[str, Any]],
]


@dataclass(frozen=True)
class LlmTurnResult:
    _pending_calls: dict[int, dict[str, Any]]
    _assistant_text: str
    _reasoning_text: str
    _delta_texts: list[str]

    def has_tool_calls(self) -> bool:
        return bool(self._pending_calls)

    def ordered_tool_calls(self) -> list[dict[str, Any]]:
        return [self._copy_call(self._pending_calls[index]) for index in sorted(self._pending_calls)]

    def assistant_tool_request_message(self) -> dict[str, Any]:
        assistant_message: dict[str, Any] = {
            'role': 'assistant',
            'content': self._assistant_text or None,
            'tool_calls': self.ordered_tool_calls(),
        }
        if self._reasoning_text:
            assistant_message['reasoning_content'] = self._reasoning_text
        return assistant_message

    def assistant_deltas(self) -> list[str]:
        return list(self._delta_texts)

    def response_text(self, default: str = '') -> str:
        return ''.join(self._delta_texts) or self._assistant_text or default

    def has_tool_calls_without_text(self) -> bool:
        return self.has_tool_calls() and not self.response_text()

    def _copy_call(self, call: dict[str, Any]) -> dict[str, Any]:
        item = dict(call)
        function = item.get('function')
        if isinstance(function, dict):
            item['function'] = dict(function)
        return item


class LlmStreamCollection:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        stream: LlmStream,
        llm_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._req = req
        self._messages = messages
        self._tools = tools
        self._stream = stream
        self._llm_transport = llm_transport
        self._tool_call_accumulator: ToolCallDeltaAccumulator = ToolCallDeltaAccumulator()
        self._assistant_text: str = ''
        self._reasoning_text: str = ''
        self._delta_texts: list[str] = []

    async def collect(self) -> LlmTurnResult:
        async for chunk in self._stream(self._req, self._messages, self._tools, self._llm_transport):
            self.ingest(chunk)
        return self.result()

    def ingest(self, chunk: dict[str, Any]) -> None:
        choices = chunk.get('choices')
        if not isinstance(choices, list):
            return
        for choice in choices:
            delta = choice.get('delta') if isinstance(choice, dict) else None
            if isinstance(delta, dict):
                self.ingest_delta(delta)

    def ingest_delta(self, delta: dict[str, Any]) -> None:
        reasoning = delta.get('reasoning_content')
        if isinstance(reasoning, str) and reasoning:
            self._reasoning_text += reasoning
        content = delta.get('content')
        if isinstance(content, str) and content:
            self._assistant_text += content
            self._delta_texts.append(content)
        tool_call_deltas = delta.get('tool_calls')
        if isinstance(tool_call_deltas, list):
            for tool_call in tool_call_deltas:
                if isinstance(tool_call, dict):
                    self._tool_call_accumulator.merge(tool_call)

    def result(self) -> LlmTurnResult:
        return LlmTurnResult(
            _pending_calls=self._tool_call_accumulator.pending_snapshot(),
            _assistant_text=self._assistant_text,
            _reasoning_text=self._reasoning_text,
            _delta_texts=list(self._delta_texts),
        )


class LlmTurnCollector:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        llm_transport: httpx.AsyncBaseTransport | None = None,
        stream: LlmStream = openai_chat_stream,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        retries: int = DEFAULT_LLM_TURN_RETRIES,
        retry_backoff_seconds: float = DEFAULT_LLM_RETRY_BACKOFF_SECONDS,
        transient_httpx_errors: tuple[type[BaseException], ...] = DEFAULT_LLM_TRANSIENT_HTTPX_ERRORS,
        transient_http_status: set[int] | None = None,
    ) -> None:
        self._req = req
        self._llm_transport = llm_transport
        self._stream = stream
        self._sleep = sleep
        self._retries = retries
        self._retry_backoff_seconds = retry_backoff_seconds
        self._transient_httpx_errors = transient_httpx_errors
        self._transient_http_status = (
            set(transient_http_status)
            if transient_http_status is not None
            else set(DEFAULT_LLM_TRANSIENT_HTTP_STATUS)
        )

    async def collect(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> LlmTurnResult:
        for attempt in range(self._retries):
            try:
                return await LlmStreamCollection(
                    req=self._req,
                    messages=messages,
                    tools=tools,
                    stream=self._stream,
                    llm_transport=self._llm_transport,
                ).collect()
            except self._transient_httpx_errors:
                if attempt + 1 >= self._retries:
                    raise
                await self._sleep(self._retry_backoff_seconds * (attempt + 1))
            except HTTPException as exc:
                if exc.status_code in self._transient_http_status and attempt + 1 < self._retries:
                    await self._sleep(self._retry_backoff_seconds * (attempt + 1))
                    continue
                raise
        raise RuntimeError('unreachable LLM retry state')

    async def collect_prompt(
        self,
        messages: PromptMessageBuffer,
        tools: list[dict[str, Any]],
    ) -> LlmTurnResult:
        return await self.collect(messages.as_llm_messages(), tools)

    async def collect_without_tools(self, messages: PromptMessageBuffer) -> LlmTurnResult:
        return await self.collect_prompt(messages, [])
