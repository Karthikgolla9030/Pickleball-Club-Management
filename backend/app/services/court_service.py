"""
Aught2 Pickleball — Court Service (Phase 10)

Business logic layer for Court operations. Enforces tenant isolation, permissions,
uniqueness constraints, deterministic ordering, and lifecycle transitions.
"""
from __future__ import annotations

from datetime import datetime, time, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID
import zoneinfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.operating_hours import (
    WEEKDAY_NAMES,
    WeeklyOperatingHours,
    build_weekly_schedule_dict,
    parse_time_value,
    resolve_effective_operating_hours,
)
from app.models.booking import Booking, BookingStatus
from app.models.court import Court, CourtStatus
from app.repositories.club_repository import ClubRepository
from app.repositories.court_repository import CourtRepository
from app.services.media_storage_service import MediaStorageService
from app.schemas.court import (
    CourtAffectedBookingsItem,
    CourtAffectedBookingsResponse,
    CourtCreateRequest,
    CourtDisruptionPreviewRequest,
    CourtDisruptionPreviewResponse,
    CourtOperatingHoursResponse,
    CourtOperatingHoursUpdateRequest,
    CourtReorderRequest,
    CourtUpdateRequest,
)


def _normalize_operating_hours_dict(raw_hours: Any) -> dict[str, Any] | None:
    """Safely normalizes any WeeklyOperatingHours, model dump, or dict into JSON-serializable strings."""
    if raw_hours is None:
        return None
    if hasattr(raw_hours, "to_dict"):
        return raw_hours.to_dict()
    if isinstance(raw_hours, dict):
        serialized: dict[str, Any] = {}
        for day, day_cfg in raw_hours.items():
            if isinstance(day_cfg, dict):
                is_closed = bool(day_cfg.get("is_closed", False))
                o_time = day_cfg.get("open_time")
                c_time = day_cfg.get("close_time")
                if is_closed:
                    o_str = None
                    c_str = None
                else:
                    if isinstance(o_time, time):
                        o_str = o_time.strftime("%H:%M:%S")
                    else:
                        o_str = str(o_time).strip() if o_time is not None else None
                    if isinstance(c_time, time):
                        c_str = c_time.strftime("%H:%M:%S")
                    else:
                        c_str = str(c_time).strip() if c_time is not None else None
                serialized[day] = {
                    "is_closed": is_closed,
                    "open_time": o_str,
                    "close_time": c_str,
                }
            elif hasattr(day_cfg, "is_closed"):
                is_closed = bool(day_cfg.is_closed)
                o_time = getattr(day_cfg, "open_time", None)
                c_time = getattr(day_cfg, "close_time", None)
                o_str = o_time.strftime("%H:%M:%S") if isinstance(o_time, time) else (str(o_time) if o_time else None)
                c_str = c_time.strftime("%H:%M:%S") if isinstance(c_time, time) else (str(c_time) if c_time else None)
                serialized[day] = {
                    "is_closed": is_closed,
                    "open_time": None if is_closed else o_str,
                    "close_time": None if is_closed else c_str,
                }
            else:
                serialized[day] = day_cfg
        return serialized
    return raw_hours


