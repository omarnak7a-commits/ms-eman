"""Vercel entrypoint for the FastAPI backend.

Vercel's Python runtime looks for a FastAPI instance named ``app`` at a
supported entrypoint (``index.py`` at the deployment root). This module simply
re-exports the real application from the ``app`` package so the whole package
(``app.api``, ``app.services``, ...) imports correctly with its relative
imports intact.

Running migrations is intentionally NOT done here: Vercel functions are
serverless and short-lived, so schema changes must be applied once with
``alembic upgrade head`` against the production database beforehand.
"""

from app.main import app  # noqa: F401
