"""add_club_profile_and_location_fields

Revision ID: f1e2d3c4b5a6
Revises: e5f6a7b8c9d0
Create Date: 2026-10-09 11:45:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1e2d3c4b5a6'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new profile, contact, location, and facility columns to clubs table
    op.add_column('clubs', sa.Column('logo_url', sa.String(length=500), nullable=True))
    op.add_column('clubs', sa.Column('short_description', sa.String(length=255), nullable=True))
    op.alter_column('clubs', 'description', type_=sa.String(length=2000), existing_type=sa.String(length=1000), existing_nullable=True)
    
    op.add_column('clubs', sa.Column('contact_email', sa.String(length=255), nullable=True))
    op.add_column('clubs', sa.Column('contact_phone', sa.String(length=50), nullable=True))
    op.add_column('clubs', sa.Column('website', sa.String(length=255), nullable=True))
    op.add_column('clubs', sa.Column('established_year', sa.Integer(), nullable=True))

    op.add_column('clubs', sa.Column('address_line1', sa.String(length=255), nullable=True))
    op.add_column('clubs', sa.Column('address_line2', sa.String(length=255), nullable=True))
    op.add_column('clubs', sa.Column('city', sa.String(length=100), nullable=True))
    op.add_column('clubs', sa.Column('state', sa.String(length=100), nullable=True))
    op.add_column('clubs', sa.Column('postal_code', sa.String(length=20), nullable=True))
    op.add_column('clubs', sa.Column('country', sa.String(length=100), server_default='United States', nullable=True))

    op.add_column('clubs', sa.Column('operating_days', sa.String(length=100), server_default='Monday - Sunday', nullable=True))
    op.add_column('clubs', sa.Column('holiday_closure_notes', sa.String(length=500), nullable=True))
    op.add_column('clubs', sa.Column('facilities_summary', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('clubs', 'facilities_summary')
    op.drop_column('clubs', 'holiday_closure_notes')
    op.drop_column('clubs', 'operating_days')
    op.drop_column('clubs', 'country')
    op.drop_column('clubs', 'postal_code')
    op.drop_column('clubs', 'state')
    op.drop_column('clubs', 'city')
    op.drop_column('clubs', 'address_line2')
    op.drop_column('clubs', 'address_line1')
    op.drop_column('clubs', 'established_year')
    op.drop_column('clubs', 'website')
    op.drop_column('clubs', 'contact_phone')
    op.drop_column('clubs', 'contact_email')
    op.alter_column('clubs', 'description', type_=sa.String(length=1000), existing_type=sa.String(length=2000), existing_nullable=True)
    op.drop_column('clubs', 'short_description')
    op.drop_column('clubs', 'logo_url')
