"""Intent-driven MCP work-state reset policy (R3 / R0.5).

``cgs_reset_work_state`` must run only on a new session or an explicit
reset/new-search intent — never as a blanket per-prompt policy, and never for
config-only preflight or follow-up selection/episode/submit turns.

The classifier is a high-precision rule guard, not a general NLU layer. When
in doubt on an existing session, it keeps the prior candidate/selection state
(no reset), because a redundant reset is the failure R3 exists to fix.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re


class LifecycleIntent(str, Enum):
    NEW_SESSION = 'new_session'      # first turn of a (possibly just-created) session
    RESET = 'reset'                  # explicit reset / new-search intent
    CONFIG_ONLY = 'config_only'      # preflight config mutation, no reset
    FOLLOW_UP = 'follow_up'          # reuse candidate/episode/session state
    EPHEMERAL = 'ephemeral'          # no session_id at all (legacy/one-shot)


# Explicit user intent that means "throw away the current CGS lifecycle and
# start fresh". These rules intentionally cover clear commands only; broader
# natural-language/i18n handling belongs in a structured intent extractor.
_RESET_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r'重新搜', r'重搜', r'换一本', r'换一部', r'从头来', r'从头开始', r'清空',
        r'新任务', r'重新开始', r'重来', r'重新找', r'\bnew\s+(?:search|task)\b',
        r'\bstart\s+over\b', r'\breset\b',
    )
)

# Preflight config mutation intent (Phase D orchestrates the actual mutation;
# here it only suppresses reset so the lifecycle is not wiped).
_CONFIG_TOKENS = (
    '用代理', '换代理', '代理改', '改代理', '换cbz', '用cbz', 'cbz', '保存路径',
    '下载路径', '输出路径', 'save', 'downloaded',
)

# Follow-up intent that reuses the active lifecycle.
_FOLLOWUP_TOKENS = (
    '第二', '第三', '第n', '最新', '前两', '前三', '前一', '第一话', '前两话',
    '就这个', '就这本', '提交', '继续', '刚才', '那本', '这本', '全部', '所有',
)

_NEGATION_RE = re.compile(
    r'(?:不要|别|别再|不用|无需|不需要|不是(?:要)?|别给我|not\s+|do\s+not\s+|don\'t\s+|no\s+need\s+to\s+)',
    re.IGNORECASE,
)


@dataclass(frozen=True)
class TurnResetPolicy:
    prompt: str
    is_new_session: bool
    is_ephemeral: bool

    def decision(self) -> tuple[LifecycleIntent, bool]:
        """Return lifecycle intent plus whether MCP work state should reset."""
        if self.is_ephemeral:
            return LifecycleIntent.EPHEMERAL, True
        if self.is_new_session:
            return LifecycleIntent.NEW_SESSION, True
        intent = self.classify_intent()
        if intent == LifecycleIntent.RESET:
            return intent, True
        return intent, False

    def classify_intent(self) -> LifecycleIntent:
        text = self.text
        if self.has_clear_reset_intent():
            return LifecycleIntent.RESET
        if any(tok in text for tok in _FOLLOWUP_TOKENS):
            return LifecycleIntent.FOLLOW_UP
        if any(tok in text for tok in _CONFIG_TOKENS):
            return LifecycleIntent.CONFIG_ONLY
        return LifecycleIntent.FOLLOW_UP

    @property
    def text(self) -> str:
        return (self.prompt or '').strip()

    def has_clear_reset_intent(self) -> bool:
        text = self.text
        return any(
            not self.is_negated_near(text, match)
            for pattern in _RESET_PATTERNS
            for match in pattern.finditer(text)
        )

    def is_negated_near(self, text: str, match: re.Match[str], *, window: int = 8) -> bool:
        prefix = text[max(0, match.start() - window):match.start()]
        return prefix.endswith('不') or bool(_NEGATION_RE.search(prefix))
