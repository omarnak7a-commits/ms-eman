"""M2/M3 regression tests for the teacher → students surface.

M2: a teacher's student list and ``GET /students/{id}`` must only expose
students who attempted one of THAT teacher's exams — never another teacher's
students (shared global Student table). Student rows are never deleted.

M3: ``expired`` attempts (deadline auto-submission) count as completed in the
per-student statistics exactly like ``submitted`` ones; ``active`` attempts
keep their meaning (not completed).
"""
from __future__ import annotations

import datetime

from conftest import TestingSession, create_teacher
from test_teacher_exams import make_exam_payload
from test_student_attempts import (
    attempt_headers,
    correct_answers,
    start,
)

from app.models import ExamAttempt, Student


def _login_as(client, email: str) -> dict:
    r = client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongPass!123"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _published_exam_with_question(client, headers, title: str, **over) -> dict:
    exam = client.post(
        "/api/exams",
        json=make_exam_payload(title=title, **over),
        headers=headers,
    ).json()
    # One MCQ so the exam is publishable and solvable.
    r = client.post(
        f"/api/exams/{exam['id']}/questions",
        json={
            "type": "multiple_choice",
            "text": "Pick goes",
            "marks": 1,
            "data": {
                "type": "multiple_choice",
                "options": [
                    {"id": "o1", "text": "goes", "order_index": 0, "is_correct": True},
                    {"id": "o2", "text": "go", "order_index": 1, "is_correct": False},
                ],
            },
        },
        headers=headers,
    )
    assert r.status_code == 201, r.text
    assert client.post(f"/api/exams/{exam['id']}/publish", headers=headers).status_code == 200
    return exam


def _submit_everything(client, data: dict) -> None:
    h = attempt_headers(data)
    qid = data["questions"][0]["id"]
    assert (
        client.put(
            f"/api/attempts/{data['attempt_id']}/answers/{qid}",
            json={"answer_data": correct_answers()["multiple_choice"]},
            headers=h,
        ).status_code
        == 200
    )
    assert client.post(f"/api/attempts/{data['attempt_id']}/submit", headers=h).status_code == 200


def test_teacher_only_sees_students_with_attempts_in_their_exams(client, teacher):
    # Teacher A owns exam A1; teacher B owns exam B1.
    teacher_a = _login_as(client, "a@test.com") if teacher is None else teacher
    # teacher fixture is already "Ms Eman" — create B explicitly.
    with TestingSession() as db:
        create_teacher(db, email="other.teacher@test.com")
    teacher_b = _login_as(client, "other.teacher@test.com")

    exam_a = _published_exam_with_question(client, teacher_a, "Exam A", duration_minutes=30)
    exam_b = _published_exam_with_question(client, teacher_b, "Exam B", duration_minutes=30)

    # "Shared" attempts A's exam AND B's exam (legitimate shared student).
    d_shared_a = start(client, exam_a["slug"], "Shared Student")
    _submit_everything(client, d_shared_a)
    d_shared_b = start(client, exam_b["slug"], "Shared Student")
    _submit_everything(client, d_shared_b)
    # "Only B" attempts only B's exam.
    d_only_b = start(client, exam_b["slug"], "Only B Student")
    _submit_everything(client, d_only_b)

    shared_id = d_shared_a["attempt_id"]  # not the student id; fetch from list
    a_list = client.get("/api/students", headers=teacher_a).json()
    b_list = client.get("/api/students", headers=teacher_b).json()
    a_names = {s["name"] for s in a_list}
    b_names = {s["name"] for s in b_list}
    assert a_names == {"Shared Student"}
    assert b_names == {"Shared Student", "Only B Student"}

    shared_student_id = next(s["id"] for s in a_list if s["name"] == "Shared Student")
    only_b_id = next(s["id"] for s in b_list if s["name"] == "Only B Student")

    # GET /students/{id}: in-scope students resolve, out-of-scope are 404.
    assert client.get(f"/api/students/{shared_student_id}", headers=teacher_a).status_code == 200
    assert client.get(f"/api/students/{shared_student_id}", headers=teacher_b).status_code == 200
    assert client.get(f"/api/students/{only_b_id}", headers=teacher_a).status_code == 404
    assert client.get(f"/api/students/{only_b_id}", headers=teacher_b).status_code == 200
    assert client.get("/api/students/nope", headers=teacher_a).status_code == 404


def test_student_rows_from_other_teacher_never_leak(client, teacher):
    """A student created only by another teacher's exam must not show up."""
    with TestingSession() as db:
        create_teacher(db, email="leaky.teacher@test.com")
    teacher_b = _login_as(client, "leaky.teacher@test.com")
    exam_b = _published_exam_with_question(client, teacher_b, "Exam B2")
    d = start(client, exam_b["slug"], "Only On B")
    _submit_everything(client, d)

    with TestingSession() as db:
        sid = db.query(Student.id).filter(Student.name == "Only On B").scalar()
    assert sid

    assert client.get("/api/students", headers=teacher).json() == []
    assert client.get(f"/api/students/{sid}", headers=teacher).status_code == 404


def test_student_with_only_active_attempt_is_visible_but_not_completed(client, teacher):
    exam = _published_exam_with_question(client, teacher, "Active Only Exam")
    start(client, exam["slug"], "In Progress Kid")
    rows = client.get("/api/students", headers=teacher).json()
    assert [s["name"] for s in rows] == ["In Progress Kid"]
    row = rows[0]
    assert row["attempts_count"] == 0
    assert row["exam_count"] == 0


def test_expired_attempts_count_as_completed_in_student_stats(client, teacher):
    exam = _published_exam_with_question(client, teacher, "Stats Exam")
    submitted = start(client, exam["slug"], "Finished Sara")
    _submit_everything(client, submitted)

    expired = start(client, exam["slug"], "Ran Out Zed")
    with TestingSession() as db:
        attempt = db.get(ExamAttempt, expired["attempt_id"])
        attempt.deadline_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)
        attempt.status = "active"
        db.commit()
    # reconcile on read marks it expired
    r = client.get(f"/api/attempts/{expired['attempt_id']}/result", headers=attempt_headers(expired))
    assert r.status_code == 200
    assert r.json()["attempt"]["status"] == "expired"

    rows = {s["name"]: s for s in client.get("/api/students", headers=teacher).json()}
    assert set(rows) == {"Finished Sara", "Ran Out Zed"}
    assert rows["Finished Sara"]["attempts_count"] == 1
    assert rows["Finished Sara"]["exam_count"] == 1
    assert rows["Finished Sara"]["average_percentage"] == 100.0
    assert rows["Ran Out Zed"]["attempts_count"] == 1
    assert rows["Ran Out Zed"]["exam_count"] == 1
    assert rows["Ran Out Zed"]["last_exam_title"] == "Stats Exam"
    assert rows["Ran Out Zed"]["last_exam_at"] is not None
