"""Pytest fixtures. Runs the app against an in-memory SQLite DB so the whole
suite is fast and reproducible; the same code runs on PostgreSQL in production.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import security  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, Teacher  # noqa: E402
from app.repositories import teacher_repo  # noqa: E402

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, expire_on_commit=False
)


def _override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture(autouse=True)
def _clean_db():
    Base.metadata.create_all(engine)
    with TestingSession() as db:
        # Truncate in FK-safe reverse order.
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def create_teacher(db, email: str = "teacher@test.com", password: str = "StrongPass!123") -> Teacher:
    teacher = Teacher(
        name="Ms Eman Zahy",
        email=email,
        password_hash=security.hash_password(password),
        role="teacher",
    )
    db.add(teacher)
    db.commit()
    return teacher


@pytest.fixture
def teacher_login():
    """Creates a teacher and returns their login payload."""
    email = "ms.eman.zahy@test.com"
    password = "StrongPass!123"
    with TestingSession() as db:
        create_teacher(db, email=email, password=password)
    return {"email": email, "password": password}


def auth_headers(client, creds) -> dict:
    r = client.post("/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def teacher(client, teacher_login):
    return auth_headers(client, teacher_login)
