"""rv-agent prompt assembly, markdown-template driven."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from agent.contract import AttachedBookContext, BookContext, CgsMcpPreferencePromptContext
from agent.prompt_templates import prompt_system_message, render_prompt
from agent.slots import PromptSlotAnalysis


@dataclass(frozen=True)
class BookKindClassifier:
    book_context: BookContext

    def kind(self) -> str:
        fields = ' '.join(
            str(v or '').lower()
            for v in (self.book_context.btype, self.book_context.category, self.book_context.type)
        )
        if fields:
            if 'doujin' in fields or '同人' in fields:
                return 'doujinshi'
            if 'manga' in fields or '漫画' in fields or 'episode' in fields or '章节' in fields:
                return 'manga'
        if self.book_context.local_library is not None:
            if self.book_context.local_library.kind == 'series':
                return 'manga'
            if self.book_context.local_library.kind == 'single':
                return 'doujinshi'
        tags = ' '.join(str(t or '').lower() for t in self.book_context.tags)
        if '同人' in tags or 'doujin' in tags:
            return 'doujinshi'
        return 'unknown'


@dataclass(frozen=True)
class BookContextPrompt:
    book_context: BookContext

    def message(self) -> dict[str, Any]:
        payload = {
            'book': self.book_context.book,
            'title': self.book_context.title,
            'artist': self.book_context.artist,
            'source': self.book_context.source,
            'tags': self.book_context.tags,
            'btype': self.book_context.btype,
            'category': self.book_context.category,
            'type': self.book_context.type,
            'kind': BookKindClassifier(self.book_context).kind(),
            'local_library': LocalLibraryPromptSummary(self.book_context).payload(),
        }
        return prompt_system_message(
            'book_context.md',
            book_context_json=json.dumps(payload, ensure_ascii=False, default=str),
        )


@dataclass(frozen=True)
class AttachedBookListPrompt:
    attached_book_list: list[AttachedBookContext]

    def message(self) -> dict[str, Any]:
        books = []
        for index, attached in enumerate(self.attached_book_list, start=1):
            book_context = attached.book_context
            books.append({
                'index': index,
                'attach_book_id': attached.attach_book_id,
                'book_id': attached.book_id,
                'book': attached.book,
                'title': attached.title or book_context.title,
                'artist': book_context.artist,
                'source': attached.source or book_context.source,
                'tags': book_context.tags,
                'kind': BookKindClassifier(book_context).kind(),
                'btype': book_context.btype,
                'category': book_context.category,
                'type': book_context.type,
                'local_library': LocalLibraryPromptSummary(book_context).payload(),
            })
        return prompt_system_message(
            'attached_book_list.md',
            attached_book_list_json=json.dumps(books, ensure_ascii=False, default=str),
        )


@dataclass(frozen=True)
class LocalLibraryPromptSummary:
    book_context: BookContext

    def payload(self) -> dict[str, Any] | None:
        local_library = self.book_context.local_library
        if local_library is None:
            return None
        episodes = [episode.model_dump() for episode in local_library.episodes]
        return {
            'kind': local_library.kind,
            'book': local_library.book,
            'title': local_library.title,
            'episode_count': local_library.episode_count,
            'episodes_tail': episodes[-12:],
            'episodes_omitted': max(len(episodes) - 12, 0),
        }


class PreferencePrompt:
    def __init__(self, preference_context: CgsMcpPreferencePromptContext | None) -> None:
        self._match_preferences = tuple(preference_context.match_preferences) if preference_context else ()
        self._exclude_preferences = tuple(preference_context.exclude_preferences) if preference_context else ()
        self._settings = preference_context.settings if preference_context else None

    def message(self) -> dict[str, Any] | None:
        if not self._match_preferences and not self._exclude_preferences:
            return None
        match_preferences = [item.model_dump(mode='json') for item in self._match_preferences]
        exclude_preferences = [item.model_dump(mode='json') for item in self._exclude_preferences]
        settings = self._settings.model_dump(mode='json') if self._settings is not None else {}
        payload = {
            'schema_version': 1,
            'match_preferences': match_preferences,
            'exclude_preferences': exclude_preferences,
            'settings': settings,
        }
        return prompt_system_message(
            'preference_context.md',
            preference_context_json=json.dumps(payload, ensure_ascii=False, default=str),
        )


@dataclass(frozen=True)
class PromptMessageBuilder:
    prompt: str
    book_context: BookContext | None = None
    preference_context: CgsMcpPreferencePromptContext | None = None
    attached_book_list: list[AttachedBookContext] | None = None

    def build(self) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = [
            prompt_system_message('system.md'),
            {'role': 'user', 'content': self.prompt},
        ]
        if self.attached_book_list and len(self.attached_book_list) > 1:
            messages.insert(1, AttachedBookListPrompt(self.attached_book_list).message())
        elif self.book_context is not None:
            messages.insert(1, BookContextPrompt(self.book_context).message())
        preference_message = PreferencePrompt(self.preference_context).message()
        if preference_message is not None:
            messages.insert(-1, preference_message)
        return messages


@dataclass(frozen=True)
class IntentDirectiveBuilder:
    prompt: str
    candidates: list[dict[str, Any]] | None
    book_context: BookContext | None = None

    def build(self) -> dict[str, Any] | None:
        parts: list[str] = []
        slots = PromptSlotAnalysis(self.prompt)
        metric_slot = slots.episode_metric()
        if metric_slot is not None and metric_slot.is_exact():
            metric = metric_slot.value
            mode_label = {'latest': '最新', 'first': '前', 'all': '全部'}[metric['mode']]
            metric_human = f"{mode_label} {metric['num']} 话" if metric['mode'] != 'all' else '全部'
            parts.append(
                render_prompt(
                    'episode_select.md',
                    metric_human=metric_human,
                    episode_select_json=json.dumps(metric, ensure_ascii=False),
                )
            )

        ordinal_slot = slots.candidate_ordinal()
        if ordinal_slot is not None and ordinal_slot.is_exact() and self.candidates:
            ordinal = ordinal_slot.value
            if 1 <= ordinal <= len(self.candidates):
                candidate = self.candidates[ordinal - 1]
                key = candidate.get('key') if isinstance(candidate, dict) else getattr(candidate, 'key', '')
                parts.append(render_prompt('candidate.md', n=ordinal, key=key))
            else:
                parts.append(
                    render_prompt(
                        'clarification.md',
                        missing=f'候选序号 {ordinal} 超出当前列表范围（共 {len(self.candidates)} 个）',
                    )
                )
        if not parts:
            return None
        return {'role': 'system', 'content': '\n'.join(parts)}
