"""
Club Player Membership schemas.
Handles player participation at clubs and club-side member enrollment.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator, model_validator

from app.models.club_player_membership import PlayerMembershipStatus


class PlayerClubResponse(BaseModel):
    """Returned by GET /player/clubs."""
    club_id: UUID
    club_name: str
    club_slug: str
    membership_id: UUID
    membership_number: str | None = None
    status: PlayerMembershipStatus
    joined_at: datetime
    expires_at: datetime | None = None

    model_config = {"from_attributes": True}


class PlayerClubMembershipDetailResponse(BaseModel):
    """Returned by GET /player/clubs/{club_id}."""
    id: UUID
    user_id: UUID
    club_id: UUID
    club_name: str
    membership_number: str | None = None
    status: PlayerMembershipStatus
    joined_at: datetime
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateClubPlayerMembershipRequest(BaseModel):
    """Request for club staff to add a player to a club."""
    email: str
    membership_number: str | None = None
    status: PlayerMembershipStatus = PlayerMembershipStatus.ACTIVE
    joined_at: datetime | None = None
    expires_at: datetime | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or len(v) < 3 or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v

    @model_validator(mode="after")
    def validate_dates(self) -> CreateClubPlayerMembershipRequest:
        if self.expires_at and self.joined_at and self.expires_at < self.joined_at:
            raise ValueError("expires_at cannot be before joined_at")
        return self


class UpdateClubPlayerMembershipRequest(BaseModel):
    """Request for club staff to update a player's membership."""
    status: PlayerMembershipStatus | None = None
    membership_number: str | None = None
    expires_at: datetime | None = None


class ClubPlayerMembershipResponse(BaseModel):
    """Response returned when club staff manages player memberships."""
    id: UUID
    user_id: UUID
    club_id: UUID
    user_email: str
    user_full_name: str | None = None
    profile_image_url: str | None = None
    membership_number: str | None = None
    status: PlayerMembershipStatus
    status_label: str
    joined_at: datetime
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
