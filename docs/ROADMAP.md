# Roadmap

Work one milestone at a time. Each milestone ends with passing tests and a demo-able result.
Tick `[x]` when an acceptance criterion passes.

```text
Phase 1A  Lean MVP ─────────► LAUNCH CHECKPOINT ──► Phase 1B  Full MVP
M0 M1 M2 M3 M4a               (measure, decide)      M4b M5 M6
                                     │
                                     └──► X1  LoRA experiment (offline, optional, $0)
                                              result decides whether Phase 4 happens
Phase 2  Social (M7–M9)   Phase 3  Cost & quality   Phase 4  Pro personas (LoRA)
```

**Build Phase 1A first and stop at the Launch checkpoint.** Do not start Phase 1B, X1, or later
phases until the checkpoint section says so.

Feature flags (env) keep later features off without deleting code:
`FEATURE_EVAL`, `FEATURE_SYNTH_REWRITE`, `FEATURE_LIKE_ME`, `FEATURE_EXPORT` — all `false` in Phase 1A.

---

## Phase 1A — Lean MVP (build first)

Goal: prove people will create a persona, share the link, and friends will chat with it.
Scope: create persona → Simple mode → share link → visitors chat, with label, rate limits,
spend cap, and moderation. No eval, no Like Me, no synthetic rewrites, no export.

Privacy in the lean MVP relies on hard rule 3 (CLAUDE.md): visitors' prompts only contain examples
marked public. Private examples are used only when the owner tests. So no leak check is needed yet.

### M0 — Scaffold

Tasks
- Monorepo: `web/` (Next.js, TS strict, Tailwind, shadcn/ui), `api/` (FastAPI, uv), `db/`, `docs/`
- `docker-compose.yml` with `pgvector/pgvector:pg16` and `redis:7`
- FastAPI app with `/health`, settings via pydantic-settings reading `.env`, feature flags
- Alembic initialized; first migration enables `vector` and `pgcrypto` extensions
- Makefile: `dev`, `test`, `lint`, `migrate`, `gen-client`
- GitHub Actions: lint + test for api and web
- Update CLAUDE.md "Commands" with the real commands

Acceptance
- [x] `make dev` starts db, redis, api (:8000), web (:3000)
- [x] `GET /health` returns `{"status":"ok"}` and checks db + redis
- [ ] `make test` and `make lint` pass in CI (pass locally; workflow written, needs a push to run)

### M1 — Data model and persona CRUD

Tasks
- Alembic migrations from `db/schema.sql` (users, personas, persona_versions, examples,
  conversations, messages, llm_calls)
- Clerk auth: web sign-in; FastAPI dependency verifying JWT via JWKS; upsert `users` on first call
- Endpoints: create persona, get, list mine, update settings (creates new version if the current
  one is published), add/edit/delete examples on the draft version, toggle example private flag
