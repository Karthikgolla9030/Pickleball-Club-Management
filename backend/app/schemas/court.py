from __future__ import annotations

import enum
import uuid
from datetime import datetime, time
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.operating_hours import WeeklyOperatingHours, parse_time_value
from app.models.court import CourtEnvironment, CourtStatus


class CourtSurfaceType(str, enum.Enum):
    ACRYLIC = "acrylic"
    CONCRETE = "concrete"
    SPORT_COURT = "sport_court"
    CUSHIONED_ACRYLIC = "cushioned_acrylic"
    WOOD = "wood"
    CLAY = "clay"
    OTHER = "other"


# ─── Requests ─────────────────────────────────────────────────────────────────

ALLOWED_BOOKING_INTERVALS: set[int] = {30, 60, 90, 120}


class CourtCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Court name (e.g. 'Court 1', 'Center Court')")
    display_name: str | None = Field(None, max_length=100, description="Optional custom human-friendly display label")
    description: str | None = Field(None, description="Optional informational notes")
    photo_url: str | None = Field(None, max_length=1000, description="Optional court photo image URL")
    court_number: int | None = Field(None, ge=1, description="Optional unique court number within the club")
    surface_type: str | None = Field(None, max_length=50, description="Court playing surface")
    indoor_outdoor: CourtEnvironment = Field(default=CourtEnvironment.INDOOR, description="Indoor, outdoor, or covered")
    status: CourtStatus = Field(default=CourtStatus.ACTIVE, description="Active or inactive status")
    is_active: bool = Field(default=True, description="Active flag")
    display_order: int | None = Field(None, ge=0, description="Manual display sort order")
    price_per_hour: Decimal | None = Field(None, ge=0, description="Court booking price per hour in USD")
    booking_interval_minutes: int | None = Field(60, description="Configurable booking interval in minutes (30, 60, 90, 120)")
    opening_time: str | time | None = Field(None, description="Uniform opening time (e.g. '06:00')")
    closing_time: str | time | None = Field(None, description="Uniform closing time (e.g. '22:00')")
    operating_hours: WeeklyOperatingHours | dict[str, Any] | None = Field(None, description="Optional court-level operating hours override")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip() if isinstance(v, str) else ""
        if not trimmed:
            raise ValueError("Court name cannot be blank")
        return trimmed

    @field_validator("booking_interval_minutes")
    @classmethod
    def validate_interval(cls, v: int | None) -> int | None:
        if v is not None and v not in ALLOWED_BOOKING_INTERVALS:
            raise ValueError(f"Booking interval {v}m is not supported. Allowed intervals: {sorted(list(ALLOWED_BOOKING_INTERVALS))} minutes.")
        return v

    @model_validator(mode="after")
    def validate_times(self) -> CourtCreateRequest:
        o_time = parse_time_value(self.opening_time)
        c_time = parse_time_value(self.closing_time)
        if o_time is not None and c_time is not None:
            if c_time != time(0, 0) and o_time >= c_time:
                raise ValueError(
                    f"Opening time ({o_time.strftime('%H:%M')}) must be strictly earlier than closing time ({c_time.strftime('%H:%M')}). "
                    "Overnight operating hours crossing calendar days are not supported."
                )
        return self


class CourtUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    display_name: str | None = Field(None, max_length=100)
    description: str | None = None
    photo_url: str | None = Field(None, max_length=1000)
    court_number: int | None = Field(None, ge=1)
    surface_type: str | None = Field(None, max_length=50)
    indoor_outdoor: CourtEnvironment | None = None
    status: CourtStatus | None = None
    is_active: bool | None = None
    display_order: int | None = Field(None, ge=0)
    price_per_hour: Decimal | None = Field(None, ge=0, description="Court booking price per hour in USD")
    booking_interval_minutes: int | None = Field(None, description="Configurable booking interval in minutes (30, 60, 90, 120)")
    opening_time: str | time | None = None
    closing_time: str | time | None = None
    operating_hours: WeeklyOperatingHours | dict[str, Any] | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            trimmed = v.strip()
            if not trimmed:
                raise ValueError("Court name cannot be blank")
            return trimmed
        return v

    @field_validator("booking_interval_minutes")
    @classmethod
    def validate_interval(cls, v: int | None) -> int | None:
        if v is not None and v not in ALLOWED_BOOKING_INTERVALS:
            raise ValueError(f"Booking interval {v}m is not supported. Allowed intervals: {sorted(list(ALLOWED_BOOKING_INTERVALS))} minutes.")
        return v

    @model_validator(mode="after")
    def validate_times(self) -> CourtUpdateRequest:
        o_time = parse_time_value(self.opening_time)
        c_time = parse_time_value(self.closing_time)
        if o_time is not None and c_time is not None:
            if c_time != time(0, 0) and o_time >= c_time:
                raise ValueError(
                    f"Opening time ({o_time.strftime('%H:%M')}) must be strictly earlier than closing time ({c_time.strftime('%H:%M')}). "
                    "Overnight operating hours crossing calendar days are not supported."
                )
        return self


class CourtReorderRequest(BaseModel):
    court_ids: list[uuid.UUID] = Field(..., min_length=1, description="Complete list of court IDs in desired order")


# ─── Responses ────────────────────────────────────────────────────────────────

class CourtResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    display_name: str | None = None
    description: str | None = None
    photo_url: str | None = None
    court_number: int | None = None
    surface_type: str | None = None
    indoor_outdoor: CourtEnvironment
    status: CourtStatus
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
    price_per_hour: Decimal | None = None
    booking_interval_minutes: int = 60
    operating_hours: dict[str, Any] | None = None


class PlayerCourtResponse(BaseModel):
    """Read-only player-facing court representation (no admin metadata)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    display_name: str | None = None
    description: str | None = None
    photo_url: str | None = None
    court_number: int | None = None
    surface_type: str | None = None
    indoor_outdoor: CourtEnvironment
    display_order: int
    price_per_hour: Decimal | None = None
    booking_interval_minutes: int = 60
    operating_hours: dict[str, Any] | None = None


class CourtOperatingHoursUpdateRequest(BaseModel):
    operating_hours: WeeklyOperatingHours | None = Field(
        None,
        description="Weekly operating hours override for this court. Set to null to inherit from club.",
    )
    booking_interval_minutes: int | None = Field(
        None,
        description="Optional booking slot interval override in minutes (30, 60, 90, 120)",
    )


class CourtOperatingHoursResponse(BaseModel):
    court_id: uuid.UUID
    club_id: uuid.UUID
    court_name: str
    has_override: bool
    court_operating_hours: dict[str, Any] | None = None
    effective_operating_hours: dict[str, Any]
    booking_interval_minutes: int = 60


class CourtAffectedBookingsItem(BaseModel):
    id: uuid.UUID
    player_id: uuid.UUID | None = None
    start_at: datetime
    end_at: datetime
    status: str
    booking_type: str


class CourtAffectedBookingsResponse(BaseModel):
    court_id: uuid.UUID
    court_name: str
    upcoming_confirmed_bookings_count: int
    bookings: list[CourtAffectedBookingsItem]
    message: str


class CourtDisruptionPreviewRequest(BaseModel):
    operating_hours: WeeklyOperatingHours | dict[str, Any] | None = None
    booking_interval_minutes: int | None = None


class CourtDisruptionPreviewResponse(BaseModel):
    court_id: uuid.UUID
    court_name: str
    affected_bookings_count: int
    affected_bookings: list[CourtAffectedBookingsItem]
    message: str

