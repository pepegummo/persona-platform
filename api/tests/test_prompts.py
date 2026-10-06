import pytest

from app.prompts.loader import load_prompt, render_examples, render_kv


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


def test_render_kv_escapes_and_handles_empty() -> None:
    assert render_kv({}) == "(none)"
    out = render_kv({"ราศี": "กันย์", "tag": "<b> & co"})
    assert out == "- ราศี: กันย์\n- tag: &lt;b&gt; &amp; co"


def test_runtime_prompt_has_profile_and_vocabulary_blocks() -> None:
    p = load_prompt("runtime")
    assert p.version == 2
    out = p.render(
        display_name="พี่บอส",
        style_card_json="{}",
        rules="(none)",
        profile="- ราศี: กันย์",
        vocabulary="- ปัง: ดีมาก",
        fixed_examples="",
        dynamic_examples="",
        knowledge="",
    )
    assert "<profile>" in out and "- ราศี: กันย์" in out
    assert "<vocabulary>" in out and "- ปัง: ดีมาก" in out


def test_unknown_prompt() -> None:
    with pytest.raises(FileNotFoundError):
        load_prompt("does_not_exist")
