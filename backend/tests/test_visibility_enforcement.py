"""H1 + L8 regression tests: student-facing visibility gates are enforced by
the backend, never left to the frontend.

H1: results are only returned to the student when the exam's
``result_visibility`` flag is on; teacher result access is unaffected.
L8: the student ranking endpoint refuses exams with ``ranking_enabled=False``;
teacher ranking access is unaffected.
"""
from __future__ import annotations

from test_student_attempts import (
    _q,
    attempt_headers,
    correct_answers,
    start,
)


def _submit_single_mcq(client, exam, name: str) -> dict:
    data = start(client, exam["slug"], name)
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
    return data


def _make_exam(client, teacher, **over) -> dict:
    payload = {
        "title": "Visibility",
        "duration_minutes": 10,
        "ranking_enabled": False,
        "result_visibility": True,
        "review_visibility": True,
    }
    payload.update(over)
    exam = client.post("/api/exams", json=payload, headers=teacher).json()
    _q(client, exam["id"], "multiple_choice", teacher)
    assert client.post(f"/api/exams/{exam['id']}/publish", headers=teacher).status_code == 200
    return exam


# ---------------------------------------------------------------- H1: results
def test_student_result_allowed_when_visibility_enabled(client, teacher):
    exam = _make_exam(client, teacher, result_visibility=True)
    data = _submit_single_mcq(client, exam, "Happy Sara")
    r = client.get(f"/api/attempts/{data['attempt_id']}/result", headers=attempt_headers(data))
    assert r.status_code == 200
    assert r.json()["attempt"]["percentage"] == 100.0


def test_student_result_forbidden_when_visibility_disabled(client, teacher):
    exam = _make_exam(client, teacher, result_visibility=False)
    data = _submit_single_mcq(client, exam, "Hidden Sara")

    # Direct API access must also be refused — frontend-only hiding is not
    # an acceptable control.
    r = client.get(f"/api/attempts/{data['attempt_id']}/result", headers=attempt_headers(data))
    assert r.status_code == 403
    body = r.json()
    assert body["code"] == "forbidden"
    assert "disabled" in body["message"].lower()

    # Teacher result access stays intact for the same exam+attempt.
    res = client.get(f"/api/exams/{exam['id']}/results", headers=teacher)
    assert res.status_code == 200
    assert [a["student_name"] for a in res.json()["attempts"]] == ["Hidden Sara"]
    detail = client.get(
        f"/api/exams/{exam['id']}/results/{data['attempt_id']}", headers=teacher
    )
    assert detail.status_code == 200
    assert detail.json()["percentage"] == 100.0


def test_result_still_requires_submission_when_visibility_enabled(client, teacher):
    exam = _make_exam(client, teacher, result_visibility=True)
    data = start(client, exam["slug"], "Impatient Sara")
    r = client.get(f"/api/attempts/{data['attempt_id']}/result", headers=attempt_headers(data))
    assert r.status_code == 409


# ---------------------------------------------------------------- L8: ranking
def test_student_ranking_allowed_when_enabled(client, teacher):
    exam = _make_exam(client, teacher, ranking_enabled=True)
    data = _submit_single_mcq(client, exam, "Racer Sara")
    r = client.get(f"/api/attempts/{data['attempt_id']}/ranking", headers=attempt_headers(data))
    assert r.status_code == 200
    body = r.json()
    assert body["ranking_enabled"] is True
    assert len(body["entries"]) == 1


def test_student_ranking_denied_when_disabled(client, teacher):
    exam = _make_exam(client, teacher, ranking_enabled=False)
    data = _submit_single_mcq(client, exam, "No Board Sara")
    r = client.get(f"/api/attempts/{data['attempt_id']}/ranking", headers=attempt_headers(data))
    assert r.status_code == 403
    body = r.json()
    assert body["code"] == "forbidden"
    assert "disabled" in body["message"].lower()

    # Teacher ranking access unaffected by the student-facing gate.
    tr = client.get(f"/api/exams/{exam['id']}/ranking", headers=teacher)
    assert tr.status_code == 200
    assert tr.json()["ranking_enabled"] is False
