"""Exam attempt + answer data access."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..models import Answer, ExamAttempt, Student


def get_attempt(db: Session, attempt_id: str, *, eager: bool = True) -> ExamAttempt | None:
    stmt = select(ExamAttempt)
    if eager:
        stmt = stmt.options(
            joinedload(ExamAttempt.exam),
            joinedload(ExamAttempt.student),
            joinedload(ExamAttempt.answers),
        )
    return db.execute(stmt.where(ExamAttempt.id == attempt_id)).scalars().first()


def get_active_by_student_and_exam(db: Session, exam_id: str, student_id: str) -> ExamAttempt | None:
    return db.execute(
        select(ExamAttempt).where(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.student_id == student_id,
            ExamAttempt.status == "active",
        )
    ).scalars().first()


def create(
    db: Session,
    *,
    exam_id: str,
    student_id: str,
    started_at: datetime,
    deadline_at: datetime,
) -> ExamAttempt:
    a = ExamAttempt(
        exam_id=exam_id,
        student_id=student_id,
        status="active",
        started_at=started_at,
        deadline_at=deadline_at,
    )
    db.add(a)
    db.flush()
    return a


def add(db: Session, obj) -> None:
    db.add(obj)
    db.flush()


def attempts_for_exam(db: Session, exam_id: str) -> list[ExamAttempt]:
    return db.execute(
        select(ExamAttempt)
        .where(ExamAttempt.exam_id == exam_id)
        .options(joinedload(ExamAttempt.student))
        .order_by(ExamAttempt.started_at.desc())
    ).scalars().all()


def attempts_for_student(db: Session, student_id: str) -> list[ExamAttempt]:
    return db.execute(
        select(ExamAttempt)
        .where(ExamAttempt.student_id == student_id)
        .options(joinedload(ExamAttempt.exam))
    ).scalars().all()


def get_answer(db: Session, attempt_id: str, question_id: str) -> Answer | None:
    return db.execute(
        select(Answer).where(
            Answer.attempt_id == attempt_id, Answer.question_id == question_id
        )
    ).scalars().first()


def list_answers(db: Session, attempt_id: str) -> list[Answer]:
    return db.execute(
        select(Answer).where(Answer.attempt_id == attempt_id)
    ).scalars().all()


def student_by_id(db: Session, student_id: str) -> Student | None:
    return db.get(Student, student_id)


def save_answer(
    db: Session,
    *,
    attempt_id: str,
    question_id: str,
    answer_data: dict[str, Any],
    answered_at: datetime,
) -> Answer:
    existing = get_answer(db, attempt_id, question_id)
    if existing is not None:
        existing.answer_data = answer_data
        existing.answered_at = answered_at
        db.flush()
        return existing
    answer = Answer(
        attempt_id=attempt_id,
        question_id=question_id,
        answer_data=answer_data,
        is_correct=None,
        awarded_marks=0,
        answered_at=answered_at,
    )
    db.add(answer)
    db.flush()
    return answer
