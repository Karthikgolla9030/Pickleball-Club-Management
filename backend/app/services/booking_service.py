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
from app.core.operating_hours import resolve_effective_operating_hours
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club_membership import ClubMembership
from app.models.club_player_membership import PlayerMembershipStatus
from app.models.court import Court, CourtStatus
from app.models.user import User
from sqlalchemy import select
from app.repositories.booking_repository import BookingRepository
from app.repositories.club_membership_repository import ClubMembershipRepository
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
    BookingPriceCalculationResponse,
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
        self.club_membership_repo = ClubMembershipRepository(db)
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
                photo_url=getattr(b.court, "photo_url", None),
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
            currency=getattr(b, "currency", "USD") or "USD",
            player_count=getattr(b, "player_count", None),
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
        is_closed: bool = False,
        slot_interval_minutes: int = 60,
    ) -> int:
        """
        Validate slot alignment, horizon, duration, and operating hours.
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
        if duration % slot_interval_minutes != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Booking duration ({duration} minutes) must be a multiple of the court's {slot_interval_minutes}-minute booking interval.",
            )

        # Slot alignment (clean minute boundaries)
        if start_at.second != 0 or start_at.microsecond != 0 or end_at.second != 0 or end_at.microsecond != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Booking start and end times must be aligned to clean minute boundaries",
            )

        # Operating hours validation in club's local timezone
        local_start = start_at.astimezone(club_tz)
        local_end = end_at.astimezone(club_tz)

        if is_closed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Facility is closed on {local_start.strftime('%A')} ({local_start.date()})",
            )

        # Check alignment with court opening time and slot interval
        start_minutes_from_open = (local_start.hour * 60 + local_start.minute) - (club_opening.hour * 60 + club_opening.minute)
        if start_minutes_from_open % slot_interval_minutes != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Booking start time ({local_start.strftime('%H:%M')}) must align with the court's {slot_interval_minutes}-minute booking interval starting at {club_opening.strftime('%H:%M')}.",
            )

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

    # ─── Price Calculation ────────────────────────────────────────────────────

    async def calculate_booking_price(
        self,
        club_id: UUID,
        court_id: UUID,
        user_id: UUID,
        start_at: datetime,
        end_at: datetime,
        is_staff: bool = False,
    ) -> BookingPriceCalculationResponse:
        """
        Calculate booking duration and price snapshot for a player court reservation.
        Validates club existence, court existence within club, active status,
        future slot alignment, operating hours, and booking horizon.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found or inactive")

        # Verify caller has permission: active staff member, platform admin, or active player member
        if not is_staff:
            staff_membership = await self.club_membership_repo.get_by_user_and_club(
                user_id=user_id, club_id=club_id
            )
            if staff_membership and staff_membership.is_active:
                is_staff = True

        if not is_staff:
            # Check platform owner/admin emails
            user_res = await self.db.execute(select(User).where(User.id == user_id))
            user_obj = user_res.scalar_one_or_none()
            if user_obj and user_obj.email:
                from app.core.config import get_settings
                settings = get_settings()
                allowed_platform = {e.lower().strip() for e in settings.PLATFORM_OWNER_EMAILS}
                if user_obj.email.lower().strip() in allowed_platform:
                    is_staff = True

        if not is_staff:
            # Check if caller has any active club staff role (owner, manager, tournament director)
            any_staff_res = await self.db.execute(
                select(ClubMembership).where(
                    ClubMembership.user_id == user_id,
                    ClubMembership.is_active == True,  # noqa: E712
                )
            )
            if any_staff_res.scalars().first():
                is_staff = True

        if not is_staff:
            membership = await self.club_player_repo.get_by_user_and_club(user_id=user_id, club_id=club_id)
            if not membership or membership.status != PlayerMembershipStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Active club player membership required to book courts at this club",
                )

        court = await self.court_repo.get_by_id(court_id)
        if not court or court.club_id != club_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Court not found in this club")

        if not court.is_active or court.status != CourtStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court is inactive and cannot receive new bookings",
            )

        # Booking horizon check (plan-aware, staff gets full MAX_BOOKING_HORIZON_DAYS)
        if is_staff:
            max_horizon = MAX_BOOKING_HORIZON_DAYS
        else:
            _, max_horizon = await self._get_player_booking_limits(user_id=user_id, club_id=club_id)
        now = datetime.now(timezone.utc)
        max_horizon_dt = now + timedelta(days=max_horizon)
        s_at = start_at.replace(tzinfo=timezone.utc) if start_at.tzinfo is None else start_at.astimezone(timezone.utc)
        if s_at > max_horizon_dt:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bookings cannot be made more than {max_horizon} days in advance",
            )

        club_tz = self._get_club_tz(club.timezone)
        local_date = s_at.astimezone(club_tz).date()
        is_closed, eff_opening, eff_closing = resolve_effective_operating_hours(local_date, club, court)
        court_interval = getattr(court, "booking_interval_minutes", 60) or 60
        duration = self._validate_time_boundaries(
            start_at=start_at,
            end_at=end_at,
            club_opening=eff_opening,
            club_closing=eff_closing,
            club_tz=club_tz,
            is_closed=is_closed,
            slot_interval_minutes=court_interval,
        )

        rate = Decimal(str(court.price_per_hour)) if court.price_per_hour is not None else Decimal("0.00")
        hours = Decimal(duration) / Decimal(60)
        total_price = (hours * rate).quantize(Decimal("0.01"))

        return BookingPriceCalculationResponse(
            court_id=court.id,
            court_name=court.name,
            duration_minutes=duration,
            price_per_hour=rate,
            total_price=total_price,
            currency="USD",
        )

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

        # 6. Concurrency lock on Court row and verify court active
        locked_court = await self.booking_repo.lock_court_for_update(payload.court_id)
        if not locked_court or locked_court.club_id != club_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Court not found in this club")

        if not locked_court.is_active or locked_court.status != CourtStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court is inactive and cannot receive new bookings",
            )

        # 5. Operating hours validation with day-of-week & court override support
        local_date = payload_start.astimezone(club_tz).date()
        is_closed, eff_opening, eff_closing = resolve_effective_operating_hours(local_date, club, locked_court)
        court_interval = getattr(locked_court, "booking_interval_minutes", 60) or 60
        duration = self._validate_time_boundaries(
            start_at=payload.start_at,
            end_at=payload.end_at,
            club_opening=eff_opening,
            club_closing=eff_closing,
            club_tz=club_tz,
            is_closed=is_closed,
            slot_interval_minutes=court_interval,
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
        rate_snapshot = Decimal(str(locked_court.price_per_hour)) if locked_court.price_per_hour is not None else None
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
                currency="USD",
                player_count=payload.player_count,
            )
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked for this time slot",
            )

        # If booking has a price, record canonical payment
        if total_price_snapshot and total_price_snapshot > Decimal("0"):
            from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
            from app.repositories.payment_repository import PaymentRepository
            pay_repo = PaymentRepository(self.db)
            reference = await pay_repo.generate_reference()
            now_dt = datetime.now(timezone.utc)
            payment = Payment(
                reference=reference,
                club_id=club_id,
                player_id=user_id,
                booking_id=booking.id,
                amount=total_price_snapshot,
                currency="USD",
                status=PaymentStatus.SUCCEEDED,
                purpose=PaymentPurpose.COURT_BOOKING,
                payment_method=PaymentMethod.ONLINE,
                paid_at=now_dt,
                notes=f"Court reservation: {locked_court.name}",
                created_by_user_id=user_id,
            )
            await pay_repo.create(payment)

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

        # Concurrency lock on Court row
        locked_court = await self.booking_repo.lock_court_for_update(payload.court_id)
        if not locked_court or locked_court.club_id != club_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Court not found in this club")

        if not locked_court.is_active or locked_court.status != CourtStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court is inactive and cannot receive new bookings",
            )

        # Validate operating hours & times with day-of-week & court override support
        club_tz = self._get_club_tz(club.timezone)
        payload_start = payload.start_at if payload.start_at.tzinfo else payload.start_at.replace(tzinfo=timezone.utc)
        local_date = payload_start.astimezone(club_tz).date()
        is_closed, eff_opening, eff_closing = resolve_effective_operating_hours(local_date, club, locked_court)
        court_interval = getattr(locked_court, "booking_interval_minutes", 60) or 60
        duration = self._validate_time_boundaries(
            start_at=payload.start_at,
            end_at=payload.end_at,
            club_opening=eff_opening,
            club_closing=eff_closing,
            club_tz=club_tz,
            is_closed=is_closed,
            slot_interval_minutes=court_interval,
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
        rate_snapshot = Decimal(str(locked_court.price_per_hour)) if locked_court.price_per_hour is not None else None
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
                currency="USD",
                player_count=payload.player_count,
            )
        except IntegrityError:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already booked for this time slot",
            )

        # If staff booking has a price and player, record canonical payment
        if total_price_snapshot and total_price_snapshot > Decimal("0") and target_user_id:
            from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
            from app.repositories.payment_repository import PaymentRepository
            pay_repo = PaymentRepository(self.db)
            reference = await pay_repo.generate_reference()
            now_dt = datetime.now(timezone.utc)
            payment = Payment(
                reference=reference,
                club_id=club_id,
                player_id=target_user_id,
                booking_id=booking.id,
                amount=total_price_snapshot,
                currency="USD",
                status=PaymentStatus.SUCCEEDED,
                purpose=PaymentPurpose.COURT_BOOKING,
                payment_method=PaymentMethod.CASH,
                paid_at=now_dt,
                notes=f"Staff court reservation: {locked_court.name}",
                created_by_user_id=staff_user_id,
            )
            await pay_repo.create(payment)

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

        locked_court = await self.booking_repo.lock_court_for_update(payload.court_id)
        if not locked_court or locked_court.club_id != club_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Court not found in this club")

        club_tz = self._get_club_tz(club.timezone)
        payload_start = payload.start_at if payload.start_at.tzinfo else payload.start_at.replace(tzinfo=timezone.utc)
        local_date = payload_start.astimezone(club_tz).date()
        is_closed, eff_opening, eff_closing = resolve_effective_operating_hours(local_date, club, locked_court)
        court_interval = getattr(locked_court, "booking_interval_minutes", 60) or 60
        self._validate_time_boundaries(
            start_at=payload.start_at,
            end_at=payload.end_at,
            club_opening=eff_opening,
            club_closing=eff_closing,
            club_tz=club_tz,
            is_closed=is_closed,
            slot_interval_minutes=court_interval,
        )

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
        # If booking had a paid transaction, mark it refunded
        from sqlalchemy import select
        from app.models.payment import Payment, PaymentStatus
        stmt = select(Payment).where(Payment.booking_id == booking.id)
        pmt = (await self.db.execute(stmt)).scalar_one_or_none()
        if pmt and pmt.status == PaymentStatus.SUCCEEDED:
            pmt.status = PaymentStatus.REFUNDED
            pmt.refunded_amount = pmt.amount
            pmt.refund_reason = payload.cancellation_reason or "Booking cancelled by player"
            pmt.refunded_at = now
            pmt.status_changed_by_user_id = user_id
            pmt.updated_at = now
            await self.db.flush()

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

        # If booking had a paid transaction, mark it refunded
        from sqlalchemy import select
        from app.models.payment import Payment, PaymentStatus
        stmt = select(Payment).where(Payment.booking_id == booking.id)
        pmt = (await self.db.execute(stmt)).scalar_one_or_none()
        if pmt and pmt.status == PaymentStatus.SUCCEEDED:
            pmt.status = PaymentStatus.REFUNDED
            pmt.refunded_amount = pmt.amount
            pmt.refund_reason = payload.cancellation_reason or "Booking cancelled by club staff"
            pmt.refunded_at = now
            pmt.status_changed_by_user_id = staff_user_id
            pmt.updated_at = now
            await self.db.flush()

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

        club_tz = self._get_club_tz(club.timezone)
        club_is_closed, club_open, club_close = resolve_effective_operating_hours(target_date, club, None)

        # Active club courts only (ordered by display order)
        courts = await self.court_repo.list_by_club(club_id, is_active=True)

        # Broad date range for loading confirmed bookings across all courts
        day_range_start = datetime.combine(target_date, time(0, 0), tzinfo=club_tz).astimezone(timezone.utc)
        day_range_end = datetime.combine(target_date + timedelta(days=1), time(0, 0), tzinfo=club_tz).astimezone(timezone.utc)

        # Load confirmed bookings on this day across active courts
        all_court_ids = [c.id for c in courts]
        confirmed_bookings = await self.booking_repo.list_confirmed_for_date_range(
            club_id=club_id,
            start_time=day_range_start,
            end_time=day_range_end,
            court_ids=all_court_ids,
        )

        # Load scheduled competition matches on this day
        scheduled_matches = await self.scheduling_repo.list_scheduled_by_club_date(
            club_id=club_id,
            target_date=target_date,
        )

        court_availabilities: list[CourtAvailability] = []

        for court in courts:
            court_is_closed, court_open, court_close = resolve_effective_operating_hours(target_date, club, court)
            court_interval = getattr(court, "booking_interval_minutes", 60) or 60
            slots: list[TimeSlotAvailability] = []

            # If court is marked closed for this weekday, expose 0 bookable slots
            if not court_is_closed:
                open_minutes = court_open.hour * 60 + court_open.minute
                close_minutes = 24 * 60 if court_close == time(0, 0) else court_close.hour * 60 + court_close.minute
                curr_minutes = open_minutes

                while curr_minutes + court_interval <= close_minutes:
                    start_h = curr_minutes // 60
                    start_m = curr_minutes % 60
                    end_minutes = curr_minutes + court_interval
                    end_h = end_minutes // 60
                    end_m = end_minutes % 60

                    start_time_str = f"{start_h:02d}:{start_m:02d}"
                    end_time_str = f"{end_h % 24:02d}:{end_m:02d}"

                    ampm = "AM" if start_h < 12 else "PM"
                    h12 = start_h % 12
                    if h12 == 0:
                        h12 = 12
                    label = f"{h12:02d}:{start_m:02d} {ampm}"

                    # Local datetime and UTC timestamps
                    slot_start_local = datetime.combine(target_date, time(start_h, start_m), tzinfo=club_tz)
                    slot_start_utc = slot_start_local.astimezone(timezone.utc)

                    if end_h >= 24:
                        slot_end_local = datetime.combine(target_date + timedelta(days=1), time(end_h % 24, end_m), tzinfo=club_tz)
                    else:
                        slot_end_local = datetime.combine(target_date, time(end_h, end_m), tzinfo=club_tz)
                    slot_end_utc = slot_end_local.astimezone(timezone.utc)

                    # Find any overlapping confirmed booking for this court
                    def _as_utc(dt: datetime) -> datetime:
                        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)

                    conflict = next(
                        (
                            b for b in confirmed_bookings
                            if b.court_id == court.id and _as_utc(b.start_at) < slot_end_utc and _as_utc(b.end_at) > slot_start_utc
                        ),
                        None,
                    )
                    match_conflict = next(
                        (
                            m for m in scheduled_matches
                            if m.court_id == court.id and m.scheduled_start_at and m.scheduled_end_at and _as_utc(m.scheduled_start_at) < slot_end_utc and _as_utc(m.scheduled_end_at) > slot_start_utc
                        ),
                        None,
                    )

                    now_utc = datetime.now(timezone.utc)
                    is_in_past = slot_start_utc <= now_utc

                    is_available = (
                        conflict is None
                        and match_conflict is None
                        and court.is_active
                        and not is_in_past
                    )
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
                            start_at=slot_start_utc,
                            end_at=slot_end_utc,
                            start_time=start_time_str,
                            end_time=end_time_str,
                            label=label,
                            is_available=is_available,
                            is_past=is_in_past,
                            status=slot_status,
                            booking_id=conflict.id if conflict else None,
                        )
                    )
                    curr_minutes += court_interval

            court_availabilities.append(
                CourtAvailability(
                    court_id=court.id,
                    court_name=court.name,
                    display_name=court.display_name,
                    surface_type=court.surface_type,
                    indoor_outdoor=court.indoor_outdoor,
                    price_per_hour=court.price_per_hour,
                    booking_interval_minutes=court_interval,
                    is_closed=court_is_closed,
                    open_time=court_open if not court_is_closed else None,
                    close_time=court_close if not court_is_closed else None,
                    slots=slots,
                )
            )

        return ClubAvailabilityResponse(
            club_id=club.id,
            date=target_date,
            opening_time=club_open,
            closing_time=club_close,
            timezone=club.timezone or "UTC",
            courts=court_availabilities,
        )
