"""add club_applications table

Revision ID: c1d2e3f4a5b6
Revises: becbd8891115
Create Date: 2026-10-12 18:15:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'becbd8891115'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum type if it does not already exist
    club_app_status = sa.Enum('pending', 'approved', 'rejected', name='club_application_status')

    op.create_table(
        'club_applications',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('reference_number', sa.String(length=32), nullable=False),
        sa.Column('applicant_name', sa.String(length=255), nullable=False),
        sa.Column('applicant_email', sa.String(length=255), nullable=False),
        sa.Column('applicant_phone', sa.String(length=50), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('club_name', sa.String(length=255), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('short_description', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('contact_email', sa.String(length=255), nullable=True),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('website', sa.String(length=255), nullable=True),
        sa.Column('established_year', sa.Integer(), nullable=True),
        sa.Column('address_line1', sa.String(length=255), nullable=True),
        sa.Column('address_line2', sa.String(length=255), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('state', sa.String(length=100), nullable=True),
        sa.Column('postal_code', sa.String(length=20), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=False, server_default='United States'),
        sa.Column('operating_days', sa.String(length=100), nullable=True, server_default='Monday - Sunday'),
        sa.Column('opening_time', sa.Time(), nullable=False, server_default='06:00:00'),
        sa.Column('closing_time', sa.Time(), nullable=False, server_default='22:00:00'),
        sa.Column('timezone', sa.String(length=50), nullable=False, server_default='UTC'),
        sa.Column('facilities_summary', sa.String(length=500), nullable=True),
        sa.Column('status', club_app_status, nullable=False, server_default='pending'),
        sa.Column('rejection_reason', sa.String(length=500), nullable=True),
        sa.Column('reviewed_by_id', sa.UUID(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('club_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reviewed_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['club_id'], ['clubs.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_index(op.f('ix_club_applications_reference_number'), 'club_applications', ['reference_number'], unique=True)
    op.create_index(op.f('ix_club_applications_applicant_email'), 'club_applications', ['applicant_email'], unique=False)
    op.create_index(op.f('ix_club_applications_user_id'), 'club_applications', ['user_id'], unique=False)
    op.create_index(op.f('ix_club_applications_slug'), 'club_applications', ['slug'], unique=False)
    op.create_index(op.f('ix_club_applications_status'), 'club_applications', ['status'], unique=False)
    op.create_index('ix_club_applications_status_created', 'club_applications', ['status', 'created_at'], unique=False)
    op.create_index('ix_club_applications_email_status', 'club_applications', ['applicant_email', 'status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_club_applications_email_status', table_name='club_applications')
    op.drop_index('ix_club_applications_status_created', table_name='club_applications')
    op.drop_index(op.f('ix_club_applications_status'), table_name='club_applications')
    op.drop_index(op.f('ix_club_applications_slug'), table_name='club_applications')
    op.drop_index(op.f('ix_club_applications_user_id'), table_name='club_applications')
    op.drop_index(op.f('ix_club_applications_applicant_email'), table_name='club_applications')
    op.drop_index(op.f('ix_club_applications_reference_number'), table_name='club_applications')
    op.drop_table('club_applications')
    sa.Enum(name='club_application_status').drop(op.get_bind(), checkfirst=True)
