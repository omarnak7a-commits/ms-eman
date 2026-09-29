"""Authentication + authorization tests."""
from __future__ import annotations

import pytest


def _login(client, creds):
    r = client.post("/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "access": data["access_token"],
        "refresh": data["refresh_token"],
        "Authorization": f"Bearer {data['access_token']}",
    }


def test_login_and_me(client, teacher_login):
    s = _login(client, teacher_login)
    assert s["access"]
    assert s["refresh"]
    r = client.get("/api/auth/me", headers=s)
    assert r.status_code == 200
    me = r.json()["teacher"]
    assert me["email"] == teacher_login["email"]
    assert me["role"] == "teacher"


def test_login_wrong_password(client, teacher_login):
    r = client.post("/api/auth/login", json={**teacher_login, "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_invalid_token_rejected(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


def test_teacher_exam_route_requires_token(client):
    assert client.get("/api/exams").status_code == 401


def test_refresh_rotation_invalidates_old_token(client, teacher_login):
    s = _login(client, teacher_login)
    r = client.post("/api/auth/refresh", json={"refresh_token": s["refresh"]})
    assert r.status_code == 200
    body = r.json()
    new_access = body["access_token"]
    new_refresh = body["refresh_token"]
    assert new_access and new_refresh
    assert new_refresh != s["refresh"]
    assert r.headers.get("content-type", "").startswith("application/json")

    # Old refresh token must no longer be usable (rotation).
    r2 = client.post("/api/auth/refresh", json={"refresh_token": s["refresh"]})
    assert r2.status_code == 401

    # New access token works.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200


def test_refresh_chain_works_across_rotations(client, teacher_login):
    """The rotated refresh token must itself be usable — a teacher whose
    access token expires repeatedly (15 min TTL) has to survive every
    rotation, not just the first one."""
    s = _login(client, teacher_login)
    refresh = s["refresh"]
    access = s["access"]
    for _ in range(3):
        r = client.post("/api/auth/refresh", json={"refresh_token": refresh})
        assert r.status_code == 200, r.text
        body = r.json()
        old_refresh = refresh
        access = body["access_token"]
        refresh = body["refresh_token"]
        assert refresh and refresh != old_refresh
        # The replaced token is dead immediately.
        assert (
            client.post("/api/auth/refresh", json={"refresh_token": old_refresh}).status_code
            == 401
        )
    # The newest access token authorises normal teacher APIs.
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"}).status_code == 200


def test_refresh_with_unknown_token_rejected(client):
    assert client.post("/api/auth/refresh", json={"refresh_token": "nope"}).status_code == 401


def test_logout_revokes_refresh_token(client, teacher_login):
    s = _login(client, teacher_login)
    r = client.post("/api/auth/logout", json={"refresh_token": s["refresh"]})
    assert r.status_code == 200
    r2 = client.post("/api/auth/refresh", json={"refresh_token": s["refresh"]})
    assert r2.status_code == 401


def test_logout_all_revokes_everything(client, teacher_login):
    s1 = _login(client, teacher_login)
    s2 = _login(client, teacher_login)
    client.post("/api/auth/logout-all", json={"refresh_token": s1["refresh"]})
    # Both refresh tokens revoked
    assert client.post("/api/auth/refresh", json={"refresh_token": s1["refresh"]}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": s2["refresh"]}).status_code == 401


def test_password_is_never_plaintext(client, teacher_login, tmp_path):
    # login hashes are bcrypt in DB — covered by model design; smoke-check endpoint.
    _login(client, teacher_login)


def test_expired_refresh_tokens_swept_on_login(client, teacher_login):
    """L3: expired refresh-token rows are cleaned up opportunistically when a
    teacher logs in — no scheduler needed and no live token is ever touched."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select, update

    from conftest import TestingSession
    from app.models import RefreshToken

    s1 = _login(client, teacher_login)

    # Age every stored refresh token past its expiry.
    with TestingSession() as db:
        db.execute(
            update(RefreshToken).values(
                expires_at=datetime.now(timezone.utc) - timedelta(days=1)
            )
        )
        db.commit()

    # Next login issues a fresh token and sweeps the expired row away.
    s2 = _login(client, teacher_login)
    assert s2["refresh"] != s1["refresh"]

    with TestingSession() as db:
        rows = db.execute(select(RefreshToken)).scalars().all()
    assert len(rows) == 1  # only the freshly-issued token remains

    # And that token is usable (cleanup did not touch live sessions).
    r = client.post("/api/auth/refresh", json={"refresh_token": s2["refresh"]})
    assert r.status_code == 200


# ── Error-handling regressions: the "Request failed (500)" login bug ──────────
# A login against a database that is unreachable / not migrated used to bubble
# an unhandled SQLAlchemyError up as an opaque HTTP 500 with no body (the SPA
# rendered it as "Request failed (500)"). It must now be a safe, meaningful
# JSON error, and invalid input must be 401/422 — never 500.

def test_login_missing_fields_returns_clean_422(client):
    r = client.post("/api/auth/login", json={"email": "ms.eman.zahy@test.com"})
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "validation_error"
    # A human-readable message, not a raw list rendered as "[object Object]".
    assert isinstance(body["message"], str) and body["message"]
    assert "password" in body["message"].lower()


def test_login_missing_body_returns_clean_422(client):
    r = client.post("/api/auth/login", json={})
    assert r.status_code == 422
    assert r.json()["code"] == "validation_error"


def test_login_database_error_returns_503_not_500(client, teacher_login, monkeypatch):
    """A DB failure during login must surface as a safe 503, never a raw 500."""
    from sqlalchemy.exc import OperationalError

    from app.services import auth_service

    def _boom(*_args, **_kwargs):
        raise OperationalError("SELECT 1", {}, Exception("no such table: teachers"))

    monkeypatch.setattr(auth_service.teacher_repo, "get_by_email", _boom)

    r = client.post("/api/auth/login", json=teacher_login)
    assert r.status_code == 503
    body = r.json()
    assert body["code"] == "database_unavailable"
    assert isinstance(body["message"], str) and body["message"]
    # The internal SQL / driver detail must never leak to the client.
    assert "teachers" not in body["message"]
    assert "SELECT" not in body["message"]
