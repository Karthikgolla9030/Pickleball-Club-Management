"""
Aught2 Pickleball — Club Membership Request Schemas
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MembershipRequestCreate(BaseModel):
    message: str | None = Field(None, max_length=1000, description="Optional note or application details")


class MembershipRequestReject(BaseModel):
    rejection_reason: str | None = Field(None, max_length=500, description="Optional reason for rejecting the request")


class MembershipRequestResponse(BaseModel):
    id: UUID
    club_id: UUID
    club_name: str
    club_slug: str
    club_logo_url: str | None = None

    user_id: UUID
    user_email: str
    user_full_name: str | None = None
    player_display_name: str | None = None
    player_skill_rating: float | None = None
    player_photo_url: str | None = None

    status: str
    status_label: str
    message: str | None = None
    rejection_reason: str | None = None

    reviewed_by_id: UUID | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
