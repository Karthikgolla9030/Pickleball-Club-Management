"""
Aught2 Pickleball — Global Platform Banner Service

Provides management for:
- 'owner_home': Platform Admin welcome/hero banner on Club Owner Dashboard
- 'player_home': Platform Admin welcome/hero banner on Player App Home

Security:
- All mutations strictly require Platform Owner authorization.
- Public/player read endpoints return sanitized, active banners with fallback support.
- Media upload routes through MediaStorageService with Pillow magic-bytes and EXIF stripping.
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_banner import PlatformBanner
from app.schemas.platform_banner import (
    PlatformBannerResponse,
    PlatformBannerUpdateRequest,
)
from app.services.media_storage_service import MediaStorageService

logger = logging.getLogger(__name__)

SUPPORTED_BANNER_TYPES = {"owner_home", "player_home"}

DEFAULT_BANNER_CONFIGS = {
    "owner_home": {
        "title": "Welcome to Aught2 Pickleball",
        "subtitle": "Great courts. Active members. A healthier, happier community.",
        "cta_text": "Book a Court",
        "cta_destination": "/(club)/bookings",
    },
    "player_home": {
        "title": "Welcome to Pickleball",
        "subtitle": "Ready to play, compete and make the most of your game?",
        "cta_text": "Find a Court",
        "cta_destination": "/(player)/book-court-club",
    },
}


class PlatformBannerService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.storage = MediaStorageService(db)

    async def get_or_create_banner(self, banner_type: str) -> PlatformBanner:
        """Fetch banner record by type, or create default uncustomized entry."""
        clean_type = banner_type.lower().strip()
        if clean_type not in SUPPORTED_BANNER_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid banner type '{banner_type}'. Supported: {', '.join(sorted(SUPPORTED_BANNER_TYPES))}",
            )

        stmt = select(PlatformBanner).where(PlatformBanner.banner_type == clean_type)
        res = await self.db.execute(stmt)
        banner = res.scalar_one_or_none()
        if not banner:
            defaults = DEFAULT_BANNER_CONFIGS.get(clean_type, {})
            banner = PlatformBanner(
                banner_type=clean_type,
                image_url=None,
                title=defaults.get("title"),
                subtitle=defaults.get("subtitle"),
                cta_text=defaults.get("cta_text"),
                cta_destination=defaults.get("cta_destination"),
                is_active=True,
            )
            self.db.add(banner)
            await self.db.commit()
            await self.db.refresh(banner)
        return banner

    async def get_all_banners(self) -> dict[str, PlatformBannerResponse]:
        """Fetch all platform banners keyed by banner_type."""
        stmt = select(PlatformBanner)
        res = await self.db.execute(stmt)
        banners = list(res.scalars().all())

        # Ensure all supported banner types exist in output
        existing_types = {b.banner_type: b for b in banners}
        result: dict[str, PlatformBannerResponse] = {}
        for b_type in sorted(SUPPORTED_BANNER_TYPES):
            if b_type in existing_types:
                result[b_type] = PlatformBannerResponse.model_validate(existing_types[b_type])
            else:
                banner = await self.get_or_create_banner(b_type)
                result[b_type] = PlatformBannerResponse.model_validate(banner)

        return result

    async def get_banner(self, banner_type: str) -> PlatformBannerResponse:
        """Fetch a single platform banner."""
        banner = await self.get_or_create_banner(banner_type)
        return PlatformBannerResponse.model_validate(banner)

    async def update_banner(
        self,
        banner_type: str,
        payload: PlatformBannerUpdateRequest,
        admin_user_id: UUID | None = None,
    ) -> PlatformBannerResponse:
        """Update banner text, image_url, CTA, and active status."""
        banner = await self.get_or_create_banner(banner_type)

        update_data = payload.model_dump(exclude_unset=True)
        for field, val in update_data.items():
            setattr(banner, field, val)

        if admin_user_id:
            banner.updated_by_id = admin_user_id

        await self.db.commit()
        await self.db.refresh(banner)
        return PlatformBannerResponse.model_validate(banner)

    async def upload_banner_image(
        self,
        banner_type: str,
        file: UploadFile,
        admin_user_id: UUID | None = None,
    ) -> PlatformBannerResponse:
        """Upload and process image via MediaStorageService, updating banner image_url."""
        banner = await self.get_or_create_banner(banner_type)

        content = await file.read()
        public_url, _ = await self.storage.store_image(
            raw_bytes=content,
            category="platform_banners",
            club_id=None,
            uploaded_by_user_id=admin_user_id,
            asset_type=f"platform_banner_{banner.banner_type}",
            original_filename=file.filename,
        )

        banner.image_url = public_url
        if admin_user_id:
            banner.updated_by_id = admin_user_id

        await self.db.commit()
        await self.db.refresh(banner)
        return PlatformBannerResponse.model_validate(banner)

    async def reset_banner(
        self,
        banner_type: str,
        admin_user_id: UUID | None = None,
    ) -> PlatformBannerResponse:
        """Reset banner back to platform default (null image, restoring builtin fallback)."""
        banner = await self.get_or_create_banner(banner_type)
        defaults = DEFAULT_BANNER_CONFIGS.get(banner.banner_type, {})

        banner.image_url = None
        banner.title = defaults.get("title")
        banner.subtitle = defaults.get("subtitle")
        banner.cta_text = defaults.get("cta_text")
        banner.cta_destination = defaults.get("cta_destination")
        banner.is_active = True
        if admin_user_id:
            banner.updated_by_id = admin_user_id

        await self.db.commit()
        await self.db.refresh(banner)
        return PlatformBannerResponse.model_validate(banner)
