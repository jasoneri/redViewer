"""MCP tool description owners for OpenAI function-calling schemas."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class McpToolDescription:
    tool: Any

    def normalized(self) -> dict[str, Any]:
        name = str(self.value('name') or '').strip()
        if not name:
            raise ValueError('MCP tool is missing name')
        input_schema = self.value('inputSchema', None)
        if input_schema is None:
            input_schema = self.value('input_schema', None)
        return {
            'name': name,
            'description': str(self.value('description') or ''),
            'inputSchema': self.input_schema(input_schema or {}),
        }

    def openai_tool(self) -> dict[str, Any]:
        normalized = self.normalized()
        return {
            'type': 'function',
            'function': {
                'name': normalized['name'],
                'description': normalized['description'],
                'parameters': normalized['inputSchema'],
            },
        }

    def value(self, key: str, default: Any = None) -> Any:
        if isinstance(self.tool, dict):
            return self.tool.get(key, default)
        if hasattr(self.tool, key):
            return getattr(self.tool, key)
        alias = ''.join(['_' + char.lower() if char.isupper() else char for char in key]).lstrip('_')
        if hasattr(self.tool, alias):
            return getattr(self.tool, alias)
        return default

    def input_schema(self, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            schema = value
        elif hasattr(value, 'model_dump'):
            schema = value.model_dump(by_alias=True)
        elif hasattr(value, 'dict'):
            schema = value.dict()
        else:
            schema = {}
        if not isinstance(schema, dict) or schema.get('type') != 'object':
            schema = {'type': 'object', 'properties': schema.get('properties', {}) if isinstance(schema, dict) else {}}
        schema.setdefault('properties', {})
        schema.setdefault('additionalProperties', False)
        return schema


@dataclass(frozen=True)
class McpToolDescriptions:
    tools: list[Any]

    def normalized(self) -> list[dict[str, Any]]:
        return [McpToolDescription(tool).normalized() for tool in self.tools]

    def openai_tools(self) -> list[dict[str, Any]]:
        return [McpToolDescription(tool).openai_tool() for tool in self.tools]
