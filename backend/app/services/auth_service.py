"""Teacher authentication service: login, refresh rotation, logout."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from ..core import security
from ..core.config import get_settings
from ..core.exceptions import AuthenticationError, NotFoundError
from ..core.timeutil import ensure_utc
from ..models import RefreshToken, Teacher
from ..repositories import refresh_token_repo, teacher_repo
from ..schemas.auth import TokenPair, TokenRefreshResponse


class AuthService:
    def __init__(self, db: Session):
        self.db = db

    def authenticate(self, email: str, password: str) -> Teacher:
        teacher = teacher_repo.get_by_email(self.db, email)
        if not teacher or not security.verify_password(password, teacher.password_hash):
            raise AuthenticationError("Invalid email or password.")
        return teacher

    def _issue_refresh_token(self, teacher: Teacher) -> str:
        settings = get_settings()
        raw = security.generate_refresh_token()
        token_hash = security.sha256_hex(raw)
        expires_at = security.now_utc() + timedelta(days=settings.refresh_token_expire_days)
        refresh_token_repo.create(
            self.db,
            user_id=teacher.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        return raw

    def issue_tokens(self, teacher: Teacher) -> TokenPair:
        settings = get_settings()
        access_token, _ = security.create_access_token(teacher.id)
        raw_refresh = self._issue_refresh_token(teacher)
        self.db.commit()
        return TokenPair(
            access_token=access_token,
            refresh_token=raw_refresh,
            expires_in=settings.access_token_expire_minutes * 60,
        )

    def refresh(self, raw_refresh_token: str) -> TokenRefreshResponse:
        """Rotate the refresh token: revoke the presented token, issue a new one."""
        settings = get_settings()
        token_hash = security.sha256_hex(raw_refresh_token)
        rt = refresh_token_repo.get_by_hash(self.db, token_hash)
        if not rt or rt.revoked_at is not None:
            raise AuthenticationError("Invalid or revoked refresh token.")
        now = security.now_utc()
        if ensure_utc(rt.expires_at) < now:
            raise AuthenticationError("Refresh token has expired.")

        teacher = teacher_repo.get_by_id(self.db, rt.user_id)
        if not teacher:
            raise AuthenticationError("Account no longer exists.")

        # Rotation: revoke old token, issue a fresh pair.
        refresh_token_repo.revoke(self.db, rt, now)

        access_token, _ = security.create_access_token(teacher.id)
        raw_new_refresh = self._issue_refresh_token(teacher)
        self.db.commit()
        return TokenRefreshResponse(
            access_token=access_token,
            expires_in=settings.access_token_expire_minutes * 60,
        )

    def change_password(self, teacher: Teacher, current_password: str, new_password: str) -> None:
        if not security.verify_password(current_password, teacher.password_hash):
            raise AuthenticationError("Current password is incorrect.")
        teacher.password_hash = security.hash_password(new_password)
        # Revoke all refresh tokens so other sessions must re-authenticate.
        refresh_token_repo.revoke_all_for_user(self.db, teacher.id, security.now_utc())
        self.db.commit()

    def logout(self, raw_refresh_token: str, *, revoke_all: bool) -> None:
        now = security.now_utc()
        if revoke_all:
            token_hash = security.sha256_hex(raw_refresh_token)
            rt = refresh_token_repo.get_by_hash(self.db, token_hash)
            if rt:
                refresh_token_repo.revoke_all_for_user(self.db, rt.user_id, now)
        else:
            token_hash = security.sha256_hex(raw_refresh_token)
            rt = refresh_token_repo.get_by_hash(self.db, token_hash)
            if rt:
                refresh_token_repo.revoke(self.db, rt, now)
        self.db.commit()


def get_teacher_or_raise(db: Session, teacher_id: str) -> Teacher:
    teacher = teacher_repo.get_by_id(db, teacher_id)
    if not teacher:
        raise NotFoundError("Teacher not found.")
    return teacher
