"""Club repository — database query layer for Club model."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club import Club


class ClubRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, club_id: UUID) -> Club | None:
        result = await self.db.execute(select(Club).where(Club.id == club_id))
        return result.scalar_one_or_none()

    async def get_by_slug(self, slug: str) -> Club | None:
        result = await self.db.execute(select(Club).where(Club.slug == slug))
        return result.scalar_one_or_none()

    async def create(
        self,
        name: str,
        slug: str,
        description: str | None = None,
    ) -> Club:
        club = Club(name=name, slug=slug, description=description)
        self.db.add(club)
        await self.db.flush()
        await self.db.refresh(club)
        return club

    async def get_all_active(self) -> list[Club]:
        result = await self.db.execute(
            select(Club).where(Club.is_active == True).order_by(Club.name)  # noqa: E712
        )
        return list(result.scalars().all())
