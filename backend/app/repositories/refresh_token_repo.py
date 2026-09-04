"""Refresh token data access."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from ..models import RefreshToken


def create(
    db: Session, *, user_id: str, token_hash: str, expires_at: datetime
) -> RefreshToken:
    rt = RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(rt)
    db.flush()
    return rt


def get_by_hash(db: Session, token_hash: str) -> RefreshToken | None:
    return db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()


def revoke(db: Session, rt: RefreshToken, at: datetime) -> None:
    rt.revoked_at = at
    db.flush()


def revoke_all_for_user(db: Session, user_id: str, at: datetime) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=at)
    )
    db.flush()


def delete_expired(db: Session, now: datetime) -> None:
    db.execute(delete(RefreshToken).where(RefreshToken.expires_at < now))
