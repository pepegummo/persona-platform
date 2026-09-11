"""Provider backends behind the router.

`LiteLLMProvider` talks to real providers via LiteLLM. `FakeProvider` produces deterministic,
plausible output with no network or keys (local demos, CI). Tests use their own stubs. Nothing
outside `app/llm` may import LiteLLM.
"""

import hashlib
import json
import math
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol

Message = dict[str, str]  # {"role": "system" | "user" | "assistant", "content": str}


class ProviderError(Exception):
    """Normalized provider failure. `retryable` drives retry + fallback in the router."""

    def __init__(self, message: str, *, retryable: bool, status: int | None = None) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status = status


@dataclass
class Usage:
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


@dataclass
class Completion:
    text: str
    usage: Usage = field(default_factory=Usage)


@dataclass
class StreamEnd:
    """Yielded last by `stream()` so callers can log usage."""

    usage: Usage


class Provider(Protocol):
    async def complete(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
        json_mode: bool,
    ) -> Completion: ...

    def stream(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
    ) -> AsyncIterator[str | StreamEnd]: ...

    async def embed(
        self, *, model: str, texts: list[str], timeout_s: float, api_key: str | None
    ) -> tuple[list[list[float]], Usage]: ...


# --- LiteLLM ---------------------------------------------------------------------------------


class LiteLLMProvider:
    def __init__(self) -> None:
        import litellm

        litellm.drop_params = True  # ignore params a given provider does not support
        litellm.suppress_debug_info = True
        self._litellm = litellm

    def _wrap(self, e: Exception) -> ProviderError:
        ll = self._litellm
        retryable = isinstance(
            e,
            ll.RateLimitError
            | ll.Timeout
            | ll.APIConnectionError
            | ll.ServiceUnavailableError
            | ll.InternalServerError,
        )
        status = getattr(e, "status_code", None)
        return ProviderError(f"{type(e).__name__}: {e}", retryable=retryable, status=status)

    def _usage(self, response: Any) -> Usage:
        u = getattr(response, "usage", None)
        details = getattr(u, "prompt_tokens_details", None)
        cached = getattr(details, "cached_tokens", None) or 0
        try:
            cost = float(self._litellm.completion_cost(completion_response=response) or 0.0)
        except Exception:
            cost = 0.0
        return Usage(
            input_tokens=int(getattr(u, "prompt_tokens", 0) or 0),
            cached_input_tokens=int(cached),
            output_tokens=int(getattr(u, "completion_tokens", 0) or 0),
            cost_usd=cost,
        )

    async def complete(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
        json_mode: bool,
    ) -> Completion:
        kwargs: dict[str, Any] = {}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        try:
            response = await self._litellm.acompletion(
                model=model,
                messages=messages,
                timeout=timeout_s,
                max_tokens=max_tokens,
                api_key=api_key or None,
                **kwargs,
            )
        except Exception as e:
            raise self._wrap(e) from e
        text = response.choices[0].message.content or ""
        return Completion(text=text, usage=self._usage(response))

    async def stream(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
    ) -> AsyncIterator[str | StreamEnd]:
        try:
            response = await self._litellm.acompletion(
                model=model,
                messages=messages,
                timeout=timeout_s,
                max_tokens=max_tokens,
                api_key=api_key or None,
                stream=True,
                stream_options={"include_usage": True},
            )
            chunks: list[Any] = []
            async for chunk in response:
                chunks.append(chunk)
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    yield delta
        except ProviderError:
            raise
        except Exception as e:
            raise self._wrap(e) from e
        usage = Usage()
        try:
            full = self._litellm.stream_chunk_builder(chunks, messages=messages)
            usage = self._usage(full)
        except Exception:
            pass
        yield StreamEnd(usage=usage)

    async def embed(
        self, *, model: str, texts: list[str], timeout_s: float, api_key: str | None
    ) -> tuple[list[list[float]], Usage]:
        try:
            response = await self._litellm.aembedding(
                model=model, input=texts, timeout=timeout_s, api_key=api_key or None
            )
        except Exception as e:
            raise self._wrap(e) from e
        vectors = [list(map(float, item["embedding"])) for item in response.data]
        u = getattr(response, "usage", None)
        try:
            cost = float(self._litellm.completion_cost(completion_response=response) or 0.0)
        except Exception:
            cost = 0.0
        usage = Usage(input_tokens=int(getattr(u, "prompt_tokens", 0) or 0), cost_usd=cost)
        return vectors, usage


# --- Fake -------------------------------------------------------------------------------------

