"""add_league_dates_fees_and_week_schedule

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-28 02:00:00.000000

Adds league duration, capacity, dates, and week scheduling fields:
1. leagues.max_teams: SmallInteger, nullable=True
2. leagues.registration_fee: Numeric(10, 2), nullable=True
3. leagues.registration_open_at: DateTime(timezone=True), nullable=True
4. leagues.registration_close_at: DateTime(timezone=True), nullable=True
5. leagues.end_date: DateTime(timezone=True), nullable=True
6. league_weeks.start_date: DateTime(timezone=True), nullable=True
7. league_weeks.end_date: DateTime(timezone=True), nullable=True
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    league_cols = [c['name'] for c in insp.get_columns('leagues')]
    if 'max_teams' not in league_cols:
        op.add_column('leagues', sa.Column('max_teams', sa.SmallInteger(), nullable=True))
    if 'registration_fee' not in league_cols:
        op.add_column('leagues', sa.Column('registration_fee', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'registration_open_at' not in league_cols:
        op.add_column('leagues', sa.Column('registration_open_at', sa.DateTime(timezone=True), nullable=True))
    if 'registration_close_at' not in league_cols:
        op.add_column('leagues', sa.Column('registration_close_at', sa.DateTime(timezone=True), nullable=True))
    if 'end_date' not in league_cols:
        op.add_column('leagues', sa.Column('end_date', sa.DateTime(timezone=True), nullable=True))

    week_cols = [c['name'] for c in insp.get_columns('league_weeks')]
    if 'start_date' not in week_cols:
        op.add_column('league_weeks', sa.Column('start_date', sa.DateTime(timezone=True), nullable=True))
    if 'end_date' not in week_cols:
        op.add_column('league_weeks', sa.Column('end_date', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('league_weeks', 'end_date')
    op.drop_column('league_weeks', 'start_date')
    op.drop_column('leagues', 'end_date')
    op.drop_column('leagues', 'registration_close_at')
    op.drop_column('leagues', 'registration_open_at')
    op.drop_column('leagues', 'registration_fee')
    op.drop_column('leagues', 'max_teams')
