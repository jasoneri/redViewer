"""Local TTL cache for near-static MCP metadata."""

from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from platformdirs import user_cache_dir

from core.logging import get_logger

logger = get_logger()

DEFAULT_TTL_SECONDS = 7 * 24 * 3600
_SCHEMA_VERSION = 1
_CACHE_DIR_ENV = 'RV_AGENT_METADATA_CACHE_DIR'

MetadataKind = Literal['sites', 'tools']


@dataclass(frozen=True)
class MetadataCacheKey:
    kind: MetadataKind
    base_url: str

    @property
    def value(self) -> str:
        return f'{self.kind}:{self.normalized_base_url}'

    @property
    def normalized_base_url(self) -> str:
        return str(self.base_url or '').strip().rstrip('/').lower()


@dataclass(frozen=True)
class MetadataCacheKeyFilter:
    kind: MetadataKind | None = None
    base_url: str | None = None

    @property
    def normalized_base_url(self) -> str | None:
        if self.base_url is None:
            return None
        return str(self.base_url or '').strip().rstrip('/').lower()

    def matches(self, entry_key: str) -> bool:
        key_kind, _, key_url = entry_key.partition(':')
        normalized = self.normalized_base_url
        return (self.kind is None or key_kind == self.kind) and (normalized is None or key_url == normalized)


@dataclass(frozen=True)
class MetadataCacheDocument:
    path: Path

    def read(self) -> dict[str, Any]:
        try:
            with self.path.open('r', encoding='utf-8') as fh:
                data = json.load(fh)
        except FileNotFoundError:
            return {}
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning(f'metadata cache read failed, degrading to miss: {exc!r} (path={self.path})')
            return {}
        if not isinstance(data, dict):
            logger.warning(
                f'metadata cache root is not an object, degrading to miss: '
                f'{type(data).__name__} (path={self.path})'
            )
            return {}
        return data

    def write(self, data: dict[str, Any]) -> None:
        tmp = self.path.with_suffix('.tmp')
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tmp.open('w', encoding='utf-8') as fh:
                json.dump(data, fh, ensure_ascii=False)
            os.replace(tmp, self.path)
        except OSError as exc:
            logger.warning(f'metadata cache write failed, cache will stay stale: {exc!r} (path={self.path})')
            try:
                tmp.unlink(missing_ok=True)
            except OSError as cleanup_exc:
                logger.debug(f'metadata cache tmp cleanup failed: {cleanup_exc!r} (path={tmp})')


class MetadataCache:
    def __init__(self, *, enabled: bool = True, cache_file_override: Path | None = None) -> None:
        self._enabled = enabled
        self._cache_file_override = cache_file_override
        self._write_lock = threading.RLock()

    def get(self, kind: MetadataKind, base_url: str, *, ttl: float = DEFAULT_TTL_SECONDS) -> Any | None:
        if not self._enabled:
            return None
        key = MetadataCacheKey(kind, base_url)
        entries = self.document().read().get('entries')
        if not isinstance(entries, dict):
            return None
        entry = entries.get(key.value)
        if not isinstance(entry, dict):
            return None
        fetched_at = entry.get('fetched_at')
        if not isinstance(fetched_at, (int, float)) or 'value' not in entry:
            logger.warning(
                f'metadata cache entry malformed, degrading to miss: '
                f'kind={kind} key={key.value} (path={self.cache_file()})'
            )
            return None
        if (time.time() - fetched_at) < ttl:
            return entry['value']
        return None

    def set(self, kind: MetadataKind, base_url: str, value: Any) -> None:
        if not self._enabled:
            return
        with self._write_lock:
            document = self.document()
            data = document.read()
            entries = data.get('entries')
            if not isinstance(entries, dict):
                entries = {}
            entries[MetadataCacheKey(kind, base_url).value] = {'fetched_at': time.time(), 'value': value}
            data['version'] = _SCHEMA_VERSION
            data['entries'] = entries
            document.write(data)

    def invalidate(self, kind: MetadataKind | None = None, base_url: str | None = None) -> None:
        with self._write_lock:
            document = self.document()
            data = document.read()
            entries = data.get('entries')
            if not isinstance(entries, dict):
                entries = {}
            if kind is None and base_url is None:
                entries = {}
            else:
                key_filter = MetadataCacheKeyFilter(kind=kind, base_url=base_url)
                for key in list(entries):
                    if key_filter.matches(key):
                        del entries[key]
            data['version'] = _SCHEMA_VERSION
            data['entries'] = entries
            document.write(data)

    def set_enabled(self, enabled: bool) -> None:
        self._enabled = enabled

    def set_cache_file_for_tests(self, path: Path | None) -> None:
        self._cache_file_override = path

    def cache_file(self) -> Path:
        return self._cache_file_override or self.default_cache_file()

    def default_cache_file(self) -> Path:
        cache_dir = os.getenv(_CACHE_DIR_ENV)
        if cache_dir:
            return Path(cache_dir).expanduser() / 'metadata.json'
        return Path(user_cache_dir('redViewer', appauthor=False)) / 'agent' / 'metadata.json'

    def document(self) -> MetadataCacheDocument:
        return MetadataCacheDocument(self.cache_file())


default_metadata_cache = MetadataCache()
