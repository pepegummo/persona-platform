"""Compile pipeline with the built-in FakeProvider. Requires Postgres."""

import uuid

import pytest
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.llm.providers import FakeProvider
from app.llm.router import LLMRouter
from app.models import Example, LLMCall, Persona, PersonaVersion, User
from app.schemas.style_card import StyleCard
from app.services.compile import Compiler, choose_fixed_examples, choose_held_out
from tests.llm_stubs import MemoryRedis

KAFKA_Q = "Kafka กับ MQTT ต่างกันยังไงครับ"
KAFKA_A = (
    "สั้นๆ: Kafka = durable log สำหรับ event ปริมาณมาก, MQTT = pub/sub เบาๆ สำหรับ IoT\n\n"
    "สรุป: backend ใช้ Kafka, device ใช้ MQTT นะ"
)
MORE = [
    (
        "Docker คืออะไร",
        "Docker = container runtime ที่แพ็กแอปกับ dependencies ไว้ด้วยกัน\n\nสรุป: รันที่ไหนก็เหมือนกัน",
    ),
    (
        "จะ deploy FastAPI ยังไงดี",
        "1) build image 2) push registry 3) Cloud Run\n\nสรุป: ใช้ container ง่ายสุด",
    ),
    ("ควรใช้ Postgres หรือ Mongo", "ถ้าข้อมูลมี relation ใช้ Postgres ไปเลย\n\nสรุป: Postgres ก่อน"),
    (
        "service มัน timeout บ่อยมาก",
        "เช็ค connection pool ก่อน แล้วดู slow query\n\nสรุป: pool → query → network",
    ),
]


@pytest.fixture
def fake_settings() -> Settings:
    return Settings(_env_file=None, app_env="test", llm_provider="fake", embedding_dim=1024)


async def make_persona(db: AsyncSession, n_examples: int) -> PersonaVersion:
    user = User(clerk_user_id=f"test:{uuid.uuid4()}", display_name="t")
    db.add(user)
    await db.flush()
    persona = Persona(owner_id=user.id, slug=f"c-{uuid.uuid4().hex[:8]}")
    version = PersonaVersion(
        version_number=1,
        status="compiling",
        display_name="พี่บอส",
        settings={"language": "mixed", "answer_length": "short"},
        rules="ลงท้ายด้วย สรุป: เสมอ",
    )
    pairs = [(KAFKA_Q, KAFKA_A), *MORE][:n_examples]
    for i, (q, a) in enumerate(pairs):
        version.examples.append(Example(question=q, answer=a, is_private=(i % 2 == 1)))
    persona.versions.append(version)
    db.add(persona)
    await db.commit()
    await db.refresh(version, ["examples", "persona"])
    return version


async def test_compile_kafka_example_produces_style_card(
    db: AsyncSession, app: FastAPI, fake_settings: Settings
) -> None:
    version = await make_persona(db, n_examples=1)
    router = LLMRouter(fake_settings, app.state.test_session_factory, provider=FakeProvider(1024))
    compiler = Compiler(db, router, MemoryRedis(), fake_settings)  # type: ignore[arg-type]

    result = await compiler.run(version.id)

    assert result.status == "ready"
    assert result.compiled_at is not None
    card = StyleCard.model_validate(result.style_card)
    assert card.summary and "สรุป:" in card.vocabulary
    assert result.prompt_versions["compiler"] == "v1"
    ex = result.examples[0]
    assert ex.shape == "comparison"
    assert ex.embedding is not None and len(ex.embedding) == 1024
    assert result.fixed_example_ids == [ex.id]
    assert ex.is_held_out is False  # < 5 examples → nothing held out
    logged = await db.scalars(select(LLMCall).where(LLMCall.persona_version_id == version.id))
    tasks = sorted({c.task for c in logged})
    assert tasks == ["compile", "embed", "shape_classify"]


async def test_compile_tags_every_example_and_holds_out(
    db: AsyncSession, app: FastAPI, fake_settings: Settings
) -> None:
    version = await make_persona(db, n_examples=5)
    router = LLMRouter(fake_settings, app.state.test_session_factory, provider=FakeProvider(1024))
    redis = MemoryRedis()
    compiler = Compiler(db, router, redis, fake_settings)  # type: ignore[arg-type]

    result = await compiler.run(version.id)

    assert result.status == "ready"
    assert all(e.shape is not None and e.embedding is not None for e in result.examples)
    held = [e for e in result.examples if e.is_held_out]
    assert len(held) == 2  # 20% of 5, min 2
    assert set(result.fixed_example_ids) <= {e.id for e in result.examples if not e.is_held_out}
    assert len(redis.data) == 5  # shape cache populated once per distinct question


async def test_compile_failure_marks_failed(
    db: AsyncSession, app: FastAPI, fake_settings: Settings
) -> None:
    version = await make_persona(db, n_examples=1)
    bad = Settings(_env_file=None, app_env="test", llm_provider="fake", embedding_dim=8)
    router = LLMRouter(bad, app.state.test_session_factory, provider=FakeProvider(1024))
    compiler = Compiler(db, router, MemoryRedis(), bad)  # type: ignore[arg-type]
    result = await compiler.run(version.id)
    assert result.status == "failed"


def test_choose_held_out_rule() -> None:
    ids = [uuid.uuid4() for _ in range(4)]
    assert choose_held_out(ids, "s") == set()
    ids = [uuid.uuid4() for _ in range(5)]
    assert len(choose_held_out(ids, "s")) == 2
    ids = [uuid.uuid4() for _ in range(30)]
    assert len(choose_held_out(ids, "s")) == 6
    ids = [uuid.uuid4() for _ in range(100)]
    assert len(choose_held_out(ids, "s")) == 10
    assert choose_held_out(ids, "seed") == choose_held_out(ids, "seed")


def test_choose_fixed_examples_prefers_public_and_distinct_shapes() -> None:
    from datetime import UTC, datetime

    def ex(shape: str, private: bool, held: bool = False) -> Example:
        e = Example(id=uuid.uuid4(), question="q", answer="a", is_private=private, shape=shape)
        e.is_held_out = held
        e.created_at = datetime.now(UTC)
        return e

    pub_cmp, priv_cmp = ex("comparison", False), ex("comparison", True)
    how, held = ex("how_to", True), ex("definition", False, held=True)
    chosen = choose_fixed_examples([priv_cmp, pub_cmp, how, held])
    assert chosen[0] == pub_cmp.id  # public first within a shape
    assert held.id not in chosen
    assert set(chosen) == {pub_cmp.id, priv_cmp.id, how.id}
