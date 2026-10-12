"""add_club_membership_requests

Revision ID: a2b3c4d5e6f7
Revises: f1e2d3c4b5a6
Create Date: 2026-10-11 12:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1e2d3c4b5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely create enum in PostgreSQL if it doesn't already exist
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_request_status') THEN
                    CREATE TYPE membership_request_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
                END IF;
            END
            $$;
            """
        )
        membership_request_status = postgresql.ENUM(
            'pending', 'approved', 'rejected', 'withdrawn',
            name='membership_request_status',
            create_type=False,
        )
    else:
        membership_request_status = sa.Enum(
            'pending', 'approved', 'rejected', 'withdrawn',
            name='membership_request_status',
        )

    op.create_table(
        'club_membership_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'club_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('clubs.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'status',
            membership_request_status,
            nullable=False,
            server_default='pending',
        ),
        sa.Column('message', sa.String(length=1000), nullable=True),
        sa.Column('rejection_reason', sa.String(length=500), nullable=True),
        sa.Column(
            'reviewed_by_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index('ix_club_membership_requests_club_id', 'club_membership_requests', ['club_id'])
    op.create_index('ix_club_membership_requests_user_id', 'club_membership_requests', ['user_id'])
    op.create_index('ix_club_membership_requests_status', 'club_membership_requests', ['status'])
    op.create_index(
        'ix_club_membership_requests_club_status',
        'club_membership_requests',
        ['club_id', 'status'],
    )
    op.create_index(
        'ix_club_membership_requests_user_status',
        'club_membership_requests',
        ['user_id', 'status'],
    )


def downgrade() -> None:
    op.drop_index('ix_club_membership_requests_user_status', table_name='club_membership_requests')
    op.drop_index('ix_club_membership_requests_club_status', table_name='club_membership_requests')
    op.drop_index('ix_club_membership_requests_status', table_name='club_membership_requests')
    op.drop_index('ix_club_membership_requests_user_id', table_name='club_membership_requests')
    op.drop_index('ix_club_membership_requests_club_id', table_name='club_membership_requests')
    op.drop_table('club_membership_requests')

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS membership_request_status;")
