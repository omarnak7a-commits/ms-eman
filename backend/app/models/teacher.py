"""Teacher / user account model."""
from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, IdMixin, TimestampMixin


class Teacher(Base, IdMixin, TimestampMixin):
    __tablename__ = "teachers"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="teacher")  # teacher | admin

    exams = relationship("Exam", back_populates="owner", foreign_keys="Exam.created_by")
    refresh_tokens = relationship(
        "RefreshToken", back_populates="teacher", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Teacher id={self.id!r} email={self.email!r} role={self.role!r}>"
