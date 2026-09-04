"""Common response envelopes / literals."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

ExamStatus = Literal["draft", "published", "active", "closed"]
AttemptStatus = Literal["active", "submitted", "expired"]
QuestionType = Literal["multiple_choice", "ordering", "correct_brackets"]


class Message(BaseModel):
    message: str


class Detail(BaseModel):
    detail: str
