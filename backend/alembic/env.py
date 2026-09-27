"""
Alembic Environment Configuration.
Reads DATABASE_URL from environment variables.
Imports all models so autogenerate can detect schema changes.
"""
from __future__ import annotations

import asyncio
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# ─── Import ALL models so Alembic can detect them ────────────────────────────
# This is the canonical import location — all models must be imported here.
from app.core.config import get_settings
from app.core.database import Base
import app.models  # noqa: F401 — registers all models with Base.metadata

config = context.config

# ─── Load DATABASE_URL from environment / settings (override alembic.ini value) ─
database_url = os.environ.get("DATABASE_URL") or get_settings().DATABASE_URL
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ─── Indexes managed by raw SQL (not autogenerate) ────────────────────────────
# These indexes are created by raw SQL in migrations and must be excluded
# from autogenerate comparison to prevent false positives in `alembic check`.
_EXCLUDED_INDEXES = frozenset({
    "uq_member_subscriptions_one_active_per_player",  # Phase 12 partial unique index
    "uq_bookings_court_no_overlap",                   # Phase 11 GiST exclusion constraint
    "uq_event_registrations_one_active_per_user",     # Phase 14 partial unique index
    "uq_lesson_registrations_one_active_per_user",    # Phase 15 partial unique index
    "uq_matches_court_no_overlap",                   # Phase 17 GiST exclusion constraint
})


def _include_object(object, name, type_, reflected, compare_to):
    """Exclude manually managed DB objects from autogenerate."""
    if type_ == "index" and name in _EXCLUDED_INDEXES:
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection needed)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()



async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    url = config.get_main_option("sqlalchemy.url")
    connectable = create_async_engine(url, poolclass=None)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with async engine."""
    if sys.platform == "win32":
        asyncio.run(
            run_async_migrations(),
            loop_factory=asyncio.SelectorEventLoop,
        )
    else:
        asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
