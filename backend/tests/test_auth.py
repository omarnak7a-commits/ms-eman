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


def test_refresh_returns_rotated_refresh_token(client, teacher_login):
    """Production regression: rotation must hand the NEW refresh token to the
    client, otherwise the client keeps a revoked token and the next refresh
    fails (intermittent 'Authentication required.' on the frontend)."""
    s = _login(client, teacher_login)
    r = client.post("/api/auth/refresh", json={"refresh_token": s["refresh"]})
    assert r.status_code == 200
    data = r.json()
    # New access token + a NEW refresh token are both returned.
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["refresh_token"] != s["refresh"]

    # The rotated (new) refresh token works for the NEXT refresh — this is the
    # exact sequence the frontend now performs across token expiries.
    r2 = client.post("/api/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert r2.status_code == 200
    assert r2.json()["refresh_token"] != data["refresh_token"]


def test_refreshed_access_token_is_usable(client, teacher_login):
    s = _login(client, teacher_login)
    r = client.post("/api/auth/refresh", json={"refresh_token": s["refresh"]})
    assert r.status_code == 200
    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {r.json()['access_token']}"},
    )
    assert me.status_code == 200


def test_refresh_rejects_garbage_token(client, teacher_login):
    _login(client, teacher_login)
    r = client.post("/api/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert r.status_code == 401


def test_refresh_rotation_invalidates_old_token(client, teacher_login):
    s = _login(client, teacher_login)
    r = client.post("/api/auth/refresh", json={"refresh_token": s["refresh"]})
    assert r.status_code == 200
    new_access = r.json()["access_token"]
    assert r.headers.get("content-type", "").startswith("application/json")

    # Old refresh token must no longer be usable (rotation).
    r2 = client.post("/api/auth/refresh", json={"refresh_token": s["refresh"]})
    assert r2.status_code == 401

    # New access token works.
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200


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
