"""Context strategies: turn a compiled persona version + question into model messages.

Hard rule 3: when `is_owner` is False only public examples or synthetic rewrites may appear.
"""

import json
from typing import Protocol

from app.llm.providers import Message
from app.models import Example, PersonaVersion
from app.prompts.loader import load_prompt, render_examples


def visible_examples(version: PersonaVersion, *, allow_private: bool) -> list[Example]:
    if allow_private:
        return list(version.examples)
    return [e for e in version.examples if not e.is_private or e.synthetic_of is not None]


def fixed_examples(version: PersonaVersion, *, allow_private: bool) -> list[Example]:
    by_id = {e.id: e for e in visible_examples(version, allow_private=allow_private)}
    return [by_id[i] for i in version.fixed_example_ids if i in by_id]


class ContextStrategy(Protocol):
    name: str

    def build(
        self,
        version: PersonaVersion,
        question: str,
        history: list[Message],
        *,
        is_owner: bool,
    ) -> list[Message]: ...


class SimpleStrategy:
    """Style card + fixed example set. One cached system prompt per version."""

    name = "simple"

    def system_prompt(self, version: PersonaVersion, *, is_owner: bool) -> str:
        examples = fixed_examples(version, allow_private=is_owner)
        return load_prompt("runtime").render(
            display_name=version.display_name,
            style_card_json=json.dumps(version.style_card or {}, ensure_ascii=False, indent=1),
            rules=version.rules or "(none)",
            fixed_examples=render_examples([(e.question, e.answer, e.shape) for e in examples]),
            dynamic_examples="",
            knowledge="",
        )

    def build(
        self,
        version: PersonaVersion,
        question: str,
        history: list[Message],
        *,
        is_owner: bool,
    ) -> list[Message]:
        system = self.system_prompt(version, is_owner=is_owner)
        return [
            {"role": "system", "content": system},
            *history,
            {"role": "user", "content": question},
        ]


def strategy_for(mode: str) -> ContextStrategy:
    # Like Me arrives in M5 (FEATURE_LIKE_ME); until then every mode uses Simple.
    return SimpleStrategy()
