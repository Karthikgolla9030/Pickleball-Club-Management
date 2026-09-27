"""
Club Membership schemas.
MembershipInfo is included in auth responses so the client knows
which clubs the user manages and at what role.
The backend is the authoritative source — the client never sends role.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.models.club_membership import ClubRole


class MembershipInfo(BaseModel):
    """Returned in auth response and /me endpoint."""
    membership_id: UUID
    club_id: UUID
    club_name: str
    club_slug: str
    role: ClubRole
    role_label: str
    is_active: bool

    model_config = {"from_attributes": True}


class ClubMembershipDetailResponse(BaseModel):
    """Returned by GET /clubs/{club_id}/membership for the authenticated user."""
    id: UUID
    user_id: UUID
    club_id: UUID
    role: ClubRole
    role_label: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MemberResponse(BaseModel):
    """Member item returned by member management endpoints."""
    id: UUID
    user_id: UUID
    club_id: UUID
    role: ClubRole
    role_label: str
    is_active: bool
    user_email: str
    user_full_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AddMemberRequest(BaseModel):
    """Request to add a staff member to a club with a designated role."""
    email: str
    role: ClubRole
    full_name: str | None = None
    temporary_password: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or len(v) < 3 or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v



class UpdateMemberRequest(BaseModel):
    """Request to update member role and/or active status."""
    role: ClubRole | None = None
    is_active: bool | None = None
