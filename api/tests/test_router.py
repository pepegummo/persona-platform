"""LLM router: retry, fallback, spend cap, logging, JSON parsing. Requires Postgres."""

import uuid
from decimal import Decimal

import pytest
from fastapi import FastAPI
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.llm.router import CallContext, LLMRouter, LLMUnavailable, SpendCapExceeded, Task
from app.models import LLMCall, User
from tests.llm_stubs import ScriptedProvider, bad_request, ok, rate_limited, timeout

MSG = [{"role": "user", "content": "hi"}]


@pytest.fixture
def router_settings() -> Settings:
    return Settings(
        _env_file=None,
        app_env="test",
        model_chat_simple="anthropic/primary",
        model_fallback="openai/fallback",
        anthropic_api_key="a-key",
        openai_api_key="o-key",
    )


@pytest.fixture
async def user(db: AsyncSession) -> User:
    u = User(clerk_user_id=f"test:{uuid.uuid4()}", display_name="t", daily_spend_cap_usd=1)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest.fixture
def make_router(router_settings: Settings, app: FastAPI, db: AsyncSession) -> object:
    def _make(provider: ScriptedProvider) -> LLMRouter:
        # Session factory bound to the test transaction (see conftest `db`).
        factory = app.state.test_session_factory
        return LLMRouter(router_settings, factory, provider=provider)

    return _make


async def calls(db: AsyncSession) -> list[LLMCall]:
    return list((await db.scalars(select(LLMCall).order_by(LLMCall.created_at))).all())


async def test_success_logs_call(make_router, db: AsyncSession, user: User) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([ok("hello", cost=0.002)])
    router = make_router(provider)
    ctx = CallContext(Task.chat_simple, billed_user_id=user.id)
    result = await router.complete(ctx, MSG)
    assert result.text == "hello" and result.model == "anthropic/primary"
    logged = await calls(db)
    assert len(logged) == 1
    assert logged[0].task == "chat_simple"
    assert logged[0].cost_usd == Decimal("0.002")
    assert logged[0].billed_user_id == user.id


async def test_falls_back_on_429(make_router, db: AsyncSession) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([rate_limited(), rate_limited(), ok("from fallback")])
    router = make_router(provider)
    result = await router.complete(CallContext(Task.chat_simple), MSG)
    assert result.text == "from fallback"
    assert result.model == "openai/fallback"
    assert [c.model for c in provider.calls] == [
        "anthropic/primary",
        "anthropic/primary",
        "openai/fallback",
    ]
    logged = await calls(db)
    assert [c.error is not None for c in logged] == [True, True, False]


async def test_retries_once_on_timeout(make_router) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([timeout(), ok("second try")])
    router = make_router(provider)
    result = await router.complete(CallContext(Task.chat_simple), MSG)
    assert result.text == "second try" and result.model == "anthropic/primary"


async def test_non_retryable_error_fails_fast(make_router) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([bad_request()])
    router = make_router(provider)
    with pytest.raises(LLMUnavailable):
        await router.complete(CallContext(Task.chat_simple), MSG)
    assert len(provider.calls) == 1


async def test_all_models_failing_raises(make_router) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([rate_limited()] * 4)
    router = make_router(provider)
    with pytest.raises(LLMUnavailable):
        await router.complete(CallContext(Task.chat_simple), MSG)
    assert len(provider.calls) == 4


async def test_spend_cap_blocks_calls(make_router, db: AsyncSession, user: User) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([ok("a", cost=0.6), ok("b", cost=0.5)])
    router = make_router(provider)
    ctx = CallContext(Task.chat_simple, billed_user_id=user.id)
    await router.complete(ctx, MSG)  # spent 0.6 < cap 1.0
    await router.complete(ctx, MSG)  # spent 1.1 >= cap
    with pytest.raises(SpendCapExceeded):
        await router.complete(ctx, MSG)
    assert len(provider.calls) == 2  # provider was never called for the blocked request
    # Another creator is unaffected
    other = User(clerk_user_id=f"test:{uuid.uuid4()}", display_name="o")
    db.add(other)
    await db.commit()
    provider.script.append(ok("ok"))
    result = await router.complete(CallContext(Task.chat_simple, billed_user_id=other.id), MSG)
    assert result.text == "ok"


async def test_spend_cap_message_is_bilingual(make_router, db: AsyncSession, user: User) -> None:  # type: ignore[no-untyped-def]
    user.daily_spend_cap_usd = Decimal("0")
    await db.commit()
    router = make_router(ScriptedProvider([ok("x")]))
    with pytest.raises(SpendCapExceeded) as info:
        await router.complete(CallContext(Task.chat_simple, billed_user_id=user.id), MSG)
    assert "ครบโควตา" in info.value.message and "daily usage limit" in info.value.message


class Shape(BaseModel):
    shape: str


async def test_complete_json_retries_once_on_bad_json(make_router) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([ok("sure! here you go"), ok('```json\n{"shape": "how_to"}\n```')])
    router = make_router(provider)
    result = await router.complete_json(CallContext(Task.shape_classify), MSG, Shape)
    assert result.shape == "how_to"
    assert len(provider.calls) == 2
    assert provider.calls[1].messages[-1]["role"] == "user"


async def test_stream_yields_deltas_and_logs(make_router, db: AsyncSession) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([ok("สวัสดีครับ hello")])
    router = make_router(provider)
    chunks = [c async for c in router.stream(CallContext(Task.chat_simple), MSG)]
    assert "".join(chunks) == "สวัสดีครับ hello"
    assert len(await calls(db)) == 1


async def test_stream_falls_back_before_first_token(make_router) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider([rate_limited(), ok("fallback stream")])
    router = make_router(provider)
    chunks = [c async for c in router.stream(CallContext(Task.chat_simple), MSG)]
    assert "".join(chunks) == "fallback stream"
    assert provider.calls[-1].model == "openai/fallback"


def test_api_key_by_model_prefix(app: FastAPI, db: AsyncSession) -> None:
    settings = Settings(
        _env_file=None, gemini_api_key="g-key", groq_api_key="q-key", anthropic_api_key="a-key"
    )
    router = LLMRouter(settings, app.state.test_session_factory, provider=ScriptedProvider())
    assert router._api_key("gemini/gemini-2.5-flash") == "g-key"
    assert router._api_key("groq/llama-3.3-70b-versatile") == "q-key"
    assert router._api_key("anthropic/claude-sonnet-5") == "a-key"
    assert router._api_key("openai/gpt-x") is None  # not configured → LiteLLM env fallback
    assert router._api_key("unknown/model") is None


async def test_embed_uses_fake_embedder_for_fake_model(make_router, db: AsyncSession) -> None:  # type: ignore[no-untyped-def]
    provider = ScriptedProvider()
    router = make_router(provider)
    router.settings.embedding_model = "fake/hash"
    vectors = await router.embed(CallContext(Task.embed), ["สวัสดี", "hello"])
    assert len(vectors) == 2 and all(len(v) == 1024 for v in vectors)
    assert vectors[0] != vectors[1]
    assert provider.calls == []  # the real provider was never asked
    logged = await calls(db)
    assert len(logged) == 1 and logged[0].task == "embed" and logged[0].model == "fake/hash"
