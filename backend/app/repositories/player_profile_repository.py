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
            select(PlayerProfile)
            .where(PlayerProfile.id == profile_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: UUID) -> PlayerProfile | None:
        result = await self.db.execute(
            select(PlayerProfile)
            .where(PlayerProfile.user_id == user_id)
            .execution_options(populate_existing=True)
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
        gender: str | None = None,
        profile_image_url: str | None = None,
        bio: str | None = None,
    ) -> PlayerProfile:
        clean_gender = gender.strip().capitalize() if gender and isinstance(gender, str) and gender.strip() else None
        profile = PlayerProfile(
            user_id=user_id,
            display_name=display_name.strip() if display_name else "Player",
            first_name=first_name.strip() if first_name and isinstance(first_name, str) and first_name.strip() else None,
            last_name=last_name.strip() if last_name and isinstance(last_name, str) and last_name.strip() else None,
            phone=phone.strip() if phone and isinstance(phone, str) and phone.strip() else None,
            date_of_birth=date_of_birth,
            gender=clean_gender,
            profile_image_url=profile_image_url if profile_image_url else None,
            bio=bio.strip() if bio and isinstance(bio, str) and bio.strip() else None,
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
        gender: str | None = None,
        profile_image_url: str | None = None,
        bio: str | None = None,
        clear_fields: set[str] | None = None,
    ) -> PlayerProfile:
        cleared = clear_fields or set()
        if display_name is not None and display_name.strip():
            profile.display_name = display_name.strip()
        if "first_name" in cleared:
            profile.first_name = None
        elif first_name is not None:
            profile.first_name = first_name.strip() if first_name.strip() else None
        if "last_name" in cleared:
            profile.last_name = None
        elif last_name is not None:
            profile.last_name = last_name.strip() if last_name.strip() else None
        if "phone" in cleared:
            profile.phone = None
        elif phone is not None:
            profile.phone = phone.strip() if phone.strip() else None
        if "date_of_birth" in cleared:
            profile.date_of_birth = None
        elif date_of_birth is not None:
            profile.date_of_birth = date_of_birth
        if "gender" in cleared:
            profile.gender = None
        elif gender is not None:
            profile.gender = gender.strip().capitalize() if gender.strip() else None
        if "profile_image_url" in cleared:
            profile.profile_image_url = None
        elif profile_image_url is not None:
            profile.profile_image_url = profile_image_url if profile_image_url != "" else None
        if "bio" in cleared:
            profile.bio = None
        elif bio is not None:
            profile.bio = bio.strip() if bio.strip() else None

        await self.db.flush()
        await self.db.refresh(profile)
        return profile
