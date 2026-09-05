"""Dynamic teacher/student ranking API tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from conftest import TestingSession, create_teacher
from app.models import ExamAttempt, Student


BASE_TIME = datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc)


def _exam(client, headers, title: str = "Ranking Exam") -> dict:
    response = client.post(
        "/api/exams",
        json={
            "title": title,
            "duration_minutes": 30,
            "ranking_enabled": True,
            "result_visibility": True,
            "review_visibility": False,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _attempt(
    exam_id: str,
    student_name: str,
    *,
    score: float,
    max_score: float = 50,
    submitted_at: datetime | None = BASE_TIME,
    status: str = "submitted",
    stored_percentage: float = 0,
) -> tuple[str, str]:
    """Insert authoritative stored result data, including legacy duplicates."""
    normalized = " ".join(student_name.strip().split()).lower()
    with TestingSession() as db:
        student = db.execute(
            select(Student).where(Student.normalized_name == normalized)
        ).scalar_one_or_none()
        if student is None:
            student = Student(name=student_name, normalized_name=normalized)
            db.add(student)
            db.flush()
        started_at = (submitted_at or BASE_TIME) - timedelta(minutes=10)
        attempt = ExamAttempt(
            exam_id=exam_id,
            student_id=student.id,
            status=status,
            started_at=started_at,
            deadline_at=started_at + timedelta(minutes=30),
            submitted_at=submitted_at,
            score=score,
            max_score=max_score,
            # Deliberately configurable: ranking percentages must derive from
            # the authoritative score/max score rather than trust this value.
            percentage=stored_percentage,
            time_used_seconds=600,
        )
        db.add(attempt)
        db.commit()
        return attempt.id, student.id


def _login_as(client, email: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongPass!123"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_specific_exam_ranking_orders_scores_and_calculates_summary(client, teacher):
    exam = _exam(client, teacher)
    _attempt(exam["id"], "Omar Hassan", score=44, submitted_at=BASE_TIME)
    _attempt(exam["id"], "Ahmed Ali", score=48, submitted_at=BASE_TIME + timedelta(minutes=2))
    _attempt(exam["id"], "Sara Mohamed", score=46, submitted_at=BASE_TIME + timedelta(minutes=1))

    response = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["scope"] == "exam"
    assert body["total_students"] == 3
    assert [entry["student_name"] for entry in body["entries"]] == [
        "Ahmed Ali",
        "Sara Mohamed",
        "Omar Hassan",
    ]
    assert [entry["rank"] for entry in body["entries"]] == [1, 2, 3]
    assert body["average_score"] == 46
    assert body["highest_score"] == 48
    assert body["lowest_score"] == 44
    assert body["average_percentage"] == 92
    assert body["highest_percentage"] == 96
    assert body["lowest_percentage"] == 88
    assert body["entries"][0]["total_marks"] == 50
    # Ranking payloads never contain questions, answers, or answer keys.
    assert "correct_answer" not in str(body)
    assert "answer_data" not in str(body)


def test_specific_exam_tie_breaks_by_earlier_submission(client, teacher):
    exam = _exam(client, teacher)
    _attempt(
        exam["id"],
        "Later Student",
        score=40,
        submitted_at=BASE_TIME + timedelta(minutes=10),
    )
    _attempt(
        exam["id"],
        "Earlier Student",
        score=40,
        submitted_at=BASE_TIME + timedelta(minutes=3),
    )

    first = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher).json()
    second = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher).json()
    assert [entry["student_name"] for entry in first["entries"]] == [
        "Earlier Student",
        "Later Student",
    ]
    assert second["entries"] == first["entries"]


def test_specific_ranking_uses_best_attempt_once_per_student(client, teacher):
    exam = _exam(client, teacher)
    first_id, _ = _attempt(exam["id"], "Repeat Student", score=31)
    best_id, _ = _attempt(
        exam["id"],
        "Repeat Student",
        score=47,
        submitted_at=BASE_TIME + timedelta(minutes=5),
    )
    _attempt(exam["id"], "Other Student", score=42)

    body = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher).json()
    names = [entry["student_name"] for entry in body["entries"]]
    assert names == ["Repeat Student", "Other Student"]
    assert body["total_students"] == 2
    assert body["entries"][0]["attempt_id"] == best_id
    assert all(entry["attempt_id"] != first_id for entry in body["entries"])


def test_ranking_excludes_active_and_unsubmitted_attempts(client, teacher):
    exam = _exam(client, teacher)
    _attempt(exam["id"], "Completed", score=45)
    _attempt(
        exam["id"],
        "Still Active",
        score=50,
        status="active",
        submitted_at=None,
    )
    _attempt(
        exam["id"],
        "Missing Submission",
        score=50,
        status="submitted",
        submitted_at=None,
    )
    # Expired means the server finalized and auto-submitted the attempt, so it
    # is a completed result in the existing product.
    _attempt(
        exam["id"],
        "Auto Submitted",
        score=40,
        status="expired",
        submitted_at=BASE_TIME + timedelta(minutes=30),
    )

    body = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher).json()
    assert body["total_students"] == 2
    assert {entry["student_name"] for entry in body["entries"]} == {
        "Completed",
        "Auto Submitted",
    }


def test_ranking_percentage_is_derived_from_server_score(client, teacher):
    exam = _exam(client, teacher)
    _attempt(
        exam["id"],
        "Calculated Percentage",
        score=7,
        max_score=8,
        stored_percentage=1,
    )

    body = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher).json()
    assert body["entries"][0]["percentage"] == 87.5
    assert body["average_percentage"] == 87.5


def test_teacher_cannot_access_another_teachers_exam_ranking(client):
    with TestingSession() as db:
        create_teacher(db, email="ranking-owner@test.com")
        create_teacher(db, email="ranking-other@test.com")
    owner = _login_as(client, "ranking-owner@test.com")
    other = _login_as(client, "ranking-other@test.com")
    exam = _exam(client, owner)
    _attempt(exam["id"], "Owner Student", score=50)

    forbidden = client.get(f"/api/exams/{exam['id']}/ranking", headers=other)
    assert forbidden.status_code == 403
    # Overall ranking is scoped by the authenticated teacher as well.
    assert client.get("/api/rankings", headers=other).json()["entries"] == []


def test_empty_exam_ranking(client, teacher):
    exam = _exam(client, teacher)
    response = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher)
    assert response.status_code == 200
    body = response.json()
    assert body["total_students"] == 0
    assert body["average_score"] == 0
    assert body["entries"] == []


def test_all_exams_ranking_averages_best_result_per_exam(client, teacher):
    first_exam = _exam(client, teacher, "Unit One")
    second_exam = _exam(client, teacher, "Unit Two")

    _attempt(first_exam["id"], "Ahmed Ali", score=80, max_score=100)
    _attempt(
        first_exam["id"],
        "Ahmed Ali",
        score=90,
        max_score=100,
        submitted_at=BASE_TIME + timedelta(minutes=2),
    )
    _attempt(second_exam["id"], "Ahmed Ali", score=100, max_score=100)
    _attempt(first_exam["id"], "Sara Mohamed", score=90, max_score=100)
    _attempt(second_exam["id"], "Sara Mohamed", score=80, max_score=100)
    _attempt(first_exam["id"], "Ali Hassan", score=70, max_score=100)

    body = client.get("/api/rankings", headers=teacher).json()
    assert body["scope"] == "all"
    assert body["total_students"] == 3
    assert [entry["student_name"] for entry in body["entries"]] == [
        "Ahmed Ali",
        "Sara Mohamed",
        "Ali Hassan",
    ]
    ahmed = body["entries"][0]
    assert ahmed["rank"] == 1
    assert ahmed["exams_completed"] == 2
    assert ahmed["average_percentage"] == 95
    assert ahmed["best_percentage"] == 100
    assert body["average_percentage"] == 83.33
    assert body["highest_percentage"] == 95
    assert body["lowest_percentage"] == 70
    assert body["average_score"] == 83.33
    assert body["highest_score"] == 95
    assert body["lowest_score"] == 70


def test_student_rank_is_unavailable_before_submit_and_has_total_after(client, teacher):
    exam = _exam(client, teacher, "Student Position")
    question = client.post(
        f"/api/exams/{exam['id']}/questions",
        json={
            "type": "multiple_choice",
            "text": "Choose the correct word.",
            "marks": 1,
            "data": {
                "type": "multiple_choice",
                "options": [
                    {"id": "right", "text": "goes", "order_index": 0, "is_correct": True},
                    {"id": "wrong", "text": "go", "order_index": 1, "is_correct": False},
                ],
            },
        },
        headers=teacher,
    )
    assert question.status_code == 201, question.text
    assert client.post(f"/api/exams/{exam['id']}/publish", headers=teacher).status_code == 200

    first = client.post(
        f"/api/exams/{exam['slug']}/start", json={"student_name": "First Student"}
    ).json()
    second = client.post(
        f"/api/exams/{exam['slug']}/start", json={"student_name": "Second Student"}
    ).json()
    first_headers = {"Authorization": f"Bearer {first['student_token']}"}
    second_headers = {"Authorization": f"Bearer {second['student_token']}"}

    before = client.get(
        f"/api/attempts/{first['attempt_id']}/ranking", headers=first_headers
    )
    assert before.status_code == 409
    assert client.get(
        f"/api/attempts/{first['attempt_id']}/result", headers=first_headers
    ).status_code == 409

    question_id = first["questions"][0]["id"]
    assert client.put(
        f"/api/attempts/{second['attempt_id']}/answers/{question_id}",
        json={"answer_data": {"type": "multiple_choice", "selected_option_id": "right"}},
        headers=second_headers,
    ).status_code == 200
    assert client.post(
        f"/api/attempts/{second['attempt_id']}/submit", headers=second_headers
    ).status_code == 200
    assert client.post(
        f"/api/attempts/{first['attempt_id']}/submit", headers=first_headers
    ).status_code == 200

    result = client.get(
        f"/api/attempts/{first['attempt_id']}/result", headers=first_headers
    ).json()["attempt"]
    assert result["rank"] == 2
    assert result["ranking_total"] == 2
    ranking = client.get(
        f"/api/attempts/{first['attempt_id']}/ranking", headers=first_headers
    )
    assert ranking.status_code == 200
    assert ranking.json()["total_students"] == 2

    # An attempt token is not a teacher token and cannot access teacher APIs.
    teacher_only = client.get(
        f"/api/exams/{exam['id']}/ranking", headers=first_headers
    )
    assert teacher_only.status_code == 401
