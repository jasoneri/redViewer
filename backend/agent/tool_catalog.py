"""MCP tool catalog and metadata cache handling for the CGS agent."""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

from agent.metadata_cache import default_metadata_cache
from agent.prompt_templates import prompt_system_message
from agent.result_codec import DEFAULT_RESULT_CODEC
from agent.transport.mcp_tools import McpToolDescriptions

REQUIRED_MCP_TOOLS = frozenset({'cgs_reset_work_state'})
DEFAULT_HIDDEN_TOOL_NAMES = frozenset({'cgs_reset_work_state', 'cgs_list_sites'})


class OpenAiToolSet:
    def __init__(self, tools: Any) -> None:
        self._tools = tools

    def names(self) -> set[str]:
        if not isinstance(self._tools, list):
            return set()
        return {name for tool in self._tools if (name := self.name(tool))}

    def without(self, excluded_names: set[str]) -> list[dict[str, Any]]:
        if not isinstance(self._tools, list):
            return []
        return [
            tool
            for tool in self._tools
            if self.name(tool) not in excluded_names
        ]

    def all(self) -> list[dict[str, Any]]:
        return list(self._tools) if isinstance(self._tools, list) else []

    def name(self, tool: Any) -> str:
        if not isinstance(tool, dict):
            return ''
        function = tool.get('function')
        if not isinstance(function, dict):
            return ''
        return str(function.get('name') or '').strip()


class McpToolCatalog:
    def __init__(
        self,
        *,
        openai_tools: list[dict[str, Any]],
        tool_names: set[str],
        llm_tools: list[dict[str, Any]],
        llm_tool_names: set[str],
        cached_sites: Any | None,
        required_tool_names: frozenset[str] = REQUIRED_MCP_TOOLS,
        hidden_tool_names: frozenset[str] = DEFAULT_HIDDEN_TOOL_NAMES,
    ) -> None:
        self._openai_tools = list(openai_tools)
        self._tool_names = set(tool_names)
        self._llm_tools = list(llm_tools)
        self._llm_tool_names = set(llm_tool_names)
        self._cached_sites = cached_sites
        self._required_tool_names = required_tool_names
        self._hidden_tool_names = hidden_tool_names

    @property
    def tool_names(self) -> set[str]:
        return set(self._tool_names)

    @property
    def llm_tools(self) -> list[dict[str, Any]]:
        return list(self._llm_tools)

    @property
    def llm_tool_names(self) -> set[str]:
        return set(self._llm_tool_names)

    def require_required_tools(self) -> None:
        missing = self._required_tool_names - self._tool_names
        if not missing:
            return
        if 'cgs_reset_work_state' in missing:
            raise HTTPException(
                502,
                {
                    'code': 'mcp_reset_unavailable',
                    'message': 'CGS MCP surface does not expose cgs_reset_work_state',
                },
            )
        raise HTTPException(
            502,
            {
                'code': 'mcp_required_tool_unavailable',
                'message': f'CGS MCP surface does not expose required tools: {", ".join(sorted(missing))}',
            },
        )

    def cached_sites_context_message(self) -> dict[str, Any] | None:
        if self._cached_sites is None:
            return None
        cached_sites = CachedSitesPromptPayload(self._cached_sites).as_payload()
        return prompt_system_message(
            'cached_sites.md',
            cached_sites_json=json.dumps(cached_sites, ensure_ascii=False, separators=(',', ':'), default=str),
        )


