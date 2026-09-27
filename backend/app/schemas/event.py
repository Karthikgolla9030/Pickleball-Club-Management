"""
Aught2 Pickleball — Event Schemas (Phase 14)

Pydantic v2 schemas for events and event registrations.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.event import (
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)


# ─── Event Creation & Update ──────────────────────────────────────────────────

class EventCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    event_type: EventType = Field(default=EventType.SOCIAL)
    visibility: EventVisibility = Field(default=EventType.SOCIAL)  # Will default to PUBLIC below
    visibility: EventVisibility = Field(default=EventVisibility.PUBLIC)
    start_at: datetime
    end_at: datetime
    location: str | None = Field(None, max_length=255)
    capacity: int | None = Field(None, gt=0)
    registration_required: bool = True
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    registration_fee: Decimal = Field(default=Decimal("0.00"), ge=0)
    currency: str = Field(default="INR", min_length=3, max_length=3)

    @field_validator("registration_fee")
    @classmethod
    def validate_registration_fee(cls, v: Decimal) -> Decimal:
        if v.as_tuple().exponent < -2:
            raise ValueError("registration_fee must have at most 2 decimal places")
        return v

    @model_validator(mode="after")
    def validate_schedule(self) -> EventCreateRequest:
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly after start_at")
        if self.registration_opens_at and self.registration_closes_at:
            if self.registration_closes_at <= self.registration_opens_at:
                raise ValueError("registration_closes_at must be after registration_opens_at")
        return self


class EventUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    event_type: EventType | None = None
    visibility: EventVisibility | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    location: str | None = Field(None, max_length=255)
    capacity: int | None = Field(None, gt=0)
    registration_required: bool | None = None
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    registration_fee: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, min_length=3, max_length=3)

    @field_validator("registration_fee")
    @classmethod
    def validate_registration_fee(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v.as_tuple().exponent < -2:
            raise ValueError("registration_fee must have at most 2 decimal places")
        return v


# ─── Event Responses ──────────────────────────────────────────────────────────

class EventResponse(BaseModel):
    id: UUID
    club_id: UUID
    title: str
    description: str | None = None
    event_type: EventType
    event_type_label: str
    status: EventStatus
    status_label: str
    visibility: EventVisibility
    visibility_label: str
    start_at: datetime
    end_at: datetime
    location: str | None = None
    capacity: int | None = None
    registration_required: bool
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    registration_fee: Decimal
    currency: str
    created_by_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EventDetailResponse(EventResponse):
    registered_count: int = 0
    waitlisted_count: int = 0
    cancelled_count: int = 0
    attended_count: int = 0
    no_show_count: int = 0
    available_spots: int | None = None
    is_registration_open: bool = False


class PlayerEventDetailResponse(EventDetailResponse):
    user_registration_status: EventRegistrationStatus | None = None
    user_registration_id: UUID | None = None
    user_registered_at: datetime | None = None


# ─── Event Registration Schemas ───────────────────────────────────────────────

class StaffRegisterPlayerRequest(BaseModel):
    user_id: UUID
    notes: str | None = None


class PlayerRegisterRequest(BaseModel):
    notes: str | None = None


class EventRegistrationResponse(BaseModel):
    id: UUID
    event_id: UUID
    user_id: UUID
    status: EventRegistrationStatus
    status_label: str
    registered_at: datetime
    cancelled_at: datetime | None = None
    notes: str | None = None
    user_full_name: str | None = None
    user_email: str | None = None
    event_title: str | None = None
    event_start_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
