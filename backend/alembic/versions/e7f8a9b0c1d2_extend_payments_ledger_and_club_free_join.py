"""extend payments ledger and club free join

Revision ID: e7f8a9b0c1d2
Revises: f7b8c9d0e1f2
Create Date: 2026-10-27 21:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'f7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Add allows_free_join to clubs
    club_cols = [c['name'] for c in insp.get_columns('clubs')]
    if 'allows_free_join' not in club_cols:
        op.add_column(
            'clubs',
            sa.Column('allows_free_join', sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    # 2. Add Enum values for payment_purpose if PostgreSQL
    if bind.dialect.name == 'postgresql':
        for purpose_val in ('COURT_BOOKING', 'TOURNAMENT', 'LEAGUE', 'EVENT', 'LESSON'):
            op.execute(f"ALTER TYPE payment_purpose ADD VALUE IF NOT EXISTS '{purpose_val}'")

    # 3. Add canonical payment relations and refund fields to payments
    payment_cols = [c['name'] for c in insp.get_columns('payments')]

    if 'booking_id' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('booking_id', sa.UUID(), sa.ForeignKey('bookings.id', ondelete='SET NULL'), nullable=True),
        )
        op.create_index(op.f('ix_payments_booking_id'), 'payments', ['booking_id'], unique=False)

    if 'tournament_id' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('tournament_id', sa.UUID(), sa.ForeignKey('tournaments.id', ondelete='SET NULL'), nullable=True),
        )
        op.create_index(op.f('ix_payments_tournament_id'), 'payments', ['tournament_id'], unique=False)

    if 'event_id' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('event_id', sa.UUID(), sa.ForeignKey('events.id', ondelete='SET NULL'), nullable=True),
        )
        op.create_index(op.f('ix_payments_event_id'), 'payments', ['event_id'], unique=False)

    if 'lesson_id' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('lesson_id', sa.UUID(), sa.ForeignKey('lessons.id', ondelete='SET NULL'), nullable=True),
        )
        op.create_index(op.f('ix_payments_lesson_id'), 'payments', ['lesson_id'], unique=False)

    if 'league_id' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('league_id', sa.UUID(), sa.ForeignKey('leagues.id', ondelete='SET NULL'), nullable=True),
        )
        op.create_index(op.f('ix_payments_league_id'), 'payments', ['league_id'], unique=False)

    if 'refunded_amount' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('refunded_amount', sa.Numeric(10, 2), nullable=True),
        )

    if 'refund_reason' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('refund_reason', sa.Text(), nullable=True),
        )

    if 'refunded_at' not in payment_cols:
        op.add_column(
            'payments',
            sa.Column('refunded_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    payment_cols = [c['name'] for c in insp.get_columns('payments')]
    for col in ('refunded_at', 'refund_reason', 'refunded_amount', 'league_id', 'lesson_id', 'event_id', 'tournament_id', 'booking_id'):
        if col in payment_cols:
            op.drop_column('payments', col)

    club_cols = [c['name'] for c in insp.get_columns('clubs')]
    if 'allows_free_join' in club_cols:
        op.drop_column('clubs', 'allows_free_join')
