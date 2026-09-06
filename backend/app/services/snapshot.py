"""Immutable exam-version snapshots.

An attempt's ``questions_snapshot`` freezes the exam exactly as it was when
the student started: question ids, types, texts, marks, order and full data
(including correct answers — needed for server-side grading). Every
attempt-scoped operation (resume display, answer validation, grading,
finalize, review) reads from this snapshot, so teacher edits made later can
never change an in-progress or past attempt:

    Published Exam → (snapshot taken at start) → Attempt → Immutable Version

New students simply take a fresh snapshot at their own start, which is how
"versions" advance without a separate version table.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..models import ExamAttempt, Question


@dataclass
class SnapshotQuestion:
    """Duck-typed stand-in for :class:`Question`.

    The payload builders and grading engine only read plain attributes
    (``id / type / text / marks / order_index / data``), so frozen snapshot
    items can flow through them unchanged — no separate grading path.
    """

    id: str
    type: str
    text: str
    marks: int
    order_index: int
    data: dict[str, Any]
    exam_id: str | None = None
    created_at: None = None
    updated_at: None = None


def build_snapshot(questions: list[Question]) -> list[dict[str, Any]]:
    """Freeze a live question set into the storable snapshot shape."""
    return [
        {
            "id": q.id,
            "type": q.type,
            "text": q.text,
            "marks": q.marks,
            "order_index": q.order_index,
            "data": q.data,
        }
        for q in questions
    ]


def hydrate(attempt: ExamAttempt, live_questions: list[Question]) -> list[SnapshotQuestion]:
    """The attempt's frozen question set.

    Falls back to the live question table only for legacy attempts created
    before versioning existed AND whose migration backfill could not run.
    """
    items = attempt.questions_snapshot
    if items is None:
        return [
            SnapshotQuestion(
                id=q.id, type=q.type, text=q.text, marks=q.marks,
                order_index=q.order_index, data=q.data, exam_id=q.exam_id,
            )
            for q in live_questions
        ]
    return [
        SnapshotQuestion(
            id=it["id"],
            type=it["type"],
            text=it.get("text", ""),
            marks=it.get("marks", 1),
            order_index=it.get("order_index", i),
            data=it.get("data") or {},
            exam_id=attempt.exam_id,
        )
        for i, it in enumerate(items)
    ]


def find(haystack: list[SnapshotQuestion], question_id: str) -> SnapshotQuestion | None:
    return next((q for q in haystack if q.id == question_id), None)
