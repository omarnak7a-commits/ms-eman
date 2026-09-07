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


def grade_multiple_choice(question: Question, answer_data: dict[str, Any]) -> GradeOutcome:
    _require_type(question, "multiple_choice")
    data: dict[str, Any] = question.data or {}
    correct_id = _mcq_correct_id(data)
    selected = (answer_data or {}).get("selected_option_id")
    is_correct = bool(correct_id) and selected == correct_id
    return GradeOutcome(is_correct=is_correct, awarded_marks=question.marks if is_correct else 0.0)


def _ordered_tokens(data: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(data.get("tokens", []), key=lambda t: t.get("correct_position", 0))


def grade_ordering(question: Question, answer_data: dict[str, Any]) -> GradeOutcome:
    _require_type(question, "ordering")
    data: dict[str, Any] = question.data or {}
    correct = _ordered_tokens(data)
    text_by_id = {t.get("id"): t.get("text") for t in correct}
    student_ids = list((answer_data or {}).get("token_ids", []) or [])

    # Grade the sequence the student can actually SEE. Ordering questions may
    # legitimately contain repeated words (e.g. "the cat and the dog"), each
    # with its own token id but identical visible text. A student who taps the
    # words in the right order must not be marked wrong for picking the other
    # visually-identical token. Comparing texts (after the server validated the
    # ids are a full permutation of this question's tokens) keeps every
    # unique-token question byte-for-byte equivalent to the old id comparison.
    student_texts = [text_by_id.get(tid) for tid in student_ids]
    correct_texts = [t.get("text") for t in correct]
    is_correct = student_texts == correct_texts
    return GradeOutcome(is_correct=is_correct, awarded_marks=question.marks if is_correct else 0.0)


def _bracket_matches(item: dict[str, Any], student_answer: str) -> bool:
    case_sensitive = bool(item.get("case_sensitive"))
    accepted = item.get("accepted_answers", []) or []
    if case_sensitive:
        return any(a.strip() == student_answer.strip() for a in accepted)
    target = normalize_text(student_answer)
    return any(normalize_text(a) == target for a in accepted)


def grade_correct_brackets(question: Question, answer_data: dict[str, Any]) -> GradeOutcome:
    _require_type(question, "correct_brackets")
    data: dict[str, Any] = question.data or {}
    brackets = data.get("brackets", []) or []
    answer = (answer_data or {}).get("answer", "")
    answers = answer if isinstance(answer, list) else [answer]

    if not brackets:
        return GradeOutcome(is_correct=False, awarded_marks=0.0)

    # Single bracket (the platform's standard case) uses one text input.
    if len(brackets) == 1:
        ok = _bracket_matches(brackets[0], answer if isinstance(answer, str) else str(answer or ""))
        return GradeOutcome(is_correct=ok, awarded_marks=question.marks if ok else 0.0)

    # Multiple brackets: expected equal-length list of strings.
    if len(answers) != len(brackets):
        return GradeOutcome(is_correct=False, awarded_marks=0.0)
    all_ok = all(_bracket_matches(b, a) for b, a in zip(brackets, answers))
    return GradeOutcome(
        is_correct=all_ok, awarded_marks=question.marks if all_ok else 0.0
    )


def grade_question(question: Question, answer_data: dict[str, Any] | None) -> GradeOutcome:
    """Grade a single answer. Answers without data are always incorrect/unscored."""
    if not answer_data:
        return GradeOutcome(is_correct=False, awarded_marks=0.0)
    if question.type == "multiple_choice":
        return grade_multiple_choice(question, answer_data)
    if question.type == "ordering":
        return grade_ordering(question, answer_data)
    if question.type == "correct_brackets":
        return grade_correct_brackets(question, answer_data)
    raise ValidationError(f"Unsupported question type: {question.type}")
