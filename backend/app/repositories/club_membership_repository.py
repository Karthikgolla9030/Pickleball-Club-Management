"""ClubMembership repository — database query layer."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_membership import ClubMembership, ClubRole


class ClubMembershipRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_user_memberships(self, user_id: UUID) -> list[ClubMembership]:
        """Get all active club memberships for a user, with club data loaded."""
        result = await self.db.execute(
            select(ClubMembership)
            .options(selectinload(ClubMembership.club))
            .where(
                ClubMembership.user_id == user_id,
                ClubMembership.is_active == True,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def get_by_user_and_club(
        self, user_id: UUID, club_id: UUID
    ) -> ClubMembership | None:
        result = await self.db.execute(
            select(ClubMembership)
            .options(selectinload(ClubMembership.club))
            .where(
                ClubMembership.user_id == user_id,
                ClubMembership.club_id == club_id,
                ClubMembership.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: UUID,
        club_id: UUID,
        role: ClubRole,
    ) -> ClubMembership:
        membership = ClubMembership(
            user_id=user_id,
            club_id=club_id,
            role=role,
        )
        self.db.add(membership)
        await self.db.flush()
        await self.db.refresh(membership)
        return membership

    async def get_club_members(self, club_id: UUID) -> list[ClubMembership]:
        result = await self.db.execute(
            select(ClubMembership)
            .options(selectinload(ClubMembership.user))
            .where(
                ClubMembership.club_id == club_id,
                ClubMembership.is_active == True,  # noqa: E712
            )
        )
        return list(result.scalars().all())
