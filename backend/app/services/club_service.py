"""
Club service — business logic for club operations and membership management.
Enforces owner safety rules, tenant isolation, and membership constraints.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.tournament import Tournament, TournamentStatus
from app.models.event import Event, EventRegistration, EventRegistrationStatus, EventStatus
from app.models.league import League, LeagueStatus
from app.models.lesson import Lesson, LessonRegistration, LessonRegistrationStatus, LessonStatus
from app.models.payment import Payment, PaymentStatus
from app.permissions import Permission, has_permission
from app.repositories.club_custom_role_repository import ClubCustomRoleRepository
from app.repositories.club_membership_repository import ClubMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.user_repository import UserRepository
from app.schemas.club import (
    ClubCreateRequest,
    ClubDashboardResponse,
    ClubResponse,
    ClubUpdateRequest,
    DashboardBookingsSummary,
    DashboardCompetitionsSummary,
    DashboardEventsLessonsSummary,
    DashboardMembershipsSummary,
    DashboardPaymentsSummary,
    DashboardStaffSummary,
    DashboardTodayScheduleItem,
    PublicClubResponse,
    UserClubResponse,
    ClubOperatingHoursResponse,
    ClubOperatingHoursUpdateRequest,
    OperatingHoursDisruptionItem,
    OperatingHoursDisruptionPreviewResponse,
)
from app.core.operating_hours import (
    WeeklyOperatingHours,
    build_weekly_schedule_dict,
    parse_time_value,
    WEEKDAY_NAMES,
)
from app.schemas.club_custom_role import (
    CustomRoleCreateRequest,
    CustomRoleResponse,
    CustomRoleUpdateRequest,
)
from app.schemas.club_membership import (
    ClubMembershipDetailResponse,
    MemberResponse,
)

logger = logging.getLogger(__name__)


def _build_member_response(m: ClubMembership) -> MemberResponse:
    profile_img: str | None = None
    if m.user and getattr(m.user, "player_profile", None):
        profile_img = m.user.player_profile.profile_image_url

    custom_role_id = m.custom_role_id
    custom_role_name = None
    perms: list[str] = []
    role_label = m.role.display_label

    if getattr(m, "custom_role", None):
        custom_role_name = m.custom_role.name
        role_label = m.custom_role.name
        perms = list(m.custom_role.permissions or [])
    elif m.role == ClubRole.CLUB_OWNER:
        from app.permissions import Permission
        perms = [p.value for p in Permission]
    else:
        from app.permissions import get_permissions
        perms = [p.value for p in get_permissions(m.role)]

    return MemberResponse(
        id=m.id,
        user_id=m.user_id,
        club_id=m.club_id,
        role=m.role,
        role_label=role_label,
        custom_role_id=custom_role_id,
        custom_role_name=custom_role_name,
        permissions=perms,
        is_active=m.is_active,
        user_email=m.user.email if m.user else "",
        user_full_name=m.user.full_name if m.user else None,
        profile_image_url=profile_img,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


class ClubService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.club_repo = ClubRepository(db)
        self.membership_repo = ClubMembershipRepository(db)
        self.user_repo = UserRepository(db)
        self.custom_role_repo = ClubCustomRoleRepository(db)

    async def list_user_clubs(self, user_id: UUID) -> list[UserClubResponse]:
        """
        Return clubs the authenticated user belongs to.
        Includes membership ID, role, display label, and active status.
        Never returns clubs the user does not belong to.
        """
        memberships = await self.membership_repo.get_user_memberships(
            user_id, include_inactive=True
        )
        return [
            UserClubResponse(
                id=m.club.id,
                name=m.club.name,
                slug=m.club.slug,
                description=m.club.description,
                is_active=m.club.is_active,
                membership_id=m.id,
                role=m.role.value,
                role_label=m.role.display_label,
                membership_is_active=m.is_active,
                created_at=m.club.created_at,
                updated_at=m.club.updated_at,
            )
            for m in memberships
        ]

    async def create_club(
        self,
        owner_user_id: UUID,
        payload: ClubCreateRequest,
    ) -> UserClubResponse:
        """
        Create a new club and establish the authenticated user as the initial Club Owner.
        Fully transactional: if membership creation fails, club creation is rolled back.
        """
        import re

        # Determine unique slug
        if payload.slug and payload.slug.strip():
            slug = payload.slug.strip().lower()
        else:
            base_slug = re.sub(r"[^a-z0-9]+", "-", payload.name.lower()).strip("-")
            slug = base_slug if base_slug else "club"

        # Check slug availability
        existing_club = await self.club_repo.get_by_slug(slug)
        if existing_club:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A club with this slug already exists",
            )

        # Create Club entity
        club_data = payload.model_dump(exclude_unset=True)
        club_data["slug"] = slug
        club = Club(**club_data, is_active=True)

        try:
            self.db.add(club)
            await self.db.flush()
            await self.db.refresh(club)

            # Establish initial owner membership transactionally
            membership = await self.membership_repo.create(
                user_id=owner_user_id,
                club_id=club.id,
                role=ClubRole.CLUB_OWNER,
                is_active=True,
            )
            await self.db.commit()
            await self.db.refresh(membership)
            await self.db.refresh(club)

            # Initialize standard default lesson types for the new club
            try:
                from app.services.lesson_service import LessonService
                await LessonService(self.db).seed_default_lesson_types(club.id)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning("Default lesson types seeding skipped for club %s: %s", club.id, e)
        except HTTPException:
            await self.db.rollback()
            raise
        except Exception as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create club: {str(exc)}",
            )

        return UserClubResponse(
            id=club.id,
            name=club.name,
            slug=club.slug,
            short_description=club.short_description,
            description=club.description,
            city=club.city,
            state=club.state,
            is_active=club.is_active,
            membership_id=membership.id,
            role=membership.role.value,
            role_label=membership.role.display_label,
            membership_is_active=membership.is_active,
            created_at=club.created_at,
            updated_at=club.updated_at,
        )

    async def get_club(self, user_id: UUID, club_id: UUID) -> ClubResponse:
        """
        Return the authenticated user's accessible club.
        Enforces:
        - Club must exist (404 if not found).
        - User must belong to the club (404/403: do not expose another user's club).
        - Membership must be active (403 if inactive).
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        membership = await self.membership_repo.get_by_user_and_club(
            user_id=user_id,
            club_id=club_id,
            include_inactive=True,
        )
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this club",
            )

        if not membership.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your membership in this club is inactive",
            )

        return ClubResponse.model_validate(club)

    async def update_club(
        self,
        club_id: UUID,
        payload: ClubUpdateRequest,
    ) -> ClubResponse:
        """
        Update club settings/profile information.
        Enforces tenant isolation and validated payload constraints.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        update_data = payload.model_dump(exclude_unset=True)
        if not update_data:
            return ClubResponse.model_validate(club)

        # Time range safety check
        opening = update_data.get("opening_time", club.opening_time)
        closing = update_data.get("closing_time", club.closing_time)
        if opening and closing and opening >= closing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Opening time must be earlier than closing time",
            )

        if "operating_hours" in update_data and update_data["operating_hours"] is not None:
            val = update_data["operating_hours"]
            if hasattr(val, "to_dict"):
                update_data["operating_hours"] = val.to_dict()

        updated = await self.club_repo.update(club, **update_data)
        await self.db.commit()
        return ClubResponse.model_validate(updated)

    async def get_operating_hours(self, club_id: UUID) -> ClubOperatingHoursResponse:
        """Retrieve full weekly operating schedule for the club."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )
        schedule = build_weekly_schedule_dict(club)
        return ClubOperatingHoursResponse(
            club_id=club.id,
            timezone=club.timezone or "UTC",
            operating_hours=schedule,
            fallback_opening_time=club.opening_time,
            fallback_closing_time=club.closing_time,
        )

    async def update_operating_hours(
        self,
        club_id: UUID,
        payload: ClubOperatingHoursUpdateRequest,
    ) -> ClubOperatingHoursResponse:
        """
        Persist weekly operating hours for the club.
        Does not cancel or alter existing confirmed bookings.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        hours_dict = payload.operating_hours.to_dict()
        await self.club_repo.update(club, operating_hours=hours_dict)
        await self.db.commit()

        schedule = build_weekly_schedule_dict(club)
        return ClubOperatingHoursResponse(
            club_id=club.id,
            timezone=club.timezone or "UTC",
            operating_hours=schedule,
            fallback_opening_time=club.opening_time,
            fallback_closing_time=club.closing_time,
        )

    async def preview_operating_hours_disruptions(
        self,
        club_id: UUID,
        payload: ClubOperatingHoursUpdateRequest,
    ) -> OperatingHoursDisruptionPreviewResponse:
        """
        Preview upcoming confirmed bookings that would fall outside the proposed schedule.
        Never alters or cancels any bookings.
        """
        import zoneinfo

        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        try:
            club_tz = zoneinfo.ZoneInfo(club.timezone or "UTC")
        except Exception:
            club_tz = timezone.utc

        now = datetime.now(timezone.utc)
        stmt = (
            select(Booking)
            .where(
                Booking.club_id == club_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.start_at >= now,
            )
            .order_by(Booking.start_at.asc())
        )
        res = await self.db.execute(stmt)
        upcoming = list(res.scalars().all())

        hours_dict = payload.operating_hours.to_dict()
        disrupted: list[OperatingHoursDisruptionItem] = []

        for b in upcoming:
            local_start = b.start_at.astimezone(club_tz)
            local_end = b.end_at.astimezone(club_tz)
            day_name = WEEKDAY_NAMES[local_start.date().weekday()]

            is_affected = False
            if day_name in hours_dict:
                cfg = hours_dict[day_name]
                if cfg.get("is_closed"):
                    is_affected = True
                else:
                    o_t = parse_time_value(cfg.get("open_time"))
                    c_t = parse_time_value(cfg.get("close_time"))
                    if o_t and local_start.time() < o_t:
                        is_affected = True
                    if c_t and c_t != time(0, 0) and local_end.time() > c_t:
                        is_affected = True

            if is_affected:
                court_name = b.court.name if getattr(b, "court", None) else "Court"
                disrupted.append(
                    OperatingHoursDisruptionItem(
                        booking_id=b.id,
                        court_id=b.court_id,
                        court_name=court_name,
                        player_id=b.player_id,
                        start_at=b.start_at,
                        end_at=b.end_at,
                        status=b.status.value,
                    )
                )

        count = len(disrupted)
        msg = (
            f"Changing operating hours will affect {count} upcoming confirmed booking(s). "
            "Existing reservations are preserved in the system but fall outside the proposed operating window."
            if count > 0
            else "No upcoming confirmed bookings are affected by this schedule change."
        )

        return OperatingHoursDisruptionPreviewResponse(
            affected_bookings_count=count,
            affected_bookings=disrupted,
            message=msg,
        )

    async def upload_club_logo(
        self,
        club_id: UUID,
        image_data: str,
    ) -> ClubResponse:
        """
        Upload or replace club logo with base64 data or persistent URL.
        """
        import base64
        import os
        import time

        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        data_str = image_data.strip()
        if not data_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Image data is required",
            )

        if (
            data_str.startswith("http://")
            or data_str.startswith("https://")
            or data_str.startswith("/uploads/")
        ):
            old_logo_url = club.logo_url
            updated = await self.club_repo.update(club, logo_url=data_str)
            await self.db.commit()
            if old_logo_url and old_logo_url != data_str:
                try:
                    from app.services.media_storage_service import MediaStorageService
                    await MediaStorageService(self.db).cleanup_unreferenced_by_url(old_logo_url, club.id)
                except Exception:
                    pass
            return ClubResponse.model_validate(updated)

        ext = "png"
        raw_b64 = data_str
        if data_str.startswith("data:image/"):
            header, _, b64_part = data_str.partition(";base64,")
            if b64_part:
                raw_b64 = b64_part
                mime = header.split(":")[-1]
                if "png" in mime:
                    ext = "png"
                elif "webp" in mime:
                    ext = "webp"
                elif "jpeg" in mime or "jpg" in mime:
                    ext = "jpg"
                elif "svg" in mime:
                    ext = "svg"

        try:
            image_bytes = base64.b64decode(raw_b64)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid base64 image data",
            )

        if len(image_bytes) > 5 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Image exceeds 5MB limit",
            )

        from app.services.media_storage_service import MediaStorageService

        old_logo_url = club.logo_url
        storage = MediaStorageService(self.db)
        public_url, _ = await storage.store_image(
            raw_bytes=image_bytes,
            category="logos",
            club_id=club.id,
            uploaded_by_user_id=None,
            asset_type="club_logo",
            original_filename=f"club_logo.{ext}",
        )
        updated = await self.club_repo.update(club, logo_url=public_url)
        await self.db.commit()

        if old_logo_url and old_logo_url != public_url:
            try:
                await storage.cleanup_unreferenced_by_url(old_logo_url, club.id)
            except Exception:
                pass

        return ClubResponse.model_validate(updated)

    async def get_public_club(self, identifier: str | UUID) -> PublicClubResponse:
        """
        Return public club information for players and discovery.
        Supports lookup by UUID or slug string without exposing private data.
        """
        club = None
        if isinstance(identifier, UUID):
            club = await self.club_repo.get_by_id(identifier)
        else:
            try:
                club_uuid = UUID(str(identifier).strip())
                club = await self.club_repo.get_by_id(club_uuid)
            except (ValueError, AttributeError):
                club = await self.club_repo.get_by_slug(str(identifier).strip().lower())

        if not club or not club.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )
        from app.models.court import Court, CourtStatus
        from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus

        court_count = await self.db.scalar(
            select(func.count(Court.id)).where(Court.club_id == club.id, Court.status == CourtStatus.ACTIVE)
        )
        member_count = await self.db.scalar(
            select(func.count(ClubPlayerMembership.id)).where(
                ClubPlayerMembership.club_id == club.id,
                ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
            )
        )
        data = PublicClubResponse.model_validate(club)
        data.court_count = court_count or 0
        data.member_count = member_count or 0
        return data

    async def get_public_club_by_slug(self, slug: str) -> PublicClubResponse:
        """Convenience method for explicit slug lookup."""
        return await self.get_public_club(identifier=slug)

    async def get_membership(
        self, user_id: UUID, club_id: UUID
    ) -> ClubMembershipDetailResponse:
        """
        Return the authenticated user's membership for a club.
        Ensures a user can only retrieve their own membership.
        """
        membership = await self.membership_repo.get_by_user_and_club(
            user_id=user_id,
            club_id=club_id,
            include_inactive=True,
        )
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership not found for this club",
            )

        if not membership.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Membership is inactive",
            )

        return ClubMembershipDetailResponse(
            id=membership.id,
            user_id=membership.user_id,
            club_id=membership.club_id,
            role=membership.role,
            role_label=membership.role.display_label,
            is_active=membership.is_active,
            created_at=membership.created_at,
            updated_at=membership.updated_at,
        )

    async def list_members(
        self,
        club_id: UUID,
        role: ClubRole | None = None,
        search: str | None = None,
        is_active: bool | None = None,
    ) -> list[MemberResponse]:
        """Return all members of the specified club with optional filtering."""
        memberships = await self.membership_repo.get_club_members(
            club_id=club_id, include_inactive=True
        )
        if role is not None:
            memberships = [m for m in memberships if m.role == role]
        if is_active is not None:
            memberships = [m for m in memberships if m.is_active is is_active]
        if search and search.strip():
            q = search.strip().lower()
            memberships = [
                m for m in memberships
                if (m.user and (q in m.user.email.lower() or (m.user.full_name and q in m.user.full_name.lower())))
                or q in m.role.value.lower()
            ]
        return [_build_member_response(m) for m in memberships]

    async def get_member(
        self, club_id: UUID, membership_id: UUID
    ) -> MemberResponse:
        """Retrieve details of a single staff member in the specified club."""
        target = await self.membership_repo.get_by_id(membership_id)
        if not target or target.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this club",
            )
        return _build_member_response(target)

    async def get_dashboard_summary(
        self,
        club_id: UUID,
        caller_role: ClubRole,
    ) -> ClubDashboardResponse:
        """
        Return server-aggregated operational metrics for the authorized club.
        Uses efficient SQL count/sum aggregations.
        Payments are only included if caller has MANAGE_PAYMENTS permission.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
        today_end = today_start + timedelta(days=1)

        # 1. Memberships
        total_players = (
            await self.db.scalar(
                select(func.count(ClubPlayerMembership.id)).where(
                    ClubPlayerMembership.club_id == club_id
                )
            )
        ) or 0
        active_players = (
            await self.db.scalar(
                select(func.count(ClubPlayerMembership.id)).where(
                    ClubPlayerMembership.club_id == club_id,
                    ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
                )
            )
        ) or 0
        pending_requests = (
            await self.db.scalar(
                select(func.count(ClubMembershipRequest.id)).where(
                    ClubMembershipRequest.club_id == club_id,
                    ClubMembershipRequest.status == MembershipRequestStatus.PENDING,
                )
            )
        ) or 0
        memberships_summary = DashboardMembershipsSummary(
            total_players=total_players,
            active_players=active_players,
            pending_requests=pending_requests,
        )

        # 2. Bookings
        today_bookings = (
            await self.db.scalar(
                select(func.count(Booking.id)).where(
                    Booking.club_id == club_id,
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.start_at >= today_start,
                    Booking.start_at < today_end,
                )
            )
        ) or 0
        upcoming_bookings = (
            await self.db.scalar(
                select(func.count(Booking.id)).where(
                    Booking.club_id == club_id,
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.start_at >= now,
                )
            )
        ) or 0
        bookings_summary = DashboardBookingsSummary(
            today_count=today_bookings,
            upcoming_count=upcoming_bookings,
        )

        # 3. Competitions
        upcoming_tournaments = (
            await self.db.scalar(
                select(func.count(Tournament.id)).where(
                    Tournament.club_id == club_id,
                    Tournament.status.in_([
                        TournamentStatus.REGISTRATION_OPEN,
                        TournamentStatus.REGISTRATION_CLOSED,
                        TournamentStatus.IN_PROGRESS,
                    ]),
                )
            )
        ) or 0
        upcoming_leagues = (
            await self.db.scalar(
                select(func.count(League.id)).where(
                    League.club_id == club_id,
                    League.status.in_([
                        LeagueStatus.REGISTRATION_OPEN,
                        LeagueStatus.REGISTRATION_CLOSED,
                        LeagueStatus.IN_PROGRESS,
                        LeagueStatus.PLAYOFFS,
                    ]),
                )
            )
        ) or 0
        competitions_summary = DashboardCompetitionsSummary(
            upcoming_tournaments=upcoming_tournaments,
            upcoming_leagues=upcoming_leagues,
        )

        # 4. Events & Lessons
        upcoming_events = (
            await self.db.scalar(
                select(func.count(Event.id)).where(
                    Event.club_id == club_id,
                    Event.status == EventStatus.PUBLISHED,
                    Event.end_at >= now,
                )
            )
        ) or 0
        upcoming_lessons = (
            await self.db.scalar(
                select(func.count(Lesson.id)).where(
                    Lesson.club_id == club_id,
                    Lesson.status == LessonStatus.PUBLISHED,
                    Lesson.end_at >= now,
                )
            )
        ) or 0

        # Today's active or next upcoming schedule item
        today_item = None
        try:
            event_res = await self.db.execute(
                select(Event)
                .where(
                    Event.club_id == club_id,
                    Event.status == EventStatus.PUBLISHED,
                    Event.end_at >= now,
                )
                .order_by(Event.start_at.asc())
                .limit(1)
            )
            first_event = event_res.scalar_one_or_none()

            lesson_res = await self.db.execute(
                select(Lesson)
                .options(selectinload(Lesson.court))
                .where(
                    Lesson.club_id == club_id,
                    Lesson.status == LessonStatus.PUBLISHED,
                    Lesson.end_at >= now,
                )
                .order_by(Lesson.start_at.asc())
                .limit(1)
            )
            first_lesson = lesson_res.scalar_one_or_none()

            # Pick whichever upcoming/active item starts earlier
            target_item_type: str | None = None
            if first_event and first_lesson:
                if first_event.start_at <= first_lesson.start_at:
                    target_item_type = "event"
                else:
                    target_item_type = "lesson"
            elif first_event:
                target_item_type = "event"
            elif first_lesson:
                target_item_type = "lesson"

            if target_item_type == "event" and first_event:
                event_reg_count = (
                    await self.db.scalar(
                        select(func.count(EventRegistration.id)).where(
                            EventRegistration.event_id == first_event.id,
                            EventRegistration.status.in_([
                                EventRegistrationStatus.REGISTERED,
                                EventRegistrationStatus.ATTENDED,
                                EventRegistrationStatus.NO_SHOW,
                            ]),
                        )
                    )
                ) or 0
                status_label = "Happening Now" if first_event.start_at <= now <= first_event.end_at else "Upcoming"
                today_item = DashboardTodayScheduleItem(
                    id=first_event.id,
                    title=first_event.title,
                    item_type="event",
                    status=first_event.status.value,
                    status_label=status_label,
                    start_at=first_event.start_at,
                    end_at=first_event.end_at,
                    location=first_event.location,
                    capacity=first_event.capacity,
                    registered_count=event_reg_count,
                )
            elif target_item_type == "lesson" and first_lesson:
                lesson_reg_count = (
                    await self.db.scalar(
                        select(func.count(LessonRegistration.id)).where(
                            LessonRegistration.lesson_id == first_lesson.id,
                            LessonRegistration.status.in_([
                                LessonRegistrationStatus.REGISTERED,
                                LessonRegistrationStatus.ATTENDED,
                                LessonRegistrationStatus.NO_SHOW,
                            ]),
                        )
                    )
                ) or 0
                court_name = (
                    (first_lesson.court.display_name or first_lesson.court.name)
                    if first_lesson.court
                    else None
                )
                status_label = "Happening Now" if first_lesson.start_at <= now <= first_lesson.end_at else "Upcoming"
                today_item = DashboardTodayScheduleItem(
                    id=first_lesson.id,
                    title=first_lesson.title,
                    item_type="lesson",
                    status=first_lesson.status.value,
                    status_label=status_label,
                    start_at=first_lesson.start_at,
                    end_at=first_lesson.end_at,
                    location=court_name,
                    capacity=first_lesson.capacity,
                    registered_count=lesson_reg_count,
                )
        except Exception as exc:
            logger.warning(
                "Failed to compute dashboard today_item for club %s: %s",
                club_id,
                exc,
                exc_info=True,
            )
            today_item = None

        events_lessons_summary = DashboardEventsLessonsSummary(
            upcoming_events=upcoming_events,
            upcoming_lessons=upcoming_lessons,
            today_item=today_item,
        )

        # 5. Payments (strictly permission-checked: Owner & Manager only)
        payments_summary = None
        if has_permission(caller_role, Permission.MANAGE_PAYMENTS):
            try:
                pending_count = (
                    await self.db.scalar(
                        select(func.count(Payment.id)).where(
                            Payment.club_id == club_id,
                            Payment.status == PaymentStatus.PENDING,
                        )
                    )
                ) or 0
                pending_amount = (
                    await self.db.scalar(
                        select(func.coalesce(func.sum(Payment.amount), 0)).where(
                            Payment.club_id == club_id,
                            Payment.status == PaymentStatus.PENDING,
                        )
                    )
                ) or Decimal("0.00")
                succeeded_count = (
                    await self.db.scalar(
                        select(func.count(Payment.id)).where(
                            Payment.club_id == club_id,
                            Payment.status == PaymentStatus.SUCCEEDED,
                        )
                    )
                ) or 0
                total_revenue = (
                    await self.db.scalar(
                        select(func.coalesce(func.sum(Payment.amount), 0)).where(
                            Payment.club_id == club_id,
                            Payment.status == PaymentStatus.SUCCEEDED,
                        )
                    )
                ) or Decimal("0.00")
                payments_summary = DashboardPaymentsSummary(
                    pending_count=pending_count,
                    pending_amount=Decimal(str(pending_amount)),
                    succeeded_count=succeeded_count,
                    total_revenue=Decimal(str(total_revenue)),
                )
            except Exception as exc:
                logger.warning(
                    "Failed to compute dashboard payments summary for club %s: %s",
                    club_id,
                    exc,
                    exc_info=True,
                )
                payments_summary = DashboardPaymentsSummary()

        # 6. Staff
        total_staff = (
            await self.db.scalar(
                select(func.count(ClubMembership.id)).where(
                    ClubMembership.club_id == club_id
                )
            )
        ) or 0
        active_staff = (
            await self.db.scalar(
                select(func.count(ClubMembership.id)).where(
                    ClubMembership.club_id == club_id,
                    ClubMembership.is_active.is_(True),
                )
            )
        ) or 0
        staff_summary = DashboardStaffSummary(
            total_staff=total_staff,
            active_staff=active_staff,
        )

        return ClubDashboardResponse(
            club_id=club.id,
            club_name=club.name,
            memberships=memberships_summary,
            bookings=bookings_summary,
            competitions=competitions_summary,
            events_and_lessons=events_lessons_summary,
            payments=payments_summary,
            staff=staff_summary,
        )

    async def add_member(
        self,
        club_id: UUID,
        email: str,
        role: ClubRole = ClubRole.STAFF_MEMBER,
        custom_role_id: UUID | None = None,
        full_name: str | None = None,
        temporary_password: str | None = None,
        actor_id: UUID | None = None,
        actor_email: str | None = None,
    ) -> MemberResponse:
        """
        Add or invite a staff member to the club with a designated built-in or custom role.
        Validates:
        - If custom_role_id is provided, verifies that it exists and belongs to club_id.
        - If user does not exist: creates User with full_name, email, and hashed password.
        - If user exists: updates full_name/password if provided.
        - If previously deactivated in club: reactivates with new role.
        - User is not already an active member of this club.
        """
        custom_role = None
        if custom_role_id:
            from app.repositories.club_custom_role_repository import ClubCustomRoleRepository
            custom_role = await ClubCustomRoleRepository(self.db).get_by_id(custom_role_id, club_id=club_id)
            if not custom_role:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Custom role not found in this club",
                )
            role = ClubRole.STAFF_MEMBER

        user = await self.user_repo.get_by_email(email)
        if not user:
            import secrets
            pwd = (
                temporary_password
                if temporary_password and temporary_password.strip()
                else f"Staff@{secrets.token_hex(4)}!"
            )
            hashed = hash_password(pwd)
            user = await self.user_repo.create(
                email=email,
                hashed_password=hashed,
                full_name=full_name or email.split("@")[0].capitalize(),
            )
        else:
            if full_name and not user.full_name:
                user.full_name = full_name
            if temporary_password and temporary_password.strip():
                user.hashed_password = hash_password(temporary_password)
            user.is_active = True

        existing = await self.membership_repo.get_by_user_and_club(
            user_id=user.id,
            club_id=club_id,
            include_inactive=True,
        )
        if existing and existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already an active member of this club",
            )

        assigned_label = custom_role.name if custom_role else role.display_label

        if existing and not existing.is_active:
            # Reactivate membership and update role
            updated = await self.membership_repo.update(
                existing,
                role=role,
                is_active=True,
                custom_role_id=custom_role_id,
                clear_custom_role=custom_role_id is None,
            )
            # Log audit
            from app.models.platform_audit_log import PlatformAuditLog
            self.db.add(
                PlatformAuditLog(
                    actor_id=actor_id,
                    actor_email=actor_email,
                    action="staff_role.reassigned",
                    entity_type="club_membership",
                    entity_id=str(updated.id),
                    entity_name=user.email,
                    reason=f"Reactivated staff member with role '{assigned_label}'",
                    details={
                        "club_id": str(club_id),
                        "role": role.value,
                        "custom_role_id": str(custom_role_id) if custom_role_id else None,
                    },
                )
            )
            await self.db.commit()
            try:
                from app.services.notification_service import NotificationService
                club_obj = await self.club_repo.get_by_id(club_id)
                c_name = club_obj.name if club_obj else "the club"
                await NotificationService(self.db).create_notification(
                    user_id=user.id,
                    club_id=club_id,
                    category="administrative",
                    title="Staff Role Assigned",
                    message=f"You have been assigned the role of {assigned_label} for {c_name}.",
                    data={
                        "resource_type": "club_membership",
                        "resource_id": str(updated.id),
                        "role": role.value,
                        "custom_role_id": str(custom_role_id) if custom_role_id else None,
                        "action_url": "/(club)/",
                    },
                    mandatory=True,
                )
                await self.db.commit()
            except Exception:
                pass
            return _build_member_response(updated)

        new_membership = await self.membership_repo.create(
            user_id=user.id,
            club_id=club_id,
            role=role,
            is_active=True,
            custom_role_id=custom_role_id,
        )

        # Log audit
        from app.models.platform_audit_log import PlatformAuditLog
        self.db.add(
            PlatformAuditLog(
                actor_id=actor_id,
                actor_email=actor_email,
                action="staff_role.assigned",
                entity_type="club_membership",
                entity_id=str(new_membership.id),
                entity_name=user.email,
                reason=f"Assigned staff role '{assigned_label}'",
                details={
                    "club_id": str(club_id),
                    "role": role.value,
                    "custom_role_id": str(custom_role_id) if custom_role_id else None,
                },
            )
        )
        await self.db.commit()
        try:
            from app.services.notification_service import NotificationService
            club_obj = await self.club_repo.get_by_id(club_id)
            c_name = club_obj.name if club_obj else "the club"
            await NotificationService(self.db).create_notification(
                user_id=user.id,
                club_id=club_id,
                category="administrative",
                title="Staff Role Assigned",
                message=f"You have been assigned the role of {assigned_label} for {c_name}.",
                data={
                    "resource_type": "club_membership",
                    "resource_id": str(new_membership.id),
                    "role": role.value,
                    "custom_role_id": str(custom_role_id) if custom_role_id else None,
                    "action_url": "/(club)/",
                },
                mandatory=True,
            )
            await self.db.commit()
        except Exception:
            pass
        return _build_member_response(new_membership)

    async def update_member(
        self,
        club_id: UUID,
        membership_id: UUID,
        role: ClubRole | None = None,
        custom_role_id: UUID | None = None,
        clear_custom_role: bool = False,
        is_active: bool | None = None,
        actor_id: UUID | None = None,
        actor_email: str | None = None,
    ) -> MemberResponse:
        """
        Update member role, custom role, and/or is_active status.
        Enforces Owner Safety Rules:
        - A club must always have at least one active owner.
        - Cannot demote the final active owner.
        - Cannot deactivate the final active owner.
        """
        target = await self.membership_repo.get_by_id(membership_id)
        if not target or target.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this club",
            )

        custom_role = None
        if custom_role_id is not None:
            from app.repositories.club_custom_role_repository import ClubCustomRoleRepository
            custom_role = await ClubCustomRoleRepository(self.db).get_by_id(custom_role_id, club_id=club_id)
            if not custom_role:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Custom role not found in this club",
                )
            role = ClubRole.STAFF_MEMBER
            clear_custom_role = False

        # Owner Safety Check
        if target.role == ClubRole.CLUB_OWNER and target.is_active:
            is_changing_role = (role is not None and role != ClubRole.CLUB_OWNER) or (custom_role_id is not None)
            is_deactivating = is_active is not None and is_active is False
            if is_changing_role or is_deactivating:
                active_owners = await self.membership_repo.count_active_owners(club_id)
                if active_owners <= 1:
                    detail = (
                        "Cannot change role: club must have at least one active owner"
                        if is_changing_role
                        else "Cannot deactivate the final active owner of the club"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=detail,
                    )

        updated = await self.membership_repo.update(
            target,
            role=role,
            is_active=is_active,
            custom_role_id=custom_role_id,
            clear_custom_role=clear_custom_role,
        )

        display_name = updated.custom_role.name if updated.custom_role else updated.role.display_label

        # Log audit
        from app.models.platform_audit_log import PlatformAuditLog
        self.db.add(
            PlatformAuditLog(
                actor_id=actor_id,
                actor_email=actor_email,
                action="staff_role.reassigned",
                entity_type="club_membership",
                entity_id=str(updated.id),
                entity_name=updated.user.email if updated.user else None,
                reason=f"Updated staff member role to '{display_name}'",
                details={
                    "club_id": str(club_id),
                    "role": updated.role.value,
                    "custom_role_id": str(updated.custom_role_id) if updated.custom_role_id else None,
                    "is_active": updated.is_active,
                },
            )
        )
        await self.db.commit()
        try:
            from app.services.notification_service import NotificationService
            club_obj = await self.club_repo.get_by_id(club_id)
            c_name = club_obj.name if club_obj else "the club"
            msg = f"Your role for {c_name} has been updated to {display_name}."
            await NotificationService(self.db).create_notification(
                user_id=target.user_id,
                club_id=club_id,
                category="administrative",
                title="Staff Role Updated",
                message=msg,
                data={
                    "resource_type": "club_membership",
                    "resource_id": str(target.id),
                    "role": updated.role.value,
                    "custom_role_id": str(updated.custom_role_id) if updated.custom_role_id else None,
                    "action_url": "/(club)/",
                },
                mandatory=True,
            )
            await self.db.commit()
        except Exception:
            pass
        return _build_member_response(updated)

    async def deactivate_member(
        self, club_id: UUID, membership_id: UUID
    ) -> MemberResponse:
        """
        Soft-deactivate a member (is_active = False).
        Preserves historical relationships without hard deletion.
        Enforces Owner Safety Rules:
        - Cannot deactivate the final active owner.
        """
        target = await self.membership_repo.get_by_id(membership_id)
        if not target or target.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this club",
            )

        if target.role == ClubRole.CLUB_OWNER and target.is_active:
            active_owners = await self.membership_repo.count_active_owners(club_id)
            if active_owners <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate the final active owner of the club",
                )

        deactivated = await self.membership_repo.deactivate(target)
        await self.db.commit()
        return _build_member_response(deactivated)

    async def list_custom_roles(self, club_id: UUID) -> list[CustomRoleResponse]:
        """
        List all custom roles defined for a club, including count of assigned staff members.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )
        roles = await self.custom_role_repo.list_by_club(club_id)
        items = []
        for r in roles:
            staff_count = await self.custom_role_repo.count_assigned_staff(r.id)
            items.append(
                CustomRoleResponse(
                    id=r.id,
                    club_id=r.club_id,
                    name=r.name,
                    description=r.description,
                    permissions=list(r.permissions or []),
                    staff_count=staff_count,
                    created_at=r.created_at,
                    updated_at=r.updated_at,
                )
            )
        return items

    async def get_custom_role(self, club_id: UUID, role_id: UUID) -> CustomRoleResponse:
        """
        Get details of a specific custom role within a club.
        """
        role = await self.custom_role_repo.get_by_id(role_id, club_id=club_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom role not found",
            )
        staff_count = await self.custom_role_repo.count_assigned_staff(role.id)
        return CustomRoleResponse(
            id=role.id,
            club_id=role.club_id,
            name=role.name,
            description=role.description,
            permissions=list(role.permissions or []),
            staff_count=staff_count,
            created_at=role.created_at,
            updated_at=role.updated_at,
        )

    async def create_custom_role(
        self,
        club_id: UUID,
        payload: CustomRoleCreateRequest,
        actor_id: UUID | None = None,
        actor_email: str | None = None,
    ) -> CustomRoleResponse:
        """
        Create a new custom staff role for the club with configured granular permissions.
        Enforces:
        - Unique role name per club.
        - Cannot use reserved system role names.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        name_lower = payload.name.strip().lower()
        reserved = {"club owner", "club manager", "tournament director", "staff member", "player", "admin", "platform admin"}
        if name_lower in reserved:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{payload.name}' is a reserved system role name. Please choose a different name.",
            )

        existing = await self.custom_role_repo.get_by_name(club_id, payload.name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A role named '{payload.name}' already exists in this club.",
            )

        new_role = await self.custom_role_repo.create(
            club_id=club_id,
            name=payload.name,
            description=payload.description,
            permissions=payload.permissions,
        )

        from app.models.platform_audit_log import PlatformAuditLog
        self.db.add(
            PlatformAuditLog(
                actor_id=actor_id,
                actor_email=actor_email,
                action="custom_role.created",
                entity_type="club_custom_role",
                entity_id=str(new_role.id),
                entity_name=new_role.name,
                reason=f"Created custom role '{new_role.name}' with {len(new_role.permissions or [])} permissions",
                details={
                    "club_id": str(club_id),
                    "name": new_role.name,
                    "permissions": new_role.permissions,
                },
            )
        )
        await self.db.commit()

        return CustomRoleResponse(
            id=new_role.id,
            club_id=new_role.club_id,
            name=new_role.name,
            description=new_role.description,
            permissions=list(new_role.permissions or []),
            staff_count=0,
            created_at=new_role.created_at,
            updated_at=new_role.updated_at,
        )

    async def update_custom_role(
        self,
        club_id: UUID,
        role_id: UUID,
        payload: CustomRoleUpdateRequest,
        actor_id: UUID | None = None,
        actor_email: str | None = None,
    ) -> CustomRoleResponse:
        """
        Update an existing custom role's name, description, and/or permissions.
        """
        role = await self.custom_role_repo.get_by_id(role_id, club_id=club_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom role not found",
            )

        updates: dict = {}
        if payload.name is not None:
            name_lower = payload.name.strip().lower()
            reserved = {"club owner", "club manager", "tournament director", "staff member", "player", "admin", "platform admin"}
            if name_lower in reserved:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"'{payload.name}' is a reserved system role name.",
                )
            existing = await self.custom_role_repo.get_by_name(club_id, payload.name, exclude_id=role.id)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A role named '{payload.name}' already exists in this club.",
                )
            updates["name"] = payload.name

        if payload.description is not None:
            updates["description"] = payload.description

        if payload.permissions is not None:
            updates["permissions"] = payload.permissions

        updated = await self.custom_role_repo.update(role, **updates)

        from app.models.platform_audit_log import PlatformAuditLog
        self.db.add(
            PlatformAuditLog(
                actor_id=actor_id,
                actor_email=actor_email,
                action="custom_role.updated",
                entity_type="club_custom_role",
                entity_id=str(updated.id),
                entity_name=updated.name,
                reason=f"Updated custom role '{updated.name}'",
                details={
                    "club_id": str(club_id),
                    "name": updated.name,
                    "permissions": updated.permissions,
                },
            )
        )
        await self.db.commit()

        staff_count = await self.custom_role_repo.count_assigned_staff(updated.id)
        return CustomRoleResponse(
            id=updated.id,
            club_id=updated.club_id,
            name=updated.name,
            description=updated.description,
            permissions=list(updated.permissions or []),
            staff_count=staff_count,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )

    async def delete_custom_role(
        self,
        club_id: UUID,
        role_id: UUID,
        reassign_to_role_id: UUID | None = None,
        actor_id: UUID | None = None,
        actor_email: str | None = None,
    ) -> dict:
        """
        Delete a custom role.
        Enforces deletion guard:
        - If active staff are assigned, requires reassign_to_role_id (or raises 400).
        - Reassigns staff members before removing the role.
        """
        role = await self.custom_role_repo.get_by_id(role_id, club_id=club_id)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom role not found",
            )

        staff_count = await self.custom_role_repo.count_assigned_staff(role.id)
        reassigned_count = 0
        if staff_count > 0:
            if not reassign_to_role_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot delete role '{role.name}' because {staff_count} staff member(s) are assigned to it. Please reassign them to another role first.",
                )
            if reassign_to_role_id == role_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot reassign to the same role being deleted.",
                )
            target_role = await self.custom_role_repo.get_by_id(reassign_to_role_id, club_id=club_id)
            if not target_role:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target reassignment role does not exist in this club.",
                )
            reassigned_count = await self.membership_repo.reassign_custom_role(
                club_id=club_id,
                from_role_id=role.id,
                to_role_id=target_role.id,
                target_role=target_role,
            )
            if hasattr(role, "memberships") and role.memberships:
                role.memberships.clear()

        role_name = role.name
        await self.custom_role_repo.delete(role)

        from app.models.platform_audit_log import PlatformAuditLog
        self.db.add(
            PlatformAuditLog(
                actor_id=actor_id,
                actor_email=actor_email,
                action="custom_role.deleted",
                entity_type="club_custom_role",
                entity_id=str(role_id),
                entity_name=role_name,
                reason=f"Deleted custom role '{role_name}' (reassigned {reassigned_count} staff)",
                details={
                    "club_id": str(club_id),
                    "deleted_role_name": role_name,
                    "reassigned_to_role_id": str(reassign_to_role_id) if reassign_to_role_id else None,
                    "reassigned_count": reassigned_count,
                },
            )
        )
        await self.db.commit()

        return {
            "success": True,
            "deleted_role_id": str(role_id),
            "reassigned_count": reassigned_count,
        }

    async def discover_public_clubs(
        self,
        search: str | None = None,
        city: str | None = None,
        state: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PublicClubDiscoveryResponse:
        """
        Public club discovery for players with search, filtering and pagination.
        Returns ONLY public club information for active clubs.
        """
        from sqlalchemy import func, or_, select
        from app.models.club import Club
        from app.schemas.club import PublicClubDiscoveryResponse, PublicClubResponse

        page = max(1, page)
        page_size = max(1, min(100, page_size))
        offset = (page - 1) * page_size

        query = select(Club).where(Club.is_active.is_(True))

        if search and search.strip():
            s = f"%{search.strip()}%"
            query = query.where(
                or_(
                    Club.name.ilike(s),
                    Club.short_description.ilike(s),
                    Club.city.ilike(s),
                    Club.state.ilike(s),
                )
            )

        if city and city.strip():
            query = query.where(Club.city.ilike(f"%{city.strip()}%"))

        if state and state.strip():
            query = query.where(Club.state.ilike(f"%{state.strip()}%"))

        count_query = select(func.count()).select_from(query.subquery())
        total_res = await self.db.execute(count_query)
        total = total_res.scalar_one()

        paged_query = query.order_by(Club.name.asc()).offset(offset).limit(page_size)
        result = await self.db.execute(paged_query)
        clubs = result.scalars().all()
        from app.models.court import Court, CourtStatus
        from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus

        items = []
        for c in clubs:
            court_count = await self.db.scalar(
                select(func.count(Court.id)).where(Court.club_id == c.id, Court.status == CourtStatus.ACTIVE)
            )
            member_count = await self.db.scalar(
                select(func.count(ClubPlayerMembership.id)).where(
                    ClubPlayerMembership.club_id == c.id,
                    ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
                )
            )
            item_data = PublicClubResponse.model_validate(c)
            item_data.court_count = court_count or 0
            item_data.member_count = member_count or 0
            items.append(item_data)
        has_more = (offset + len(items)) < total

        return PublicClubDiscoveryResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more,
        )
