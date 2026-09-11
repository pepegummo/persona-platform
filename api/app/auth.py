"""Clerk authentication.

The web app sends the Clerk session JWT as `Authorization: Bearer <jwt>`. We verify it against
Clerk's JWKS (cached by PyJWT) and upsert a `users` row on first sight.

Local development without Clerk: when `AUTH_DEV_BYPASS=true` (and APP_ENV != production) a token
of the form `dev:<id>` is accepted as user `dev:<id>`.
"""

import logging
from typing import Annotated, Any

import anyio
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, dev_bypass_enabled
from app.deps import DbDep, SettingsDep
from app.models import User

log = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)
CredsDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


class Identity:
    """Verified identity claims, independent of the users table."""

    __slots__ = ("clerk_user_id", "display_name")

    def __init__(self, clerk_user_id: str, display_name: str) -> None:
        self.clerk_user_id = clerk_user_id
        self.display_name = display_name


def _jwks_client(request: Request, settings: Settings) -> PyJWKClient:
    client: PyJWKClient | None = getattr(request.app.state, "jwks_client", None)
    if client is None:
        if not settings.clerk_jwks_url:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is not configured"
            )
        client = PyJWKClient(settings.clerk_jwks_url, cache_keys=True, lifespan=3600)
        request.app.state.jwks_client = client
    return client


def _display_name_from_claims(claims: dict[str, Any]) -> str:
    # Clerk session tokens carry only `sub` by default. Add `name`/`email` in the Clerk
    # dashboard (Sessions → Customize session token) to get a nicer default.
    for key in ("name", "full_name", "username", "email"):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:80]
    sub = str(claims["sub"])
    return f"user-{sub[-6:]}"


async def verify_token(request: Request, token: str, settings: Settings) -> Identity:
    if token.startswith("dev:"):
        if not dev_bypass_enabled(settings):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
        ident = token[4:].strip()
        if not ident:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
        return Identity(clerk_user_id=token, display_name=f"Dev {ident}")

    jwks = _jwks_client(request, settings)
    try:
        # PyJWKClient uses blocking urllib; keep it off the event loop.
        signing_key = await anyio.to_thread.run_sync(jwks.get_signing_key_from_jwt, token)
        claims: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer or None,
            options={"verify_aud": False},
            leeway=10,
        )
    except jwt.PyJWTError as e:
        log.info("auth: token rejected: %s", e)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from None
    return Identity(
        clerk_user_id=str(claims["sub"]), display_name=_display_name_from_claims(claims)
    )


async def upsert_user(db: AsyncSession, identity: Identity) -> User:
    stmt = (
        insert(User)
        .values(clerk_user_id=identity.clerk_user_id, display_name=identity.display_name)
        .on_conflict_do_nothing(index_elements=["clerk_user_id"])
    )
    await db.execute(stmt)
    user = await db.scalar(select(User).where(User.clerk_user_id == identity.clerk_user_id))
    assert user is not None
    await db.commit()
    return user


async def get_optional_user(
    request: Request, creds: CredsDep, db: DbDep, settings: SettingsDep
) -> User | None:
    if creds is None:
        return None
    identity = await verify_token(request, creds.credentials, settings)
    return await upsert_user(db, identity)


async def get_current_user(
    request: Request, creds: CredsDep, db: DbDep, settings: SettingsDep
) -> User:
    if creds is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Sign in required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    identity = await verify_token(request, creds.credentials, settings)
    return await upsert_user(db, identity)


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
