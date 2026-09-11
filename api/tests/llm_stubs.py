"""Scripted provider + in-memory Redis for LLM tests. No network."""

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field

from app.llm.providers import Completion, Message, ProviderError, StreamEnd, Usage

Behavior = Callable[[str, list[Message]], Completion]


@dataclass
class Call:
    model: str
    messages: list[Message]


@dataclass
class ScriptedProvider:
    """`script` is consumed one item per call: a Completion, or an exception to raise."""

    script: list[Completion | Exception] = field(default_factory=list)
    calls: list[Call] = field(default_factory=list)

    def _next(self, model: str, messages: list[Message]) -> Completion:
        self.calls.append(Call(model, messages))
        if not self.script:
            raise AssertionError("ScriptedProvider: script exhausted")
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

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
        return self._next(model, messages)

    async def stream(
        self,
        *,
        model: str,
        messages: list[Message],
        timeout_s: float,
        max_tokens: int,
        api_key: str | None,
    ) -> AsyncIterator[str | StreamEnd]:
        completion = self._next(model, messages)
        for i in range(0, len(completion.text), 5):
            yield completion.text[i : i + 5]
        yield StreamEnd(usage=completion.usage)

    async def embed(
        self, *, model: str, texts: list[str], timeout_s: float, api_key: str | None
    ) -> tuple[list[list[float]], Usage]:
        self.calls.append(Call(model, [{"role": "user", "content": t} for t in texts]))
        return [[0.1] * 4 for _ in texts], Usage(input_tokens=len(texts))


def ok(text: str, cost: float = 0.001) -> Completion:
    return Completion(text=text, usage=Usage(input_tokens=10, output_tokens=5, cost_usd=cost))


def rate_limited() -> ProviderError:
    return ProviderError("RateLimitError: 429", retryable=True, status=429)


def timeout() -> ProviderError:
    return ProviderError("Timeout", retryable=True)


def bad_request() -> ProviderError:
    return ProviderError("BadRequestError: 400", retryable=False, status=400)


class MemoryRedis:
    """Just enough of redis.asyncio for the compile service."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self.data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.data[key] = value

    async def incr(self, key: str) -> int:
        value = int(self.data.get(key, "0")) + 1
        self.data[key] = str(value)
        return value

    async def expire(self, key: str, ttl: int) -> None:
        self.ttls[key] = ttl

    async def ttl(self, key: str) -> int:
        return self.ttls.get(key, -1)

    async def delete(self, *keys: str) -> None:
        for k in keys:
            self.data.pop(k, None)
