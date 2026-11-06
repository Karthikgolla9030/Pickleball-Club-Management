"""add club default tournament banner

Revision ID: f3c4d5e6f7b3
Revises: f2c3d4e5f6b2
Create Date: 2026-11-06 14:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3c4d5e6f7b3'
down_revision: Union[str, None] = 'f2c3d4e5f6b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("clubs")}

    if "default_tournament_banner_url" not in existing_cols:
        op.add_column("clubs", sa.Column("default_tournament_banner_url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("clubs")}

    if "default_tournament_banner_url" in existing_cols:
        op.drop_column("clubs", "default_tournament_banner_url")

