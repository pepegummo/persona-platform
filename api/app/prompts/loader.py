"""Prompt templates live next to this file as Markdown.

Format: first line `<!-- prompt: <name> v<version> -->`, then the template. Variables are
`{{name}}` and are substituted verbatim (no escaping, no logic). Repeated blocks such as example
lists are rendered in Python (see `render_examples`) and passed in as one variable, which keeps
templates readable in docs/PROMPTS.md and avoids a template engine dependency.
"""

import re
from dataclasses import dataclass
from functools import lru_cache
from html import escape
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent
_HEADER = re.compile(r"^<!--\s*prompt:\s*(?P<name>[\w-]+)\s+v(?P<version>\d+)\s*-->\s*\n")
_VAR = re.compile(r"\{\{(\w+)\}\}")


@dataclass(frozen=True)
class Prompt:
    name: str
    version: int
    template: str

    @property
    def version_tag(self) -> str:
        return f"v{self.version}"

    def render(self, **variables: object) -> str:
        missing = set(_VAR.findall(self.template)) - set(variables)
        if missing:
            raise KeyError(f"prompt {self.name!r} missing variables: {sorted(missing)}")
        return _VAR.sub(lambda m: str(variables[m.group(1)]), self.template).strip() + "\n"


@lru_cache
def load_prompt(name: str) -> Prompt:
    path = PROMPTS_DIR / f"{name}.md"
    text = path.read_text(encoding="utf-8")
    m = _HEADER.match(text)
    if m is None or m.group("name") != name:
        raise ValueError(f"{path.name}: missing or mismatched header '<!-- prompt: {name} vN -->'")
    return Prompt(name=name, version=int(m.group("version")), template=text[m.end() :])


def render_examples(
    examples: list[tuple[str, str, str | None]], *, with_id: list[str] | None = None
) -> str:
    """Render (question, answer, shape) triples as <example> blocks for a prompt."""
    lines = []
    for i, (question, answer, shape) in enumerate(examples):
        attrs = ""
        if with_id is not None:
            attrs += f' id="{with_id[i]}"'
        if shape:
            attrs += f' shape="{shape}"'
        lines.append(
            f"<example{attrs}><question>{escape(question)}</question>"
            f"<answer>{escape(answer)}</answer></example>"
        )
    return "\n".join(lines)


def render_kv(items: dict[str, str]) -> str:
    """Render a key→value map (profile facts, vocabulary) as one `- key: value` line each."""
    if not items:
        return "(none)"
    return "\n".join(f"- {escape(key)}: {escape(value)}" for key, value in items.items())
