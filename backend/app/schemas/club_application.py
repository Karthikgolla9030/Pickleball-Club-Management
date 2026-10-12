"""
Aught2 Pickleball — Club Application Schemas
Request and response validation models for pre-login club registration & approval.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.club_application import ClubApplicationStatus


class ClubApplicationSubmitRequest(BaseModel):
    """Payload for submitting a new club registration for platform review."""
    model_config = ConfigDict(str_strip_whitespace=True)

    applicant_name: str = Field(..., min_length=2, max_length=255, description="Full name of applicant")
    applicant_email: EmailStr = Field(..., description="Email address for notifications and account access")
    applicant_phone: str | None = Field(default=None, max_length=50, description="Phone number of applicant")
    applicant_password: str = Field(..., min_length=8, max_length=128, description="Password to create or verify account")

    club_name: str = Field(..., min_length=2, max_length=255, description="Official club facility name")
    slug: str | None = Field(default=None, max_length=100, description="Custom URL identifier for club")
    short_description: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    website: str | None = Field(default=None, max_length=255)
    established_year: int | None = Field(default=None, ge=1800, le=2100)

    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str = Field(default="United States", max_length=100)

    operating_days: str = Field(default="Monday - Sunday", max_length=100)
    opening_time: str = Field(default="06:00:00")
    closing_time: str = Field(default="22:00:00")
    timezone: str = Field(default="UTC", max_length=50)
    facilities_summary: str | None = Field(default=None, max_length=500)

    @field_validator("slug", mode="before")
    @classmethod
    def normalize_slug(cls, v: str | None) -> str | None:
        if v:
            import re
            cleaned = re.sub(r"[^a-z0-9-]+", "-", v.lower()).strip("-")
            return cleaned or None
        return None


class ClubApplicationRejectRequest(BaseModel):
    """Payload for rejecting a pending club application."""
    rejection_reason: str | None = Field(default=None, max_length=500, description="Optional explanation for rejection")


class ClubApplicationResponse(BaseModel):
    """Complete application response model for review and applicant details."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reference_number: str
    applicant_name: str
    applicant_email: str
    applicant_phone: str | None
    user_id: UUID | None
    club_name: str
    slug: str
    short_description: str | None
    description: str | None
    contact_email: str | None
    contact_phone: str | None
    website: str | None
    established_year: int | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str
    operating_days: str | None
    opening_time: str
    closing_time: str
    timezone: str
    facilities_summary: str | None
    status: ClubApplicationStatus
    status_label: str
    rejection_reason: str | None
    reviewed_by_id: UUID | None
    reviewed_at: datetime | None
    club_id: UUID | None
    created_at: datetime
    updated_at: datetime


class ClubApplicationStatusLookupResponse(BaseModel):
    """Safe public status check response — does not disclose sensitive applicant info."""
    reference_number: str
    club_name: str
    applicant_name: str
    status: ClubApplicationStatus
    status_label: str
    message: str
    rejection_reason: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
