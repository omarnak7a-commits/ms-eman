"""Timezone helpers.

PostgreSQL stores timezone-aware timestamps; SQLite (used for tests and local
dev) returns naive datetimes. Normalise before comparing stored values with the
current (aware) time.
"""
from __future__ import annotations

from datetime import datetime, timezone


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)
