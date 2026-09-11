"""Arq worker configuration. Run with: `uv run arq app.workers.settings.WorkerSettings`."""

import logging
import sys
from typing import Any, ClassVar

from arq.connections import RedisSettings

from app.cache import create_redis
from app.config import get_settings
from app.db import create_engine, create_session_factory
from app.llm.router import LLMRouter
from app.workers.compile import compile_version

log = logging.getLogger(__name__)


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    engine = create_engine(settings.database_url)
    ctx["settings"] = settings
    ctx["engine"] = engine
    ctx["session_factory"] = create_session_factory(engine)
    ctx["redis"] = create_redis(settings.redis_url)
    ctx["router"] = LLMRouter(settings, ctx["session_factory"])
    log.info("worker ready (llm_provider=%s)", settings.llm_provider)


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["redis"].aclose()
    await ctx["engine"].dispose()


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


class WorkerSettings:
    functions: ClassVar = [compile_version]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings()
    max_jobs = 4
    job_timeout = 600
    # asyncio signal handlers are unsupported on Windows; Ctrl+C still stops the process.
    handle_signals = sys.platform != "win32"