_SHAPE_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("comparison", re.compile(r"\bvs\.?\b|กับ.*ต่าง|ต่างกัน|เทียบ|ดีกว่า|difference|compare", re.I)),
    ("how_to", re.compile(r"\bhow (do|to|can)\b|ยังไง|อย่างไร|วิธี|ทำไง|steps?", re.I)),
    (
        "troubleshooting",
        re.compile(r"\berror\b|fail|broken|พัง|ไม่ทำงาน|not working|crash|bug", re.I),
    ),
    ("recommendation", re.compile(r"should i|ควรใช้|แนะนำ|เลือกอะไร|which one|recommend", re.I)),
    ("opinion", re.compile(r"คิดว่า|คิดยังไง|what do you think|opinion|เห็นด้วย", re.I)),
    ("definition", re.compile(r"what is|what are|คืออะไร|คือ|อธิบาย|explain|หมายถึง", re.I)),
    ("casual", re.compile(r"^(hi|hello|hey|สวัสดี|หวัดดี|เป็นไง|กินข้าว)", re.I)),
]


def fake_shape(question: str) -> str:
    for shape, pattern in _SHAPE_RULES:
        if pattern.search(question):
            return shape
    return "other"


def fake_embedding(text: str, dim: int) -> list[float]:
    """Deterministic unit vector from a hash; similar strings do NOT get similar vectors."""
    seed = hashlib.sha256(text.strip().lower().encode("utf-8")).digest()
    values: list[float] = []
    counter = 0
    while len(values) < dim:
        block = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
        values.extend((b - 127.5) / 127.5 for b in block)
        counter += 1
    values = values[:dim]
    norm = math.sqrt(sum(v * v for v in values)) or 1.0
    return [v / norm for v in values]


class FakeProvider:
    """No-network stand-in. Recognizes the app's prompts by their first line."""

    def __init__(self, embedding_dim: int = 1024) -> None:
        self.embedding_dim = embedding_dim

    def _answer(self, messages: list[Message]) -> str:
        system = next((m["content"] for m in messages if m["role"] == "system"), "")
        user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        if system.startswith("You are analyzing how a specific person writes"):
            return json.dumps(_fake_style_card(system), ensure_ascii=False)
        if user.startswith("Classify the question into exactly one shape"):
            q = user.split("Question:", 1)[-1].split("Return only JSON", 1)[0].strip()
            return json.dumps({"shape": fake_shape(q)})
        if user.startswith("You are a content safety classifier"):
            return json.dumps({"safe": True, "category": None})
        # Chat: a short reply that clearly comes from a fake model.
        name = "persona"
        m = re.search(r"You are the AI version of (.+?)\.", system)
        if m:
            name = m.group(1)
        return (
            f"[fake model] {name} ตอบว่า: {user.strip()[:80]} — สั้นๆ คือ ตอบในสไตล์ของ {name} นะ\n\n"
            f"สรุป: นี่คือคำตอบจำลอง ยังไม่ได้ต่อ LLM จริง"
        )

    async def complete(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
        json_mode: bool,
    ) -> Completion:
        text = self._answer(messages)
        return Completion(text=text, usage=_fake_usage(messages, text))

    async def stream(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
    ) -> AsyncIterator[str | StreamEnd]:
        text = self._answer(messages)
        for i in range(0, len(text), 12):
            yield text[i : i + 12]
        yield StreamEnd(usage=_fake_usage(messages, text))

    async def embed(
        self, *, model: str, texts: list[str], timeout_s: float, api_key: str | None
    ) -> tuple[list[list[float]], Usage]:
        vectors = [fake_embedding(t, self.embedding_dim) for t in texts]
        return vectors, Usage(input_tokens=sum(len(t) // 4 for t in texts), cost_usd=0.0)


def _fake_usage(messages: list[Message], text: str) -> Usage:
    inp = sum(len(m["content"]) for m in messages) // 4
    out = len(text) // 4
    return Usage(input_tokens=inp, output_tokens=out, cost_usd=round(inp * 1e-6 + out * 5e-6, 6))


def _fake_style_card(prompt: str) -> dict[str, Any]:
    thai = bool(re.search(r"[฀-๿]", prompt))
    return {
        "summary": (
            "Answers are short and direct, mixing Thai sentences with English technical terms, "
            "and close with a one-line summary."
            if thai
            else "Answers are short, direct, and end with a one-line summary."
        ),
        "language": "Thai for explanation, English for technical nouns" if thai else "English",
        "length": "2-6 sentences; comparisons get a short list",
        "structure": ["one-line verdict first", "2-3 supporting points", "closing summary line"],
        "formatting": ["short paragraphs", "occasional bullets", "→ to map terms"],
        "vocabulary": ["สั้นๆ", "สรุป:", "นะ"] if thai else ["in short", "summary:"],
        "by_shape": {"comparison": "verdict, then side-by-side points", "other": "direct answer"},
        "avoid": ["long preambles", "headings"],
        "conflicts": [],
    }
