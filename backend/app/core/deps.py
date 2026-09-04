"""Shared FastAPI dependencies."""
from __future__ import annotations

import jwt

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..db.session import get_db
from ..models import Teacher
from ..repositories.teacher_repo import get_by_id
from .config import get_settings
from .exceptions import AuthenticationError

_bearer = HTTPBearer(auto_error=False)


def get_current_teacher(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Teacher:
    """Resolve the authenticated teacher from a JWT access token."""
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Authentication required.")
    token = credentials.credentials
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.PyJWTError as exc:
        raise AuthenticationError("Invalid or expired token.") from exc

    if payload.get("type") != "access":
        raise AuthenticationError("Invalid token type.")

    teacher = get_by_id(db, payload.get("sub", ""))
    if not teacher:
        raise AuthenticationError("Account no longer exists.")
    return teacher
