"""Teacher exam/question lifecycle + ownership tests."""
from __future__ import annotations

import pytest

from conftest import create_teacher, TestingSession


def make_exam_payload(**over):
    payload = {
        "title": "English Grammar Test",
        "description": "desc",
        "instructions": "Read carefully.",
        "duration_minutes": 30,
        "ranking_enabled": True,
        "result_visibility": True,
        "review_visibility": True,
    }
    payload.update(over)
    return payload


def mcq_data(correct_index=0):
    opts = [
        {"id": "o1", "text": "goes", "order_index": 0, "is_correct": False},
        {"id": "o2", "text": "go", "order_index": 1, "is_correct": False},
        {"id": "o3", "text": "going", "order_index": 2, "is_correct": False},
        {"id": "o4", "text": "gone", "order_index": 3, "is_correct": False},
    ]
    opts[correct_index]["is_correct"] = True
    return {"type": "multiple_choice", "options": opts}


def ordering_data():
    return {
        "type": "ordering",
        "tokens": [
            {"id": "t1", "text": "Ahmed", "correct_position": 0},
            {"id": "t2", "text": "goes", "correct_position": 1},
            {"id": "t3", "text": "to", "correct_position": 2},
            {"id": "t4", "text": "school", "correct_position": 3},
        ],
    }


def brackets_data():
    return {
        "type": "correct_brackets",
        "sentence": "She (go) to school every day.",
        "brackets": [
            {"id": "b1", "original_word": "go", "accepted_answers": ["goes"], "case_sensitive": False}
        ],
    }


def add_question(client, exam_id, qtype, headers):
    data = {"multiple_choice": mcq_data(), "ordering": ordering_data(), "correct_brackets": brackets_data()}[qtype]
    return client.post(
        f"/api/exams/{exam_id}/questions",
        json={"type": qtype, "text": "Question text", "marks": 1, "data": data},
        headers=headers,
    )


def create_full_exam(client, headers):
    r = client.post("/api/exams", json=make_exam_payload(), headers=headers)
    assert r.status_code == 201, r.text
    exam = r.json()
    add_question(client, exam["id"], "multiple_choice", headers)
    add_question(client, exam["id"], "ordering", headers)
    add_question(client, exam["id"], "correct_brackets", headers)
    return exam


def test_create_exam_draft(client, teacher):
    r = client.post("/api/exams", json=make_exam_payload(title="First"), headers=teacher)
    assert r.status_code == 201
    exam = r.json()
    assert exam["status"] == "draft"
    assert exam["question_count"] == 0
    assert exam["slug"]


def test_list_and_get_exam(client, teacher):
    create_full_exam(client, teacher)
    lst = client.get("/api/exams", headers=teacher)
    assert lst.status_code == 200
    assert len(lst.json()) == 1
    eid = lst.json()[0]["id"]
    one = client.get(f"/api/exams/{eid}", headers=teacher)
    assert one.json()["question_count"] == 3


def test_publish_requires_questions(client, teacher):
    r = client.post("/api/exams", json=make_exam_payload(), headers=teacher)
    eid = r.json()["id"]
    pub = client.post(f"/api/exams/{eid}/publish", headers=teacher)
    assert pub.status_code == 409


def test_question_validation_rejects_mcq_without_correct(client, teacher):
    r = client.post("/api/exams", json=make_exam_payload(), headers=teacher)
    eid = r.json()["id"]
    bad = mcq_data()
    for o in bad["options"]:
        o["is_correct"] = False
    res = client.post(
        f"/api/exams/{eid}/questions",
        json={"type": "multiple_choice", "text": "q", "marks": 1, "data": bad},
        headers=teacher,
    )
    assert res.status_code == 422


def test_teacher_questions_include_correct_answers(client, teacher):
    r = client.post("/api/exams", json=make_exam_payload(), headers=teacher)
    eid = r.json()["id"]
    add_question(client, eid, "multiple_choice", teacher)
    qs = client.get(f"/api/exams/{eid}/questions", headers=teacher).json()
    data = qs[0]["data"]
    assert sum(1 for o in data["options"] if o["is_correct"]) == 1


def test_duplicate_exam(client, teacher):
    exam = create_full_exam(client, teacher)
    d = client.post(f"/api/exams/{exam['id']}/duplicate", headers=teacher)
    assert d.status_code == 201
    copy = d.json()
    assert copy["title"].endswith("(Copy)")
    assert copy["status"] == "draft"
    qs = client.get(f"/api/exams/{copy['id']}/questions", headers=teacher)
    assert len(qs.json()) == 3


def test_close_then_edit_forbidden(client, teacher):
    exam = create_full_exam(client, teacher)
    client.post(f"/api/exams/{exam['id']}/publish", headers=teacher)
    client.post(f"/api/exams/{exam['id']}/close", headers=teacher)
    r = client.put(f"/api/exams/{exam['id']}", json={"title": "Changed"}, headers=teacher)
    assert r.status_code == 409


def test_delete_exam(client, teacher):
    exam = create_full_exam(client, teacher)
    assert client.delete(f"/api/exams/{exam['id']}", headers=teacher).status_code == 204
    assert client.get(f"/api/exams/{exam['id']}", headers=teacher).status_code == 404


def _login_as(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "StrongPass!123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_teacher_cannot_access_others_exam(client):
    with TestingSession() as db:
        create_teacher(db, email="a@test.com")
        create_teacher(db, email="b@test.com")
    ha = _login_as(client, "a@test.com")
    hb = _login_as(client, "b@test.com")
    exam = create_full_exam(client, ha)
    assert client.get(f"/api/exams/{exam['id']}", headers=hb).status_code == 403
    assert client.delete(f"/api/exams/{exam['id']}", headers=hb).status_code == 403


def test_results_and_students_empty(client, teacher):
    exam = create_full_exam(client, teacher)
    res = client.get(f"/api/exams/{exam['id']}/results", headers=teacher)
    assert res.status_code == 200
    assert res.json()["attempts"] == []
    assert client.get("/api/students", headers=teacher).json() == []


def test_dashboard_aggregates(client, teacher):
    create_full_exam(client, teacher)
    d = client.get("/api/dashboard", headers=teacher)
    assert d.status_code == 200
    body = d.json()
    assert body["total_exams"] == 1
    assert body["total_attempts"] == 0
    assert body["average_score"] == 0
    assert len(body["recent_exams"]) == 1
    assert body["recent_exams"][0]["question_count"] == 3
