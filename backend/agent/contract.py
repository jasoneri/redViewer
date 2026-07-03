"""rv-agent request/response contract and LLM error taxonomy.

These models and the error-class mapping are the communication contract between
the mobile client, the FastAPI route, and the agent loop. They live outside the
route so prompt/loop code never has to import the route module.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator


class CgsMcpLlmRequest(BaseModel):
    base_url: str = Field(min_length=1)
    api_key: str = Field(min_length=1)
    model: str = Field(min_length=1)


class LocalLibraryEpisode(BaseModel):
    book: str = Field(min_length=1)
    ep: str
    title: str | None = None


class LocalLibraryBook(BaseModel):
    kind: Literal['single', 'series']
    book: str = Field(min_length=1)
    title: str | None = None
    episode_count: int = Field(default=0, ge=0)
    episodes: list[LocalLibraryEpisode] = Field(default_factory=list)


class BookContext(BaseModel):
    book: str
    title: str | None = None
    artist: str | None = None
    source: str | None = None
    tags: list[str] = Field(default_factory=list)
    # Structured book-type metadata (R4). Preferred over filename heuristics
    # for distinguishing whole-book/doujinshi from manga/episode-card.
    btype: str | None = None
    category: str | None = None
    type: str | None = None
    # Lightweight projection of the existing /mobile/library grouped book shape.
    local_library: LocalLibraryBook | None = None


class AttachedBookContext(BaseModel):
    attach_book_id: str = Field(min_length=1)
    book_id: str = Field(min_length=1)
    book: str = Field(min_length=1)
    title: str | None = None
    source: str | None = None
    book_context: BookContext


class CandidateHint(BaseModel):
    """A search candidate the mobile already holds (R5/R0.5).

    Carried so the agent can disambiguate ordinals / metadata matches against
    the active candidate set without re-searching.
    """

    key: str = Field(min_length=1)
    label: str = ''
    value: str = ''


class SelectionHint(BaseModel):
    """Currently selected book / episodes on the mobile (R0.5)."""

    book_key: str = Field(min_length=1)
    episode_keys: list[str] = Field(default_factory=list)


class CgsMcpPreferenceScope(BaseModel):
    panel: Literal['cgs-mcp'] = 'cgs-mcp'
    book_kind: Literal['doujinshi', 'manga', 'unknown'] | None = None
    site: str | None = None
    language: str | None = None


class CgsMcpPreferenceItemContext(BaseModel):
    text: str = Field(min_length=1, max_length=64)
    source: Literal['manual', 'learned']
    hit_count: int = Field(default=0, ge=0)
    scope: CgsMcpPreferenceScope = Field(default_factory=CgsMcpPreferenceScope)

    @model_validator(mode='before')
    @classmethod
    def _read_legacy_tag_text(cls, value: Any) -> Any:
        if isinstance(value, dict) and 'text' not in value:
            legacy_text = value.get('tag') or value.get('condition')
            if legacy_text is not None:
                return {**value, 'text': legacy_text}
        return value


# Compatibility name for tag-era payloads. New serialized contracts should use
# CgsMcpPreferenceItemContext with the canonical `text` field.
CgsMcpPreferenceTagContext = CgsMcpPreferenceItemContext


class CgsMcpPreferenceSettings(BaseModel):
    auto_activate_threshold: int = Field(default=5, ge=0, le=9)
    per_conversation_learn_cap: int = Field(default=2, ge=1, le=9)
    preview_switch: bool = False


class CgsMcpPreferencePromptContext(BaseModel):
    schema_version: Literal[1] = 1
    match_preferences: list[CgsMcpPreferenceItemContext] = Field(default_factory=list, max_length=8)
    exclude_preferences: list[CgsMcpPreferenceItemContext] = Field(default_factory=list, max_length=8)
    settings: CgsMcpPreferenceSettings = Field(default_factory=CgsMcpPreferenceSettings)

    @model_validator(mode='before')
    @classmethod
    def _read_legacy_tag_lists(cls, value: Any) -> Any:
        if isinstance(value, dict):
            next_value = dict(value)
            if 'match_preferences' not in next_value and 'match_tags' in next_value:
                next_value['match_preferences'] = next_value.get('match_tags')
            if 'exclude_preferences' not in next_value and 'exclude_tags' in next_value:
                next_value['exclude_preferences'] = next_value.get('exclude_tags')
            return next_value
        return value


class CgsMcpFinalBadge(BaseModel):
    type: Literal['book', 'ep']
    text: str = Field(min_length=1, max_length=120)


class CgsMcpFinalRow(BaseModel):
    label: str = Field(min_length=1, max_length=16)
    value: str = Field(min_length=1, max_length=120)
    tone: Literal['default', 'ok', 'warn', 'error'] = 'default'


class CgsMcpFinalTextBlock(BaseModel):
    type: Literal['text']
    text: str = Field(min_length=1, max_length=240)


class CgsMcpFinalRowsBlock(BaseModel):
    type: Literal['rows']
    rows: list[CgsMcpFinalRow] = Field(default_factory=list)


class CgsMcpFinalBadgesBlock(BaseModel):
    type: Literal['badges']
    badges: list[CgsMcpFinalBadge] = Field(default_factory=list)


CgsMcpFinalBlock = Annotated[
    CgsMcpFinalTextBlock | CgsMcpFinalRowsBlock | CgsMcpFinalBadgesBlock,
    Field(discriminator='type'),
]


class CgsMcpFinalSummary(BaseModel):
    schema_version: Literal[1] = 1
    status: Literal['completed', 'partial', 'failed']
    title: str = Field(min_length=1, max_length=24)
    headline: str = Field(default='', max_length=80)
    summary: str = Field(default='', max_length=220)
    blocks: list[CgsMcpFinalBlock] = Field(default_factory=list)
    finished_badges: list[CgsMcpFinalBadge] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CgsMcpChatRequest(BaseModel):
    prompt: str = Field(min_length=1)
    llm: CgsMcpLlmRequest
    preview_mode: bool = False
    book_context: BookContext | None = None
    attach_book_id: str | None = None
    attach_book_ids: list[str] | None = None
    attached_book_list: list[AttachedBookContext] | None = None
    # Session continuity (R3). ``None`` = ephemeral/one-shot turn (legacy
    # behavior: no persistence, unconditional MCP reset). A client-managed id
    # enables multi-turn state reuse.
    session_id: str | None = None
    candidates: list[CandidateHint] | None = None
    selection: SelectionHint | None = None
    preference_context: CgsMcpPreferencePromptContext | None = None


# --- CGS MCP chat error taxonomy (additive; mobile renders a repair card by `class`) ---
CGS_MCP_ERR_PROVIDER_REJECTED = 'llm_provider_rejected'
CGS_MCP_ERR_MODEL_DENIED = 'llm_model_access_denied'
CGS_MCP_ERR_PROTOCOL_INVALID = 'llm_protocol_invalid'
CGS_MCP_ERR_MCP_TRANSPORT = 'mcp_transport_unavailable'
CGS_MCP_ERR_ATTACH_BOOK_INVALID = 'attach_book_invalid'
CGS_MCP_ERR_CGS_RUNTIME = 'cgs_runtime_failed'

_CGS_PROXY_CODE_TO_ERR_CLASS = {
    'unconfigured': CGS_MCP_ERR_MCP_TRANSPORT,
    'unavailable': CGS_MCP_ERR_MCP_TRANSPORT,
    'timeout': CGS_MCP_ERR_MCP_TRANSPORT,
    'mcp_reset_unavailable': CGS_MCP_ERR_MCP_TRANSPORT,
    'attach_book_invalid': CGS_MCP_ERR_ATTACH_BOOK_INVALID,
    'upstream_failed': CGS_MCP_ERR_CGS_RUNTIME,
    'invalid_response': CGS_MCP_ERR_CGS_RUNTIME,
}

_LLM_PROTOCOL_ERROR_HINTS = ('ConnectError', 'ConnectTimeout', 'RemoteProtocolError', 'ReadTimeout', 'Invalid LLM SSE')


class ExceptionCauseChain:
    def __init__(self, exc: BaseException, limit: int = 6) -> None:
        self._exc = exc
        self._limit = limit
        self._records: list[dict[str, str]] = []
        self._seen: set[int] = set()

    def message(self) -> str:
        chain: list[str] = []
        current: BaseException | None = self._exc
        while current is not None and len(chain) < self._limit:
            sub_exceptions = getattr(current, 'exceptions', None)
            if sub_exceptions:
                current = sub_exceptions[0]
                continue
            chain.append(f'{type(current).__name__}: {current}')
            current = current.__cause__ or current.__context__
        return ' <- '.join(chain) if chain else str(self._exc)

    def records(self) -> list[dict[str, str]]:
        self._records = []
        self._seen = set()
        self._append_record(self._exc)
        return [dict(record) for record in self._records]

    def _append_record(self, exc: BaseException) -> None:
        if id(exc) in self._seen or len(self._records) >= self._limit:
            return
        self._seen.add(id(exc))
        self._records.append({'type': type(exc).__name__, 'message': TruncatedText(str(exc)).text()})
        if isinstance(exc, BaseExceptionGroup):
            for child in exc.exceptions[: max(0, self._limit - len(self._records))]:
                self._append_record(child)
        if exc.__cause__ is not None:
            self._append_record(exc.__cause__)
        elif exc.__context__ is not None:
            self._append_record(exc.__context__)


class LlmHttpErrorClassification:
    """Map an upstream LLM HTTP error to mobile repair-card fields."""

    def __init__(self, status_code: int, body_text: str) -> None:
        self._status_code = status_code
        self._body_text = body_text
        self._provider_code = ''
        self._provider_message = ''
        self._html_gateway_message = ''
        stripped = self._body_text.lstrip().lower()
        if stripped.startswith('<!doctype html') or stripped.startswith('<html'):
            self._html_gateway_message = f'LLM provider gateway returned an HTML error page ({self._status_code})'
        try:
            parsed = json.loads(self._body_text)
        except (TypeError, ValueError):
            parsed = None
        if isinstance(parsed, dict):
            error = parsed.get('error') if isinstance(parsed.get('error'), dict) else parsed
            if isinstance(error, dict):
                self._provider_code = str(error.get('code') or error.get('type') or '')
                self._provider_message = str(error.get('message') or '')

    def result(self) -> tuple[str, list[str], str]:
        detail = self._provider_message or self._html_gateway_message or TruncatedText(self._body_text).text()
        if self._status_code in (401, 403):
            return CGS_MCP_ERR_PROVIDER_REJECTED, ['api_key'], detail or 'LLM provider rejected the request'
        if self._status_code == 404 or self.model_signal():
            return CGS_MCP_ERR_MODEL_DENIED, ['model'], detail or 'LLM model unavailable or access denied'
        if self.provider_api_error():
            return CGS_MCP_ERR_MODEL_DENIED, ['model'], detail or f'LLM provider API failed ({self._status_code})'
        if self._status_code in (408, 500, 502, 503, 504, 520, 521, 522, 523, 524):
            return CGS_MCP_ERR_PROTOCOL_INVALID, ['base_url'], detail or f'LLM gateway failed ({self._status_code})'
        return CGS_MCP_ERR_PROVIDER_REJECTED, ['api_key'], detail or f'LLM request failed ({self._status_code})'

    def model_signal(self) -> bool:
        lowered = f'{self._provider_code} {self._provider_message}'.lower()
        return 'model' in lowered and any(k in lowered for k in ('not', 'denied', 'access', 'exist', 'invalid'))

    def provider_api_error(self) -> bool:
        return self._status_code >= 500 and self._provider_code.lower() == 'api_error'


@dataclass(frozen=True)
class LlmErrorDetail:
    error_class: str
    message: str
    fields: list[str]
    request_id: str | None = None

    def payload(self) -> dict[str, Any]:
        detail: dict[str, Any] = {
            'class': self.error_class,
            'message': self.message,
            'fields': self.fields,
        }
        if self.request_id:
            detail['request_id'] = self.request_id
        return detail


@dataclass(frozen=True)
class McpChatErrorPayload:
    detail: Any

    def payload(self) -> dict[str, Any]:
        if isinstance(self.detail, dict):
            if self.detail.get('class'):
                payload: dict[str, Any] = {
                    'class': self.detail['class'],
                    'message': str(self.detail.get('message') or ''),
                }
                if self.detail.get('fields'):
                    payload['fields'] = self.detail['fields']
                if self.detail.get('request_id'):
                    payload['request_id'] = self.detail['request_id']
                return payload
            code = str(self.detail.get('code') or '')
            if code:
                return {
                    'class': _CGS_PROXY_CODE_TO_ERR_CLASS.get(code, CGS_MCP_ERR_CGS_RUNTIME),
                    'message': str(self.detail.get('message') or code),
                    'code': code,
                }
            return {'class': CGS_MCP_ERR_CGS_RUNTIME, 'message': json.dumps(self.detail, ensure_ascii=False)}
        return {'class': CGS_MCP_ERR_CGS_RUNTIME, 'message': str(self.detail)}


class CgsChatExceptionPayload:
    def __init__(self, exc: BaseException) -> None:
        self._message = ExceptionCauseChain(exc).message()
        error_class = (
            CGS_MCP_ERR_PROTOCOL_INVALID
            if any(hint in self._message for hint in _LLM_PROTOCOL_ERROR_HINTS)
            else CGS_MCP_ERR_CGS_RUNTIME
        )
        self._payload = {'class': error_class, 'message': self._message}
        if error_class == CGS_MCP_ERR_PROTOCOL_INVALID:
            self._payload['fields'] = ['base_url']

    def message(self) -> str:
        return self._message

    def payload(self) -> dict[str, Any]:
        return dict(self._payload)


@dataclass(frozen=True)
class TruncatedText:
    value: str
    limit: int = 260

    def text(self) -> str:
        text = self.value.replace('\r', ' ').replace('\n', ' ').strip()
        return text if len(text) <= self.limit else f'{text[:self.limit - 1]}…'
