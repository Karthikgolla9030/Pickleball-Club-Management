"""add_guest_name_and_nullable_membership_to_team_members

Revision ID: d4e5f6a7b8c9
Revises: b2c3d4e5f6a7
Create Date: 2026-09-28 01:45:00.000000

Supports guest / manual doubles partners in team competitions (leagues/tournaments):
1. team_members.player_membership_id: altered to nullable=True
2. team_members.guest_name: String(255), nullable=True
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    cols = [c['name'] for c in insp.get_columns('team_members')]
    
    # 1. Add guest_name if not exists
    if 'guest_name' not in cols:
        op.add_column(
            'team_members',
            sa.Column('guest_name', sa.String(255), nullable=True),
        )

    # 2. Make player_membership_id nullable
    op.alter_column(
        'team_members',
        'player_membership_id',
        existing_type=UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'team_members',
        'player_membership_id',
        existing_type=UUID(as_uuid=True),
        nullable=False,
    )
    op.drop_column('team_members', 'guest_name')
