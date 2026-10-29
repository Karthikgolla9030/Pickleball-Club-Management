"""
Pydantic Schemas for Club Custom Roles and Permissions
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.permissions import Permission

# Allowed permissions that a club owner may grant to a custom staff role
# Note: Platform Admin permissions and Club Owner role management (MANAGE_ROLES, MANAGE_USERS)
# are strictly excluded from custom roles.
ALLOWED_CUSTOM_PERMISSIONS = {
    Permission.MANAGE_MEMBERS.value,
    Permission.MANAGE_MEMBERSHIPS.value,
    Permission.MANAGE_BOOKINGS.value,
    Permission.MANAGE_COURTS.value,
    Permission.MANAGE_REPORTS.value,
    Permission.MANAGE_EVENTS.value,
    Permission.MANAGE_LESSONS.value,
    Permission.MANAGE_TOURNAMENTS.value,
    Permission.MANAGE_LEAGUES.value,
    Permission.MANAGE_TEAMS.value,
    Permission.MANAGE_MATCHES.value,
    Permission.MANAGE_SCORES.value,
    Permission.MANAGE_STANDINGS.value,
    Permission.MANAGE_RESULTS.value,
    Permission.MANAGE_SCHEDULES.value,
    Permission.MANAGE_PAYMENTS.value,
    Permission.MANAGE_CLUB.value,
    Permission.MANAGE_SETTINGS.value,
}


class CustomRoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Name of the custom role")
    description: str | None = Field(default=None, max_length=500, description="Optional description of responsibilities")
    permissions: list[str] = Field(default_factory=list, description="List of permission identifiers granted to the role")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Role name cannot be empty")
        return trimmed

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, v: list[str]) -> list[str]:
        cleaned = []
        for p in v:
            p_str = str(p).strip().lower()
            if p_str in ALLOWED_CUSTOM_PERMISSIONS and p_str not in cleaned:
                cleaned.append(p_str)
        return cleaned


class CustomRoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    permissions: list[str] | None = Field(default=None)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Role name cannot be empty")
        return trimmed

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        cleaned = []
        for p in v:
            p_str = str(p).strip().lower()
            if p_str in ALLOWED_CUSTOM_PERMISSIONS and p_str not in cleaned:
                cleaned.append(p_str)
        return cleaned


class CustomRoleResponse(BaseModel):
    id: UUID
    club_id: UUID
    name: str
    description: str | None = None
    permissions: list[str]
    staff_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
