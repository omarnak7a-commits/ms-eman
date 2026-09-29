"""Regression tests for the Vercel/Neon SQLAlchemy engine configuration."""
from __future__ import annotations

from sqlalchemy.pool import NullPool

from app.db.session import _engine_kwargs


def test_postgres_without_sslmode_uses_tls_and_timeout():
    kwargs = _engine_kwargs("postgresql+psycopg2://user:password@ep-example.neon.tech/app")

    assert kwargs["poolclass"] is NullPool
    assert kwargs["connect_args"] == {"connect_timeout": 10, "sslmode": "require"}


def test_postgres_existing_sslmode_is_respected_without_conflicting_connect_arg():
    kwargs = _engine_kwargs(
        "postgresql+psycopg2://user:password@ep-example.neon.tech/app?sslmode=verify-full"
    )

    assert kwargs["poolclass"] is NullPool
    assert kwargs["connect_args"] == {"connect_timeout": 10}


def test_sqlite_does_not_receive_postgres_settings():
    kwargs = _engine_kwargs("sqlite://")

    assert "poolclass" not in kwargs
    assert kwargs["connect_args"] == {"check_same_thread": False}
