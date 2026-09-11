"""GET /health — liveness plus a real round-trip to Postgres and Redis."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.schemas.health import HealthDegraded, HealthOk

log = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


async def check_db(request: Request) -> bool:
    try:
        async with request.app.state.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        log.exception("health: database check failed")
        return False


async def check_redis(request: Request) -> bool:
    try:
        return bool(await request.app.state.redis.ping())
    except Exception:
        log.exception("health: redis check failed")
        return False


@router.get(
    "/health",
    response_model=HealthOk,
    responses={503: {"model": HealthDegraded}},
)
async def health(
    db_ok: Annotated[bool, Depends(check_db)],
    redis_ok: Annotated[bool, Depends(check_redis)],
) -> JSONResponse:
    if db_ok and redis_ok:
        return JSONResponse(HealthOk().model_dump())
    body = HealthDegraded(db="ok" if db_ok else "error", redis="ok" if redis_ok else "error")
    return JSONResponse(body.model_dump(), status_code=503)
