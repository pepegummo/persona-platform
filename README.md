# Persona Platform

[![CI](https://github.com/pepegummo/persona-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/pepegummo/persona-platform/actions/workflows/ci.yml)

<!-- TODO: replace with the deployed URL -->
**Live demo:** _coming soon_

Create an AI persona that answers in **your** style, test it, and share it by link so friends
and others can chat with it.

You teach a persona with a few settings (tone, length, language, formatting habits) and
Question → Answer examples. The platform compiles them into a style card, and visitors chat
with it on a public page at `/p/{slug}`. Thai is first-class, and answers can mix Thai and English
the way you do (ครับ / ค่ะ / นะ included).

> The persona copies **how** you answer, not **what** you know. It says it doesn't know rather
> than make up facts about you, and every public chat is labeled "AI version of {name}".

## Screenshots

<!-- TODO: add PNGs to docs/images/ and uncomment.
| Creator studio | Public chat |
|---|---|
| ![Creator studio](docs/images/studio.png) | ![Public chat](docs/images/public-chat.png) |
-->

_Coming soon._

## Status

**Phase 1A (Lean MVP) is built** and at the launch checkpoint. Working now:

- Sign in, create and edit personas, add examples (each marked public or private)
- Compile on save (style card, example set, embeddings) in a background worker
- Owner test chat with streaming answers
- Publish as private / unlisted / public, with a shareable chat page
- Moderation on every message, rate limits, per-creator daily spend caps

Eval scores, "Like Me" mode, and export are planned but not built. They sit behind feature flags
that are off. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Stack

| Layer | Tech |
|---|---|
| Web | Next.js (App Router), TypeScript, Tailwind, shadcn/ui, i18n (th / en) |
| API | FastAPI, Python 3.12, async SQLAlchemy 2.0, Pydantic v2 |
| Jobs | Arq workers on Redis |
| Data | Postgres 16 + pgvector, Alembic migrations |
| LLM | LiteLLM behind one router (`api/app/llm/router.py`): fallbacks, spend caps, cost logging |
| Auth | Clerk; the API verifies Clerk JWTs via JWKS |

The browser never calls an LLM provider. All keys live on the backend.

## Quick start

**Prerequisites:** Docker Desktop, [`uv`](https://docs.astral.sh/uv/),
[`pnpm`](https://pnpm.io/), and GNU `make`.

```sh
git clone https://github.com/pepegummo/persona-platform.git
cd persona-platform

cp .env.example .env
cp web/.env.example web/.env.local

make infra     # Postgres + Redis in Docker
make migrate   # apply database migrations
make dev       # api :8000, worker, web :3000
```

Open <http://localhost:3000>.

### No keys? No problem

- **LLM:** set `LLM_PROVIDER=fake` in `.env` to use a built-in stub model ($0, no keys). For real
  answers for free, uncomment the **Free-tier profile** block in `.env.example` and add a
  `GEMINI_API_KEY` and a `GROQ_API_KEY`.
- **Auth:** leave `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` empty and the app runs in dev-auth mode
  (`AUTH_DEV_BYPASS=true`). This mode is ignored when `APP_ENV=production`.

## Commands

| Command | What it does |
|---|---|
| `make dev` | Infra plus api, worker, and web together |
| `make infra` / `make down` | Start / stop only Postgres and Redis |
| `make migrate` | `alembic upgrade head` |
| `make test` | api tests (pytest) and web checks |
| `make lint` | ruff, ruff format check, and mypy (api); eslint (web) |
| `make gen-client` | Regenerate the typed web API client from the API's OpenAPI schema. Run it after any route or schema change; CI fails if the client is stale |

Per package: `cd api && uv run …` and `cd web && pnpm …`.

## Repo layout

```
web/                  Next.js app: creator studio (/studio) and public pages (/p/[slug])
api/app/
  routes/             FastAPI routers
  services/           business logic (persona, chat, context, guardrails)
  llm/router.py       the only place that calls LLM providers
  prompts/            prompt templates (.md, versioned)
  workers/            Arq jobs (compile, embed)
  models/ schemas/    SQLAlchemy models, Pydantic schemas
api/migrations/       Alembic
api/tests/
db/                   reference schema and launch-metric queries
docs/                 product, architecture, flows, prompts, roadmap
scripts/ experiments/ offline research tools, never imported by the app
```

## Privacy and safety

- **Private examples stay private.** Visitors' chats only use examples marked public. Owners
  testing their own persona can use everything.
- **Published versions are immutable.** Every edit creates a new version, and each conversation
  records which version it used.
- **Every answer passes guardrails** (moderation) before it is streamed and stored.
- **Every public endpoint is rate-limited** per visitor, per persona, and by creator daily spend.

## Docs

| Doc | Contents |
|---|---|
| [`PRODUCT.md`](docs/PRODUCT.md) | What we are building, modes, privacy, non-goals |
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, context strategies, routing, caching |
| [`FLOWS.md`](docs/FLOWS.md) | Diagrams of the app as built |
| [`PROMPTS.md`](docs/PROMPTS.md) | Compiler, classifier, runtime, and judge prompts |
| [`ROADMAP.md`](docs/ROADMAP.md) | Milestones, acceptance criteria, launch checkpoint |
| [`LORA_EXPERIMENT.md`](docs/LORA_EXPERIMENT.md) | Offline fine-tuning experiment (X1) |

Contributor and AI-agent rules are in [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE)
