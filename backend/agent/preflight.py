"""Preflight CGS config orchestration (R6).

CGS MCP exposes no config-mutation tool, so config intent is honored on the
redViewer side via the existing ``/root/cgs/conf`` proxy (CGS ``/conf``) before
the agent turn runs. Only clear, value-bearing intents fire; everything else
is left to the existing config drawer. Extraction is intentionally conservative
so non-config prompts pay zero cost (no ``/conf`` calls).

Supported MVP intents (PRD R6 / Q4) are explicit commands only:
- output/download handle ``cbz``: ``换cbz`` / ``保存成 cbz`` / ``download as cbz``
- proxy: ``用代理 <url>`` / ``proxy=<url>`` (http(s) URL or host:port)

``sv_path`` / ``downloaded_handle`` free-text values are not parsed from prompt
in the MVP — the drawer owns those — so a preflight GET merges the change onto
the current config and POSTs the full ``/conf`` shape.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, AsyncIterator, Awaitable, Callable

from agent.contract import (
    CGS_MCP_ERR_CGS_RUNTIME,
    LlmErrorDetail,
)
from agent.final_summary import CgsFinalSummaryFallbackBuilder

_PROXY_VALUE_PATTERN = r'(https?://[^\s，,。]+|[\w.\-]+:\d{2,5})'
_PROXY_VALUE_RE = re.compile(_PROXY_VALUE_PATTERN)

_CBZ_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r'/config\s+(?:downloaded_handle|download|handle)\s*=\s*cbz\b',
        r'(?:换|用|输出|保存|下载)\s*(?:成|为)?\s*cbz\b',
        r'(?:改成|改为|设为|设成|设置为|设置成)\s*cbz\b',
        r'\b(?:use|set|save|download|export|output)(?:\s+as)?\s+cbz\b',
        r'\bdownloaded_handle\s*=\s*cbz\b',
    )
)
_PROXY_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        rf'/config\s+(?:proxy|proxies)\s*=\s*(?P<value>{_PROXY_VALUE_PATTERN})',
        rf'(?:用|换|改|设置|设|配置)\s*代理(?:为|成|到|:|：)?\s*(?P<value>{_PROXY_VALUE_PATTERN})',
        rf'代理(?:改|换|设置|设为|改为)?(?:为|成|到|:|：)?\s*(?P<value>{_PROXY_VALUE_PATTERN})',
        rf'\b(?:use|set|change|configure)\s+(?:the\s+)?proxy(?:\s+(?:to|as))?\s*(?P<value>{_PROXY_VALUE_PATTERN})',
        rf'\bproxy\s*=\s*(?P<value>{_PROXY_VALUE_PATTERN})',
    )
)
_NEGATION_RE = re.compile(
    r'(?:不要|别|别再|不用|无需|不需要|不是(?:要)?|别给我|not\s+|do\s+not\s+|don\'t\s+|no\s+need\s+to\s+)',
    re.IGNORECASE,
)
_NON_COMMAND_RE = re.compile(
    r'(?:如果|假如|是否|会怎样|是什么|怎么|如何|\?|？|\bwhat\s+if\b|\bhow\b)',
    re.IGNORECASE,
)


@dataclass(frozen=True)
class PreflightConfigIntent:
    prompt: str

    def changes(self) -> dict[str, Any] | None:
        text = self.text
        if not text:
            return None
        changes: dict[str, Any] = {}
        if any(
            self.is_clear_command_match(text, match)
            for pattern in _CBZ_PATTERNS
            for match in pattern.finditer(text)
        ):
            changes['downloaded_handle'] = 'cbz'
        for pattern in _PROXY_PATTERNS:
            for match in pattern.finditer(text):
                if self.is_clear_command_match(text, match):
                    value = match.groupdict().get('value')
                    if value and _PROXY_VALUE_RE.fullmatch(value):
                        changes['proxies'] = [value]
                        break
            if 'proxies' in changes:
                break
        return changes or None

    @property
    def text(self) -> str:
        return (self.prompt or '').strip()

    def is_clear_command_match(self, text: str, match: re.Match[str]) -> bool:
        return not self.is_negated_near(text, match) and not self.looks_non_command(text, match)

    def is_negated_near(self, text: str, match: re.Match[str], *, window: int = 8) -> bool:
        prefix = text[max(0, match.start() - window):match.start()]
        return prefix.endswith('不') or bool(_NEGATION_RE.search(prefix))

    def looks_non_command(self, text: str, match: re.Match[str], *, window: int = 18) -> bool:
        local = text[max(0, match.start() - window):min(len(text), match.end() + window)]
        return bool(_NON_COMMAND_RE.search(local))


class PreflightConfigRunner:
    def __init__(
        self,
        prompt: str,
        *,
        get_conf: Callable[[], Awaitable[dict[str, Any]]],
        post_conf: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]],
    ) -> None:
        self._changes = PreflightConfigIntent(prompt).changes()
        self._get_conf = get_conf
        self._post_conf = post_conf

    async def run(self) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        """Apply config changes before the agent turn; yield timeline events."""
        if not self._changes:
            return
        try:
            current = await self._get_conf()
        except Exception as exc:  # propagated as a structured repair, not swallowed
            yield 'error', LlmErrorDetail(CGS_MCP_ERR_CGS_RUNTIME, f'preflight /conf 读取失败: {exc}', []).payload()
            yield 'final', self.failure_payload('preflight 配置读取失败')
            return
        if not isinstance(current, dict):
            current = {}
        merged: dict[str, Any] = {
            'downloaded_handle': current.get('downloaded_handle') or '',
            'proxies': current.get('proxies'),
            'sv_path': current.get('sv_path') or '',
        }
        merged.update(self._changes)
        try:
            await self._post_conf(merged)
        except Exception as exc:
            yield 'error', LlmErrorDetail(CGS_MCP_ERR_CGS_RUNTIME, f'preflight /conf 写入失败: {exc}', []).payload()
            yield 'final', self.failure_payload('preflight 配置写入失败')
            return
        yield 'preflight', {'config': self._changes}

    def failure_payload(self, message: str) -> dict[str, Any]:
        final_summary = CgsFinalSummaryFallbackBuilder(
            status_result={'status': 'failed', 'message': message},
            events_result=None,
            llm_summary=message,
            success=False,
        ).build()
        return {
            'success': False,
            'summary': message,
            'final_summary': final_summary.model_dump(mode='json'),
            'schema_version': 1,
        }
