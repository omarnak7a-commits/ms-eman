"""Optional DEVELOPMENT seed command.

Never runs automatically. To run manually (development only):

    python -m app.seed

Creates the demo teacher plus a small sample exam with one question of each
supported type. In production this command refuses to run.
"""
from __future__ import annotations

from .core.config import get_settings
from .core.security import hash_password
from .models.base import new_id
from .db.session import SessionLocal
from .models import Exam, Question, Teacher
from .repositories import teacher_repo
from .services.exam_service import generate_slug

# DEVELOPMENT-ONLY credentials — clearly documented, never used in production.
DEV_TEACHER_EMAIL = "ms.eman.zahy@test.com"
DEV_TEACHER_PASSWORD = "EmanDev2024!"  # DEVELOPMENT ONLY


def _sample_exam(db, teacher_id: str) -> Exam:
    slug = generate_slug(db, "English Grammar Test")
    exam = Exam(
        title="English Grammar Test",
        description="A sample English grammar examination.",
        instructions="Read each question carefully and answer. You have 30 minutes.",
        slug=slug,
        duration_minutes=30,
        status="published",
        ranking_enabled=True,
        result_visibility=True,
        review_visibility=True,
        created_by=teacher_id,
    )
    db.add(exam)
    db.flush()

    opt = lambda text, correct=False: {  # noqa: E731
        "id": new_id(), "text": text, "order_index": 0, "is_correct": correct,
    }
    opts = [opt("goes", True), opt("go"), opt("going"), opt("gone")]

    questions = [
        Question(
            exam_id=exam.id, type="multiple_choice", text="She ___ to school every day.",
            order_index=0, marks=1,
            data={"type": "multiple_choice", "options": opts},
        ),
        Question(
            exam_id=exam.id, type="ordering",
            text="Arrange the words to form a correct sentence.",
            order_index=1, marks=2,
            data={"type": "ordering", "tokens": [
                {"id": new_id(), "text": "Ahmed", "correct_position": 0},
                {"id": new_id(), "text": "goes", "correct_position": 1},
                {"id": new_id(), "text": "to", "correct_position": 2},
                {"id": new_id(), "text": "school", "correct_position": 3},
                {"id": new_id(), "text": "every", "correct_position": 4},
                {"id": new_id(), "text": "day", "correct_position": 5},
            ]},
        ),
        Question(
            exam_id=exam.id, type="correct_brackets",
            text="Correct the word in brackets.",
            order_index=2, marks=1,
            data={"type": "correct_brackets", "sentence": "She (go) to school every day.",
                  "brackets": [{"id": new_id(), "original_word": "go",
                                "accepted_answers": ["goes"], "case_sensitive": False}]},
        ),
    ]
    db.add_all(questions)
    return exam


def run() -> None:
    settings = get_settings()
    if settings.environment.lower() == "production":
        print("Refusing to seed in production.")
        return

    db = SessionLocal()
    try:
        existing = teacher_repo.get_by_email(db, DEV_TEACHER_EMAIL)
        if existing:
            print(f"Teacher '{DEV_TEACHER_EMAIL}' already exists. Nothing to do.")
            return
        teacher = Teacher(
            name="Ms Eman Zahy",
            email=DEV_TEACHER_EMAIL,
            password_hash=hash_password(DEV_TEACHER_PASSWORD),
            role="teacher",
        )
        db.add(teacher)
        db.flush()
        _sample_exam(db, teacher.id)
        db.commit()
        print("Seeded development teacher + sample exam.")
        print(f"  email:    {DEV_TEACHER_EMAIL}")
        print(f"  password: {DEV_TEACHER_PASSWORD}   (DEVELOPMENT ONLY)")
    finally:
        db.close()


if __name__ == "__main__":  # pragma: no cover
    run()
