"""The only place that calls LLM providers (hard rule 1).

Responsibilities: task → model from settings, timeout, one retry on transient errors, fallback
model, per-creator daily spend cap, and an `llm_calls` row for every attempt.
"""

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import Settings
from app.llm.providers import (
    FakeProvider,
    LiteLLMProvider,
    Message,
    Provider,
    ProviderError,
    StreamEnd,
    Usage,
)
from app.models import LLMCall, User
from app.services.errors import ServiceError

log = logging.getLogger(__name__)


class Task(StrEnum):
    compile = "compile"
    synth_rewrite = "synth_rewrite"
    shape_classify = "shape_classify"
    chat_simple = "chat_simple"
    chat_like_me = "chat_like_me"
    judge = "judge"
    moderation = "moderation"
    embed = "embed"


class SpendCapExceeded(ServiceError):
    status_code = 429

    def __init__(self) -> None:
        super().__init__(
            "This persona has reached its daily usage limit. Please try again tomorrow. / "
            "persona นี้ใช้งานครบโควตาของวันนี้แล้ว ลองใหม่พรุ่งนี้นะ"
        )


class LLMUnavailable(ServiceError):
    status_code = 503

    def __init__(self) -> None:
        super().__init__(
            "The model is temporarily unavailable. Please try again. / "
            "โมเดลไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้งนะ"
        )


@dataclass
class LLMResult:
    text: str
    model: str
    usage: Usage
    latency_ms: int


@dataclass
class CallContext:
    task: Task
    billed_user_id: uuid.UUID | None = None
    persona_version_id: uuid.UUID | None = None


def build_provider(settings: Settings) -> Provider:
    if settings.llm_provider == "fake":
        return FakeProvider(embedding_dim=settings.embedding_dim)
    return LiteLLMProvider()


