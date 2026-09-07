"""Tests for multiple valid correct orders, first-word indicator,
validation, grading, feedback, snapshots and backward compatibility.
"""
from __future__ import annotations

import pytest
from conftest import TestingSession
from app.models import Question
from app.services.grading_service import grade_question, grade_ordering
from app.services.question_service import validate_data, student_payload, correct_answer_payload
from test_student_attempts import attempt_headers, start


def _create_exam_with_multi_ordering(client, teacher):
    exam = client.post(
        "/api/exams",
        json={
            "title": "Ordering Exam",
            "duration_minutes": 30,
            "ranking_enabled": True,
            "result_visibility": True,
            "review_visibility": True,
        },
        headers=teacher,
    ).json()

    # Question with 5 tokens and 3 valid orders:
    # t1: I, t2: went, t3: to, t4: school, t5: yesterday
    # Valid 1: I went to school yesterday (t1, t2, t3, t4, t5)
    # Valid 2: Yesterday I went to school (t5, t1, t2, t3, t4)
    # Valid 3: I went yesterday to school (t1, t2, t5, t3, t4)
    # First word: I (t1)
    q_data = {
        "type": "ordering",
        "tokens": [
            {"id": "t1", "text": "I"},
            {"id": "t2", "text": "went"},
            {"id": "t3", "text": "to"},
            {"id": "t4", "text": "school"},
            {"id": "t5", "text": "yesterday"},
        ],
        "valid_orders": [
            ["t1", "t2", "t3", "t4", "t5"],
            ["t5", "t1", "t2", "t3", "t4"],
            ["t1", "t2", "t5", "t3", "t4"],
        ],
        "first_word": "I",
        "first_word_id": "t1",
    }
    q = client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "ordering", "text": "Arrange the words.", "marks": 2, "data": q_data},
        headers=teacher,
    ).json()

    assert client.post(f"/api/exams/{exam['id']}/publish", headers=teacher).status_code == 200
    return exam, q


def _put_answer(client, aid, qid, token_ids, headers):
    return client.put(
        f"/api/attempts/{aid}/answers/{qid}",
        json={"answer_data": {"type": "ordering", "token_ids": token_ids}},
        headers=headers,
    )


# ─── 1. Existing single-order question still works ───────────────────────────

def test_existing_single_order_still_works(client, teacher):
    exam = client.post(
        "/api/exams",
        json={"title": "Single Order", "duration_minutes": 20},
        headers=teacher,
    ).json()
    q_data = {
        "type": "ordering",
        "tokens": [
            {"id": "t1", "text": "Ahmed", "correct_position": 0},
            {"id": "t2", "text": "goes", "correct_position": 1},
            {"id": "t3", "text": "home", "correct_position": 2},
        ],
    }
    q = client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "ordering", "text": "Arrange", "marks": 2, "data": q_data},
        headers=teacher,
    ).json()
    client.post(f"/api/exams/{exam['id']}/publish", headers=teacher)

    data = start(client, exam["slug"], "Single Student")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    r = _put_answer(client, aid, q["id"], ["t1", "t2", "t3"], h)
    assert r.status_code == 200
    assert r.json()["is_correct"] is True


# ─── 2. Old-format Ordering question grades correctly ────────────────────────

def test_old_format_ordering_grades_correctly():
    legacy_question = Question(
        exam_id="eid",
        type="ordering",
        text="Arrange",
        marks=3,
        data={
            "type": "ordering",
            "tokens": [
                {"id": "t1", "text": "I", "correct_position": 0},
                {"id": "t2", "text": "went", "correct_position": 1},
                {"id": "t3", "text": "home", "correct_position": 2},
            ],
        },
    )
    outcome_correct = grade_question(
        legacy_question, {"type": "ordering", "token_ids": ["t1", "t2", "t3"]}
    )
    assert outcome_correct.is_correct is True
    assert outcome_correct.awarded_marks == 3.0

    outcome_incorrect = grade_question(
        legacy_question, {"type": "ordering", "token_ids": ["t3", "t2", "t1"]}
    )
    assert outcome_incorrect.is_correct is False
    assert outcome_incorrect.awarded_marks == 0.0


