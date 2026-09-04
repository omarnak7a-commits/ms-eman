"""FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload

Production deployments should run migrations with `alembic upgrade head`
before starting the server, then run this module against PostgreSQL.

In ``ENVIRONMENT=production`` the app also serves the built frontend (the Vite
``dist`` folder) so the whole application runs as a SINGLE service on one
origin/domain. That folder is set by ``FRONTEND_DIST`` (default: the repo root's
``dist/``). This lets one Vercel project host both the React UI and the API.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import auth_router, student_router, teacher_router
from .core.config import get_settings
from .core.exceptions import AppError

settings = get_settings()


def _error_response(exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message, "detail": exc.message},
    )


def _frontend_dist() -> Path | None:
    """Resolve the built frontend directory, or None if it should not be served."""
    if not settings.is_production:
        return None
    if settings.frontend_dist:
        p = Path(settings.frontend_dist)
    else:
        # Default: repo-root/dist (one level above the backend package).
        p = Path(__file__).resolve().parents[2] / "dist"
    return p if p.is_dir() else None


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
            return FileResponse(index)
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

    @app.get("/healthz")
    def healthz():
        return {"status": "ok", "service": settings.app_name}

    app.include_router(auth_router, prefix=settings.api_prefix)
    app.include_router(teacher_router, prefix=settings.api_prefix)
    app.include_router(student_router)

    # Serve the built SPA after API routers so /api wins (single-project mode).
    _mount_frontend(app)

    return app


app = create_app()
