"""Regression tests: exam editing + attempt version snapshots.

The core invariant: an attempt always sees and is graded against the exam
version frozen at its start. Teacher edits (add / edit / reorder / delete /
marks / correct answers / duration) only affect students who start AFTER
them. Also covered: safe (soft) deletion of answered questions, closed-exam
mutation lock, cross-teacher authorisation, and the read-only preview.
"""
from __future__ import annotations

from conftest import TestingSession, auth_headers, create_teacher

from app.models import Question

from test_student_attempts import attempt_headers, make_published_exam, start

MCQ_DATA_V1 = {
    "type": "multiple_choice",
    "options": [
        {"id": "o1", "text": "Cairo", "order_index": 0, "is_correct": True},
        {"id": "o2", "text": "London", "order_index": 1, "is_correct": False},
    ],
}


def _qid_by_type(data, qtype):
    return next(q["id"] for q in data["questions"] if q["type"] == qtype)


# ── The core versioning scenario ──────────────────────────────────────────────


def test_in_progress_attempt_keeps_version_1_after_every_edit_kind(client, teacher):
    exam = make_published_exam(client, teacher)
    a = start(client, exam["slug"], "Student A")
    h = attempt_headers(a)
    v1_ids = [q["id"] for q in a["questions"]]
    assert len(v1_ids) == 3

    # Teacher edits the live exam in every way at once:
    mcq_id = _qid_by_type(a, "multiple_choice")
    brk_id = _qid_by_type(a, "correct_brackets")
    ord_id = _qid_by_type(a, "ordering")

    # 1) add two questions
    for i in range(2):
        r = client.post(
            f"/api/exams/{exam['id']}/questions",
            json={"type": "multiple_choice", "text": f"Extra {i}", "marks": 1,
                  "data": {"type": "multiple_choice", "options": [
                      {"id": "x1", "text": "a", "order_index": 0, "is_correct": True},
                      {"id": "x2", "text": "b", "order_index": 1, "is_correct": False}]}},
            headers=teacher,
        )
        assert r.status_code == 201, r.text
    # 2) change the MCQ correct answer and marks
    r = client.put(
        f"/api/questions/{mcq_id}",
        json={"marks": 5, "data": {
            "type": "multiple_choice",
            "options": [
                {"id": "o1", "text": "Cairo", "order_index": 0, "is_correct": False},
                {"id": "o2", "text": "London", "order_index": 1, "is_correct": True},
            ]}},
        headers=teacher,
    )
    assert r.status_code == 200, r.text
    # 3) delete the brackets question (unanswered → hard delete is safe)
    assert client.delete(f"/api/questions/{brk_id}", headers=teacher).status_code == 204
    # 4) reorder what remains
    remaining = [q["id"] for q in client.get(
        f"/api/exams/{exam['id']}/questions", headers=teacher).json()]
    assert client.put(
        f"/api/exams/{exam['id']}/questions/reorder",
        json={"ordered_ids": list(reversed(remaining))}, headers=teacher,
    ).status_code == 200
    # 5) change exam-level settings (title + duration)
    assert client.put(
        f"/api/exams/{exam['id']}",
        json={"title": "Renamed", "duration_minutes": 60}, headers=teacher,
    ).status_code == 200

    # Student A (refresh) still sees EXACTLY version 1: same 3 questions,
    # same order — including the deleted brackets question.
    resume = client.get(f"/api/attempts/{a['attempt_id']}/resume", headers=h).json()
    assert resume["can_resume"] is True
    assert [q["id"] for q in resume["questions"]] == v1_ids
    # MCQ still has v1 marks and v2's correct answer is NOT visible anyway.
    mcq = next(q for q in resume["questions"] if q["id"] == mcq_id)
    assert mcq["marks"] == 1

    # Student B sees version 2: 4 live questions (3 − deleted + 2 added),
    # in the new order.
    b = start(client, exam["slug"], "Student B")
    assert len(b["questions"]) == 4
    assert brk_id not in [q["id"] for q in b["questions"]]


