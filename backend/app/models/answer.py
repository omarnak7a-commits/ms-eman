"""Student answer to a single question within an attempt."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, IdMixin, utcnow


class Answer(Base, IdMixin):
    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id", "question_id", name="uq_answer_per_attempt_question"
        ),
    )

    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("exam_attempts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[str] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    answer_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    awarded_marks: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    attempt = relationship("ExamAttempt", back_populates="answers")
    question = relationship("Question", back_populates="answers")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Answer attempt={self.attempt_id!r} question={self.question_id!r}>"
