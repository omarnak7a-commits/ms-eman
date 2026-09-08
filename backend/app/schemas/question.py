"""Question schemas.

Question-specific content is carried in a free-form JSON `data` payload whose
shape is validated server-side by type. This matches the frontend's existing
`QuestionData` shape while keeping the API flexible and safe.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .common import QuestionType


class MCQOption(BaseModel):
    id: str = ""
    text: str = Field(min_length=1)
    order_index: int = 0
    is_correct: bool = False


class OrderingToken(BaseModel):
    id: str = ""
    text: str = Field(min_length=1)
    correct_position: int = 0


class BracketItem(BaseModel):
    id: str = ""
    original_word: str = Field(min_length=1)
    accepted_answers: list[str] = []
    case_sensitive: bool = False


class QuestionCreate(BaseModel):
    type: QuestionType
    text: str = Field(min_length=1)
    marks: int = Field(default=1, ge=0, le=100)
    order_index: int | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class QuestionUpdate(BaseModel):
    text: str | None = None
    marks: int | None = Field(default=None, ge=0, le=100)
    data: dict[str, Any] | None = None
    order_index: int | None = None


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    exam_id: str
    type: QuestionType
    text: str
    order_index: int
    marks: int
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class QuestionReorderItem(BaseModel):
    id: str
    order_index: int


class QuestionReorderRequest(BaseModel):
    ordered_ids: list[str] = Field(min_length=1)


class MCQOptionOut(BaseModel):
    id: str
    text: str
    order_index: int


class MCQStudentView(BaseModel):
    type: str
    options: list[MCQOptionOut]


class OrderingTokenStudentView(BaseModel):
    id: str
    text: str
    # For ordering, the correct position is never exposed to the student.
    # Tokens are delivered pre-shuffled; the order in the array is the display order.


class OrderingStudentView(BaseModel):
    type: str
    tokens: list[OrderingTokenStudentView]
    first_word: str | None = None
    first_word_id: str | None = None


class BracketStudentView(BaseModel):
    id: str
    original_word: str


class BracketsStudentView(BaseModel):
    type: str
    sentence: str
    brackets: list[BracketStudentView]
