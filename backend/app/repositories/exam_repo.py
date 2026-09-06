"""Exam data access."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..models import Answer, Exam, ExamAttempt, Question


def get_by_id(db: Session, exam_id: str) -> Exam | None:
    return db.execute(
        select(Exam).options(joinedload(Exam.questions)).where(Exam.id == exam_id)
    ).scalars().first()


def get_by_slug(db: Session, slug: str) -> Exam | None:
    return db.execute(select(Exam).where(Exam.slug == slug)).scalars().first()


def list_for_teacher(db: Session, teacher_id: str) -> list[Exam]:
    return db.execute(
        select(Exam).where(Exam.created_by == teacher_id).order_by(Exam.created_at.desc())
    ).scalars().all()


def create(db: Session, **kwargs) -> Exam:
    exam = Exam(**kwargs)
    db.add(exam)
    db.flush()
    return exam


def add(db: Session, exam: Exam) -> None:
    db.add(exam)
    db.flush()


def delete(db: Session, exam: Exam) -> None:
    db.delete(exam)
    db.flush()


def question_count(db: Session, exam_id: str) -> int:
    # Hidden (soft-deleted) questions are not part of the live exam.
    return db.execute(
        select(func.count(Question.id)).where(
            Question.exam_id == exam_id, Question.hidden.is_(False)
        )
    ).scalar_one()


def max_score(db: Session, exam_id: str) -> float:
    return db.execute(
        select(func.coalesce(func.sum(Question.marks), 0)).where(
            Question.exam_id == exam_id, Question.hidden.is_(False)
        )
    ).scalar_one() or 0


def attempts_for_exam(db: Session, exam_id: str) -> list[ExamAttempt]:
    return db.execute(
        select(ExamAttempt).where(ExamAttempt.exam_id == exam_id)
    ).scalars().all()


def answers_for_attempts(db: Session, attempt_ids: list[str]) -> list[Answer]:
    if not attempt_ids:
        return []
    return db.execute(select(Answer).where(Answer.attempt_id.in_(attempt_ids))).scalars().all()
