"""Slug helpers."""
from __future__ import annotations

import unicodedata


def slugify_base(text: str) -> str:
    """ASCII-oriented slug base; Arabic/Latin text is de-accented and trimmed."""
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower().strip()
    cleaned = "".join(ch if ch.isalnum() or ch in " -_" else " " for ch in ascii_text)
    parts = [p for p in cleaned.replace("_", " ").split() if p]
    return "-".join(parts)[:40]
