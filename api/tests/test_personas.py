"""Persona CRUD, versioning, and ownership. Requires Postgres (see conftest)."""

import uuid
from typing import Any

from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Persona, PersonaVersion
from tests.conftest import auth

THAI_Q = "Kafka กับ MQTT ต่างกันยังไงครับ"
THAI_A = (
    "สั้นๆ: Kafka = log แบบ durable สำหรับ event ปริมาณมาก, "
    "MQTT = pub/sub เบาๆ สำหรับอุปกรณ์ IoT\n\nสรุป: ถ้าเป็น backend ใช้ Kafka ถ้าเป็น device ใช้ MQTT นะ"
)


async def create(client: AsyncClient, user: str = "alice", **overrides: Any) -> dict[str, Any]:
    body = {"display_name": "พี่บอส", "description": "อธิบายเรื่อง backend", **overrides}
    r = await client.post("/api/personas", json=body, headers=auth(user))
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


async def publish(db: AsyncSession, persona_id: str) -> str:
    """Simulate M3's publish: mark the latest version ready and point the persona at it."""
    version = await db.scalar(
        select(PersonaVersion)
        .where(PersonaVersion.persona_id == uuid.UUID(persona_id))
        .order_by(PersonaVersion.version_number.desc())
    )
    assert version is not None
    version.status = "ready"
    await db.execute(
        update(Persona)
        .where(Persona.id == uuid.UUID(persona_id))
        .values(published_version_id=version.id)
    )
    await db.commit()
    return str(version.id)


async def test_me_upserts_user(client: AsyncClient, db: AsyncSession) -> None:
    r1 = await client.get("/api/me", headers=auth("alice"))
    r2 = await client.get("/api/me", headers=auth("alice"))
    assert r1.status_code == 200 and r1.json() == r2.json()
    assert r1.json()["clerk_user_id"] == "dev:alice"


async def test_requires_auth(client: AsyncClient, db: AsyncSession) -> None:
    assert (await client.get("/api/personas")).status_code == 401
    assert (await client.post("/api/personas", json={"display_name": "x"})).status_code == 401


async def test_create_get_list(client: AsyncClient, db: AsyncSession) -> None:
    created = await create(client, slug="boss-th")
    assert created["slug"] == "boss-th"
    assert created["draft"]["version_number"] == 1
    assert created["draft"]["status"] == "draft"
    assert created["published"] is None

    r = await client.get(f"/api/personas/{created['id']}", headers=auth())
    assert r.status_code == 200 and r.json()["draft"]["display_name"] == "พี่บอส"

    r = await client.get("/api/personas", headers=auth())
    assert [p["slug"] for p in r.json()] == ["boss-th"]
    assert r.json()[0]["example_count"] == 0


async def test_slug_conflict(client: AsyncClient, db: AsyncSession) -> None:
    await create(client, slug="taken")
    r = await client.post(
        "/api/personas", json={"display_name": "x", "slug": "taken"}, headers=auth("bob")
    )
    assert r.status_code == 409


async def test_thai_round_trip(client: AsyncClient, db: AsyncSession) -> None:
    persona = await create(client, rules="ลงท้ายด้วย สรุป: เสมอ")
    r = await client.post(
        f"/api/personas/{persona['id']}/examples",
        json={"question": THAI_Q, "answer": THAI_A, "is_private": False},
        headers=auth(),
    )
    assert r.status_code == 201
    r = await client.get(f"/api/personas/{persona['id']}", headers=auth())
    draft = r.json()["draft"]
    assert draft["rules"] == "ลงท้ายด้วย สรุป: เสมอ"
    assert draft["examples"][0]["question"] == THAI_Q
    assert draft["examples"][0]["answer"] == THAI_A
    assert draft["examples"][0]["is_private"] is False


