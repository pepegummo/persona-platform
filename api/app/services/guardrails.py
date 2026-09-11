"""Guardrail interface (hard rule 4): every answer passes guardrails before it is streamed out
and stored.

- `check_input` runs on the visitor's message before any model call.
- `check_output` runs on a sliding window of the streamed answer every `chunk_size` characters
  and once more on the full text at the end. If any check fails the stream stops and the caller
  stores the message with `blocked_reason`.

M3 ships the pipeline with no guardrails. M4a adds moderation, M4b the private-example leak check.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

WINDOW_CHARS = 400  # text kept for chunk checks
CHUNK_CHARS = 200  # run checks every N new characters

BLOCKED_INPUT_MESSAGE = (
    "ขอโทษนะ ตอบข้อความนี้ไม่ได้ ลองถามเรื่องอื่นดูนะ / "
    "Sorry, I can't respond to that. Try asking something else."
)
BLOCKED_OUTPUT_MESSAGE = (
    "ขอโทษนะ คำตอบนี้ถูกระงับไว้ ลองถามใหม่อีกครั้งนะ / Sorry, that answer was withheld. Please try again."
)


@dataclass(frozen=True)
class Verdict:
    ok: bool
    reason: str | None = None  # 'moderation' | 'leak' | ...

    @staticmethod
    def pass_() -> "Verdict":
        return Verdict(ok=True)

    @staticmethod
    def block(reason: str) -> "Verdict":
        return Verdict(ok=False, reason=reason)


class Guardrail(Protocol):
    name: str

    async def check_input(self, text: str) -> Verdict: ...

    async def check_output(self, window: str, *, final: bool) -> Verdict: ...


@dataclass
class StreamOutcome:
    text: str
    blocked_reason: str | None = None


class GuardrailPipeline:
    def __init__(self, guardrails: list[Guardrail] | None = None) -> None:
        self.guardrails = guardrails or []

    async def check_input(self, text: str) -> Verdict:
        for g in self.guardrails:
            verdict = await g.check_input(text)
            if not verdict.ok:
                return verdict
        return Verdict.pass_()

    async def _check_output(self, window: str, final: bool) -> Verdict:
        for g in self.guardrails:
            verdict = await g.check_output(window, final=final)
            if not verdict.ok:
                return verdict
        return Verdict.pass_()

    async def guard_stream(
        self, deltas: AsyncIterator[str], outcome: StreamOutcome
    ) -> AsyncIterator[str]:
        """Re-yield deltas that passed; on a failed check stop early and record the reason.

        `outcome` is filled in as the stream progresses so the caller can persist the result
        after the generator finishes.
        """
        pending = ""
        since_check = 0
        async for delta in deltas:
            pending += delta
            since_check += len(delta)
            if self.guardrails and since_check >= CHUNK_CHARS:
                window = (outcome.text + pending)[-WINDOW_CHARS:]
                verdict = await self._check_output(window, final=False)
                if not verdict.ok:
                    outcome.blocked_reason = verdict.reason
                    return
                since_check = 0
            # Release text that has passed the last chunk check.
            if not self.guardrails or since_check == 0:
                outcome.text += pending
                yield pending
                pending = ""
        if self.guardrails:
            verdict = await self._check_output(outcome.text + pending, final=True)
            if not verdict.ok:
                outcome.blocked_reason = verdict.reason
                return
        if pending:
            outcome.text += pending
            yield pending


def build_guardrails(settings: object, router: object) -> list[Guardrail]:
    """Guardrails active for this deployment. M4a adds moderation here."""
    return []
