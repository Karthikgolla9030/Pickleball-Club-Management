"""add platform_settings table

Revision ID: f6a7b8c9d1e2
Revises: e5f6a7b8c9d1
Create Date: 2026-10-23 13:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d1e2'
down_revision: Union[str, None] = 'e5f6a7b8c9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'platform_settings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('platform_name', sa.String(length=64), nullable=False, server_default='Aught2 Pickleball'),
        sa.Column('platform_support_email', sa.String(length=255), nullable=False, server_default='support@pickleball.com'),
        sa.Column('allow_new_club_registrations', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('allow_user_registrations', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('maintenance_mode', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('max_upload_size_mb', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_by_email', sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(['updated_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_platform_settings_id', 'platform_settings', ['id'])


def downgrade() -> None:
    op.drop_index('ix_platform_settings_id', table_name='platform_settings')
    op.drop_table('platform_settings')
