"""Application configuration loaded from environment variables.

No real secrets should be committed. `.env.example` documents every variable
with placeholders. Never ship production secrets in source control.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The repository ships placeholder values so the app is runnable out of the
# box in development/test. They must NEVER be accepted in production: a
# publicly-known JWT secret would let anyone forge teacher tokens, and the
# localhost/sqlite database URLs point at databases that do not exist on a
# Vercel/Neon deployment. Production fails fast at boot instead.
_PLACEHOLDER_SECRET_KEY = "CHANGE_ME_IN_PRODUCTION__USE_openssl_rand_hex_32"
_PLACEHOLDER_DATABASE_URL = (
    "postgresql+psycopg2://postgres:postgres@localhost:5432/test_yourself"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Core
    app_name: str = "Test Yourself API"
    debug: bool = False
    environment: str = "development"  # development | production | test
    api_prefix: str = "/api"

    # Database
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/test_yourself"
    # e.g. sqlite:///./dev.db is supported ONLY for local tests / local dev.

    # Security
    # Use a long random value. Placeholder here must be overridden in production.
    secret_key: str = "CHANGE_ME_IN_PRODUCTION__USE_openssl_rand_hex_32"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14
    # Optional issuer/audience claims
    jwt_issuer: str = "test-yourself"
    jwt_audience: str = "test-yourself-api"

    # Optional built-frontend directory served by the app in production so the
    # whole product runs on ONE origin (single-project deploy). Leave empty to
    # use the default repo-root `dist/` and disable entirely outside production.
    frontend_dist: str = ""

    # CORS
    cors_origins: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:8443",
        ]
    )

    # Password policy
    password_min_length: int = 8

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_test(self) -> bool:
        return self.environment.lower() == "test"

    @model_validator(mode="after")
    def _fail_fast_on_placeholder_production_values(self) -> "Settings":
        """Production must never boot with placeholder/known configuration.

        The JWT ``secret_key`` default is committed to source code, so using it
        in production would let anyone forge access tokens. Development and
        test environments intentionally keep working with the defaults.
        """
        if not self.is_production:
            return self

        secret = (self.secret_key or "").strip()
        if (
            not secret
            or secret == _PLACEHOLDER_SECRET_KEY
            or "change_me" in secret.lower()
        ):
            raise ValueError(
                "SECRET_KEY must be set to a strong, random value in production. "
                "Refusing to start with the default/placeholder secret."
            )

        database_url = (self.database_url or "").strip()
        if (
            not database_url
            or database_url == _PLACEHOLDER_DATABASE_URL
            or database_url.startswith("sqlite")
        ):
            raise ValueError(
                "DATABASE_URL must point to a real PostgreSQL/Neon database in "
                "production. Refusing to start with the localhost/sqlite default."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
