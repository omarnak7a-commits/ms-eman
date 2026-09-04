"""One-time admin bootstrap for a fresh production database.

Run it against your real (Supabase/PostgreSQL) database from your machine
AFTER ``alembic upgrade head``. It is idempotent: it creates the teacher if
absent and resets the password to the value you supply via environment.

Unlike ``app.seed`` (development-only, hard-coded weak password), this command
is safe to use in production because the password is supplied explicitly and
must meet the minimum length.

Usage:
    ADMIN_EMAIL=ms.eman.zahy@example.com \
    ADMIN_PASSWORD='a-STRONG-password!' \
    ADMIN_NAME='Ms Eman Zahy' \
    DATABASE_URL=postgresql+psycopg2://... \
    python -m app.create_admin
"""
from __future__ import annotations

import os

from .core.security import hash_password
from .db.session import SessionLocal
from .models import Teacher
from .repositories import teacher_repo

MIN_PASSWORD_LEN = 8


def run() -> None:
    email = (os.environ.get("ADMIN_EMAIL") or "").strip()
    password = os.environ.get("ADMIN_PASSWORD") or ""
    name = (os.environ.get("ADMIN_NAME") or "Ms Eman Zahy").strip()

    if not email:
        raise SystemExit("ERROR: ADMIN_EMAIL is required.")
    if len(password) < MIN_PASSWORD_LEN:
        raise SystemExit(
            f"ERROR: ADMIN_PASSWORD must be at least {MIN_PASSWORD_LEN} chars."
        )

    db = SessionLocal()
    try:
        teacher = teacher_repo.get_by_email(db, email)
        created = teacher is None
        if teacher is None:
            teacher = Teacher(
                name=name,
                email=email,
                password_hash=hash_password(password),
                role="teacher",
            )
            db.add(teacher)
        else:
            teacher.name = name
            teacher.password_hash = hash_password(password)
        db.commit()
        action = "Created" if created else "Updated password for"
        print(f"{action} teacher '{email}'.")
        print("You can now log in at the deployed app.")
    finally:
        db.close()


if __name__ == "__main__":  # pragma: no cover
    run()
