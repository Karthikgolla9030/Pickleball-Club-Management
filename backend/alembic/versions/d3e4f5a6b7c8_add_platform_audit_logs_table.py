"""add platform_audit_logs table

Revision ID: d3e4f5a6b7c8
Revises: 6b0b14a41963
Create Date: 2026-10-23 11:42:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = '6b0b14a41963'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'platform_audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('actor_id', sa.UUID(), nullable=True),
        sa.Column('actor_email', sa.String(length=255), nullable=True),
        sa.Column('actor_name', sa.String(length=255), nullable=True),
        sa.Column('action', sa.String(length=64), nullable=False),
        sa.Column('entity_type', sa.String(length=64), nullable=False),
        sa.Column('entity_id', sa.String(length=64), nullable=False),
        sa.Column('entity_name', sa.String(length=255), nullable=True),
        sa.Column('outcome', sa.String(length=32), nullable=False, server_default='success'),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index('ix_platform_audit_logs_id', 'platform_audit_logs', ['id'])
    op.create_index('ix_platform_audit_logs_created_at', 'platform_audit_logs', ['created_at'])
    op.create_index('ix_platform_audit_logs_actor_id', 'platform_audit_logs', ['actor_id'])
    op.create_index('ix_platform_audit_logs_actor_email', 'platform_audit_logs', ['actor_email'])
    op.create_index('ix_platform_audit_logs_action', 'platform_audit_logs', ['action'])
    op.create_index('ix_platform_audit_logs_entity_type', 'platform_audit_logs', ['entity_type'])
    op.create_index('ix_platform_audit_logs_entity_id', 'platform_audit_logs', ['entity_id'])
    op.create_index('ix_platform_audit_logs_outcome', 'platform_audit_logs', ['outcome'])
    op.create_index('ix_platform_audit_logs_created_action', 'platform_audit_logs', ['created_at', 'action'])
    op.create_index('ix_platform_audit_logs_entity', 'platform_audit_logs', ['entity_type', 'entity_id'])
    op.create_index('ix_platform_audit_logs_actor', 'platform_audit_logs', ['actor_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_platform_audit_logs_actor', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_entity', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_created_action', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_outcome', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_entity_id', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_entity_type', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_action', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_actor_email', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_actor_id', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_created_at', table_name='platform_audit_logs')
    op.drop_index('ix_platform_audit_logs_id', table_name='platform_audit_logs')
    op.drop_table('platform_audit_logs')
