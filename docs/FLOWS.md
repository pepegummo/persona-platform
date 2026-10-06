# Flows — how the web app works end to end

Diagrams of the Phase 1A app as built (M0–M4a + the UI redesign). Each diagram names the code
that implements it; the table at the end maps every step to a file. Update this file when a flow
changes. Design intent lives in `ARCHITECTURE.md`; this file describes what the code does today.

## 1. User flow

Two people: the **creator** (signed in, uses `/studio`) and the **visitor** (anonymous, opens a
shared `/p/<slug>` link).

```mermaid
flowchart TD
  subgraph Creator
    L["/ landing"] --> N["/studio/new<br/>name · slug · description"]
    S["/studio list<br/>next-step hint per persona"] --> E
    N -->|POST /api/personas| E["/studio/[id] editor"]
    E --> X["Examples tab<br/>add Q→A, mark public / private"]
    E --> ST["Settings tab<br/>tone, language, profile, vocabulary, rules"]
    X --> C{"Compile<br/>(button in header)"}
    ST --> C
    C -->|status ready| T["Test tab<br/>owner chat, private examples allowed"]
    T --> P{"Publish tab<br/>needs status ready<br/>and ≥ 3 public examples"}
    P -->|unlisted / public| SH["Share box<br/>copy link · LINE · X"]
    SH -.edit after publish.-> E
  end
  subgraph Visitor
    SH ==>|link| V["/p/[slug]<br/>AI label always visible"]
    V -->|POST /open| V
    V --> CH["chat (SSE)"]
    V --> R["report dialog"]
    V --> CTA["create your own →"]
  end
  CTA --> N
```

Notes
- The editor's checklist (basics · 3 examples · 3 public · compiled · published) is computed in the
  browser from the loaded persona (`web/src/lib/persona-progress.ts`); the API enforces the real
  publish rule in `services/persona.py::publish`.
- Editing a published persona clones it into a new draft version first (hard rule 2), so the
  shared link keeps serving the published version until the creator publishes again.

## 2. System architecture

```mermaid
flowchart LR
  B["Browser<br/>Next.js App Router<br/>web/"] -- "REST + SSE<br/>Bearer Clerk JWT or dev token<br/>signed visitor cookie" --> A["FastAPI<br/>api/app/main.py"]
  A --> PG[("Postgres 16<br/>+ pgvector")]
  A --> RD[("Redis<br/>rate limits · Arq queue")]
  RD --> W["Arq worker<br/>compile_version"]
  W --> PG
  A --> LR["LLMRouter<br/>llm/router.py"]
  W --> LR
  LR -- "spend cap · fallback<br/>logs llm_calls" --> PG
  LR --> PR["Providers via LiteLLM<br/>Anthropic / Gemini / Groq<br/>or fake (dev)"]
```

Hard rules visible in this picture
- **1** — only `LLMRouter` talks to providers; the browser never does.
- **3** — visitor context uses public (or synthetic) examples only (`services/context.py`).
- **4** — every answer passes guardrails before it streams (`services/guardrails.py`).
- **6** — public endpoints are rate limited in Redis (`services/ratelimit.py`).

## 3. Sequence — compile

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (editor)
  participant A as FastAPI
  participant DB as Postgres
  participant Q as Redis (Arq)
  participant W as Worker
  participant LR as LLMRouter
  B->>A: POST /api/personas/{id}/compile
  A->>DB: latest version.status = compiling
  A->>Q: enqueue compile_version(version_id)
  A-->>B: 202 VersionSummary
  loop every 2 s while status = compiling
    B->>A: GET /api/personas/{id}
    A-->>B: draft.status
  end
  Q->>W: compile_version
  W->>DB: load version + examples
  W->>W: 1 choose hold-outs (≥5 examples)
  W->>LR: 2 tag shapes (shape_classifier prompt)
  W->>LR: 3 embed examples missing vectors
  W->>LR: 4 style card (compiler prompt, non-held-out)
  W->>W: 5 choose fixed examples (≤8, distinct shapes)
  W->>DB: status = ready (or failed), compiled_at
  B->>A: GET (next poll)
  A-->>B: status ready → toast + checklist ticks
