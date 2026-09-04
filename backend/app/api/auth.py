"""Authentication endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.deps import get_current_teacher
from ..db.session import get_db
from ..models import Teacher
from ..schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    RefreshRequest,
    TeacherOut,
    TokenPair,
    TokenRefreshResponse,
)
from ..schemas.common import Message
from ..services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


class LogoutRequest(BaseModel):
    refresh_token: str


class LogoutAllRequest(BaseModel):
    refresh_token: str


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    svc = AuthService(db)
    teacher = svc.authenticate(payload.email, payload.password)
    return svc.issue_tokens(teacher)


@router.post("/refresh", response_model=TokenRefreshResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    svc = AuthService(db)
    return svc.refresh(payload.refresh_token)


@router.post("/logout", response_model=Message)
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    svc = AuthService(db)
    svc.logout(payload.refresh_token, revoke_all=False)
    return Message(message="Logged out.")


@router.post("/logout-all", response_model=Message)
def logout_all(payload: LogoutAllRequest, db: Session = Depends(get_db)):
    svc = AuthService(db)
    svc.logout(payload.refresh_token, revoke_all=True)
    return Message(message="Logged out everywhere.")


@router.post("/change-password", response_model=Message)
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    svc = AuthService(db)
    svc.change_password(teacher, payload.current_password, payload.new_password)
    return Message(message="Password changed. Please sign in again.")


@router.get("/me", response_model=MeResponse)
def me(teacher: Teacher = Depends(get_current_teacher)):
    return MeResponse(teacher=TeacherOut.model_validate(teacher))
