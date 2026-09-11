"""Creator endpoints. Every route requires a signed-in owner."""

import uuid

from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.deps import DbDep
from app.models import Persona
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
