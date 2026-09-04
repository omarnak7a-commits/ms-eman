"""Attempt, answer and result schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .common import AttemptStatus


class StartAttemptRequest(BaseModel):
    student_name: str = Field(min_length=1, max_length=255)


class StartAttemptResponse(BaseModel):
    attempt_id: str
    exam_id: str
    exam_slug: str
    status: AttemptStatus
    started_at: datetime
    deadline_at: datetime
    duration_seconds: int
    # Bearer token used to authorize all student calls for this attempt.
    student_token: str
    token_type: str = "bearer"
    questions: list[dict[str, Any]]


class QuestionStudentPayload(BaseModel):
    id: str
    type: str
    text: str
    marks: int
    data: dict[str, Any]


class AttemptStatusOut(BaseModel):
    """Lightweight attempt status for deep-link recovery."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    status: AttemptStatus
    started_at: datetime
    deadline_at: datetime
    submitted_at: datetime | None
    can_resume: bool


class AnswerUpsert(BaseModel):
    answer_data: dict[str, Any]


class AnswerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    attempt_id: str
    question_id: str
    answer_data: dict[str, Any]
    answered_at: datetime
    updated_at: datetime


class SubmittedAttemptOut(BaseModel):
    """Attempt view returned to the owner (result endpoint)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    exam_title: str
    student_id: str
    student_name: str
    status: AttemptStatus
    started_at: datetime
    deadline_at: datetime
    submitted_at: datetime | None
    score: float
    max_score: float
    percentage: float
    correct_count: int
    incorrect_count: int
    unanswered_count: int
    time_used_seconds: int
    rank: int | None


class ResultResponse(BaseModel):
    attempt: SubmittedAttemptOut


class ReviewAnswerItem(BaseModel):
    question_id: str
    question_type: str
    text: str
    order_index: int
    marks: int
    student_answer: dict[str, Any] | None
    correct_answer: dict[str, Any] | None
    is_correct: bool | None
    awarded_marks: float


class ReviewResponse(BaseModel):
    attempt_id: str
    exam_id: str
    exam_title: str
    student_name: str
    score: float
    max_score: float
    percentage: float
    submitted_at: datetime | None
    items: list[ReviewAnswerItem]


class RankingEntry(BaseModel):
    rank: int
    student_name: str
    score: float
    max_score: float
    percentage: float
    time_used_seconds: int
    attempt_id: str
    submitted_at: datetime | None


class RankingResponse(BaseModel):
    exam_id: str
    exam_title: str
    ranking_enabled: bool
    entries: list[RankingEntry]


class AttemptResultItem(BaseModel):
    """Teacher-facing row on the exam results table."""
    attempt_id: str
    student_id: str
    student_name: str
    status: AttemptStatus
    started_at: datetime
    submitted_at: datetime | None
    score: float
    max_score: float
    percentage: float
    correct_count: int
    incorrect_count: int
    unanswered_count: int
    time_used_seconds: int
    rank: int | None


class ExamResultsResponse(BaseModel):
    exam_id: str
    exam_title: str
    summary: dict[str, Any]
    attempts: list[AttemptResultItem]


class AttemptAnswerDetail(BaseModel):
    question_id: str
    question_type: str
    text: str
    marks: int
    order_index: int
    student_answer: dict[str, Any] | None
    correct_answer: dict[str, Any] | None
    is_correct: bool | None
    awarded_marks: float


class AttemptDetailTeacher(BaseModel):
    attempt_id: str
    student_id: str
    student_name: str
    status: AttemptStatus
    started_at: datetime
    deadline_at: datetime
    submitted_at: datetime | None
    score: float
    max_score: float
    percentage: float
    correct_count: int
    incorrect_count: int
    unanswered_count: int
    time_used_seconds: int
    rank: int | None
    answers: list[AttemptAnswerDetail]
