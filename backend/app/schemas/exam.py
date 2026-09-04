"""Exam schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .common import ExamStatus


class ExamBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""
    instructions: str = ""
    duration_minutes: int = Field(default=30, ge=1, le=600)
    ranking_enabled: bool = True
    result_visibility: bool = True
    review_visibility: bool = False


class ExamCreate(ExamBase):
    pass


class ExamUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    instructions: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    ranking_enabled: bool | None = None
    result_visibility: bool | None = None
    review_visibility: bool | None = None


class ExamOut(ExamBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    status: ExamStatus
    created_by: str
    published_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    question_count: int = 0
    attempt_count: int = 0


class ExamPublic(BaseModel):
    """Public (student-facing) exam info shown before starting."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    title: str
    description: str
    instructions: str
    duration_minutes: int
    status: ExamStatus
    ranking_enabled: bool
    result_visibility: bool
    review_visibility: bool
    question_count: int = 0
    max_score: float = 0


class ExamResultSummary(BaseModel):
    id: str
    title: str
    slug: str
    status: ExamStatus
    duration_minutes: int
    ranking_enabled: bool
    result_visibility: bool
    review_visibility: bool
    question_count: int
    max_score: float
    total_attempts: int
    completed_attempts: int
    average_score: float
    average_percentage: float
    highest_score: float
    lowest_score: float
    highest_percentage: float
    lowest_percentage: float
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
