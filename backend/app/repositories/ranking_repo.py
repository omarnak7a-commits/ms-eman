"""Read-only ranking queries.

Ranking is derived from stored attempt results.  These queries deliberately
select only the columns the ranking service needs and never load questions,
answers, answer keys, tokens, or other authentication data.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Exam, ExamAttempt, Student


COMPLETED_ATTEMPT_STATUSES = ("submitted", "expired")


@dataclass(frozen=True, slots=True)
class ExamRankingContext:
    exam_id: str
    exam_title: str
    teacher_id: str
    ranking_enabled: bool


@dataclass(frozen=True, slots=True)
class RankingAttemptRow:
    attempt_id: str
    exam_id: str
    student_id: str
    student_name: str
    score: float
    max_score: float
    submitted_at: datetime
    time_used_seconds: int


def exam_context(db: Session, exam_id: str) -> ExamRankingContext | None:
    """Return the small exam projection needed for ranking authorization."""
    row = db.execute(
        select(
            Exam.id,
            Exam.title,
            Exam.created_by,
            Exam.ranking_enabled,
        ).where(Exam.id == exam_id)
    ).one_or_none()
    if row is None:
        return None
    return ExamRankingContext(
        exam_id=row.id,
        exam_title=row.title,
        teacher_id=row.created_by,
        ranking_enabled=row.ranking_enabled,
    )


def completed_for_exam(db: Session, exam_id: str) -> list[RankingAttemptRow]:
    """Fetch submitted/auto-submitted results for one exam in one query."""
    rows = db.execute(
        select(
            ExamAttempt.id.label("attempt_id"),
            ExamAttempt.exam_id,
            ExamAttempt.student_id,
            Student.name.label("student_name"),
            ExamAttempt.score,
            ExamAttempt.max_score,
            ExamAttempt.submitted_at,
            ExamAttempt.time_used_seconds,
        )
        .join(Student, Student.id == ExamAttempt.student_id)
        .where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.status.in_(COMPLETED_ATTEMPT_STATUSES),
            # A status without a submission timestamp is not a completed result.
            ExamAttempt.submitted_at.is_not(None),
        )
    ).all()
    return [
        RankingAttemptRow(
            attempt_id=row.attempt_id,
            exam_id=row.exam_id,
            student_id=row.student_id,
            student_name=row.student_name,
            score=float(row.score),
            max_score=float(row.max_score),
            submitted_at=row.submitted_at,
            time_used_seconds=row.time_used_seconds,
        )
        for row in rows
    ]


def completed_for_teacher(db: Session, teacher_id: str) -> list[RankingAttemptRow]:
    """Fetch all completed results across one teacher's exams in one query."""
    rows = db.execute(
        select(
            ExamAttempt.id.label("attempt_id"),
            ExamAttempt.exam_id,
            ExamAttempt.student_id,
            Student.name.label("student_name"),
            ExamAttempt.score,
            ExamAttempt.max_score,
            ExamAttempt.submitted_at,
            ExamAttempt.time_used_seconds,
        )
        .join(Exam, Exam.id == ExamAttempt.exam_id)
        .join(Student, Student.id == ExamAttempt.student_id)
        .where(
            Exam.created_by == teacher_id,
            ExamAttempt.status.in_(COMPLETED_ATTEMPT_STATUSES),
            ExamAttempt.submitted_at.is_not(None),
        )
    ).all()
    return [
        RankingAttemptRow(
            attempt_id=row.attempt_id,
            exam_id=row.exam_id,
            student_id=row.student_id,
            student_name=row.student_name,
            score=float(row.score),
            max_score=float(row.max_score),
            submitted_at=row.submitted_at,
            time_used_seconds=row.time_used_seconds,
        )
        for row in rows
    ]
