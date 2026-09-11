"""Creator endpoints. Every route requires a signed-in owner."""

import uuid

from fastapi import APIRouter, Request, status
from sse_starlette.sse import EventSourceResponse

from app.auth import CurrentUser
from app.deps import DbDep, QueueDep, RedisDep
from app.models import Persona
from app.schemas.chat import ChatIn, PublishIn
from app.schemas.persona import (
    ExampleCreate,
    ExampleOut,
    ExampleUpdate,
    PersonaCreate,
    PersonaListItem,
    PersonaOut,
    PersonaUpdate,
    VersionOut,
    VersionSummary,
)
from app.services import persona as svc
from app.services.chat import ChatRequest, ChatService
from app.services.errors import InvalidStateError

router = APIRouter(prefix="/api/personas", tags=["personas"])


def to_persona_out(persona: Persona) -> PersonaOut:
    draft = svc.latest_version(persona)
    published = next((v for v in persona.versions if v.id == persona.published_version_id), None)
    return PersonaOut(
        id=persona.id,
        slug=persona.slug,
        visibility=persona.visibility,
        owner_can_read_chats=persona.owner_can_read_chats,
        published_version_id=persona.published_version_id,
        created_at=persona.created_at,
        updated_at=persona.updated_at,
        draft=VersionOut.model_validate(draft),
        published=VersionSummary.model_validate(published) if published else None,
    )


@router.post("", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
async def create_persona(data: PersonaCreate, user: CurrentUser, db: DbDep) -> PersonaOut:
    persona = await svc.create_persona(db, user, data)
    return to_persona_out(persona)


@router.get("", response_model=list[PersonaListItem])
async def list_personas(user: CurrentUser, db: DbDep) -> list[PersonaListItem]:
    return await svc.list_personas(db, user)


@router.get("/{persona_id}", response_model=PersonaOut)
async def get_persona(persona_id: uuid.UUID, user: CurrentUser, db: DbDep) -> PersonaOut:
    persona = await svc.get_owned_persona(db, persona_id, user)
    return to_persona_out(persona)


@router.patch("/{persona_id}", response_model=PersonaOut)
async def update_persona(
    persona_id: uuid.UUID, data: PersonaUpdate, user: CurrentUser, db: DbDep
) -> PersonaOut:
    persona = await svc.get_owned_persona(db, persona_id, user)
    persona = await svc.update_persona(db, persona, data)
    return to_persona_out(persona)


@router.post(
    "/{persona_id}/examples", response_model=ExampleOut, status_code=status.HTTP_201_CREATED
)
async def add_example(
    persona_id: uuid.UUID, data: ExampleCreate, user: CurrentUser, db: DbDep
) -> ExampleOut:
    persona = await svc.get_owned_persona(db, persona_id, user)
    example = await svc.add_example(db, persona, data)
    return ExampleOut.model_validate(example)


@router.patch("/{persona_id}/examples/{example_id}", response_model=ExampleOut)
async def update_example(
    persona_id: uuid.UUID,
    example_id: uuid.UUID,
    data: ExampleUpdate,
    user: CurrentUser,
    db: DbDep,
) -> ExampleOut:
    persona = await svc.get_owned_persona(db, persona_id, user)
    example = await svc.update_example(db, persona, example_id, data)
    return ExampleOut.model_validate(example)


@router.delete("/{persona_id}/examples/{example_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_example(
    persona_id: uuid.UUID, example_id: uuid.UUID, user: CurrentUser, db: DbDep
) -> None:
    persona = await svc.get_owned_persona(db, persona_id, user)
    await svc.delete_example(db, persona, example_id)


@router.post("/{persona_id}/compile", response_model=VersionSummary, status_code=202)
async def compile_persona(
    persona_id: uuid.UUID, user: CurrentUser, db: DbDep, queue: QueueDep
) -> VersionSummary:
    """Compile the latest draft: style card, shape tags, embeddings, fixed examples."""
    persona = await svc.get_owned_persona(db, persona_id, user)
    version = await svc.start_compile(db, persona)
    await queue.enqueue_job("compile_version", str(version.id))
    return VersionSummary.model_validate(version)


@router.post("/{persona_id}/publish", response_model=PersonaOut)
async def publish_persona(
    persona_id: uuid.UUID, data: PublishIn, user: CurrentUser, db: DbDep, redis: RedisDep
) -> PersonaOut:
    """Publish the latest compiled version with the given visibility (unlisted by default)."""
    persona = await svc.get_owned_persona(db, persona_id, user)
    persona = await svc.publish(db, persona, data.visibility)
    await redis.delete(f"slug:{persona.slug}")
    return to_persona_out(persona)


@router.post("/{persona_id}/unpublish", response_model=PersonaOut)
async def unpublish_persona(
    persona_id: uuid.UUID, user: CurrentUser, db: DbDep, redis: RedisDep
) -> PersonaOut:
    persona = await svc.get_owned_persona(db, persona_id, user)
    persona = await svc.unpublish(db, persona)
    await redis.delete(f"slug:{persona.slug}")
    return to_persona_out(persona)


@router.post("/{persona_id}/test-chat")
async def test_chat(
    persona_id: uuid.UUID,
    data: ChatIn,
    user: CurrentUser,
    db: DbDep,
    request: Request,
) -> EventSourceResponse:
    """Owner test chat (SSE). May use private examples; never rate limited beyond the spend cap."""
    persona = await svc.get_owned_persona(db, persona_id, user)
    version = svc.latest_version(persona)
    if version.status != "ready":
        raise InvalidStateError("Compile the persona before testing / กรุณาประมวลผลก่อนทดสอบ")
    guardrails = request.app.state.make_guardrails(
        billed_user_id=persona.owner_id, persona_version_id=version.id
    )
    chat = ChatService(
        request.app.state.session_factory,
        request.app.state.router,
        guardrails,
        request.app.state.settings,
    )
    req = ChatRequest(
        version_id=version.id,
        persona_id=persona.id,
        owner_id=persona.owner_id,
        message=data.message,
        conversation_id=data.conversation_id,
        is_owner=True,
        user_id=user.id,
    )
    return EventSourceResponse(chat.stream(req))
