"""Club schemas."""
from __future__ import annotations

import re
from datetime import datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.core.operating_hours import WeeklyOperatingHours
from app.core.phone import normalize_phone_number


class ClubResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None
    cover_image_url: str | None = None
    short_description: str | None = None
    description: str | None = None
    is_active: bool
    allows_free_join: bool = True

    # Contact Info
    contact_email: str | None = None
    contact_phone: str | None = None
    website: str | None = None
    established_year: int | None = None

    # Location Info
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None

    # Operating & Facilities
    operating_days: str | None = None
    opening_time: time
    closing_time: time
    timezone: str
    holiday_closure_notes: str | None = None
    facilities_summary: str | None = None
    operating_hours: dict[str, Any] | None = None

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicClubResponse(BaseModel):
    """Safe public representation of a club for players and discovery."""
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None
    cover_image_url: str | None = None
    short_description: str | None = None
    description: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    website: str | None = None
    established_year: int | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None
    operating_days: str | None = None
    opening_time: time
    closing_time: time
    timezone: str
    facilities_summary: str | None = None
    holiday_closure_notes: str | None = None
    operating_hours: dict[str, Any] | None = None
    is_active: bool
    allows_free_join: bool = True
    court_count: int | None = None
    member_count: int | None = None

    model_config = {"from_attributes": True}


