"""
Aught2 Pickleball — Court Booking Schemas (Phase 11)

Pydantic models for booking creation, cancellation, slot availability queries,
and response serialization.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.booking_config import (
    ALLOWED_DURATIONS_MINUTES,
    DEFAULT_BOOKING_DURATION_MINUTES,
)
from app.models.booking import BookingStatus, BookingType
from app.models.court import CourtEnvironment


# ─── Requests ─────────────────────────────────────────────────────────────────

class BookingCreateRequest(BaseModel):
    court_id: uuid.UUID = Field(..., description="ID of the court to reserve")
    start_at: datetime = Field(..., description="Start timestamp (timezone-aware UTC)")
    end_at: datetime = Field(..., description="End timestamp (timezone-aware UTC)")
    notes: str | None = Field(None, max_length=500, description="Optional booking notes")

    @model_validator(mode="after")
    def validate_timestamps(self) -> BookingCreateRequest:
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly after start_at")
        duration = int((self.end_at - self.start_at).total_seconds() / 60)
        if duration not in ALLOWED_DURATIONS_MINUTES:
            raise ValueError(
                f"Booking duration {duration}m is not permitted. "
                f"Allowed durations: {sorted(list(ALLOWED_DURATIONS_MINUTES))} minutes."
            )
        return self


class StaffBookingCreateRequest(BaseModel):
    court_id: uuid.UUID = Field(..., description="ID of the court to reserve")
    player_id: uuid.UUID | None = Field(None, description="ID of the player profile reserving the court")
    guest_name: str | None = Field(None, description="Name of the guest/walk-in if player_id is null")
    start_at: datetime = Field(..., description="Start timestamp (timezone-aware UTC)")
    end_at: datetime = Field(..., description="End timestamp (timezone-aware UTC)")
    notes: str | None = Field(None, max_length=500, description="Optional staff booking notes")

    @model_validator(mode="after")
    def validate_timestamps(self) -> StaffBookingCreateRequest:
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly after start_at")
        duration = int((self.end_at - self.start_at).total_seconds() / 60)
        if duration not in ALLOWED_DURATIONS_MINUTES:
            raise ValueError(
                f"Booking duration {duration}m is not permitted. "
                f"Allowed durations: {sorted(list(ALLOWED_DURATIONS_MINUTES))} minutes."
            )
        return self


class BookingCancelRequest(BaseModel):
    cancellation_reason: str | None = Field(None, max_length=500, description="Optional cancellation reason")


# ─── Nested Metadata ──────────────────────────────────────────────────────────

class BookingCourtInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    display_name: str | None = None
    surface_type: str | None = None
    indoor_outdoor: CourtEnvironment
    price_per_hour: Decimal | None = None


class BookingPlayerInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    first_name: str | None = None
    last_name: str | None = None


# ─── Booking Responses ────────────────────────────────────────────────────────

class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    court_id: uuid.UUID
    player_id: uuid.UUID | None = None
    created_by_user_id: uuid.UUID
    booking_type: BookingType
    status: BookingStatus
    start_at: datetime
    end_at: datetime
    duration_minutes: int
    notes: str | None = None
    cancelled_at: datetime | None = None
    cancelled_by_user_id: uuid.UUID | None = None
    cancellation_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    price_per_hour: Decimal | None = None
    total_price: Decimal | None = None
    currency: str = "INR"
    court: BookingCourtInfo | None = None
    player: BookingPlayerInfo | None = None
    club_name: str | None = None


# ─── Availability Schemas ─────────────────────────────────────────────────────

class TimeSlotAvailability(BaseModel):
    start_at: datetime
    end_at: datetime
    is_available: bool
    status: str = "AVAILABLE"  # AVAILABLE, BOOKED, MAINTENANCE, BLOCKED
    booking_id: uuid.UUID | None = None


class CourtAvailability(BaseModel):
    court_id: uuid.UUID
    court_name: str
    display_name: str | None = None
    surface_type: str | None = None
    indoor_outdoor: CourtEnvironment
    price_per_hour: Decimal | None = None
    slots: list[TimeSlotAvailability]


class ClubAvailabilityResponse(BaseModel):
    club_id: uuid.UUID
    date: date
    opening_time: time
    closing_time: time
    timezone: str
    courts: list[CourtAvailability]