```

## 4. Sequence — visitor chat (SSE)

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (/p/slug)
  participant A as public_chat route
  participant RL as Redis rate limits
  participant C as ChatService
  participant G as Guardrails (moderation)
  participant LR as LLMRouter
  participant DB as Postgres
  B->>A: POST /api/public/p/{slug}/chat {message, conversation_id}
  A->>DB: published persona + version (404 if private)
  A->>RL: visitor/min · visitor/day · persona/day
  A->>C: stream(ChatRequest is_owner=false)
  C->>DB: conversation + history
  C->>G: check_input(message)
  C->>DB: store user message (+ blocked_reason) · event visitor_message_sent
  C-->>B: event: conversation
  alt input blocked
    C-->>B: event: blocked
  else allowed
    C->>C: context = style card + public fixed examples
    C->>LR: stream(chat_simple)
    LR->>DB: spend cap check (owner's daily cap)
    loop every 200 new chars
      LR-->>C: deltas
      C->>G: check_output(last 400 chars)
      C-->>B: event: delta (only text that passed)
    end
    C->>G: final check on full answer
    LR->>DB: llm_calls row (model, tokens, cost)
    C->>DB: store assistant message
    C-->>B: event: done  (or blocked: stored with reason, not shown)
  end
```

The owner's test chat (`POST /api/personas/{id}/test-chat`) runs the same `ChatService` with
`is_owner=true`: private examples are allowed and visitor rate limits do not apply (the spend cap
still does).

## 5. Data model

```mermaid
erDiagram
  users ||--o{ personas : owns
  personas ||--o{ persona_versions : has
  personas |o--o| persona_versions : "published_version_id"
  persona_versions ||--o{ examples : contains
  examples |o--o{ examples : "synthetic_of"
  persona_versions ||--o{ conversations : "answered by"
  users |o--o{ conversations : "user_id (null = visitor)"
  conversations ||--o{ messages : contains
  persona_versions |o--o{ llm_calls : "persona_version_id"
  users |o--o{ llm_calls : "billed_user_id"
  personas |o--o{ events : analytics
  personas ||--o{ reports : reported
```

Settings (`language`, `tone`, `profile{}`, `vocabulary{}`, …), `rules`, `style_card` and
`fixed_example_ids` live on `persona_versions`. Phase 2+ tables already in `db/schema.sql` but
unused in 1A: `knowledge_chunks`, `likes`, `eval_runs`.

## Where in the code

| Step | Web | API |
|---|---|---|
| Landing, studio list, create | `web/src/app/page.tsx`, `app/studio/page.tsx`, `app/studio/new/page.tsx` | `routes/personas.py` → `services/persona.py::create_persona`, `list_personas` |
| Editor + checklist | `app/studio/[id]/page.tsx`, `components/persona/*`, `lib/persona-progress.ts` | `routes/personas.py` (get, patch, examples) |
| New draft on edit | — | `services/persona.py::ensure_editable_version` |
| Compile | header button + 2 s poll in `app/studio/[id]/page.tsx` | `services/persona.py::start_compile` → `workers/compile.py` → `services/compile.py::Compiler` |
| Publish / unpublish | `components/persona/publish-panel.tsx` | `services/persona.py::publish`, `unpublish` |
| Public page + open event | `app/p/[slug]/page.tsx`, `components/chat/public-chat.tsx` | `routes/public.py` (get, `/open`) |
| Chat UI + SSE parsing | `components/chat/chat-panel.tsx`, `lib/api/sse.ts` | `routes/public.py::public_chat`, `routes/personas.py::test_chat` → `services/chat.py` |
| Context | — | `services/context.py` (`visible_examples`, `fixed_examples`) |
| Guardrails | blocked bubble in `chat-panel.tsx` | `services/guardrails.py`, `services/moderation.py` |
| Rate limits | — | `services/ratelimit.py` |
| LLM calls, spend cap, logging | never (hard rule 1) | `llm/router.py` |
| Report | `components/chat/report-dialog.tsx` | `routes/public.py::report_persona` |
| Auth | `lib/auth/context.tsx`, `proxy.ts` | `app/auth.py` (Clerk JWKS; `dev:<id>` tokens when `AUTH_DEV_BYPASS=true`), `app/visitor.py` (signed visitor cookie) |
