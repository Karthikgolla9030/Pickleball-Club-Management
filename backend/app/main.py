"""
Aught2 Pickleball — FastAPI Application Entry Point

IMPORTANT:
  - Tables are NEVER created here. Use Alembic migrations.
  - Debug mode is NEVER enabled from inside the app. Use environment config.
  - Secrets come from environment variables only.
  - CORS is configured from settings — not hardcoded.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

# On Windows, psycopg async mode requires the Selector event loop policy
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Allow .local domain for development / demo seed accounts
try:
    import email_validator
    if "local" in email_validator.SPECIAL_USE_DOMAIN_NAMES:
        email_validator.SPECIAL_USE_DOMAIN_NAMES.remove("local")
except Exception:
    pass

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


# ─── Database Migrations ──────────────────────────────────────────────────────
def _run_db_migrations() -> None:
    """
    Apply any pending Alembic migrations on startup.
    Ensures cloud databases (e.g. Render PostgreSQL) stay synchronized with schema changes.
    """
    try:
        from pathlib import Path
        from alembic import command
        from alembic.config import Config

        backend_dir = Path(__file__).resolve().parent.parent
        alembic_ini_path = backend_dir / "alembic.ini"
        if not alembic_ini_path.exists():
            logger.warning("alembic.ini not found at %s; skipping auto-migration", alembic_ini_path)
            return

        alembic_cfg = Config(str(alembic_ini_path))
        alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
        settings = get_settings()
        if settings.DATABASE_URL:
            alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

        logger.info("Applying pending database migrations (alembic upgrade head)...")
        command.upgrade(alembic_cfg, "head")
        logger.info("Database migrations applied successfully to head.")
    except Exception as exc:
        logger.error("Database migration check failed on startup: %s", exc, exc_info=True)


# ─── Lifespan ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup/shutdown lifecycle.
    Automatically applies pending Alembic migrations to ensure the database schema matches models.
    """
    settings = get_settings()
    _configure_logging(settings.LOG_LEVEL)
    logger.info(
        "Starting %s v%s [%s]",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.APP_ENV,
    )
    # Apply database migrations in a worker thread so the async event loop is not blocked
    await asyncio.to_thread(_run_db_migrations)

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
    if settings.is_development:
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=r"^https?://.*",
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    else:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ORIGINS,
            allow_origin_regex=r"^https?://([a-zA-Z0-9-]+\.)*vercel\.app$",
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # ─── Static Files for Uploads ─────────────────────────────────────────────
    import os
    from fastapi.staticfiles import StaticFiles

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    uploads_dir = os.path.join(backend_dir, "uploads")
    os.makedirs(os.path.join(uploads_dir, "avatars"), exist_ok=True)
    os.makedirs(os.path.join(uploads_dir, "logos"), exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

    # ─── Routers ──────────────────────────────────────────────────────────────
    app.include_router(api_router)

    # ─── Global Error Handlers ────────────────────────────────────────────────
    def _build_cors_headers(request: Request) -> dict[str, str]:
        origin = request.headers.get("origin")
        if not origin:
            return {}
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
            "Vary": "Origin",
        }

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """
        Catch-all handler. Logs the error and returns JSONResponse with explicit CORS headers
        so browsers never misinterpret an unhandled server error as a CORS policy violation.
        """
        logger.exception("Unhandled exception on %s %s: %s", request.method, request.url, exc)
        headers = _build_cors_headers(request)
        detail = "An internal server error occurred"
        if not settings.is_production:
            detail = f"Internal server error: {type(exc).__name__}: {str(exc)}"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": detail},
            headers=headers,
        )

    # ─── Health & Root ────────────────────────────────────────────────────────
    @app.get("/", tags=["Root"], include_in_schema=False)
    async def root():
        return {
            "name": settings.APP_NAME,
            "status": "online",
            "version": settings.APP_VERSION,
        }

    @app.get("/health", tags=["Health"], include_in_schema=False)
    async def health_check():
        db_status = "ok"
        try:
            from sqlalchemy import text
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                await session.execute(text("SELECT 1"))
        except Exception as e:
            db_status = f"error: {str(e)}"
        return {
            "status": "ok" if db_status == "ok" else "degraded",
            "version": settings.APP_VERSION,
            "database": db_status,
        }

    @app.api_route(
        "/api/v1/system/run-migrations",
        methods=["GET", "POST"],
        tags=["System"],
        include_in_schema=False,
    )
    async def run_migrations_endpoint(request: Request):
        """Run pending alembic database migrations on demand."""
        try:
            await asyncio.to_thread(_run_db_migrations)
            return JSONResponse(
                content={"status": "success", "message": "Migrations applied successfully"},
                headers=_build_cors_headers(request),
            )
        except Exception as e:
            return JSONResponse(
                status_code=500,
                content={"status": "error", "message": str(e)},
                headers=_build_cors_headers(request),
            )

    return app


app = create_app()
