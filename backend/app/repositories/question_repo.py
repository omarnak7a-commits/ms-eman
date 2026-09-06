"""Question data access."""
from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from ..models import Answer, Question


def get_by_id(db: Session, question_id: str) -> Question | None:
    return db.get(Question, question_id)


def get_for_exam(db: Session, exam_id: str, *, include_hidden: bool = False) -> list[Question]:
    """Live (non-soft-deleted) questions unless explicitly asked otherwise."""
    stmt = select(Question).where(Question.exam_id == exam_id)
    if not include_hidden:
        stmt = stmt.where(Question.hidden.is_(False))
    return db.execute(
        stmt.order_by(Question.order_index, Question.created_at)
    ).scalars().all()


def get_by_exam_id_and_ids(db: Session, exam_id: str, ids: list[str]) -> list[Question]:
    return db.execute(
        select(Question).where(Question.exam_id == exam_id, Question.id.in_(ids))
    ).scalars().all()


def create(db: Session, *, exam_id: str, type: str, text: str, marks: int, order_index: int, data: dict) -> Question:
    q = Question(
        exam_id=exam_id,
        type=type,
        text=text,
        marks=marks,
        order_index=order_index,
        data=data,
    )
    db.add(q)
    db.flush()
    return q


def add(db: Session, q: Question) -> None:
    db.add(q)
    db.flush()


def delete(db: Session, q: Question) -> None:
    db.delete(q)
    db.flush()


def has_answers(db: Session, question_id: str) -> bool:
    """True when any student answer references the question — such questions
    must be soft-deleted (hidden), because answers cascade on hard delete and
    would take grading history with them."""
    return bool(
        db.execute(
            select(func.count(Answer.id)).where(Answer.question_id == question_id)
        ).scalar_one()
    )


def next_order_index(db: Session, exam_id: str) -> int:
    row = db.execute(
        select(Question.order_index)
        .where(Question.exam_id == exam_id)
        .order_by(Question.order_index.desc())
        .limit(1)
    ).first()
    return (row[0] + 1) if row else 0


def reindex(db: Session, exam_id: str, ordered_ids: list[str]) -> None:
    for idx, qid in enumerate(ordered_ids):
        db.execute(
            update(Question)
            .where(Question.id == qid, Question.exam_id == exam_id)
            .values(order_index=idx)
        )
    db.flush()