class CachedSitesPromptPayload:
    def __init__(self, value: Any) -> None:
        self._value = value

    def as_payload(self) -> dict[str, Any]:
        sites = self._sites()
        if sites is None:
            return {'sites': []}
        return {'sites': self._compact_site_rows(sites)}

    def _sites(self) -> list[Any] | None:
        structured_sites = self._sites_from_structured_content()
        if structured_sites is not None:
            return structured_sites
        text_sites = self._sites_from_text_content()
        if text_sites is not None:
            return text_sites
        if isinstance(self._value, dict):
            raw_sites = self._value.get('sites')
            if isinstance(raw_sites, list):
                return raw_sites
        return None

    def _sites_from_structured_content(self) -> list[Any] | None:
        if not isinstance(self._value, dict):
            return None
        structured = self._value.get('structuredContent')
        if isinstance(structured, dict) and isinstance(structured.get('sites'), list):
            return structured['sites']
        return None

    def _sites_from_text_content(self) -> list[Any] | None:
        if not isinstance(self._value, dict):
            return None
        content = self._value.get('content')
        if not isinstance(content, list):
            return None
        for block in content:
            if not isinstance(block, dict) or block.get('type') != 'text':
                continue
            try:
                parsed = json.loads(str(block.get('text') or ''))
            except (TypeError, ValueError):
                continue
            if isinstance(parsed, dict) and isinstance(parsed.get('sites'), list):
                return parsed['sites']
        return None

    def _compact_site_rows(self, sites: list[Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for site in sites:
            if not isinstance(site, dict):
                continue
            row: dict[str, Any] = {}
            for key in ('site_index', 'spider_name'):
                value = site.get(key)
                if value is not None:
                    row[key] = value
            if row:
                rows.append(row)
        return rows


class McpToolInventory:
    def __init__(
        self,
        client: Any,
        endpoint_base_url: str,
        required_tool_names: frozenset[str] = REQUIRED_MCP_TOOLS,
    ) -> None:
        self._client = client
        self._endpoint_base_url = endpoint_base_url
        self._required_tool_names = required_tool_names

    async def load(self) -> OpenAiToolSet:
        cached_tools = default_metadata_cache.get('tools', self._endpoint_base_url) if self._endpoint_base_url else None
        cached_tool_names = OpenAiToolSet(cached_tools).names()
        if isinstance(cached_tools, list) and self._required_tool_names.issubset(cached_tool_names):
            return OpenAiToolSet(cached_tools)
        if cached_tools is not None and self._endpoint_base_url:
            default_metadata_cache.invalidate('tools', self._endpoint_base_url)

        tools = await self._client.list_tools()
        openai_tools = McpToolDescriptions(tools).openai_tools()
        if self._endpoint_base_url:
            default_metadata_cache.set('tools', self._endpoint_base_url, openai_tools)
        return OpenAiToolSet(openai_tools)


class CachedSitesContextLoader:
    def __init__(self, client: Any, endpoint_base_url: str, tool_names: set[str]) -> None:
        self._client = client
        self._endpoint_base_url = endpoint_base_url
        self._tool_names = set(tool_names)

    async def load(self) -> Any | None:
        if not self._endpoint_base_url or 'cgs_list_sites' not in self._tool_names:
            return None
        cached_sites = default_metadata_cache.get('sites', self._endpoint_base_url)
        if cached_sites is not None:
            return cached_sites
        result = await self._client.call_tool('cgs_list_sites', {})
        if DEFAULT_RESULT_CODEC.is_error(result):
            return None
        default_metadata_cache.set('sites', self._endpoint_base_url, result)
        return result


class McpToolCatalogLoader:
    def __init__(
        self,
        client: Any,
        endpoint_base_url: str,
        required_tool_names: frozenset[str] = REQUIRED_MCP_TOOLS,
        hidden_tool_names: frozenset[str] = DEFAULT_HIDDEN_TOOL_NAMES,
    ) -> None:
        self._client = client
        self._endpoint_base_url = endpoint_base_url
        self._required_tool_names = required_tool_names
        self._hidden_tool_names = hidden_tool_names

    async def load(self) -> McpToolCatalog:
        tool_set = await McpToolInventory(
            self._client,
            self._endpoint_base_url,
            self._required_tool_names,
        ).load()
        tool_names = tool_set.names()
        cached_sites = await CachedSitesContextLoader(
            self._client,
            self._endpoint_base_url,
            tool_names,
        ).load()
        llm_tools = tool_set.without(set(self._hidden_tool_names))
        return McpToolCatalog(
            openai_tools=tool_set.all(),
            tool_names=tool_names,
            llm_tools=llm_tools,
            llm_tool_names=OpenAiToolSet(llm_tools).names(),
            cached_sites=cached_sites,
            required_tool_names=self._required_tool_names,
            hidden_tool_names=self._hidden_tool_names,
        )
