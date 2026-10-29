"""ClubMembership repository — database query layer."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User


class ClubMembershipRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, membership_id: UUID) -> ClubMembership | None:
        """Get membership by its UUID primary key, loading club, user, and player_profile."""
        result = await self.db.execute(
            select(ClubMembership)
            .options(
                selectinload(ClubMembership.club),
                selectinload(ClubMembership.user).selectinload(User.player_profile),
                selectinload(ClubMembership.custom_role),
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
            .options(
                selectinload(ClubMembership.club),
                selectinload(ClubMembership.custom_role),
            )
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
                selectinload(ClubMembership.user).selectinload(User.player_profile),
                selectinload(ClubMembership.custom_role),
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
        custom_role_id: UUID | None = None,
    ) -> ClubMembership:
        """Create and persist a new club membership."""
        membership = ClubMembership(
            user_id=user_id,
            club_id=club_id,
            role=role,
            is_active=is_active,
            custom_role_id=custom_role_id,
        )
        self.db.add(membership)
        await self.db.flush()
        # Reload relationships
        return await self.get_by_id(membership.id) or membership

    async def get_club_members(
        self, club_id: UUID, include_inactive: bool = True
    ) -> list[ClubMembership]:
        """Get all members of a club, loading the user, player profile, and custom role."""
        stmt = (
            select(ClubMembership)
            .options(
                selectinload(ClubMembership.user).selectinload(User.player_profile),
                selectinload(ClubMembership.custom_role),
            )
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

    async def count_by_custom_role(self, custom_role_id: UUID) -> int:
        """Count staff members assigned to a custom role."""
        result = await self.db.execute(
            select(func.count(ClubMembership.id)).where(
                ClubMembership.custom_role_id == custom_role_id,
            )
        )
        return result.scalar() or 0

    async def reassign_custom_role(
        self,
        club_id: UUID,
        from_role_id: UUID,
        to_role_id: UUID | None = None,
        fallback_role: ClubRole = ClubRole.STAFF_MEMBER,
        target_role: Any = None,
    ) -> int:
        """Reassign all staff members from one custom role to another or fallback role."""
        stmt = (
            select(ClubMembership)
            .where(
                ClubMembership.club_id == club_id,
                ClubMembership.custom_role_id == from_role_id,
            )
        )
        result = await self.db.execute(stmt)
        members = list(result.scalars().all())
        for m in members:
            m.custom_role = target_role
            m.custom_role_id = to_role_id
            if to_role_id is None:
                m.role = fallback_role
        await self.db.flush()
        return len(members)

    async def update(
        self,
        membership: ClubMembership,
        role: ClubRole | None = None,
        is_active: bool | None = None,
        custom_role_id: UUID | None = None,
        clear_custom_role: bool = False,
    ) -> ClubMembership:
        """Update role, custom_role_id, and/or is_active status of a membership."""
        if role is not None:
            membership.role = role
        if is_active is not None:
            membership.is_active = is_active
        if custom_role_id is not None:
            membership.custom_role_id = custom_role_id
        elif clear_custom_role:
            membership.custom_role_id = None
        await self.db.flush()
        return await self.get_by_id(membership.id) or membership

    async def deactivate(self, membership: ClubMembership) -> ClubMembership:
        """Soft-deactivate a membership (is_active = False)."""
        membership.is_active = False
        await self.db.flush()
        return await self.get_by_id(membership.id) or membership
