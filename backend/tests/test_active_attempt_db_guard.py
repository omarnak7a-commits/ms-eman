"""M5 regression tests: the database itself enforces at most ONE active
attempt per (exam, student).

The application check is sequential (read → insert) and a real race could
slip between them; the partial unique index
``uq_exam_attempts_one_active_per_student`` closes that window on PostgreSQL
and SQLite alike. Finalised duplicates (submitted/expired) stay legal so
legacy/historical data and the "best attempt wins" ranking keep working.
"""
from __future__ import annotations

import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from conftest import TestingSession, create_teacher
from app.models import Exam, ExamAttempt, Student

BASE_TIME = datetime.datetime(2026, 9, 6, 12, 0, tzinfo=datetime.timezone.utc)


def _exam_and_student(db) -> tuple[Exam, Student]:
    teacher = create_teacher(db, email="guard.teacher@test.com")
    exam = Exam(
        title="Guard Exam",
        slug="guard-exam",
        duration_minutes=30,
        status="published",
        ranking_enabled=True,
        result_visibility=True,
        review_visibility=False,
        created_by=teacher.id,
    )
    db.add(exam)
    db.flush()
    student = Student(name="Racer", normalized_name="racer")
    db.add(student)
    db.flush()
    db.commit()
    return exam, student


def _insert_attempt(db, exam: Exam, student: Student, *, status: str, minutes_before_start: int = 0) -> ExamAttempt:
    started = BASE_TIME - datetime.timedelta(minutes=minutes_before_start)
    attempt = ExamAttempt(
        exam_id=exam.id,
        student_id=student.id,
        status=status,
        started_at=started,
        deadline_at=started + datetime.timedelta(minutes=30),
        submitted_at=started + datetime.timedelta(minutes=10) if status != "active" else None,
        score=10 if status != "active" else 0,
        max_score=10,
        percentage=100 if status != "active" else 0,
        time_used_seconds=600,
    )
    db.add(attempt)
    db.flush()
    return attempt


def test_second_active_attempt_for_same_student_exam_is_rejected_by_db(client):
    with TestingSession() as db:
        exam, student = _exam_and_student(db)
        _insert_attempt(db, exam, student, status="active")
        db.commit()

        with pytest.raises(IntegrityError):
            _insert_attempt(db, exam, student, status="active")
        db.rollback()

        # Only one active row survived.
        rows = db.execute(
            select(ExamAttempt).where(
                ExamAttempt.exam_id == exam.id,
                ExamAttempt.student_id == student.id,
                ExamAttempt.status == "active",
            )
        ).scalars().all()
        assert len(rows) == 1


def test_finalised_duplicates_remain_legal_for_legacy_data(client):
    """Historical/imported duplicates (submitted/expired) must not violate the
    partial index — only 'active' rows are constrained."""
    with TestingSession() as db:
        exam, student = _exam_and_student(db)
        _insert_attempt(db, exam, student, status="submitted", minutes_before_start=30)
        _insert_attempt(db, exam, student, status="submitted", minutes_before_start=60)
        _insert_attempt(db, exam, student, status="expired", minutes_before_start=90)
        db.commit()

        rows = db.execute(
            select(ExamAttempt).where(
                ExamAttempt.exam_id == exam.id, ExamAttempt.student_id == student.id
            )
        ).scalars().all()
        assert len(rows) == 3


def test_second_active_attempt_for_different_student_is_fine(client):
    with TestingSession() as db:
        exam, student = _exam_and_student(db)
        other = Student(name="Other Kid", normalized_name="other kid")
        db.add(other)
        db.flush()
        _insert_attempt(db, exam, student, status="active")
        _insert_attempt(db, exam, other, status="active")
        db.commit()

        actives = db.execute(
            select(ExamAttempt).where(
                ExamAttempt.exam_id == exam.id, ExamAttempt.status == "active"
            )
        ).scalars().all()
        assert len(actives) == 2