class UserClubResponse(BaseModel):
    """
    Club item returned by GET /clubs for the authenticated user.
    Includes club info and the user's role/membership details in this club.
    """
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None
    cover_image_url: str | None = None
    short_description: str | None = None
    description: str | None = None
    city: str | None = None
    state: str | None = None
    is_active: bool
    membership_id: UUID
    role: str
    role_label: str
    membership_is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClubUpdateRequest(BaseModel):
    """Payload for updating club information (Owner only)."""
    name: str | None = Field(None, min_length=1, max_length=255)
    logo_url: str | None = Field(None, max_length=500)
    cover_image_url: str | None = Field(None, max_length=1000)
    short_description: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=2000)
    contact_email: str | None = None
    contact_phone: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=255)
    established_year: int | None = Field(None, ge=1800, le=2100)

    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)

    operating_days: str | None = Field(None, max_length=100)
    opening_time: time | None = None
    closing_time: time | None = None
    timezone: str | None = Field(None, max_length=50)
    holiday_closure_notes: str | None = Field(None, max_length=500)
    facilities_summary: str | None = Field(None, max_length=500)
    operating_hours: WeeklyOperatingHours | dict[str, Any] | None = None

    @field_validator("contact_email")
    @classmethod
    def validate_contact_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        email_regex = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
        if not re.match(email_regex, v):
            raise ValueError("Invalid email format for contact_email")
        return v

    @field_validator("website")
    @classmethod
    def validate_website(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if not (v.startswith("http://") or v.startswith("https://") or v.startswith("www.")):
            v = f"https://{v}"
        return v

    @field_validator("contact_phone", mode="before")
    @classmethod
    def validate_contact_phone(cls, v: str | None) -> str | None:
        return normalize_phone_number(v)

    @field_validator("name", "short_description", "description",
                     "address_line1", "address_line2", "city", "state", "postal_code",
                     "country", "operating_days", "timezone", "holiday_closure_notes",
                     "facilities_summary")
    @classmethod
    def strip_whitespace(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            trimmed = v.strip()
            return trimmed if trimmed else None
        return v



class ClubLogoUploadRequest(BaseModel):
    image_data: str = Field(..., description="Base64 encoded image or URL")


class ClubCreateRequest(BaseModel):
    """Payload for creating a new club (Phase 1)."""
    name: str = Field(..., min_length=2, max_length=255, description="Club or facility name")
    slug: str | None = Field(None, max_length=100, description="Unique URL slug (auto-generated if omitted)")
    short_description: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=2000)
    contact_email: str | None = None
    contact_phone: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=255)
    established_year: int | None = Field(None, ge=1800, le=2100)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(default="United States", max_length=100)
    operating_days: str | None = Field(default="Monday - Sunday", max_length=100)
    opening_time: time | None = Field(default=time(6, 0))
    closing_time: time | None = Field(default=time(22, 0))
    timezone: str | None = Field(default="UTC", max_length=50)
    facilities_summary: str | None = Field(None, max_length=500)
    holiday_closure_notes: str | None = Field(None, max_length=500)

    @field_validator("contact_email")
    @classmethod
    def validate_contact_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        email_regex = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
        if not re.match(email_regex, v):
            raise ValueError("Invalid email format for contact_email")
        return v

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().lower()
        if not v:
            return None
        slug_regex = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
        if not re.match(slug_regex, v):
            raise ValueError("Slug must contain only lowercase alphanumeric characters and single hyphens")
        return v

    @field_validator("website")
    @classmethod
    def validate_website(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if not (v.startswith("http://") or v.startswith("https://") or v.startswith("www.")):
            v = f"https://{v}"
        return v

    @field_validator(
        "name", "short_description", "description", "contact_phone",
        "address_line1", "address_line2", "city", "state", "postal_code",
        "country", "operating_days", "timezone", "facilities_summary",
        "holiday_closure_notes"
    )
    @classmethod
    def strip_whitespace(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            trimmed = v.strip()
            return trimmed if trimmed else None
        return v


class PublicClubDiscoveryResponse(BaseModel):
    """Paginated discovery response for public clubs."""
    items: list[PublicClubResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# ─── Club Dashboard Summary Schemas ───────────────────────────────────────────

class DashboardMembershipsSummary(BaseModel):
    total_players: int = 0
    active_players: int = 0
    pending_requests: int = 0


class DashboardBookingsSummary(BaseModel):
    today_count: int = 0
    upcoming_count: int = 0


class DashboardCompetitionsSummary(BaseModel):
    upcoming_tournaments: int = 0
    upcoming_leagues: int = 0


class DashboardTodayScheduleItem(BaseModel):
    id: UUID
    title: str
    item_type: str  # "event" | "lesson"
    status: str
    status_label: str
    start_at: datetime
    end_at: datetime
    location: str | None = None
    capacity: int | None = None
    registered_count: int = 0


class DashboardEventsLessonsSummary(BaseModel):
    upcoming_events: int = 0
    upcoming_lessons: int = 0
    today_item: DashboardTodayScheduleItem | None = None


class DashboardPaymentsSummary(BaseModel):
    pending_count: int = 0
    pending_amount: Decimal = Decimal("0.00")
    succeeded_count: int = 0
    total_revenue: Decimal = Decimal("0.00")


class DashboardStaffSummary(BaseModel):
    total_staff: int = 0
    active_staff: int = 0


class ClubDashboardResponse(BaseModel):
    club_id: UUID
    club_name: str
    memberships: DashboardMembershipsSummary
    bookings: DashboardBookingsSummary
    competitions: DashboardCompetitionsSummary
    events_and_lessons: DashboardEventsLessonsSummary
    payments: DashboardPaymentsSummary | None = None
    staff: DashboardStaffSummary

    model_config = {"from_attributes": True}


class ClubOperatingHoursUpdateRequest(BaseModel):
    operating_hours: WeeklyOperatingHours


class ClubOperatingHoursResponse(BaseModel):
    club_id: UUID
    timezone: str
    operating_hours: dict[str, Any]
    fallback_opening_time: time
    fallback_closing_time: time


class OperatingHoursDisruptionItem(BaseModel):
    booking_id: UUID
    court_id: UUID
    court_name: str
    player_id: UUID | None = None
    start_at: datetime
    end_at: datetime
    status: str


class OperatingHoursDisruptionPreviewResponse(BaseModel):
    affected_bookings_count: int
    affected_bookings: list[OperatingHoursDisruptionItem]
    message: str


