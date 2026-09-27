"""
Aught2 Pickleball — Lesson Schemas (Phase 15)

Pydantic models for request validation and response serialization across:
  - Coach management
  - LessonType configuration
  - Lesson scheduling & lifecycle
  - Lesson registration & attendance tracking
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
import uuid
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.lesson import LessonRegistrationStatus, LessonStatus


# ─── Coach Schemas ────────────────────────────────────────────────────────────

class CoachCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    bio: str | None = None
    specialization: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    user_id: UUID | None = None


class CoachUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    bio: str | None = None
    specialization: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    user_id: UUID | None = None


class CoachResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    club_id: UUID
    user_id: UUID | None = None
    name: str
    bio: str | None = None
    specialization: str | None = None
    phone: str | None = None
    email: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ─── Lesson Type Schemas ──────────────────────────────────────────────────────

class LessonTypeCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    duration_minutes: int = Field(default=60, gt=0, description="Duration in minutes, must be positive")
    default_capacity: int | None = Field(default=None, gt=0, description="Default capacity if configured, must be positive")
    default_price: Decimal = Field(default=Decimal("0.00"), ge=0, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    is_private: bool = Field(default=False)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str) -> str:
        return v.strip().upper()


class LessonTypeUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    default_capacity: int | None = Field(default=None, gt=0)
    default_price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    is_private: bool | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else None


class LessonTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    club_id: UUID
    name: str
    description: str | None = None
    duration_minutes: int
    default_capacity: int | None = None
    default_price: Decimal
    currency: str
    is_private: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ─── Lesson Schemas ───────────────────────────────────────────────────────────

class LessonCreateRequest(BaseModel):
    lesson_type_id: UUID
    coach_id: UUID
    court_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    start_at: datetime
    end_at: datetime
    capacity: int | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def validate_schedule(self) -> "LessonCreateRequest":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly after start_at")
        if self.registration_opens_at and self.registration_closes_at:
            if self.registration_closes_at <= self.registration_opens_at:
                raise ValueError("registration_closes_at must be after registration_opens_at")
        return self


class LessonUpdateRequest(BaseModel):
    lesson_type_id: UUID | None = None
    coach_id: UUID | None = None
    court_id: UUID | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    capacity: int | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else None

    @model_validator(mode="after")
    def validate_schedule(self) -> "LessonUpdateRequest":
        if self.start_at and self.end_at and self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly after start_at")
        if self.registration_opens_at and self.registration_closes_at:
            if self.registration_closes_at <= self.registration_opens_at:
                raise ValueError("registration_closes_at must be after registration_opens_at")
        return self


class LessonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    club_id: UUID
    lesson_type_id: UUID
    coach_id: UUID
    court_id: UUID | None = None
    title: str
    description: str | None = None
    start_at: datetime
    end_at: datetime
    capacity: int | None = None
    price: Decimal
    currency: str
    status: LessonStatus
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    created_by_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    # Computed convenience fields
    coach_name: str | None = None
    lesson_type_name: str | None = None
    court_name: str | None = None
    is_private: bool = False
    duration_minutes: int = 60
    registered_count: int = 0
    available_spots: int | None = None
    is_registration_open: bool = False


class LessonDetailResponse(LessonResponse):
    coach: CoachResponse | None = None
    lesson_type: LessonTypeResponse | None = None


# ─── Registration Schemas ─────────────────────────────────────────────────────

class StaffRegisterPlayerRequest(BaseModel):
    user_id: UUID
    notes: str | None = None


class PlayerRegisterRequest(BaseModel):
    notes: str | None = None


class LessonRegistrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    lesson_id: UUID
    user_id: UUID
    status: LessonRegistrationStatus
    registered_at: datetime
    cancelled_at: datetime | None = None
    attended_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

    # Display extras
    user_name: str | None = None
    user_email: str | None = None
    lesson_title: str | None = None
    lesson_start_at: datetime | None = None


class PlayerLessonDetailResponse(LessonResponse):
    my_registration: LessonRegistrationResponse | None = None
    is_eligible: bool = True
    eligibility_reason: str | None = None
