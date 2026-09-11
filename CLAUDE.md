# Persona Platform

A web app where anyone can create an AI persona that answers in their own style
(settings + Q→A examples), test it, and share it by link so friends and others can chat with it.
Primary users are Thai; answers often mix Thai and English.

## Status

Specs only. Build milestone by milestone following `docs/ROADMAP.md`.

- **Current target: Phase 1A — Lean MVP** (M0 → M1 → M2 → M3 → M4a), then STOP at the
  Launch checkpoint. Do not build Phase 1B, X1, or later phases unless explicitly asked.
- Current milestone: **LAUNCH CHECKPOINT** — Phase 1A (M0–M4a) is built. Do not start M4b/M5/M6/X1 until the checkpoint decision in `docs/ROADMAP.md` is made.
- Later features stay behind flags (`FEATURE_EVAL`, `FEATURE_SYNTH_REWRITE`, `FEATURE_LIKE_ME`,
  `FEATURE_EXPORT`), all off in Phase 1A.

## Stack (decided — ask before changing)

- Frontend: Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui → `web/`
- Backend: FastAPI, Python 3.12, async → `api/`
- Background jobs: Arq workers on Redis → `api/app/workers/`
- Database: Postgres 16 + pgvector, async SQLAlchemy 2.0, Alembic migrations
- Cache / rate limits: Redis
- LLM access: LiteLLM, only through `api/app/llm/router.py`
- Auth: Clerk (frontend) — FastAPI verifies Clerk JWTs via JWKS
- Package managers: `pnpm` for web, `uv` for api
- Local dev: `docker compose` for Postgres (pgvector image) and Redis
- Deploy target: containers on Cloud Run or ECS, Singapore region

## Target repo layout

```
web/                  Next.js app (creator studio + public persona pages)
api/app/
  routes/             FastAPI routers (personas, chat, public, export)
  services/           business logic (persona, chat, context, guardrails, eval)
  llm/router.py       the ONLY place that calls LLM providers
  prompts/            prompt templates as .md files (see docs/PROMPTS.md)
  workers/            Arq jobs: compile, embed, eval, synth_rewrite
  models/             SQLAlchemy models
  schemas/            Pydantic v2 request/response models
api/migrations/       Alembic
api/tests/
scripts/              offline tools (X1 export / expand / judge) — never imported by the app
experiments/lora/     X1 Kaggle notebook + reports — never imported by the app
db/schema.sql         reference schema (Alembic is the source of truth once created)
docs/                 product, architecture, prompts, roadmap
```

## Commands

Prereqs: Docker Desktop, `uv`, `pnpm`, GNU `make`. Copy `.env.example` → `.env` and
`web/.env.example` → `web/.env.local`. No paid keys needed: `LLM_PROVIDER=fake` runs a built-in
stub, and the "Free-tier profile" block in `.env.example` runs on Gemini + Groq free tiers.

| Command | What it does |
|---|---|
| `make dev` | Postgres + Redis in Docker, then api (:8000), Arq worker, and web (:3000) as local processes |
| `make infra` / `make down` | Start / stop only the Docker services |
| `make test` | `pytest` (api) + `tsc --noEmit` (web) |
| `make lint` | ruff check + format check + mypy (api), eslint (web) |
| `make migrate` | `alembic upgrade head` (needs `make infra`) |
| `db/metrics.sql` | The three launch-checkpoint queries; run with `psql` against the production DB |
| `make gen-client` | Dump OpenAPI from the api (`python -m app.cli openapi`) → `web/openapi.json` → `web/src/lib/api/schema.d.ts`. Run after any route/schema change; CI fails if it is stale |

Per-package: `cd api && uv run …`, `cd web && pnpm …`.

## Hard rules — never break these

1. **The browser never calls an LLM provider.** All LLM calls go through `app/llm/router.py`,
   which holds API keys, applies fallbacks, and enforces spend caps.
2. **Published persona versions are immutable.** Any edit creates a new `persona_versions` row.
   Conversations always store `persona_version_id`.
3. **Private examples never reach a public prompt.** When a visitor (not the owner) chats with a
   public/unlisted persona, use only examples where `is_private = false` or synthetic rewrites
   (`synthetic_of IS NOT NULL`). Owners testing their own persona may use originals.
4. **Every answer passes guardrails** before it is streamed out and stored: moderation from M4a,
   plus the private-example leak check from M4b. For streaming: buffer and check in chunks;
   stop the stream if a chunk fails. Design the guardrail interface in M3 so both plug in.
5. **Every public chat shows the label** "AI version of {display_name}" — never imply it is the real person.
6. **Rate-limit every public endpoint** (per visitor, per persona, per creator daily spend).
7. **Thai is first-class.** UI strings via i18n (th, en). Thai has no spaces between words:
   never split Thai text on whitespace — use character n-grams for overlap checks.
   Include Thai fixtures in tests.
8. **No LoRA, GPU, or self-hosted model code in the app** until Phase 4. The only exception is the
   offline X1 experiment in `scripts/` and `experiments/lora/`, which the app must never import.
9. **Experiment data needs consent.** X1 scripts only export personas passed via `--persona-ids`
   with `--consent-confirmed`. Never add real user data to the repo or to fixtures.

## Conventions

- Python: ruff (lint + format), mypy, pytest + pytest-asyncio. Pydantic v2 for all I/O.
- TypeScript: strict mode, eslint. API client generated from FastAPI OpenAPI (`openapi-typescript`);
  never hand-write API types in `web/`.
- Prompts live in `api/app/prompts/*.md`, loaded by name. No long prompt strings inline in code.
  Changing a prompt = bump its version header and note it in the PR/commit message.
- LLM calls in unit tests are mocked. Real-call tests use `@pytest.mark.llm` and are skipped in CI by default.
- Streaming chat uses Server-Sent Events (`text/event-stream`).
- Money and tokens: log `model`, `input_tokens`, `output_tokens`, `cost_usd`, `persona_version_id`
  for every LLM call into `llm_calls`.
- Config via environment variables only (see `.env.example`). Never commit secrets.

## How to work in this repo

- Start each milestone by reading its section in `docs/ROADMAP.md`, then propose a plan before editing.
- Keep changes scoped to the current milestone. Tick checkboxes in the roadmap when acceptance
  criteria pass.
- Ask before adding a new dependency, service, or table not in `db/schema.sql`.
- Prefer small, reviewable commits with passing tests.

## Read on demand (not needed every session)

- `docs/PRODUCT.md` — what we are building, modes, privacy, safeguards, non-goals
- `docs/ARCHITECTURE.md` — components, flows, context strategies, routing, caching, scaling
- `docs/PROMPTS.md` — compiler, classifier, runtime, rewrite, and judge prompts
- `docs/ROADMAP.md` — milestones with tasks and acceptance criteria, Lean MVP scope, launch checkpoint
- `docs/LORA_EXPERIMENT.md` — X1 design, data rules, file formats, decision rule (only for X1 work)
- `db/schema.sql` — data model
