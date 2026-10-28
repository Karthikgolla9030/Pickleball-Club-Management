"""add club branding defaults and owner banner

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-10-28 12:15:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_COLUMNS = [
    ("owner_banner_url", sa.String(length=1000)),
    ("default_tournament_round_robin_url", sa.String(length=1000)),
    ("default_tournament_scramble_url", sa.String(length=1000)),
    ("default_tournament_pool_play_url", sa.String(length=1000)),
    ("default_tournament_bracket_url", sa.String(length=1000)),
    ("default_league_banner_url", sa.String(length=1000)),
    ("default_event_banner_url", sa.String(length=1000)),
    ("default_lesson_banner_url", sa.String(length=1000)),
]


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("clubs")}

    for col_name, col_type in NEW_COLUMNS:
        if col_name not in existing_cols:
            op.add_column("clubs", sa.Column(col_name, col_type, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("clubs")}

    for col_name, _ in NEW_COLUMNS:
        if col_name in existing_cols:
            op.drop_column("clubs", col_name)
