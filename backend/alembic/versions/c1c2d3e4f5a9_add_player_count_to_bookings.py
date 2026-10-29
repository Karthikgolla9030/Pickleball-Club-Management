"""add player_count to bookings

Revision ID: c1c2d3e4f5a9
Revises: b1c2d3e4f5a8
Create Date: 2026-10-29 12:50:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1c2d3e4f5a9'
down_revision: Union[str, None] = 'b1c2d3e4f5a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "bookings" in tables:
        existing_cols = {c["name"] for c in insp.get_columns("bookings")}
        if "player_count" not in existing_cols:
            op.add_column("bookings", sa.Column("player_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "bookings" in tables:
        existing_cols = {c["name"] for c in insp.get_columns("bookings")}
        if "player_count" in existing_cols:
            op.drop_column("bookings", "player_count")