# ─── 3, 4, 5, 6. Matching valid orders #1, #2, #3, and none ──────────────────

def test_matching_valid_order_1_is_correct(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Student 1")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    # Valid Order 1: t1 -> t2 -> t3 -> t4 -> t5
    r = _put_answer(client, aid, q["id"], ["t1", "t2", "t3", "t4", "t5"], h)
    assert r.status_code == 200
    assert r.json()["is_correct"] is True


def test_matching_valid_order_2_is_correct(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Student 2")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    # Valid Order 2: t5 -> t1 -> t2 -> t3 -> t4
    r = _put_answer(client, aid, q["id"], ["t5", "t1", "t2", "t3", "t4"], h)
    assert r.status_code == 200
    assert r.json()["is_correct"] is True


def test_matching_valid_order_3_is_correct(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Student 3")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    # Valid Order 3: t1 -> t2 -> t5 -> t3 -> t4
    r = _put_answer(client, aid, q["id"], ["t1", "t2", "t5", "t3", "t4"], h)
    assert r.status_code == 200
    assert r.json()["is_correct"] is True


def test_matching_no_valid_order_is_incorrect(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Student Wrong")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    # Wrong order: t1 -> t3 -> t2 -> t4 -> t5
    r = _put_answer(client, aid, q["id"], ["t1", "t3", "t2", "t4", "t5"], h)
    assert r.status_code == 200
    assert r.json()["is_correct"] is False
    assert r.json()["correct_answer"] is not None


# ─── 7, 8, 9, 10. Student submission rejection rules ─────────────────────────

def test_partial_ordering_is_rejected(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Partial")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    r = _put_answer(client, aid, q["id"], ["t1", "t2"], h)
    assert r.status_code == 422


def test_duplicate_submitted_item_is_rejected(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Dup")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    r = _put_answer(client, aid, q["id"], ["t1", "t1", "t2", "t3", "t4"], h)
    assert r.status_code == 422


def test_missing_submitted_item_is_rejected(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Missing")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    r = _put_answer(client, aid, q["id"], ["t1", "t2", "t3", "t4"], h)
    assert r.status_code == 422


def test_extra_submitted_item_is_rejected(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Extra")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    r = _put_answer(client, aid, q["id"], ["t1", "t2", "t3", "t4", "t5", "t_unknown"], h)
    assert r.status_code == 422


# ─── 11, 12, 13. Teacher cannot save invalid valid_orders ───────────────────

def test_teacher_cannot_save_valid_order_with_missing_words(client, teacher):
    exam = client.post("/api/exams", json={"title": "Test"}, headers=teacher).json()
    bad_data = {
        "type": "ordering",
        "tokens": [{"id": "t1", "text": "A"}, {"id": "t2", "text": "B"}, {"id": "t3", "text": "C"}],
        "valid_orders": [["t1", "t2"]],  # missing t3
    }
    r = client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "ordering", "text": "Q", "marks": 1, "data": bad_data},
        headers=teacher,
    )
    assert r.status_code == 422


def test_teacher_cannot_save_duplicate_words(client, teacher):
    exam = client.post("/api/exams", json={"title": "Test"}, headers=teacher).json()
    bad_data = {
        "type": "ordering",
        "tokens": [{"id": "t1", "text": "A"}, {"id": "t2", "text": "B"}, {"id": "t3", "text": "C"}],
        "valid_orders": [["t1", "t1", "t2"]],  # duplicate t1
    }
    r = client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "ordering", "text": "Q", "marks": 1, "data": bad_data},
        headers=teacher,
    )
    assert r.status_code == 422


def test_teacher_cannot_save_empty_valid_order(client, teacher):
    exam = client.post("/api/exams", json={"title": "Test"}, headers=teacher).json()
    bad_data = {
        "type": "ordering",
        "tokens": [{"id": "t1", "text": "A"}, {"id": "t2", "text": "B"}],
        "valid_orders": [],  # empty list
    }
    r = client.post(
        f"/api/exams/{exam['id']}/questions",
        json={"type": "ordering", "text": "Q", "marks": 1, "data": bad_data},
        headers=teacher,
    )
    assert r.status_code == 422


# ─── 14, 15. First word stored & does not affect grading ─────────────────────

def test_first_word_is_stored_correctly(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    saved_qs = client.get(f"/api/exams/{exam['id']}/questions", headers=teacher).json()
    saved_q = next(item for item in saved_qs if item["id"] == q["id"])
    assert saved_q["data"]["first_word"] == "I"
    assert saved_q["data"]["first_word_id"] == "t1"
    assert len(saved_q["data"]["valid_orders"]) == 3


def test_first_word_does_not_independently_affect_grading(client, teacher):
    # First word is "I" (t1), but valid order 2 starts with "Yesterday" (t5).
    # Student submitting Valid Order 2 (starts with Yesterday) must be marked CORRECT.
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "First Word Test")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    r = _put_answer(client, aid, q["id"], ["t5", "t1", "t2", "t3", "t4"], h)
    assert r.status_code == 200
    assert r.json()["is_correct"] is True


# ─── 16. Initial student payload does not expose correct orders ──────────────

def test_initial_student_payload_does_not_expose_correct_orders(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Security Test")
    q_student = next(item for item in data["questions"] if item["id"] == q["id"])

    blob = str(q_student["data"])
    assert "valid_orders" not in blob
    assert "correct_position" not in blob
    assert "correct_token_ids" not in blob
    assert "correct_tokens" not in blob
    # First word visual indicator is present
    assert q_student["data"]["first_word"] == "I"
    assert q_student["data"]["first_word_id"] == "t1"


# ─── 17. Incorrect submission returns valid correct orders through feedback ──

def test_incorrect_submission_returns_valid_correct_orders(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data = start(client, exam["slug"], "Feedback Multi")
    aid = data["attempt_id"]
    h = attempt_headers(data)

    r = _put_answer(client, aid, q["id"], ["t1", "t3", "t2", "t4", "t5"], h)
    body = r.json()
    assert body["is_correct"] is False
    ca = body["correct_answer"]
    assert ca["type"] == "ordering"
    assert len(ca["valid_orders"]) == 3
    # Check valid order texts
    assert ca["valid_orders"][0]["tokens"] == ["I", "went", "to", "school", "yesterday"]
    assert ca["valid_orders"][1]["tokens"] == ["yesterday", "I", "went", "to", "school"]
    assert ca["valid_orders"][2]["tokens"] == ["I", "went", "yesterday", "to", "school"]


# ─── 18, 19. Snapshots freeze ordering configuration ─────────────────────────

def test_attempt_snapshot_keeps_old_valid_orders_after_teacher_edits(client, teacher):
    exam, q = _create_exam_with_multi_ordering(client, teacher)
    data_a = start(client, exam["slug"], "Student A")
    aid_a = data_a["attempt_id"]
    h_a = attempt_headers(data_a)

    # Teacher updates the exam: now ONLY valid order is [t1, t3, t2, t4, t5]
    client.put(
        f"/api/questions/{q['id']}",
        json={
            "data": {
                "type": "ordering",
                "tokens": [
                    {"id": "t1", "text": "I"},
                    {"id": "t2", "text": "went"},
                    {"id": "t3", "text": "to"},
                    {"id": "t4", "text": "school"},
                    {"id": "t5", "text": "yesterday"},
                ],
                "valid_orders": [["t1", "t3", "t2", "t4", "t5"]],
            }
        },
        headers=teacher,
    )

    # Student A (started before edit) submits V1's second order [t5, t1, t2, t3, t4]
    # In V1 this was CORRECT. Must still grade CORRECT!
    r_a = _put_answer(client, aid_a, q["id"], ["t5", "t1", "t2", "t3", "t4"], h_a)
    assert r_a.json()["is_correct"] is True

    # Student B starts AFTER teacher edit
    data_b = start(client, exam["slug"], "Student B")
    aid_b = data_b["attempt_id"]
    h_b = attempt_headers(data_b)

    # Student B submits old order [t5, t1, t2, t3, t4] -> INCORRECT in V2
    r_b1 = _put_answer(client, aid_b, q["id"], ["t5", "t1", "t2", "t3", "t4"], h_b)
    assert r_b1.json()["is_correct"] is False
