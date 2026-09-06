"""Authentication request/response schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenRefreshResponse(BaseModel):
    access_token: str
    # Refresh tokens are ROTATED on every use: the presented token is revoked
    # and this fresh one must replace it client-side. Without this field the
    # client keeps the already-revoked token and its next refresh attempt
    # dies with 401, stranding the teacher mid-session.
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TeacherOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    role: str
    created_at: datetime


class MeResponse(BaseModel):
    teacher: TeacherOut
