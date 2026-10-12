"""add_operating_hours_to_clubs_and_courts

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-10-12 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clubs', sa.Column('operating_hours', sa.JSON(), nullable=True))
    op.add_column('courts', sa.Column('operating_hours', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('courts', 'operating_hours')
    op.drop_column('clubs', 'operating_hours')
