"""Signed anonymous visitor id cookie for public chat."""

import hashlib
import hmac
import secrets

from fastapi import Request, Response

from app.config import Settings

COOKIE_NAME = "pp_visitor"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365


def _sign(value: str, secret: str) -> str:
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()[:32]


def new_visitor_id(secret: str) -> str:
    raw = secrets.token_urlsafe(16)
    return f"{raw}.{_sign(raw, secret)}"


def verify_visitor_id(token: str | None, secret: str) -> str | None:
    if not token or "." not in token:
        return None
    raw, sig = token.rsplit(".", 1)
    if hmac.compare_digest(sig, _sign(raw, secret)):
        return raw
    return None


def get_or_create_visitor(request: Request, response: Response, settings: Settings) -> str:
    """Return the verified visitor id, setting a fresh cookie when missing or tampered."""
    existing = verify_visitor_id(request.cookies.get(COOKIE_NAME), settings.secret_key)
    if existing:
        return existing
    token = new_visitor_id(settings.secret_key)
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.app_env == "production",
    )
    return token.rsplit(".", 1)[0]
