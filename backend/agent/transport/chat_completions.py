"""OpenAI Chat Completions streaming transport for the agent loop.

The LLM transport hook (``cgs_llm_transport``) is passed in by the route so the
test-injection surface stays on the route module; this function owns only the
SSE parsing and HTTP-error classification.
"""

from __future__ import annotations

import json
import hashlib
import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Any, AsyncIterator, NoReturn
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import httpx
from fastapi import HTTPException

from core.logging import get_logger
from agent.contract import (
    CGS_MCP_ERR_PROTOCOL_INVALID,
    CgsMcpChatRequest,
    ExceptionCauseChain,
    LlmErrorDetail,
    LlmHttpErrorClassification,
    TruncatedText,
)


_LLM_DIAGNOSTIC_LIMIT = 80
logger = get_logger()


class LlmDiagnosticsStore:
    def __init__(self, limit: int = _LLM_DIAGNOSTIC_LIMIT) -> None:
        self._limit = limit
        self._attempts: deque[dict[str, Any]] = deque(maxlen=limit)
        self._lock = threading.Lock()

    def record(self, entry: dict[str, Any]) -> None:
        with self._lock:
            self._attempts.append(dict(entry))

    def snapshot(self, limit: int = 40) -> dict[str, Any]:
        safe_limit = max(1, min(int(limit or 40), self._limit))
        with self._lock:
            attempts = list(self._attempts)[-safe_limit:]
        return {'limit': safe_limit, 'attempts': list(reversed(attempts))}


default_llm_diagnostics = LlmDiagnosticsStore()


class OpenAiChatCompletionRequest:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> None:
        self._req = req
        self._messages = messages
        self._tools = tools
        base = self._req.llm.base_url.strip().rstrip('/')
        if base.endswith('/chat/completions'):
            self._url = base
        elif base.endswith('/v1'):
            self._url = f'{base}/chat/completions'
        else:
            self._url = f'{base}/v1/chat/completions'
        self._headers = {
            'Accept': 'application/json',
            'Authorization': str(self._req.llm.api_key or '').strip(),
            'Content-Type': 'application/json',
        }
        self._provider_messages = []
        for message in self._messages:
            item = dict(message)
            if item.get('role') == 'user' and isinstance(item.get('content'), str):
                item['content'] = [{'type': 'text', 'text': item['content']}]
            self._provider_messages.append(item)
        self._payload = {
            'model': self._req.llm.model,
            'messages': self._provider_messages,
            'max_completion_tokens': 1024,
            'stream': False,
        }
        if self._tools:
            self._payload['tools'] = self._tools
            self._payload['tool_choice'] = 'auto'

    @property
    def url(self) -> str:
        return self._url

    def headers(self) -> dict[str, str]:
        return self._headers

    def payload(self) -> dict[str, Any]:
        return self._payload

    def diagnostic_url(self) -> str:
        parsed = urlsplit(self._url)
        host = parsed.hostname or ''
        if parsed.port is not None:
            host = f'{host}:{parsed.port}'
        return urlunsplit((parsed.scheme, host, parsed.path, '', ''))

    def request_json_size(self) -> tuple[int | None, str | None]:
        try:
            return len(json.dumps(self._payload, ensure_ascii=False, default=str).encode('utf-8')), None
        except (TypeError, ValueError) as exc:
            return None, f'{type(exc).__name__}: {TruncatedText(str(exc)).text()}'

    def diagnostic_attempt(self, request_id: str) -> dict[str, Any]:
        request_json_bytes, request_json_error = self.request_json_size()
        attempt = {
            'request_id': request_id,
            'created_at': datetime.now(timezone.utc).isoformat(timespec='milliseconds'),
            'stage': 'request_build',
            'url': self.diagnostic_url(),
            'model': self._req.llm.model,
            'stream': False,
            'tool_choice': self._payload.get('tool_choice'),
            'tools_count': len(self._tools),
            'max_completion_tokens': self._payload.get('max_completion_tokens'),
            'request_json_bytes': request_json_bytes,
            **self.messages_summary(),
            **self.attached_book_summary(),
            'chunks_count': 0,
            'usage_seen': False,
        }
        if request_json_error:
            attempt['request_json_error'] = request_json_error
        return attempt

    def messages_summary(self) -> dict[str, Any]:
        roles = Counter(str(message.get('role') or 'unknown') for message in self._provider_messages)
        lengths = [
            {
                'index': index,
                'role': str(message.get('role') or 'unknown'),
                'content_length': self.content_length(message.get('content')),
            }
            for index, message in enumerate(self._provider_messages[:60])
        ]
        return {
            'messages_count': len(self._provider_messages),
            'message_roles': dict(roles),
            'message_content_lengths': lengths,
            'message_content_lengths_omitted': max(len(self._provider_messages) - len(lengths), 0),
        }

    def attached_book_summary(self) -> dict[str, Any]:
        if self._req.attached_book_list:
            ids = [book.attach_book_id for book in self._req.attached_book_list]
        elif self._req.attach_book_ids:
            ids = self._req.attach_book_ids
        elif self._req.attach_book_id:
            ids = [self._req.attach_book_id]
        else:
            ids = []
        clean_ids = [str(value or '').strip() for value in ids if str(value or '').strip()]
        digest = hashlib.sha256('\n'.join(clean_ids).encode('utf-8')).hexdigest()[:12] if clean_ids else ''
        return {'attached_book_count': len(clean_ids), 'attached_book_fingerprint': digest}

    def content_length(self, value: Any) -> int:
        if value is None:
            return 0
        if isinstance(value, str):
            return len(value)
        try:
            return len(json.dumps(value, ensure_ascii=False, default=str))
        except (TypeError, ValueError):
            return len(str(value))


class OpenAiCompletionResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def stream_chunk(self) -> dict[str, Any]:
        choices = self._payload.get('choices')
        if not isinstance(choices, list):
            return {'choices': []}
        converted_choices: list[dict[str, Any]] = []
        for fallback_index, choice in enumerate(choices):
            if not isinstance(choice, dict):
                continue
            message = choice.get('message')
            if not isinstance(message, dict):
                continue
            delta: dict[str, Any] = {}
            content = message.get('content')
            if isinstance(content, str) and content:
                delta['content'] = content
            reasoning = message.get('reasoning_content')
            if isinstance(reasoning, str) and reasoning:
                delta['reasoning_content'] = reasoning
            tool_calls = message.get('tool_calls')
            if isinstance(tool_calls, list) and tool_calls:
                normalized_calls: list[dict[str, Any]] = []
                for index, tool_call in enumerate(tool_calls):
                    if not isinstance(tool_call, dict):
                        continue
                    normalized = dict(tool_call)
                    normalized.setdefault('index', index)
                    normalized_calls.append(normalized)
                if normalized_calls:
                    delta['tool_calls'] = normalized_calls
            converted_choices.append({
                'index': choice.get('index', fallback_index),
                'delta': delta,
                'finish_reason': choice.get('finish_reason'),
            })
        chunk: dict[str, Any] = {'choices': converted_choices}
        if self._payload.get('usage') is not None:
            chunk['usage'] = self._payload.get('usage')
        return chunk

    def finish_reasons(self) -> list[Any]:
        choices = self._payload.get('choices')
        if not isinstance(choices, list):
            return []
        return [
            choice.get('finish_reason')
            for choice in choices
            if isinstance(choice, dict) and choice.get('finish_reason') is not None
        ]

    def usage_seen(self) -> bool:
        return self._payload.get('usage') is not None


