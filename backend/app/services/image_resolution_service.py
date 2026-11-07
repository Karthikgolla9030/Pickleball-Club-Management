"""
Aught2 Pickleball — Centralized Image & Banner Resolution Engine

Implements strict three-level hierarchy for all image-supported content categories:
  Priority 1: Individual Custom Image (tournament, event, league, lesson)
  Priority 2: Club Default Image (format-specific or category default)
  Priority 3: Platform Admin Global Default (from PlatformBanner)
  Fallback: None (clean neutral no-image state)

Critical multi-tenant & isolation guarantees:
- Setting a custom image on an item NEVER mutates club or platform defaults.
- Setting a club default NEVER leaks to other clubs or mutates platform defaults.
- Removing an individual custom image automatically falls back to club default -> platform default.
- Removing a club default automatically falls back to platform default.
"""
from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club import Club
from app.models.event import Event
from app.models.league import League
from app.models.lesson import Lesson
from app.models.platform_banner import PlatformBanner
from app.models.tournament import Tournament

logger = logging.getLogger(__name__)

ResolutionSource = Literal["custom", "club_default", "platform_default", "none"]


class ResolvedImageResult(BaseModel):
    content_type: str
    resolved_url: str | None = None
    source: ResolutionSource
    item_id: str | None = None
    club_id: str | None = None
    format: str | None = None


class ImageResolutionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_platform_banner_url(self, banner_type: str) -> str | None:
        """Fetch active platform default banner image URL by banner type."""
        clean_type = banner_type.lower().strip()
        stmt = select(PlatformBanner).where(
            PlatformBanner.banner_type == clean_type,
        )
        res = await self.db.execute(stmt)
        banner = res.scalar_one_or_none()
        if banner is not None:
            if not banner.is_active:
                return None
            if banner.image_url and banner.image_url.strip():
                return banner.image_url.strip()
            # If active but custom image_url is not set, use Platform Admin built-in default
            from app.services.platform_banner_service import resolve_platform_default
            return resolve_platform_default(clean_type)
        return None

    async def get_club_by_id(self, club_id: UUID | str) -> Club | None:
        """Fetch club record by ID."""
        c_id = UUID(str(club_id)) if not isinstance(club_id, UUID) else club_id
        stmt = select(Club).where(Club.id == c_id)
        res = await self.db.execute(stmt)
        return res.scalar_one_or_none()

    # ─── Tournament Resolution ────────────────────────────────────────────────

    async def resolve_tournament_banner(
        self,
        tournament_or_id: Tournament | UUID | str | None = None,
        club_id: UUID | str | None = None,
        format: str | None = None,
        custom_url: str | None = None,
    ) -> ResolvedImageResult:
        """
        Resolve tournament banner adhering to:
        1. tournament.banner_image_url (custom)
        2. club format default -> club general default
        3. platform format default -> platform general default
        4. None (neutral no-image state)
        """
        item_id_str: str | None = None
        t_obj: Tournament | None = None

        if isinstance(tournament_or_id, Tournament):
            t_obj = tournament_or_id
            item_id_str = str(t_obj.id)
            custom_url = custom_url or t_obj.banner_image_url
            club_id = club_id or t_obj.club_id
            format = format or (t_obj.format.value if hasattr(t_obj.format, "value") else str(t_obj.format or ""))
        elif tournament_or_id is not None:
            t_id = UUID(str(tournament_or_id)) if not isinstance(tournament_or_id, UUID) else tournament_or_id
            item_id_str = str(t_id)
            stmt = select(Tournament).where(Tournament.id == t_id)
            res = await self.db.execute(stmt)
            t_obj = res.scalar_one_or_none()
            if t_obj:
                custom_url = custom_url or t_obj.banner_image_url
                club_id = club_id or t_obj.club_id
                format = format or (t_obj.format.value if hasattr(t_obj.format, "value") else str(t_obj.format or ""))

        # Priority 1: Individual custom banner
        if custom_url and custom_url.strip():
            return ResolvedImageResult(
                content_type="tournament",
                resolved_url=custom_url.strip(),
                source="custom",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
                format=format,
            )

        # Priority 2: Club Default Banner
        fmt_clean = (str(format or "")).lower().strip()
        if club_id:
            club = await self.get_club_by_id(club_id)
            if club:
                club_default: str | None = None
                if fmt_clean == "round_robin" and club.default_tournament_round_robin_url:
                    club_default = club.default_tournament_round_robin_url
                elif fmt_clean == "scramble" and club.default_tournament_scramble_url:
                    club_default = club.default_tournament_scramble_url
                elif fmt_clean == "pool_play" and club.default_tournament_pool_play_url:
                    club_default = club.default_tournament_pool_play_url
                elif fmt_clean == "bracket" and club.default_tournament_bracket_url:
                    club_default = club.default_tournament_bracket_url

                if not club_default and club.default_tournament_banner_url:
                    club_default = club.default_tournament_banner_url

                if club_default and club_default.strip():
                    return ResolvedImageResult(
                        content_type="tournament",
                        resolved_url=club_default.strip(),
                        source="club_default",
                        item_id=item_id_str,
                        club_id=str(club_id),
                        format=format,
                    )

        # Priority 3: Platform Admin Global Default
        plat_url: str | None = None
        if fmt_clean == "round_robin":
            plat_url = await self.get_platform_banner_url("default_tournament_round_robin")
        elif fmt_clean == "scramble":
            plat_url = await self.get_platform_banner_url("default_tournament_scramble")
        elif fmt_clean == "pool_play":
            plat_url = await self.get_platform_banner_url("default_tournament_pool_play")
        elif fmt_clean == "bracket":
            plat_url = await self.get_platform_banner_url("default_tournament_bracket")

        if not plat_url:
            plat_url = await self.get_platform_banner_url("default_tournament_banner")

        if plat_url and plat_url.strip():
            return ResolvedImageResult(
                content_type="tournament",
                resolved_url=plat_url.strip(),
                source="platform_default",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
                format=format,
            )

        # Priority 4: Clean neutral no-image state
        return ResolvedImageResult(
            content_type="tournament",
            resolved_url=None,
            source="none",
            item_id=item_id_str,
            club_id=str(club_id) if club_id else None,
            format=format,
        )

    # ─── Event Resolution ─────────────────────────────────────────────────────

    async def resolve_event_cover(
        self,
        event_or_id: Event | UUID | str | None = None,
        club_id: UUID | str | None = None,
        custom_url: str | None = None,
    ) -> ResolvedImageResult:
        item_id_str: str | None = None
        if isinstance(event_or_id, Event):
            item_id_str = str(event_or_id.id)
            custom_url = custom_url or event_or_id.cover_image_url
            club_id = club_id or event_or_id.club_id
        elif event_or_id is not None:
            e_id = UUID(str(event_or_id)) if not isinstance(event_or_id, UUID) else event_or_id
            item_id_str = str(e_id)
            stmt = select(Event).where(Event.id == e_id)
            res = await self.db.execute(stmt)
            event = res.scalar_one_or_none()
            if event:
                custom_url = custom_url or event.cover_image_url
                club_id = club_id or event.club_id

        # Priority 1: Custom
        if custom_url and custom_url.strip():
            return ResolvedImageResult(
                content_type="event",
                resolved_url=custom_url.strip(),
                source="custom",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
            )

        # Priority 2: Club default
        if club_id:
            club = await self.get_club_by_id(club_id)
            if club and club.default_event_banner_url and club.default_event_banner_url.strip():
                return ResolvedImageResult(
                    content_type="event",
                    resolved_url=club.default_event_banner_url.strip(),
                    source="club_default",
                    item_id=item_id_str,
                    club_id=str(club_id),
                )

        # Priority 3: Platform default
        plat_url = await self.get_platform_banner_url("default_event_banner")
        if plat_url and plat_url.strip():
            return ResolvedImageResult(
                content_type="event",
                resolved_url=plat_url.strip(),
                source="platform_default",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
            )

        # Priority 4: Clean neutral no-image state
        return ResolvedImageResult(
            content_type="event",
            resolved_url=None,
            source="none",
            item_id=item_id_str,
            club_id=str(club_id) if club_id else None,
        )

    # ─── League Resolution ────────────────────────────────────────────────────

    async def resolve_league_banner(
        self,
        league_or_id: League | UUID | str | None = None,
        club_id: UUID | str | None = None,
        custom_url: str | None = None,
    ) -> ResolvedImageResult:
        item_id_str: str | None = None
        if isinstance(league_or_id, League):
            item_id_str = str(league_or_id.id)
            custom_url = custom_url or league_or_id.banner_image_url
            club_id = club_id or league_or_id.club_id
        elif league_or_id is not None:
            l_id = UUID(str(league_or_id)) if not isinstance(league_or_id, UUID) else league_or_id
            item_id_str = str(l_id)
            stmt = select(League).where(League.id == l_id)
            res = await self.db.execute(stmt)
            league = res.scalar_one_or_none()
            if league:
                custom_url = custom_url or league.banner_image_url
                club_id = club_id or league.club_id

        # Priority 1: Custom
        if custom_url and custom_url.strip():
            return ResolvedImageResult(
                content_type="league",
                resolved_url=custom_url.strip(),
                source="custom",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
            )

        # Priority 2: Club default
        if club_id:
            club = await self.get_club_by_id(club_id)
            if club and club.default_league_banner_url and club.default_league_banner_url.strip():
                return ResolvedImageResult(
                    content_type="league",
                    resolved_url=club.default_league_banner_url.strip(),
                    source="club_default",
                    item_id=item_id_str,
                    club_id=str(club_id),
                )

        # Priority 3: Platform default
        plat_url = await self.get_platform_banner_url("default_league_banner")
        if plat_url and plat_url.strip():
            return ResolvedImageResult(
                content_type="league",
                resolved_url=plat_url.strip(),
                source="platform_default",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
            )

        # Priority 4: Clean neutral no-image state
        return ResolvedImageResult(
            content_type="league",
            resolved_url=None,
            source="none",
            item_id=item_id_str,
            club_id=str(club_id) if club_id else None,
        )

    # ─── Lesson Resolution ────────────────────────────────────────────────────

    async def resolve_lesson_image(
        self,
        lesson_or_id: Lesson | UUID | str | None = None,
        club_id: UUID | str | None = None,
        custom_url: str | None = None,
    ) -> ResolvedImageResult:
        item_id_str: str | None = None
        if isinstance(lesson_or_id, Lesson):
            item_id_str = str(lesson_or_id.id)
            custom_url = custom_url or lesson_or_id.image_url or (
                lesson_or_id.lesson_type.image_url if getattr(lesson_or_id, "lesson_type", None) else None
            )
            club_id = club_id or lesson_or_id.club_id
        elif lesson_or_id is not None:
            les_id = UUID(str(lesson_or_id)) if not isinstance(lesson_or_id, UUID) else lesson_or_id
            item_id_str = str(les_id)
            stmt = select(Lesson).where(Lesson.id == les_id)
            res = await self.db.execute(stmt)
            lesson = res.scalar_one_or_none()
            if lesson:
                custom_url = custom_url or lesson.image_url or (
                    lesson.lesson_type.image_url if getattr(lesson, "lesson_type", None) else None
                )
                club_id = club_id or lesson.club_id

        # Priority 1: Custom
        if custom_url and custom_url.strip():
            return ResolvedImageResult(
                content_type="lesson",
                resolved_url=custom_url.strip(),
                source="custom",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
            )

        # Priority 2: Club default
        if club_id:
            club = await self.get_club_by_id(club_id)
            if club and club.default_lesson_banner_url and club.default_lesson_banner_url.strip():
                return ResolvedImageResult(
                    content_type="lesson",
                    resolved_url=club.default_lesson_banner_url.strip(),
                    source="club_default",
                    item_id=item_id_str,
                    club_id=str(club_id),
                )

        # Priority 3: Platform default
        plat_url = await self.get_platform_banner_url("default_lesson_banner")
        if plat_url and plat_url.strip():
            return ResolvedImageResult(
                content_type="lesson",
                resolved_url=plat_url.strip(),
                source="platform_default",
                item_id=item_id_str,
                club_id=str(club_id) if club_id else None,
            )

        # Priority 4: Clean neutral no-image state
        return ResolvedImageResult(
            content_type="lesson",
            resolved_url=None,
            source="none",
            item_id=item_id_str,
            club_id=str(club_id) if club_id else None,
        )

    # ─── Universal Resolver ───────────────────────────────────────────────────

    async def resolve_image(
        self,
        content_type: str,
        item_id: UUID | str | None = None,
        club_id: UUID | str | None = None,
        format: str | None = None,
        custom_url: str | None = None,
    ) -> ResolvedImageResult:
        """Route to appropriate resolution pipeline based on content type."""
        c_type = content_type.lower().strip()
        if c_type in ("tournament", "tournaments"):
            return await self.resolve_tournament_banner(
                tournament_or_id=item_id,
                club_id=club_id,
                format=format,
                custom_url=custom_url,
            )
        elif c_type in ("event", "events"):
            return await self.resolve_event_cover(
                event_or_id=item_id,
                club_id=club_id,
                custom_url=custom_url,
            )
        elif c_type in ("league", "leagues"):
            return await self.resolve_league_banner(
                league_or_id=item_id,
                club_id=club_id,
                custom_url=custom_url,
            )
        elif c_type in ("lesson", "lessons", "coaching"):
            return await self.resolve_lesson_image(
                lesson_or_id=item_id,
                club_id=club_id,
                custom_url=custom_url,
            )
        else:
            return ResolvedImageResult(
                content_type=content_type,
                resolved_url=custom_url,
                source="custom" if custom_url else "none",
                item_id=str(item_id) if item_id else None,
                club_id=str(club_id) if club_id else None,
            )

