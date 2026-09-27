"""add_regular_season_and_playoffs_to_match_stage

Revision ID: c5d312984e1b
Revises: 6d896de56b9d
Create Date: 2026-09-21 21:32:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d312984e1b'
down_revision: Union[str, None] = '6d896de56b9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE match_stage ADD VALUE IF NOT EXISTS 'REGULAR_SEASON'")
    op.execute("ALTER TYPE match_stage ADD VALUE IF NOT EXISTS 'PLAYOFFS'")


def downgrade() -> None:
    pass
