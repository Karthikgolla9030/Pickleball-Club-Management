"""
Aught2 Pickleball — Payment Repository (Phase 13)

Database access layer for payments.
All queries enforce tenant isolation (club_id scoping where appropriate).
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.payment import (
    Payment,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
)


class PaymentRepository:
    """Repository for managing Payment persistence."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, payment: Payment) -> Payment:
        """Persist a new Payment record."""
        self.db.add(payment)
        await self.db.flush()
        await self.db.refresh(payment)
        return payment

    async def get_by_id(
        self,
        payment_id: UUID,
        club_id: UUID | None = None,
    ) -> Payment | None:
        """
        Fetch a payment by ID, optionally enforcing club scoping.
        Eagerly loads related models.
        """
        stmt = (
            select(Payment)
            .options(
                selectinload(Payment.club),
                selectinload(Payment.player),
                selectinload(Payment.subscription),
                selectinload(Payment.created_by),
                selectinload(Payment.status_changed_by),
            )
            .where(Payment.id == payment_id)
        )
        if club_id is not None:
            stmt = stmt.where(Payment.club_id == club_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_reference(
        self,
        reference: str,
        club_id: UUID | None = None,
    ) -> Payment | None:
        """Fetch a payment by unique reference."""
        stmt = (
            select(Payment)
            .options(
                selectinload(Payment.club),
                selectinload(Payment.player),
                selectinload(Payment.subscription),
            )
            .where(Payment.reference == reference)
        )
        if club_id is not None:
            stmt = stmt.where(Payment.club_id == club_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_club(
        self,
        club_id: UUID,
        status: PaymentStatus | None = None,
        purpose: PaymentPurpose | None = None,
        player_id: UUID | None = None,
        subscription_id: UUID | None = None,
        payment_method: PaymentMethod | None = None,
        date_from: date | datetime | None = None,
        date_to: date | datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Payment]:
        """
        List payments for a club with optional filtering and ordering (newest first).
        """
        stmt = (
            select(Payment)
            .options(
                selectinload(Payment.player),
                selectinload(Payment.subscription),
            )
            .where(Payment.club_id == club_id)
        )

        if status is not None:
            stmt = stmt.where(Payment.status == status)
        if purpose is not None:
            stmt = stmt.where(Payment.purpose == purpose)
        if player_id is not None:
            stmt = stmt.where(Payment.player_id == player_id)
        if subscription_id is not None:
            stmt = stmt.where(Payment.subscription_id == subscription_id)
        if payment_method is not None:
            stmt = stmt.where(Payment.payment_method == payment_method)

        if date_from is not None:
            if isinstance(date_from, date) and not isinstance(date_from, datetime):
                dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
            else:
                dt_from = date_from
            stmt = stmt.where(Payment.created_at >= dt_from)

        if date_to is not None:
            if isinstance(date_to, date) and not isinstance(date_to, datetime):
                dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
            else:
                dt_to = date_to
            stmt = stmt.where(Payment.created_at <= dt_to)

        stmt = stmt.order_by(Payment.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_player(
        self,
        player_id: UUID,
        status: PaymentStatus | None = None,
        purpose: PaymentPurpose | None = None,
        date_from: date | datetime | None = None,
        date_to: date | datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Payment]:
        """
        List payments for a specific player across clubs (newest first).
        """
        stmt = (
            select(Payment)
            .options(
                selectinload(Payment.club),
                selectinload(Payment.subscription),
            )
            .where(Payment.player_id == player_id)
        )

        if status is not None:
            stmt = stmt.where(Payment.status == status)
        if purpose is not None:
            stmt = stmt.where(Payment.purpose == purpose)

        if date_from is not None:
            if isinstance(date_from, date) and not isinstance(date_from, datetime):
                dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc)
            else:
                dt_from = date_from
            stmt = stmt.where(Payment.created_at >= dt_from)

        if date_to is not None:
            if isinstance(date_to, date) and not isinstance(date_to, datetime):
                dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc)
            else:
                dt_to = date_to
            stmt = stmt.where(Payment.created_at <= dt_to)

        stmt = stmt.order_by(Payment.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_club_summary(self, club_id: UUID) -> dict:
        """
        Calculate aggregated payment metrics for a club:
          - total_count
          - succeeded_count
          - pending_count
          - failed_count
          - total_amount_collected (succeeded only)
        """
        # Count by status
        stmt = (
            select(Payment.status, func.count(Payment.id))
            .where(Payment.club_id == club_id)
            .group_by(Payment.status)
        )
        res = await self.db.execute(stmt)
        counts = dict(res.all())

        total_count = sum(counts.values())
        succeeded_count = counts.get(PaymentStatus.SUCCEEDED, 0)
        pending_count = counts.get(PaymentStatus.PENDING, 0)
        failed_count = counts.get(PaymentStatus.FAILED, 0)

        # Sum of succeeded amounts
        sum_stmt = (
            select(func.coalesce(func.sum(Payment.amount), 0))
            .where(Payment.club_id == club_id)
            .where(Payment.status == PaymentStatus.SUCCEEDED)
        )
        sum_res = await self.db.execute(sum_stmt)
        total_amount = Decimal(str(sum_res.scalar() or 0))

        return {
            "total_count": total_count,
            "succeeded_count": succeeded_count,
            "pending_count": pending_count,
            "failed_count": failed_count,
            "total_amount_collected": total_amount,
            "currency": "INR",
        }

    async def generate_reference(self, year: int | None = None) -> str:
        """
        Generate the next unique reference in format A2P-YYYY-NNNNNN.
        Deterministic, audit-safe, sequential.
        """
        if year is None:
            year = datetime.now(timezone.utc).year

        prefix = f"A2P-{year}-"
        stmt = (
            select(Payment.reference)
            .where(Payment.reference.like(f"{prefix}%"))
            .order_by(Payment.reference.desc())
            .limit(1)
        )
        res = await self.db.execute(stmt)
        last_ref = res.scalar_one_or_none()

        next_seq = 1
        if last_ref:
            try:
                parts = last_ref.split("-")
                if len(parts) == 3:
                    next_seq = int(parts[2]) + 1
            except (ValueError, IndexError):
                next_seq = 1

        return f"A2P-{year}-{next_seq:06d}"
