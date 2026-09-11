"""JWT verification path with a locally signed RS256 token and a stubbed JWKS client."""

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.deps import get_db
from app.main import create_app


class _Key:
    def __init__(self, key: Any) -> None:
        self.key = key


class _StubJWKS:
    def __init__(self, public_key: Any) -> None:
        self._key = _Key(public_key)

    def get_signing_key_from_jwt(self, token: str) -> _Key:
        return self._key


@pytest.fixture
def rsa_pair() -> tuple[Any, Any]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private, private.public_key()


@pytest.fixture
def clerk_settings() -> Settings:
    return Settings(
        _env_file=None,
        app_env="test",
        auth_dev_bypass=False,
        clerk_jwks_url="https://example.clerk.accounts.dev/.well-known/jwks.json",
        clerk_issuer="https://example.clerk.accounts.dev",
    )


@pytest.fixture
def clerk_app(
    clerk_settings: Settings, rsa_pair: tuple[Any, Any], app: FastAPI, db: AsyncSession
) -> FastAPI:
    """Clerk-mode app sharing the test DB session of the default `app`."""
    clerk = create_app(clerk_settings)
    clerk.state.jwks_client = _StubJWKS(rsa_pair[1])
    clerk.dependency_overrides[get_db] = app.dependency_overrides[get_db]
    return clerk


def _sign(private: Any, **claims: Any) -> str:
    now = int(time.time())
    payload = {
        "sub": "user_2abc",
        "iss": "https://example.clerk.accounts.dev",
        "iat": now,
        "exp": now + 60,
        **claims,
    }
    pem = private.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return jwt.encode(payload, pem, algorithm="RS256", headers={"kid": "k1"})


async def test_valid_jwt_upserts_user(
    clerk_app: FastAPI, rsa_pair: tuple[Any, Any], db: AsyncSession
) -> None:
    from httpx import ASGITransport

    async with AsyncClient(transport=ASGITransport(app=clerk_app), base_url="http://t") as c:
        token = _sign(rsa_pair[0], name="สมชาย ใจดี")
        r = await c.get("/api/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        assert r.json()["clerk_user_id"] == "user_2abc"
        assert r.json()["display_name"] == "สมชาย ใจดี"


async def test_expired_or_wrong_issuer_rejected(
    clerk_app: FastAPI, rsa_pair: tuple[Any, Any], db: AsyncSession
) -> None:
    from httpx import ASGITransport

    async with AsyncClient(transport=ASGITransport(app=clerk_app), base_url="http://t") as c:
        expired = _sign(rsa_pair[0], exp=int(time.time()) - 100)
        assert (
            await c.get("/api/me", headers={"Authorization": f"Bearer {expired}"})
        ).status_code == 401
        bad_iss = _sign(rsa_pair[0], iss="https://evil.example")
        assert (
            await c.get("/api/me", headers={"Authorization": f"Bearer {bad_iss}"})
        ).status_code == 401


async def test_dev_token_rejected_without_bypass(clerk_app: FastAPI, db: AsyncSession) -> None:
    from httpx import ASGITransport

    async with AsyncClient(transport=ASGITransport(app=clerk_app), base_url="http://t") as c:
        r = await c.get("/api/me", headers={"Authorization": "Bearer dev:alice"})
        assert r.status_code == 401


def test_bypass_never_enabled_in_production() -> None:
    from app.config import dev_bypass_enabled

    s = Settings(_env_file=None, app_env="production", auth_dev_bypass=True)
    assert dev_bypass_enabled(s) is False
