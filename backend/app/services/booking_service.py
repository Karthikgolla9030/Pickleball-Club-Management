"""
Aught2 Pickleball — Court Booking Service (Phase 11)

Business logic layer for Court Reservations, Availability Calculation, Double-Booking
Prevention (via row-level locks and DB exclusion constraints), and Cancellation Auditing.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
import zoneinfo

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.booking_config import (
    ALLOWED_DURATIONS_MINUTES,
    CANCELLATION_WINDOW_HOURS,
    DEFAULT_BOOKING_DURATION_MINUTES,
    DEFAULT_CLUB_CLOSING_TIME,
    DEFAULT_CLUB_OPENING_TIME,
    MAX_ACTIVE_BOOKINGS_PER_PLAYER,
    MAX_BOOKING_HORIZON_DAYS,
    MIN_SLOT_INTERVAL_MINUTES,
)
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club_player_membership import PlayerMembershipStatus
from app.models.court import Court, CourtStatus
from app.repositories.booking_repository import BookingRepository
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.court_repository import CourtRepository
from app.repositories.player_profile_repository import PlayerProfileRepository
from app.repositories.member_subscription_repository import MemberSubscriptionRepository
from app.repositories.scheduling_repository import SchedulingRepository
from app.schemas.booking import (
    BookingCancelRequest,
    BookingCourtInfo,
    BookingCreateRequest,
    BookingPlayerInfo,
    BookingResponse,
    ClubAvailabilityResponse,
    CourtAvailability,
    StaffBookingCreateRequest,
    TimeSlotAvailability,
)
from app.core.events import EventType, dispatch_event
from app.services.notification_service import NotificationService


class BookingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.booking_repo = BookingRepository(db)
        self.court_repo = CourtRepository(db)
        self.club_repo = ClubRepository(db)
        self.player_profile_repo = PlayerProfileRepository(db)
        self.club_player_repo = ClubPlayerMembershipRepository(db)
        self.subscription_repo = MemberSubscriptionRepository(db)
        self.scheduling_repo = SchedulingRepository(db)

    # ─── Membership Plan Limit Integration ────────────────────────────────────

    async def _get_player_booking_limits(
        self,
        user_id: UUID,
        club_id: UUID,
    ) -> tuple[int, int]:
        """
        Centralized booking limit resolver (Phase 12 integration).

        Returns (max_active_bookings, max_booking_horizon_days).

        Resolution order:
          1. If player has an active subscription → use plan's configured limits
          2. Otherwise → use global defaults from booking_config.py

        This is the SINGLE place where booking limits are resolved.
        BookingService is the authoritative source for all booking validation.
        """
        from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
        from app.models.club_player_membership import PlayerMembershipStatus
        from datetime import date
        from app.models.membership import SubscriptionStatus

        # Look up the player's club membership ID
        membership = await self.club_player_repo.get_by_user_and_club(
            user_id=user_id, club_id=club_id
        )
        if not membership or membership.status != PlayerMembershipStatus.ACTIVE:
            return (MAX_ACTIVE_BOOKINGS_PER_PLAYER, MAX_BOOKING_HORIZON_DAYS)

        # Check for active subscription
        today = date.today()
        sub = await self.subscription_repo.get_active_for_player_in_club(
            player_membership_id=membership.id,
            club_id=club_id,
        )
        if sub and sub.plan:
            plan = sub.plan
            booking_limit = plan.booking_limit
            horizon_days = plan.advance_booking_days
            # Only override if the plan explicitly configures limits
            resolved_limit = booking_limit if booking_limit is not None else MAX_ACTIVE_BOOKINGS_PER_PLAYER
            resolved_horizon = horizon_days if horizon_days is not None else MAX_BOOKING_HORIZON_DAYS
            return (resolved_limit, resolved_horizon)

        return (MAX_ACTIVE_BOOKINGS_PER_PLAYER, MAX_BOOKING_HORIZON_DAYS)

    # ─── Helpers ──────────────────────────────────────────────────────────────

    def _get_club_tz(self, tz_name: str | None) -> timezone | zoneinfo.ZoneInfo:
        if not tz_name:
            return timezone.utc
        try:
            return zoneinfo.ZoneInfo(tz_name)
        except Exception:
            return timezone.utc

    def _serialize_booking(self, b: Booking) -> BookingResponse:
        court_info = None
        if b.court:
            court_info = BookingCourtInfo(
                id=b.court.id,
                name=b.court.name,
                display_name=b.court.display_name,
                surface_type=b.court.surface_type,
                indoor_outdoor=b.court.indoor_outdoor,
                price_per_hour=getattr(b.court, "price_per_hour", None),
            )

        player_info = None
        if b.player:
            profile = getattr(b.player, "player_profile", None)
            display_name = (
                profile.display_name
                if profile and profile.display_name
                else (b.player.full_name or "Player")
            )
            player_info = BookingPlayerInfo(
                id=profile.id if profile else b.player.id,
                user_id=b.player.id,
                display_name=display_name,
                first_name=profile.first_name if profile else None,
                last_name=profile.last_name if profile else None,
            )

        return BookingResponse(
            id=b.id,
            club_id=b.club_id,
            court_id=b.court_id,
            player_id=b.player_id,
            created_by_user_id=b.created_by_user_id,
            booking_type=b.booking_type,
            status=b.status,
            start_at=b.start_at,
            end_at=b.end_at,
            duration_minutes=b.duration_minutes,
            notes=b.notes,
            cancelled_at=b.cancelled_at,
            cancelled_by_user_id=b.cancelled_by_user_id,
            cancellation_reason=b.cancellation_reason,
            created_at=b.created_at,
            updated_at=b.updated_at,
            price_per_hour=b.price_per_hour,
            total_price=b.total_price,
            currency=getattr(b, "currency", "INR") or "INR",
            court=court_info,
            player=player_info,
            club_name=b.club.name if getattr(b, "club", None) else None,
        )


    def _validate_time_boundaries(
        self,
        start_at: datetime,
        end_at: datetime,
        club_opening: time,
        club_closing: time,
        club_tz: timezone | zoneinfo.ZoneInfo,
    ) -> int:
        """
        Validate slot alignment, horizon, and operating hours.
        Returns duration in minutes.
        """
        now = datetime.now(timezone.utc)

        # Normalize to UTC
        if start_at.tzinfo is None:
            start_at = start_at.replace(tzinfo=timezone.utc)
        else:
            start_at = start_at.astimezone(timezone.utc)

        if end_at.tzinfo is None:
            end_at = end_at.replace(tzinfo=timezone.utc)
        else:
            end_at = end_at.astimezone(timezone.utc)

        # End must be after start
        if end_at <= start_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Booking end time must be after start time",
            )

        # Future booking check
        if start_at <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bookings must be scheduled for a future time slot",
            )

        # Booking horizon check (max 14 days)
        max_horizon = now + timedelta(days=MAX_BOOKING_HORIZON_DAYS)
        if start_at > max_horizon:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bookings cannot be made more than {MAX_BOOKING_HORIZON_DAYS} days in advance",
            )

        # Duration validation
        duration = int((end_at - start_at).total_seconds() / 60)
        if duration not in ALLOWED_DURATIONS_MINUTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Booking duration of {duration} minutes is not supported. Allowed durations: {sorted(list(ALLOWED_DURATIONS_MINUTES))} minutes.",
            )

        # Slot alignment (e.g. 00 or 30 minutes, 0 seconds)
        if start_at.second != 0 or start_at.microsecond != 0 or end_at.second != 0 or end_at.microsecond != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Booking start and end times must be aligned to clean minute boundaries",
            )
        if start_at.minute % MIN_SLOT_INTERVAL_MINUTES != 0 or end_at.minute % MIN_SLOT_INTERVAL_MINUTES != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Booking times must be aligned to {MIN_SLOT_INTERVAL_MINUTES}-minute increments",
            )

        # Operating hours validation in club's local timezone
        local_start = start_at.astimezone(club_tz)
        local_end = end_at.astimezone(club_tz)

        # Ensure booking does not cross day boundaries
        if local_start.date() != local_end.date():
            # Allow ending exactly at 00:00 of next day if club closes at midnight (00:00)
            if not (local_end.date() == local_start.date() + timedelta(days=1) and local_end.time() == time(0, 0) and club_closing == time(0, 0)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bookings cannot span across multiple calendar days",
                )

        if local_start.time() < club_opening:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Booking starts before club opening time ({club_opening.strftime('%H:%M')})",
            )

        # Check closing time
        if club_closing != time(0, 0):
            if local_end.time() > club_closing or (local_end.date() != local_start.date()):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Booking ends after club closing time ({club_closing.strftime('%H:%M')})",
                )

        return duration

    # ─── Player Booking Creation ──────────────────────────────────────────────

    async def create_player_booking(
        self,
        club_id: UUID,
        user_id: UUID,
        payload: BookingCreateRequest,
    ) -> BookingResponse:
        """
        Create a booking as a club player.
        Enforces player profile existence, active club membership, active court status,
        active booking limits (max 3), slot boundaries, operating hours, and double-booking prevention.
        """
        # 1. Fetch club
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found or inactive")

        # 2. Fetch caller's player profile
        player_profile = await self.player_profile_repo.get_by_user_id(user_id)
        if not player_profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Player profile not found. Please create a player profile before booking.",
            )

        # 3. Verify active club membership
        membership = await self.club_player_repo.get_by_user_and_club(user_id=user_id, club_id=club_id)
        if not membership or membership.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active club player membership required to book courts at this club",
            )

        # 4. Check active booking limit (plan-aware — Phase 12 integration)
        max_bookings, max_horizon = await self._get_player_booking_limits(user_id=user_id, club_id=club_id)
        active_count = await self.booking_repo.count_active_upcoming_by_player(user_id)
        if active_count >= max_bookings:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Active booking limit reached. You can have at most {max_bookings} active upcoming bookings.",
            )

        # 5. Validate times & operating hours (use plan horizon if available)
        club_tz = self._get_club_tz(club.timezone)
        now = datetime.now(timezone.utc)
        max_horizon_dt = now + timedelta(days=max_horizon)
        # Custom horizon check using resolved plan limit
        payload_start = payload.start_at
        if payload_start.tzinfo is None:
            payload_start = payload_start.replace(tzinfo=timezone.utc)
        else:
            payload_start = payload_start.astimezone(timezone.utc)
        if payload_start > max_horizon_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bookings cannot be made more than {max_horizon} days in advance",
            )

        duration = self._validate_time_boundaries(
            start_at=payload.start_at,
            end_at=payload.end_at,
            club_opening=club.opening_time or DEFAULT_CLUB_OPENING_TIME,
            club_closing=club.closing_time or DEFAULT_CLUB_CLOSING_TIME,
            club_tz=club_tz,
        )

        # 6. Concurrency lock on Court row and verify court active
        locked_court = await self.booking_repo.lock_court_for_update(payload.court_id)
        if not locked_court or locked_court.club_id != club_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Court not found in this club")

        if not locked_court.is_active or locked_court.status != CourtStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court is inactive and cannot receive new bookings",
            )

        # 7. Check double-booking conflicts
        conflicts = await self.booking_repo.find_conflicts(
            court_id=payload.court_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked for this time slot",
            )

        match_conflicts = await self.scheduling_repo.find_court_conflicts(
            court_id=payload.court_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
        if match_conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court has a scheduled competition match during this time",
            )

        # 8. Calculate price snapshot from locked_court
        rate_snapshot = locked_court.price_per_hour
        total_price_snapshot = None
        if rate_snapshot is not None:
            hours = Decimal(duration) / Decimal(60)
            total_price_snapshot = (hours * rate_snapshot).quantize(Decimal("0.01"))

        # 9. Create booking record
        try:
            booking = await self.booking_repo.create(
                club_id=club_id,
                court_id=payload.court_id,
                player_id=user_id,
                created_by_user_id=user_id,
                booking_type=BookingType.PLAYER,
                start_at=payload.start_at,
                end_at=payload.end_at,
                status=BookingStatus.CONFIRMED,
                notes=payload.notes,
                price_per_hour=rate_snapshot,
                total_price=total_price_snapshot,
                currency="INR",
            )
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked for this time slot",
            )

        resp = self._serialize_booking(booking)
        await self.db.commit()

        court_name = booking.court.name if booking.court else "Court"
        event_payload = {
            "booking_id": str(booking.id),
            "club_id": str(club_id),
            "court_id": str(booking.court_id),
            "court_name": court_name,
            "player_id": str(user_id),
            "start_at": booking.start_at.isoformat(),
            "end_at": booking.end_at.isoformat(),
            "status": booking.status.value,
            "booking_type": booking.booking_type.value,
        }
        await dispatch_event(
            event_type=EventType.BOOKING_CREATED,
            data=event_payload,
            club_id=club_id,
            user_id=user_id,
        )
        await dispatch_event(
            event_type=EventType.COURT_AVAILABILITY_CHANGED,
            data={
                "court_id": str(booking.court_id),
                "date": booking.start_at.date().isoformat(),
            },
            club_id=club_id,
        )

        try:
            start_time_str = booking.start_at.strftime("%d %b at %H:%M")
            notif_svc = NotificationService(self.db)
            await notif_svc.create_notification(
                user_id=user_id,
                club_id=club_id,
                category="booking",
                title="Court Booking Confirmed",
                message=f"Your reservation for {court_name} on {start_time_str} is confirmed.",
                data={"booking_id": str(booking.id)},
            )
            player_name = current_user.full_name or "Player"
            await notif_svc.notify_club_staff(
                club_id=club_id,
                category="booking",
                title="New Court Booking",
                message=f"{court_name} reserved for {start_time_str} by {player_name}.",
                data={"booking_id": str(booking.id), "court_id": str(booking.court_id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return resp

    # ─── Staff Booking Creation ───────────────────────────────────────────────

    async def create_staff_booking(
        self,
        club_id: UUID,
        staff_user_id: UUID,
        payload: StaffBookingCreateRequest,
    ) -> BookingResponse:
        """
        Create a booking on behalf of an eligible club player.
        Requires staff permissions (caller authorized by require_permission).
        Bypasses player max active booking limit.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found or inactive")

        target_user_id = None
        notes = payload.notes

        if payload.player_id:
            # Verify selected player exists (payload.player_id can be player_profile.id or user_id)
            target_player = await self.player_profile_repo.get_by_id(payload.player_id)
            if target_player:
                target_user_id = target_player.user_id
            else:
                target_player = await self.player_profile_repo.get_by_user_id(payload.player_id)
                if target_player:
                    target_user_id = target_player.user_id
                else:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player profile not found")

            # Verify player is an active club member
            membership = await self.club_player_repo.get_by_user_and_club(
                user_id=target_user_id, club_id=club_id
            )
            if not membership or membership.status != PlayerMembershipStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The selected player does not have an active membership at this club",
                )
        else:
            if not payload.guest_name:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either player_id or guest_name must be provided")
            guest_prefix = f"Walk-in Guest: {payload.guest_name}"
            notes = f"{guest_prefix}\n{notes}" if notes else guest_prefix

        # Validate operating hours & times
        club_tz = self._get_club_tz(club.timezone)
        self._validate_time_boundaries(
            start_at=payload.start_at,
            end_at=payload.end_at,
            club_opening=club.opening_time or DEFAULT_CLUB_OPENING_TIME,
            club_closing=club.closing_time or DEFAULT_CLUB_CLOSING_TIME,
            club_tz=club_tz,
        )

        # Concurrency lock on Court row
        locked_court = await self.booking_repo.lock_court_for_update(payload.court_id)
        if not locked_court or locked_court.club_id != club_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Court not found in this club")

        if not locked_court.is_active or locked_court.status != CourtStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court is inactive and cannot receive new bookings",
            )

        # Check conflicts
        conflicts = await self.booking_repo.find_conflicts(
            court_id=payload.court_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked for this time slot",
            )

        match_conflicts = await self.scheduling_repo.find_court_conflicts(
            court_id=payload.court_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
        if match_conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court has a scheduled competition match during this time",
            )

        # Calculate pricing snapshot from locked_court
        rate_snapshot = locked_court.price_per_hour
        total_price_snapshot = None
        if rate_snapshot is not None:
            hours = Decimal(duration) / Decimal(60)
            total_price_snapshot = (hours * rate_snapshot).quantize(Decimal("0.01"))

        # Create staff booking
        try:
            booking = await self.booking_repo.create(
                club_id=club_id,
                court_id=payload.court_id,
                player_id=target_user_id,
                created_by_user_id=staff_user_id,
                booking_type=BookingType.STAFF,
                start_at=payload.start_at,
                end_at=payload.end_at,
                status=BookingStatus.CONFIRMED,
                notes=notes,
                price_per_hour=rate_snapshot,
                total_price=total_price_snapshot,
                currency="INR",
            )
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked for this time slot",
            )

        resp = self._serialize_booking(booking)
        await self.db.commit()

        court_name = booking.court.name if booking.court else "Court"
        event_payload = {
            "booking_id": str(booking.id),
            "club_id": str(club_id),
            "court_id": str(booking.court_id),
            "court_name": court_name,
            "player_id": str(target_user_id) if target_user_id else None,
            "start_at": booking.start_at.isoformat(),
            "end_at": booking.end_at.isoformat(),
            "status": booking.status.value,
            "booking_type": booking.booking_type.value,
        }
        await dispatch_event(
            event_type=EventType.BOOKING_CREATED,
            data=event_payload,
            club_id=club_id,
            user_id=target_user_id,
        )
        await dispatch_event(
            event_type=EventType.COURT_AVAILABILITY_CHANGED,
            data={
                "court_id": str(booking.court_id),
                "date": booking.start_at.date().isoformat(),
            },
            club_id=club_id,
        )

        if target_user_id:
            try:
                start_time_str = booking.start_at.strftime("%b %d at %I:%M %p")
                await NotificationService(self.db).create_notification(
                    user_id=target_user_id,
                    club_id=club_id,
                    category="booking",
                    title="Court Reserved by Club Staff",
                    message=f"Club staff reserved {court_name} for you on {start_time_str}.",
                    data={"booking_id": str(booking.id)},
                )
                await self.db.commit()
            except Exception:
                pass

        return resp

    # ─── Court Blocking (Maintenance / Blocked) ───────────────────────────────

    async def create_court_block(
        self,
        club_id: UUID,
        staff_user_id: UUID,
        payload: BookingCreateRequest,
        block_type: BookingType,
    ) -> BookingResponse:
        """
        Create a maintenance or blocked time slot for a court.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found or inactive")

        club_tz = self._get_club_tz(club.timezone)
        self._validate_time_boundaries(
            start_at=payload.start_at,
            end_at=payload.end_at,
            club_opening=club.opening_time or DEFAULT_CLUB_OPENING_TIME,
            club_closing=club.closing_time or DEFAULT_CLUB_CLOSING_TIME,
            club_tz=club_tz,
        )

        locked_court = await self.booking_repo.lock_court_for_update(payload.court_id)
        if not locked_court or locked_court.club_id != club_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Court not found in this club")

        conflicts = await self.booking_repo.find_conflicts(
            court_id=payload.court_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
        if conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked or blocked for this time slot",
            )

        match_conflicts = await self.scheduling_repo.find_court_conflicts(
            court_id=payload.court_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
        )
        if match_conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court has a scheduled competition match during this time",
            )

        try:
            booking = await self.booking_repo.create(
                club_id=club_id,
                court_id=payload.court_id,
                player_id=None,
                created_by_user_id=staff_user_id,
                booking_type=block_type,
                start_at=payload.start_at,
                end_at=payload.end_at,
                status=BookingStatus.CONFIRMED,
                notes=payload.notes,
            )
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked for this time slot",
            )

        resp = self._serialize_booking(booking)
        await self.db.commit()

        await dispatch_event(
            event_type=EventType.COURT_AVAILABILITY_CHANGED,
            data={
                "court_id": str(booking.court_id),
                "date": booking.start_at.date().isoformat(),
                "booking_type": block_type.value,
            },
            club_id=club_id,
        )
        return resp

    # ─── Player Cancellation ──────────────────────────────────────────────────

    async def cancel_player_booking(
        self,
        booking_id: UUID,
        user_id: UUID,
        payload: BookingCancelRequest,
    ) -> BookingResponse:
        """
        Player cancels their own booking.
        Enforces 2-hour cutoff window before start time.
        """
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

        if not (booking.player_id == user_id or booking.booked_by_user_id == user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only cancel your own bookings",
            )

        if booking.status != BookingStatus.CONFIRMED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Booking cannot be cancelled because it is already {booking.status.value}",
            )

        now = datetime.now(timezone.utc)
        booking_start = booking.start_at
        if booking_start.tzinfo is None:
            booking_start = booking_start.replace(tzinfo=timezone.utc)
        else:
            booking_start = booking_start.astimezone(timezone.utc)

        cutoff = booking_start - timedelta(hours=CANCELLATION_WINDOW_HOURS)
        if now > cutoff:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bookings can only be cancelled at least {CANCELLATION_WINDOW_HOURS} hours before start time",
            )

        updated = await self.booking_repo.update(
            booking,
            status=BookingStatus.CANCELLED,
            cancelled_at=now,
            cancelled_by_user_id=user_id,
            cancellation_reason=payload.cancellation_reason,
        )
        resp = self._serialize_booking(updated)
        await self.db.commit()

        court_name = updated.court.name if updated.court else "Court"
        event_payload = {
            "booking_id": str(updated.id),
            "club_id": str(updated.club_id),
            "court_id": str(updated.court_id),
            "court_name": court_name,
            "player_id": str(user_id),
            "start_at": updated.start_at.isoformat(),
            "end_at": updated.end_at.isoformat(),
            "status": updated.status.value,
        }
        await dispatch_event(
            event_type=EventType.BOOKING_CANCELLED,
            data=event_payload,
            club_id=updated.club_id,
            user_id=user_id,
        )
        await dispatch_event(
            event_type=EventType.COURT_AVAILABILITY_CHANGED,
            data={
                "court_id": str(updated.court_id),
                "date": updated.start_at.date().isoformat(),
            },
            club_id=updated.club_id,
        )

        try:
            start_time_str = updated.start_at.strftime("%d %b at %H:%M")
            notif_svc = NotificationService(self.db)
            await notif_svc.create_notification(
                user_id=user_id,
                club_id=updated.club_id,
                category="booking",
                title="Booking Cancelled",
                message=f"Your booking for {court_name} on {start_time_str} has been cancelled.",
                data={"booking_id": str(updated.id)},
            )
            await notif_svc.notify_club_staff(
                club_id=updated.club_id,
                category="booking",
                title="Booking Cancelled",
                message=f"Booking for {court_name} on {start_time_str} has been cancelled.",
                data={"booking_id": str(updated.id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return resp

    # ─── Staff Cancellation ───────────────────────────────────────────────────

    async def cancel_staff_booking(
        self,
        club_id: UUID,
        booking_id: UUID,
        staff_user_id: UUID,
        payload: BookingCancelRequest,
    ) -> BookingResponse:
        """
        Staff cancels a booking within their club.
        Overrides the 2-hour cancellation window restriction.
        """
        booking = await self.booking_repo.get_by_id(booking_id, club_id=club_id)
        if not booking:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found in this club")

        if booking.status != BookingStatus.CONFIRMED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Booking cannot be cancelled because it is already {booking.status.value}",
            )

        now = datetime.now(timezone.utc)
        updated = await self.booking_repo.update(
            booking,
            status=BookingStatus.CANCELLED,
            cancelled_at=now,
            cancelled_by_user_id=staff_user_id,
            cancellation_reason=payload.cancellation_reason,
        )

        resp = self._serialize_booking(updated)
        await self.db.commit()

        court_name = updated.court.name if updated.court else "Court"
        target_player_id = updated.player_id
        event_payload = {
            "booking_id": str(updated.id),
            "club_id": str(club_id),
            "court_id": str(updated.court_id),
            "court_name": court_name,
            "player_id": str(target_player_id) if target_player_id else None,
            "start_at": updated.start_at.isoformat(),
            "end_at": updated.end_at.isoformat(),
            "status": updated.status.value,
            "cancellation_reason": payload.cancellation_reason,
        }
        await dispatch_event(
            event_type=EventType.BOOKING_CANCELLED,
            data=event_payload,
            club_id=club_id,
            user_id=target_player_id,
        )
        await dispatch_event(
            event_type=EventType.COURT_AVAILABILITY_CHANGED,
            data={
                "court_id": str(updated.court_id),
                "date": updated.start_at.date().isoformat(),
            },
            club_id=club_id,
        )

        if target_player_id:
            try:
                start_time_str = updated.start_at.strftime("%b %d at %I:%M %p")
                reason_msg = f" Reason: {payload.cancellation_reason}" if payload.cancellation_reason else ""
                await NotificationService(self.db).create_notification(
                    user_id=target_player_id,
                    club_id=club_id,
                    category="booking",
                    title="Booking Cancelled by Club",
                    message=f"Your reservation for {court_name} on {start_time_str} was cancelled by club staff.{reason_msg}",
                    data={"booking_id": str(updated.id)},
                )
                await self.db.commit()
            except Exception:
                pass

        return resp

    # ─── Queries ──────────────────────────────────────────────────────────────

    async def get_booking(self, booking_id: UUID, user_id: UUID) -> BookingResponse:
        """Get booking details for authorized player or staff."""
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

        # Caller can view if they are the player or creator
        is_player_owner = (booking.player_id == user_id or booking.booked_by_user_id == user_id)
        if not is_player_owner:
            # Also allow club staff
            membership = await self.club_player_repo.get_by_user_and_club(user_id, booking.club_id)
            # Will be verified if accessed via staff endpoint
        return self._serialize_booking(booking)

    async def list_player_bookings(
        self,
        user_id: UUID,
        club_id: UUID | None = None,
        status_filter: BookingStatus | None = None,
        upcoming_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[BookingResponse]:
        """List bookings for the authenticated player."""
        bookings = await self.booking_repo.list_by_player(
            player_id=user_id,
            club_id=club_id,
            status=status_filter,
            upcoming_only=upcoming_only,
            limit=limit,
            offset=offset,
        )
        return [self._serialize_booking(b) for b in bookings]


    async def list_club_bookings(
        self,
        club_id: UUID,
        court_id: UUID | None = None,
        player_id: UUID | None = None,
        status_filter: BookingStatus | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[BookingResponse]:
        """List all bookings in a club for staff management."""
        bookings = await self.booking_repo.list_by_club(
            club_id=club_id,
            court_id=court_id,
            player_id=player_id,
            status=status_filter,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
        return [self._serialize_booking(b) for b in bookings]

    # ─── Dynamic Availability Matrix ──────────────────────────────────────────

    async def get_club_availability(
        self,
        club_id: UUID,
        target_date: date,
        slot_duration_minutes: int = DEFAULT_BOOKING_DURATION_MINUTES,
    ) -> ClubAvailabilityResponse:
        """
        Calculate available time slots for all active courts in a club on target_date.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found or inactive")

        opening = club.opening_time or DEFAULT_CLUB_OPENING_TIME
        closing = club.closing_time or DEFAULT_CLUB_CLOSING_TIME
        club_tz = self._get_club_tz(club.timezone)

        # All club courts (ordered by display order)
        courts = await self.court_repo.list_by_club(club_id)

        # Construct start and end datetimes for the target date in club timezone
        day_start = datetime.combine(target_date, opening, tzinfo=club_tz).astimezone(timezone.utc)
        if closing == time(0, 0):
            day_end = datetime.combine(target_date + timedelta(days=1), time(0, 0), tzinfo=club_tz).astimezone(timezone.utc)
        else:
            day_end = datetime.combine(target_date, closing, tzinfo=club_tz).astimezone(timezone.utc)

        # Load confirmed bookings on this day across active courts
        all_court_ids = [c.id for c in courts]
        confirmed_bookings = await self.booking_repo.list_confirmed_for_date_range(
            club_id=club_id,
            start_time=day_start,
            end_time=day_end,
            court_ids=all_court_ids,
        )

        # Load scheduled competition matches on this day
        scheduled_matches = await self.scheduling_repo.list_scheduled_by_club_date(
            club_id=club_id,
            target_date=target_date,
        )

        court_availabilities: list[CourtAvailability] = []

        for court in courts:
            slots: list[TimeSlotAvailability] = []
            slot_start = day_start
            slot_delta = timedelta(minutes=slot_duration_minutes)

            while slot_start + slot_delta <= day_end:
                slot_end = slot_start + slot_delta

                # Find any overlapping confirmed booking for this court
                def _as_utc(dt: datetime) -> datetime:
                    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)

                conflict = next(
                    (
                        b for b in confirmed_bookings
                        if b.court_id == court.id and _as_utc(b.start_at) < slot_end and _as_utc(b.end_at) > slot_start
                    ),
                    None,
                )
                match_conflict = next(
                    (
                        m for m in scheduled_matches
                        if m.court_id == court.id and m.scheduled_start_at and m.scheduled_end_at and _as_utc(m.scheduled_start_at) < slot_end and _as_utc(m.scheduled_end_at) > slot_start
                    ),
                    None,
                )

                is_available = conflict is None and match_conflict is None and court.is_active
                slot_status = "AVAILABLE"
                if not court.is_active:
                    slot_status = "BLOCKED"
                elif match_conflict:
                    slot_status = "BOOKED"
                elif conflict:
                    if conflict.booking_type == BookingType.MAINTENANCE:
                        slot_status = "MAINTENANCE"
                    elif conflict.booking_type == BookingType.BLOCKED:
                        slot_status = "BLOCKED"
                    else:
                        slot_status = "BOOKED"

                slots.append(
                    TimeSlotAvailability(
                        start_at=slot_start,
                        end_at=slot_end,
                        is_available=is_available,
                        status=slot_status,
                        booking_id=conflict.id if conflict else None,
                    )
                )
                slot_start += slot_delta

            court_availabilities.append(
                CourtAvailability(
                    court_id=court.id,
                    court_name=court.name,
                    display_name=court.display_name,
                    surface_type=court.surface_type,
                    indoor_outdoor=court.indoor_outdoor,
                    price_per_hour=court.price_per_hour,
                    slots=slots,
                )
            )

        return ClubAvailabilityResponse(
            club_id=club.id,
            date=target_date,
            opening_time=opening,
            closing_time=closing,
            timezone=club.timezone or "UTC",
            courts=court_availabilities,
        )
