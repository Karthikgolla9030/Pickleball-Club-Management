"""add mobile number test payment enums

Revision ID: a1b2c3d4e5f6
Revises: f4c5d6e7f8a9
Create Date: 2026-11-24 01:45:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b891195a1b2c'
down_revision: Union[str, None] = 'f4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        for val in ('TEST_SUCCESS', 'test_success'):
            op.execute(f"ALTER TYPE payment_status ADD VALUE IF NOT EXISTS '{val}'")
        for val in ('MOBILE_NUMBER_TEST', 'mobile_number_test'):
            op.execute(f"ALTER TYPE payment_method ADD VALUE IF NOT EXISTS '{val}'")


def downgrade() -> None:
    # Postgres enum values cannot be easily removed without recreating the type
    pass
