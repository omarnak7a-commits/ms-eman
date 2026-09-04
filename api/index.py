"""Vercel entrypoint for the SINGLE-project deployment.

The whole application runs as ONE service on one origin: this Python function
is the full FastAPI app, which serves both the REST API (under /api and the
student routes) and the prebuilt React UI (from the committed `dist/` folder).
See backend/app/main.py `_mount_frontend`.

The `app` package lives under `backend/`, which is the sibling of the `api/`
folder, so we add the repo root's `backend/` to the import path regardless of
the process working directory.
"""
from __future__ import annotations

import sys
from pathlib import Path

# This file is <project_root>/api/index.py, so the backend package dir is
# <project_root>/backend. Resolve it robustly (no assumption about cwd).
_HERE = Path(__file__).resolve().parent          # <project_root>/api
_BACKEND = _HERE.parent / "backend"              # <project_root>/backend
for _p in (_BACKEND, _HERE.parent):              # also expose repo root
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from app.main import app  # noqa: E402,F401
