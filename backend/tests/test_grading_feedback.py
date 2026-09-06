"""Regression tests: immediate correct-answer feedback after grading.

Contract pinned here:

* Submitting an INCORRECT answer returns the server's correct answer as part
  of the grading result (the same payload the post-submission review uses).
* Submitting a CORRECT answer returns ``correct_answer: None`` (nothing extra
  is needed — and nothing extra is sent).
* The correct answer is NEVER sent before submission: not in the start
  response, not in resume question payloads, and an empty attempt resumes
  with no answers at all.
"""
from __future__ import annotations

from test_student_attempts import attempt_headers, make_published_exam, start


def _qid_by_type(data, qtype):
    return next(q["id"] for q in data["questions"] if q["type"] == qtype)


def _put(client, aid, qid, answer, headers):
    return client.put(
        f"/api/attempts/{aid}/answers/{qid}",
        json={"answer_data": answer},
        headers=headers,
    )


# ── correct answer is part of the grading result (incorrect submissions) ────


def test_incorrect_mcq_returns_correct_option(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Feedback MCQ")
    headers = attempt_headers(data)
    qid = _qid_by_type(data, "multiple_choice")

    r = _put(
        client, data["attempt_id"], qid,
        {"type": "multiple_choice", "selected_option_id": "o2"},  # wrong (o1)
        headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["is_correct"] is False
    ca = body["correct_answer"]
    assert ca["type"] == "multiple_choice"
    assert ca["correct_option_ids"] == ["o1"]
    texts = {o["id"]: o["text"] for o in ca["options"]}
    assert texts["o1"] == "goes"  # displayable straight from the response


def test_correct_mcq_returns_no_correct_answer(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Feedback MCQ ok")
    headers = attempt_headers(data)
    qid = _qid_by_type(data, "multiple_choice")

    r = _put(
        client, data["attempt_id"], qid,
        {"type": "multiple_choice", "selected_option_id": "o1"},
        headers,
    )
    body = r.json()
    assert body["is_correct"] is True
    assert body["correct_answer"] is None


def test_incorrect_ordering_returns_full_correct_order(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Feedback Ordering")
    headers = attempt_headers(data)
    qid = _qid_by_type(data, "ordering")

    r = _put(
        client, data["attempt_id"], qid,
        {"type": "ordering", "token_ids": ["t4", "t3", "t2", "t1"]},  # reversed
        headers,
    )
    body = r.json()
    assert body["is_correct"] is False
    ca = body["correct_answer"]
    assert ca["type"] == "ordering"
    assert ca["correct_tokens"] == ["Ahmed", "goes", "to", "school"]
    assert ca["correct_token_ids"] == ["t1", "t2", "t3", "t4"]


def test_incorrect_single_bracket_returns_accepted_answer(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Feedback Brackets")
    headers = attempt_headers(data)
    qid = _qid_by_type(data, "correct_brackets")

    r = _put(
        client, data["attempt_id"], qid,
        {"type": "correct_brackets", "answer": "going"},  # wrong
        headers,
    )
    body = r.json()
    assert body["is_correct"] is False
    ca = body["correct_answer"]
    assert ca["type"] == "correct_brackets"
    (bracket_id, accepted), = ca["accepted_answers"].items()
    assert bracket_id == "b1"
    assert accepted == ["goes"]


def test_incorrect_multi_bracket_returns_answers_in_bracket_order(client, teacher):
    from conftest import TestingSession  # noqa: F401  (fixture sanity)

    exam = client.post(
        "/api/exams",
        json={"title": "Multi", "duration_minutes": 30, "ranking_enabled": False,
              "result_visibility": True, "review_visibility": True},
        headers=teacher,
    ).json()
    client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "correct_brackets", "text": "Fix the brackets.", "marks": 2,
              "data": {"type": "correct_brackets",
                       "sentence": "She (go) to the (school) every day.",
                       "brackets": [
                           {"id": "b1", "original_word": "go",
                            "accepted_answers": ["goes"], "case_sensitive": False},
                           {"id": "b2", "original_word": "school",
                            "accepted_answers": ["school", "schools"], "case_sensitive": False},
                       ]}},
        headers=teacher,
    )
    assert client.post(f"/api/exams/{exam['id']}/publish", headers=teacher).status_code == 200

    data = start(client, exam["slug"], "Feedback Multi")
    headers = attempt_headers(data)
    qid = _qid_by_type(data, "correct_brackets")
    r = _put(
        client, data["attempt_id"], qid,
        {"type": "correct_brackets", "answer": ["go", "school"]},  # 1st wrong
        headers,
    )
    body = r.json()
    assert body["is_correct"] is False
    ca = body["correct_answer"]
    # Keyed by bracket id — order in the sentence is reconstructable by the
    # client from its own bracket list (ids only, no grading done client-side).
    assert ca["accepted_answers"]["b1"] == ["goes"]
    assert ca["accepted_answers"]["b2"] == ["school", "schools"]


# ── nothing correct-answer-shaped exists before submission ───────────────────


def test_no_correct_answer_before_submission(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Feedback Pre")
    headers = attempt_headers(data)

    # Start response: sanitized questions, no grading payload anywhere.
    blob = str(data["questions"])
    for forbidden in ("is_correct", "correct_position", "accepted_answers", "correct_answer"):
        assert forbidden not in blob

    # Resume before any submission: no answers at all, questions still clean.
    resume = client.get(f"/api/attempts/{data['attempt_id']}/resume", headers=headers).json()
    assert resume["answers"] == []
    blob = str(resume["questions"])
    for forbidden in ("is_correct", "correct_position", "accepted_answers", "correct_answer"):
        assert forbidden not in blob


def test_resume_restores_feedback_only_for_graded_incorrect_answers(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Feedback Resume")
    headers = attempt_headers(data)
    qmap = {q["type"]: q["id"] for q in data["questions"]}

    # Wrong MCQ, right ordering.
    assert _put(client, data["attempt_id"], qmap["multiple_choice"],
                {"type": "multiple_choice", "selected_option_id": "o2"}, headers).json()["is_correct"] is False
    assert _put(client, data["attempt_id"], qmap["ordering"],
                {"type": "ordering", "token_ids": ["t1", "t2", "t3", "t4"]}, headers).json()["is_correct"] is True

    # Refresh mid-exam (exactly what the student UI does on reload).
    resume = client.get(f"/api/attempts/{data['attempt_id']}/resume", headers=headers).json()
    ans = {a["question_id"]: a for a in resume["answers"]}
    # Incorrect answer → its feedback (correct answer) survives the refresh.
    mcq = ans[qmap["multiple_choice"]]
    assert mcq["is_correct"] is False
    assert mcq["correct_answer"]["correct_option_ids"] == ["o1"]
    # Correct answer → no extra payload.
    assert ans[qmap["ordering"]]["correct_answer"] is None
    # Unsubmitted question → no answer entry at all.
    assert qmap["correct_brackets"] not in ans
    # Resume question payloads remain sanitized.
    blob = str(resume["questions"])
    for forbidden in ("is_correct", "correct_position", "accepted_answers"):
        assert forbidden not in blob
