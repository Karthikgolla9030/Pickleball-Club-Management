"""add court booking interval

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-10-27 22:55:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    courts_cols = [c["name"] for c in insp.get_columns("courts")]
    if "booking_interval_minutes" not in courts_cols:
        op.add_column(
            "courts",
            sa.Column(
                "booking_interval_minutes",
                sa.SmallInteger(),
                nullable=False,
                server_default="60",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    courts_cols = [c["name"] for c in insp.get_columns("courts")]
    if "booking_interval_minutes" in courts_cols:
        op.drop_column("courts", "booking_interval_minutes")
