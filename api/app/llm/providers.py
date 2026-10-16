"""Provider backends behind the router.

`LiteLLMProvider` talks to real providers via LiteLLM. `FakeProvider` produces deterministic,
plausible output with no network or keys (local demos, CI). Tests use their own stubs. Nothing
outside `app/llm` may import LiteLLM.
"""

import hashlib
import json
import logging
import math
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any, Protocol

log = logging.getLogger(__name__)

Message = dict[str, str]  # {"role": "system" | "user" | "assistant", "content": str}


class ProviderError(Exception):
    """Normalized provider failure.

    `retryable`: worth retrying the same model (429, 5xx, timeout).
    `fallback`: worth trying the fallback model. False only when the request itself is bad
    (400-family), which another model would reject too; a retired model, bad key, or outage on
    one provider should still reach the fallback.
    """

    def __init__(
        self,
        message: str,
        *,
        retryable: bool,
        status: int | None = None,
        fallback: bool = True,
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.status = status
        self.fallback = fallback


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
    ) -> AsyncGenerator[str | StreamEnd, None]: ...

    async def embed(
        self, *, model: str, texts: list[str], timeout_s: float, api_key: str | None
    ) -> tuple[list[list[float]], Usage]: ...

    def estimate_usage(self, *, model: str, messages: list[Message], text: str) -> Usage:
        """Best-effort usage for a stream that was closed before the provider reported it."""
        ...


# --- Reasoning text --------------------------------------------------------------------------

_THINK_OPEN, _THINK_CLOSE = "<think>", "</think>"
_THINK_RE = re.compile(r"<think>.*?(?:</think>\s*|\Z)", re.S)


def strip_think(text: str) -> str:
    """Drop `<think>…</think>` reasoning (and an unclosed trailing `<think>…`)."""
    return _THINK_RE.sub("", text)


def _partial_suffix(text: str, tag: str) -> int:
    """Length of the longest suffix of `text` that is a proper prefix of `tag`."""
    for k in range(min(len(tag) - 1, len(text)), 0, -1):
        if text.endswith(tag[:k]):
            return k
    return 0


class ThinkStripper:
    """Streaming `strip_think`: tags may be split across deltas, so a possible partial tag is
    held back until the next delta decides it."""

    def __init__(self) -> None:
        self._buf = ""
        self._inside = False
        self._trim = False  # drop whitespace right after a closing tag

    def feed(self, delta: str) -> str:
        self._buf += delta
        out: list[str] = []
        while self._buf:
            if self._inside:
                i = self._buf.find(_THINK_CLOSE)
                if i == -1:
                    self._buf = self._buf[-(len(_THINK_CLOSE) - 1) :]
                    break
                self._buf = self._buf[i + len(_THINK_CLOSE) :]
                self._inside, self._trim = False, True
                continue
            if self._trim:
                self._buf = self._buf.lstrip()
                if not self._buf:
                    break
                self._trim = False
            i = self._buf.find(_THINK_OPEN)
            if i != -1:
                out.append(self._buf[:i])
                self._buf = self._buf[i + len(_THINK_OPEN) :]
                self._inside = True
                continue
            keep = _partial_suffix(self._buf, _THINK_OPEN)
            out.append(self._buf[: len(self._buf) - keep])
            self._buf = self._buf[len(self._buf) - keep :]
            break
        return "".join(out)

    def flush(self) -> str:
        rest, self._buf = ("" if self._inside else self._buf), ""
        return rest


# --- LiteLLM ---------------------------------------------------------------------------------


