"""Dynamic ranking calculations over authoritative stored attempt results."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..core.exceptions import AuthorizationError, NotFoundError
from ..core.timeutil import ensure_utc
from ..repositories import ranking_repo
from ..repositories.ranking_repo import RankingAttemptRow
from ..schemas.attempt import (
    OverallRankingEntry,
    OverallRankingResponse,
    RankingEntry,
    RankingResponse,
)


_LATEST = datetime.max.replace(tzinfo=timezone.utc)


def _submitted_at(row: RankingAttemptRow) -> datetime:
    return ensure_utc(row.submitted_at) or _LATEST


def _percentage(row: RankingAttemptRow) -> float:
    """Normalize the authoritative score without re-grading any answers."""
    if row.max_score <= 0:
        return 0.0
    return round(row.score / row.max_score * 100, 2)


def _best_attempt_key(row: RankingAttemptRow) -> tuple:
    # Highest stored score wins.  For an equal score, preserve the product rule
    # that the earlier submission is better, then use the immutable id so the
    # result remains deterministic even for identical timestamps.
    return (-row.score, _submitted_at(row), row.attempt_id)


def _ranking_key(row: RankingAttemptRow) -> tuple:
    return (
        -row.score,
        _submitted_at(row),
        row.student_id,
        row.attempt_id,
    )


def _best_per_student(rows: list[RankingAttemptRow]) -> list[RankingAttemptRow]:
    best: dict[str, RankingAttemptRow] = {}
    for row in rows:
        current = best.get(row.student_id)
        if current is None or _best_attempt_key(row) < _best_attempt_key(current):
            best[row.student_id] = row
    return sorted(best.values(), key=_ranking_key)


@dataclass(frozen=True, slots=True)
class _OverallStudent:
    student_id: str
    student_name: str
    exams_completed: int
    average_percentage: float
    best_percentage: float


class RankingService:
    """Teacher and student ranking views backed by read-only result queries."""

    def __init__(self, db: Session):
        self.db = db

    def exam_ranking(self, exam_id: str, *, teacher_id: str | None = None) -> dict:
        context = ranking_repo.exam_context(self.db, exam_id)
        if context is None:
            raise NotFoundError("Exam not found.")
        if teacher_id is not None and context.teacher_id != teacher_id:
            raise AuthorizationError("You do not have access to this exam.")

        ranked = _best_per_student(ranking_repo.completed_for_exam(self.db, exam_id))
        percentages = [_percentage(row) for row in ranked]
        scores = [row.score for row in ranked]
        count = len(ranked)

        entries = [
            RankingEntry(
                rank=index,
                student_name=row.student_name,
                score=row.score,
                max_score=row.max_score,
                # ``total_marks`` is the requested API name; ``max_score`` is
                # retained for backwards compatibility with the student UI.
                total_marks=row.max_score,
                percentage=_percentage(row),
                time_used_seconds=row.time_used_seconds,
                attempt_id=row.attempt_id,
                submitted_at=row.submitted_at,
            )
            for index, row in enumerate(ranked, start=1)
        ]
        response = RankingResponse(
            exam_id=context.exam_id,
            exam_title=context.exam_title,
            ranking_enabled=context.ranking_enabled,
            total_students=count,
            average_score=round(sum(scores) / count, 2) if count else 0,
            highest_score=max(scores, default=0),
            lowest_score=min(scores, default=0),
            average_percentage=(
                round(sum(percentages) / count, 2) if count else 0
            ),
            highest_percentage=max(percentages, default=0),
            lowest_percentage=min(percentages, default=0),
            entries=entries,
        )
        return response.model_dump(mode="json")

    def overall_ranking(self, teacher_id: str) -> dict:
        rows = ranking_repo.completed_for_teacher(self.db, teacher_id)

        # Be defensive about legacy/imported duplicate attempts even though the
        # current start flow allows only one attempt per student and exam.
        best_by_student_exam: dict[tuple[str, str], RankingAttemptRow] = {}
        for row in rows:
            key = (row.student_id, row.exam_id)
            current = best_by_student_exam.get(key)
            if current is None or _best_attempt_key(row) < _best_attempt_key(current):
                best_by_student_exam[key] = row

        by_student: dict[str, list[RankingAttemptRow]] = defaultdict(list)
        for row in best_by_student_exam.values():
            by_student[row.student_id].append(row)

        students: list[_OverallStudent] = []
        for student_id, attempts in by_student.items():
            percentages = [_percentage(row) for row in attempts]
            students.append(
                _OverallStudent(
                    student_id=student_id,
                    student_name=attempts[0].student_name,
                    exams_completed=len(attempts),
                    average_percentage=round(
                        sum(percentages) / len(percentages), 2
                    ),
                    best_percentage=max(percentages, default=0),
                )
            )

        # Average percentage is the overall score.  Remaining keys make ties
        # stable and reward stronger breadth before falling back to identity.
        students.sort(
            key=lambda row: (
                -row.average_percentage,
                -row.best_percentage,
                -row.exams_completed,
                row.student_name.casefold(),
                row.student_id,
            )
        )
        aggregate_scores = [row.average_percentage for row in students]
        count = len(students)
        average = round(sum(aggregate_scores) / count, 2) if count else 0
        highest = max(aggregate_scores, default=0)
        lowest = min(aggregate_scores, default=0)
        entries = [
            OverallRankingEntry(
                rank=index,
                student_name=row.student_name,
                exams_completed=row.exams_completed,
                average_percentage=row.average_percentage,
                best_percentage=row.best_percentage,
            )
            for index, row in enumerate(students, start=1)
        ]
        response = OverallRankingResponse(
            total_students=count,
            average_score=average,
            highest_score=highest,
            lowest_score=lowest,
            average_percentage=average,
            highest_percentage=highest,
            lowest_percentage=lowest,
            entries=entries,
        )
        return response.model_dump(mode="json")

    def student_position(self, exam_id: str, student_id: str) -> tuple[int | None, int]:
        """Return one student's dynamic exam rank and the ranked student count."""
        context = ranking_repo.exam_context(self.db, exam_id)
        if context is None:
            raise NotFoundError("Exam not found.")
        ranked = _best_per_student(ranking_repo.completed_for_exam(self.db, exam_id))
        for index, row in enumerate(ranked, start=1):
            if row.student_id == student_id:
                return index, len(ranked)
        return None, len(ranked)
