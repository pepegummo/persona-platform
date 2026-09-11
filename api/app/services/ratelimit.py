"""Redis fixed-window rate limits for public endpoints (hard rule 6)."""

import uuid
from datetime import UTC, datetime

from redis.asyncio import Redis

from app.config import Settings
from app.services.errors import ServiceError


class RateLimited(ServiceError):
    status_code = 429

    def __init__(self, retry_after_s: int) -> None:
        super().__init__(
            "ส่งข้อความเร็วเกินไป รอสักครู่แล้วลองใหม่นะ / "
            "You're sending messages too quickly. Please wait a moment and try again."
        )
        self.retry_after_s = retry_after_s


async def _hit(redis: Redis, key: str, limit: int, ttl_s: int) -> None:
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, ttl_s)
    if count > limit:
        ttl = await redis.ttl(key)
        raise RateLimited(retry_after_s=max(int(ttl), 1))


async def check_visitor_limits(
    redis: Redis, settings: Settings, *, visitor_id: str, persona_id: uuid.UUID
) -> None:
    now = datetime.now(UTC)
    minute = now.strftime("%Y%m%d%H%M")
    day = now.strftime("%Y%m%d")
    await _hit(redis, f"rl:v:{visitor_id}:m:{minute}", settings.rate_limit_visitor_per_min, 60)
    await _hit(redis, f"rl:v:{visitor_id}:d:{day}", settings.rate_limit_visitor_per_day, 86400)
    await _hit(redis, f"rl:p:{persona_id}:d:{day}", settings.rate_limit_persona_per_day, 86400)
