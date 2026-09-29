"""FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload

Production deployments should run migrations with `alembic upgrade head`
before starting the server, then run this module against PostgreSQL.

In ``ENVIRONMENT=production`` the app can ALSO serve the built frontend (the
Vite ``frontend/dist`` folder) so a self-hosted/docker deployment runs as a
SINGLE service on one origin/domain. That folder is set by ``FRONTEND_DIST``
(default: the repo's ``frontend/dist``).

On Vercel this fallback is normally unused: `vercel.json` makes Vercel build
``frontend/`` and serve ``frontend/dist`` from its static CDN, rewriting only
``/api/*`` and ``/healthz`` to this application. That is deliberate — serving
the SPA shell from the CDN gives ``index.html`` the correct
``cache-control: public, max-age=0, must-revalidate`` semantics, which is what
prevents browsers (mobile ones in particular) from pinning a stale
``index.html`` that points at asset hashes which no longer exist.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .api import auth_router, student_router, teacher_router
from .db.session import engine
from .core.config import get_settings
from .core.exceptions import AppError

settings = get_settings()

logger = logging.getLogger("app")


def _json_error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message, "detail": message},
    )


def _error_response(exc: AppError) -> JSONResponse:
    return _json_error(exc.status_code, exc.code, exc.message)


def _frontend_dist() -> Path | None:
    """Resolve the built frontend directory, or None if it should not be served."""
    if not settings.is_production:
        return None
    if settings.frontend_dist:
        candidates = [Path(settings.frontend_dist)]
    else:
        # Default: <repo root>/frontend/dist (two levels above the app package).
        # The legacy repo-root `dist/` is kept as a fallback for old checkouts.
        root = Path(__file__).resolve().parents[2]
        candidates = [root / "frontend" / "dist", root / "dist"]
    for p in candidates:
        if (p / "index.html").is_file():
            return p
    return None


# The SPA shell must never be cached without revalidation: its <script> tag
# points at a content-hashed bundle that disappears on the next deploy. A
# heuristically cached index.html is exactly what turns a new deploy into a
# blank page (HTML 200 + JS/CSS 404) on browsers that are hard to hard-refresh.
_HTML_NO_CACHE = {"Cache-Control": "no-cache, must-revalidate"}



def _mount_frontend(app: FastAPI) -> None:
    """Serve the built SPA so UI + API live on one origin (single project)."""
    dist = _frontend_dist()
    if dist is None:
        return
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # Never let the SPA fallback swallow API / health paths.
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse(
                status_code=404,
                content={"code": "not_found", "message": "Not found", "detail": "Not found"},
            )
        if full_path and full_path != "index.html":
            candidate = dist / full_path
            if candidate.is_file():
                return FileResponse(candidate)
        index = dist / "index.html"
        if index.is_file():
            return FileResponse(index, headers=_HTML_NO_CACHE)
        return JSONResponse(
            status_code=404,
            content={"code": "not_found", "message": "Not found", "detail": "Not found"},
        )


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Test Yourself — real full-stack online examination platform for Ms Eman Zahy.",
    )

    origins = settings.cors_origins
    if settings.debug:
        origins = [*origins, "*"]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):  # noqa: ARG001
        return _error_response(exc)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):  # noqa: ARG001
        # FastAPI's default 422 body is a list under `detail`, which the SPA
        # renders as an unhelpful "[object Object]". Return a clean, safe
        # message (e.g. missing email/password) with the standard error shape.
        errors = exc.errors()
        try:
            first = errors[0]
            loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
            reason = first.get("msg", "Invalid request.")
            message = f"{loc}: {reason}" if loc else reason
        except (IndexError, KeyError, TypeError):
            message = "Invalid request."
        return JSONResponse(
            status_code=422,
            content={
                "code": "validation_error",
                "message": message,
                "detail": errors,
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error_handler(request: Request, exc: SQLAlchemyError):
        # The database is unreachable, misconfigured, or not migrated (e.g. a
        # missing `teachers` table). This is the classic opaque-500 login
        # failure. Log the real error server-side; hand the client a safe,
        # actionable 503 instead of an unexplained 500.
        logger.exception(
            "Database error on %s %s: %s",
            request.method,
            request.url.path,
            exc.__class__.__name__,
        )
        return _json_error(
            503,
            "database_unavailable",
            "The service is temporarily unavailable due to a database error. "
            "Please try again shortly.",
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        # Last-resort safety net: never leak a stack trace or internal detail
        # to the client, but ALWAYS log the full exception for diagnosis.
        logger.exception(
            "Unhandled error on %s %s: %s",
            request.method,
            request.url.path,
            exc.__class__.__name__,
        )
        return _json_error(
            500,
            "internal_error",
            "An unexpected error occurred. Please try again.",
        )

    @app.get("/healthz")
    def healthz():
        """Readiness check: prove the configured database is reachable.

        This intentionally performs a harmless query so a green production
        health check cannot mask a missing, unreachable, or suspended Neon
        database. SQLAlchemyError is converted by the global safe 503 handler.
        """
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "service": settings.app_name, "database": "ok"}

    app.include_router(auth_router, prefix=settings.api_prefix)
    app.include_router(teacher_router, prefix=settings.api_prefix)
    app.include_router(student_router)

    # Serve the built SPA after API routers so /api wins (single-project mode).
    _mount_frontend(app)

    return app


app = create_app()
