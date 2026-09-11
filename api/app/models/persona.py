import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_col, uuid_pk

if TYPE_CHECKING:
    from app.models.example import Example

VISIBILITIES = ("private", "unlisted", "public")
VERSION_STATUSES = ("draft", "compiling", "ready", "failed")
MODES = ("simple", "like_me")


class Persona(Base):
    __tablename__ = "personas"
    __table_args__ = (
        CheckConstraint(
            "visibility IN ('private','unlisted','public')", name="personas_visibility"
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    visibility: Mapped[str] = mapped_column(String, nullable=False, server_default="private")
    published_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("persona_versions.id", name="personas_published_version_fk", use_alter=True),
        nullable=True,
    )
    owner_can_read_chats: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    cloned_from_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=text("now()"),
    )

    versions: Mapped[list["PersonaVersion"]] = relationship(
        back_populates="persona",
        foreign_keys="PersonaVersion.persona_id",
        order_by="PersonaVersion.version_number",
        cascade="all, delete-orphan",
    )


class PersonaVersion(Base):
    __tablename__ = "persona_versions"
    __table_args__ = (
        UniqueConstraint("persona_id", "version_number"),
        CheckConstraint(
            "status IN ('draft','compiling','ready','failed')", name="persona_versions_status"
        ),
        CheckConstraint("mode IN ('simple','like_me')", name="persona_versions_mode"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    persona_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("personas.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="draft")
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    rules: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    mode: Mapped[str] = mapped_column(String, nullable=False, server_default="simple")
    style_card: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    fixed_example_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)), nullable=False, server_default=text("'{}'")
    )
    eval_score_simple: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    eval_score_like_me: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    prompt_versions: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    compiled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    persona: Mapped[Persona] = relationship(back_populates="versions", foreign_keys=[persona_id])
    examples: Mapped[list["Example"]] = relationship(
        back_populates="version", order_by="Example.created_at", cascade="all, delete-orphan"
    )
