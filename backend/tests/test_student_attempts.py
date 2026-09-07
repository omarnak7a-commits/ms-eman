"""End-to-end student attempt tests: start, autosave, grading, submit,
deadline, review, ranking and cross-attempt security."""
from __future__ import annotations

import datetime

from conftest import TestingSession
from sqlalchemy.orm import Session

from app.models import ExamAttempt


def _q(client, exam_id, qtype, headers):
    data = {
        "multiple_choice": {"type": "multiple_choice", "options": [
            {"id": "o1", "text": "goes", "order_index": 0, "is_correct": True},
            {"id": "o2", "text": "go", "order_index": 1, "is_correct": False},
        ]},
        "ordering": {"type": "ordering", "tokens": [
            {"id": "t1", "text": "Ahmed", "correct_position": 0},
            {"id": "t2", "text": "goes", "correct_position": 1},
            {"id": "t3", "text": "to", "correct_position": 2},
            {"id": "t4", "text": "school", "correct_position": 3},
        ]},
        "correct_brackets": {"type": "correct_brackets",
            "sentence": "She (go) to school every day.",
            "brackets": [{"id": "b1", "original_word": "go",
                          "accepted_answers": ["goes"], "case_sensitive": False}]},
    }[qtype]
    r = client.post(
        f"/api/exams/{exam_id}/questions",
        json={"type": qtype, "text": f"Q-{qtype}", "marks": 1, "data": data},
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


def make_published_exam(client, teacher) -> dict:
    exam = client.post(
        "/api/exams",
        json={"title": "Grammar", "duration_minutes": 30, "ranking_enabled": True,
              "result_visibility": True, "review_visibility": True},
        headers=teacher,
    ).json()
    eid = exam["id"]
    _q(client, eid, "multiple_choice", teacher)
    _q(client, eid, "ordering", teacher)
    _q(client, eid, "correct_brackets", teacher)
    assert client.post(f"/api/exams/{eid}/publish", headers=teacher).status_code == 200
    return exam


def correct_answers():
    return {
        "multiple_choice": {"type": "multiple_choice", "selected_option_id": "o1"},
        "ordering": {"type": "ordering", "token_ids": ["t1", "t2", "t3", "t4"]},
        "correct_brackets": {"type": "correct_brackets", "answer": "goes"},
    }


def start(client, slug, name="Sara"):
    r = client.post(f"/api/exams/{slug}/start", json={"student_name": name})
    assert r.status_code == 200, r.text
    return r.json()


def attempt_headers(data):
    return {"Authorization": f"Bearer {data['student_token']}"}


def test_public_info(client, teacher):
    exam = make_published_exam(client, teacher)
    info = client.get(f"/api/exams/{exam['slug']}/info")
    assert info.status_code == 200
    assert info.json()["question_count"] == 3


def test_cannot_start_unpublished(client, teacher):
    draft = client.post("/api/exams", json={"title": "Draft", "duration_minutes": 10},
                        headers=teacher).json()
    r = client.post(f"/api/exams/{draft['slug']}/start", json={"student_name": "S"})
    assert r.status_code == 409


def test_start_strips_correct_answers(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    assert data["attempt_id"]
    by_type = {q["type"]: q for q in data["questions"]}
    # MCQ: no is_correct leaked
    for opt in by_type["multiple_choice"]["data"]["options"]:
        assert "is_correct" not in opt
    # Ordering: no correct_position leaked
    for tok in by_type["ordering"]["data"]["tokens"]:
        assert "correct_position" not in tok
    # Brackets: no accepted answers leaked
    for brk in by_type["correct_brackets"]["data"]["brackets"]:
        assert "accepted_answers" not in brk


def test_autosave_returns_immediate_correctness(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Sara")
    aid = data["attempt_id"]
    h = attempt_headers(data)
    qmap = {q["type"]: q["id"] for q in data["questions"]}
    r = client.put(f"/api/attempts/{aid}/answers/{qmap['multiple_choice']}",
                   json={"answer_data": correct_answers()["multiple_choice"]}, headers=h)
    assert r.status_code == 200
    assert r.json()["is_correct"] is True
    # Strict one-shot lock: a second submission for the same question is rejected.
    r2 = client.put(f"/api/attempts/{aid}/answers/{qmap['multiple_choice']}",
                    json={"answer_data": {"type": "multiple_choice", "selected_option_id": "o2"}}, headers=h)
    assert r2.status_code == 409
    # The original graded answer is preserved after the rejected resubmit.
    resume = client.get(f"/api/attempts/{aid}/resume", headers=h).json()
    assert resume["can_resume"] is True
    ans = {a["question_id"]: a for a in resume["answers"]}
    assert ans[qmap["multiple_choice"]]["answer_data"]["selected_option_id"] == "o1"
    assert ans[qmap["multiple_choice"]]["is_correct"] is True


def test_full_correct_submission(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Sara")
    aid = data["attempt_id"]
    h = attempt_headers(data)
    qmap = {q["type"]: q["id"] for q in data["questions"]}
    ca = correct_answers()
    for qtype, qid in qmap.items():
        r = client.put(f"/api/attempts/{aid}/answers/{qid}",
                       json={"answer_data": ca[qtype]}, headers=h)
        assert r.status_code == 200, r.text
    sub = client.post(f"/api/attempts/{aid}/submit", headers=h)
    assert sub.status_code == 200
    res = client.get(f"/api/attempts/{aid}/result", headers=h).json()
    assert res["attempt"]["percentage"] == 100.0
    assert res["attempt"]["correct_count"] == 3
    assert res["attempt"]["score"] == 3
    assert res["attempt"]["max_score"] == 3
    assert res["attempt"]["rank"] == 1


def test_partial_scoring(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Omar")
    aid = data["attempt_id"]
    h = attempt_headers(data)
    qmap = {q["type"]: q["id"] for q in data["questions"]}
    ca = correct_answers()
    # only answer mcq correctly; ordering wrong, brackets wrong
    client.put(f"/api/attempts/{aid}/answers/{qmap['multiple_choice']}",
               json={"answer_data": ca["multiple_choice"]}, headers=h)
    wrong_order = {"type": "ordering", "token_ids": ["t4", "t3", "t2", "t1"]}
    client.put(f"/api/attempts/{aid}/answers/{qmap['ordering']}",
               json={"answer_data": wrong_order}, headers=h)
    wrong_bracket = {"type": "correct_brackets", "answer": "go"}
    client.put(f"/api/attempts/{aid}/answers/{qmap['correct_brackets']}",
               json={"answer_data": wrong_bracket}, headers=h)
    client.post(f"/api/attempts/{aid}/submit", headers=h)
    res = client.get(f"/api/attempts/{aid}/result", headers=h).json()
    assert res["attempt"]["score"] == 1
    assert res["attempt"]["percentage"] == round(1 / 3 * 100, 2)
    assert res["attempt"]["correct_count"] == 1
    assert res["attempt"]["incorrect_count"] == 2


def test_duplicate_submission_prevented(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    h = attempt_headers(data)
    assert client.post(f"/api/attempts/{data['attempt_id']}/submit", headers=h).status_code == 200
    assert client.post(f"/api/attempts/{data['attempt_id']}/submit", headers=h).status_code == 409


def test_resume_returns_locked_graded_answers(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Sara")
    aid = data["attempt_id"]
    h = attempt_headers(data)
    qmap = {q["type"]: q["id"] for q in data["questions"]}
    ca = correct_answers()
    # Submit one correct and one incorrect answer, leave one unanswered.
    client.put(f"/api/attempts/{aid}/answers/{qmap['multiple_choice']}",
               json={"answer_data": ca["multiple_choice"]}, headers=h)
    wrong_order = {"type": "ordering", "token_ids": ["t4", "t3", "t2", "t1"]}
    client.put(f"/api/attempts/{aid}/answers/{qmap['ordering']}",
               json={"answer_data": wrong_order}, headers=h)
    resume = client.get(f"/api/attempts/{aid}/resume", headers=h).json()
    assert resume["can_resume"] is True
    ans = {a["question_id"]: a for a in resume["answers"]}
    assert ans[qmap["multiple_choice"]]["is_correct"] is True
    assert ans[qmap["ordering"]]["is_correct"] is False
    # Only submitted questions appear; the brackets question is still unanswered.
    assert qmap["correct_brackets"] not in ans
    # Locked questions cannot be changed after a resume/reload.
    r = client.put(f"/api/attempts/{aid}/answers/{qmap['multiple_choice']}",
                   json={"answer_data": {"type": "multiple_choice", "selected_option_id": "o2"}}, headers=h)
    assert r.status_code == 409


def test_each_question_type_locks_after_submit(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Sara")
    aid = data["attempt_id"]
    h = attempt_headers(data)
    qmap = {q["type"]: q["id"] for q in data["questions"]}
    ca = correct_answers()
    wrong = {
        "multiple_choice": {"type": "multiple_choice", "selected_option_id": "o2"},
        "ordering": {"type": "ordering", "token_ids": ["t4", "t3", "t2", "t1"]},
        "correct_brackets": {"type": "correct_brackets", "answer": "go"},
    }
    # Double-click guard: submitting the same question again immediately is 409.
    for qtype, qid in qmap.items():
        r1 = client.put(f"/api/attempts/{aid}/answers/{qid}",
                        json={"answer_data": wrong[qtype]}, headers=h)
        assert r1.status_code == 200
        assert r1.json()["is_correct"] is False
        r2 = client.put(f"/api/attempts/{aid}/answers/{qid}",
                        json={"answer_data": ca[qtype]}, headers=h)
        assert r2.status_code == 409
    # Even re-sending an identical submitted answer is rejected (server is source of truth).
    for qtype, qid in qmap.items():
        r3 = client.put(f"/api/attempts/{aid}/answers/{qid}",
                        json={"answer_data": wrong[qtype]}, headers=h)
        assert r3.status_code == 409


def test_cannot_answer_after_submit(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    aid = data["attempt_id"]
    h = attempt_headers(data)
    qid = data["questions"][0]["id"]
    client.post(f"/api/attempts/{aid}/submit", headers=h)
    r = client.put(f"/api/attempts/{aid}/answers/{qid}",
                   json={"answer_data": {"type": "multiple_choice", "selected_option_id": "o1"}},
                   headers=h)
    assert r.status_code == 409


def test_invalid_mcq_option_rejected(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    aid = data["attempt_id"]
    h = attempt_headers(data)
    qid = next(q["id"] for q in data["questions"] if q["type"] == "multiple_choice")
    r = client.put(f"/api/attempts/{aid}/answers/{qid}",
                   json={"answer_data": {"type": "multiple_choice", "selected_option_id": "nope"}},
                   headers=h)
    assert r.status_code == 422


def test_result_requires_submission(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"])
    h = attempt_headers(data)
    assert client.get(f"/api/attempts/{data['attempt_id']}/result", headers=h).status_code == 409


def test_cross_attempt_access_denied(client, teacher):
    exam = make_published_exam(client, teacher)
    a = start(client, exam["slug"], "Sara")
    b = start(client, exam["slug"], "Ali")
    # submit both
    for d in (a, b):
        client.post(f"/api/attempts/{d['attempt_id']}/submit", headers=attempt_headers(d))
    # Ali tries to read Sara's result -> denied
    r = client.get(f"/api/attempts/{a['attempt_id']}/result", headers=attempt_headers(b))
    assert r.status_code == 403
    # Ali tries to answer Sara's question -> denied
    qid = a["questions"][0]["id"]
    r = client.put(f"/api/attempts/{a['attempt_id']}/answers/{qid}",
                   json={"answer_data": correct_answers()["multiple_choice"]},
                   headers=attempt_headers(b))
    assert r.status_code in (401, 403)


def test_review_only_when_enabled_and_after_submit(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Sara")
    h = attempt_headers(data)
    assert client.get(f"/api/attempts/{data['attempt_id']}/review", headers=h).status_code == 409
    client.post(f"/api/attempts/{data['attempt_id']}/submit", headers=h)
    review = client.get(f"/api/attempts/{data['attempt_id']}/review", headers=h)
    assert review.status_code == 200
    items = review.json()["items"]
    assert len(items) == 3
    for it in items:
        assert it["correct_answer"] is not None


def test_review_disabled_exam(client, teacher):
    exam = client.post("/api/exams",
                       json={"title": "NoReview", "duration_minutes": 10,
                             "review_visibility": False, "result_visibility": True,
                             "ranking_enabled": False},
                       headers=teacher).json()
    _q(client, exam["id"], "multiple_choice", teacher)
    client.post(f"/api/exams/{exam['id']}/publish", headers=teacher)
    data = start(client, exam["slug"], "Sara")
    h = attempt_headers(data)
    qid = data["questions"][0]["id"]
    client.put(f"/api/attempts/{data['attempt_id']}/answers/{qid}",
               json={"answer_data": correct_answers()["multiple_choice"]}, headers=h)
    client.post(f"/api/attempts/{data['attempt_id']}/submit", headers=h)
    assert client.get(f"/api/attempts/{data['attempt_id']}/review", headers=h).status_code == 403


def test_one_attempt_per_student_per_exam(client, teacher):
    exam = make_published_exam(client, teacher)
    start(client, exam["slug"], "Sara")
    # second start for same student rejected
    r = client.post(f"/api/exams/{exam['slug']}/start", json={"student_name": "Sara"})
    assert r.status_code == 409


def test_expired_attempt_autosubmits(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Zed")
    aid = data["attempt_id"]
    h = attempt_headers(data)
    # force deadline into the past while still active
    with TestingSession() as db:
        attempt = db.get(ExamAttempt, aid)
        attempt.deadline_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)
        attempt.status = "active"
        db.commit()
    # A fresh call reconciles and rejects further changes.
    r = client.post(f"/api/attempts/{aid}/submit", headers=h)
    assert r.status_code == 409  # already finalized as expired by reconcile
    res = client.get(f"/api/attempts/{aid}/result", headers=h)
    assert res.status_code == 200
    assert res.json()["attempt"]["status"] == "expired"


def test_student_ranking_assigns_unique_positions(client, teacher):
    exam = client.post("/api/exams",
                       json={"title": "Ranking", "duration_minutes": 30, "ranking_enabled": True,
                             "result_visibility": True, "review_visibility": True},
                       headers=teacher).json()
    _q(client, exam["id"], "multiple_choice", teacher)
    client.post(f"/api/exams/{exam['id']}/publish", headers=teacher)

    self_rank = {}
    entries = None
    for name in ("Sara", "Ali", "Noor"):
        d = start(client, exam["slug"], name)
        h = attempt_headers(d)
        qid = d["questions"][0]["id"]
        client.put(f"/api/attempts/{d['attempt_id']}/answers/{qid}",
                   json={"answer_data": correct_answers()["multiple_choice"]}, headers=h)
        client.post(f"/api/attempts/{d['attempt_id']}/submit", headers=h)
        ranking = client.get(f"/api/attempts/{d['attempt_id']}/ranking", headers=h).json()
        entries = ranking["entries"]
        mine = [e for e in entries if e["student_name"] == name]
        self_rank[name] = mine[0]["rank"]
    assert len(entries) == 3
    assert set(self_rank.values()) == {1, 2, 3}


def test_teacher_sees_results_and_detail(client, teacher):
    exam = make_published_exam(client, teacher)
    d = start(client, exam["slug"], "Mona")
    h = attempt_headers(d)
    client.post(f"/api/attempts/{d['attempt_id']}/submit", headers=h)
    res = client.get(f"/api/exams/{exam['id']}/results", headers=teacher)
    assert res.status_code == 200
    body = res.json()
    assert body["attempts"][0]["student_name"] == "Mona"
    assert body["attempts"][0]["percentage"] == 0.0
    # teacher opens individual attempt
    detail = client.get(f"/api/exams/{exam['id']}/results/{d['attempt_id']}", headers=teacher)
    assert detail.status_code == 200
    assert len(detail.json()["answers"]) == 3


def test_reopen_shared_link_conflicts_then_token_resumes_active_attempt(client, teacher):
    """M4: re-opening the shared exam link while an attempt is active must not
    create a second attempt — and the stored attempt token can resume the
    original one exactly where it was."""
    exam = make_published_exam(client, teacher)
    d = start(client, exam["slug"], "Reopen Sara")
    # The student (same name) hits Start again via the shared link.
    r = client.post(f"/api/exams/{exam['slug']}/start", json={"student_name": "Reopen Sara"})
    assert r.status_code == 409
    assert "active attempt" in r.json()["message"]

    # With the original attempt token the attempt resumes, questions intact.
    h = attempt_headers(d)
    resume = client.get(f"/api/attempts/{d['attempt_id']}/resume", headers=h)
    assert resume.status_code == 200
    body = resume.json()
    assert body["can_resume"] is True
    assert body["status"]["status"] == "active"
    assert len(body["questions"]) == 3
    # Nothing pre-submission is ever revealed by resume.
    assert body["answers"] == []


def test_expired_attempt_never_resumes(client, teacher):
    """M4: an attempt that crossed its server deadline is finalised and the
    resume endpoint must not let the student back in."""
    exam = make_published_exam(client, teacher)
    d = start(client, exam["slug"], "Late Sara")
    h = attempt_headers(d)
    with TestingSession() as db:
        attempt = db.get(ExamAttempt, d["attempt_id"])
        attempt.deadline_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)
        db.commit()

    resume = client.get(f"/api/attempts/{d['attempt_id']}/resume", headers=h)
    assert resume.status_code == 200
    body = resume.json()
    assert body["can_resume"] is False
    assert body["status"]["status"] == "expired"
    # No further answer can be saved.
    qid = d["questions"][0]["id"]
    r = client.put(f"/api/attempts/{d['attempt_id']}/answers/{qid}",
                   json={"answer_data": correct_answers()["multiple_choice"]}, headers=h)
    assert r.status_code == 409
