from collections.abc import Callable

from httpx import AsyncClient


async def test_health_ok(client: AsyncClient, set_health: Callable[[bool, bool], None]) -> None:
    set_health(True, True)
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_health_db_down(
    client: AsyncClient, set_health: Callable[[bool, bool], None]
) -> None:
    set_health(False, True)
    r = await client.get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "degraded", "db": "error", "redis": "ok"}


async def test_health_redis_down(
    client: AsyncClient, set_health: Callable[[bool, bool], None]
) -> None:
    set_health(True, False)
    r = await client.get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "degraded", "db": "ok", "redis": "error"}


async def test_health_without_infra_reports_degraded(client: AsyncClient) -> None:
    # No overrides and no lifespan: the real checks must fail closed, not raise.
    r = await client.get("/health")
    assert r.status_code == 503
    assert r.json()["status"] == "degraded"
