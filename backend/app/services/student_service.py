"""Student business rules: name normalization, dedup + aggregate stats."""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from ..core.exceptions import ValidationError
from ..models import ExamAttempt, Student
from ..repositories import exam_repo, student_repo
from ..schemas.student import StudentListItem


def normalize_name(name: str) -> str:
    """Collapse whitespace + lowercase for matching; display name is preserved."""
    return " ".join(name.strip().split()).lower()


def find_or_create(db: Session, name: str) -> Student:
    display = name.strip()
    if not display:
        raise ValidationError("Student name is required.")
    normalized = normalize_name(display)
    existing = student_repo.get_by_normalized(db, normalized)
    if existing:
        return existing
    return student_repo.create(db, name=display, normalized_name=normalized)


class StudentService:
    """Aggregates per-student statistics across the exams owned by a teacher."""

    def __init__(self, db: Session):
        self.db = db

    def list(self, owner_id: str, term: str | None) -> list[StudentListItem]:
        if term and term.strip():
            students = student_repo.search(self.db, term.strip())
        else:
            students = student_repo.list_all(self.db)

        exam_ids = self._owner_exam_ids(owner_id)
        all_attempts = self.db.query(ExamAttempt).all()
        by_student: dict[str, list[ExamAttempt]] = defaultdict(list)
        for a in all_attempts:
            if a.exam_id in exam_ids:
                by_student[a.student_id].append(a)

        rows: list[StudentListItem] = []
        for s in students:
            # Teacher scope: only students who actually attempted one of this
            # teacher's exams may appear in the list. A Student row created by
            # another teacher's exam (shared device/name pool) must never leak
            # into this teacher's roster.
            if s.id not in by_student:
                continue
            # Completed = submitted OR expired (deadline auto-submitted).
            mine = [a for a in by_student[s.id] if a.status in {"submitted", "expired"}]
            scores = [a.percentage for a in mine]
            exam_ids_attempted = {a.exam_id for a in mine}
            last = max(mine, key=lambda a: a.submitted_at or a.created_at) if mine else None
            last_title = None
            if last:
                exam = exam_repo.get_by_id(self.db, last.exam_id)
                last_title = exam.title if exam else None
            rows.append(
                StudentListItem(
                    id=s.id,
                    name=s.name,
                    created_at=s.created_at,
                    exam_count=len(exam_ids_attempted),
                    attempts_count=len(mine),
                    average_score=round(sum(a.score for a in mine) / len(mine), 2) if mine else 0,
                    average_percentage=round(sum(scores) / len(scores), 2) if mine else 0,
                    highest_score=max((a.score for a in mine), default=0),
                    highest_percentage=max(scores, default=0),
                    last_exam_at=(last.submitted_at if last else None),
                    last_exam_title=last_title,
                )
            )
        return rows

    def get(self, owner_id: str, student_id: str) -> Student | None:
        """A student visible to this teacher: attempted one of their exams."""
        s = student_repo.get_by_id(self.db, student_id)
        if not s:
            return None
        visible = self.db.query(ExamAttempt.id).filter(
            ExamAttempt.student_id == student_id,
            ExamAttempt.exam_id.in_(self._owner_exam_ids(owner_id)),
        ).first()
        return s if visible else None

    def _owner_exam_ids(self, owner_id: str) -> set[str]:
        return {e.id for e in exam_repo.list_for_teacher(self.db, owner_id)}
