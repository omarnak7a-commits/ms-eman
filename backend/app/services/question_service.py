"""Question business rules: payload validation, teacher serialization and
student-safe serialization (never leak correct answers during an exam)."""
from __future__ import annotations

import random
from typing import Any

from ..core.exceptions import ValidationError
from ..models.base import new_id
from ..models import Question

_VALID_TYPES = {"multiple_choice", "ordering", "correct_brackets"}


def _uniq(seq: list[str]) -> list[str]:
    return list(dict.fromkeys(seq))


def _ensure_ids(items: list[dict[str, Any]]) -> None:
    seen: list[str] = []
    for it in items:
        if not it.get("id"):
            it["id"] = new_id()
        seen.append(it["id"])
    if len(seen) != len(_uniq(seen)):
        raise ValidationError("Duplicate item ids are not allowed.")


def validate_data(qtype: str, data: dict[str, Any]) -> dict[str, Any]:
    """Validate + normalise the type-specific payload. Mutates a copy."""
    if qtype not in _VALID_TYPES:
        raise ValidationError(f"Unsupported question type: {qtype}")

    if qtype == "multiple_choice":
        options = data.get("options")
        if not isinstance(options, list) or len(options) < 2:
            raise ValidationError("Multiple choice requires at least two options.")
        clean = []
        for opt in options:
            text = (opt.get("text") or "").strip()
            if not text:
                raise ValidationError("Multiple choice options cannot be empty.")
            clean.append(
                {
                    "id": opt.get("id") or new_id(),
                    "text": text,
                    "order_index": int(opt.get("order_index") or 0),
                    "is_correct": bool(opt.get("is_correct")),
                }
            )
        _ensure_ids(clean)
        if sum(1 for o in clean if o["is_correct"]) != 1:
            raise ValidationError("Multiple choice requires exactly one correct option.")
        return {"type": "multiple_choice", "options": clean}

    if qtype == "ordering":
        tokens = data.get("tokens")
        if not isinstance(tokens, list) or len(tokens) < 2:
            raise ValidationError("Ordering requires at least two tokens.")
        clean = []
        for pos, tok in enumerate(tokens):
            text = (tok.get("text") or "").strip()
            if not text:
                raise ValidationError("Ordering tokens cannot be empty.")
            clean.append(
                {
                    "id": tok.get("id") or new_id(),
                    "text": text,
                    "correct_position": int(tok.get("correct_position", pos)),
                }
            )
        _ensure_ids(clean)
        # Re-derive positions by array order to guarantee consistency.
        for pos, tok in enumerate(clean):
            tok["correct_position"] = pos
        return {"type": "ordering", "tokens": clean}

    if qtype == "correct_brackets":
        sentence = (data.get("sentence") or "").strip()
        if not sentence:
            raise ValidationError("Correct-the-brackets requires a sentence.")
        brackets = data.get("brackets")
        if not isinstance(brackets, list) or not brackets:
            raise ValidationError("Correct-the-brackets requires at least one bracket.")
        clean = []
        for item in brackets:
            word = (item.get("original_word") or "").strip()
            accepted = [a.strip() for a in (item.get("accepted_answers") or []) if a.strip()]
            if not word:
                raise ValidationError("Bracket original word cannot be empty.")
            if not accepted:
                raise ValidationError("Each bracket requires at least one accepted answer.")
            clean.append(
                {
                    "id": item.get("id") or new_id(),
                    "original_word": word,
                    "accepted_answers": accepted,
                    "case_sensitive": bool(item.get("case_sensitive")),
                }
            )
        _ensure_ids(clean)
        return {"type": "correct_brackets", "sentence": sentence, "brackets": clean}

    raise ValidationError("Unsupported question type.")  # pragma: no cover


def teacher_payload(question: Question) -> dict[str, Any]:
    """Full serialization for the teacher (contains correct answers)."""
    return {
        "id": question.id,
        "exam_id": question.exam_id,
        "type": question.type,
        "text": question.text,
        "order_index": question.order_index,
        "marks": question.marks,
        "data": question.data,
        "created_at": question.created_at,
        "updated_at": question.updated_at,
    }


def student_payload(question: Question, *, shuffle: bool = True) -> dict[str, Any]:
    """Sanitised serialization for an in-progress attempt.

    Correct answers, correct positions and accepted answers are stripped.
    Ordering tokens are also shuffled so the sequence cannot be read off the
    array order (pass ``shuffle=False`` for deterministic views such as the
    teacher's exam preview).
    """
    base = {
        "id": question.id,
        "type": question.type,
        "text": question.text,
        "marks": question.marks,
    }
    data: dict[str, Any] = question.data or {}
    if question.type == "multiple_choice":
        options = [
            {"id": o["id"], "text": o["text"], "order_index": o["order_index"]}
            for o in data.get("options", [])
        ]
        return {**base, "data": {"type": "multiple_choice", "options": options}}

    if question.type == "ordering":
        tokens = [{"id": o["id"], "text": o["text"]} for o in data.get("tokens", [])]
        if shuffle:
            random.shuffle(tokens)
        return {**base, "data": {"type": "ordering", "tokens": tokens}}

    # correct_brackets
    brackets = [
        {"id": b["id"], "original_word": b["original_word"]}
        for b in data.get("brackets", [])
    ]
    return {
        **base,
        "data": {
            "type": "correct_brackets",
            "sentence": data.get("sentence", ""),
            "brackets": brackets,
        },
    }


def correct_answer_payload(question: Question) -> dict[str, Any]:
    """Used in review (after submission) and teacher attempt detail."""
    data: dict[str, Any] = question.data or {}
    if question.type == "multiple_choice":
        correct = [o for o in data.get("options", []) if o.get("is_correct")]
        return {"type": "multiple_choice", "options": data.get("options", []), "correct_option_ids": [o["id"] for o in correct]}
    if question.type == "ordering":
        tokens = sorted(data.get("tokens", []), key=lambda t: t["correct_position"])
        return {
            "type": "ordering",
            "correct_token_ids": [t["id"] for t in tokens],
            "correct_tokens": [t["text"] for t in tokens],
        }
    brackets = data.get("brackets", [])
    return {
        "type": "correct_brackets",
        "accepted_answers": {
            b["id"]: list(b.get("accepted_answers", [])) for b in brackets
        },
    }
