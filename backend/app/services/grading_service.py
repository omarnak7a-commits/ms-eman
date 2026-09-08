"""Server-side grading engine.

Grading is authoritative: the client never supplies a score. Only the backend
knows which answer is correct and how many marks are awarded.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..core.exceptions import ValidationError
from ..models import Question


@dataclass
class GradeOutcome:
    is_correct: bool
    awarded_marks: float


def normalize_text(value: str) -> str:
    return " ".join(value.strip().split()).lower()


def _require_type(question: Question, expected: str) -> None:
    if question.type != expected:
        raise ValidationError("Question/answer type mismatch")


def _mcq_correct_id(data: dict[str, Any]) -> str | None:
    options = data.get("options", [])
    for opt in options:
        if opt.get("is_correct"):
            return opt.get("id")
    return None


def grade_multiple_choice(
    question: Question,
    answer_data: dict[str, Any],
) -> GradeOutcome:
    _require_type(question, "multiple_choice")
    data: dict[str, Any] = question.data or {}
    correct_id = _mcq_correct_id(data)
    selected = (answer_data or {}).get("selected_option_id")
    is_correct = bool(correct_id) and selected == correct_id

    return GradeOutcome(
        is_correct=is_correct,
        awarded_marks=question.marks if is_correct else 0.0,
    )


def _ordered_tokens(data: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        data.get("tokens", []),
        key=lambda t: t.get("correct_position", 0),
    )


def _correct_token_ids(data: dict[str, Any]) -> list[str]:
    tokens = _ordered_tokens(data)
    return [t.get("id") for t in tokens if t.get("id")]


def get_valid_orders(data: dict[str, Any]) -> list[list[str]]:
    """Return all valid token ID sequences for an ordering question.

    Supports both new `valid_orders` format and legacy single
    `correct_position` format.
    """
    valid_orders = data.get("valid_orders")

    if valid_orders and isinstance(valid_orders, list):
        result = []

        for order in valid_orders:
            if isinstance(order, list) and order:
                result.append([str(tid) for tid in order])

        if result:
            return result

    token_ids = _correct_token_ids(data)
    return [token_ids] if token_ids else []


def grade_ordering(
    question: Question,
    answer_data: dict[str, Any],
) -> GradeOutcome:
    _require_type(question, "ordering")

    data: dict[str, Any] = question.data or {}
    valid_orders = get_valid_orders(data)
    student_ids = list((answer_data or {}).get("token_ids", []) or [])

    if not valid_orders:
        is_correct = False
    else:
        # Preserve exact ID matching for all explicitly valid orders.
        is_correct = any(
            student_ids == order
            for order in valid_orders
        )

        if not is_correct:
            # Also support repeated visible words with different token IDs.
            # Example: "the cat and the dog"
            text_by_id = {
                t.get("id"): t.get("text")
                for t in (data.get("tokens", []) or [])
            }

            student_texts = [
                text_by_id.get(tid)
                for tid in student_ids
            ]

            for order in valid_orders:
                correct_texts = [
                    text_by_id.get(tid)
                    for tid in order
                ]

                if student_texts == correct_texts:
                    is_correct = True
                    break

    return GradeOutcome(
        is_correct=is_correct,
        awarded_marks=question.marks if is_correct else 0.0,
    )


def _bracket_matches(item: dict[str, Any], student_answer: str) -> bool:
    case_sensitive = bool(item.get("case_sensitive"))
    accepted = item.get("accepted_answers", []) or []

    if case_sensitive:
        return any(
            a.strip() == student_answer.strip()
            for a in accepted
        )

    target = normalize_text(student_answer)
    return any(
        normalize_text(a) == target
        for a in accepted
    )


def grade_correct_brackets(
    question: Question,
    answer_data: dict[str, Any],
) -> GradeOutcome:
    _require_type(question, "correct_brackets")

    data: dict[str, Any] = question.data or {}
    brackets = data.get("brackets", []) or []
    answer = (answer_data or {}).get("answer", "")
    answers = answer if isinstance(answer, list) else [answer]

    if not brackets:
        return GradeOutcome(
            is_correct=False,
            awarded_marks=0.0,
        )

    # Single bracket (the platform's standard case) uses one text input.
    if len(brackets) == 1:
        ok = _bracket_matches(
            brackets[0],
            answer if isinstance(answer, str) else str(answer or ""),
        )

        return GradeOutcome(
            is_correct=ok,
            awarded_marks=question.marks if ok else 0.0,
        )

    # Multiple brackets: expected equal-length list of strings.
    if len(answers) != len(brackets):
        return GradeOutcome(
            is_correct=False,
            awarded_marks=0.0,
        )

    all_ok = all(
        _bracket_matches(b, a)
        for b, a in zip(brackets, answers)
    )

    return GradeOutcome(
        is_correct=all_ok,
        awarded_marks=question.marks if all_ok else 0.0,
    )


def grade_question(
    question: Question,
    answer_data: dict[str, Any] | None,
) -> GradeOutcome:
    """Grade a single answer. Answers without data are always incorrect/unscored."""
    if not answer_data:
        return GradeOutcome(
            is_correct=False,
            awarded_marks=0.0,
        )

    if question.type == "multiple_choice":
        return grade_multiple_choice(question, answer_data)

    if question.type == "ordering":
        return grade_ordering(question, answer_data)

    if question.type == "correct_brackets":
        return grade_correct_brackets(question, answer_data)

    raise ValidationError(
        f"Unsupported question type: {question.type}"
    )
