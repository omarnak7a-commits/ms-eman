"""Regression tests: mobile-safe timer wire format.

Production bug: desktop showed the countdown correctly but phones started at
00:00. Root cause was the deadline's wire format — PostgreSQL-aware datetimes
serialised as ``...123456+00:00`` (6-digit fraction + offset), which strict
mobile JS engines reject/misparse, and zone-less strings get interpreted in
the device's local timezone. The contract pinned here:

* ``deadline_at`` is ALWAYS canonical ISO-8601 UTC (``...Z``, ≤3 fraction
  digits) — the exact ECMAScript Date Time String Format every engine parses.
* ``remaining_seconds`` ships alongside it so the client can seed its
  countdown without parsing dates at all.
"""
from __future__ import annotations

import datetime
import re

from conftest import TestingSession

from app.core.timeutil import iso_utc_z
from app.models import ExamAttempt

from test_student_attempts import attempt_headers, make_published_exam, start

# The exact ES Date Time String Format (what every JS engine must accept).
CANONICAL_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$")


# ── iso_utc_z unit tests ─────────────────────────────────────────────────────


def test_iso_utc_z_aware_microseconds_truncated_to_ms():
    dt = datetime.datetime(2026, 9, 6, 21, 15, 30, 123456, tzinfo=datetime.timezone.utc)
    assert iso_utc_z(dt) == "2026-09-06T21:15:30.123Z"


def test_iso_utc_z_naive_treated_as_utc():
    # SQLite returns naive datetimes whose values are UTC.
    dt = datetime.datetime(2026, 9, 6, 21, 15, 30, 123456)
    assert iso_utc_z(dt) == "2026-09-06T21:15:30.123Z"


def test_iso_utc_z_non_utc_offset_converted():
    plus2 = datetime.timezone(datetime.timedelta(hours=2))
    dt = datetime.datetime(2026, 9, 6, 23, 15, 30, tzinfo=plus2)  # == 21:15:30Z
    assert iso_utc_z(dt) == "2026-09-06T21:15:30Z"


def test_iso_utc_z_whole_seconds_have_no_fraction():
    dt = datetime.datetime(2026, 9, 6, 21, 15, 30, tzinfo=datetime.timezone.utc)
    assert iso_utc_z(dt) == "2026-09-06T21:15:30Z"


def test_iso_utc_z_none():
    assert iso_utc_z(None) is None


# ── API wire-format tests ────────────────────────────────────────────────────


def test_start_response_deadline_is_canonical_z_with_remaining_seconds(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])

    assert CANONICAL_Z.match(data["deadline_at"]), data["deadline_at"]
    # No 6-digit microseconds, no "+00:00" offset — the mobile-killer shapes.
    assert "+00:00" not in data["deadline_at"]
    assert len(data["deadline_at"].split(".")[1].rstrip("Z")) <= 3 if "." in data["deadline_at"] else True
    # Server-authoritative remaining time at start == full duration.
    assert data["remaining_seconds"] == data["duration_seconds"] == 30 * 60


def test_resume_deadline_is_canonical_z_with_remaining_seconds(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    r = client.get(f"/api/attempts/{data['attempt_id']}/resume", headers=attempt_headers(data))
    assert r.status_code == 200, r.text
    status = r.json()["status"]

    assert CANONICAL_Z.match(status["deadline_at"]), status["deadline_at"]
    # Fresh 30-minute attempt: almost the whole duration remains.
    assert 30 * 60 - 60 <= status["remaining_seconds"] <= 30 * 60


def test_status_endpoint_matches_resume_contract(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    r = client.get(f"/api/attempts/{data['attempt_id']}", headers=attempt_headers(data))
    assert r.status_code == 200, r.text
    status = r.json()
    assert CANONICAL_Z.match(status["deadline_at"]), status["deadline_at"]
    assert 0 < status["remaining_seconds"] <= 30 * 60


def test_postgres_style_aware_deadline_still_serialises_as_z(client, teacher):
    """Production stores timezone-AWARE datetimes (Neon PostgreSQL). Whatever
    the driver returns, the wire format must stay canonical UTC "Z"."""
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    aid = data["attempt_id"]

    with TestingSession() as db:
        attempt = db.query(ExamAttempt).filter(ExamAttempt.id == aid).one()
        attempt.deadline_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            minutes=29, seconds=30, microseconds=654321
        )
        db.commit()

    r = client.get(f"/api/attempts/{aid}/resume", headers=attempt_headers(data))
    assert r.status_code == 200, r.text
    status = r.json()["status"]
    assert CANONICAL_Z.match(status["deadline_at"]), status["deadline_at"]
    assert "+00:00" not in status["deadline_at"]
    assert 29 * 60 <= status["remaining_seconds"] <= 29 * 60 + 31


def test_expired_attempt_reports_zero_remaining(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    aid = data["attempt_id"]

    with TestingSession() as db:
        attempt = db.query(ExamAttempt).filter(ExamAttempt.id == aid).one()
        attempt.deadline_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
            minutes=1
        )
        db.commit()

    # Resume reconciles the expired attempt → not resumable, 0 remaining.
    r = client.get(f"/api/attempts/{aid}/resume", headers=attempt_headers(data))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["can_resume"] is False
    assert body["status"]["remaining_seconds"] == 0
    assert CANONICAL_Z.match(body["status"]["deadline_at"]), body["status"]["deadline_at"]


def test_refresh_after_elapsed_time_restores_remaining_not_full_duration(client, teacher):
    """Reference scenario: student refreshes 5 minutes into a 30-minute exam.
    The server must re-seed ~25 remaining minutes — never the full 30."""
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    aid = data["attempt_id"]

    with TestingSession() as db:
        attempt = db.query(ExamAttempt).filter(ExamAttempt.id == aid).one()
        # 5 minutes of the 30-minute window have elapsed.
        attempt.deadline_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
            minutes=25
        )
        db.commit()

    r = client.get(f"/api/attempts/{aid}/resume", headers=attempt_headers(data))
    assert r.status_code == 200, r.text
    status = r.json()["status"]
    assert CANONICAL_Z.match(status["deadline_at"]), status["deadline_at"]
    remaining = status["remaining_seconds"]
    assert 25 * 60 - 5 <= remaining <= 25 * 60, remaining
    # The crucial regression assertion: NOT reset to the full duration.
    assert remaining < 30 * 60 - 60
