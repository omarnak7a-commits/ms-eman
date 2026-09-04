"""Student data access."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Student


def get_by_id(db: Session, student_id: str) -> Student | None:
    return db.get(Student, student_id)


def get_by_normalized(db: Session, normalized_name: str) -> Student | None:
    return db.execute(
        select(Student).where(Student.normalized_name == normalized_name)
    ).scalar_one_or_none()


def list_all(db: Session) -> list[Student]:
    return db.execute(select(Student).order_by(Student.created_at.desc())).scalars().all()


def search(db: Session, term: str) -> list[Student]:
    like = f"%{term}%"
    return db.execute(
        select(Student)
        .where(Student.name.ilike(like) | Student.normalized_name.ilike(like))
        .order_by(Student.name)
    ).scalars().all()


def create(db: Session, *, name: str, normalized_name: str) -> Student:
    s = Student(name=name, normalized_name=normalized_name)
    db.add(s)
    db.flush()
    return s
