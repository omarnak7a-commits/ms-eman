"""one active attempt per student per exam

Closes the double-start race at the database level with a PARTIAL unique
index on ``exam_attempts (exam_id, student_id) WHERE status = 'active'``.
Two simultaneous "Start Exam" requests for the same student on the same exam
can therefore never both create an active attempt, on PostgreSQL (production)
and SQLite (local dev/tests) alike.

Only ``active`` rows are constrained. Historical/finalised duplicates
(``submitted``/``expired``) keep the existing "best attempt wins" semantics
used by rankings and statistics, so nothing about legacy data changes.

The upgrade first resolves any pre-existing duplicate ACTIVE attempts (only
possible from the old race): the earliest-started attempt of each
(exam_id, student_id) stays active and the later ones are auto-expired —
mirroring the server's deadline expiry as closely as a data migration can
(expired at their deadline when it already passed, otherwise at migration
time). This keeps the migration non-destructive and data-preserving: no rows
are deleted and the kept attempt's answers/scores are untouched.

Revision ID: 4f2b8a1c9e05
Revises: a3f1c9d24e75
Create Date: 2026-09-07
"""
from __future__ import annotations

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = '4f2b8a1c9e05'
down_revision = 'a3f1c9d24e75'
branch_labels = None
depends_on = None


_INDEX_NAME = 'uq_exam_attempts_one_active_per_student'


def _repair_duplicate_active_attempts() -> None:
    """Keep the earliest active attempt per (exam, student); expire the rest.

    Runs before creating the partial unique index so pre-existing duplicate
    active attempts (from the old race) cannot make the migration fail.
    """
    conn = op.get_bind()
    attempts_t = sa.table(
        'exam_attempts',
        sa.column('id', sa.String()),
        sa.column('exam_id', sa.String()),
        sa.column('student_id', sa.String()),
        sa.column('status', sa.String()),
        sa.column('started_at', sa.DateTime(timezone=True)),
        sa.column('deadline_at', sa.DateTime(timezone=True)),
        sa.column('submitted_at', sa.DateTime(timezone=True)),
    )

    rows = conn.execute(
        sa.select(
            attempts_t.c.id,
            attempts_t.c.exam_id,
            attempts_t.c.student_id,
            attempts_t.c.started_at,
            attempts_t.c.deadline_at,
        ).where(attempts_t.c.status == 'active')
    ).fetchall()

    # Group by (exam_id, student_id), order by start time for determinism.
    by_exam_student: dict[tuple[str, str], list[tuple]] = {}
    for row in rows:
        by_exam_student.setdefault((row.exam_id, row.student_id), []).append(row)

    for duplicates in by_exam_student.values():
        if len(duplicates) <= 1:
            continue
        # SQLite stores naive datetimes; PostgreSQL stores aware ones.
        # Normalise before comparing so the sort is deterministic on both.
        def _aware(dt):
            if dt is None or dt.tzinfo is not None:
                return dt
            return dt.replace(tzinfo=timezone.utc)

        duplicates.sort(
            key=lambda r: (_aware(r.started_at) is None, _aware(r.started_at), r.id)
        )
        losers = duplicates[1:]
        now = datetime.now(timezone.utc)
        for loser in losers:
            # submitted_at = deadline when it already passed, else now — the
            # same choice the server makes when auto-expiring.
            deadline = _aware(loser.deadline_at)
            submitted_at = deadline if deadline and deadline <= now else now
            conn.execute(
                attempts_t.update()
                .where(attempts_t.c.id == loser.id)
                .values(status='expired', submitted_at=submitted_at)
            )


def upgrade() -> None:
    _repair_duplicate_active_attempts()
    op.create_index(
        _INDEX_NAME,
        'exam_attempts',
        ['exam_id', 'student_id'],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
        sqlite_where=sa.text("status = 'active'"),
    )


def downgrade() -> None:
    op.drop_index(_INDEX_NAME, table_name='exam_attempts')
