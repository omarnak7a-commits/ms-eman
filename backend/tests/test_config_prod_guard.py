"""H2 regression tests: placeholder config must never boot in production.

Development/test environments keep working with the committed defaults; a
production Settings with the placeholder JWT secret or a localhost/sqlite
DATABASE_URL must fail fast at construction time.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_development_allows_defaults():
    s = Settings(environment="development")
    assert s.secret_key
    assert s.database_url


def test_test_allows_defaults():
    assert Settings(environment="test").secret_key


def test_production_rejects_placeholder_secret():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="CHANGE_ME_IN_PRODUCTION__USE_openssl_rand_hex_32",
            database_url="postgresql+psycopg2://user:pw@neon-host/db",
        )


def test_production_rejects_localhost_database():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="x" * 64,
            database_url="postgresql+psycopg2://postgres:postgres@localhost:5432/test_yourself",
        )


def test_production_rejects_sqlite_database():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            secret_key="x" * 64,
            database_url="sqlite:///./dev.db",
        )


def test_production_accepts_real_secret_and_neon_database():
    s = Settings(
        environment="production",
        secret_key="a-strong-random-production-secret-0123456789abcdef",
        database_url="postgresql+psycopg2://user:password@ep-foo-bar.us-east-2.aws.neon.tech/db",
    )
    assert s.is_production
