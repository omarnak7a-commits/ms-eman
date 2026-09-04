"""Teacher data access."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Teacher


def get_by_id(db: Session, teacher_id: str) -> Teacher | None:
    return db.get(Teacher, teacher_id)


def get_by_email(db: Session, email: str) -> Teacher | None:
    return db.execute(select(Teacher).where(Teacher.email == email.lower())).scalar_one_or_none()


def create(db: Session, *, name: str, email: str, password_hash: str, role: str = "teacher") -> Teacher:
    teacher = Teacher(name=name, email=email.lower(), password_hash=password_hash, role=role)
    db.add(teacher)
    db.flush()
    return teacher
