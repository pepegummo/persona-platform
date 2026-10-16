"""Provider helpers: reasoning-text stripping, Groq reasoning params, error classification.
No network."""

import pytest
from litellm.exceptions import BadRequestError, NotFoundError, RateLimitError
from litellm.types.utils import ModelResponse
from litellm.types.utils import Usage as LiteLLMUsage

from app.llm.providers import LiteLLMProvider, ThinkStripper, strip_think


def stream_strip(deltas: list[str]) -> str:
    s = ThinkStripper()
    return "".join(s.feed(d) for d in deltas) + s.flush()


def test_strip_think_removes_reasoning() -> None:
    assert strip_think("<think>คิดก่อนนะ</think>\n\nสวัสดีครับ") == "สวัสดีครับ"
    assert strip_think('{"safe": true}') == '{"safe": true}'
    assert strip_think("<think>cut off by max_tokens") == ""


@pytest.mark.parametrize(
    "deltas",
    [
        ["<think>reasoning</think>\n\nสวัสดีครับ hello"],
        ["<thi", "nk>reason", "ing</th", "ink>", "\n", "\nสวัสดี", "ครับ hello"],
        ["<", "t", "h", "i", "n", "k", ">", "x", "<", "/", "think>", "สวัสดีครับ hello"],
    ],
)
def test_stream_stripper_handles_tags_split_across_deltas(deltas: list[str]) -> None:
    assert stream_strip(deltas) == "สวัสดีครับ hello"


def test_stream_stripper_passes_plain_text_through() -> None:
    text = "ใช้ a < b แล้วก็ <b>bold</b> ได้นะ — สรุป: โอเค"
    assert stream_strip([text[i : i + 3] for i in range(0, len(text), 3)]) == text


def test_stream_stripper_drops_unclosed_reasoning() -> None:
    assert stream_strip(["คำตอบ ", "<think>never closed"]) == "คำตอบ "


def test_reasoning_off_only_for_groq_reasoning_models() -> None:
    p = LiteLLMProvider()
    assert p._extra_params("groq/qwen/qwen3.8-27b") == {
        "extra_body": {"reasoning_effort": "none", "reasoning_format": "hidden"}
    }
    assert p._extra_params("groq/llama-3.3-70b-versatile") == {}
    assert p._extra_params("gemini/gemini-3.5-flash-lite") == {}


def test_bad_request_skips_fallback_but_retired_model_does_not() -> None:
    p = LiteLLMProvider()
    bad = p._wrap(BadRequestError("bad", model="m", llm_provider="groq"))
    assert not bad.retryable and not bad.fallback
    gone = p._wrap(NotFoundError("model_not_found", model="m", llm_provider="gemini"))
    assert not gone.retryable and gone.fallback
    limited = p._wrap(RateLimitError("429", model="m", llm_provider="gemini"))
    assert limited.retryable and limited.fallback


def test_missing_price_warns_once(caplog: pytest.LogCaptureFixture) -> None:
    p = LiteLLMProvider()
    msgs = [{"role": "user", "content": "สวัสดี"}]
    for _ in range(2):
        usage = p.estimate_usage(model="groq/no-such-model", messages=msgs, text="hello")
        assert usage.cost_usd == 0.0 and usage.input_tokens > 0
    assert sum("no LiteLLM price" in r.message for r in caplog.records) == 1


def test_cost_uses_routed_model_when_response_lacks_provider_prefix() -> None:
    # Groq reports "qwen/qwen3.8-27b"; without the routed "groq/..." name LiteLLM finds no price.
    response = ModelResponse(
        model="qwen/qwen3.8-27b",
        usage=LiteLLMUsage(prompt_tokens=1000, completion_tokens=1000, total_tokens=2000),
    )
    usage = LiteLLMProvider()._usage(response, "groq/qwen/qwen3.8-27b")
    assert usage.cost_usd > 0
    assert usage.input_tokens == 1000 and usage.output_tokens == 1000
