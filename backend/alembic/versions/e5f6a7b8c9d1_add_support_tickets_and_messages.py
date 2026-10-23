"""add support_tickets and support_ticket_messages tables

Revision ID: e5f6a7b8c9d1
Revises: d3e4f5a6b7c8
Create Date: 2026-10-23 11:55:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d1'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. support_tickets table
    op.create_table(
        'support_tickets',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('reference_number', sa.String(length=32), nullable=False),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False, server_default='general'),
        sa.Column('priority', sa.String(length=20), nullable=False, server_default='medium'),
        sa.Column('status', sa.String(length=30), nullable=False, server_default='open'),
        sa.Column('requester_id', sa.UUID(), nullable=False),
        sa.Column('requester_email', sa.String(length=255), nullable=False),
        sa.Column('requester_name', sa.String(length=255), nullable=True),
        sa.Column('club_id', sa.UUID(), nullable=True),
        sa.Column('assigned_admin_id', sa.UUID(), nullable=True),
        sa.Column('assigned_admin_email', sa.String(length=255), nullable=True),
        sa.Column('assigned_admin_name', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['requester_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['club_id'], ['clubs.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['assigned_admin_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('reference_number'),
    )

    op.create_index('ix_support_tickets_id', 'support_tickets', ['id'])
    op.create_index('ix_support_tickets_reference_number', 'support_tickets', ['reference_number'])
    op.create_index('ix_support_tickets_status', 'support_tickets', ['status'])
    op.create_index('ix_support_tickets_priority', 'support_tickets', ['priority'])
    op.create_index('ix_support_tickets_category', 'support_tickets', ['category'])
    op.create_index('ix_support_tickets_requester_id', 'support_tickets', ['requester_id'])
    op.create_index('ix_support_tickets_requester_email', 'support_tickets', ['requester_email'])
    op.create_index('ix_support_tickets_club_id', 'support_tickets', ['club_id'])
    op.create_index('ix_support_tickets_assigned_admin_id', 'support_tickets', ['assigned_admin_id'])
    op.create_index('ix_support_tickets_created_at', 'support_tickets', ['created_at'])
    op.create_index('ix_support_tickets_status_priority', 'support_tickets', ['status', 'priority'])
    op.create_index('ix_support_tickets_requester_created', 'support_tickets', ['requester_id', 'created_at'])
    op.create_index('ix_support_tickets_club_created', 'support_tickets', ['club_id', 'created_at'])

    # 2. support_ticket_messages table
    op.create_table(
        'support_ticket_messages',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('ticket_id', sa.UUID(), nullable=False),
        sa.Column('sender_id', sa.UUID(), nullable=True),
        sa.Column('sender_email', sa.String(length=255), nullable=False),
        sa.Column('sender_name', sa.String(length=255), nullable=True),
        sa.Column('sender_role', sa.String(length=30), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index('ix_support_ticket_messages_id', 'support_ticket_messages', ['id'])
    op.create_index('ix_support_ticket_messages_ticket_id', 'support_ticket_messages', ['ticket_id'])
    op.create_index('ix_support_ticket_messages_sender_id', 'support_ticket_messages', ['sender_id'])
    op.create_index('ix_support_ticket_messages_created_at', 'support_ticket_messages', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_support_ticket_messages_created_at', table_name='support_ticket_messages')
    op.drop_index('ix_support_ticket_messages_sender_id', table_name='support_ticket_messages')
    op.drop_index('ix_support_ticket_messages_ticket_id', table_name='support_ticket_messages')
    op.drop_index('ix_support_ticket_messages_id', table_name='support_ticket_messages')
    op.drop_table('support_ticket_messages')

    op.drop_index('ix_support_tickets_club_created', table_name='support_tickets')
    op.drop_index('ix_support_tickets_requester_created', table_name='support_tickets')
    op.drop_index('ix_support_tickets_status_priority', table_name='support_tickets')
    op.drop_index('ix_support_tickets_created_at', table_name='support_tickets')
    op.drop_index('ix_support_tickets_assigned_admin_id', table_name='support_tickets')
    op.drop_index('ix_support_tickets_club_id', table_name='support_tickets')
    op.drop_index('ix_support_tickets_requester_email', table_name='support_tickets')
    op.drop_index('ix_support_tickets_requester_id', table_name='support_tickets')
    op.drop_index('ix_support_tickets_category', table_name='support_tickets')
    op.drop_index('ix_support_tickets_priority', table_name='support_tickets')
    op.drop_index('ix_support_tickets_status', table_name='support_tickets')
    op.drop_index('ix_support_tickets_reference_number', table_name='support_tickets')
    op.drop_index('ix_support_tickets_id', table_name='support_tickets')
    op.drop_table('support_tickets')