class LLMRouter:
    def __init__(
        self,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession],
        provider: Provider | None = None,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.provider = provider or build_provider(settings)
        # Bookkeeping queries are tiny; serializing them keeps a single shared connection safe.
        self._db_lock = asyncio.Lock()

    # --- routing ------------------------------------------------------------------------------

    def model_for(self, task: Task) -> str:
        s = self.settings
        table = {
            Task.compile: s.model_compile,
            Task.synth_rewrite: s.model_synth_rewrite,
            Task.shape_classify: s.model_shape_classify,
            Task.chat_simple: s.model_chat_simple,
            Task.chat_like_me: s.model_chat_like_me,
            Task.judge: s.model_judge or s.model_compile,
            Task.moderation: s.model_moderation,
            Task.embed: s.embedding_model,
        }
        return table[task]

    def _candidates(self, task: Task) -> list[str]:
        primary = self.model_for(task)
        fallback = self.settings.model_fallback
        if task == Task.embed or not fallback or fallback == primary:
            return [primary]
        return [primary, fallback]

    def _api_key(self, model: str) -> str | None:
        prefix = model.split("/", 1)[0].lower()
        return {
            "anthropic": self.settings.anthropic_api_key,
            "openai": self.settings.openai_api_key,
            "cohere": self.settings.cohere_api_key,
        }.get(prefix) or None

    # --- spend cap ----------------------------------------------------------------------------

    async def _check_spend_cap(self, billed_user_id: uuid.UUID | None) -> None:
        if billed_user_id is None:
            return
        async with self._db_lock, self.session_factory() as db:
            cap = await db.scalar(select(User.daily_spend_cap_usd).where(User.id == billed_user_id))
            if cap is None:
                return
            spent = await db.scalar(
                select(func.coalesce(func.sum(LLMCall.cost_usd), 0)).where(
                    LLMCall.billed_user_id == billed_user_id,
                    LLMCall.created_at >= func.date_trunc("day", func.now()),
                )
            )
        if Decimal(str(spent or 0)) >= Decimal(str(cap)):
            raise SpendCapExceeded()

    async def _log(
        self,
        ctx: CallContext,
        model: str,
        usage: Usage,
        latency_ms: int,
        error: str | None = None,
    ) -> None:
        try:
            async with self._db_lock, self.session_factory() as db:
                db.add(
                    LLMCall(
                        task=ctx.task.value,
                        model=model,
                        persona_version_id=ctx.persona_version_id,
                        billed_user_id=ctx.billed_user_id,
                        input_tokens=usage.input_tokens,
                        cached_input_tokens=usage.cached_input_tokens,
                        output_tokens=usage.output_tokens,
                        cost_usd=Decimal(str(round(usage.cost_usd, 6))),
                        latency_ms=latency_ms,
                        error=error[:2000] if error else None,
                    )
                )
                await db.commit()
        except Exception:
            log.exception("llm: failed to log call")

    # --- calls --------------------------------------------------------------------------------

    async def complete(
        self,
        ctx: CallContext,
        messages: list[Message],
        *,
        max_tokens: int = 2048,
        json_mode: bool = False,
    ) -> LLMResult:
        await self._check_spend_cap(ctx.billed_user_id)
        last_error: ProviderError | None = None
        for model in self._candidates(ctx.task):
            for attempt in (1, 2):
                started = time.perf_counter()
                try:
                    result = await self.provider.complete(
                        model=model,
                        messages=messages,
                        timeout_s=self.settings.llm_timeout_s,
                        max_tokens=max_tokens,
                        api_key=self._api_key(model),
                        json_mode=json_mode,
                    )
                except ProviderError as e:
                    latency = int((time.perf_counter() - started) * 1000)
                    await self._log(ctx, model, Usage(), latency, error=str(e))
                    last_error = e
                    log.warning("llm %s %s attempt %d failed: %s", ctx.task, model, attempt, e)
                    if not e.retryable:
                        raise LLMUnavailable() from e
                    if attempt == 1:
                        await asyncio.sleep(0.5)
                        continue
                    break  # move to fallback model
                latency = int((time.perf_counter() - started) * 1000)
                await self._log(ctx, model, result.usage, latency)
                return LLMResult(result.text, model, result.usage, latency)
        raise LLMUnavailable() from last_error

    async def complete_json[T: BaseModel](
        self,
        ctx: CallContext,
        messages: list[Message],
        schema: type[T],
        *,
        max_tokens: int = 2048,
    ) -> T:
        """Complete and parse into `schema`; on a parse failure, ask once more with the error."""
        result = await self.complete(ctx, messages, max_tokens=max_tokens, json_mode=True)
        try:
            return schema.model_validate(_extract_json(result.text))
        except (ValueError, ValidationError) as e:
            retry_messages = [
                *messages,
                {"role": "assistant", "content": result.text},
                {
                    "role": "user",
                    "content": f"That was not valid JSON for the schema ({e}). "
                    "Return only the corrected JSON.",
                },
            ]
            result = await self.complete(ctx, retry_messages, max_tokens=max_tokens, json_mode=True)
            return schema.model_validate(_extract_json(result.text))

    async def stream(
        self,
        ctx: CallContext,
        messages: list[Message],
        *,
        max_tokens: int = 1024,
    ) -> AsyncIterator[str]:
        """Yield text deltas. Fallback applies only if the primary fails before any output."""
        await self._check_spend_cap(ctx.billed_user_id)
        last_error: ProviderError | None = None
        for model in self._candidates(ctx.task):
            started = time.perf_counter()
            produced = False
            try:
                async for item in self.provider.stream(
                    model=model,
                    messages=messages,
                    timeout_s=self.settings.llm_timeout_s,
                    max_tokens=max_tokens,
                    api_key=self._api_key(model),
                ):
                    if isinstance(item, StreamEnd):
                        latency = int((time.perf_counter() - started) * 1000)
                        await self._log(ctx, model, item.usage, latency)
                        return
                    produced = True
                    yield item
                return
            except ProviderError as e:
                latency = int((time.perf_counter() - started) * 1000)
                await self._log(ctx, model, Usage(), latency, error=str(e))
                last_error = e
                if produced or not e.retryable:
                    raise LLMUnavailable() from e
        raise LLMUnavailable() from last_error

    async def embed(self, ctx: CallContext, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        await self._check_spend_cap(ctx.billed_user_id)
        model = self.model_for(Task.embed)
        started = time.perf_counter()
        try:
            vectors, usage = await self.provider.embed(
                model=model,
                texts=texts,
                timeout_s=self.settings.llm_timeout_s,
                api_key=self._api_key(model),
            )
        except ProviderError as e:
            latency = int((time.perf_counter() - started) * 1000)
            await self._log(ctx, model, Usage(), latency, error=str(e))
            raise LLMUnavailable() from e
        latency = int((time.perf_counter() - started) * 1000)
        await self._log(ctx, model, usage, latency)
        return vectors


def _extract_json(text: str) -> Any:
    """Parse JSON, tolerating code fences or prose around a single object."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("no JSON object in response") from None
        return json.loads(text[start : end + 1])