class LiteLLMProvider:
    def __init__(self) -> None:
        import litellm

        litellm.drop_params = True  # ignore params a given provider does not support
        litellm.suppress_debug_info = True
        self._litellm = litellm
        self._no_price_warned: set[str] = set()

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
        # BadRequestError covers ContextWindowExceeded and ContentPolicyViolation too.
        fallback = not isinstance(e, ll.BadRequestError)
        return ProviderError(
            f"{type(e).__name__}: {e}", retryable=retryable, status=status, fallback=fallback
        )

    def _extra_params(self, model: str) -> dict[str, Any]:
        """Groq reasoning models (e.g. Qwen3) put `<think>` text in the answer by default and
        reject JSON mode without a reasoning format. Turn reasoning off; LiteLLM drops these as
        unknown Groq params, so they go in `extra_body`."""
        if model.split("/", 1)[0].lower() != "groq":
            return {}
        try:
            reasoning = bool(self._litellm.supports_reasoning(model=model))
        except Exception:
            reasoning = False
        if not reasoning:
            return {}
        return {"extra_body": {"reasoning_effort": "none", "reasoning_format": "hidden"}}

    def _warn_no_price(self, model: str) -> None:
        if model not in self._no_price_warned:
            self._no_price_warned.add(model)
            log.warning(
                "llm: no LiteLLM price for %s; its calls are logged at $0 and do not count "
                "toward the spend cap",
                model,
            )

    def _usage(self, response: Any, model: str) -> Usage:
        u = getattr(response, "usage", None)
        details = getattr(u, "prompt_tokens_details", None)
        cached = getattr(details, "cached_tokens", None) or 0
        # Pass the routed model: the response's own model name can lack the provider prefix
        # (Groq returns "qwen/qwen3.8-27b"), and LiteLLM then cannot find a price.
        try:
            cost = float(
                self._litellm.completion_cost(completion_response=response, model=model) or 0.0
            )
        except Exception:
            self._warn_no_price(model)
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
        kwargs: dict[str, Any] = self._extra_params(model)
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
        text = strip_think(response.choices[0].message.content or "")
        return Completion(text=text, usage=self._usage(response, model))

    async def stream(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
    ) -> AsyncGenerator[str | StreamEnd, None]:
        stripper = ThinkStripper()
        try:
            response = await self._litellm.acompletion(
                model=model,
                messages=messages,
                timeout=timeout_s,
                max_tokens=max_tokens,
                api_key=api_key or None,
                stream=True,
                stream_options={"include_usage": True},
                **self._extra_params(model),
            )
            chunks: list[Any] = []
            async for chunk in response:
                chunks.append(chunk)
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta and (visible := stripper.feed(delta)):
                    yield visible
        except ProviderError:
            raise
        except Exception as e:
            raise self._wrap(e) from e
        if tail := stripper.flush():
            yield tail
        usage = Usage()
        try:
            full = self._litellm.stream_chunk_builder(chunks, messages=messages)
            usage = self._usage(full, model)
        except Exception:
            pass
        yield StreamEnd(usage=usage)

    def estimate_usage(self, *, model: str, messages: list[Message], text: str) -> Usage:
        ll = self._litellm
        try:
            input_tokens = int(ll.token_counter(model=model, messages=messages))
            output_tokens = int(ll.token_counter(model=model, text=text)) if text else 0
        except Exception:
            input_tokens = sum(len(m["content"]) for m in messages) // 4
            output_tokens = len(text) // 4
        try:
            prompt_cost, completion_cost = ll.cost_per_token(
                model=model, prompt_tokens=input_tokens, completion_tokens=output_tokens
            )
            cost = float(prompt_cost + completion_cost)
        except Exception:
            self._warn_no_price(model)
            cost = 0.0
        return Usage(input_tokens=input_tokens, output_tokens=output_tokens, cost_usd=cost)

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
            cost = float(
                self._litellm.completion_cost(completion_response=response, model=model) or 0.0
            )
        except Exception:
            self._warn_no_price(model)
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
    ) -> AsyncGenerator[str | StreamEnd, None]:
        text = self._answer(messages)
        for i in range(0, len(text), 12):
            yield text[i : i + 12]
        yield StreamEnd(usage=_fake_usage(messages, text))

    async def embed(
        self, *, model: str, texts: list[str], timeout_s: float, api_key: str | None
    ) -> tuple[list[list[float]], Usage]:
        vectors = [fake_embedding(t, self.embedding_dim) for t in texts]
        return vectors, Usage(input_tokens=sum(len(t) // 4 for t in texts), cost_usd=0.0)

    def estimate_usage(self, *, model: str, messages: list[Message], text: str) -> Usage:
        return _fake_usage(messages, text)


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
