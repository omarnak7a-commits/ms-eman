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

        token_id_set = {t["id"] for t in clean}
        num_tokens = len(clean)

        # Validate multiple valid orders
        valid_orders_input = data.get("valid_orders")
        clean_valid_orders: list[list[str]] = []

        if valid_orders_input is not None:
            if not isinstance(valid_orders_input, list) or len(valid_orders_input) == 0:
                raise ValidationError("Ordering requires at least one valid order.")
            for order in valid_orders_input:
                if not isinstance(order, list) or len(order) == 0:
                    raise ValidationError("Valid order cannot be empty.")
                if len(order) < num_tokens:
                    raise ValidationError("Valid order is missing words.")
                if len(order) > num_tokens:
                    raise ValidationError("Valid order contains extra words.")
                if len(set(order)) != len(order):
                    raise ValidationError("Valid order contains duplicate words.")
                if not all(tid in token_id_set for tid in order):
                    raise ValidationError("Valid order contains invalid word references.")
                clean_valid_orders.append([str(tid) for tid in order])
        else:
            # Legacy format / default: derive single valid order from array order
            clean_valid_orders = [[t["id"] for t in clean]]

        # Ensure at least one valid order
        if not clean_valid_orders:
            clean_valid_orders = [[t["id"] for t in clean]]

        # Re-derive positions from the primary valid order for backward compatibility
        primary_order = clean_valid_orders[0]
        pos_map = {tid: pos for pos, tid in enumerate(primary_order)}
        for tok in clean:
            tok["correct_position"] = pos_map.get(tok["id"], 0)

        result: dict[str, Any] = {
            "type": "ordering",
            "tokens": clean,
            "valid_orders": clean_valid_orders,
        }

        # First word indicator (visual helper only)
        first_word_id = data.get("first_word_id")
        first_word_text = data.get("first_word")

        if first_word_id and first_word_id in token_id_set:
            matching_tok = next((t for t in clean if t["id"] == first_word_id), None)
            result["first_word_id"] = first_word_id
            result["first_word"] = matching_tok["text"] if matching_tok else first_word_text
        elif first_word_text:
            matching_tok = next((t for t in clean if t["text"] == first_word_text or t["id"] == first_word_text), None)
            if matching_tok:
                result["first_word_id"] = matching_tok["id"]
                result["first_word"] = matching_tok["text"]
            else:
                result["first_word"] = str(first_word_text)

        return result

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
        ordering_data: dict[str, Any] = {"type": "ordering", "tokens": tokens}
        if data.get("first_word"):
            ordering_data["first_word"] = data["first_word"]
        if data.get("first_word_id"):
            ordering_data["first_word_id"] = data["first_word_id"]
        return {**base, "data": ordering_data}

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


def get_valid_orders(data: dict[str, Any]) -> list[list[str]]:
    """Return list of valid token ID sequences.

    Supports both new `valid_orders` format and legacy single `correct_position` format.
    """
    valid_orders = data.get("valid_orders")
    if valid_orders and isinstance(valid_orders, list):
        result = []
        for order in valid_orders:
            if isinstance(order, list) and order:
                result.append([str(tid) for tid in order])
        if result:
            return result

    tokens = sorted(data.get("tokens", []), key=lambda t: t.get("correct_position", 0))
    token_ids = [t.get("id") for t in tokens if t.get("id")]
    return [token_ids] if token_ids else []


def correct_answer_payload(question: Question) -> dict[str, Any]:
    """Used in review (after submission) and teacher attempt detail."""
    data: dict[str, Any] = question.data or {}
    if question.type == "multiple_choice":
        correct = [o for o in data.get("options", []) if o.get("is_correct")]
        return {"type": "multiple_choice", "options": data.get("options", []), "correct_option_ids": [o["id"] for o in correct]}
    if question.type == "ordering":
        tokens_map = {t["id"]: t.get("text", "") for t in data.get("tokens", [])}
        valid_orders = get_valid_orders(data)
        primary_ids = valid_orders[0] if valid_orders else []
        primary_tokens = [tokens_map.get(tid, "") for tid in primary_ids]

        all_valid_orders = [
            {
                "token_ids": order,
                "tokens": [tokens_map.get(tid, "") for tid in order],
                "text": " ".join(tokens_map.get(tid, "") for tid in order),
            }
            for order in valid_orders
        ]

        return {
            "type": "ordering",
            "correct_token_ids": primary_ids,
            "correct_tokens": primary_tokens,
            "valid_orders": all_valid_orders,
        }
    brackets = data.get("brackets", [])
    return {
        "type": "correct_brackets",
        "accepted_answers": {
            b["id"]: list(b.get("accepted_answers", [])) for b in brackets
        },
    }
