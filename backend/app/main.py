"""
Aught2 Pickleball — FastAPI Application Entry Point

IMPORTANT:
  - Tables are NEVER created here. Use Alembic migrations.
  - Debug mode is NEVER enabled from inside the app. Use environment config.
  - Secrets come from environment variables only.
  - CORS is configured from settings — not hardcoded.
"""
from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import api_router
from app.core.config import get_settings

# ─── Logging Setup ────────────────────────────────────────────────────────────
def _configure_logging(log_level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    # Suppress noisy SQLAlchemy echo in production
    if get_settings().is_production:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


logger = logging.getLogger(__name__)


# ─── Lifespan ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup/shutdown lifecycle.
    Does NOT create database tables — that is Alembic's responsibility.
    """
    settings = get_settings()
    _configure_logging(settings.LOG_LEVEL)
    logger.info(
        "Starting %s v%s [%s]",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.APP_ENV,
    )
    yield
    logger.info("Shutting down %s", settings.APP_NAME)


# ─── App Factory ─────────────────────────────────────────────────────────────
def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Aught2 Pickleball Club & Facility Management Platform API",
        lifespan=lifespan,
        # Disable docs in production
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
    )

    # ─── CORS ─────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ─── Routers ──────────────────────────────────────────────────────────────
    app.include_router(api_router)

    # ─── Global Error Handlers ────────────────────────────────────────────────
    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """
        Catch-all handler. Logs the error but NEVER exposes stack traces
        or internal details to clients.
        """
        logger.exception("Unhandled exception on %s %s", request.method, request.url)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An internal server error occurred"},
        )

    # ─── Health Check ─────────────────────────────────────────────────────────
    @app.get("/health", tags=["Health"], include_in_schema=False)
    async def health_check():
        return {"status": "ok", "version": settings.APP_VERSION}

    return app


app = create_app()
