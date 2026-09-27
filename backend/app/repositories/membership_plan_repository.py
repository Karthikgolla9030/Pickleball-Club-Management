"""
Aught2 Pickleball — MembershipPlan Repository (Phase 12)

Database access layer for membership plan CRUD, listing, and subscriber counts.
Strictly scoped by club (tenant isolation is mandatory).
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.membership import MembershipPlan, MemberSubscription, PlanStatus, SubscriptionStatus


class MembershipPlanRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(
        self,
        plan_id: UUID,
        club_id: UUID | None = None,
    ) -> MembershipPlan | None:
        """Fetch plan by ID; optionally scope to club for tenant isolation."""
        stmt = (
            select(MembershipPlan)
            .options(selectinload(MembershipPlan.club))
            .where(MembershipPlan.id == plan_id)
        )
        if club_id is not None:
            stmt = stmt.where(MembershipPlan.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_club(
        self,
        club_id: UUID,
        status: PlanStatus | None = None,
    ) -> list[MembershipPlan]:
        """List all plans for a club, optionally filtered by status."""
        stmt = (
            select(MembershipPlan)
            .where(MembershipPlan.club_id == club_id)
            .order_by(MembershipPlan.created_at.asc())
        )
        if status is not None:
            stmt = stmt.where(MembershipPlan.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_active_subscriptions(self, plan_id: UUID) -> int:
        """Count subscriptions in active or scheduled state for a plan."""
        stmt = select(func.count()).where(
            MemberSubscription.membership_plan_id == plan_id,
            MemberSubscription.status.in_(
                [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED]
            ),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def create(
        self,
        club_id: UUID,
        name: str,
        duration_unit: str,
        price: float,
        currency: str = "INR",
        description: str | None = None,
        benefits: list | None = None,
        booking_limit: int | None = None,
        advance_booking_days: int | None = None,
        status: PlanStatus = PlanStatus.ACTIVE,
    ) -> MembershipPlan:
        plan = MembershipPlan(
            club_id=club_id,
            name=name,
            description=description,
            status=status,
            duration_unit=duration_unit,
            price=price,
            currency=currency,
            benefits=benefits or [],
            booking_limit=booking_limit,
            advance_booking_days=advance_booking_days,
        )
        self.db.add(plan)
        await self.db.flush()
        return await self.get_by_id(plan.id) or plan

    async def update(
        self,
        plan: MembershipPlan,
        name: str | None = None,
        description: str | None = None,
        duration_unit: str | None = None,
        price: float | None = None,
        currency: str | None = None,
        benefits: list | None = None,
        booking_limit: int | None = None,
        advance_booking_days: int | None = None,
        status: PlanStatus | None = None,
    ) -> MembershipPlan:
        if name is not None:
            plan.name = name
        if description is not None:
            plan.description = description
        if duration_unit is not None:
            plan.duration_unit = duration_unit
        if price is not None:
            plan.price = price
        if currency is not None:
            plan.currency = currency
        if benefits is not None:
            plan.benefits = benefits
        if booking_limit is not None:
            plan.booking_limit = booking_limit
        if advance_booking_days is not None:
            plan.advance_booking_days = advance_booking_days
        if status is not None:
            plan.status = status
        await self.db.flush()
        return await self.get_by_id(plan.id) or plan
