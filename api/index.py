"""Vercel entrypoint for the SINGLE-project deployment.

The whole application runs as ONE service on one origin: this Python function
is the full FastAPI app, which serves both the REST API (under /api and the
student routes) and the prebuilt React UI (from the committed `dist/` folder).
See backend/app/main.py `_mount_frontend`.

To import the `app` package (which lives under `backend/`), add it to the path.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from app.main import app  # noqa: E402,F401
