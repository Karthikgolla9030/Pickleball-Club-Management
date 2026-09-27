"""
Aught2 Pickleball — Court Booking Endpoints (Phase 11)

Provides player-facing booking flows (availability check, reservation, cancellation)
and staff booking management (club overview, staff booking creation, staff cancellation).
"""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.booking_config import DEFAULT_BOOKING_DURATION_MINUTES
from app.core.database import get_db
from app.models.booking import BookingStatus
from app.models.club_membership import ClubMembership
from app.models.user import User
from app.permissions import Permission
from app.schemas.booking import (
    BookingCancelRequest,
    BookingCreateRequest,
    BookingResponse,
    ClubAvailabilityResponse,
    StaffBookingCreateRequest,
)
from app.services.booking_service import BookingService


# ─── Routers ──────────────────────────────────────────────────────────────────

player_club_bookings_router = APIRouter(tags=["court-bookings"])
player_bookings_router = APIRouter(prefix="/bookings", tags=["court-bookings"])
staff_bookings_router = APIRouter(prefix="/clubs/{club_id}/bookings", tags=["club-booking-management"])


# ─── Player Endpoints ─────────────────────────────────────────────────────────

@player_club_bookings_router.get(
    "/clubs/{club_id}/courts/availability",
    response_model=ClubAvailabilityResponse,
    summary="Get court availability matrix for a date",
    description="Returns time slot availability for all active courts in the club for the requested date.",
)
async def get_club_court_availability(
    club_id: UUID,
    target_date: date = Query(default_factory=date.today, alias="date", description="Target calendar date"),
    slot_duration: int = Query(
        DEFAULT_BOOKING_DURATION_MINUTES,
        alias="duration",
        description="Slot interval duration in minutes",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubAvailabilityResponse:
    return await BookingService(db).get_club_availability(
        club_id=club_id,
        target_date=target_date,
        slot_duration_minutes=slot_duration,
    )


@player_club_bookings_router.post(
    "/clubs/{club_id}/bookings",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create player court booking",
    description="Reserves an active court for the authenticated player. Enforces active club membership, limits, and concurrency safety.",
)
async def create_player_booking(
    club_id: UUID,
    payload: BookingCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await BookingService(db).create_player_booking(
        club_id=club_id,
        user_id=current_user.id,
        payload=payload,
    )


@player_bookings_router.get(
    "",
    response_model=list[BookingResponse],
    summary="List current user's bookings",
    description="Returns all bookings for the authenticated player profile, optionally filtered by club, status, or upcoming.",
)
async def list_player_bookings(
    club_id: UUID | None = Query(None, description="Optional club filter"),
    status: BookingStatus | None = Query(None, description="Filter by booking status"),
    upcoming_only: bool = Query(False, description="Only show upcoming bookings"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BookingResponse]:
    return await BookingService(db).list_player_bookings(
        user_id=current_user.id,
        club_id=club_id,
        status_filter=status,
        upcoming_only=upcoming_only,
        limit=limit,
        offset=offset,
    )


@player_bookings_router.get(
    "/{booking_id}",
    response_model=BookingResponse,
    summary="Get booking details",
    description="Returns booking details for the booking owner or staff.",
)
async def get_booking(
    booking_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await BookingService(db).get_booking(booking_id=booking_id, user_id=current_user.id)


@player_bookings_router.post(
    "/{booking_id}/cancel",
    response_model=BookingResponse,
    summary="Cancel own booking",
    description="Cancels a confirmed booking at least 2 hours before start time.",
)
async def cancel_player_booking(
    booking_id: UUID,
    payload: BookingCancelRequest = BookingCancelRequest(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await BookingService(db).cancel_player_booking(
        booking_id=booking_id,
        user_id=current_user.id,
        payload=payload,
    )


# ─── Staff Endpoints ──────────────────────────────────────────────────────────

@staff_bookings_router.get(
    "",
    response_model=list[BookingResponse],
    summary="List all club bookings (Staff)",
    description="Returns club bookings with optional filters. Requires MANAGE_BOOKINGS permission.",
)
async def list_club_bookings(
    club_id: UUID,
    court_id: UUID | None = Query(None, description="Filter by court ID"),
    player_id: UUID | None = Query(None, description="Filter by player profile ID"),
    status: BookingStatus | None = Query(None, description="Filter by booking status"),
    start_date: datetime | None = Query(None, description="Filter by start datetime greater than or equal to"),
    end_date: datetime | None = Query(None, description="Filter by end datetime less than or equal to"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_BOOKINGS)),
    db: AsyncSession = Depends(get_db),
) -> list[BookingResponse]:
    return await BookingService(db).list_club_bookings(
        club_id=club_id,
        court_id=court_id,
        player_id=player_id,
        status_filter=status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )


@staff_bookings_router.post(
    "/staff",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create staff booking on behalf of a player",
    description="Staff creates a court booking for an active club player. Requires MANAGE_BOOKINGS permission.",
)
async def create_staff_booking(
    club_id: UUID,
    payload: StaffBookingCreateRequest,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_BOOKINGS)),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await BookingService(db).create_staff_booking(
        club_id=club_id,
        staff_user_id=current_user.id,
        payload=payload,
    )


@staff_bookings_router.post(
    "/{booking_id}/cancel",
    response_model=BookingResponse,
    summary="Cancel booking as staff",
    description="Staff cancels any booking within their club with audit logging. Requires MANAGE_BOOKINGS permission.",
)
async def cancel_staff_booking(
    club_id: UUID,
    booking_id: UUID,
    payload: BookingCancelRequest = BookingCancelRequest(),
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_BOOKINGS)),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    return await BookingService(db).cancel_staff_booking(
        club_id=club_id,
        booking_id=booking_id,
        staff_user_id=current_user.id,
        payload=payload,
    )


@staff_bookings_router.post(
    "/blocks",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create maintenance or blocked slot",
    description="Staff creates a blocked or maintenance court block. Requires MANAGE_BOOKINGS permission.",
)
async def create_court_block(
    club_id: UUID,
    payload: BookingCreateRequest,
    block_type: str = Query(..., description="Must be MAINTENANCE or BLOCKED"),
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_BOOKINGS)),
    db: AsyncSession = Depends(get_db),
) -> BookingResponse:
    from app.models.booking import BookingType
    from fastapi import HTTPException
    
    btype = block_type.lower()
    if btype == "maintenance":
        actual_type = BookingType.MAINTENANCE
    elif btype == "blocked":
        actual_type = BookingType.BLOCKED
    else:
        raise HTTPException(status_code=400, detail="Must be MAINTENANCE or BLOCKED")

    return await BookingService(db).create_court_block(
        club_id=club_id,
        staff_user_id=current_user.id,
        payload=payload,
        block_type=actual_type,
    )
