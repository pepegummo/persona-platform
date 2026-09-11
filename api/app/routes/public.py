"""Visitor-facing endpoints for share links. Every route is rate limited (hard rule 6) and only
ever sees public examples (hard rule 3)."""

from fastapi import APIRouter, Request, Response
from sse_starlette.sse import EventSourceResponse

from app.auth import OptionalUser
from app.deps import DbDep, RedisDep, SettingsDep
from app.models import Report
from app.schemas.chat import ChatIn, PublicExampleOut, PublicPersonaOut, ReportIn, ReportOut
from app.services import analytics
from app.services import persona as svc
from app.services.chat import ChatRequest, ChatService
from app.services.context import visible_examples
from app.services.errors import NotFoundError
from app.services.ratelimit import check_visitor_limits
from app.visitor import get_or_create_visitor

router = APIRouter(prefix="/api/public/p", tags=["public"])

LABEL = "AI version of {name}"


@router.get("/{slug}", response_model=PublicPersonaOut)
async def get_public_persona(
    slug: str, request: Request, response: Response, db: DbDep, settings: SettingsDep
) -> PublicPersonaOut:
    """Header data for /p/{slug}. Private personas 404 for everyone (owners use the studio)."""
    persona, version = await svc.get_published_by_slug(db, slug)
    if persona.visibility == "private":
        raise NotFoundError("Persona not found")
    get_or_create_visitor(request, response, settings)
    return PublicPersonaOut(
        slug=persona.slug,
        display_name=version.display_name,
        description=version.description,
        visibility=persona.visibility,
        version_number=version.version_number,
        owner_can_read_chats=persona.owner_can_read_chats,
        label=LABEL.format(name=version.display_name),
        published_at=version.compiled_at,
    )


@router.get("/{slug}/examples", response_model=list[PublicExampleOut])
async def get_public_examples(slug: str, db: DbDep) -> list[PublicExampleOut]:
    """Public examples only — shown on the persona page as a style preview."""
    persona, version = await svc.get_published_by_slug(db, slug)
    if persona.visibility == "private":
        raise NotFoundError("Persona not found")
    return [
        PublicExampleOut(question=e.question, answer=e.answer)
        for e in visible_examples(version, allow_private=False)
    ]


@router.post("/{slug}/chat")
async def public_chat(
    slug: str,
    data: ChatIn,
    request: Request,
    response: Response,
    db: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
    user: OptionalUser,
) -> EventSourceResponse:
    """Visitor chat (SSE). Anonymous visitors are identified by a signed cookie."""
    persona, version = await svc.get_published_by_slug(db, slug)
    is_owner = user is not None and user.id == persona.owner_id
    if persona.visibility == "private" and not is_owner:
        raise NotFoundError("Persona not found")
    visitor_id = get_or_create_visitor(request, response, settings)
    await check_visitor_limits(redis, settings, visitor_id=visitor_id, persona_id=persona.id)
    guardrails = request.app.state.make_guardrails(
        billed_user_id=persona.owner_id, persona_version_id=version.id
    )
    chat = ChatService(
        request.app.state.session_factory, request.app.state.router, guardrails, settings
    )
    req = ChatRequest(
        version_id=version.id,
        persona_id=persona.id,
        owner_id=persona.owner_id,
        message=data.message,
        conversation_id=data.conversation_id,
        is_owner=False,  # share-link chats always use the visitor context, even for the owner
        user_id=user.id if user else None,
        visitor_id=visitor_id,
    )
    return EventSourceResponse(chat.stream(req), headers=dict(response.headers))


@router.post("/{slug}/open", status_code=204)
async def share_link_opened(
    slug: str,
    request: Request,
    response: Response,
    db: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
    user: OptionalUser,
) -> Response:
    """Called by the persona page on load: sets the visitor cookie and records the open event."""
    persona, version = await svc.get_published_by_slug(db, slug)
    if persona.visibility == "private":
        raise NotFoundError("Persona not found")
    visitor_id = get_or_create_visitor(request, response, settings)
    await check_visitor_limits(redis, settings, visitor_id=visitor_id, persona_id=persona.id)
    await analytics.record(
        db,
        "share_link_opened",
        persona_id=persona.id,
        persona_version_id=version.id,
        user_id=user.id if user else None,
        visitor_id=visitor_id,
    )
    await db.commit()
    response.status_code = 204
    return response


@router.post("/{slug}/report", response_model=ReportOut, status_code=201)
async def report_persona(
    slug: str,
    data: ReportIn,
    request: Request,
    response: Response,
    db: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
    user: OptionalUser,
) -> ReportOut:
    """Visitor report. Stored for review; the owner is not notified automatically."""
    persona, version = await svc.get_published_by_slug(db, slug)
    if persona.visibility == "private":
        raise NotFoundError("Persona not found")
    visitor_id = get_or_create_visitor(request, response, settings)
    await check_visitor_limits(redis, settings, visitor_id=visitor_id, persona_id=persona.id)
    report = Report(
        persona_id=persona.id,
        persona_version_id=version.id,
        conversation_id=data.conversation_id,
        visitor_id=visitor_id,
        user_id=user.id if user else None,
        reason=data.reason,
        details=data.details,
    )
    db.add(report)
    await db.commit()
    return ReportOut(id=report.id)
