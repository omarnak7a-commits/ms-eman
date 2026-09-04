"""Student model. Students are matched by a normalized name so the same
learner is not duplicated, while the original display spelling is preserved.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, IdMixin, TimestampMixin, utcnow


class Student(Base, IdMixin, TimestampMixin):
    __tablename__ = "students"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Lowercased, whitespace-collapsed name used for deduplication + search.
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    attempts = relationship("ExamAttempt", back_populates="student", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Student id={self.id!r} name={self.name!r}>"