class OpenAiChatCompletionAttempt:
    def __init__(
        self,
        entry: dict[str, Any],
        diagnostics: LlmDiagnosticsStore = default_llm_diagnostics,
        started: float | None = None,
    ) -> None:
        self._entry = entry
        self._diagnostics = diagnostics
        self._started = time.perf_counter() if started is None else started
        self._current_stage = 'connect'

    @property
    def request_id(self) -> str:
        return str(self._entry.get('request_id') or '')

    @property
    def http_status(self) -> int | None:
        status_code = self._entry.get('http_status')
        return int(status_code) if isinstance(status_code, int) else None

    @property
    def current_stage(self) -> str:
        return self._current_stage

    def set_stage(self, stage: str) -> None:
        self._current_stage = stage

    def record_http_response(self, response: httpx.Response) -> None:
        self._entry['http_status'] = response.status_code
        self._entry['response_content_type'] = response.headers.get('content-type', '')

    def record_response_body(self, body_text: str) -> None:
        self._entry['response_body_summary'] = TruncatedText(body_text, 1000).text()

    def record_status_error(self, *, error_class: str, fields: list[str]) -> None:
        self._entry['error_class'] = error_class
        self._entry['fields'] = fields

    def record_completion(self, completion_response: OpenAiCompletionResponse) -> None:
        finish_reasons = completion_response.finish_reasons()
        if finish_reasons:
            self._entry['finish_reasons'] = finish_reasons
        self._entry['chunks_count'] = 1
        self._entry['usage_seen'] = completion_response.usage_seen()

    def finish(
        self,
        *,
        stage: str,
        ok: bool,
        status_code: int | None = None,
        message: str = '',
        exception: BaseException | None = None,
    ) -> None:
        self._entry['stage'] = stage
        self._entry['ok'] = ok
        self._entry['duration_ms'] = max(0, int(round((time.perf_counter() - self._started) * 1000)))
        if status_code is not None:
            self._entry['http_status'] = int(status_code)
        if message:
            self._entry['message'] = TruncatedText(message).text()
        if exception is not None:
            self._entry['exception_chain'] = ExceptionCauseChain(exception, limit=8).records()
        self._diagnostics.record(self._entry)
        if ok:
            logger.info(
                'LLM request success request_id={} model={} duration_ms={} chunks={}',
                self._entry.get('request_id'),
                self._entry.get('model'),
                self._entry.get('duration_ms'),
                self._entry.get('chunks_count', 0),
            )
            logger.debug('LLM request diagnostics {}', self._entry)
            return
        log = logger.error if status_code and status_code >= 500 else logger.warning
        log(
            'LLM request failed request_id={} stage={} status={} duration_ms={} message={}',
            self._entry.get('request_id'),
            stage,
            status_code,
            self._entry.get('duration_ms'),
            TruncatedText(message or (str(exception) if exception else '')).text(),
        )
        logger.debug('LLM request diagnostics {}', self._entry)


class LlmTransportErrorTranslator:
    def __init__(self, attempt: OpenAiChatCompletionAttempt) -> None:
        self._attempt = attempt

    def raise_error(
        self,
        *,
        status_code: int,
        error_class: str,
        message: str,
        fields: list[str],
        stage: str | None = None,
        exception: BaseException | None = None,
    ) -> NoReturn:
        failure_stage = stage or self._attempt.current_stage
        self._attempt.record_status_error(error_class=error_class, fields=fields)
        self._attempt.finish(
            stage=failure_stage,
            ok=False,
            status_code=status_code,
            message=message,
            exception=exception,
        )
        raise HTTPException(
            status_code,
            LlmErrorDetail(error_class, message, fields, request_id=self._attempt.request_id).payload(),
        ) from exception

    def raise_stream_exception(self, exc: BaseException) -> NoReturn:
        stage = self._attempt.current_stage
        if isinstance(exc, httpx.TimeoutException):
            self.raise_error(
                status_code=504,
                error_class=CGS_MCP_ERR_PROTOCOL_INVALID,
                message=f'LLM request timed out at {stage}: {TruncatedText(str(exc)).text()}',
                fields=['base_url'],
                stage=stage,
                exception=exc,
            )
        if isinstance(exc, httpx.HTTPError):
            self.raise_error(
                status_code=502,
                error_class=CGS_MCP_ERR_PROTOCOL_INVALID,
                message=f'LLM request failed at {stage}: {type(exc).__name__}: {TruncatedText(str(exc)).text()}',
                fields=['base_url'],
                stage=stage,
                exception=exc,
            )
        self.raise_error(
            status_code=502,
            error_class=CGS_MCP_ERR_PROTOCOL_INVALID,
            message=f'LLM stream failed at {stage}: {type(exc).__name__}: {TruncatedText(str(exc)).text()}',
            fields=['base_url'],
            stage=stage,
            exception=exc,
        )


