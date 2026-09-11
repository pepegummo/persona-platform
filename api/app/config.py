"""Application settings, read from environment variables and the repo-root `.env`.

See `.env.example` at the repo root for every supported variable.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",  # provider keys etc. live in .env but are read by later modules
    )

    # --- Infra ---
    database_url: str = "postgresql+asyncpg://persona:persona@localhost:5432/persona"
    redis_url: str = "redis://localhost:6379/0"
    web_origin: str = "http://localhost:3000"

    # --- Auth (Clerk) ---
    app_env: Literal["development", "test", "production"] = "development"
    clerk_publishable_key: str = ""
    clerk_secret_key: str = ""
    clerk_jwks_url: str = ""
    clerk_issuer: str = ""  # optional; e.g. https://xxx.clerk.accounts.dev
    # Dev only: accept `Authorization: Bearer dev:<id>` without Clerk. Never honored in production.
    auth_dev_bypass: bool = False

    # --- Feature flags (all off in Phase 1A) ---
    feature_eval: bool = False
    feature_synth_rewrite: bool = False
    feature_like_me: bool = False
    feature_export: bool = False

    # --- Limits ---
    rate_limit_visitor_per_min: int = 10
    rate_limit_visitor_per_day: int = 100
    rate_limit_persona_per_day: int = 2000
    default_creator_daily_spend_usd: float = 1.0


@lru_cache
def get_settings() -> Settings:
    return Settings()


def dev_bypass_enabled(settings: Settings) -> bool:
    return settings.auth_dev_bypass and settings.app_env != "production"
