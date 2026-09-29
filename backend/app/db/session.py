"""SQLAlchemy engine and session factory.

Vercel creates short-lived serverless workers while Neon owns the durable
PostgreSQL connections.  Do not keep a process-local connection pool in a
serverless worker: workers can be frozen with stale connections and every
worker would hold its own pool.  ``NullPool`` makes each request acquire and
release a connection cleanly; Neon connection pooling remains the place to
pool connections when the pooled Neon endpoint is used.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from ..core.config import get_settings


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}

    parsed = make_url(url)
    # Explicit timeout prevents a suspended/unreachable Neon endpoint from
    # consuming the whole Vercel function timeout. sslmode is normally part of
    # Neon DATABASE_URL; require it here too for URLs supplied by operators
    # without changing or exposing credentials.
    connect_args = {"connect_timeout": 10}
    query = dict(parsed.query)
    if parsed.drivername.startswith("postgresql") and "sslmode" not in query:
        connect_args["sslmode"] = "require"
    return {"poolclass": NullPool, "connect_args": connect_args}


settings = get_settings()
engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))

SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a request-scoped database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
