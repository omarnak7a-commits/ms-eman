"""Exam model."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, IdMixin, TimestampMixin, new_id, utcnow


class Exam(Base, IdMixin, TimestampMixin):
    __tablename__ = "exams"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    instructions: Mapped[str] = mapped_column(Text, default="", nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft", index=True
    )  # draft | published | active | closed
    ranking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    result_visibility: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    review_visibility: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[str] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    owner = relationship("Teacher", back_populates="exams", foreign_keys=[created_by])
    questions = relationship(
        "Question",
        back_populates="exam",
        cascade="all, delete-orphan",
        order_by="Question.order_index",
    )
    attempts = relationship("ExamAttempt", back_populates="exam", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Exam id={self.id!r} title={self.title!r} status={self.status!r}>"
