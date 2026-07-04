#!/usr/bin/python
# -*- coding: utf-8 -*-
"""CGS local-service proxy routes.

The rv-agent prompt + tool-calling loop live in :mod:`backend.agent`. This
module is the HTTP surface: CGS service discovery/proxy, diagnostics, cover
avatar proxy, and a thin ``/root/cgs/mcp/chat`` route that delegates each turn
to :class:`backend.agent.app.CgsAgentApp`.
"""

from __future__ import annotations

import json
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import count
from pathlib import Path
from typing import Any, AsyncIterator, Literal, Optional
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.mobile_library import (
    book_meta as resolve_book_meta,
    book_meta_map as resolve_book_meta_map,
    item_id,
    library_books,
    local_library_projection,
)
from api.routes.root import is_auth_required, verify_secret
from agent.attached_book import AttachedBookStore, attached_book_store
from core.logging import get_logger
from core import lib_mgr
from infra import backend
# --- rv-agent contract + loop (moved out of this route; see R9) ---
from agent.contract import (
    CGS_MCP_ERR_MCP_TRANSPORT,
    CGS_MCP_ERR_MODEL_DENIED,
    CGS_MCP_ERR_PROTOCOL_INVALID,
    CGS_MCP_ERR_PROVIDER_REJECTED,
    AttachedBookContext,
    BookContext,
    CgsChatExceptionPayload,
    CgsMcpChatRequest,
    CgsMcpLlmRequest,
    ExceptionCauseChain,
    McpChatErrorPayload,
)
from agent.app import CgsAgentApp
from agent.final_summary import CgsFinalSummaryFallbackBuilder
from agent.preflight import PreflightConfigRunner
from agent.result_codec import DEFAULT_RESULT_CODEC
from agent.transport.chat_completions import default_llm_diagnostics
from agent.transport.mcp_client import make_cgs_mcp_client


cgs_router = APIRouter(prefix='/root/cgs')
logger = get_logger()

_CGS_DISCOVERY_FILE_PREFIX = 'cgs-server-'
_CGS_DISCOVERY_FILE_SUFFIX = '.json'
_CGS_DISCOVERY_SCHEMA = 1
_CGS_DISCOVERY_SERVER = 'ComicGUISpider'
_CGS_AVATAR_ALLOWED_HOSTS = {
    'github.com',
    'www.github.com',
    'avatars.githubusercontent.com',
    'user-images.githubusercontent.com',
    'githubusercontent.com',
}
_CGS_PROXY_DIAGNOSTIC_LIMIT = 80
_CGS_HEALTH_TIMEOUT_SECONDS = 1.5
_CGS_ENDPOINT_UNCONFIGURED_MESSAGE = 'CGS service endpoint is not discovered'
_CGS_READY_CHECK_PATHS = {
    '/book-episodes',
    '/conf',
    '/events',
    '/search',
    '/sites',
    '/status',
    '/repair-missing-pages',
    '/submit-books',
    '/work/reset',
}
_cgs_proxy_attempts: deque[dict[str, Any]] = deque(maxlen=_CGS_PROXY_DIAGNOSTIC_LIMIT)
_cgs_proxy_attempts_lock = threading.Lock()
_cgs_proxy_request_counter = count(1)


class CgsStartRequest(BaseModel):
    command: list[str] | None = None
    executable: str | None = None
    args: list[str] = Field(default_factory=list)
    cwd: str | None = None
    structured_events: bool = True


class CgsSearchRequest(BaseModel):
    site: int = Field(ge=0)
    keyword: str = Field(min_length=1)
    page: int = Field(default=1, ge=1)
    session_id: str | None = None
    submit_book_keys: list[str] | None = None


class CgsEpisodeSelectRequest(BaseModel):
    mode: Literal['latest', 'first', 'all']
    num: int = Field(ge=1)


class CgsBookEpisodesRequest(BaseModel):
    session_id: str = Field(min_length=1)
    book_key: str = Field(min_length=1)


class CgsEpisodeSelectionRequest(BaseModel):
    book_key: str = Field(min_length=1)
    episode_keys: list[str] = Field(min_length=1)


class CgsSubmitBooksRequest(BaseModel):
    session_id: str = Field(min_length=1)
    book_keys: list[str] = Field(default_factory=list)
    episode_selections: list[CgsEpisodeSelectionRequest] = Field(default_factory=list)
    episode_select: CgsEpisodeSelectRequest | None = None


class CgsRepairMissingPagesRequest(BaseModel):
    job_id: str | None = None


class CgsConfRequest(BaseModel):
    downloaded_handle: str = Field(min_length=1)
    proxies: list[str] | str | None = None
    sv_path: str = Field(min_length=1)


class CgsAttachBookRequest(BaseModel):
    session_id: str = Field(min_length=1)
    id: str = Field(min_length=1)
    title: str | None = None


class CgsDetachBookRequest(BaseModel):
    session_id: str = Field(min_length=1)
    attach_book_id: str = Field(min_length=1)


CGS_EPISODE_SELECT_CONTRACT_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'properties': {
        'mode': {
            'type': 'string',
            'enum': ['latest', 'first', 'all'],
            'description': 'Manga episode selection mode. Omitted episode_select defaults to first 1.',
        },
        'num': {
            'type': 'integer',
            'minimum': 1,
            'description': 'Number of episodes for latest/first; ignored for all and clamped by CGS.',
        },
    },
    'required': ['mode', 'num'],
    'additionalProperties': False,
}


