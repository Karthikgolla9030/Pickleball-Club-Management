"""
Aught2 Pickleball — Database Configuration
SQLAlchemy 2.x style with async engine and session factory.
Tables are NEVER created here — use Alembic migrations.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy models."""
    pass


def _build_engine() -> any:
    settings = get_settings()
    engine_kwargs: dict = {
        "echo": settings.is_development,
        "pool_pre_ping": True,
    }
    if "sqlite" not in settings.DATABASE_URL:
        engine_kwargs.update({
            "pool_size": 10,
            "max_overflow": 20,
            "pool_recycle": 300,
        })
    return create_async_engine(
        settings.DATABASE_URL,
        **engine_kwargs,
    )


engine = _build_engine()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an async database session.
    Use in route handlers:

        async def my_route(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
