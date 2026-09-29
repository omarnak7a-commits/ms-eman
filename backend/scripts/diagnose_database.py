"""Safe production-style database diagnostic.

Run with the same DATABASE_URL used by the target deployment:
    cd backend && python scripts/diagnose_database.py

This never prints DATABASE_URL, credentials, or a connection string. It only
reports masked endpoint metadata, connectivity, Alembic revision, and the
presence of tables/columns used by authentication.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.config import get_settings  # noqa: E402
from app.db.session import _engine_kwargs  # noqa: E402


def masked_endpoint(raw: str) -> str:
    parsed = make_url(raw)
    host = parsed.host or "<none>"
    if len(host) > 8:
        host = host[:3] + "..." + host[-5:]
    name = parsed.database or "<none>"
    if len(name) > 4:
        name = name[:2] + "..." + name[-2:]
    return f"driver={parsed.drivername} host={host} database={name} sslmode={parsed.query.get('sslmode', '<implicit>')}"


def safe_error(exc: Exception) -> str:
    message = str(exc)
    # Remove common URL-shaped fragments if a driver includes connection data.
    message = re.sub(r"postgres(?:ql)?(?:\+[^:]+)?://[^\s]+", "<redacted-url>", message)
    return message[:500]


def main() -> int:
    settings = get_settings()
    print(f"environment={settings.environment}")
    print(f"database={masked_endpoint(settings.database_url)}")
    engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))
    try:
        inspector = inspect(engine)
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            revision = (
                connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
                if inspector.has_table("alembic_version")
                else None
            )
        print("connection=ok")
        print(f"alembic_revision={revision or '<missing>'}")
        required = {
            "teachers": (),
            "refresh_tokens": (),
            "alembic_version": (),
        }
        for table, columns in required.items():
            print(f"table.{table}={'present' if inspector.has_table(table) else 'missing'}")
        for table, column in (("teachers", "email"), ("teachers", "password_hash"), ("refresh_tokens", "token_hash")):
            present = inspector.has_table(table) and any(c["name"] == column for c in inspector.get_columns(table))
            print(f"column.{table}.{column}={'present' if present else 'missing'}")
        return 0
    except SQLAlchemyError as exc:
        print(f"connection=failed exception={exc.__class__.__name__} message={safe_error(exc)}")
        return 2
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
