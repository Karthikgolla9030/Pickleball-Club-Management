"""
Pickleball Multi-Club Platform — Platform Admin Schemas

Data transfer models for platform-level administration:
- Platform-wide user directory with cross-club staff & player memberships
- Platform club suspension and reactivation
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlatformUserStaffMembership(BaseModel):
    """Staff role held by a user at a specific club."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    club_id: UUID
    club_name: str
    club_slug: str
    role: str
    role_label: str
    is_active: bool
    created_at: datetime


class PlatformUserPlayerMembership(BaseModel):
    """Player membership held by a user at a specific club."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    club_id: UUID
    club_name: str
    club_slug: str
    status: str
    status_label: str
    membership_number: str | None = None
    joined_at: datetime


class PlatformPlayerProfile(BaseModel):
    """Player skill rating and display info."""
    model_config = ConfigDict(from_attributes=True)

    display_name: str | None = None
    skill_rating: float | None = None


class PlatformUserItem(BaseModel):
    """Administrative user record with cross-club relationships. Excludes all sensitive credentials."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str | None = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    player_profile: PlatformPlayerProfile | None = None
    club_memberships: list[PlatformUserStaffMembership] = Field(default_factory=list)
    club_player_memberships: list[PlatformUserPlayerMembership] = Field(default_factory=list)
    total_memberships_count: int = 0


class PlatformUsersListResponse(BaseModel):
    """Paginated platform users response."""
    items: list[PlatformUserItem]
    total: int
    page: int
    page_size: int


class PlatformClubStatusUpdateRequest(BaseModel):
    """Payload to administratively suspend or reactivate a club facility."""
    model_config = ConfigDict(str_strip_whitespace=True)

    is_active: bool = Field(..., description="Target active status for the club")
    reason: str = Field(
        ...,
        min_length=5,
        max_length=500,
        description="Mandatory administrative reason for the suspension or reactivation",
    )


class PlatformClubStatusUpdateResponse(BaseModel):
    """Confirmation response after updating club platform status."""
    id: str
    name: str
    slug: str
    is_active: bool
    reason: str
    updated_at: str


class PlatformAuditLogItem(BaseModel):
    """Read-only audit log entry for platform administration."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    actor_id: UUID | None = None
    actor_email: str | None = None
    actor_name: str | None = None
    action: str
    action_label: str
    entity_type: str
    entity_id: str
    entity_name: str | None = None
    outcome: str
    reason: str | None = None
    details: dict | None = None
    ip_address: str | None = None


class PlatformAuditLogsListResponse(BaseModel):
    """Paginated list of platform audit log records with action breakdown."""
    items: list[PlatformAuditLogItem]
    total: int
    page: int
    page_size: int
    action_counts: dict[str, int] = Field(default_factory=dict)


class PlatformOverviewApplications(BaseModel):
    pending: int = 0
    approved: int = 0
    rejected: int = 0
    total: int = 0


class PlatformOverviewClubs(BaseModel):
    total: int = 0
    active: int = 0
    suspended: int = 0


class PlatformOverviewUsers(BaseModel):
    total: int = 0
    active: int = 0


class PlatformOverviewTickets(BaseModel):
    open: int = 0
    in_progress: int = 0
    waiting_for_requester: int = 0
    resolved: int = 0
    closed: int = 0
    total: int = 0


class PlatformOverviewResponse(BaseModel):
    """Consolidated real-time platform overview dashboard metrics."""
    applications: PlatformOverviewApplications
    clubs: PlatformOverviewClubs
    users: PlatformOverviewUsers
    tickets: PlatformOverviewTickets
    system_status: str = "operational"


