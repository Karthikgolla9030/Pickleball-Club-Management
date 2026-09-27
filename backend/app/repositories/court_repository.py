"""
Aught2 Pickleball — Court Repository (Phase 10)

Database access layer for Courts. Strictly club-tenant scoped.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.court import Court, CourtEnvironment, CourtStatus


class CourtRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, court_id: UUID, club_id: UUID | None = None) -> Court | None:
        """Fetch court by ID, optionally enforcing club ownership."""
        stmt = select(Court).where(Court.id == court_id)
        if club_id is not None:
            stmt = stmt.where(Court.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_court_number(self, club_id: UUID, court_number: int) -> Court | None:
        """Find a court by its number within a specific club."""
        stmt = select(Court).where(Court.club_id == club_id, Court.court_number == court_number)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_name(self, club_id: UUID, name: str) -> Court | None:
        """Find a court by its name (case-insensitive) within a specific club."""
        stmt = select(Court).where(Court.club_id == club_id, func.lower(Court.name) == name.strip().lower())
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_club(self, club_id: UUID, is_active: bool | None = None) -> list[Court]:
        """
        List all courts belonging to a club, ordered by display_order, then court_number, then name.
        """
        stmt = select(Court).where(Court.club_id == club_id)
        if is_active is not None:
            stmt = stmt.where(Court.is_active == is_active)
        stmt = stmt.order_by(Court.display_order.asc(), Court.court_number.asc().nulls_last(), Court.name.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_max_display_order(self, club_id: UUID) -> int:
        """Get the highest display_order for courts in the club."""
        stmt = select(func.coalesce(func.max(Court.display_order), -1)).where(Court.club_id == club_id)
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    async def create(
        self,
        club_id: UUID,
        name: str,
        display_name: str | None = None,
        description: str | None = None,
        court_number: int | None = None,
        surface_type: str | None = None,
        indoor_outdoor: CourtEnvironment = CourtEnvironment.INDOOR,
        status: CourtStatus = CourtStatus.ACTIVE,
        is_active: bool = True,
        display_order: int = 0,
    ) -> Court:
        court = Court(
            club_id=club_id,
            name=name.strip(),
            display_name=display_name.strip() if display_name else None,
            description=description.strip() if description else None,
            court_number=court_number,
            surface_type=surface_type.strip() if surface_type else None,
            indoor_outdoor=indoor_outdoor,
            status=status,
            is_active=is_active,
            display_order=display_order,
        )
        self.db.add(court)
        await self.db.flush()
        await self.db.refresh(court)
        return court

    async def update(self, court: Court, **fields) -> Court:
        for k, v in fields.items():
            if hasattr(court, k):
                setattr(court, k, v)
        await self.db.flush()
        await self.db.refresh(court)
        return court

    async def reorder(self, club_id: UUID, court_ids: list[UUID]) -> list[Court]:
        """
        Update the display_order of courts in a single transaction based on the provided list order.
        """
        courts = await self.list_by_club(club_id)
        court_map = {c.id: c for c in courts}

        for index, cid in enumerate(court_ids):
            if cid in court_map:
                court_map[cid].display_order = index

        await self.db.flush()
        return await self.list_by_club(club_id)

    async def count_by_club(self, club_id: UUID) -> int:
        stmt = select(func.count(Court.id)).where(Court.club_id == club_id)
        result = await self.db.execute(stmt)
        return int(result.scalar_one())