def test_grading_uses_frozen_correct_answers_and_marks(client, teacher):
    exam = make_published_exam(client, teacher)
    a = start(client, exam["slug"], "Student A")
    h = attempt_headers(a)
    mcq_id = _qid_by_type(a, "multiple_choice")
    brk_id = _qid_by_type(a, "correct_brackets")

    # Teacher flips the MCQ correct answer AFTER A started.
    assert client.put(
        f"/api/questions/{mcq_id}",
        json={"marks": 9, "data": {
            "type": "multiple_choice",
            "options": [
                {"id": "o1", "text": "Cairo", "order_index": 0, "is_correct": False},
                {"id": "o2", "text": "London", "order_index": 1, "is_correct": True},
            ]}},
        headers=teacher,
    ).status_code == 200

    # A answers with VERSION 1's correct option → must grade CORRECT.
    r = client.put(
        f"/api/attempts/{a['attempt_id']}/answers/{mcq_id}",
        json={"answer_data": {"type": "multiple_choice", "selected_option_id": "o1"}},
        headers=h,
    ).json()
    assert r["is_correct"] is True

    # A gets the brackets wrong → revealed correct answer is V1's ("goes"),
    # even though the teacher also changed the accepted answers meanwhile.
    assert client.put(
        f"/api/questions/{brk_id}",
        json={"data": {"type": "correct_brackets",
                       "sentence": "She (go) to school every day.",
                       "brackets": [{"id": "b1", "original_word": "go",
                                     "accepted_answers": ["goes", "does go"],
                                     "case_sensitive": False}]}},
        headers=teacher,
    ).status_code == 200
    r = client.put(
        f"/api/attempts/{a['attempt_id']}/answers/{brk_id}",
        json={"answer_data": {"type": "correct_brackets", "answer": "went"}},
        headers=h,
    ).json()
    assert r["is_correct"] is False
    assert r["correct_answer"]["accepted_answers"] == {"b1": ["goes"]}  # V1, not V2

    # Final submit → totals from VERSION 1 (marks 1+2+1, MCQ scored at 1).
    assert client.post(f"/api/attempts/{a['attempt_id']}/submit", headers=h).status_code == 200
    res = client.get(f"/api/attempts/{a['attempt_id']}/result", headers=h).json()["attempt"]
    assert res["max_score"] == 3.0        # v1 marks (1 + 1 + 1), not 9 + 1 + 1
    assert res["score"] == 1.0            # MCQ correct at v1 marks only
    assert res["correct_count"] == 1 and res["incorrect_count"] == 1


def test_deleting_answered_question_is_soft_and_keeps_history(client, teacher):
    exam = make_published_exam(client, teacher)
    a = start(client, exam["slug"], "Student A")
    h = attempt_headers(a)
    mcq_id = _qid_by_type(a, "multiple_choice")

    # A answers (locks) the MCQ, then the teacher deletes it.
    assert client.put(
        f"/api/attempts/{a['attempt_id']}/answers/{mcq_id}",
        json={"answer_data": {"type": "multiple_choice", "selected_option_id": "o1"}},
        headers=h,
    ).json()["is_correct"] is True
    assert client.delete(f"/api/questions/{mcq_id}", headers=teacher).status_code == 204

    # Row preserved (soft-deleted) — answers must not cascade away.
    with TestingSession() as db:
        q = db.get(Question, mcq_id)
        assert q is not None and q.hidden is True

    # A keeps the question in their frozen version, answer + grade intact.
    resume = client.get(f"/api/attempts/{a['attempt_id']}/resume", headers=h).json()
    assert len(resume["questions"]) == 3
    ans = {x["question_id"]: x for x in resume["answers"]}
    assert ans[mcq_id]["is_correct"] is True

    # New students never see it.
    b = start(client, exam["slug"], "Student B")
    assert mcq_id not in [q["id"] for q in b["questions"]]
    assert len(b["questions"]) == 2

    # Grading A's final submission still works off the snapshot.
    assert client.post(f"/api/attempts/{a['attempt_id']}/submit", headers=h).status_code == 200
    res = client.get(f"/api/attempts/{a['attempt_id']}/result", headers=h).json()["attempt"]
    assert res["score"] == 1.0 and res["max_score"] == 3.0


