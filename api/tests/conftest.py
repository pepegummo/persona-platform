"""Test fixtures.

Two tiers:
- Plain unit tests: `app` + `client`, no infrastructure.
- DB tests: request the `db` fixture. They run against a real Postgres (`persona_test` database,
  migrated with Alembic once per session) and each test runs inside a transaction that is rolled
  back. If Postgres is unreachable they are skipped, unless REQUIRE_DB_TESTS=1 (set in CI).
"""

import os
import subprocess
import sys
from collections.abc import AsyncIterator, Callable, Iterator
from urllib.parse import urlsplit, urlunsplit

# LiteLLM's import runs load_dotenv() in its default "DEV" mode, which would leak the developer's
# .env (e.g. EMBEDDING_MODEL=fake/hash) into every Settings() built after any test imports it.
os.environ.setdefault("LITELLM_MODE", "PRODUCTION")

import asyncpg
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.deps import get_db
from app.main import create_app
from app.routes.health import check_db, check_redis

TEST_DB_NAME = "persona_test"


def _with_db(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path=f"/{name}"))


@pytest.fixture
def settings() -> Settings:
    # Isolated from the developer's .env so tests are deterministic.
    return Settings(_env_file=None, app_env="test", auth_dev_bypass=True)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def set_health(app: FastAPI) -> Callable[[bool, bool], None]:
    """Override the db / redis checks so tests need no running infrastructure."""

    def _set(db_ok: bool, redis_ok: bool) -> None:
        app.dependency_overrides[check_db] = lambda: db_ok
        app.dependency_overrides[check_redis] = lambda: redis_ok

    return _set


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# --- Database tier -------------------------------------------------------------------------


@pytest.fixture(scope="session")
def test_database_url() -> Iterator[str]:
    base = os.environ.get("TEST_DATABASE_URL") or Settings(_env_file=None).database_url
    admin_url = _with_db(base, "postgres").replace("postgresql+asyncpg://", "postgresql://")
    test_url = _with_db(base, TEST_DB_NAME)

    async def prepare() -> None:
        conn = await asyncpg.connect(admin_url)
        try:
            exists = await conn.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", TEST_DB_NAME
            )
            if not exists:
                await conn.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
        finally:
            await conn.close()

    import asyncio

    try:
        asyncio.run(prepare())
    except (OSError, asyncpg.PostgresError) as e:
        if os.environ.get("REQUIRE_DB_TESTS"):
            raise
        pytest.skip(f"Postgres not reachable ({e.__class__.__name__}); run `make infra`")

    # Alembic's async env calls asyncio.run(), so migrate in a subprocess, not in our loop.
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
        env={**os.environ, "DATABASE_URL": test_url},
        capture_output=True,
    )
    yield test_url


@pytest.fixture
async def db(test_database_url: str, app: FastAPI) -> AsyncIterator[AsyncSession]:
    """A session inside one outer transaction; app-level commits become savepoints."""
    engine = create_async_engine(test_database_url)
    async with engine.connect() as conn:
        trans = await conn.begin()
        factory = async_sessionmaker(
            conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        session = factory()

        async def _override() -> AsyncIterator[AsyncSession]:
            yield session

        app.dependency_overrides[get_db] = _override
        app.state.test_session_factory = factory
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()
    await engine.dispose()


def auth(user_id: str = "alice") -> dict[str, str]:
    """Authorization header for the dev bypass user `dev:<user_id>`."""
    return {"Authorization": f"Bearer dev:{user_id}"}


@pytest.fixture
def chat_app(app: FastAPI, db: AsyncSession, settings: Settings) -> FastAPI:
    """App wired for chat routes without the lifespan: fake LLM, no guardrails, memory redis."""
    from app.llm.providers import FakeProvider
    from app.llm.router import LLMRouter
    from app.services.guardrails import GuardrailPipeline
    from tests.llm_stubs import MemoryRedis

    app.state.session_factory = app.state.test_session_factory
    app.state.router = LLMRouter(settings, app.state.session_factory, provider=FakeProvider(1024))
    app.state.make_guardrails = lambda **kw: GuardrailPipeline()
    app.state.redis = MemoryRedis()
    return app


def parse_sse(body: str) -> list[tuple[str, dict[str, object]]]:
    """Turn an SSE body into (event, data) pairs."""
    import json

    events: list[tuple[str, dict[str, object]]] = []
    name, data = "message", ""
    for line in body.splitlines():
        if line.startswith("event:"):
            name = line[6:].strip()
        elif line.startswith("data:"):
            data += line[5:].strip()
        elif line == "":
            if data:
                events.append((name, json.loads(data)))
            name, data = "message", ""
    if data:
        events.append((name, json.loads(data)))
    return events