class OpenAiChatCompletionHttpResponse:
    def __init__(self, *, response: httpx.Response, attempt: OpenAiChatCompletionAttempt) -> None:
        self._response = response
        self._attempt = attempt
        self._errors = LlmTransportErrorTranslator(attempt)

    async def completion(self) -> OpenAiCompletionResponse:
        self._attempt.record_http_response(self._response)
        self._attempt.set_stage('response_status')
        if self._response.status_code >= 400:
            body_text = (await self._response.aread()).decode('utf-8', 'replace')
            self._attempt.record_response_body(body_text)
            error_class, fields, message = LlmHttpErrorClassification(
                self._response.status_code,
                body_text,
            ).result()
            self._errors.raise_error(
                status_code=self._response.status_code,
                error_class=error_class,
                message=message,
                fields=fields,
                stage='response_status',
            )

        self._attempt.set_stage('response_json')
        body_text = (await self._response.aread()).decode('utf-8', 'replace')
        try:
            completion = json.loads(body_text)
        except json.JSONDecodeError as exc:
            self._attempt.record_response_body(body_text)
            message = f'Invalid LLM JSON response: {TruncatedText(body_text).text()}'
            self._errors.raise_error(
                status_code=422,
                error_class=CGS_MCP_ERR_PROTOCOL_INVALID,
                message=message,
                fields=['base_url'],
                stage='response_json',
                exception=exc,
            )
        if not isinstance(completion, dict):
            self._attempt.record_response_body(body_text)
            message = 'LLM JSON response must be an object'
            self._errors.raise_error(
                status_code=422,
                error_class=CGS_MCP_ERR_PROTOCOL_INVALID,
                message=message,
                fields=['base_url'],
                stage='response_json',
            )
        return OpenAiCompletionResponse(completion)


class OpenAiChatCompletionStream:
    def __init__(
        self,
        *,
        req: CgsMcpChatRequest,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        llm_transport: httpx.AsyncBaseTransport | None,
        diagnostics: LlmDiagnosticsStore = default_llm_diagnostics,
    ) -> None:
        self._llm_transport = llm_transport
        self._request_id = f'llm-{uuid4().hex[:12]}'
        started = time.perf_counter()
        self._request = OpenAiChatCompletionRequest(
            req=req,
            messages=messages,
            tools=tools,
        )
        self._attempt = OpenAiChatCompletionAttempt(
            entry=self._request.diagnostic_attempt(self._request_id),
            diagnostics=diagnostics,
            started=started,
        )
        self._errors = LlmTransportErrorTranslator(self._attempt)

    async def stream(self) -> AsyncIterator[dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=300.0), transport=self._llm_transport) as client:
                async with client.stream(
                    'POST',
                    self._request.url,
                    headers=self._request.headers(),
                    json=self._request.payload(),
                ) as response:
                    completion_response = await OpenAiChatCompletionHttpResponse(
                        response=response,
                        attempt=self._attempt,
                    ).completion()
                    chunk = completion_response.stream_chunk()
                    self._attempt.record_completion(completion_response)
                    yield chunk
            self._attempt.finish(stage='success', ok=True, status_code=self._attempt.http_status)
        except HTTPException:
            raise
        except Exception as exc:
            self._errors.raise_stream_exception(exc)


async def openai_chat_stream(
    req: CgsMcpChatRequest,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    llm_transport: httpx.AsyncBaseTransport | None,
) -> AsyncIterator[dict[str, Any]]:
    stream = OpenAiChatCompletionStream(
        req=req,
        messages=messages,
        tools=tools,
        llm_transport=llm_transport,
    )
    async for chunk in stream.stream():
        yield chunk
