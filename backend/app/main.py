"""FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload

Production deployments should run migrations with `alembic upgrade head`
before starting the server, then run this module against PostgreSQL.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import auth_router, student_router, teacher_router
from .core.config import get_settings
from .core.exceptions import AppError

settings = get_settings()


def _error_response(exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message, "detail": exc.message},
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

    return app


app = create_app()
