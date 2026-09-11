"""Builds the guardrail pipeline for one chat request (guardrails carry per-request state)."""

import uuid
from collections.abc import Callable

from app.config import Settings
from app.llm.router import LLMRouter
from app.services.guardrails import Guardrail, GuardrailPipeline
from app.services.moderation import ModerationGuardrail

PipelineFactory = Callable[..., GuardrailPipeline]


def make_pipeline_factory(settings: Settings, router: LLMRouter) -> PipelineFactory:
    def make(
        *, billed_user_id: uuid.UUID | None, persona_version_id: uuid.UUID | None
    ) -> GuardrailPipeline:
        guardrails: list[Guardrail] = []
        if settings.moderation_enabled:
            guardrails.append(
                ModerationGuardrail(
                    router, billed_user_id=billed_user_id, persona_version_id=persona_version_id
                )
            )
        # M4b: LeakCheckGuardrail(version private examples) goes here.
        return GuardrailPipeline(guardrails)

    return make
