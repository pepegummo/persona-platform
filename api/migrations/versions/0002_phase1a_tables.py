"""Phase 1A tables: users, personas, persona_versions, examples, conversations, messages, llm_calls.

Mirrors db/schema.sql (eval_runs, knowledge_chunks, likes come with their milestones).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-11
"""

from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("clerk_user_id", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("locale", sa.String(), server_default="th", nullable=False),
        sa.Column(
            "daily_spend_cap_usd",
            sa.Numeric(precision=10, scale=4),
            server_default=sa.text("1.0"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("clerk_user_id"),
    )
    op.create_table(
        "personas",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("visibility", sa.String(), server_default="private", nullable=False),
        sa.Column("published_version_id", sa.UUID(), nullable=True),
        sa.Column(
            "owner_can_read_chats", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("cloned_from_version_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "visibility IN ('private','unlisted','public')", name="personas_visibility"
        ),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "persona_versions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("persona_id", sa.UUID(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), server_default="draft", nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "settings",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("rules", sa.Text(), server_default="", nullable=False),
        sa.Column("mode", sa.String(), server_default="simple", nullable=False),
        sa.Column("style_card", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "fixed_example_ids",
            postgresql.ARRAY(sa.UUID()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("eval_score_simple", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("eval_score_like_me", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column(
            "prompt_versions",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("compiled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("mode IN ('simple','like_me')", name="persona_versions_mode"),
        sa.CheckConstraint(
            "status IN ('draft','compiling','ready','failed')", name="persona_versions_status"
        ),
        sa.ForeignKeyConstraint(["persona_id"], ["personas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("persona_id", "version_number"),
    )
    op.create_foreign_key(
        "personas_published_version_fk",
        "personas",
        "persona_versions",
        ["published_version_id"],
        ["id"],
    )
    op.create_table(
        "conversations",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("persona_version_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("visitor_id", sa.String(), nullable=True),
        sa.Column("is_owner_test", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["persona_version_id"],
            ["persona_versions.id"],
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "examples",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("version_id", sa.UUID(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("shape", sa.String(), nullable=True),
        sa.Column("is_private", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("is_held_out", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("synthetic_of", sa.UUID(), nullable=True),
        sa.Column("embedding", pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["synthetic_of"], ["examples.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["persona_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("examples_version_shape_idx", "examples", ["version_id", "shape"], unique=False)
    op.create_table(
        "llm_calls",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("task", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("persona_version_id", sa.UUID(), nullable=True),
        sa.Column("billed_user_id", sa.UUID(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("cached_input_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "cost_usd",
            sa.Numeric(precision=10, scale=6),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["billed_user_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["persona_version_id"],
            ["persona_versions.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "llm_calls_billed_day_idx", "llm_calls", ["billed_user_id", "created_at"], unique=False
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("blocked_reason", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('user','assistant')", name="messages_role"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "messages_conversation_idx", "messages", ["conversation_id", "created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("messages_conversation_idx", table_name="messages")
    op.drop_table("messages")
    op.drop_index("llm_calls_billed_day_idx", table_name="llm_calls")
    op.drop_table("llm_calls")
    op.drop_index("examples_version_shape_idx", table_name="examples")
    op.drop_table("examples")
    op.drop_table("conversations")
    op.drop_constraint("personas_published_version_fk", "personas", type_="foreignkey")
    op.drop_table("persona_versions")
    op.drop_table("personas")
    op.drop_table("users")
