"""Vercel serverless-function entrypoint for the FastAPI backend.

Architecture (mirrors the proven `whatsapp-exam-bot` layout):

* Vercel BUILDS the React/Vite frontend (`cd frontend && npm run build`) and
  serves the generated `frontend/dist` as static assets from its CDN.
* Only `/api/*` (and `/healthz`) are rewritten to this Python function.
* Everything else falls back to the statically generated `/index.html`, which
  is what makes React Router's client-side routes work on a hard reload.

This module does NOT create a second FastAPI application: it re-exports the
existing instance from `backend/app/main.py` so every route, dependency and
middleware stays exactly the same.
"""
import os
import sys

# This file is <project_root>/api/index.py, so the package root that contains
# `app/` is <project_root>/backend. Add it to sys.path so `from app.main import
# app` resolves regardless of the process working directory.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from app.main import app  # noqa: E402, F401
