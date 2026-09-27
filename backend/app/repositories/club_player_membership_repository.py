"""ClubPlayerMembership repository — database query layer."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.user import User


class ClubPlayerMembershipRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, membership_id: UUID) -> ClubPlayerMembership | None:
        result = await self.db.execute(
            select(ClubPlayerMembership)
            .options(
                selectinload(ClubPlayerMembership.club),
                selectinload(ClubPlayerMembership.user).selectinload(User.player_profile),
            )
            .where(ClubPlayerMembership.id == membership_id)
        )
        return result.scalar_one_or_none()

    async def get_by_user_and_club(
        self, user_id: UUID, club_id: UUID
    ) -> ClubPlayerMembership | None:
        result = await self.db.execute(
            select(ClubPlayerMembership)
            .options(
                selectinload(ClubPlayerMembership.club),
                selectinload(ClubPlayerMembership.user).selectinload(User.player_profile),
            )
            .where(
                ClubPlayerMembership.user_id == user_id,
                ClubPlayerMembership.club_id == club_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_user_player_memberships(
        self, user_id: UUID
    ) -> list[ClubPlayerMembership]:
        result = await self.db.execute(
            select(ClubPlayerMembership)
            .options(selectinload(ClubPlayerMembership.club))
            .where(ClubPlayerMembership.user_id == user_id)
            .order_by(ClubPlayerMembership.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_club_player_memberships(
        self, club_id: UUID
    ) -> list[ClubPlayerMembership]:
        result = await self.db.execute(
            select(ClubPlayerMembership)
            .options(
                selectinload(ClubPlayerMembership.user).selectinload(User.player_profile)
            )
            .where(ClubPlayerMembership.club_id == club_id)
            .order_by(ClubPlayerMembership.created_at.desc())
        )
        return list(result.scalars().all())

    async def create(
        self,
        user_id: UUID,
        club_id: UUID,
        status: PlayerMembershipStatus = PlayerMembershipStatus.ACTIVE,
        membership_number: str | None = None,
        joined_at: datetime | None = None,
        expires_at: datetime | None = None,
    ) -> ClubPlayerMembership:
        kwargs = {
            "user_id": user_id,
            "club_id": club_id,
            "status": status,
            "membership_number": membership_number,
        }
        if joined_at is not None:
            kwargs["joined_at"] = joined_at
        if expires_at is not None:
            kwargs["expires_at"] = expires_at

        membership = ClubPlayerMembership(**kwargs)
        self.db.add(membership)
        await self.db.flush()
        return await self.get_by_id(membership.id) or membership

    async def update(
        self,
        membership: ClubPlayerMembership,
        status: PlayerMembershipStatus | None = None,
        membership_number: str | None = None,
        expires_at: datetime | None = None,
    ) -> ClubPlayerMembership:
        if status is not None:
            membership.status = status
        if membership_number is not None:
            membership.membership_number = membership_number
        if expires_at is not None:
            membership.expires_at = expires_at

        await self.db.flush()
        return await self.get_by_id(membership.id) or membership
