# Product spec

## One sentence

A web platform where anyone can create an AI that answers in their own style using settings and
conversation examples, then test it and share it by link so friends and others can chat with it.

## Users

- **Creator** — builds a persona from their own style, tests it, publishes it, shares the link.
- **Visitor** — opens a share link (`/p/{slug}`) and chats with the persona. Can be anonymous
  (rate-limited) or signed in.

## What works and what doesn't (set expectations in the UI)

The persona copies **how** the creator answers: tone, length, format, Thai-English mixing,
particles (ครับ / ค่ะ / นะ), habits like ending with "สรุป:". It does **not** know what the creator
knows or their personal life. It must say it doesn't know rather than invent facts about the owner.

Best fit: "explain and advise" personas (tech explainer, teacher, coding reviewer).
Weaker fit: "be me in casual chat with my friends" — allowed, positioned as fun.

## Persona definition

- Name, slug, display name, description, avatar
- Settings: language (th / en / mixed), tone, answer length, technical level, personality,
  writing style, formatting preferences (bullets, comparisons, analogies)
- Profile facts (optional key → value, e.g. อายุ, ราศี, สีที่ชอบ, เกมที่ชอบ): the AI answers from
  them when asked; never shown on the public page, never used to build the style card
- Vocabulary / slang (optional key → value: word → meaning + when it is used) so the AI uses the
  creator's own words correctly
- Custom rules (free text, e.g. "always end with สรุป:")
- Examples: Question → Answer pairs, each marked private or public
- Knowledge documents (optional, later milestone)
- Mode: **Simple** or **Like Me**
- Visibility: private / unlisted / public

## Two modes

| | Simple | Like Me |
|---|---|---|
| Context | Style card + fixed example set | Style card + examples matching the question's shape + knowledge |
| Cost / speed | Cheapest, fastest (one cached call) | 2–4× cost, slightly slower |
| Fidelity | General tone | Closer to how the creator answers each type of question |
| Recommended when | < 20 examples | ≥ 20 examples with varied question types |

The creator chooses the mode. Visitors get whatever mode was published.
The Test screen shows the same question answered in both modes side by side with eval scores,
and recommends a mode based on example count and score difference.

## Core flow

Create → Teach (add examples) → Test (side-by-side, scores) → Publish → Share link → Visitors chat
→ Creator improves → new version.

## Lean MVP (Phase 1A — build first)

- Sign in, create/edit persona, add examples (each marked public or private)
- Compile on save (style card, fixed examples, shape tags, embeddings)
- Owner test chat with streaming answers
- Publish with visibility; public page `/p/{slug}` with streaming chat, Simple mode only
- Visitors' prompts use public examples only; private examples are used only in owner tests
- "AI version of {name}" label, rate limits, daily spend cap, moderation, report button

Stop and measure at the Launch checkpoint (see ROADMAP.md) before building more.

## Full MVP (Phase 1B)

- Eval scores and leak check
- Like Me mode with side-by-side test and mode recommendation
- Synthetic rewrites of private examples; export as JSON and system prompt

## Later features

- Phase 2: explore/search, likes, follow creators, clone and remix, collections, knowledge docs,
  embed widget, version history UI
- Phase 3: cheaper model tier for free users (hosted Thai-tuned open model), self-check rewrite
  for Like Me
- Phase 4: LoRA "Pro Persona" and creator marketplace with payouts — only if the offline
  X1 experiment shows adapters beat prompt-only personas (docs/LORA_EXPERIMENT.md)

## Privacy

- Original examples are never automatically public.
- Each example has its own private flag. Private examples are rewritten into synthetic examples
  (same style, different content) for use with visitors.
- The public page can show the style settings and public examples; never private ones.
- Output leak check blocks answers that copy private examples.
- Upload warning: no passwords, API keys, confidential company data, or other people's private
  messages. Chat logs often contain other people's messages — this matters under Thailand's PDPA.
- Owners see aggregate stats about visitor chats. Whether owners can read full visitor chats is
  an explicit setting shown to visitors before they chat (default: no).
- Privacy policy must state that prompts are processed by third-party model providers.

## Safeguards

- Always labeled as AI. Never claims to be the real person.
- Only the real person may publish an "AI version of me". Personas of real third parties
  (celebrities, coworkers) are not allowed as "AI version of"; style-inspired personas must not
  use a real person's name or photo.
- Knowledge-boundary rule in every runtime prompt: don't invent facts about the owner's life,
  plans, or opinions.
- Moderation on inputs and outputs; report button on public personas.

## Non-goals (for now)

- LINE or other messaging channels
- Running models in the browser
- Self-hosted GPUs, LoRA, fine-tuning (Phase 3+)
- Mobile apps (responsive web only)

## Validation test (run before heavy investment)

"Can your friends tell you from your AI?" — mix 10 persona answers with 10 real answers, ask
5 friends to pick the real ones. Build the in-app version of this as a shareable game later.
