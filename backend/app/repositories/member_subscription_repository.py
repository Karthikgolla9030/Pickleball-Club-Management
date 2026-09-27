"""
Aught2 Pickleball — MemberSubscription Repository (Phase 12)

Database access layer for subscription CRUD, lifecycle transitions,
conflict detection, and club/player-scoped lookups.
Tenant isolation: all queries are scoped to club_id.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_player_membership import ClubPlayerMembership
from app.models.membership import (
    MemberSubscription,
    MembershipPlan,
    SubscriptionStatus,
)


class MemberSubscriptionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def _base_query(self):
        return (
            select(MemberSubscription)
            .options(
                selectinload(MemberSubscription.plan),
                selectinload(MemberSubscription.player_membership).selectinload(
                    ClubPlayerMembership.user
                ),
                selectinload(MemberSubscription.club),
            )
        )

    async def get_by_id(
        self,
        subscription_id: UUID,
        club_id: UUID | None = None,
    ) -> MemberSubscription | None:
        stmt = self._base_query().where(MemberSubscription.id == subscription_id)
        if club_id is not None:
            stmt = stmt.where(MemberSubscription.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_for_player_in_club(
        self,
        player_membership_id: UUID,
        club_id: UUID,
    ) -> MemberSubscription | None:
        """
        Return the active (or effectively active) subscription for a player in a club.
        Checks both status=active AND that today is within the date range.
        """
        today = date.today()
        stmt = (
            self._base_query()
            .where(
                MemberSubscription.player_membership_id == player_membership_id,
                MemberSubscription.club_id == club_id,
                MemberSubscription.status == SubscriptionStatus.ACTIVE,
                MemberSubscription.start_date <= today,
                MemberSubscription.end_date >= today,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_or_scheduled_for_player_in_club(
        self,
        player_membership_id: UUID,
        club_id: UUID,
    ) -> MemberSubscription | None:
        """Return any active or scheduled subscription — used for conflict detection."""
        stmt = (
            self._base_query()
            .where(
                MemberSubscription.player_membership_id == player_membership_id,
                MemberSubscription.club_id == club_id,
                MemberSubscription.status.in_(
                    [SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED]
                ),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_club(
        self,
        club_id: UUID,
        player_membership_id: UUID | None = None,
        plan_id: UUID | None = None,
        status: SubscriptionStatus | None = None,
        start_date_from: date | None = None,
        start_date_to: date | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MemberSubscription]:
        """
        List subscriptions for a club with optional filters.
        Supports filtering by player, plan, status, and date range.
        """
        stmt = (
            self._base_query()
            .where(MemberSubscription.club_id == club_id)
            .order_by(MemberSubscription.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if player_membership_id is not None:
            stmt = stmt.where(
                MemberSubscription.player_membership_id == player_membership_id
            )
        if plan_id is not None:
            stmt = stmt.where(MemberSubscription.membership_plan_id == plan_id)
        if status is not None:
            stmt = stmt.where(MemberSubscription.status == status)
        if start_date_from is not None:
            stmt = stmt.where(MemberSubscription.start_date >= start_date_from)
        if start_date_to is not None:
            stmt = stmt.where(MemberSubscription.start_date <= start_date_to)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_user_and_club(
        self,
        user_id: UUID,
        club_id: UUID,
    ) -> MemberSubscription | None:
        """Get the active subscription for a user in a club (via player_membership join)."""
        today = date.today()
        stmt = (
            self._base_query()
            .join(
                ClubPlayerMembership,
                MemberSubscription.player_membership_id == ClubPlayerMembership.id,
            )
            .where(
                ClubPlayerMembership.user_id == user_id,
                MemberSubscription.club_id == club_id,
                MemberSubscription.status == SubscriptionStatus.ACTIVE,
                MemberSubscription.start_date <= today,
                MemberSubscription.end_date >= today,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        club_id: UUID,
        player_membership_id: UUID,
        membership_plan_id: UUID,
        start_date: date,
        end_date: date,
        status: SubscriptionStatus,
        auto_renew: bool = False,
        notes: str | None = None,
    ) -> MemberSubscription:
        sub = MemberSubscription(
            club_id=club_id,
            player_membership_id=player_membership_id,
            membership_plan_id=membership_plan_id,
            start_date=start_date,
            end_date=end_date,
            status=status,
            auto_renew=auto_renew,
            notes=notes,
        )
        self.db.add(sub)
        await self.db.flush()
        return await self.get_by_id(sub.id) or sub

    async def update(
        self,
        sub: MemberSubscription,
        status: SubscriptionStatus | None = None,
        auto_renew: bool | None = None,
        notes: str | None = None,
    ) -> MemberSubscription:
        if status is not None:
            sub.status = status
        if auto_renew is not None:
            sub.auto_renew = auto_renew
        if notes is not None:
            sub.notes = notes
        await self.db.flush()
        return await self.get_by_id(sub.id) or sub
