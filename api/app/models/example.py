import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, created_at_col, uuid_pk

if TYPE_CHECKING:
    from app.models.persona import PersonaVersion

# Must match EMBEDDING_DIM in .env.example and the vector(1024) column in db/schema.sql.
EMBEDDING_DIM = 1024

SHAPES = (
    "comparison",
    "how_to",
    "definition",
    "troubleshooting",
    "opinion",
    "recommendation",
    "casual",
    "other",
)


class Example(Base):
    __tablename__ = "examples"
    __table_args__ = (Index("examples_version_shape_idx", "version_id", "shape"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("persona_versions.id", ondelete="CASCADE"), nullable=False
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    shape: Mapped[str | None] = mapped_column(String, nullable=True)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_held_out: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    synthetic_of: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("examples.id", ondelete="CASCADE"), nullable=True
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    version: Mapped["PersonaVersion"] = relationship(back_populates="examples")
