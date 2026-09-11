# Architecture

## Overview

```text
┌──────────────────────── BROWSER ─────────────────────────┐
│  Creator studio            Public persona page           │
│  create · test · publish   /p/{slug} → chat              │
└───────────────┬──────────────────────────┬───────────────┘
                │ HTTPS (JSON)             │ HTTPS + SSE streaming
                ▼                          ▼
┌──────────────────────────────────────────────────────────┐
│ FastAPI backend (stateless, autoscaled, CPU only)        │
│                                                          │
│  routes/personas   routes/chat   routes/public  export   │
│        │               │                                 │
│        ▼               ▼                                 │
│  PersonaService   ChatService ─► ContextBuilder          │
│        │               │         (simple | like_me)      │
│        │               ▼                                 │
│        │         Guardrails ◄──── LLM router ──────────┐ │
│        ▼                                               │ │
│  enqueue jobs ──► Arq workers                          │ │
│                   compile · embed · eval · synth       │ │
└──────────────────────────┬─────────────────────────────┼─┘
                           │                             │ HTTPS
                           ▼                             ▼
         Postgres + pgvector · Redis        LLM providers (GPU is theirs)
         object storage (exports)           frontier API · (later) Typhoon host
```

The LLM never runs in the browser or on our servers during Phase 1–2. The backend builds the
prompt, calls a provider over HTTPS, and relays the stream to the browser.

## Components

| Component | Responsibility |
|---|---|
| `PersonaService` | CRUD, create new version on edit, publish, visibility, clone/remix (later), export |
| Workers | On save: compile style card, choose fixed examples, tag question shapes, embed, synthetic rewrites of private examples, run eval |
| `ChatService` | Load persona version, build context, call router, run guardrails, stream, persist messages |
| `ContextBuilder` | Two strategies: `SimpleStrategy`, `LikeMeStrategy` (same interface) |
| `LLMRouter` | Maps a task to provider/model, fallbacks, timeouts, spend caps, logs `llm_calls` |
| `Guardrails` | Leak check against private examples, moderation, label injection |
| `EvalService` | Held-out examples → generate → judge → score per mode |

## Publish flow

```text
Creator clicks Save
  → PersonaService writes persona_versions (status = 'compiling')
  → enqueue compile_version(version_id)
  Worker:
    1. compile style card (LLM, prompts/compiler.md) → persona_versions.style_card (JSON)
    2. tag each example with a shape (prompts/shape_classifier.md) → examples.shape
    3. embed each example question → examples.embedding
    4. pick fixed examples: up to 8, covering distinct shapes, prefer public/synthetic
    5. for each private example: synthetic rewrite (prompts/synthetic_rewrite.md)
       → new examples row with synthetic_of = original id, is_private = false
    6. run eval for both modes → eval_runs, persona_versions.eval_score_*
  → status = 'ready'
Creator clicks Publish → personas.published_version_id = version_id
```

Lean MVP: steps 5 and 6 are skipped (`FEATURE_SYNTH_REWRITE` and `FEATURE_EVAL` off).

Hold out 20% of examples (min 2, max 10) for eval; they must not be used as fixed examples in the
eval run that scores them.

## Chat flow

```text
POST /api/public/p/{slug}/chat   { conversation_id?, message }
  1. rate limit (visitor, persona, creator spend) — Redis
  2. load published version from Redis (fallback Postgres), cache key = version_id
  3. is_owner = request.user_id == persona.owner_id
  4. context = strategy(version.mode).build(version, message, history, is_owner)
  5. stream = router.stream(task = route_for(version, tier), messages = context)
  6. guardrails over the stream (chunked leak check + moderation)
  7. SSE to browser; on finish persist messages + llm_calls
```

## Context strategies

```python
class SimpleStrategy:
    def build(self, v, question, history, is_owner):
        examples = v.fixed_examples(allow_private=is_owner)
        return [system(runtime_prompt(v.style_card, v.rules, examples))] + history + [user(question)]

class LikeMeStrategy:
    def build(self, v, question, history, is_owner):
        shape = classify_shape(question)                         # cheap model
        examples = retrieve_examples(
            v, question, shape, k=6, mmr_lambda=0.5,
            allow_private=is_owner,                              # visitors get public + synthetic only
        )
        knowledge = retrieve_knowledge(v, question, k=4)         # later milestone
        return [system(runtime_prompt(v.style_card, v.rules, examples, knowledge))] + history + [user(question)]
```

Retrieval for style: filter `persona_version_id` and `shape`, rank by embedding similarity, then MMR
for diversity. If fewer than 3 matches, fill with fixed examples. Each persona has at most a few
hundred examples, so filtering by version first keeps queries small.

Prompt order matters for caching: static part first (style card, rules, fixed examples), then
dynamic parts (retrieved examples, knowledge, history, question).

History: keep the last N turns within a token budget (default 4k tokens). Summarize older turns later.

## Model routing

Configured via env (see `.env.example`), task → model:

| Task | Default | Notes |
|---|---|---|
| `compile` | strong frontier model | runs once per save |
| `synth_rewrite` | strong frontier model | once per private example |
| `shape_classify` | small fast model | every Like Me message; cache by normalized question |
| `chat_simple` | fast frontier model | Phase 3: free tier → hosted Typhoon |
| `chat_like_me` | strong frontier model | |
| `judge` | strong frontier model | eval only |

Router responsibilities: timeouts, one retry, fallback provider on 429/5xx, per-creator daily spend
cap (reject with a friendly message when exceeded), log every call to `llm_calls`.

## Guardrails

- **Leak check**: build character 8-gram sets (after normalizing whitespace and case) for every
  private example answer of the version. For each output chunk window (~200 chars), compute the
  fraction of its 8-grams found in any private set. If > 0.35, stop the stream and return a safe
  fallback. Thresholds are config values; tune with tests. Character n-grams are used because
  Thai has no spaces between words.
- **Moderation**: input and output moderation via provider moderation or a classifier. Phase 3
  option: a Thai-specific safety classifier as a cheap first pass.
- **Label**: UI always shows "AI version of {display_name}". The runtime prompt forbids claiming to
  be the real person.

## Caching

- `persona:v:{version_id}` → compiled version JSON (immutable, long TTL)
- `slug:{slug}` → published version id (short TTL, invalidated on publish)
- `shape:{hash(normalized question)}` → shape tag
- Provider prompt caching on the static prefix of runtime prompts
- Later: semantic cache for first-turn answers per version (first message only)

## Security

- Clerk JWT verification on creator routes; public chat allows anonymous with a signed visitor id cookie.
- Owner checks on every persona mutation.
- CORS restricted to the web origin. Embed widget (later) gets its own origin allowlist per persona.
- Prompt injection from visitors: runtime prompt tells the model never to reveal its instructions
  or examples; the leak check is the real protection.

## Scaling stages

| Stage | Setup |
|---|---|
| Launch | 1 API container, 1 worker, managed Postgres, managed Redis, frontier API |
| Growth | Autoscale API on concurrency, more workers, Redis persona cache, spend caps enforced |
| Large | Semantic cache, multi-provider fallback, Postgres read replicas, partition `messages` by month |
| Marketplace | GPU pool with vLLM multi-LoRA for Pro personas (Phase 4) |

Self-host models only when steady traffic keeps GPUs busy most of the day; otherwise per-token
APIs are cheaper.
