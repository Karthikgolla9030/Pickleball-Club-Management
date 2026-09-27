"""add_court_pricing_and_booking_snapshots

Revision ID: b2c3d4e5f6a7
Revises: 99f115e543e9
Create Date: 2026-09-27 20:15:00.000000

Adds court-specific pricing:
1. courts.price_per_hour: Decimal (Numeric(10, 2)), nullable=True
   Configurable hourly court rate in INR. Existing courts default to NULL (unpriced).
2. bookings.price_per_hour: Decimal (Numeric(10, 2)), nullable=True
   Historical snapshot of the hourly rate applied at reservation creation time.
3. bookings.total_price: Decimal (Numeric(10, 2)), nullable=True
   Authoritative total booking amount calculated at reservation time.
4. bookings.currency: String(10), nullable=False, server_default='INR'
   Currency code for monetary representation.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = '99f115e543e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Add price_per_hour to courts
    court_cols = [c['name'] for c in insp.get_columns('courts')]
    if 'price_per_hour' not in court_cols:
        op.add_column(
            'courts',
            sa.Column('price_per_hour', sa.Numeric(10, 2), nullable=True),
        )

    # 2. Add pricing snapshot columns to bookings
    booking_cols = [c['name'] for c in insp.get_columns('bookings')]
    if 'price_per_hour' not in booking_cols:
        op.add_column(
            'bookings',
            sa.Column('price_per_hour', sa.Numeric(10, 2), nullable=True),
        )
    if 'total_price' not in booking_cols:
        op.add_column(
            'bookings',
            sa.Column('total_price', sa.Numeric(10, 2), nullable=True),
        )
    if 'currency' not in booking_cols:
        op.add_column(
            'bookings',
            sa.Column('currency', sa.String(10), nullable=False, server_default='INR'),
        )


def downgrade() -> None:
    op.drop_column('bookings', 'currency')
    op.drop_column('bookings', 'total_price')
    op.drop_column('bookings', 'price_per_hour')
    op.drop_column('courts', 'price_per_hour')
