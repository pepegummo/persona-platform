"""Record launch-checkpoint events. See db/metrics.sql for the queries that read them."""

import logging
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.analytics import EVENT_NAMES, Event

log = logging.getLogger(__name__)


def event_row(
    name: str,
    *,
    persona_id: uuid.UUID | None = None,
    persona_version_id: uuid.UUID | None = None,
    conversation_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    visitor_id: str | None = None,
    props: dict[str, Any] | None = None,
) -> Event:
    assert name in EVENT_NAMES, name
    return Event(
        name=name,
        persona_id=persona_id,
        persona_version_id=persona_version_id,
        conversation_id=conversation_id,
        user_id=user_id,
        visitor_id=visitor_id,
        props=props or {},
    )


async def record(db: AsyncSession, name: str, **fields: Any) -> None:
    """Add an event to the caller's session; committed with the caller's transaction."""
    db.add(event_row(name, **fields))


async def record_standalone(
    session_factory: async_sessionmaker[AsyncSession], name: str, **fields: Any
) -> None:
    """Record in its own session; never raises (analytics must not break a chat)."""
    try:
        async with session_factory() as db:
            db.add(event_row(name, **fields))
            await db.commit()
    except Exception:
        log.exception("analytics: failed to record %s", name)
