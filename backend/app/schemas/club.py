"""Club schemas."""
from __future__ import annotations

import re
from datetime import datetime, time
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ClubResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None
    short_description: str | None = None
    description: str | None = None
    is_active: bool

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

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PublicClubResponse(BaseModel):
    """Safe public representation of a club for players and discovery."""
    id: UUID
    name: str
    slug: str
    logo_url: str | None = None
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
    is_active: bool

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

    @field_validator("name", "short_description", "description", "contact_phone",
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
