"""ClubMembership repository — database query layer."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_membership import ClubMembership, ClubRole


class ClubMembershipRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, membership_id: UUID) -> ClubMembership | None:
        """Get membership by its UUID primary key, loading club and user."""
        result = await self.db.execute(
            select(ClubMembership)
            .options(
                selectinload(ClubMembership.club),
                selectinload(ClubMembership.user),
            )
            .where(ClubMembership.id == membership_id)
        )
        return result.scalar_one_or_none()

    async def get_user_memberships(
        self, user_id: UUID, include_inactive: bool = False
    ) -> list[ClubMembership]:
        """Get all club memberships for a user, with club data loaded."""
        stmt = (
            select(ClubMembership)
            .options(selectinload(ClubMembership.club))
            .where(ClubMembership.user_id == user_id)
        )
        if not include_inactive:
            stmt = stmt.where(ClubMembership.is_active == True)  # noqa: E712

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_user_and_club(
        self, user_id: UUID, club_id: UUID, include_inactive: bool = False
    ) -> ClubMembership | None:
        """Get membership for a specific user and club."""
        stmt = (
            select(ClubMembership)
            .options(
                selectinload(ClubMembership.club),
                selectinload(ClubMembership.user),
            )
            .where(
                ClubMembership.user_id == user_id,
                ClubMembership.club_id == club_id,
            )
        )
        if not include_inactive:
            stmt = stmt.where(ClubMembership.is_active == True)  # noqa: E712

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: UUID,
        club_id: UUID,
        role: ClubRole,
        is_active: bool = True,
    ) -> ClubMembership:
        """Create and persist a new club membership."""
        membership = ClubMembership(
            user_id=user_id,
            club_id=club_id,
            role=role,
            is_active=is_active,
        )
        self.db.add(membership)
        await self.db.flush()
        # Reload relationships
        return await self.get_by_id(membership.id) or membership

    async def get_club_members(
        self, club_id: UUID, include_inactive: bool = True
    ) -> list[ClubMembership]:
        """Get all members of a club, loading the user profile."""
        stmt = (
            select(ClubMembership)
            .options(selectinload(ClubMembership.user))
            .where(ClubMembership.club_id == club_id)
            .order_by(ClubMembership.created_at)
        )
        if not include_inactive:
            stmt = stmt.where(ClubMembership.is_active == True)  # noqa: E712

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_active_owners(self, club_id: UUID) -> int:
        """Count active owners for a club (used by owner safety rules)."""
        result = await self.db.execute(
            select(func.count(ClubMembership.id)).where(
                ClubMembership.club_id == club_id,
                ClubMembership.role == ClubRole.CLUB_OWNER,
                ClubMembership.is_active == True,  # noqa: E712
            )
        )
        return result.scalar() or 0

    async def update(
        self,
        membership: ClubMembership,
        role: ClubRole | None = None,
        is_active: bool | None = None,
    ) -> ClubMembership:
        """Update role and/or is_active status of a membership."""
        if role is not None:
            membership.role = role
        if is_active is not None:
            membership.is_active = is_active
        await self.db.flush()
        return await self.get_by_id(membership.id) or membership

    async def deactivate(self, membership: ClubMembership) -> ClubMembership:
        """Soft-deactivate a membership (is_active = False)."""
        membership.is_active = False
        await self.db.flush()
        return await self.get_by_id(membership.id) or membership
