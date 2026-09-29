"""Readiness endpoint tests: database success and safe database failure."""
from __future__ import annotations

from sqlalchemy.exc import OperationalError


def test_healthz_database_success(client):
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"


def test_healthz_database_failure_returns_safe_503(client, monkeypatch):
    from app import main

    def fail_connect():
        raise OperationalError("SELECT 1", {}, Exception("secret database detail"))

    monkeypatch.setattr(main.engine, "connect", fail_connect)
    response = client.get("/healthz")

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == "database_unavailable"
    assert body["message"] == (
        "The service is temporarily unavailable due to a database error. "
        "Please try again shortly."
    )
    assert "secret database detail" not in response.text