class CourtService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.court_repo = CourtRepository(db)
        self.club_repo = ClubRepository(db)

    async def _require_club(self, club_id: UUID) -> None:
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )
        if not club.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Club is inactive",
            )

    async def create_court(self, club_id: UUID, payload: CourtCreateRequest) -> Court:
        """
        Create a new court for the specified club.
        Validates duplicate names, court numbers within the club, and price rules.
        """
        await self._require_club(club_id)

        # Check court_number uniqueness within the club
        if payload.court_number is not None:
            existing = await self.court_repo.get_by_court_number(club_id, payload.court_number)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Court number {payload.court_number} already exists in this club",
                )

        # Check name uniqueness within the club
        existing_name = await self.court_repo.get_by_name(club_id, payload.name)
        if existing_name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A court named '{payload.name.strip()}' already exists in this club",
            )

        # Validate price_per_hour if provided
        validated_price = None
        if payload.price_per_hour is not None:
            if payload.price_per_hour < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Court price cannot be negative",
                )
            # Max 2 decimal places
            validated_price = Decimal(str(payload.price_per_hour)).quantize(Decimal("0.01"))

        # Calculate display_order if not provided
        if payload.display_order is None:
            max_order = await self.court_repo.get_max_display_order(club_id)
            display_order = max_order + 1
        else:
            display_order = payload.display_order

        # Synchronize status and is_active
        if payload.status == CourtStatus.INACTIVE or not payload.is_active:
            final_status = CourtStatus.INACTIVE
            final_is_active = False
        else:
            final_status = CourtStatus.ACTIVE
            final_is_active = True

        operating_hours_dict = None
        if payload.operating_hours is not None:
            operating_hours_dict = _normalize_operating_hours_dict(payload.operating_hours)
        elif payload.opening_time is not None and payload.closing_time is not None:
            o_str = payload.opening_time.strftime("%H:%M:%S") if isinstance(payload.opening_time, time) else str(payload.opening_time)
            c_str = payload.closing_time.strftime("%H:%M:%S") if isinstance(payload.closing_time, time) else str(payload.closing_time)
            operating_hours_dict = {
                day: {
                    "is_closed": False,
                    "open_time": o_str,
                    "close_time": c_str,
                }
                for day in WEEKDAY_NAMES
            }

        return await self.court_repo.create(
            club_id=club_id,
            name=payload.name,
            display_name=payload.display_name,
            description=payload.description,
            court_number=payload.court_number,
            surface_type=payload.surface_type,
            indoor_outdoor=payload.indoor_outdoor,
            status=final_status,
            is_active=final_is_active,
            display_order=display_order,
            price_per_hour=validated_price,
            booking_interval_minutes=payload.booking_interval_minutes,
            operating_hours=operating_hours_dict,
            photo_url=payload.photo_url,
        )

    async def get_court(self, club_id: UUID, court_id: UUID) -> Court:
        """
        Retrieve court details with strict tenant isolation.
        Raises 404 if court not found or belongs to another club.
        """
        await self._require_club(club_id)
        court = await self.court_repo.get_by_id(court_id, club_id=club_id)
        if not court:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Court not found in this club",
            )
        return court

    async def list_courts(self, club_id: UUID, status_filter: str | None = "all") -> list[Court]:
        """
        Staff court listing with optional active/inactive filtering.
        """
        await self._require_club(club_id)

        is_active: bool | None = None
        if status_filter == "active":
            is_active = True
        elif status_filter == "inactive":
            is_active = False
        elif status_filter == "all" or status_filter is None:
            is_active = None
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status filter. Must be 'active', 'inactive', or 'all'.",
            )

        return await self.court_repo.list_by_club(club_id, is_active=is_active)

    async def list_active_courts(self, club_id: UUID) -> list[Court]:
        """
        Player-facing court listing: strictly active courts only.
        """
        await self._require_club(club_id)
        return await self.court_repo.list_by_club(club_id, is_active=True)

    async def update_court(self, club_id: UUID, court_id: UUID, payload: CourtUpdateRequest) -> Court:
        """
        Update court information. Prevents club_id mutation and validates duplicates.
        """
        court = await self.get_court(club_id, court_id)

        update_data = payload.model_dump(exclude_unset=True)
        # Forbid changing club_id
        update_data.pop("club_id", None)

        # Validate court_number uniqueness if being changed
        new_number = update_data.get("court_number")
        if new_number is not None and new_number != court.court_number:
            existing = await self.court_repo.get_by_court_number(club_id, new_number)
            if existing and existing.id != court.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Court number {new_number} already exists in this club",
                )

        # Validate name uniqueness if being changed
        new_name = update_data.get("name")
        if new_name is not None and new_name.strip().lower() != court.name.lower():
            existing = await self.court_repo.get_by_name(club_id, new_name)
            if existing and existing.id != court.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A court named '{new_name.strip()}' already exists in this club",
                )

        # Validate price_per_hour if being changed
        if "price_per_hour" in update_data:
            val = update_data["price_per_hour"]
            if val is not None:
                if val < 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Court price cannot be negative",
                    )
                update_data["price_per_hour"] = Decimal(str(val)).quantize(Decimal("0.01"))

        # Synchronize status and is_active if either is modified
        if "status" in update_data or "is_active" in update_data:
            if "status" in update_data:
                status_val = update_data["status"]
                update_data["is_active"] = (status_val == CourtStatus.ACTIVE)
            else:
                active_val = update_data["is_active"]
                update_data["status"] = CourtStatus.ACTIVE if active_val else CourtStatus.INACTIVE

        if "operating_hours" in update_data and update_data["operating_hours"] is not None:
            update_data["operating_hours"] = _normalize_operating_hours_dict(update_data["operating_hours"])
            update_data.pop("opening_time", None)
            update_data.pop("closing_time", None)
        elif "opening_time" in update_data and "closing_time" in update_data:
            o_time = update_data.pop("opening_time", None)
            c_time = update_data.pop("closing_time", None)
            if o_time is not None and c_time is not None:
                o_str = o_time.strftime("%H:%M:%S") if isinstance(o_time, time) else str(o_time)
                c_str = c_time.strftime("%H:%M:%S") if isinstance(c_time, time) else str(c_time)
                update_data["operating_hours"] = {
                    day: {
                        "is_closed": False,
                        "open_time": o_str,
                        "close_time": c_str,
                    }
                    for day in WEEKDAY_NAMES
                }
        else:
            update_data.pop("opening_time", None)
            update_data.pop("closing_time", None)

        old_photo_url = court.photo_url
        updated_court = await self.court_repo.update(court, **update_data)

        # Safely clean up previous image file if photo_url was replaced with a new one
        if "photo_url" in update_data and old_photo_url and old_photo_url != updated_court.photo_url:
            try:
                await MediaStorageService(self.db).cleanup_unreferenced_by_url(old_photo_url, club_id)
            except Exception:
                pass

        return updated_court

    async def deactivate_court(self, club_id: UUID, court_id: UUID) -> Court:
        """
        Soft-deactivate court. Never hard-deletes so future booking records remain intact.
        """
        court = await self.get_court(club_id, court_id)
        return await self.court_repo.update(court, is_active=False, status=CourtStatus.INACTIVE)

    async def reactivate_court(self, club_id: UUID, court_id: UUID) -> Court:
        """
        Reactivate an inactive court, restoring its player visibility.
        """
        court = await self.get_court(club_id, court_id)
        return await self.court_repo.update(court, is_active=True, status=CourtStatus.ACTIVE)

    async def reorder_courts(self, club_id: UUID, payload: CourtReorderRequest) -> list[Court]:
        """
        Reorder all courts in the club in a single transaction.
        Validates that all court IDs belong to the club with no duplicates or missing courts.
        """
        await self._require_club(club_id)
        court_ids = payload.court_ids

        # Check duplicate IDs in payload
        if len(court_ids) != len(set(court_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate court IDs provided in reorder list",
            )

        existing_courts = await self.court_repo.list_by_club(club_id)
        existing_ids = {c.id for c in existing_courts}
        payload_ids_set = set(court_ids)

        # Check for foreign IDs
        foreign_ids = payload_ids_set - existing_ids
        if foreign_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more court IDs do not belong to this club",
            )

        # Check for missing courts (all club courts must be present in reorder)
        if len(payload_ids_set) != len(existing_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Reorder list must contain all {len(existing_ids)} courts for this club (got {len(court_ids)})",
            )

        return await self.court_repo.reorder(club_id, court_ids)

    async def get_court_operating_hours(self, club_id: UUID, court_id: UUID) -> CourtOperatingHoursResponse:
        """
        Retrieve operating hours for a specific court with inheritance from club hours.
        """
        await self._require_club(club_id)
        court = await self.get_court(club_id, court_id)
        club = await self.club_repo.get_by_id(club_id)
        effective_schedule = build_weekly_schedule_dict(club, court)
        return CourtOperatingHoursResponse(
            court_id=court.id,
            club_id=club_id,
            court_name=court.name,
            has_override=bool(court.operating_hours),
            court_operating_hours=court.operating_hours,
            effective_operating_hours=effective_schedule,
            booking_interval_minutes=court.booking_interval_minutes or 60,
        )

    async def update_court_operating_hours(
        self,
        club_id: UUID,
        court_id: UUID,
        payload: CourtOperatingHoursUpdateRequest,
    ) -> CourtOperatingHoursResponse:
        """
        Set or clear court-specific weekly operating hours override and booking interval.
        Passing null for operating_hours clears the override and inherits club hours.
        """
        await self._require_club(club_id)
        court = await self.get_court(club_id, court_id)
        club = await self.club_repo.get_by_id(club_id)

        update_fields: dict[str, Any] = {}
        if payload.operating_hours is None:
            update_fields["operating_hours"] = None
        else:
            update_fields["operating_hours"] = _normalize_operating_hours_dict(payload.operating_hours)

        if payload.booking_interval_minutes is not None:
            update_fields["booking_interval_minutes"] = payload.booking_interval_minutes

        court = await self.court_repo.update(court, **update_fields)
        await self.db.commit()

        effective_schedule = build_weekly_schedule_dict(club, court)
        return CourtOperatingHoursResponse(
            court_id=court.id,
            club_id=club_id,
            court_name=court.name,
            has_override=bool(court.operating_hours),
            court_operating_hours=court.operating_hours,
            effective_operating_hours=effective_schedule,
            booking_interval_minutes=court.booking_interval_minutes or 60,
        )

    async def get_court_affected_bookings(
        self,
        club_id: UUID,
        court_id: UUID,
    ) -> CourtAffectedBookingsResponse:
        """
        Check for upcoming confirmed bookings on a court prior to deactivation.
        Never alters or cancels any bookings.
        """
        await self._require_club(club_id)
        court = await self.get_court(club_id, court_id)

        now = datetime.now(timezone.utc)
        stmt = (
            select(Booking)
            .where(
                Booking.club_id == club_id,
                Booking.court_id == court_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.start_at >= now,
            )
            .order_by(Booking.start_at.asc())
        )
        res = await self.db.execute(stmt)
        upcoming_bookings = list(res.scalars().all())

        items = [
            CourtAffectedBookingsItem(
                id=b.id,
                player_id=b.player_id,
                start_at=b.start_at,
                end_at=b.end_at,
                status=b.status.value,
                booking_type=b.booking_type.value,
            )
            for b in upcoming_bookings
        ]
        count = len(items)
        msg = (
            f"Court '{court.name}' has {count} upcoming confirmed booking(s). "
            "Deactivating or modifying this court will prevent new bookings but will not cancel or alter existing reservations."
            if count > 0
            else f"Court '{court.name}' has no upcoming confirmed bookings."
        )

        return CourtAffectedBookingsResponse(
            court_id=court.id,
            court_name=court.name,
            upcoming_confirmed_bookings_count=count,
            bookings=items,
            message=msg,
        )

    def _get_club_tz(self, tz_str: str | None) -> timezone | zoneinfo.ZoneInfo:
        if not tz_str:
            return timezone.utc
        try:
            return zoneinfo.ZoneInfo(tz_str)
        except Exception:
            return timezone.utc

    async def preview_court_schedule_disruptions(
        self,
        club_id: UUID,
        court_id: UUID,
        payload: CourtDisruptionPreviewRequest,
    ) -> CourtDisruptionPreviewResponse:
        """
        Check for upcoming confirmed bookings on a court that fall outside proposed operating hours.
        Never alters or cancels any bookings.
        """
        await self._require_club(club_id)
        court = await self.get_court(club_id, court_id)
        club = await self.club_repo.get_by_id(club_id)
        club_tz = self._get_club_tz(club.timezone if club else None)

        now = datetime.now(timezone.utc)
        stmt = (
            select(Booking)
            .where(
                Booking.club_id == club_id,
                Booking.court_id == court_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.start_at >= now,
            )
            .order_by(Booking.start_at.asc())
        )
        res = await self.db.execute(stmt)
        upcoming_bookings = list(res.scalars().all())

        # Determine proposed hours map
        proposed_hours: dict[str, Any] | None = None
        if payload.operating_hours is not None:
            if hasattr(payload.operating_hours, "to_dict"):
                proposed_hours = payload.operating_hours.to_dict()
            elif isinstance(payload.operating_hours, dict):
                proposed_hours = payload.operating_hours

        affected: list[CourtAffectedBookingsItem] = []

        for b in upcoming_bookings:
            b_start_utc = b.start_at if b.start_at.tzinfo else b.start_at.replace(tzinfo=timezone.utc)
            b_end_utc = b.end_at if b.end_at.tzinfo else b.end_at.replace(tzinfo=timezone.utc)

            local_start = b_start_utc.astimezone(club_tz)
            local_end = b_end_utc.astimezone(club_tz)
            weekday_idx = local_start.weekday()
            day_name = WEEKDAY_NAMES[weekday_idx]

            is_disrupted = False
            if proposed_hours is not None and day_name in proposed_hours:
                cfg = proposed_hours[day_name]
                if isinstance(cfg, dict):
                    if cfg.get("is_closed", False):
                        is_disrupted = True
                    else:
                        o_time = parse_time_value(cfg.get("open_time"))
                        c_time = parse_time_value(cfg.get("close_time"))
                        if o_time and local_start.time() < o_time:
                            is_disrupted = True
                        if c_time and c_time != time(0, 0):
                            if local_end.date() != local_start.date() or local_end.time() > c_time:
                                is_disrupted = True

            if is_disrupted:
                affected.append(
                    CourtAffectedBookingsItem(
                        id=b.id,
                        player_id=b.player_id,
                        start_at=b.start_at,
                        end_at=b.end_at,
                        status=b.status.value,
                        booking_type=b.booking_type.value,
                    )
                )

        count = len(affected)
        msg = (
            f"Court '{court.name}' has {count} upcoming confirmed booking(s) that conflict with the proposed schedule. "
            "Saving this configuration will apply to future bookings only; existing reservations and payments remain unchanged."
            if count > 0
            else f"No upcoming bookings will conflict with the proposed operating hours for '{court.name}'."
        )

        return CourtDisruptionPreviewResponse(
            court_id=court.id,
            court_name=court.name,
            affected_bookings_count=count,
            affected_bookings=affected,
            message=msg,
        )

