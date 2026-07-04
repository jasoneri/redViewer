"""Markdown prompt template loading and rendering for CGS agent prompts."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from string import Template
from typing import Any

PROMPTS_DIR = Path(__file__).resolve().parent / 'prompts'


class PromptTemplateStore:
    def __init__(self, prompt_directory: Path = PROMPTS_DIR) -> None:
        self._prompt_directory = prompt_directory

    def render(self, template_name: str, **values: Any) -> str:
        template = Template(self._template_text(template_name))
        string_values = {
            key: '' if value is None else str(value)
            for key, value in values.items()
        }
        return template.substitute(string_values).strip()

    def system_message(self, template_name: str, **values: Any) -> dict[str, Any]:
        return {'role': 'system', 'content': self.render(template_name, **values)}

    def _template_text(self, template_name: str) -> str:
        return _read_template(self._prompt_directory, template_name)


@lru_cache(maxsize=None)
def _read_template(prompt_directory: Path, template_name: str) -> str:
    if Path(template_name).name != template_name:
        raise ValueError(f'Prompt template name must be a file name: {template_name}')
    template_path = prompt_directory / template_name
    return template_path.read_text(encoding='utf-8').strip()


DEFAULT_PROMPT_TEMPLATES = PromptTemplateStore()


def render_prompt(template_name: str, **values: Any) -> str:
    return DEFAULT_PROMPT_TEMPLATES.render(template_name, **values)


def prompt_system_message(template_name: str, **values: Any) -> dict[str, Any]:
    return DEFAULT_PROMPT_TEMPLATES.system_message(template_name, **values)
