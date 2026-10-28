"""
Aught2 Pickleball — Club Asset & Media Service

Handles:
- Club branding retrieval and updates (logo, cover)
- Club hero carousel slides CRUD and reordering
- Centralized image upload & processing (via MediaStorageService)
- Entity-scoped image updates with strict tenant isolation
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club import Club
from app.models.club_asset import ClubCarouselSlide
from app.models.court import Court
from app.models.event import Event
from app.models.league import League
from app.models.lesson import Lesson, LessonType
from app.models.tournament import Tournament
from app.schemas.club_asset import (
    ClubBrandingResponse,
    ClubBrandingUpdateRequest,
    ClubCarouselSlideCreateRequest,
    ClubCarouselSlideResponse,
    ClubCarouselSlideUpdateRequest,
    MediaUploadResponse,
    UniversalPromotionalAdResponse,
)
from app.services.media_storage_service import MediaStorageService

logger = logging.getLogger(__name__)


class ClubAssetService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.storage = MediaStorageService(db)

    # ─── Club Branding ────────────────────────────────────────────────────────

    async def get_branding(self, club_id: UUID) -> ClubBrandingResponse:
        """Retrieve club branding (logo, cover, owner banner, and category defaults)."""
        stmt = select(Club).where(Club.id == club_id)
        res = await self.db.execute(stmt)
        club = res.scalar_one_or_none()
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        return ClubBrandingResponse(
            club_id=club.id,
            name=club.name,
            logo_url=club.logo_url,
            cover_image_url=club.cover_image_url,
            owner_banner_url=club.owner_banner_url,
            default_tournament_round_robin_url=club.default_tournament_round_robin_url,
            default_tournament_scramble_url=club.default_tournament_scramble_url,
            default_tournament_pool_play_url=club.default_tournament_pool_play_url,
            default_tournament_bracket_url=club.default_tournament_bracket_url,
            default_league_banner_url=club.default_league_banner_url,
            default_event_banner_url=club.default_event_banner_url,
            default_lesson_banner_url=club.default_lesson_banner_url,
            has_custom_logo=bool(club.logo_url),
            has_custom_cover=bool(club.cover_image_url),
            has_custom_owner_banner=bool(club.owner_banner_url),
            has_custom_tournament_round_robin=bool(club.default_tournament_round_robin_url),
            has_custom_tournament_scramble=bool(club.default_tournament_scramble_url),
            has_custom_tournament_pool_play=bool(club.default_tournament_pool_play_url),
            has_custom_tournament_bracket=bool(club.default_tournament_bracket_url),
            has_custom_league_banner=bool(club.default_league_banner_url),
            has_custom_event_banner=bool(club.default_event_banner_url),
            has_custom_lesson_banner=bool(club.default_lesson_banner_url),
        )

    async def update_branding(
        self,
        club_id: UUID,
        payload: ClubBrandingUpdateRequest,
    ) -> ClubBrandingResponse:
        """Update club logo, cover, owner banner, and/or activity defaults."""
        stmt = select(Club).where(Club.id == club_id)
        res = await self.db.execute(stmt)
        club = res.scalar_one_or_none()
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        branding_fields = [
            "logo_url",
            "cover_image_url",
            "owner_banner_url",
            "default_tournament_round_robin_url",
            "default_tournament_scramble_url",
            "default_tournament_pool_play_url",
            "default_tournament_bracket_url",
            "default_league_banner_url",
            "default_event_banner_url",
            "default_lesson_banner_url",
        ]

        old_values = {field: getattr(club, field) for field in branding_fields}
        update_dict = payload.model_dump(exclude_unset=True)

        for field in branding_fields:
            if field in update_dict:
                setattr(club, field, update_dict[field])

        await self.db.commit()
        await self.db.refresh(club)

        # Safely clean up orphaned media files on replacement
        for field, old_url in old_values.items():
            if old_url and field in update_dict and old_url != getattr(club, field):
                try:
                    await self.storage.cleanup_unreferenced_by_url(old_url, club.id)
                except Exception:
                    pass

        return ClubBrandingResponse(
            club_id=club.id,
            name=club.name,
            logo_url=club.logo_url,
            cover_image_url=club.cover_image_url,
            owner_banner_url=club.owner_banner_url,
            default_tournament_round_robin_url=club.default_tournament_round_robin_url,
            default_tournament_scramble_url=club.default_tournament_scramble_url,
            default_tournament_pool_play_url=club.default_tournament_pool_play_url,
            default_tournament_bracket_url=club.default_tournament_bracket_url,
            default_league_banner_url=club.default_league_banner_url,
            default_event_banner_url=club.default_event_banner_url,
            default_lesson_banner_url=club.default_lesson_banner_url,
            has_custom_logo=bool(club.logo_url),
            has_custom_cover=bool(club.cover_image_url),
            has_custom_owner_banner=bool(club.owner_banner_url),
            has_custom_tournament_round_robin=bool(club.default_tournament_round_robin_url),
            has_custom_tournament_scramble=bool(club.default_tournament_scramble_url),
            has_custom_tournament_pool_play=bool(club.default_tournament_pool_play_url),
            has_custom_tournament_bracket=bool(club.default_tournament_bracket_url),
            has_custom_league_banner=bool(club.default_league_banner_url),
            has_custom_event_banner=bool(club.default_event_banner_url),
            has_custom_lesson_banner=bool(club.default_lesson_banner_url),
        )

    # ─── Hero Carousel Slides / Club Promotional Ads ──────────────────────────

    async def get_carousel_slides(
        self,
        club_id: UUID,
        active_only: bool = True,
    ) -> list[ClubCarouselSlideResponse]:
        """
        Fetch carousel slides / promotional ads for a club, ordered by display_order.
        When active_only is True, verifies is_active and valid start/end scheduling dates.
        """
        query = (
            select(ClubCarouselSlide)
            .where(ClubCarouselSlide.club_id == club_id)
            .order_by(ClubCarouselSlide.display_order.asc(), ClubCarouselSlide.created_at.asc())
        )
        if active_only:
            now = datetime.now(timezone.utc)
            query = query.where(
                ClubCarouselSlide.is_active.is_(True),
                or_(ClubCarouselSlide.start_date.is_(None), ClubCarouselSlide.start_date <= now),
                or_(ClubCarouselSlide.end_date.is_(None), ClubCarouselSlide.end_date >= now),
            )

        res = await self.db.execute(query)
        slides = res.scalars().all()
        return [ClubCarouselSlideResponse.model_validate(s) for s in slides]

    async def create_carousel_slide(
        self,
        club_id: UUID,
        payload: ClubCarouselSlideCreateRequest,
    ) -> ClubCarouselSlideResponse:
        """Create a new promotional ad / carousel slide for a club."""
        # Verify club exists
        club_check = await self.db.execute(select(Club.id).where(Club.id == club_id))
        if not club_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

        # Determine default display_order if 0
        display_order = payload.display_order
        if display_order == 0:
            max_order_query = select(func.coalesce(func.max(ClubCarouselSlide.display_order), -1)).where(
                ClubCarouselSlide.club_id == club_id
            )
            max_order = (await self.db.execute(max_order_query)).scalar_one()
            display_order = max_order + 1

        slide = ClubCarouselSlide(
            club_id=club_id,
            title=payload.title,
            subtitle=payload.subtitle,
            tag=payload.tag,
            image_url=payload.image_url,
            cta_text=payload.cta_text,
            cta_route=payload.cta_route,
            display_order=display_order,
            is_active=payload.is_active,
            start_date=payload.start_date,
            end_date=payload.end_date,
        )
        self.db.add(slide)
        await self.db.commit()
        await self.db.refresh(slide)
        return ClubCarouselSlideResponse.model_validate(slide)

    async def get_universal_promotional_ads(self) -> list[UniversalPromotionalAdResponse]:
        """
        Aggregate eligible promotional ads across all active clubs for Player App Home.
        Only includes ads belonging to active clubs, marked active, and within scheduled dates.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            select(
                ClubCarouselSlide,
                Club.name.label("club_name"),
                Club.logo_url.label("club_logo_url"),
            )
            .join(Club, Club.id == ClubCarouselSlide.club_id)
            .where(
                Club.is_active.is_(True),
                ClubCarouselSlide.is_active.is_(True),
                or_(ClubCarouselSlide.start_date.is_(None), ClubCarouselSlide.start_date <= now),
                or_(ClubCarouselSlide.end_date.is_(None), ClubCarouselSlide.end_date >= now),
            )
            .order_by(ClubCarouselSlide.display_order.asc(), ClubCarouselSlide.created_at.desc())
        )
        res = await self.db.execute(stmt)
        rows = res.all()

        results = []
        for slide, club_name, club_logo_url in rows:
            results.append(
                UniversalPromotionalAdResponse(
                    id=slide.id,
                    club_id=slide.club_id,
                    club_name=club_name,
                    club_logo_url=club_logo_url,
                    title=slide.title,
                    subtitle=slide.subtitle,
                    tag=slide.tag,
                    image_url=slide.image_url,
                    cta_text=slide.cta_text,
                    cta_route=slide.cta_route,
                    display_order=slide.display_order,
                    is_active=slide.is_active,
                    start_date=slide.start_date,
                    end_date=slide.end_date,
                    created_at=slide.created_at,
                )
            )
        return results

    async def update_carousel_slide(
        self,
        club_id: UUID,
        slide_id: UUID,
        payload: ClubCarouselSlideUpdateRequest,
    ) -> ClubCarouselSlideResponse:
        """Update an existing carousel slide."""
        stmt = select(ClubCarouselSlide).where(
            ClubCarouselSlide.id == slide_id,
            ClubCarouselSlide.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        slide = res.scalar_one_or_none()
        if not slide:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carousel slide not found")

        update_dict = payload.model_dump(exclude_unset=True)
        for k, v in update_dict.items():
            setattr(slide, k, v)

        await self.db.commit()
        await self.db.refresh(slide)
        return ClubCarouselSlideResponse.model_validate(slide)

    async def delete_carousel_slide(
        self,
        club_id: UUID,
        slide_id: UUID,
    ) -> None:
        """Delete a carousel slide."""
        stmt = select(ClubCarouselSlide).where(
            ClubCarouselSlide.id == slide_id,
            ClubCarouselSlide.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        slide = res.scalar_one_or_none()
        if not slide:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carousel slide not found")

        await self.db.delete(slide)
        await self.db.commit()

    async def reorder_carousel_slides(
        self,
        club_id: UUID,
        slide_ids: list[UUID],
    ) -> list[ClubCarouselSlideResponse]:
        """Update display order for slides within a club."""
        stmt = select(ClubCarouselSlide).where(ClubCarouselSlide.club_id == club_id)
        res = await self.db.execute(stmt)
        existing_slides = {s.id: s for s in res.scalars().all()}

        for order, slide_id in enumerate(slide_ids):
            if slide_id in existing_slides:
                existing_slides[slide_id].display_order = order

        await self.db.commit()
        return await self.get_carousel_slides(club_id=club_id, active_only=False)

    # ─── Centralized Image Upload ─────────────────────────────────────────────

    async def upload_file(
        self,
        club_id: UUID,
        uploaded_by_user_id: UUID,
        file: UploadFile,
        asset_type: str,
        entity_type: str | None = None,
        entity_id: UUID | None = None,
    ) -> MediaUploadResponse:
        """
        Validate, process, and persist an uploaded image file for a club.
        """
        club_check = await self.db.execute(select(Club.id).where(Club.id == club_id))
        if not club_check.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

        # Verify entity belongs to this club if specified
        effective_entity_type = entity_type or asset_type
        if entity_id:
            await self._verify_entity_ownership(club_id, effective_entity_type, entity_id)

        raw_bytes = await file.read()
        category = asset_type.replace("_", "-")

        public_url, media_asset = await self.storage.store_image(
            raw_bytes=raw_bytes,
            category=category,
            club_id=club_id,
            uploaded_by_user_id=uploaded_by_user_id,
            asset_type=asset_type,
            entity_type=entity_type,
            entity_id=entity_id,
            original_filename=file.filename,
        )

        await self.db.commit()
        await self.db.refresh(media_asset)

        return MediaUploadResponse(
            asset_id=media_asset.id,
            public_url=public_url,
            asset_type=asset_type,
            width=media_asset.width,
            height=media_asset.height,
            file_size_bytes=media_asset.file_size_bytes,
        )

    async def _verify_entity_ownership(
        self,
        club_id: UUID,
        entity_type: str,
        entity_id: UUID,
    ) -> None:
        """
        Verify that an entity referenced by entity_id belongs to the target club.
        Rejects cross-club uploads server-side.
        """
        clean_type = entity_type.lower().strip()
        if clean_type in ("court", "court_photo", "court_image"):
            stmt = select(Court.id).where(Court.id == entity_id, Court.club_id == club_id)
            res = await self.db.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Court not found in this club",
                )
        elif clean_type in ("tournament", "tournament_banner"):
            stmt = select(Tournament.id).where(Tournament.id == entity_id, Tournament.club_id == club_id)
            res = await self.db.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tournament not found in this club",
                )
        elif clean_type in ("league", "league_banner"):
            stmt = select(League.id).where(League.id == entity_id, League.club_id == club_id)
            res = await self.db.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="League not found in this club",
                )
        elif clean_type in ("event", "event_cover"):
            stmt = select(Event.id).where(Event.id == entity_id, Event.club_id == club_id)
            res = await self.db.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Event not found in this club",
                )
        elif clean_type in ("lesson", "lesson_image"):
            stmt = select(Lesson.id).where(Lesson.id == entity_id, Lesson.club_id == club_id)
            res = await self.db.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Lesson not found in this club",
                )
        elif clean_type in ("lesson_type", "lesson_type_image"):
            stmt = select(LessonType.id).where(LessonType.id == entity_id, LessonType.club_id == club_id)
            res = await self.db.execute(stmt)
            if not res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Lesson type not found in this club",
                )
        elif clean_type in (
            "club",
            "club_logo",
            "club_cover",
            "logo",
            "cover",
            "branding",
            "owner_banner",
            "default_tournament_round_robin",
            "default_tournament_scramble",
            "default_tournament_pool_play",
            "default_tournament_bracket",
            "default_league_banner",
            "default_event_banner",
            "default_lesson_banner",
        ):
            if entity_id != club_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Club entity ID mismatch",
                )

    # ─── Entity Image Management ──────────────────────────────────────────────

    async def update_tournament_image(
        self,
        club_id: UUID,
        tournament_id: UUID,
        image_url: str | None,
    ) -> Tournament:
        """Update or reset a tournament's banner image with club ownership validation."""
        stmt = select(Tournament).where(
            Tournament.id == tournament_id,
            Tournament.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        tournament = res.scalar_one_or_none()
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )
        tournament.banner_image_url = image_url
        await self.db.commit()
        await self.db.refresh(tournament)
        return tournament

    async def update_league_image(
        self,
        club_id: UUID,
        league_id: UUID,
        image_url: str | None,
    ) -> League:
        """Update or reset a league's banner image with club ownership validation."""
        stmt = select(League).where(
            League.id == league_id,
            League.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        league = res.scalar_one_or_none()
        if not league:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="League not found in this club",
            )
        league.banner_image_url = image_url
        await self.db.commit()
        await self.db.refresh(league)
        return league

    async def update_event_image(
        self,
        club_id: UUID,
        event_id: UUID,
        image_url: str | None,
    ) -> Event:
        """Update or reset an event's cover image with club ownership validation."""
        stmt = select(Event).where(
            Event.id == event_id,
            Event.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        event = res.scalar_one_or_none()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found in this club",
            )
        event.cover_image_url = image_url
        await self.db.commit()
        await self.db.refresh(event)
        return event

    async def update_court_image(
        self,
        club_id: UUID,
        court_id: UUID,
        image_url: str | None,
    ) -> Court:
        """Update or reset a court's photo image with club ownership validation."""
        stmt = select(Court).where(
            Court.id == court_id,
            Court.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        court = res.scalar_one_or_none()
        if not court:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Court not found in this club",
            )
        old_photo_url = court.photo_url
        court.photo_url = image_url
        await self.db.commit()
        await self.db.refresh(court)

        if old_photo_url and old_photo_url != image_url:
            try:
                await self.storage.cleanup_unreferenced_by_url(old_photo_url, club_id)
            except Exception:
                pass

        return court

    async def update_lesson_image(
        self,
        club_id: UUID,
        lesson_id: UUID,
        image_url: str | None,
    ) -> Lesson:
        """Update or reset a lesson's image with club ownership validation."""
        stmt = select(Lesson).where(
            Lesson.id == lesson_id,
            Lesson.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        lesson = res.scalar_one_or_none()
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found in this club",
            )
        lesson.image_url = image_url
        await self.db.commit()
        await self.db.refresh(lesson)
        return lesson

    async def update_lesson_type_image(
        self,
        club_id: UUID,
        lesson_type_id: UUID,
        image_url: str | None,
    ) -> LessonType:
        """Update or reset a lesson type template's image with club ownership validation."""
        stmt = select(LessonType).where(
            LessonType.id == lesson_type_id,
            LessonType.club_id == club_id,
        )
        res = await self.db.execute(stmt)
        lesson_type = res.scalar_one_or_none()
        if not lesson_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson type not found in this club",
            )
        lesson_type.image_url = image_url
        await self.db.commit()
        await self.db.refresh(lesson_type)
        return lesson_type