def test_closed_exam_rejects_all_mutations(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Locked Out")
    qid = _qid_by_type(data, "multiple_choice")
    assert client.post(f"/api/exams/{exam['id']}/close", headers=teacher).status_code == 200

    assert client.put(f"/api/exams/{exam['id']}", json={"title": "X"}, headers=teacher).status_code == 409
    assert client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "multiple_choice", "text": "Q", "marks": 1,
              "data": {"type": "multiple_choice", "options": [
                  {"id": "a", "text": "a", "order_index": 0, "is_correct": True},
                  {"id": "b", "text": "b", "order_index": 1, "is_correct": False}]}},
        headers=teacher,
    ).status_code == 409
    assert client.put(f"/api/questions/{qid}", json={"text": "X"}, headers=teacher).status_code == 409
    assert client.delete(f"/api/questions/{qid}", headers=teacher).status_code == 409
    assert client.put(
        f"/api/exams/{exam['id']}/questions/reorder",
        json={"ordered_ids": [qid]}, headers=teacher,
    ).status_code == 409


def test_teacher_cannot_mutate_another_teachers_exam(client, teacher):
    exam = make_published_exam(client, teacher)
    data = start(client, exam["slug"], "Owner's Student")
    qid = _qid_by_type(data, "multiple_choice")

    with TestingSession() as db:
        create_teacher(db, email="intruder@test.com", password="StrongPass!123")
    other = auth_headers(client, {"email": "intruder@test.com", "password": "StrongPass!123"})

    assert client.put(f"/api/exams/{exam['id']}", json={"title": "Hijack"}, headers=other).status_code == 403
    assert client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "multiple_choice", "text": "Q", "marks": 1,
              "data": {"type": "multiple_choice", "options": [
                  {"id": "a", "text": "a", "order_index": 0, "is_correct": True},
                  {"id": "b", "text": "b", "order_index": 1, "is_correct": False}]}},
        headers=other,
    ).status_code == 403
    assert client.put(f"/api/questions/{qid}", json={"text": "Hijack"}, headers=other).status_code == 403
    assert client.delete(f"/api/questions/{qid}", headers=other).status_code == 403
    assert client.put(
        f"/api/exams/{exam['id']}/questions/reorder",
        json={"ordered_ids": [qid]}, headers=other,
    ).status_code == 403
    assert client.get(f"/api/exams/{exam['id']}/preview", headers=other).status_code == 403
    # And the exam is untouched.
    assert client.get(f"/api/exams/{exam['id']}", headers=teacher).json()["title"] == "Grammar"


def test_preview_is_sanitized_and_creates_no_attempt(client, teacher):
    exam = make_published_exam(client, teacher)

    r1 = client.get(f"/api/exams/{exam['id']}/preview", headers=teacher).json()
    assert len(r1["questions"]) == 3
    blob = str(r1["questions"])
    for forbidden in ("is_correct", "correct_position", "accepted_answers"):
        assert forbidden not in blob
    # Deterministic (no shuffle) so the preview is stable…
    r2 = client.get(f"/api/exams/{exam['id']}/preview", headers=teacher).json()
    assert r1["questions"] == r2["questions"]
    # …and read-only: no attempt was created.
    assert client.get(f"/api/exams/{exam['id']}", headers=teacher).json()["attempt_count"] == 0


def test_legacy_attempt_without_snapshot_falls_back_to_live_questions(client, teacher):
    exam = make_published_exam(client, teacher)
    a = start(client, exam["slug"], "Legacy Student")
    h = attempt_headers(a)

    # Simulate a pre-versioning row: snapshot cleared.
    from app.models import ExamAttempt

    with TestingSession() as db:
        att = db.get(ExamAttempt, a["attempt_id"])
        att.questions_snapshot = None
        db.commit()

    # Everything still works (live questions, the pre-versioning behaviour).
    resume = client.get(f"/api/attempts/{a['attempt_id']}/resume", headers=h).json()
    assert len(resume["questions"]) == 3
    mcq_id = _qid_by_type(a, "multiple_choice")
    assert client.put(
        f"/api/attempts/{a['attempt_id']}/answers/{mcq_id}",
        json={"answer_data": {"type": "multiple_choice", "selected_option_id": "o1"}},
        headers=h,
    ).json()["is_correct"] is True
