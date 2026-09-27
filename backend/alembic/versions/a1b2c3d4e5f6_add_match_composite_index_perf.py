"""add_match_composite_index_perf

Adds a composite index on matches(tournament_id, status) to speed up:
- Score-saving tournament completion checks (filter by tournament + status)
- Count queries for completed/pending matches

Revision ID: a1b2c3d4e5f6
Revises: e95931ed95a2
Create Date: 2026-09-27 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'e95931ed95a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Composite index on tournament_id + status for:
    # 1. list_match_statuses_by_tournament (completion checks on every score save)
    # 2. count_completed_matches() — filters by tournament + status
    op.create_index(
        'ix_matches_tournament_status',
        'matches',
        ['tournament_id', 'status'],
        unique=False,
    )
    # Composite index on tournament_id + stage for:
    # 1. list_matches_by_stage() used in pool_play completion checks
    # 2. count_completed_matches_by_stage() / count_matches_by_stage()
    op.create_index(
        'ix_matches_tournament_stage',
        'matches',
        ['tournament_id', 'stage'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_matches_tournament_stage', table_name='matches')
    op.drop_index('ix_matches_tournament_status', table_name='matches')