- `gen-client` generates the TS client from OpenAPI
- Creator studio: persona list, persona editor (settings form + examples table), Thai + English UI
- Upload warning text (no passwords, API keys, confidential data, other people's messages)

Acceptance
- [ ] Creating and editing a persona works end to end in the browser
- [ ] Editing a published version creates a new draft; the old version is unchanged (test)
- [ ] Non-owners get 403 on mutations (test)
- [ ] Thai text round-trips correctly (fixture test)

### M2 — LLM router and compile worker

Tasks
- `app/llm/router.py` with LiteLLM: task → model from env, timeout, one retry, fallback,
  logs to `llm_calls`, per-creator daily spend cap
- Prompt loader for `app/prompts/*.md`
- Arq worker `compile_version`: style card, shape tags, embeddings, fixed example selection,
  hold-out marking, status transitions (`draft → compiling → ready | failed`).
  Synthetic rewrite and eval steps exist only behind flags (off).
- "Save & compile" button with status polling

Acceptance
- [ ] Compiling a persona with the Kafka vs MQTT example produces a valid style card JSON
- [ ] Every example has a shape and an embedding after compile
- [ ] Spend cap blocks calls once exceeded (unit test with mocked costs)
- [ ] Router falls back when the primary model returns 429 (unit test)

### M3 — Simple mode chat and public page

Tasks
- `ContextBuilder` with `SimpleStrategy`; runtime prompt from `prompts/runtime.md`
- `POST /api/personas/{id}/test-chat` (owner; may use private examples) with SSE
- Publish endpoint + visibility (private / unlisted / public), slug uniqueness
- `POST /api/public/p/{slug}/chat` with SSE; anonymous visitor id cookie;
  context uses **public examples only** (hard rule 3)
- Redis rate limits (visitor/minute, visitor/day, persona/day)
- Public page `/p/{slug}`: persona header, "AI version of {name}" label, streaming chat UI
- Persist conversations and messages with `persona_version_id`
- Publish is blocked with a clear message if the version has fewer than 3 public examples

Acceptance
- [ ] A visitor can open a share link and chat with streaming answers
- [ ] Label is visible on every public chat
- [ ] Visitor context never contains private examples (test inspects the built prompt)
- [ ] Private persona returns 404 to non-owners; unlisted is not listed but works by link
- [ ] Rate limit returns 429 with a friendly Thai/English message

### M4a — Moderation and launch basics

Tasks
- Input and output moderation (provider moderation or classifier); blocked messages stored with
  `blocked_reason`
- Report button on public persona pages (stores reports; email/admin view can be minimal)
- Basic analytics events: persona_created, persona_published, share_link_opened,
  visitor_message_sent (per conversation count) — a simple `events` table is fine
- Privacy policy + terms pages (state that prompts go to third-party model providers)

Acceptance
- [ ] A clearly unsafe input is blocked with a friendly message (test, Thai and English)
- [ ] The three checkpoint metrics below can be computed with one SQL query each

### LAUNCH CHECKPOINT — stop here

Launch to a small group (friends, one or two communities). After 2–4 weeks, measure:

1. Publish rate: personas published ÷ personas created
2. Share reach: unique visitors per published persona
3. Engagement: share of visitor conversations with 3+ messages

Decide:
- Numbers weak → fix onboarding / example-writing UX before building more
- Complaints "doesn't sound like me" → Phase 1B with M5 (Like Me) and M4b (eval) first
- Creators hesitate to add examples because of privacy → M6 (synthetic rewrites) first
- Strong interest in "more like me" from power users → run X1 (LoRA experiment)

---

## Phase 1B — Full MVP

### M4b — Leak check and eval
- Leak check (character 8-grams, chunked over the stream) against private examples
- `EvalService` + worker: held-out examples → generate in Simple mode → judge → score;
  enable `FEATURE_EVAL`
- Test screen shows score and per-example judge notes
- Acceptance
  - [ ] A crafted answer copying a private example is blocked (Thai and English tests)
  - [ ] Eval score appears after compile for personas with ≥ 5 examples

### M5 — Like Me mode
- `LikeMeStrategy`: shape classification (cached), pgvector retrieval filtered by version + shape,
  MMR, fill with fixed examples; enable `FEATURE_LIKE_ME`
- Eval for Like Me; store both scores
- Test screen: same question in both modes side by side with scores; mode selector; recommendation
- Acceptance
  - [ ] A comparison question retrieves comparison-shaped examples (test)
  - [ ] Side-by-side test streams in both panels
  - [ ] Mode recommendation follows the rule in PRODUCT.md

### M6 — Privacy and export
- Synthetic rewrite worker for private examples (leak check on each rewrite);
  enable `FEATURE_SYNTH_REWRITE`
- Visitor context uses public + synthetic examples
- Visitor notice about whether the owner can read chats; owner setting
- Export: persona JSON (settings, style card, public + synthetic examples) and a ready-to-paste
  system prompt; enable `FEATURE_EXPORT`
- Acceptance
  - [ ] Every private example has a synthetic counterpart or is excluded from visitor prompts
  - [ ] Export never contains private examples (test)

---

## X1 — LoRA experiment (offline, optional)

Full spec: `docs/LORA_EXPERIMENT.md`. Notebook: `experiments/lora/persona_lora_kaggle.ipynb`.
Question it answers: does a LoRA adapter on a Thai open model imitate style better than
prompt-only? Cost: $0 (Kaggle free GPU). Can start after M2 exists.

App-side tasks (in the repo)
- `scripts/expand_dataset.py`: generate synthetic training pairs per persona with the frontier
  model (`prompts/style_expand.md`), from **train** examples only
- `scripts/export_lora_dataset.py`: write one JSONL per persona in the format in LORA_EXPERIMENT.md,
  including held-out examples with a frontier prompt-only `baseline_answer`.
  Requires `--persona-ids` allowlist and `--consent-confirmed`; refuses personas not owned by an
  allowlisted user
- `scripts/judge_experiment.py`: read export + notebook results, run `prompts/judge.md` on every
  condition, write `experiments/lora/reports/{persona}_report.md` with a comparison table

Offline tasks (manual, on Kaggle)
- Upload export JSONL as a **private** Kaggle dataset, run the notebook per persona, download results

Acceptance
- [ ] Export contains no example with `split = heldout` that was used for synthetic expansion (test)
- [ ] Judge report compares 3 conditions: `lora`, `typhoon_prompt_only`, `frontier_prompt_only`
- [ ] Decision recorded in `docs/LORA_EXPERIMENT.md` ("Results" section)

Rule: nothing in `experiments/` or `scripts/` is imported by the app.

---

## Phase 2 — Social

### M7 — Knowledge documents
- Upload text/PDF/Markdown → chunk → embed → `knowledge_chunks`; retrieval in Like Me
- Acceptance: persona answers using uploaded doc facts in the creator's style

### M8 — Explore, likes, clone, remix
- Explore page with search (Postgres full-text + trigram; Thai-aware later)
- Likes, follows, clone (public settings + public examples only), remix (field-by-field merge with
  explicit conflict choices), version history UI
- Acceptance: clone never copies private examples; remix creates a new persona with lineage

### M9 — Embed widget
- Script-tag widget for creators' sites; per-persona origin allowlist

---

## Phase 3 — Cost and quality

- Free tier Simple mode routed to a hosted Thai-tuned open model, only if the eval harness shows
  acceptable scores
- Like Me self-check (judge → rewrite once if below threshold), paid feature
- Semantic cache for first-turn answers per version
- Thai-specific safety classifier as first-pass moderation

## Phase 4 — Pro personas (only if X1 says yes)

- Automated pipeline: synthetic expansion → training job (paid GPU or hosted fine-tuning) →
  eval gate (adapter must beat prompt-only) → adapter registry
- Serving: multi-LoRA host that supports the chosen base model, or vLLM multi-LoRA on rented GPUs
- Creator payouts / marketplace