async def test_example_update_delete_toggle(client: AsyncClient, db: AsyncSession) -> None:
    persona = await create(client)
    base = f"/api/personas/{persona['id']}/examples"
    ex = (await client.post(base, json={"question": "q", "answer": "a"}, headers=auth())).json()
    assert ex["is_private"] is True

    r = await client.patch(f"{base}/{ex['id']}", json={"is_private": False}, headers=auth())
    assert r.status_code == 200 and r.json()["is_private"] is False

    r = await client.patch(f"{base}/{ex['id']}", json={"answer": "a2"}, headers=auth())
    assert r.json()["answer"] == "a2"

    assert (await client.delete(f"{base}/{ex['id']}", headers=auth())).status_code == 204
    assert (await client.delete(f"{base}/{ex['id']}", headers=auth())).status_code == 404


async def test_non_owner_gets_403(client: AsyncClient, db: AsyncSession) -> None:
    persona = await create(client, "alice")
    pid = persona["id"]
    ex = (
        await client.post(
            f"/api/personas/{pid}/examples", json={"question": "q", "answer": "a"}, headers=auth()
        )
    ).json()
    bob = auth("bob")
    assert (await client.get(f"/api/personas/{pid}", headers=bob)).status_code == 403
    assert (
        await client.patch(f"/api/personas/{pid}", json={"rules": "x"}, headers=bob)
    ).status_code == 403
    assert (
        await client.post(
            f"/api/personas/{pid}/examples", json={"question": "q", "answer": "a"}, headers=bob
        )
    ).status_code == 403
    assert (
        await client.patch(
            f"/api/personas/{pid}/examples/{ex['id']}", json={"answer": "z"}, headers=bob
        )
    ).status_code == 403
    assert (
        await client.delete(f"/api/personas/{pid}/examples/{ex['id']}", headers=bob)
    ).status_code == 403
    # Bob's list does not include Alice's persona
    assert (await client.get("/api/personas", headers=bob)).json() == []


async def test_editing_published_creates_new_draft(client: AsyncClient, db: AsyncSession) -> None:
    persona = await create(client, rules="v1 rules")
    pid = persona["id"]
    base = f"/api/personas/{pid}/examples"
    ex = (await client.post(base, json={"question": "q1", "answer": "a1"}, headers=auth())).json()
    published_id = await publish(db, pid)

    # Settings edit → new draft version 2, version 1 untouched
    r = await client.patch(f"/api/personas/{pid}", json={"rules": "v2 rules"}, headers=auth())
    assert r.status_code == 200
    body = r.json()
    assert body["published_version_id"] == published_id
    assert body["draft"]["version_number"] == 2
    assert body["draft"]["status"] == "draft"
    assert body["draft"]["rules"] == "v2 rules"
    assert body["published"]["id"] == published_id
    # Examples were copied into the draft with new ids
    assert [e["question"] for e in body["draft"]["examples"]] == ["q1"]
    assert body["draft"]["examples"][0]["id"] != ex["id"]

    v1 = await db.get(PersonaVersion, uuid.UUID(published_id))
    assert v1 is not None
    await db.refresh(v1, ["examples"])
    assert v1.rules == "v1 rules" and v1.status == "ready"
    assert [e.answer for e in v1.examples] == ["a1"]

    # Further edits land on version 2, no version 3
    await client.post(base, json={"question": "q2", "answer": "a2"}, headers=auth())
    body = (await client.get(f"/api/personas/{pid}", headers=auth())).json()
    assert body["draft"]["version_number"] == 2
    assert len(body["draft"]["examples"]) == 2


async def test_editing_published_example_by_old_id(client: AsyncClient, db: AsyncSession) -> None:
    """Clients hold ids from the published version; the first edit maps them onto the clone."""
    persona = await create(client)
    pid = persona["id"]
    base = f"/api/personas/{pid}/examples"
    ex = (await client.post(base, json={"question": "q1", "answer": "a1"}, headers=auth())).json()
    published_id = await publish(db, pid)

    r = await client.patch(f"{base}/{ex['id']}", json={"answer": "edited"}, headers=auth())
    assert r.status_code == 200
    assert r.json()["answer"] == "edited" and r.json()["id"] != ex["id"]

    v1 = await db.get(PersonaVersion, uuid.UUID(published_id))
    assert v1 is not None
    await db.refresh(v1, ["examples"])
    assert v1.examples[0].answer == "a1"


