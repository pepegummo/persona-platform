-- Reference schema. Alembic migrations become the source of truth once created (M1).
-- Embedding dimension must match EMBEDDING_MODEL (see .env.example). 1024 is a placeholder.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   text UNIQUE NOT NULL,
    display_name    text NOT NULL,
    locale          text NOT NULL DEFAULT 'th',          -- 'th' | 'en'
    daily_spend_cap_usd numeric(10,4) NOT NULL DEFAULT 1.0,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE personas (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug                  text UNIQUE NOT NULL,
    visibility            text NOT NULL DEFAULT 'private'
                          CHECK (visibility IN ('private','unlisted','public')),
    published_version_id  uuid,                             -- FK added below
    owner_can_read_chats  boolean NOT NULL DEFAULT false,
    cloned_from_version_id uuid,                            -- lineage for clone/remix (Phase 2)
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Immutable once status = 'ready' and published. Edits create a new row.
CREATE TABLE persona_versions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id          uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    version_number      int  NOT NULL,
    status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','compiling','ready','failed')),
    display_name        text NOT NULL,
    description         text,
    settings            jsonb NOT NULL DEFAULT '{}',    -- language, tone, length, level, style, profile{}, vocabulary{}
    rules               text NOT NULL DEFAULT '',
    mode                text NOT NULL DEFAULT 'simple' CHECK (mode IN ('simple','like_me')),
    style_card          jsonb,                          -- output of prompts/compiler.md
    fixed_example_ids   uuid[] NOT NULL DEFAULT '{}',
    eval_score_simple   numeric(5,2),
    eval_score_like_me  numeric(5,2),
    prompt_versions     jsonb NOT NULL DEFAULT '{}',    -- which prompt versions compiled this
    compiled_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (persona_id, version_number)
);

ALTER TABLE personas
    ADD CONSTRAINT personas_published_version_fk
    FOREIGN KEY (published_version_id) REFERENCES persona_versions(id);

CREATE TABLE examples (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id          uuid NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
    question            text NOT NULL,
    answer              text NOT NULL,
    shape               text,                           -- see docs/PROMPTS.md shape list
    is_private          boolean NOT NULL DEFAULT true,
    is_held_out         boolean NOT NULL DEFAULT false, -- used only for eval
    synthetic_of        uuid REFERENCES examples(id) ON DELETE CASCADE,
    embedding           vector(1024),
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX examples_version_shape_idx ON examples (version_id, shape);
-- Per-version example counts are small; exact scan after the version filter is fine.
-- Add an HNSW index only if profiling shows a need:
-- CREATE INDEX examples_embedding_idx ON examples USING hnsw (embedding vector_cosine_ops);

CREATE TABLE knowledge_chunks (                         -- Phase 2 (M7)
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id      uuid NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
    source_name     text NOT NULL,
    content         text NOT NULL,
    embedding       vector(1024),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_version_idx ON knowledge_chunks (version_id);

CREATE TABLE conversations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_version_id  uuid NOT NULL REFERENCES persona_versions(id),
    user_id             uuid REFERENCES users(id),      -- null for anonymous visitors
    visitor_id          text,                           -- signed cookie id for anonymous
    is_owner_test       boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Partition by month once volume grows (see ARCHITECTURE.md scaling).
CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user','assistant')),
    content         text NOT NULL,
    blocked_reason  text,                               -- 'leak' | 'moderation' | null
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);

CREATE TABLE llm_calls (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task                text NOT NULL,                  -- compile, chat_simple, judge, ...
    model               text NOT NULL,
    persona_version_id  uuid REFERENCES persona_versions(id),
    billed_user_id      uuid REFERENCES users(id),      -- creator whose spend this counts against
    input_tokens        int NOT NULL DEFAULT 0,
    cached_input_tokens int NOT NULL DEFAULT 0,
    output_tokens       int NOT NULL DEFAULT 0,
    cost_usd            numeric(10,6) NOT NULL DEFAULT 0,
    latency_ms          int,
    error               text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX llm_calls_billed_day_idx ON llm_calls (billed_user_id, created_at);

CREATE TABLE eval_runs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_version_id  uuid NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
    mode                text NOT NULL CHECK (mode IN ('simple','like_me')),
    score               numeric(5,2) NOT NULL,
    details             jsonb NOT NULL,                 -- per held-out example judge JSON
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE likes (                                    -- Phase 2 (M8)
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona_id  uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, persona_id)
);

-- Launch analytics (M4a). Read with db/metrics.sql.
CREATE TABLE events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                text NOT NULL,                  -- persona_created | persona_published |
                                                        -- share_link_opened | visitor_message_sent
    persona_id          uuid REFERENCES personas(id) ON DELETE SET NULL,
    persona_version_id  uuid,
    conversation_id     uuid,
    user_id             uuid,
    visitor_id          text,
    props               jsonb NOT NULL DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_name_created_idx ON events (name, created_at);
CREATE INDEX events_persona_idx ON events (persona_id);

-- Visitor reports from the public persona page (M4a). Reviewed manually for now.
CREATE TABLE reports (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id          uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    persona_version_id  uuid,
    conversation_id     uuid,
    visitor_id          text,
    user_id             uuid,
    reason              text NOT NULL,                  -- impersonation | harmful | spam | privacy | other
    details             text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
