from collections.abc import AsyncIterator, Callable

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.routes.health import check_db, check_redis


@pytest.fixture
def settings() -> Settings:
    # Isolated from the developer's .env so tests are deterministic.
    return Settings(_env_file=None)


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