async def test_editing_compiled_unpublished_resets_to_draft(
    client: AsyncClient, db: AsyncSession
) -> None:
    persona = await create(client)
    pid = persona["id"]
    version = await db.get(PersonaVersion, uuid.UUID(persona["draft"]["id"]))
    assert version is not None
    version.status = "ready"
    version.style_card = {"summary": "x"}
    await db.commit()

    r = await client.patch(f"/api/personas/{pid}", json={"rules": "new"}, headers=auth())
    draft = r.json()["draft"]
    assert draft["version_number"] == 1
    assert draft["status"] == "draft" and draft["style_card"] is None


async def test_validation(client: AsyncClient, db: AsyncSession) -> None:
    r = await client.post(
        "/api/personas", json={"display_name": "x", "slug": "Bad Slug"}, headers=auth()
    )
    assert r.status_code == 422
    r = await client.post(
        "/api/personas",
        json={"display_name": "x", "settings": {"language": "fr"}},
        headers=auth(),
    )
    assert r.status_code == 422


PROFILE = {"ราศี": "กันย์", "อายุ": "25", "เกมที่ชอบ": "Valorant"}
VOCAB = {"ปัง": "ดีมาก ใช้เวลาชมอะไร", "จึ้ง": "สุดยอด ใช้กับของที่ชอบมาก ๆ"}


async def test_profile_and_vocabulary_round_trip(client: AsyncClient, db: AsyncSession) -> None:
    persona = await create(client)
    pid = persona["id"]
    assert persona["draft"]["settings"]["profile"] == {}
    assert persona["draft"]["settings"]["vocabulary"] == {}

    settings = {**persona["draft"]["settings"], "profile": PROFILE, "vocabulary": VOCAB}
    r = await client.patch(f"/api/personas/{pid}", json={"settings": settings}, headers=auth())
    assert r.status_code == 200, r.text
    got = r.json()["draft"]["settings"]
    assert got["profile"] == PROFILE and got["vocabulary"] == VOCAB
    assert list(got["profile"]) == list(PROFILE)  # order preserved for the editor

    r = await client.get(f"/api/personas/{pid}", headers=auth())
    assert r.json()["draft"]["settings"]["profile"] == PROFILE

    # Editing a published version clones the maps into the new draft.
    await publish(db, pid)
    r = await client.patch(f"/api/personas/{pid}", json={"rules": "x"}, headers=auth())
    draft = r.json()["draft"]
    assert draft["version_number"] == 2
    assert draft["settings"]["profile"] == PROFILE and draft["settings"]["vocabulary"] == VOCAB


async def test_profile_map_limits(client: AsyncClient, db: AsyncSession) -> None:
    persona = await create(client)
    pid = persona["id"]

    async def patch(profile: dict[str, str]) -> int:
        r = await client.patch(
            f"/api/personas/{pid}", json={"settings": {"profile": profile}}, headers=auth()
        )
        return r.status_code

    assert await patch({f"k{i}": "v" for i in range(30)}) == 200
    assert await patch({f"k{i}": "v" for i in range(31)}) == 422
    assert await patch({"ก" * 40: "v"}) == 200
    assert await patch({"ก" * 41: "v"}) == 422
    assert await patch({"k": "ข" * 200}) == 200
    assert await patch({"k": "ข" * 201}) == 422
    assert await patch({"   ": "v"}) == 422
    assert await patch({"ราศี": "กันย์", " ราศี ": "x"}) == 422  # duplicate after strip

    # Whitespace is trimmed on the way in.
    r = await client.patch(
        f"/api/personas/{pid}", json={"settings": {"profile": {" ราศี ": " กันย์ "}}}, headers=auth()
    )
    assert r.json()["draft"]["settings"]["profile"] == {"ราศี": "กันย์"}
