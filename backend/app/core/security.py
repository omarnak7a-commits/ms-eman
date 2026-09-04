"""Security primitives: bcrypt password hashing + JWT access/refresh tokens.

Production security requirements:
- Secure password hashing (bcrypt) — never plaintext.
- JWT access tokens (short lived).
- Refresh tokens are opaque; we store only a SHA-256 hash of the token so a
  database leak does not expose usable refresh tokens.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import get_settings

_PASSWORD_CONTEXT_MARKER = "bcrypt"


def hash_password(password: str) -> str:
    """Return a bcrypt hash string (self-contained, includes salt)."""
    pw = password.encode("utf-8")
    hashed = bcrypt.hashpw(pw, bcrypt.gensalt(rounds=12))
    return hashed.decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def sha256_hex(value: str) -> str:
    """Hash an opaque refresh token so we never persist the raw token."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_refresh_token() -> str:
    """Return a cryptographically random opaque refresh token."""
    return secrets.token_urlsafe(48)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# JWT access tokens
# ---------------------------------------------------------------------------

def _create_jwt(subject: str, expires_delta: timedelta, token_type: str) -> str:
    settings = get_settings()
    now = now_utc()
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str) -> tuple[str, datetime]:
    settings = get_settings()
    delta = timedelta(minutes=settings.access_token_expire_minutes)
    expires_at = now_utc() + delta
    return _create_jwt(subject, delta, "access"), expires_at


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.ExpiredSignatureError:
        raise
    except jwt.InvalidTokenError as exc:  # noqa: PERF203
        raise jwt.InvalidTokenError("Invalid token") from exc
    return payload
