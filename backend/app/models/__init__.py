"""Import all models so that Base.metadata is fully populated for Alembic."""
from .base import Base
from .answer import Answer
from .exam import Exam
from .exam_attempt import ExamAttempt
from .question import Question
from .refresh_token import RefreshToken
from .student import Student
from .teacher import Teacher

__all__ = [
    "Base",
    "Answer",
    "Exam",
    "ExamAttempt",
    "Question",
    "RefreshToken",
    "Student",
    "Teacher",
]
