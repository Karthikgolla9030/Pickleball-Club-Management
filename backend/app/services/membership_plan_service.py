"""
Aught2 Pickleball — Membership Plan Service (Phase 12)

Business logic for membership plan lifecycle:
  - Create, read, update plans
  - Activate/deactivate plans
  - Centralized duration calculation (calendar-correct via relativedelta)

INVARIANTS enforced here:
  - Plan belongs to exactly one club (club_id is immutable after creation).
  - Inactive plans cannot receive new subscriptions (enforced in subscription service).
  - Existing active subscriptions remain valid when plan is deactivated.
  - Duration arithmetic uses calendar months (never 30-day approximations).
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import PlanDurationUnit, PlanStatus
from app.repositories.club_repository import ClubRepository
from app.repositories.membership_plan_repository import MembershipPlanRepository
from app.schemas.membership import (
    MembershipPlanCreate,
    MembershipPlanDetailResponse,
    MembershipPlanResponse,
    MembershipPlanUpdate,
)


class MembershipPlanService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.plan_repo = MembershipPlanRepository(db)
        self.club_repo = ClubRepository(db)

    # ─── Duration Math ────────────────────────────────────────────────────────

    @staticmethod
    def calculate_end_date(start: date, unit: PlanDurationUnit) -> date:
        """
        Calculate subscription end date using calendar-correct arithmetic.

        Uses dateutil.relativedelta — never assumes month = 30 days.

        Examples:
          monthly:   2026-01-01 → 2026-01-31
          quarterly: 2026-01-01 → 2026-03-31
          yearly:    2026-01-01 → 2026-12-31
        """
        return start + relativedelta(months=unit.months) - relativedelta(days=1)

    # ─── Plan CRUD ────────────────────────────────────────────────────────────

    async def create_plan(
        self,
        club_id: UUID,
        payload: MembershipPlanCreate,
    ) -> MembershipPlanResponse:
        """Create a new membership plan. Requires manage_memberships permission."""
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found or inactive",
            )

        plan = await self.plan_repo.create(
            club_id=club_id,
            name=payload.name,
            description=payload.description,
            duration_unit=payload.duration_unit,
            price=float(payload.price),
            currency=payload.currency,
            benefits=payload.benefits,
            booking_limit=payload.booking_limit,
            advance_booking_days=payload.advance_booking_days,
        )
        return MembershipPlanResponse.from_orm_with_status(plan)

    async def get_plan(
        self,
        club_id: UUID,
        plan_id: UUID,
    ) -> MembershipPlanDetailResponse:
        """Retrieve a plan with its subscriber count."""
        plan = await self.plan_repo.get_by_id(plan_id=plan_id, club_id=club_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership plan not found in this club",
            )
        subscriber_count = await self.plan_repo.count_active_subscriptions(plan_id)
        return MembershipPlanDetailResponse.from_orm_with_count(plan, subscriber_count)

    async def list_plans(
        self,
        club_id: UUID,
        status: PlanStatus | None = None,
    ) -> list[MembershipPlanResponse]:
        """List all plans for a club."""
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found or inactive",
            )
        plans = await self.plan_repo.list_by_club(club_id=club_id, status=status)
        return [MembershipPlanResponse.from_orm_with_status(p) for p in plans]

    async def update_plan(
        self,
        club_id: UUID,
        plan_id: UUID,
        payload: MembershipPlanUpdate,
    ) -> MembershipPlanResponse:
        """
        Update plan fields.
        club_id is immutable — it cannot be changed.
        Historical subscriptions remain linked to their original plan.
        """
        plan = await self.plan_repo.get_by_id(plan_id=plan_id, club_id=club_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership plan not found in this club",
            )

        # Build kwargs only for explicitly set fields
        kwargs: dict = {}
        if payload.name is not None:
            kwargs["name"] = payload.name
        if payload.description is not None:
            kwargs["description"] = payload.description
        if payload.duration_unit is not None:
            kwargs["duration_unit"] = payload.duration_unit
        if payload.price is not None:
            kwargs["price"] = float(payload.price)
        if payload.currency is not None:
            kwargs["currency"] = payload.currency
        if payload.benefits is not None:
            kwargs["benefits"] = payload.benefits
        if payload.booking_limit is not None:
            kwargs["booking_limit"] = payload.booking_limit
        if payload.advance_booking_days is not None:
            kwargs["advance_booking_days"] = payload.advance_booking_days
        if payload.status is not None:
            kwargs["status"] = payload.status

        updated = await self.plan_repo.update(plan, **kwargs)
        return MembershipPlanResponse.from_orm_with_status(updated)

    async def deactivate_plan(
        self,
        club_id: UUID,
        plan_id: UUID,
    ) -> MembershipPlanResponse:
        """
        Deactivate a plan.
        INVARIANT: existing active subscriptions remain valid.
        New subscriptions cannot be created for an inactive plan.
        """
        plan = await self.plan_repo.get_by_id(plan_id=plan_id, club_id=club_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership plan not found in this club",
            )
        if plan.status == PlanStatus.INACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Plan is already inactive",
            )
        updated = await self.plan_repo.update(plan, status=PlanStatus.INACTIVE)
        return MembershipPlanResponse.from_orm_with_status(updated)

    async def reactivate_plan(
        self,
        club_id: UUID,
        plan_id: UUID,
    ) -> MembershipPlanResponse:
        """Reactivate an inactive plan, allowing new subscriptions."""
        plan = await self.plan_repo.get_by_id(plan_id=plan_id, club_id=club_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership plan not found in this club",
            )
        if plan.status == PlanStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Plan is already active",
            )
        updated = await self.plan_repo.update(plan, status=PlanStatus.ACTIVE)
        return MembershipPlanResponse.from_orm_with_status(updated)
