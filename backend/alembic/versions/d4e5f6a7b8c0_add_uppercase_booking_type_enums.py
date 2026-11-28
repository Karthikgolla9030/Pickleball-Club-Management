"""add uppercase maintenance blocked booking types

Revision ID: d4e5f6a7b8c0
Revises: c9d8e7f6a5b4
Create Date: 2026-11-28 14:38:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op


revision: str = 'd4e5f6a7b8c0'
down_revision: Union[str, None] = 'c9d8e7f6a5b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        for val in ('MAINTENANCE', 'BLOCKED'):
            op.execute(f"ALTER TYPE booking_type ADD VALUE IF NOT EXISTS '{val}'")


def downgrade() -> None:
    pass
