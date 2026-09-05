"""Timezone helpers.

PostgreSQL stores timezone-aware timestamps; SQLite (used for tests and local
dev) returns naive datetimes. Normalise before comparing stored values with
the current (aware) time.
"""
from __future__ import annotations

from datetime import datetime, timezone


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_utc_z(dt: datetime | None) -> str | None:
    """Serialise a deadline as the exact ISO-8601 shape that ECMAScript's
    Date Time String Format requires every JavaScript engine to parse:

        YYYY-MM-DDTHH:mm:ss[.sss]Z        (UTC, explicit ``Z``, ≤3 fraction digits)

    The raw ``datetime.isoformat()`` output is NOT safe across mobile engines:
    PostgreSQL yields ``...123456+00:00`` (six fraction digits + offset — the
    shape desktop/Android V8 parses happily but strict mobile engines reject
    or misparse, which is exactly the "timer shows 00:00 on phones" bug), and
    SQLite yields a zone-less string that engines interpret in the DEVICE'S
    local timezone (a 2–3 hour error for students far from UTC). Emitting
    canonical UTC+Z keeps the server as the single authority for the deadline
    and removes every engine/locale from the equation.
    """
    if dt is None:
        return None
    utc = ensure_utc(dt)
    # Truncate to whole milliseconds: the spec fraction is at most 3 digits
    # (isoformat() would otherwise always emit six microsecond digits).
    millis = utc.microsecond // 1000
    base = utc.replace(microsecond=0, tzinfo=None).isoformat()  # YYYY-MM-DDTHH:MM:SS
    fraction = f".{millis:03d}" if millis else ""
    return f"{base}{fraction}Z"