class CgsServiceProxyError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message

    @property
    def detail(self) -> dict[str, str]:
        return {'code': self.code, 'message': self.message}


@dataclass(frozen=True, slots=True)
class _ServiceEndpoint:
    base_url: str
    token: str = ''
    source: str = 'synced'
    discovery: dict[str, Any] | None = None


class CgsServiceProxy:
    def __init__(self, *, timeout: float = 30.0, transport: httpx.AsyncBaseTransport | None = None):
        self.timeout = timeout
        self.transport = transport

    async def get(self, path: str) -> dict[str, Any]:
        return await self.request('GET', path)

    async def post(self, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self.request('POST', path, json=payload or {})

    async def request(self, method: str, path: str, **kwargs) -> dict[str, Any]:
        endpoints = _service_endpoints()
        attempt_entry: dict[str, Any] = {
            'request_id': next(_cgs_proxy_request_counter),
            'timestamp': _utc_timestamp(),
            'method': method.upper(),
            'path': path,
            'candidates': [_public_endpoint(endpoint) for endpoint in endpoints],
            'health_checks': [],
            'attempts': [],
        }
        started = time.perf_counter()
        if not endpoints:
            exc = CgsServiceProxyError(503, 'unconfigured', _CGS_ENDPOINT_UNCONFIGURED_MESSAGE)
            attempt_entry['result'] = {'ok': False, 'status_code': exc.status_code, **exc.detail}
            attempt_entry['duration_ms'] = _elapsed_ms(started)
            _record_cgs_proxy_attempt(attempt_entry)
            raise exc
        try:
            if path in _CGS_READY_CHECK_PATHS:
                endpoints = await self._ready_endpoints(endpoints, attempt_entry=attempt_entry)
                if not endpoints:
                    exc = CgsServiceProxyError(503, 'unavailable', 'CGS service is unavailable: no healthy endpoint')
                    attempt_entry['result'] = {'ok': False, 'status_code': exc.status_code, **exc.detail}
                    raise exc
            last_exc: CgsServiceProxyError | None = None
            for index, endpoint in enumerate(endpoints):
                attempt_log = _public_endpoint(endpoint)
                attempt_log['started_at'] = _utc_timestamp()
                attempt_entry['attempts'].append(attempt_log)
                try:
                    data = await self._request_once(endpoint, method, path, attempt_log=attempt_log, **kwargs)
                    attempt_entry['result'] = {
                        'ok': True,
                        'status_code': attempt_log.get('status_code', 200),
                    }
                    return data
                except CgsServiceProxyError as exc:
                    last_exc = exc
                    if index == len(endpoints) - 1:
                        attempt_entry['result'] = {'ok': False, 'status_code': exc.status_code, **exc.detail}
                        raise
            if last_exc is not None:
                attempt_entry['result'] = {'ok': False, 'status_code': last_exc.status_code, **last_exc.detail}
                raise last_exc
            exc = CgsServiceProxyError(503, 'unconfigured', _CGS_ENDPOINT_UNCONFIGURED_MESSAGE)
            attempt_entry['result'] = {'ok': False, 'status_code': exc.status_code, **exc.detail}
            raise exc
        finally:
            attempt_entry['duration_ms'] = _elapsed_ms(started)
            _record_cgs_proxy_attempt(attempt_entry)

    async def ready_endpoint(self, purpose: str) -> _ServiceEndpoint:
        endpoints = _service_endpoints()
        attempt_entry: dict[str, Any] = {
            'request_id': next(_cgs_proxy_request_counter),
            'timestamp': _utc_timestamp(),
            'method': 'PROBE',
            'path': purpose,
            'candidates': [_public_endpoint(endpoint) for endpoint in endpoints],
            'health_checks': [],
            'attempts': [],
        }
        started = time.perf_counter()
        try:
            if not endpoints:
                raise CgsServiceProxyError(503, 'unconfigured', _CGS_ENDPOINT_UNCONFIGURED_MESSAGE)
            ready = await self._ready_endpoints(endpoints, attempt_entry=attempt_entry)
            if not ready:
                raise CgsServiceProxyError(503, 'unavailable', 'CGS service is unavailable: no healthy endpoint')
            attempt_entry['result'] = {'ok': True, 'status_code': 200, 'code': 'ok', 'message': 'ready'}
            return ready[0]
        except CgsServiceProxyError as exc:
            attempt_entry['result'] = {'ok': False, 'status_code': exc.status_code, **exc.detail}
            raise
        finally:
            attempt_entry['duration_ms'] = _elapsed_ms(started)
            _record_cgs_proxy_attempt(attempt_entry)

    async def _ready_endpoints(
        self,
        endpoints: tuple[_ServiceEndpoint, ...],
        *,
        attempt_entry: dict[str, Any],
    ) -> tuple[_ServiceEndpoint, ...]:
        ready: list[_ServiceEndpoint] = []
        for endpoint in endpoints:
            attempt_log = _public_endpoint(endpoint)
            attempt_log['started_at'] = _utc_timestamp()
            attempt_entry.setdefault('health_checks', []).append(attempt_log)
            if await self._health_check_once(endpoint, attempt_log=attempt_log):
                ready.append(endpoint)
        return tuple(ready)

    async def _health_check_once(self, endpoint: _ServiceEndpoint, *, attempt_log: dict[str, Any]) -> bool:
        started = time.perf_counter()
        headers = {'Authorization': f'Bearer {endpoint.token}'} if endpoint.token else {}
        try:
            async with httpx.AsyncClient(
                base_url=endpoint.base_url,
                timeout=_CGS_HEALTH_TIMEOUT_SECONDS,
                transport=self.transport,
            ) as client:
                response = await client.get('/health', headers=headers)
        except httpx.TimeoutException as exc:
            _finish_proxy_health_log(attempt_log, started, ok=False, status_code=504, code='timeout', message=str(exc))
            return False
        except httpx.RequestError as exc:
            _finish_proxy_health_log(
                attempt_log, started, ok=False, status_code=503, code='unavailable', message=str(exc)
            )
            return False
        if response.status_code >= 400:
            _finish_proxy_health_log(
                attempt_log,
                started,
                ok=False,
                status_code=response.status_code,
                code='health_failed',
                message=f'health returned HTTP {response.status_code}',
            )
            return False
        try:
            payload = response.json()
        except ValueError as exc:
            _finish_proxy_health_log(
                attempt_log, started, ok=False, status_code=502, code='invalid_health', message=str(exc)
            )
            return False
        server_ok = isinstance(payload, dict) and payload.get('server') == _CGS_DISCOVERY_SERVER
        auth_ok = not (payload.get('authenticated') is True and payload.get('authorized') is not True)
        ok = bool(server_ok and auth_ok)
        _finish_proxy_health_log(
            attempt_log,
            started,
            ok=ok,
            status_code=response.status_code if ok else 503,
            code='ok' if ok else 'invalid_health',
            message='ok' if ok else 'health payload did not match CGS Server',
        )
        return ok

    async def _request_once(
        self,
        endpoint: _ServiceEndpoint,
        method: str,
        path: str,
        *,
        attempt_log: dict[str, Any] | None = None,
        **kwargs,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        headers = dict(kwargs.pop('headers', {}) or {})
        if endpoint.token:
            headers['Authorization'] = f'Bearer {endpoint.token}'
        try:
            async with httpx.AsyncClient(
                base_url=endpoint.base_url, timeout=self.timeout, transport=self.transport
            ) as client:
                response = await client.request(method, path, headers=headers, **kwargs)
        except httpx.ConnectError as exc:
            _finish_proxy_attempt_log(
                attempt_log, started, status_code=503, code='unavailable', message=f'CGS service is unavailable: {exc}'
            )
            raise CgsServiceProxyError(503, 'unavailable', f'CGS service is unavailable: {exc}') from exc
        except httpx.TimeoutException as exc:
            _finish_proxy_attempt_log(
                attempt_log, started, status_code=504, code='timeout', message=f'CGS service request timed out: {exc}'
            )
            raise CgsServiceProxyError(504, 'timeout', f'CGS service request timed out: {exc}') from exc
        except httpx.RequestError as exc:
            _finish_proxy_attempt_log(
                attempt_log,
                started,
                status_code=502,
                code='upstream_failed',
                message=f'CGS service request failed: {exc}',
            )
            raise CgsServiceProxyError(502, 'upstream_failed', f'CGS service request failed: {exc}') from exc
        if response.status_code >= 400:
            exc = _upstream_http_error(response)
            _finish_proxy_attempt_log(
                attempt_log, started, status_code=response.status_code, code=exc.code, message=exc.message
            )
            raise exc
        try:
            data = response.json()
        except ValueError as exc:
            _finish_proxy_attempt_log(
                attempt_log,
                started,
                status_code=502,
                code='invalid_response',
                message='CGS service returned invalid JSON',
            )
            raise CgsServiceProxyError(502, 'invalid_response', 'CGS service returned invalid JSON') from exc
        if not isinstance(data, dict):
            _finish_proxy_attempt_log(
                attempt_log,
                started,
                status_code=502,
                code='invalid_response',
                message='CGS service response must be an object',
            )
            raise CgsServiceProxyError(502, 'invalid_response', 'CGS service response must be an object')
        _finish_proxy_attempt_log(attempt_log, started, status_code=response.status_code, code='ok', message='ok')
        return data


def _service_base_url() -> str:
    _reload_config()
    endpoint = _preferred_service_endpoint()
    return endpoint.base_url if endpoint is not None else ''


def _service_token() -> str:
    _reload_config()
    endpoint = _preferred_service_endpoint()
    return endpoint.token if endpoint is not None else ''


def _reload_config() -> None:
    if backend.config.is_writable():
        backend.config.reload()


def _service_endpoints() -> tuple[_ServiceEndpoint, ...]:
    _reload_config()
    endpoints: list[_ServiceEndpoint] = []
    seen: set[tuple[str, str]] = set()
    for discovery in _discovered_service_endpoints():
        _append_endpoint(endpoints, seen, discovery)
    if configured := _configured_service_endpoint():
        _append_endpoint(endpoints, seen, configured)
    return tuple(endpoints)


def _append_endpoint(endpoints: list[_ServiceEndpoint], seen: set[tuple[str, str]], endpoint: _ServiceEndpoint) -> None:
    key = (endpoint.base_url, endpoint.token)
    if key in seen:
        return
    endpoints.append(endpoint)
    seen.add(key)


def _preferred_service_endpoint() -> _ServiceEndpoint | None:
    endpoints = _service_endpoints()
    return endpoints[0] if endpoints else None


def _configured_service_endpoint() -> _ServiceEndpoint | None:
    base_url = str(
        backend.config.get('cgs_server_base_url') or ''
    ).strip().rstrip('/')
    if not base_url:
        return None
    return _ServiceEndpoint(
        base_url=base_url,
        token=str(backend.config.get('cgs_server_token') or '').strip(),
        source='synced',
    )


def _discovered_service_endpoints() -> tuple[_ServiceEndpoint, ...]:
    runtime_dir = _service_runtime_dir()
    if runtime_dir is None or not runtime_dir.exists():
        return ()
    paths = sorted(
        runtime_dir.glob(f'{_CGS_DISCOVERY_FILE_PREFIX}*{_CGS_DISCOVERY_FILE_SUFFIX}'),
        key=lambda path: path.stat().st_mtime_ns if path.exists() else 0,
        reverse=True,
    )
    endpoints: list[_ServiceEndpoint] = []
    for path in paths:
        record = _read_discovery_record(path)
        if record is not None:
            endpoints.append(record)
    return tuple(endpoints)


def _service_runtime_dir() -> Path | None:
    runtime_dir = backend.config.get('cgs_server_runtime_dir')
    if not runtime_dir:
        return None
    return Path(str(runtime_dir))


def _read_discovery_record(path: Path) -> _ServiceEndpoint | None:
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    if not isinstance(payload, dict):
        return None
    if payload.get('schema') != _CGS_DISCOVERY_SCHEMA or payload.get('server') != _CGS_DISCOVERY_SERVER:
        return None
    base_url = str(payload.get('connect_url') or '').strip().rstrip('/')
    token = str(payload.get('token') or '').strip()
    if not base_url:
        return None
    discovery = {
        key: payload.get(key)
        for key in ('instance_id', 'pid', 'version', 'created_at', 'bind_host', 'port', 'health_url', 'surfaces')
        if key in payload
    }
    return _ServiceEndpoint(base_url=base_url, token=token, source='discovery', discovery=discovery)


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds')


def _elapsed_ms(started: float) -> int:
    return max(0, int(round((time.perf_counter() - started) * 1000)))


def _public_endpoint(endpoint: _ServiceEndpoint) -> dict[str, Any]:
    payload: dict[str, Any] = {
        'source': endpoint.source,
        'base_url': endpoint.base_url,
        'token_present': bool(endpoint.token),
    }
    if endpoint.discovery:
        payload['discovery'] = dict(endpoint.discovery)
    return payload


def _finish_proxy_attempt_log(
    attempt_log: dict[str, Any] | None,
    started: float,
    *,
    status_code: int,
    code: str,
    message: str,
) -> None:
    if attempt_log is None:
        return
    attempt_log.update(
        {
            'duration_ms': _elapsed_ms(started),
            'status_code': status_code,
            'code': code,
            'message': message,
            'ok': 200 <= status_code < 400 and code == 'ok',
        }
    )


def _finish_proxy_health_log(
    attempt_log: dict[str, Any],
    started: float,
    *,
    ok: bool,
    status_code: int,
    code: str,
    message: str,
) -> None:
    attempt_log['health'] = {
        'ok': bool(ok),
        'duration_ms': _elapsed_ms(started),
        'status_code': int(status_code),
        'code': code,
        'message': message,
    }


def _record_cgs_proxy_attempt(entry: dict[str, Any]) -> None:
    with _cgs_proxy_attempts_lock:
        _cgs_proxy_attempts.append(dict(entry))


def _cgs_proxy_diagnostics() -> dict[str, Any]:
    endpoints = _service_endpoints()
    with _cgs_proxy_attempts_lock:
        attempts = list(_cgs_proxy_attempts)
    return {
        'configured': bool(endpoints),
        'candidates': [_public_endpoint(endpoint) for endpoint in endpoints],
        'attempts': attempts,
    }


def _clear_cgs_proxy_diagnostics() -> None:
    with _cgs_proxy_attempts_lock:
        _cgs_proxy_attempts.clear()


def _status_from_unconfigured() -> dict[str, Any]:
    return {
        'status': 'unconfigured',
        'configured': False,
        'available': False,
        'reason': _CGS_ENDPOINT_UNCONFIGURED_MESSAGE,
        'executable': None,
        'memory_persistent': True,
        'job': None,
    }


def _unsupported_start_response() -> dict[str, Any]:
    return {
        'success': False,
        'status': 'deprecated',
        'code': 'unsupported_start',
        'message': 'redViewer no longer starts CGS. Start cgs-service through the dedicated launcher/watchdog.',
    }


def _upstream_http_error(response: httpx.Response) -> CgsServiceProxyError:
    code = 'upstream_failed'
    message = f'CGS service returned HTTP {response.status_code}'
    try:
        payload = response.json()
    except ValueError:
        payload = None
    detail = payload.get('detail') if isinstance(payload, dict) else None
    if isinstance(detail, dict):
        code = str(detail.get('code') or code)
        message = str(detail.get('message') or message)
    elif isinstance(payload, dict):
        code = str(payload.get('code') or code)
        message = str(payload.get('message') or payload.get('error') or message)
    elif isinstance(detail, str):
        message = detail
    return CgsServiceProxyError(response.status_code, code, message)


def _require_secret(x_secret: Optional[str]) -> None:
    if is_auth_required() and not verify_secret(x_secret or ''):
        raise HTTPException(401, '鉴权失败')


def _normalize_cgs_cover_url(base_url: str, value: str) -> str:
    if not base_url:
        raise HTTPException(503, {'code': 'unconfigured', 'message': _CGS_ENDPOINT_UNCONFIGURED_MESSAGE})
    raw = str(value or '').strip()
    if not raw:
        raise HTTPException(400, {'code': 'invalid_cover_url', 'message': 'cover URL is required'})
    raw = urljoin(f'{base_url}/', raw)
    parts = urlsplit(raw)
    if parts.scheme not in {'http', 'https'} or not parts.netloc:
        raise HTTPException(400, {'code': 'invalid_cover_url', 'message': 'cover URL must be an HTTP URL'})
    base_parts = urlsplit(base_url)
    if parts.scheme != base_parts.scheme or parts.netloc != base_parts.netloc or not parts.path.startswith('/cover/'):
        raise HTTPException(400, {'code': 'invalid_cover_url', 'message': 'cover URL must be a CGS static cover URL'})
    return raw


def _normalize_cgs_avatar_url(value: str) -> str:
    raw = str(value or '').strip()
    if not raw:
        raise HTTPException(400, {'code': 'invalid_avatar_url', 'message': 'avatar URL is required'})
    parts = urlsplit(raw)
    host = parts.netloc.split('@')[-1].split(':', 1)[0].lower()
    if parts.scheme not in {'http', 'https'} or not parts.netloc:
        raise HTTPException(400, {'code': 'invalid_avatar_url', 'message': 'avatar URL must be an HTTP URL'})
    if host not in _CGS_AVATAR_ALLOWED_HOSTS:
        raise HTTPException(400, {'code': 'invalid_avatar_url', 'message': 'avatar URL must be a GitHub image URL'})
    return raw


def _raise_proxy_error(exc: CgsServiceProxyError) -> None:
    raise HTTPException(exc.status_code, exc.detail) from exc


class AttachedBookRequestResolver:
    def __init__(self, store: AttachedBookStore, req: CgsMcpChatRequest) -> None:
        self._store = store
        self._req = req

    def resolve(self) -> CgsMcpChatRequest:
        attach_book_ids = self.attach_book_ids()
        if not attach_book_ids:
            return self._req.model_copy(update={
                'book_context': None,
                'attached_book_list': [],
            })
        return AttachedBookLibraryResolver.current(self._store).resolve_chat_request(self._req, attach_book_ids)

    def attach_book_ids(self) -> list[str]:
        raw_attach_ids = self._req.attach_book_ids or ([self._req.attach_book_id] if self._req.attach_book_id else [])
        return list(dict.fromkeys(
            clean_id
            for attach_book_id in raw_attach_ids
            if (clean_id := str(attach_book_id or '').strip())
        ))


class AttachedBookLibraryResolver:
    def __init__(
        self,
        *,
        store: AttachedBookStore,
        cache: Any,
        meta_map: dict[str, Any],
        books: list[dict[str, Any]],
    ) -> None:
        self._store = store
        self._cache = cache
        self._meta_map = meta_map
        self._books = books

    @classmethod
    def current(cls, store: AttachedBookStore) -> 'AttachedBookLibraryResolver':
        cache = lib_mgr.active_cache
        if not cache:
            raise HTTPException(503, {'code': 'library_unavailable', 'message': 'library is not loaded'})
        meta_map = resolve_book_meta_map(cache.backend)
        items = sorted(cache.books_index.values(), key=lambda row: row.mtime, reverse=True)
        return cls(
            store=store,
            cache=cache,
            meta_map=meta_map,
            books=library_books(items, 'time_desc', meta_map),
        )

    def book_by_id(self, book_id: str) -> Any:
        for item in self._cache.books_index.values():
            if item_id(item.book, item.ep or '') == book_id:
                return item
        for row in self._books:
            if str(row.get('id') or '') == book_id:
                return row
        raise HTTPException(404, {'code': 'attach_book_not_found', 'message': 'book not found in current library'})

    def book_context(self, book: str, *, book_id: str | None = None) -> BookContext:
        meta = resolve_book_meta(book, self._meta_map)
        if book_id is not None:
            book_row = next((row for row in self._books if str(row.get('id') or '') == book_id), None)
        else:
            book_row = next((row for row in self._books if str(row.get('book') or '') == book), None)
        if book_row is None:
            raise HTTPException(404, {'code': 'attach_book_not_found', 'message': 'book not found in current library'})
        return BookContext(
            book=book,
            title=book_row.get('title') or meta.get('title'),
            artist=meta.get('artist'),
            source=meta.get('source'),
            tags=meta.get('tags') or [],
            btype=meta.get('btype'),
            category=meta.get('category'),
            type=meta.get('type'),
            local_library=local_library_projection(book_row),
        )

    def resolve_attached_contexts(self, attach_book_ids: list[str]) -> list[AttachedBookContext]:
        attached: list[AttachedBookContext] = []
        for attach_book_id in attach_book_ids:
            record = self._store.get(attach_book_id)
            if record is None:
                raise HTTPException(409, {'code': 'attach_book_invalid', 'message': '附加书籍已失效，请重新附加当前书。'})
            try:
                book_context = self.book_context(record.book, book_id=record.book_id)
            except HTTPException as exc:
                self._store.remove(attach_book_id)
                raise HTTPException(
                    409,
                    {'code': 'attach_book_invalid', 'message': '附加书籍已失效，请重新附加当前书。'},
                ) from exc
            attached.append(AttachedBookContext(
                attach_book_id=record.attach_book_id,
                book_id=record.book_id,
                book=record.book,
                title=record.title,
                source=book_context.source,
                book_context=book_context,
            ))
        return attached

    def resolve_chat_request(self, req: CgsMcpChatRequest, attach_book_ids: list[str]) -> CgsMcpChatRequest:
        try:
            attached_book_list = self.resolve_attached_contexts(attach_book_ids)
        except HTTPException as exc:
            raise HTTPException(
                409,
                {'code': 'attach_book_invalid', 'message': '附加书籍已失效，请重新附加当前书。'},
            ) from exc
        return req.model_copy(update={
            'book_context': attached_book_list[0].book_context if attached_book_list else None,
            'attached_book_list': attached_book_list,
        })

    def create_attachment(self, req: CgsAttachBookRequest) -> dict[str, str]:
        item = self.book_by_id(req.id)
        book = item.book if hasattr(item, 'book') else str(item.get('book') or '')
        title = req.title or (item.book if hasattr(item, 'book') else str(item.get('title') or book))
        record = self._store.create(book_id=req.id, book=book, title=title)
        return {
            'attach_book_id': record.attach_book_id,
            'title': record.title or book,
            'book': book,
        }


def _validate_book_episodes_response(data: dict[str, Any]) -> dict[str, Any]:
    book_key = data.get('book_key')
    episodes = data.get('episodes')
    if not isinstance(book_key, str) or not book_key:
        raise HTTPException(502, {'code': 'invalid_response', 'message': 'CGS book-episodes response must include book_key'})
    if not isinstance(episodes, list) or any(not isinstance(episode, dict) for episode in episodes):
        raise HTTPException(502, {'code': 'invalid_response', 'message': 'CGS book-episodes response episodes must be a list'})
    for episode in episodes:
        episode_key = episode.get('episode_key')
        name = episode.get('name')
        if not isinstance(episode_key, str) or not episode_key or 'idx' not in episode or not isinstance(name, str):
            raise HTTPException(
                502,
                {
                    'code': 'invalid_response',
                    'message': 'CGS book-episodes items must include episode_key, idx, and name',
                },
            )
    return data


cgs_service = CgsServiceProxy()
cgs_cover_transport: httpx.AsyncBaseTransport | None = None
cgs_llm_transport: httpx.AsyncBaseTransport | None = None
cgs_mcp_client_factory = None


def _sse_event(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False, default=DEFAULT_RESULT_CODEC.json_default)
    return f'event: {event}\ndata: {payload}\n\n'


def _mcp_failure_final_payload(message: str, final_summary: Any, error_payload: dict[str, Any]) -> dict[str, Any]:
    payload = {
        'success': False,
        'summary': message,
        'final_summary': final_summary.model_dump(mode='json'),
        'schema_version': 1,
    }
    for key in ('class', 'fields', 'request_id', 'status_code', 'code'):
        if key in error_payload:
            payload[key] = error_payload[key]
    return payload


async def _mcp_endpoint() -> _ServiceEndpoint:
    return await cgs_service.ready_endpoint('/mcp')


async def cgs_mcp_chat_events(req: CgsMcpChatRequest) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Thin route adapter: resolve the MCP endpoint, read the transport hooks
    (test-injection surface stays on this module), and delegate the turn to the
    agent loop. Prompt strings and the tool-calling cycle live in
    :mod:`backend.agent`, not here."""
    resolved_req = AttachedBookRequestResolver(attached_book_store, req).resolve()
    endpoint = await _mcp_endpoint()
    # R6 preflight: honor clear config intent (proxy / output handle) via the
    # existing /conf proxy before the agent turn. Non-config prompts skip this
    # entirely (no /conf calls).
    preflight = PreflightConfigRunner(
        resolved_req.prompt,
        get_conf=lambda: cgs_service.get('/conf'),
        post_conf=lambda payload: cgs_service.post('/conf', payload),
    )
    async for event, payload in preflight.run():
        yield event, payload
        if event == 'final' and not payload.get('success', True):
            return  # preflight failed -> stop, do not continue with stale settings
    client_factory = cgs_mcp_client_factory
    make_client = lambda ep: make_cgs_mcp_client(ep, client_factory)

    async def read_cgs_progress() -> tuple[Any, Any]:
        status = await cgs_service.get('/status')
        events = await cgs_service.get('/events')
        return status, events

    app = CgsAgentApp(
        endpoint=endpoint,
        make_client=make_client,
        llm_transport=cgs_llm_transport,
        progress_reader=read_cgs_progress,
    )
    async for event, payload in app.stream_turn(resolved_req):
        yield event, payload


@cgs_router.get('/')
async def cgs_availability():
    return await cgs_status()


@cgs_router.post('/start')
async def start_cgs(req: CgsStartRequest, x_secret: Optional[str] = Header(None)):
    return _unsupported_start_response()


@cgs_router.get('/status')
async def cgs_status():
    try:
        return await cgs_service.get('/status')
    except CgsServiceProxyError as exc:
        if exc.code in {'unconfigured', 'unavailable', 'timeout'}:
            return {
                'status': 'unavailable' if exc.code != 'unconfigured' else 'unconfigured',
                'configured': exc.code != 'unconfigured',
                'available': False,
                'reason': exc.message,
                'executable': None,
                'memory_persistent': True,
                'job': None,
            }
        _raise_proxy_error(exc)


@cgs_router.get('/events')
async def cgs_events():
    try:
        return await cgs_service.get('/events')
    except CgsServiceProxyError as exc:
        if exc.code == 'unconfigured':
            return {'job_id': None, 'events': [], 'logs': []}
        _raise_proxy_error(exc)


@cgs_router.get('/diagnostics')
async def cgs_diagnostics():
    return _cgs_proxy_diagnostics()


@cgs_router.get('/llm/diagnostics')
async def cgs_llm_diagnostics(limit: int = Query(default=40, ge=1, le=80)):
    return default_llm_diagnostics.snapshot(limit)


@cgs_router.post('/work/reset')
async def cgs_reset_work_state():
    try:
        return await cgs_service.post('/work/reset')
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)


@cgs_router.post('/mcp/attach-book')
async def cgs_mcp_attach_book(req: CgsAttachBookRequest, x_secret: Optional[str] = Header(None)):
    _require_secret(x_secret)
    return AttachedBookLibraryResolver.current(attached_book_store).create_attachment(req)


@cgs_router.post('/mcp/detach-book')
async def cgs_mcp_detach_book(req: CgsDetachBookRequest, x_secret: Optional[str] = Header(None)):
    _require_secret(x_secret)
    attached_book_store.detach(req.attach_book_id)
    return {'detached': True}


@cgs_router.get('/sites')
async def cgs_sites():
    try:
        data = await cgs_service.get('/sites')
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)
    sites = data.get('sites')
    if not isinstance(sites, list) or any(not isinstance(site, dict) for site in sites):
        raise HTTPException(502, {'code': 'invalid_response', 'message': 'CGS sites response must be a list'})
    return {'sites': sites}


@cgs_router.get('/conf')
async def cgs_conf():
    try:
        return await cgs_service.get('/conf')
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)


@cgs_router.post('/conf')
async def update_cgs_conf(req: CgsConfRequest, x_secret: Optional[str] = Header(None)):
    _require_secret(x_secret)
    try:
        return await cgs_service.post(
            '/conf',
            {
                'downloaded_handle': req.downloaded_handle,
                'proxies': req.proxies,
                'sv_path': req.sv_path,
            },
        )
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)


@cgs_router.get('/cover')
async def cgs_cover(url: str = Query(min_length=1)):
    endpoints = _service_endpoints()
    if not endpoints:
        raise HTTPException(503, {'code': 'unconfigured', 'message': _CGS_ENDPOINT_UNCONFIGURED_MESSAGE})
    last_error: HTTPException | None = None
    for index, endpoint in enumerate(endpoints):
        target_url = _normalize_cgs_cover_url(endpoint.base_url, url)
        headers = {}
        if endpoint.token:
            headers['Authorization'] = f'Bearer {endpoint.token}'
        try:
            async with httpx.AsyncClient(
                timeout=15.0,
                follow_redirects=False,
                transport=cgs_cover_transport,
            ) as client:
                response = await client.get(target_url, headers=headers)
        except httpx.TimeoutException as exc:
            last_error = HTTPException(
                504,
                {'code': 'cover_timeout', 'message': f'CGS cover request timed out: {exc}'},
            )
        except httpx.RequestError as exc:
            last_error = HTTPException(
                502,
                {'code': 'cover_fetch_failed', 'message': f'CGS cover request failed: {exc}'},
            )
        else:
            if response.status_code >= 400:
                last_error = HTTPException(
                    502,
                    {'code': 'cover_fetch_failed', 'message': f'CGS cover returned HTTP {response.status_code}'},
                )
            elif 300 <= response.status_code < 400:
                last_error = HTTPException(
                    502,
                    {'code': 'cover_redirect_unsupported', 'message': 'CGS cover redirect is not supported'},
                )
            else:
                content_type = response.headers.get('content-type', '').split(';', 1)[0].strip().lower()
                if not content_type.startswith('image/'):
                    last_error = HTTPException(
                        502,
                        {'code': 'invalid_cover_response', 'message': 'CGS cover response must be an image'},
                    )
                else:
                    return Response(
                        content=response.content,
                        media_type=content_type,
                        headers={'Cache-Control': 'public, max-age=3600'},
                    )
        if index == len(endpoints) - 1:
            raise last_error
    raise HTTPException(503, {'code': 'unconfigured', 'message': _CGS_ENDPOINT_UNCONFIGURED_MESSAGE})


@cgs_router.post('/search')
async def cgs_search(req: CgsSearchRequest, x_secret: Optional[str] = Header(None)):
    try:
        submit_job: dict[str, Any] | None = None
        if req.submit_book_keys:
            _require_secret(x_secret)
            if not req.session_id:
                raise HTTPException(
                    400,
                    {
                        'code': 'missing_session',
                        'message': 'session_id is required when submitting selected books',
                    },
                )
            submit_data = await cgs_service.post(
                '/submit-books', {'session_id': req.session_id, 'book_keys': req.submit_book_keys}
            )
            submit_job = submit_data.get('job')
        data = await cgs_service.post('/search', {'site': req.site, 'keyword': req.keyword, 'page': req.page})
        if submit_job is not None:
            data = {**data, 'submit_job': submit_job}
        return data
    except HTTPException:
        raise
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)


@cgs_router.post('/book-episodes')
async def cgs_book_episodes(req: CgsBookEpisodesRequest):
    try:
        data = await cgs_service.post('/book-episodes', {'session_id': req.session_id, 'book_key': req.book_key})
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)
    return _validate_book_episodes_response(data)


@cgs_router.get('/avatar')
async def cgs_avatar(url: str = Query(min_length=1)):
    target_url = _normalize_cgs_avatar_url(url)
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, transport=cgs_cover_transport) as client:
            response = await client.get(target_url)
    except httpx.TimeoutException as exc:
        raise HTTPException(504, {'code': 'avatar_timeout', 'message': f'CGS avatar request timed out: {exc}'}) from exc
    except httpx.RequestError as exc:
        raise HTTPException(502, {'code': 'avatar_fetch_failed', 'message': f'CGS avatar request failed: {exc}'}) from exc

    if response.status_code >= 400:
        raise HTTPException(
            502,
            {'code': 'avatar_fetch_failed', 'message': f'CGS avatar returned HTTP {response.status_code}'},
        )

    content_type = response.headers.get('content-type', '').split(';', 1)[0].strip().lower()
    if not content_type.startswith('image/'):
        raise HTTPException(502, {'code': 'invalid_avatar_response', 'message': 'CGS avatar response must be an image'})

    return Response(
        content=response.content,
        media_type=content_type,
        headers={'Cache-Control': 'public, max-age=86400'},
    )


@cgs_router.post('/submit-books')
async def cgs_submit_books(req: CgsSubmitBooksRequest, x_secret: Optional[str] = Header(None)):
    _require_secret(x_secret)
    if not req.book_keys and not req.episode_selections:
        raise HTTPException(
            422,
            {
                'code': 'invalid_payload',
                'message': 'book_keys or episode_selections must not be empty',
            },
        )
    payload: dict[str, Any] = {'session_id': req.session_id, 'book_keys': req.book_keys}
    if req.episode_selections:
        payload['episode_selections'] = [selection.model_dump() for selection in req.episode_selections]
    if req.episode_select is not None:
        payload['episode_select'] = req.episode_select.model_dump()
    try:
        data = await cgs_service.post('/submit-books', payload)
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)
    return {'success': bool(data.get('submitted', True)), 'job': data.get('job') or data}


@cgs_router.post('/repair-missing-pages')
async def cgs_repair_missing_pages(req: CgsRepairMissingPagesRequest, x_secret: Optional[str] = Header(None)):
    _require_secret(x_secret)
    payload: dict[str, Any] = {}
    if req.job_id is not None:
        payload['job_id'] = req.job_id
    try:
        data = await cgs_service.post('/repair-missing-pages', payload)
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)
    return {
        'success': bool(data.get('submitted', True)),
        'job_id': data.get('job_id'),
        'job': data.get('job') or data,
        'repairs': data.get('repairs') or [],
    }


@cgs_router.get('/mcp/status')
async def cgs_mcp_status():
    try:
        endpoint = await _mcp_endpoint()
        async with make_cgs_mcp_client(endpoint, cgs_mcp_client_factory) as client:
            tools = await client.list_tools()
    except CgsServiceProxyError as exc:
        _raise_proxy_error(exc)
    except Exception as exc:
        message = ExceptionCauseChain(exc).message()
        logger.error(f'CGS MCP status probe failed: {message}')
        raise HTTPException(503, {'code': 'mcp_unavailable', 'message': message}) from exc
    return {
        'status': 'online',
        'available': True,
        'tools': [tool['name'] for tool in tools],
    }


@cgs_router.post('/mcp/chat')
async def cgs_mcp_chat(req: CgsMcpChatRequest, x_secret: Optional[str] = Header(None)):
    _require_secret(x_secret)

    async def stream() -> AsyncIterator[str]:
        try:
            async for event, payload in cgs_mcp_chat_events(req):
                yield _sse_event(event, payload)
        except HTTPException as exc:
            payload = McpChatErrorPayload(exc.detail).payload()
            payload.setdefault('status_code', exc.status_code)
            yield _sse_event('error', payload)
            final_summary = CgsFinalSummaryFallbackBuilder(
                status_result={'status': 'failed', 'message': payload['message']},
                events_result=None,
                llm_summary=str(payload['message']),
                success=False,
            ).build()
            yield _sse_event('final', _mcp_failure_final_payload(payload['message'], final_summary, payload))
        except CgsServiceProxyError as exc:
            payload = McpChatErrorPayload({'code': exc.code, 'message': exc.message}).payload()
            yield _sse_event('error', payload)
            final_summary = CgsFinalSummaryFallbackBuilder(
                status_result={'status': 'failed', 'message': exc.message},
                events_result=None,
                llm_summary=exc.message,
                success=False,
            ).build()
            yield _sse_event('final', _mcp_failure_final_payload(exc.message, final_summary, payload))
        except Exception as exc:
            exception_payload = CgsChatExceptionPayload(exc)
            message = exception_payload.message()
            payload = exception_payload.payload()
            logger.error(f'CGS MCP chat failed: {message}')
            yield _sse_event('error', payload)
            final_summary = CgsFinalSummaryFallbackBuilder(
                status_result={'status': 'failed', 'message': message},
                events_result=None,
                llm_summary=message,
                success=False,
            ).build()
            yield _sse_event('final', _mcp_failure_final_payload(message, final_summary, payload))

    return StreamingResponse(
        stream(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )
