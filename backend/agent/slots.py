"""Slot extraction + ask-when-needed gate (R7 / R8).

Stateful prompt-slot owners detect explicit task-chain slots in the user prompt
so the agent loop can inject deterministic "execute, do not ask" directives.
This makes R7 (explicit episode metric runs without a clarification turn) and
the R8 candidate hard-route enforceable from the backend, not just prompt-hoped.

The LLM still owns free-form reasoning; these helpers only surface slots the
prompt already unambiguously provides, so a fully-specified prompt never pays a
redundant clarification turn.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

# Required download-loop slots (R8). Used as the documented contract; the loop
# injects directives for the slots it can detect deterministically.
REQUIRED_SLOTS = (
    'lifecycle_intent',
    'target_source',
    'candidate_selector',
    'book_type',
    'episode_selector',
    'config_preflight',
    'submit_intent',
)

_CN_NUM = {'一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
_CN_NUM_TOKEN = r'[一二两三四五六七八九十](?![一二两三四五六七八九十])'
_NUM_TOKEN = rf'(?:[0-9]+|{_CN_NUM_TOKEN})'

# Episode metric patterns (R7). Order matters: 'all' before numeric.
_EP_ALL_RE = re.compile(r'(全部|所有|所有话|全部话)')
_EP_LATEST_RE = re.compile(rf'最新\s*话?\s*({_NUM_TOKEN})\s*话?')
_EP_FIRST_RE = re.compile(rf'(?:前|从头|第一|前头)\s*({_NUM_TOKEN})?\s*话?|第一话')
_UNSUPPORTED_COMPOUND_EP_RE = re.compile(r'(?:最新\s*话?|前|从头|前头)\s*[一二两三四五六七八九十]{2,}\s*话?')

# Candidate ordinal (R8 hard route step 1).
_ORDINAL_RE = re.compile(rf'第\s*({_NUM_TOKEN})\s*(?:个|本|部)')
_UNSUPPORTED_COMPOUND_ORDINAL_RE = re.compile(r'第\s*[一二两三四五六七八九十]{2,}\s*(?:个|本|部)')
_ORIGINAL_USER_PROMPT_MARKER = '原始用户请求：'


@dataclass(frozen=True)
class SlotValue:
    value: Any
    source: Literal['deterministic', 'llm', 'user']
    confidence: Literal['exact', 'inferred', 'ambiguous']

    def is_exact(self) -> bool:
        return self.confidence == 'exact'


@dataclass(frozen=True)
class ChineseNumberToken:
    token: str

    def to_int(self) -> int | None:
        clean = self.token.strip()
        if clean.isdigit():
            return int(clean)
        return _CN_NUM.get(clean)


@dataclass(frozen=True)
class PromptSlotAnalysis:
    prompt: str

    def episode_metric(self) -> SlotValue | None:
        """Map exact bounded episode metrics to confidence-bearing slots."""
        text = self.text()
        if _UNSUPPORTED_COMPOUND_EP_RE.search(text):
            return None
        if _EP_ALL_RE.search(text):
            return self.exact({'mode': 'all', 'num': 1})
        latest_match = _EP_LATEST_RE.search(text)
        if latest_match and (latest_num := ChineseNumberToken(latest_match.group(1)).to_int()):
            return self.exact({'mode': 'latest', 'num': latest_num})
        first_match = _EP_FIRST_RE.search(text)
        if first_match:
            if '第一话' in text and first_match.group(1) is None:
                return self.exact({'mode': 'first', 'num': 1})
            if first_match.group(1) and (first_num := ChineseNumberToken(first_match.group(1)).to_int()):
                return self.exact({'mode': 'first', 'num': first_num})
            if '第一' in text or '前' in text:
                return self.exact({'mode': 'first', 'num': 1})
        return None

    def candidate_ordinal(self) -> SlotValue | None:
        text = self.text()
        if _UNSUPPORTED_COMPOUND_ORDINAL_RE.search(text):
            return None
        match = _ORDINAL_RE.search(text)
        if not match:
            return None
        ordinal = ChineseNumberToken(match.group(1)).to_int()
        return self.exact(ordinal) if ordinal and ordinal >= 1 else None

    def exact(self, value: Any) -> SlotValue:
        return SlotValue(value=value, source='deterministic', confidence='exact')

    def text(self) -> str:
        text = self.prompt or ''
        if _ORIGINAL_USER_PROMPT_MARKER in text:
            return text.rsplit(_ORIGINAL_USER_PROMPT_MARKER, 1)[1]
        return text


@dataclass(frozen=True)
class CandidateRouteDecision:
    ordinal: SlotValue | None
    candidates: list[dict[str, Any]] | None
    metadata_match: bool = False

    def label(self) -> str:
        if self.ordinal is not None and self.ordinal.is_exact():
            return 'select_ordinal'
        if self.candidates is not None and len(self.candidates) == 1:
            return 'single_safe'
        if self.metadata_match:
            return 'metadata_match'
        if self.candidates:
            return 'ask'
        return 'missing'
