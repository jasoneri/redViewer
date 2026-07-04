"""Generic MCP result encoding and stream-merge helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class JsonText:
    value: str

    def parse(self) -> Any | None:
        text = self.value.strip()
        if not text:
            return None
        if not ((text.startswith('{') and text.endswith('}')) or (text.startswith('[') and text.endswith(']'))):
            return None
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return None


@dataclass(frozen=True)
class McpResultCodec:
    summary_limit: int = 260

    def json_default(self, value: Any) -> Any:
        if hasattr(value, 'model_dump'):
            return value.model_dump(by_alias=True)
        if hasattr(value, 'dict'):
            return value.dict()
        return str(value)

    def truncate(self, value: str, limit: int | None = None) -> str:
        max_length = self.summary_limit if limit is None else limit
        text = value.replace('\r', ' ').replace('\n', ' ').strip()
        return text if len(text) <= max_length else f'{text[:max_length - 1]}\u2026'

    def truncate_line(self, value: str, limit: int) -> str:
        return self.truncate(value, limit)

    def content_item(self, item: Any) -> Any:
        if isinstance(item, dict):
            return item
        if hasattr(item, 'model_dump'):
            return item.model_dump(by_alias=True)
        if hasattr(item, 'text'):
            return {'type': 'text', 'text': item.text}
        return str(item)

    def to_jsonable(self, result: Any) -> Any:
        if hasattr(result, 'model_dump'):
            return result.model_dump(by_alias=True)
        if hasattr(result, 'content'):
            return {
                'content': [self.content_item(item) for item in result.content],
                'isError': bool(getattr(result, 'isError', False) or getattr(result, 'is_error', False)),
            }
        return result

    def text_from_result(self, result: Any) -> str:
        if isinstance(result, str):
            return result
        if isinstance(result, dict):
            content = result.get('content')
            if isinstance(content, list):
                parts = []
                for item in content:
                    if isinstance(item, dict) and isinstance(item.get('text'), str):
                        parts.append(item['text'])
                if parts:
                    return '\n'.join(parts)
            return json.dumps(result, ensure_ascii=False, default=self.json_default)
        return json.dumps(result, ensure_ascii=False, default=self.json_default)

    def tool_summary(self, name: str, result: Any) -> dict[str, Any]:
        text = self.text_from_result(result)
        summary: dict[str, Any] = {'text': self.truncate(text)}
        try:
            parsed = json.loads(text)
        except (TypeError, ValueError):
            parsed = result if isinstance(result, dict) else None
        if isinstance(parsed, dict):
            job = parsed.get('job')
            progress = job.get('progress') if isinstance(job, dict) else parsed.get('progress')
            percent = progress.get('percent') if isinstance(progress, dict) else None
            if isinstance(percent, (int, float)):
                summary['percent'] = round(float(percent), 2)
            status = job.get('status') if isinstance(job, dict) else parsed.get('status')
            if isinstance(status, str):
                summary['status'] = status
            for key in ('session_id', 'submitted', 'success'):
                if key in parsed:
                    summary[key] = parsed[key]
            if isinstance(parsed.get('books'), list):
                summary['books'] = len(parsed['books'])
            if isinstance(parsed.get('sites'), list):
                summary['sites'] = len(parsed['sites'])
        summary['tool'] = name
        return summary

    def is_error(self, result: Any) -> bool:
        if isinstance(result, dict):
            return bool(result.get('isError') or result.get('is_error'))
        return bool(getattr(result, 'isError', False) or getattr(result, 'is_error', False))


@dataclass(frozen=True)
class StreamedText:
    value: str = ''

    def merge(self, incoming: str) -> StreamedText:
        if not self.value:
            return StreamedText(incoming)
        if incoming == self.value:
            return self
        if incoming.startswith(self.value):
            return StreamedText(incoming)
        return StreamedText(self.value + incoming)


class ToolCallDeltaAccumulator:
    def __init__(self) -> None:
        self._pending: dict[int, dict[str, Any]] = {}

    def merge(self, tool_call: dict[str, Any]) -> None:
        index = int(tool_call.get('index') or 0)
        current = self._pending.setdefault(index, {'id': '', 'type': 'function', 'function': {'name': '', 'arguments': ''}})
        if tool_call.get('id'):
            current['id'] = tool_call['id']
        if tool_call.get('type'):
            current['type'] = tool_call['type']
        function = tool_call.get('function')
        if isinstance(function, dict):
            target = current['function']
            if function.get('name'):
                target['name'] = StreamedText(target['name']).merge(function['name']).value
            if function.get('arguments'):
                target['arguments'] = StreamedText(target['arguments']).merge(function['arguments']).value

    def pending_snapshot(self) -> dict[int, dict[str, Any]]:
        snapshot: dict[int, dict[str, Any]] = {}
        for index, call in self._pending.items():
            item = dict(call)
            function = item.get('function')
            if isinstance(function, dict):
                item['function'] = dict(function)
            snapshot[index] = item
        return snapshot


DEFAULT_RESULT_CODEC = McpResultCodec()
