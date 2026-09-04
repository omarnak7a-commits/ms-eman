"""Application configuration loaded from environment variables.

No real secrets should be committed. `.env.example` documents every variable
with placeholders. Never ship production secrets in source control.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
