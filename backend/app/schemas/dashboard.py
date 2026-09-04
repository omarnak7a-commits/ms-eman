"""Dashboard aggregation schema."""
from __future__ import annotations

from pydantic import BaseModel

from .exam import ExamOut


class ExamRow(ExamOut):
    average_percentage: float = 0
    completed_count: int = 0


class DashboardSummary(BaseModel):
    total_exams: int
    total_students: int
    total_attempts: int
    completed_attempts: int
    average_score: float
    recent_exams: list[ExamRow]
