"""add club tournament configuration

Revision ID: f4c5d6e7f8a9
Revises: f3c4d5e6f7b3
Create Date: 2026-11-17 14:50:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4c5d6e7f8a9'
down_revision: Union[str, None] = 'f3c4d5e6f7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("clubs")}

    if "tournament_configuration" not in existing_cols:
        op.add_column("clubs", sa.Column("tournament_configuration", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("clubs")}

    if "tournament_configuration" in existing_cols:
        op.drop_column("clubs", "tournament_configuration")
