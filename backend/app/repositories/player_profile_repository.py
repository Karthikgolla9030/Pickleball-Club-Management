"""PlayerProfile repository — database query layer."""
from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.player_profile import PlayerProfile


class PlayerProfileRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, profile_id: UUID) -> PlayerProfile | None:
        result = await self.db.execute(
            select(PlayerProfile).where(PlayerProfile.id == profile_id)
        )
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: UUID) -> PlayerProfile | None:
        result = await self.db.execute(
            select(PlayerProfile).where(PlayerProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: UUID,
        display_name: str,
        first_name: str | None = None,
        last_name: str | None = None,
        phone: str | None = None,
        date_of_birth: date | None = None,
        profile_image_url: str | None = None,
        bio: str | None = None,
    ) -> PlayerProfile:
        profile = PlayerProfile(
            user_id=user_id,
            display_name=display_name,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            date_of_birth=date_of_birth,
            profile_image_url=profile_image_url,
            bio=bio,
        )
        self.db.add(profile)
        await self.db.flush()
        await self.db.refresh(profile)
        return profile

    async def update(
        self,
        profile: PlayerProfile,
        display_name: str | None = None,
        first_name: str | None = None,
        last_name: str | None = None,
        phone: str | None = None,
        date_of_birth: date | None = None,
        profile_image_url: str | None = None,
        bio: str | None = None,
    ) -> PlayerProfile:
        if display_name is not None:
            profile.display_name = display_name
        if first_name is not None:
            profile.first_name = first_name
        if last_name is not None:
            profile.last_name = last_name
        if phone is not None:
            profile.phone = phone
        if date_of_birth is not None:
            profile.date_of_birth = date_of_birth
        if profile_image_url is not None:
            profile.profile_image_url = profile_image_url if profile_image_url != "" else None
        if bio is not None:
            profile.bio = bio

        await self.db.flush()
        await self.db.refresh(profile)
        return profile
