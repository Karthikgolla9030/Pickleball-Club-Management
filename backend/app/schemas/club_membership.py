"""
Club Membership schemas.
MembershipInfo is included in auth responses so the client knows
which clubs the user manages and at what role.
The backend is the authoritative source — the client never sends role.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.club_membership import ClubRole


class MembershipInfo(BaseModel):
    """Returned in auth response and /me endpoint."""
    membership_id: UUID
    club_id: UUID
    club_name: str
    club_slug: str
    role: ClubRole
    role_label: str
    custom_role_id: UUID | None = None
    custom_role_name: str | None = None
    permissions: list[str] = Field(default_factory=list)
    is_active: bool

    model_config = {"from_attributes": True}


class ClubMembershipDetailResponse(BaseModel):
    """Returned by GET /clubs/{club_id}/membership for the authenticated user."""
    id: UUID
    user_id: UUID
    club_id: UUID
    role: ClubRole
    role_label: str
    custom_role_id: UUID | None = None
    custom_role_name: str | None = None
    permissions: list[str] = Field(default_factory=list)
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
    custom_role_id: UUID | None = None
    custom_role_name: str | None = None
    permissions: list[str] = Field(default_factory=list)
    is_active: bool
    user_email: str
    user_full_name: str | None = None
    profile_image_url: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AddMemberRequest(BaseModel):
    """Request to add a staff member to a club with a designated built-in or custom role."""
    email: str
    role: ClubRole | None = None
    custom_role_id: UUID | None = None
    full_name: str = Field(..., min_length=1, max_length=100)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    temporary_password: str | None = Field(default=None, min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or len(v) < 3 or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Full name cannot be empty")
        return trimmed

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: ClubRole | None) -> ClubRole | None:
        if v is not None:
            if v == ClubRole.CLUB_OWNER:
                raise ValueError("Cannot assign Club Owner role through staff management")
            if v == ClubRole.STAFF_MEMBER:
                raise ValueError(
                    "Staff Member is no longer an assignable built-in role. "
                    "Please select Club Manager, Tournament Director, or assign a custom role."
                )
        return v


class UpdateMemberRequest(BaseModel):
    """Request to update member role, custom role assignment, and/or active status."""
    role: ClubRole | None = None
    custom_role_id: UUID | None = None
    clear_custom_role: bool = False
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: ClubRole | None) -> ClubRole | None:
        if v is not None:
            if v == ClubRole.CLUB_OWNER:
                raise ValueError("Cannot assign Club Owner role through staff management")
            if v == ClubRole.STAFF_MEMBER:
                raise ValueError(
                    "Staff Member is no longer an assignable built-in role. "
                    "Please select Club Manager, Tournament Director, or assign a custom role."
                )
        return v
