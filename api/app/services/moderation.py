"""Moderation guardrail (M4a): LLM classifier on the cheap model via the router.

Input: every visitor/owner message before any model call.
Output: every `output_every_n_chunks` chunk windows plus the final text, to bound cost.
Fails closed — if the classifier is unavailable the message is blocked and logged.
"""

import logging
import uuid

from pydantic import BaseModel

from app.llm.router import CallContext, LLMRouter, Task
from app.prompts.loader import load_prompt
from app.services.guardrails import Verdict

log = logging.getLogger(__name__)

REASON = "moderation"


class ModerationResult(BaseModel):
    safe: bool
    category: str | None = None


class ModerationGuardrail:
    name = "moderation"

    def __init__(
        self,
        router: LLMRouter,
        *,
        billed_user_id: uuid.UUID | None = None,
        persona_version_id: uuid.UUID | None = None,
        output_every_n_chunks: int = 3,
    ) -> None:
        self.router = router
        self.ctx = CallContext(
            task=Task.moderation,
            billed_user_id=billed_user_id,
            persona_version_id=persona_version_id,
        )
        self.output_every_n_chunks = output_every_n_chunks
        self._chunks_seen = 0

    async def _classify(self, text: str, role: str) -> Verdict:
        prompt = load_prompt("moderation").render(role=role, text=text)
        try:
            result = await self.router.complete_json(
                self.ctx, [{"role": "user", "content": prompt}], ModerationResult, max_tokens=64
            )
        except Exception:
            log.exception("moderation: classifier failed; blocking (fail closed)")
            return Verdict.block(REASON)
        if result.safe:
            return Verdict.pass_()
        log.info("moderation: blocked %s message (%s)", role, result.category)
        return Verdict.block(REASON)

    async def check_input(self, text: str) -> Verdict:
        return await self._classify(text, "user")

    async def check_output(self, window: str, *, final: bool) -> Verdict:
        if not final:
            self._chunks_seen += 1
            if self._chunks_seen % self.output_every_n_chunks:
                return Verdict.pass_()
        return await self._classify(window, "assistant")
