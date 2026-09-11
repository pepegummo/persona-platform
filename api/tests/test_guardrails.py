"""Guardrail pipeline: chunked output checks stop the stream; no guardrails = pass-through."""

from collections.abc import AsyncIterator

from app.services.guardrails import GuardrailPipeline, StreamOutcome, Verdict


class BlockWord:
    name = "block_word"

    def __init__(self, word: str) -> None:
        self.word = word
        self.output_checks = 0

    async def check_input(self, text: str) -> Verdict:
        return Verdict.block("moderation") if self.word in text else Verdict.pass_()

    async def check_output(self, window: str, *, final: bool) -> Verdict:
        self.output_checks += 1
        return Verdict.block("leak") if self.word in window else Verdict.pass_()


async def deltas(text: str, size: int = 7) -> AsyncIterator[str]:
    for i in range(0, len(text), size):
        yield text[i : i + size]


async def collect(pipeline: GuardrailPipeline, text: str) -> tuple[str, StreamOutcome]:
    outcome = StreamOutcome(text="")
    out = "".join([d async for d in pipeline.guard_stream(deltas(text), outcome)])
    return out, outcome


async def test_no_guardrails_passes_everything() -> None:
    text = "สวัสดีครับ " * 60
    out, outcome = await collect(GuardrailPipeline(), text)
    assert out == text and outcome.text == text and outcome.blocked_reason is None


async def test_clean_output_passes_with_checks() -> None:
    g = BlockWord("ห้าม")
    text = "ตอบแบบสั้นๆ นะครับ " * 40  # > 200 chars → several chunk checks + final
    out, outcome = await collect(GuardrailPipeline([g]), text)
    assert out == text and outcome.blocked_reason is None
    assert g.output_checks >= 2


async def test_blocked_chunk_stops_stream_early() -> None:
    g = BlockWord("SECRET")
    text = ("ok " * 100) + "SECRET" + (" more" * 100)
    out, outcome = await collect(GuardrailPipeline([g]), text)
    assert outcome.blocked_reason == "leak"
    assert "SECRET" not in out
    assert len(out) < len(text)


async def test_blocked_at_final_check() -> None:
    g = BlockWord("SECRET")
    text = "short answer SECRET"  # never reaches a chunk boundary, caught by the final check
    out, outcome = await collect(GuardrailPipeline([g]), text)
    assert out == "" and outcome.blocked_reason == "leak"


async def test_input_check() -> None:
    p = GuardrailPipeline([BlockWord("bad")])
    assert (await p.check_input("all good")).ok
    assert (await p.check_input("this is bad")).reason == "moderation"
