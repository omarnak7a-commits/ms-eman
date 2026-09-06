"""Question model. Type-specific content lives in the JSON `data` column so
all three supported question types (MCQ / ordering / correct-the-brackets)
share one table, matching the existing frontend data shape.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, IdMixin, TimestampMixin, utcnow


class Question(Base, IdMixin, TimestampMixin):
    __tablename__ = "questions"

    exam_id: Mapped[str] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # multiple_choice | ordering | correct_brackets
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    marks: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    # Soft-delete flag: set instead of a hard delete when student answers
    # already reference the question (answers cascade-delete on hard delete,
    # which would destroy grading history). Hidden questions are excluded
    # from every live listing (editor, start payload, counts) but remain in
    # the snapshots of attempts that pinned them.
    hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    exam = relationship("Exam", back_populates="questions")
    answers = relationship("Answer", back_populates="question", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Question id={self.id!r} type={self.type!r} order={self.order_index}>"
