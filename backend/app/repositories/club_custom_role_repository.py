"""
Aught2 Pickleball — Club Custom Role Repository
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_custom_role import ClubCustomRole
from app.models.club_membership import ClubMembership


class ClubCustomRoleRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(
        self, role_id: UUID, club_id: UUID | None = None
    ) -> ClubCustomRole | None:
        stmt = (
            select(ClubCustomRole)
            .options(selectinload(ClubCustomRole.memberships))
            .where(ClubCustomRole.id == role_id)
        )
        if club_id is not None:
            stmt = stmt.where(ClubCustomRole.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_name(
        self, club_id: UUID, name: str, exclude_id: UUID | None = None
    ) -> ClubCustomRole | None:
        """Find a role by case-insensitive name within a specific club."""
        stmt = select(ClubCustomRole).where(
            ClubCustomRole.club_id == club_id,
            func.lower(ClubCustomRole.name) == name.strip().lower(),
        )
        if exclude_id is not None:
            stmt = stmt.where(ClubCustomRole.id != exclude_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_club(self, club_id: UUID) -> list[ClubCustomRole]:
        """List all custom roles for a club, ordered by creation date."""
        stmt = (
            select(ClubCustomRole)
            .options(selectinload(ClubCustomRole.memberships))
            .where(ClubCustomRole.club_id == club_id)
            .order_by(ClubCustomRole.name.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_assigned_staff(self, role_id: UUID) -> int:
        """Count active or total staff members assigned to this role."""
        stmt = select(func.count(ClubMembership.id)).where(
            ClubMembership.custom_role_id == role_id
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def create(
        self,
        club_id: UUID,
        name: str,
        description: str | None = None,
        permissions: list[str] | None = None,
    ) -> ClubCustomRole:
        role = ClubCustomRole(
            club_id=club_id,
            name=name.strip(),
            description=description.strip() if description else None,
            permissions=permissions or [],
        )
        self.db.add(role)
        await self.db.flush()
        return await self.get_by_id(role.id) or role

    async def update(
        self,
        role: ClubCustomRole,
        **fields,
    ) -> ClubCustomRole:
        for k, v in fields.items():
            if hasattr(role, k) and v is not None:
                if isinstance(v, str):
                    setattr(role, k, v.strip())
                else:
                    setattr(role, k, v)
        await self.db.flush()
        return await self.get_by_id(role.id) or role

    async def delete(self, role: ClubCustomRole) -> None:
        await self.db.delete(role)
        await self.db.flush()
