"""Persona CRUD and versioning.

Hard rule 2 (CLAUDE.md): published versions are immutable. Every edit goes through
`ensure_editable_version`, which clones the published version into a new draft the first time it
is touched. A compiled-but-unpublished version is edited in place and reset to `draft` because its
style card no longer matches its inputs.
"""

import secrets
import uuid
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Example, Persona, PersonaVersion, User
from app.schemas.persona import (
    ExampleCreate,
    ExampleUpdate,
    PersonaCreate,
    PersonaListItem,
    PersonaUpdate,
)
from app.services.errors import ConflictError, ForbiddenError, NotFoundError

_LOAD_ALL = (selectinload(Persona.versions).selectinload(PersonaVersion.examples),)


@dataclass
class EditableVersion:
    version: PersonaVersion
    # Present only when a published version was just cloned: old example id -> new example id.
    example_id_map: dict[uuid.UUID, uuid.UUID] = field(default_factory=dict)


def _random_slug() -> str:
    return "p-" + secrets.token_hex(4)


def latest_version(persona: Persona) -> PersonaVersion:
    return persona.versions[-1]


def require_owner(persona: Persona, user: User) -> None:
    if persona.owner_id != user.id:
        raise ForbiddenError("You do not own this persona")


async def get_persona(db: AsyncSession, persona_id: uuid.UUID) -> Persona:
    persona = await db.scalar(select(Persona).where(Persona.id == persona_id).options(*_LOAD_ALL))
    if persona is None:
        raise NotFoundError("Persona not found")
    return persona


async def get_owned_persona(db: AsyncSession, persona_id: uuid.UUID, user: User) -> Persona:
    persona = await get_persona(db, persona_id)
    require_owner(persona, user)
    return persona


async def _commit_or_conflict(db: AsyncSession, what: str) -> None:
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "slug" in str(e.orig):
            raise ConflictError("That slug is already taken") from None
        raise ConflictError(f"Could not save {what}") from None


async def create_persona(db: AsyncSession, owner: User, data: PersonaCreate) -> Persona:
    persona = Persona(owner_id=owner.id, slug=data.slug or _random_slug())
    persona.versions.append(
        PersonaVersion(
            version_number=1,
            status="draft",
            display_name=data.display_name,
            description=data.description,
            settings=data.settings.model_dump(),
            rules=data.rules,
            mode=data.mode,
        )
    )
    db.add(persona)
    await _commit_or_conflict(db, "persona")
    return await get_persona(db, persona.id)


async def list_personas(db: AsyncSession, owner: User) -> list[PersonaListItem]:
    latest = (
        select(
            PersonaVersion.persona_id,
            func.max(PersonaVersion.version_number).label("vn"),
        )
        .group_by(PersonaVersion.persona_id)
        .subquery()
    )
    example_counts = (
        select(Example.version_id, func.count().label("n")).group_by(Example.version_id).subquery()
    )
    rows = await db.execute(
        select(Persona, PersonaVersion, func.coalesce(example_counts.c.n, 0))
        .join(latest, latest.c.persona_id == Persona.id)
        .join(
            PersonaVersion,
            (PersonaVersion.persona_id == Persona.id)
            & (PersonaVersion.version_number == latest.c.vn),
        )
        .outerjoin(example_counts, example_counts.c.version_id == PersonaVersion.id)
        .where(Persona.owner_id == owner.id)
        .order_by(Persona.updated_at.desc())
    )
    return [
        PersonaListItem(
            id=p.id,
            slug=p.slug,
            visibility=p.visibility,
            display_name=v.display_name,
            description=v.description,
            mode=v.mode,
            status=v.status,
            version_number=v.version_number,
            example_count=n,
            published_version_id=p.published_version_id,
            updated_at=p.updated_at,
        )
        for p, v, n in rows.all()
    ]


async def ensure_editable_version(db: AsyncSession, persona: Persona) -> EditableVersion:
    """Return the version edits may be applied to, cloning a published one if needed."""
    current = latest_version(persona)
    if current.id != persona.published_version_id:
        if current.status != "draft":
            # Compiled outputs are stale once inputs change; recompile on next save.
            current.status = "draft"
            current.style_card = None
            current.fixed_example_ids = []
            current.compiled_at = None
        return EditableVersion(version=current)

    clone = PersonaVersion(
        version_number=current.version_number + 1,
        status="draft",
        display_name=current.display_name,
        description=current.description,
        settings=dict(current.settings),
        rules=current.rules,
        mode=current.mode,
    )
    id_map: dict[uuid.UUID, uuid.UUID] = {}
    for ex in current.examples:
        if ex.synthetic_of is not None:
            continue  # synthetic rewrites are regenerated by the compile worker
        copy = Example(
            id=uuid.uuid4(),
            question=ex.question,
            answer=ex.answer,
            is_private=ex.is_private,
        )
        clone.examples.append(copy)
        id_map[ex.id] = copy.id
    persona.versions.append(clone)
    await db.flush()
    return EditableVersion(version=clone, example_id_map=id_map)


async def update_persona(db: AsyncSession, persona: Persona, data: PersonaUpdate) -> Persona:
    patch = data.model_dump(exclude_unset=True)
    slug = patch.pop("slug", None)
    if slug is not None:
        persona.slug = slug
    if patch:
        version = (await ensure_editable_version(db, persona)).version
        for key, value in patch.items():
            if key == "settings":
                version.settings = data.settings.model_dump() if data.settings else {}
            else:
                setattr(version, key, value)
    await _commit_or_conflict(db, "persona")
    return await get_persona(db, persona.id)


def _find_example(version: PersonaVersion, example_id: uuid.UUID) -> Example:
    for ex in version.examples:
        if ex.id == example_id:
            return ex
    raise NotFoundError("Example not found")


async def _editable_example(
    db: AsyncSession, persona: Persona, example_id: uuid.UUID
) -> tuple[PersonaVersion, Example]:
    # Validate against the current version first so unknown ids 404 before any cloning.
    _find_example(latest_version(persona), example_id)
    editable = await ensure_editable_version(db, persona)
    resolved = editable.example_id_map.get(example_id, example_id)
    return editable.version, _find_example(editable.version, resolved)


async def add_example(db: AsyncSession, persona: Persona, data: ExampleCreate) -> Example:
    version = (await ensure_editable_version(db, persona)).version
    example = Example(
        id=uuid.uuid4(),
        question=data.question,
        answer=data.answer,
        is_private=data.is_private,
    )
    version.examples.append(example)
    await db.commit()
    await db.refresh(example)
    return example


async def update_example(
    db: AsyncSession, persona: Persona, example_id: uuid.UUID, data: ExampleUpdate
) -> Example:
    _, example = await _editable_example(db, persona, example_id)
    patch = data.model_dump(exclude_unset=True)
    for key, value in patch.items():
        setattr(example, key, value)
    if "question" in patch or "answer" in patch:
        example.shape = None
        example.embedding = None
    await db.commit()
    await db.refresh(example)
    return example


async def delete_example(db: AsyncSession, persona: Persona, example_id: uuid.UUID) -> None:
    version, example = await _editable_example(db, persona, example_id)
    version.examples.remove(example)
    await db.commit()
