"""Student schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StudentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class StudentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime


class StudentListItem(BaseModel):
    id: str
    name: str
    exam_count: int = 0
    attempts_count: int = 0
    average_score: float = 0
    average_percentage: float = 0
    highest_score: float = 0
    highest_percentage: float = 0
    last_exam_at: datetime | None = None
    last_exam_title: str | None = None
    created_at: datetime
