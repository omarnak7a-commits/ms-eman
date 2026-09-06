"""Exam CRUD + lifecycle and teacher-scoped ownership rules."""
from __future__ import annotations

import random
import string

from sqlalchemy.orm import Session

from ..core.exceptions import AuthorizationError, ConflictError, NotFoundError
from ..models.base import utcnow
from ..models import Exam, ExamAttempt, Question
from ..repositories import exam_repo, question_repo
from ..schemas.exam import ExamOut
from ..services.slugify import slugify_base


def generate_slug(db: Session, title: str) -> str:
    base = slugify_base(title) or "exam"
    for _ in range(6):
        suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
        candidate = f"{base}-{suffix}"
        if not exam_repo.get_by_slug(db, candidate):
            return candidate
    # extremely unlikely fallback
    return f"{base}-{utcnow().timestamp():.0f}"


def require_owned_exam(db: Session, exam_id: str, teacher_id: str) -> Exam:
    exam = exam_repo.get_by_id(db, exam_id)
    if not exam:
        raise NotFoundError("Exam not found.")
    if exam.created_by != teacher_id:
        raise AuthorizationError("You do not have access to this exam.")
    return exam


def require_owned_editable_exam(db: Session, exam_id: str, teacher_id: str) -> Exam:
    """Ownership + not-closed check for every question/exam mutation."""
    exam = require_owned_exam(db, exam_id, teacher_id)
    if exam.status == "closed":
        raise ConflictError("A closed exam cannot be edited.")
    return exam


def _out(exam: Exam, db: Session) -> ExamOut:
    payload = ExamOut.model_validate(exam)
    payload.question_count = exam_repo.question_count(db, exam.id)
    payload.attempt_count = len(exam_repo.attempts_for_exam(db, exam.id))
    return payload


class ExamService:
    def __init__(self, db: Session):
        self.db = db

    def _require_exam(self, exam_id: str, teacher_id: str) -> Exam:
        return require_owned_exam(self.db, exam_id, teacher_id)

    def list(self, teacher_id: str) -> list[ExamOut]:
        exams = exam_repo.list_for_teacher(self.db, teacher_id)
        return [_out(e, self.db) for e in exams]

    def get(self, exam_id: str, teacher_id: str) -> ExamOut:
        exam = self._require_exam(exam_id, teacher_id)
        return _out(exam, self.db)

    def create(self, teacher_id: str, data) -> ExamOut:
        slug = generate_slug(self.db, data.title)
        exam = exam_repo.create(
            self.db,
            title=data.title.strip(),
            description=(data.description or "").strip(),
            instructions=(data.instructions or "").strip(),
            slug=slug,
            duration_minutes=data.duration_minutes,
            status="draft",
            ranking_enabled=data.ranking_enabled,
            result_visibility=data.result_visibility,
            review_visibility=data.review_visibility,
            created_by=teacher_id,
        )
        self.db.commit()
        return _out(exam, self.db)

    def update(self, exam_id: str, teacher_id: str, data) -> ExamOut:
        exam = self._require_exam(exam_id, teacher_id)
        if exam.status == "closed":
            raise ConflictError("A closed exam cannot be edited.")
        if data.title is not None:
            exam.title = data.title.strip() or exam.title
        if data.description is not None:
            exam.description = data.description.strip()
        if data.instructions is not None:
            exam.instructions = data.instructions.strip()
        if data.duration_minutes is not None:
            exam.duration_minutes = data.duration_minutes
        if data.ranking_enabled is not None:
            exam.ranking_enabled = data.ranking_enabled
        if data.result_visibility is not None:
            exam.result_visibility = data.result_visibility
        if data.review_visibility is not None:
            exam.review_visibility = data.review_visibility
        self.db.flush()
        self.db.commit()
        return _out(exam, self.db)

    def delete(self, exam_id: str, teacher_id: str) -> None:
        exam = self._require_exam(exam_id, teacher_id)
        exam_repo.delete(self.db, exam)
        self.db.commit()

    def publish(self, exam_id: str, teacher_id: str) -> ExamOut:
        exam = self._require_exam(exam_id, teacher_id)
        if exam.status not in {"draft", "published"}:
            raise ConflictError(f"Cannot publish an exam in status '{exam.status}'.")
        if exam_repo.question_count(self.db, exam_id) == 0:
            raise ConflictError("Add at least one question before publishing.")
        exam.status = "published"
        if not exam.published_at:
            exam.published_at = utcnow()
        self.db.commit()
        return _out(exam, self.db)

    def close(self, exam_id: str, teacher_id: str) -> ExamOut:
        exam = self._require_exam(exam_id, teacher_id)
        exam.status = "closed"
        exam.closed_at = utcnow()
        self.db.commit()
        return _out(exam, self.db)

    def activate(self, exam_id: str, teacher_id: str) -> ExamOut:
        exam = self._require_exam(exam_id, teacher_id)
        if exam.status == "closed":
            raise ConflictError("A closed exam cannot be reactivated.")
        exam.status = "active"
        if not exam.published_at:
            exam.published_at = utcnow()
        self.db.commit()
        return _out(exam, self.db)

    def duplicate(self, exam_id: str, teacher_id: str) -> ExamOut:
        exam = self._require_exam(exam_id, teacher_id)
        slug = generate_slug(self.db, f"{exam.title} copy")
        copy = exam_repo.create(
            self.db,
            title=f"{exam.title} (Copy)",
            description=exam.description,
            instructions=exam.instructions,
            slug=slug,
            duration_minutes=exam.duration_minutes,
            status="draft",
            ranking_enabled=exam.ranking_enabled,
            result_visibility=exam.result_visibility,
            review_visibility=exam.review_visibility,
            created_by=teacher_id,
        )
        questions = question_repo.get_for_exam(self.db, exam_id)
        for q in questions:
            qcopy = Question(
                exam_id=copy.id,
                type=q.type,
                text=q.text,
                order_index=q.order_index,
                marks=q.marks,
                data=q.data,
            )
            question_repo.add(self.db, qcopy)
        self.db.commit()
        return _out(copy, self.db)
