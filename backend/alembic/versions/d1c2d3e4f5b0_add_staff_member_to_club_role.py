"""add staff_member to club_role enum

Revision ID: d1c2d3e4f5b0
Revises: c1c2d3e4f5a9
Create Date: 2026-10-29 13:35:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd1c2d3e4f5b0'
down_revision: Union[str, None] = 'c1c2d3e4f5a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use autocommit_block because ALTER TYPE ... ADD VALUE cannot run inside an active transaction in PostgreSQL
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE club_role ADD VALUE IF NOT EXISTS 'STAFF_MEMBER'")


def downgrade() -> None:
    # PostgreSQL does not support removing values from an existing enum type without recreating it
    pass

