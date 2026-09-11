"""Shared FastAPI dependencies."""

from collections.abc import AsyncIterator
from typing import Annotated

from arq import ArqRedis
from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.llm.router import LLMRouter


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


def get_redis(request: Request) -> Redis:
    redis: Redis = request.app.state.redis
    return redis


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
DbDep = Annotated[AsyncSession, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]


def get_queue(request: Request) -> ArqRedis:
    queue: ArqRedis = request.app.state.queue
    return queue


def get_router(request: Request) -> LLMRouter:
    router: LLMRouter = request.app.state.router
    return router


QueueDep = Annotated[ArqRedis, Depends(get_queue)]
RouterDep = Annotated[LLMRouter, Depends(get_router)]
