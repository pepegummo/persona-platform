"""Chat flow (ARCHITECTURE.md): load version → build context → stream through the router →
guardrails → SSE events → persist conversation + messages with persona_version_id.

Sessions are short-lived and opened from the factory: the streaming body runs after the request
handler has returned, so a request-scoped session cannot be relied on here.
"""

import json
import logging
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.config import Settings
from app.llm.providers import Message
from app.llm.router import CallContext, LLMRouter, Task
from app.models import Conversation, PersonaVersion
from app.models import Message as MessageRow
from app.services.context import strategy_for
from app.services.errors import NotFoundError, ServiceError
from app.services.guardrails import (
    BLOCKED_INPUT_MESSAGE,
    BLOCKED_OUTPUT_MESSAGE,
    GuardrailPipeline,
    StreamOutcome,
)

log = logging.getLogger(__name__)


@dataclass
class ChatRequest:
    version_id: uuid.UUID
    owner_id: uuid.UUID
    message: str
    conversation_id: uuid.UUID | None
    is_owner: bool
    user_id: uuid.UUID | None = None
    visitor_id: str | None = None


def event(name: str, **data: Any) -> dict[str, str]:
    return {"event": name, "data": json.dumps(data, ensure_ascii=False)}


class ChatService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        router: LLMRouter,
        guardrails: GuardrailPipeline,
        settings: Settings,
    ) -> None:
        self.session_factory = session_factory
        self.router = router
        self.guardrails = guardrails
        self.settings = settings

    async def _conversation(self, db: AsyncSession, req: ChatRequest) -> Conversation:
        if req.conversation_id is not None:
            conv = await db.get(Conversation, req.conversation_id)
            owned = conv is not None and conv.persona_version_id == req.version_id
            if owned and conv is not None:
                if req.is_owner:
                    owned = conv.user_id == req.user_id and conv.is_owner_test
                else:
                    owned = conv.visitor_id == req.visitor_id or (
                        req.user_id is not None and conv.user_id == req.user_id
                    )
            if owned and conv is not None:
                return conv
            # Unknown, foreign, or stale (older version) conversation → start a new one.
        conv = Conversation(
            persona_version_id=req.version_id,
            user_id=req.user_id,
            visitor_id=req.visitor_id if not req.is_owner else None,
            is_owner_test=req.is_owner,
        )
        db.add(conv)
        await db.flush()
        return conv

    async def _history(self, db: AsyncSession, conversation_id: uuid.UUID) -> list[Message]:
        rows = await db.scalars(
            select(MessageRow)
            .where(
                MessageRow.conversation_id == conversation_id,
                MessageRow.blocked_reason.is_(None),
            )
            .order_by(MessageRow.created_at.desc())
            .limit(self.settings.chat_history_messages)
        )
        return [{"role": m.role, "content": m.content} for m in reversed(list(rows))]

    async def stream(self, req: ChatRequest) -> AsyncIterator[dict[str, str]]:
        # 1. conversation, history, input guardrail, user message
        async with self.session_factory() as db:
            version = await db.scalar(
                select(PersonaVersion)
                .where(PersonaVersion.id == req.version_id)
                .options(selectinload(PersonaVersion.examples))
            )
            if version is None:
                raise NotFoundError("Persona version not found")
            conv = await self._conversation(db, req)
            history = await self._history(db, conv.id)
            verdict = await self.guardrails.check_input(req.message)
            db.add(
                MessageRow(
                    conversation_id=conv.id,
                    role="user",
                    content=req.message,
                    blocked_reason=None if verdict.ok else verdict.reason,
                )
            )
            await db.commit()
            conversation_id = conv.id

        yield event("conversation", conversation_id=str(conversation_id))
        if not verdict.ok:
            yield event("blocked", reason=verdict.reason, message=BLOCKED_INPUT_MESSAGE)
            return

        # 2. context → router → guardrails → deltas
        messages = strategy_for(version.mode).build(
            version, req.message, history, is_owner=req.is_owner
        )
        ctx = CallContext(
            task=Task.chat_simple, billed_user_id=req.owner_id, persona_version_id=version.id
        )
        outcome = StreamOutcome(text="")
        try:
            deltas = self.router.stream(
                ctx, messages, max_tokens=self.settings.chat_max_output_tokens
            )
            async for delta in self.guardrails.guard_stream(deltas, outcome):
                yield event("delta", text=delta)
        except ServiceError as e:
            yield event("error", message=e.message, status=e.status_code)
            return
        except Exception:
            log.exception("chat: stream failed")
            yield event("error", message="Something went wrong / เกิดข้อผิดพลาด", status=500)
            return

        # 3. persist the answer (blocked answers are stored with the reason, not shown)
        async with self.session_factory() as db:
            row = MessageRow(
                conversation_id=conversation_id,
                role="assistant",
                content=outcome.text,
                blocked_reason=outcome.blocked_reason,
            )
            db.add(row)
            await db.commit()
            message_id = row.id

        if outcome.blocked_reason:
            yield event("blocked", reason=outcome.blocked_reason, message=BLOCKED_OUTPUT_MESSAGE)
        else:
            yield event("done", message_id=str(message_id))
