"""Compile a persona version: style card, shape tags, embeddings, fixed examples, hold-outs.

Runs inside the Arq worker (app/workers/compile.py). Status transitions:
draft → compiling (set by the API when enqueuing) → ready | failed.
"""

import asyncio
import hashlib
import json
import logging
import random
import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.llm.router import CallContext, LLMRouter, Task
from app.models import Example, Persona, PersonaVersion
from app.models.example import SHAPES
from app.prompts.loader import load_prompt, render_examples
from app.schemas.style_card import ShapeResult, StyleCard

log = logging.getLogger(__name__)

MAX_FIXED_EXAMPLES = 8
SHAPE_CACHE_TTL = 60 * 60 * 24 * 30


def choose_held_out(example_ids: list[uuid.UUID], seed: str) -> set[uuid.UUID]:
    """20% of examples (min 2, max 10) for eval; none when there are fewer than 5."""
    n = len(example_ids)
    if n < 5:
        return set()
    k = max(2, min(10, round(n * 0.2)))
    rng = random.Random(seed)
    return set(rng.sample(sorted(example_ids, key=str), k))


def choose_fixed_examples(examples: list[Example]) -> list[uuid.UUID]:
    """Up to 8 non-held-out examples covering distinct shapes; public/synthetic first."""
    pool = [e for e in examples if not e.is_held_out]
    pool.sort(key=lambda e: (e.is_private and e.synthetic_of is None, e.created_at))
    by_shape: dict[str, list[Example]] = {}
    for e in pool:
        by_shape.setdefault(e.shape or "other", []).append(e)
    chosen: list[uuid.UUID] = []
    while len(chosen) < MAX_FIXED_EXAMPLES and any(by_shape.values()):
        for shape in list(by_shape):
            bucket = by_shape[shape]
            if bucket and len(chosen) < MAX_FIXED_EXAMPLES:
                chosen.append(bucket.pop(0).id)
    return chosen


def normalize_question(q: str) -> str:
    return " ".join(q.split()).strip().lower()


class Compiler:
    def __init__(
        self, db: AsyncSession, router: LLMRouter, redis: Redis, settings: Settings
    ) -> None:
        self.db = db
        self.router = router
        self.redis = redis
        self.settings = settings

    async def run(self, version_id: uuid.UUID) -> PersonaVersion:
        version = await self.db.scalar(
            select(PersonaVersion)
            .where(PersonaVersion.id == version_id)
            .options(selectinload(PersonaVersion.examples), selectinload(PersonaVersion.persona))
        )
        if version is None:
            raise ValueError(f"version {version_id} not found")
        if version.status != "compiling":
            log.info("compile: version %s is %s, skipping", version_id, version.status)
            return version
        try:
            await self._compile(version)
            version.status = "ready"
            version.compiled_at = datetime.now(UTC)
        except Exception:
            log.exception("compile: version %s failed", version_id)
            version.status = "failed"
        await self.db.commit()
        return version

    async def _compile(self, version: PersonaVersion) -> None:
        persona: Persona = version.persona
        ctx = CallContext(
            task=Task.compile, billed_user_id=persona.owner_id, persona_version_id=version.id
        )
        originals = [e for e in version.examples if e.synthetic_of is None]
        if not originals:
            raise ValueError("cannot compile a version with no examples")

        # 1. hold-outs (deterministic per version so recompiles are stable)
        held = choose_held_out([e.id for e in originals], seed=str(version.id))
        for e in originals:
            e.is_held_out = e.id in held

        # 2. shapes, 3. embeddings — only for examples missing them
        await self._tag_shapes(ctx, [e for e in originals if e.shape is None])
        await self._embed(ctx, [e for e in originals if e.embedding is None])
        await self.db.flush()

        # 4. style card from non-held-out examples
        training = [e for e in originals if not e.is_held_out]
        version.style_card = (await self._style_card(ctx, version, training)).model_dump()

        # 5. fixed examples
        version.fixed_example_ids = choose_fixed_examples(originals)

        # 6/7. synthetic rewrites and eval are Phase 1B (flags off in 1A)
        if self.settings.feature_synth_rewrite:
            log.warning("compile: FEATURE_SYNTH_REWRITE is on but not implemented until M6")
        if self.settings.feature_eval:
            log.warning("compile: FEATURE_EVAL is on but not implemented until M4b")

        version.prompt_versions = {
            "compiler": load_prompt("compiler").version_tag,
            "shape_classifier": load_prompt("shape_classifier").version_tag,
            "embedding_model": self.settings.embedding_model,
        }

    async def _tag_shapes(self, ctx: CallContext, examples: list[Example]) -> None:
        prompt = load_prompt("shape_classifier")
        sem = asyncio.Semaphore(4)
        shape_ctx = CallContext(
            task=Task.shape_classify,
            billed_user_id=ctx.billed_user_id,
            persona_version_id=ctx.persona_version_id,
        )

        async def one(example: Example) -> None:
            key = (
                "shape:" + hashlib.sha256(normalize_question(example.question).encode()).hexdigest()
            )
            cached = await self.redis.get(key)
            if cached in SHAPES:
                example.shape = cached
                return
            async with sem:
                result = await self.router.complete_json(
                    shape_ctx,
                    [{"role": "user", "content": prompt.render(question=example.question)}],
                    ShapeResult,
                    max_tokens=64,
                )
            shape = result.shape if result.shape in SHAPES else "other"
            example.shape = shape
            await self.redis.set(key, shape, ex=SHAPE_CACHE_TTL)

        await asyncio.gather(*(one(e) for e in examples))

    async def _embed(self, ctx: CallContext, examples: list[Example]) -> None:
        if not examples:
            return
        embed_ctx = CallContext(
            task=Task.embed,
            billed_user_id=ctx.billed_user_id,
            persona_version_id=ctx.persona_version_id,
        )
        vectors = await self.router.embed(embed_ctx, [e.question for e in examples])
        for example, vector in zip(examples, vectors, strict=True):
            if len(vector) != self.settings.embedding_dim:
                raise ValueError(
                    f"embedding dim {len(vector)} != EMBEDDING_DIM {self.settings.embedding_dim}"
                )
            example.embedding = vector

    async def _style_card(
        self, ctx: CallContext, version: PersonaVersion, training: list[Example]
    ) -> StyleCard:
        prompt = load_prompt("compiler")
        rendered = prompt.render(
            settings_json=json.dumps(version.settings, ensure_ascii=False),
            rules=version.rules,
            examples=render_examples(
                [(e.question, e.answer, e.shape) for e in training],
                with_id=[str(i + 1) for i in range(len(training))],
            ),
        )
        return await self.router.complete_json(
            ctx,
            [
                {"role": "system", "content": rendered},
                {"role": "user", "content": "Return the JSON."},
            ],
            StyleCard,
            max_tokens=2048,
        )
