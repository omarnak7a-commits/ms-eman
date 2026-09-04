"""Change-password endpoint tests."""
from __future__ import annotations

import pytest


def test_change_password_and_revoke_sessions(client, teacher_login):
    # login twice to get two refresh tokens
    def login():
        r = client.post("/api/auth/login", json=teacher_login)
        assert r.status_code == 200
        return r.json()

    s1 = login()
    s2 = login()
    h = {"Authorization": f"Bearer {s1['access_token']}"}

    r = client.post(
        "/api/auth/change-password",
        json={"current_password": teacher_login["password"], "new_password": "NewPass!2024x"},
        headers=h,
    )
    assert r.status_code == 200

    # Both refresh tokens are now revoked (all sessions logged out).
    assert client.post("/api/auth/refresh", json={"refresh_token": s1["refresh_token"]}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": s2["refresh_token"]}).status_code == 401

    # The new password works; old does not.
    ok = client.post("/api/auth/login", json={**teacher_login, "password": "NewPass!2024x"})
    assert ok.status_code == 200
    bad = client.post("/api/auth/login", json={**teacher_login, "password": teacher_login["password"]})
    assert bad.status_code == 401


def test_change_password_wrong_current(client, teacher_login):
    s = client.post("/api/auth/login", json=teacher_login).json()
    h = {"Authorization": f"Bearer {s['access_token']}"}
    r = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "NewPass!2024x"},
        headers=h,
    )
    assert r.status_code == 401
