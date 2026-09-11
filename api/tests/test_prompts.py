import pytest

from app.prompts.loader import load_prompt, render_examples


def test_prompts_load_with_versions() -> None:
    for name in ("compiler", "shape_classifier", "runtime"):
        p = load_prompt(name)
        assert p.name == name and p.version >= 1


def test_render_substitutes_and_checks_missing() -> None:
    p = load_prompt("shape_classifier")
    out = p.render(question="Kafka กับ MQTT ต่างกันยังไง")
    assert "Question: Kafka กับ MQTT ต่างกันยังไง" in out
    with pytest.raises(KeyError):
        p.render()


def test_render_examples_escapes_and_tags() -> None:
    out = render_examples([("a < b?", "yes & no", "comparison")], with_id=["7"])
    assert out == (
        '<example id="7" shape="comparison"><question>a &lt; b?</question>'
        "<answer>yes &amp; no</answer></example>"
    )


def test_unknown_prompt() -> None:
    with pytest.raises(FileNotFoundError):
        load_prompt("does_not_exist")
