"""Exam attempt model. Holds authoritative server-side timing and results."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Index,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, IdMixin, TimestampMixin, utcnow


class ExamAttempt(Base, IdMixin, TimestampMixin):
    __tablename__ = "exam_attempts"
    __table_args__ = (
        # Lookup for "the active attempt of a student on an exam".
        Index("ix_exam_attempts_exam_student", "exam_id", "student_id"),
        # DB-level guard for the double-start race: at most ONE active attempt
        # per student per exam. Finalised (submitted/expired) rows are exempt,
        # so legacy/historical duplicates keep working ("best attempt wins"
        # semantics in rankings/stats). The partial predicate makes this safe
        # on both PostgreSQL (production) and SQLite (tests).
        Index(
            "uq_exam_attempts_one_active_per_student",
            "exam_id",
            "student_id",
            unique=True,
            sqlite_where=text("status = 'active'"),
            postgresql_where=text("status = 'active'"),
        ),
    )

    exam_id: Mapped[str] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[str] = mapped_column(
        ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", index=True
    )  # active | submitted | expired
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    deadline_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    time_used_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Immutable exam version this attempt started with: the full visible
    # question set (id, type, text, marks, order_index, data — including
    # correct answers, needed for grading) frozen at start time. Every
    # attempt-scoped operation (resume display, validation, grading, review)
    # reads from this snapshot, so later teacher edits NEVER change an
    # in-progress or past attempt. NULL only for legacy rows created before
    # versioning existed (the migration backfills them).
    questions_snapshot: Mapped[list | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    exam = relationship("Exam", back_populates="attempts")
    student = relationship("Student", back_populates="attempts")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ExamAttempt id={self.id!r} status={self.status!r}>"
