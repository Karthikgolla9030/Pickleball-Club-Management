"""
Aught2 Pickleball — Club & Membership API Endpoints

Implements:
  - GET /clubs
  - GET /clubs/{club_id}
  - GET /clubs/{club_id}/membership
  - GET /clubs/{club_id}/members
  - POST /clubs/{club_id}/members
  - PATCH /clubs/{club_id}/members/{membership_id}
  - DELETE /clubs/{club_id}/members/{membership_id}

Security & Architecture:
  - Backend database is the ONLY source of truth for club access and roles.
  - Zero trust for client-provided roles, query params, or headers.
  - Route authorization is driven exclusively by the centralized permission registry.
  - Owner safety rules are enforced server-side.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_club_membership,
    get_current_active_user,
    get_current_platform_owner,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from app.permissions import Permission
from app.schemas.club import (
    ClubCreateRequest,
    ClubDashboardResponse,
    ClubLogoUploadRequest,
    ClubOperatingHoursResponse,
    ClubOperatingHoursUpdateRequest,
    ClubResponse,
    ClubUpdateRequest,
    OperatingHoursDisruptionPreviewResponse,
    PublicClubDiscoveryResponse,
    PublicClubResponse,
    UserClubResponse,
)
from app.schemas.club_membership import (
    AddMemberRequest,
    ClubMembershipDetailResponse,
    MemberResponse,
    UpdateMemberRequest,
)
from app.schemas.club_membership_request import (
    MembershipRequestReject,
    MembershipRequestResponse,
)
from app.schemas.club_player_membership import (
    ClubPlayerMembershipResponse,
    CreateClubPlayerMembershipRequest,
    UpdateClubPlayerMembershipRequest,
)
from app.schemas.court import PlayerCourtResponse
from app.services.club_membership_request_service import ClubMembershipRequestService
from app.services.club_service import ClubService
from app.services.player_service import PlayerService

router = APIRouter(prefix="/clubs", tags=["Clubs & Memberships"])


@router.get(
    "/{club_id}/player-courts",
    response_model=list[PlayerCourtResponse],
    summary="List active courts in club (Player-facing alias)",
    include_in_schema=False,
)
async def list_player_courts_in_club(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> list[PlayerCourtResponse]:
    from app.services.court_service import CourtService
    return await CourtService(db).list_active_courts(club_id)


@router.get(
    "",
    response_model=list[UserClubResponse],
    summary="List clubs available to current user",
    description="Returns all clubs the authenticated user belongs to with role and membership status. Never returns clubs the user does not belong to.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def list_user_clubs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserClubResponse]:
    """Retrieve clubs that the authenticated user belongs to."""
    return await ClubService(db).list_user_clubs(current_user.id)


@router.post(
    "",
    response_model=UserClubResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new club",
    description="Creates a new club. Restricted to authorized platform owners. Regular applicants must submit an application via POST /api/v1/club-applications.",
    responses={
        400: {"description": "Validation error or slug already taken"},
        401: {"description": "Not authenticated"},
        403: {"description": "Platform owner authorization required"},
        422: {"description": "Malformed request payload"},
    },
)
async def create_club(
    payload: ClubCreateRequest,
    current_user: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> UserClubResponse:
    """Create a new club. Restricted to platform owners."""
    return await ClubService(db).create_club(
        owner_user_id=current_user.id,
        payload=payload,
    )


@router.get(
    "/public",
    response_model=PublicClubDiscoveryResponse,
    summary="Discover public clubs",
    description="Returns paginated public details of active clubs for player discovery. Supports search by name/description and location filtering.",
)
async def discover_public_clubs(
    search: str | None = Query(default=None, description="Search term for club name, description, city, or state"),
    city: str | None = Query(default=None, description="Filter by city"),
    state: str | None = Query(default=None, description="Filter by state"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    db: AsyncSession = Depends(get_db),
) -> PublicClubDiscoveryResponse:
    """Public club discovery for players with search, filtering and pagination."""
    return await ClubService(db).discover_public_clubs(
        search=search,
        city=city,
        state=state,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{club_id}",
    response_model=ClubResponse,
    summary="Get club details",
    description="Return the authenticated user's accessible club. Unknown clubs return 404. Non-member or inactive membership returns 403.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not a member or membership inactive"},
        404: {"description": "Club not found"},
    },
)
async def get_club(
    club_id: UUID,
    membership: ClubMembership = Depends(get_club_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubResponse:
    """Retrieve details for a club the user has active membership in."""
    return await ClubService(db).get_club(
        user_id=current_user.id,
        club_id=club_id,
    )


@router.get(
    "/{club_id}/public",
    response_model=PublicClubResponse,
    summary="Get public club details",
    description="Returns public details of an active club for players and discovery.",
    responses={
        404: {"description": "Club not found or inactive"},
    },
)
async def get_public_club(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> PublicClubResponse:
    """Retrieve public profile for an active club without requiring staff role."""
    return await ClubService(db).get_public_club(club_id=club_id)


@router.patch(
    "/{club_id}",
    response_model=ClubResponse,
    summary="Update club profile and settings",
    description="Update club details, location, and operating hours. Club Owner only (manage_club permission required).",
    responses={
        400: {"description": "Validation error or invalid time range"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_club required)"},
        404: {"description": "Club not found"},
    },
)
async def update_club(
    club_id: UUID,
    payload: ClubUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> ClubResponse:
    """Update club details (Club Owner only)."""
    return await ClubService(db).update_club(club_id=club_id, payload=payload)


@router.post(
    "/{club_id}/logo",
    response_model=ClubResponse,
    summary="Upload club logo",
    description="Upload or update club logo (base64 or URL). Club Owner only (manage_club permission required).",
    responses={
        400: {"description": "Invalid image payload"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_club required)"},
        413: {"description": "Image exceeds size limit"},
    },
)
async def upload_club_logo(
    club_id: UUID,
    payload: ClubLogoUploadRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> ClubResponse:
    """Upload club logo (Club Owner only)."""
    return await ClubService(db).upload_club_logo(club_id=club_id, image_data=payload.image_data)


@router.get(
    "/{club_id}/operating-hours",
    response_model=ClubOperatingHoursResponse,
    summary="Get club operating hours",
    description="Returns full weekly operating schedule for the club. Accessible to club members.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Not a member or membership inactive"},
        404: {"description": "Club not found"},
    },
)
async def get_club_operating_hours(
    club_id: UUID,
    membership: ClubMembership = Depends(get_club_membership),
    db: AsyncSession = Depends(get_db),
) -> ClubOperatingHoursResponse:
    """Retrieve weekly operating schedule for the club."""
    return await ClubService(db).get_operating_hours(club_id=club_id)


@router.put(
    "/{club_id}/operating-hours",
    response_model=ClubOperatingHoursResponse,
    summary="Update club operating hours",
    description="Updates weekly operating hours for the club. Club Owner only (manage_club permission required).",
    responses={
        400: {"description": "Invalid schedule or times"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_club required)"},
        404: {"description": "Club not found"},
    },
)
async def update_club_operating_hours(
    club_id: UUID,
    payload: ClubOperatingHoursUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> ClubOperatingHoursResponse:
    """Update weekly operating schedule for the club (Club Owner only)."""
    return await ClubService(db).update_operating_hours(club_id=club_id, payload=payload)


@router.post(
    "/{club_id}/operating-hours/preview-disruptions",
    response_model=OperatingHoursDisruptionPreviewResponse,
    summary="Preview booking disruptions for proposed operating hours",
    description="Checks if any upcoming confirmed bookings would fall outside proposed operating hours. Never alters bookings. Club Owner only.",
    responses={
        400: {"description": "Invalid schedule"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_club required)"},
        404: {"description": "Club not found"},
    },
)
async def preview_operating_hours_disruptions(
    club_id: UUID,
    payload: ClubOperatingHoursUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> OperatingHoursDisruptionPreviewResponse:
    """Preview affected confirmed bookings before updating operating hours."""
    return await ClubService(db).preview_operating_hours_disruptions(club_id=club_id, payload=payload)



@router.get(
    "/{club_id}/membership",
    response_model=ClubMembershipDetailResponse,
    summary="Get current user's membership for club",
    description="Return the authenticated user's membership and role in this club.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Membership inactive"},
        404: {"description": "Club or membership not found"},
    },
)
async def get_my_club_membership(
    club_id: UUID,
    membership: ClubMembership = Depends(get_club_membership),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubMembershipDetailResponse:
    """Retrieve the authenticated user's own membership in the specified club."""
    return await ClubService(db).get_membership(
        user_id=current_user.id,
        club_id=club_id,
    )


@router.get(
    "/{club_id}/dashboard",
    response_model=ClubDashboardResponse,
    summary="Get Club Owner / Manager dashboard summary",
    description="Retrieve aggregated operational metrics for the club. Accessible to club staff.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (not a staff member of this club)"},
        404: {"description": "Club not found"},
    },
)
async def get_club_dashboard(
    club_id: UUID,
    membership: ClubMembership = Depends(get_club_membership),
    db: AsyncSession = Depends(get_db),
) -> ClubDashboardResponse:
    """Retrieve aggregated dashboard metrics for the authorized club."""
    return await ClubService(db).get_dashboard_summary(
        club_id=club_id,
        caller_role=membership.role,
    )


@router.get(
    "/{club_id}/members",
    response_model=list[MemberResponse],
    summary="List club members",
    description="List all members of the club. Authorized for Club Owner and Club Manager. Tournament Director is DENIED (403).",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_members required)"},
        404: {"description": "Club not found"},
    },
)
async def list_club_members(
    club_id: UUID,
    role: ClubRole | None = None,
    search: str | None = None,
    is_active: bool | None = None,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> list[MemberResponse]:
    """List members of the selected club."""
    return await ClubService(db).list_members(
        club_id=club_id,
        role=role,
        search=search,
        is_active=is_active,
    )


@router.get(
    "/{club_id}/members/{membership_id}",
    response_model=MemberResponse,
    summary="Get club member details",
    description="Retrieve details of a single staff member in this club. Authorized for Club Owner and Club Manager.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_members required)"},
        404: {"description": "Member not found in club"},
    },
)
async def get_club_member_detail(
    club_id: UUID,
    membership_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> MemberResponse:
    """Retrieve details of a single staff member in this club."""
    return await ClubService(db).get_member(
        club_id=club_id,
        membership_id=membership_id,
    )


@router.post(
    "/{club_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a member to the club",
    description="Add an existing user to the club with a designated role. Club Owner only (manage_roles required).",
    responses={
        400: {"description": "User is already an active member"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_roles required)"},
        404: {"description": "User with email not found or club not found"},
        422: {"description": "Invalid role value or request body"},
    },
)
async def add_club_member(
    club_id: UUID,
    payload: AddMemberRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> MemberResponse:
    """Add a member to the club."""
    return await ClubService(db).add_member(
        club_id=club_id,
        email=payload.email,
        role=payload.role,
        full_name=payload.full_name,
        temporary_password=payload.temporary_password,
    )


@router.patch(
    "/{club_id}/members/{membership_id}",
    response_model=MemberResponse,
    summary="Update club member role or active status",
    description="Update role or status of a club membership. Enforces Owner Safety Rules (cannot demote or deactivate final active owner). Club Owner only.",
    responses={
        400: {"description": "Owner safety rule violation (cannot remove final active owner)"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_roles required)"},
        404: {"description": "Member not found in club"},
        422: {"description": "Invalid role value or request body"},
    },
)
async def update_club_member(
    club_id: UUID,
    membership_id: UUID,
    payload: UpdateMemberRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> MemberResponse:
    """Update a club member's role or is_active state."""
    return await ClubService(db).update_member(
        club_id=club_id,
        membership_id=membership_id,
        role=payload.role,
        is_active=payload.is_active,
    )


@router.delete(
    "/{club_id}/members/{membership_id}",
    response_model=MemberResponse,
    summary="Deactivate a club member",
    description="Soft-deactivates a club membership (is_active = False). Enforces Owner Safety Rules. Club Owner only.",
    responses={
        400: {"description": "Owner safety rule violation (cannot deactivate final active owner)"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_roles required)"},
        404: {"description": "Member not found in club"},
    },
)
async def deactivate_club_member(
    club_id: UUID,
    membership_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_ROLES)),
    db: AsyncSession = Depends(get_db),
) -> MemberResponse:
    """Deactivate a club membership."""
    return await ClubService(db).deactivate_member(
        club_id=club_id,
        membership_id=membership_id,
    )


# ─── Club Player Memberships (Facility Player Management) ──────────────────────────


@router.get(
    "/{club_id}/player-memberships",
    response_model=list[ClubPlayerMembershipResponse],
    summary="List club player members",
    description="Lists all player memberships registered with this club. Club staff with MANAGE_MEMBERS permission only.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_members required)"},
    },
)
async def list_club_player_memberships(
    club_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> list[ClubPlayerMembershipResponse]:
    """Retrieve player memberships registered for this club."""
    return await PlayerService(db).list_club_player_memberships(club_id=club_id)


@router.post(
    "/{club_id}/player-memberships",
    response_model=ClubPlayerMembershipResponse,
    status_code=status.HTTP_403_FORBIDDEN,
    summary="Manual player enrollment is disabled",
    description="Manual player enrollment by staff is disabled. Players must join the club via player self-service or through membership request approval.",
    responses={
        403: {"description": "Manual player enrollment is disabled"},
    },
)
async def add_club_player_membership(
    club_id: UUID,
    payload: CreateClubPlayerMembershipRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> ClubPlayerMembershipResponse:
    """Manual player enrollment by staff is disabled."""
    return await PlayerService(db).add_club_player_membership(
        club_id=club_id,
        payload=payload,
    )


@router.patch(
    "/{club_id}/player-memberships/{membership_id}",
    response_model=ClubPlayerMembershipResponse,
    summary="Update club player membership",
    description="Updates membership status, number, or expiration date. Requires MANAGE_MEMBERS permission.",
    responses={
        400: {"description": "Validation error (e.g. expires_at before joined_at)"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_members required)"},
        404: {"description": "Player membership not found in this club"},
    },
)
async def update_club_player_membership(
    club_id: UUID,
    membership_id: UUID,
    payload: UpdateClubPlayerMembershipRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> ClubPlayerMembershipResponse:
    """Update status, membership number, or expiry of a club player membership."""
    return await PlayerService(db).update_club_player_membership(
        club_id=club_id,
        membership_id=membership_id,
        payload=payload,
    )


# ─── Club Membership Requests (Staff Management) ──────────────────────────


@router.get(
    "/{club_id}/membership-requests",
    response_model=list[MembershipRequestResponse],
    summary="List club membership requests",
    description="List player membership requests for this club. Club staff with MANAGE_MEMBERS permission only (Club Owner, Club Manager).",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_members required)"},
    },
)
async def list_club_membership_requests(
    club_id: UUID,
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status (pending, approved, rejected, withdrawn)"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> list[MembershipRequestResponse]:
    """Retrieve membership requests submitted for this club."""
    return await ClubMembershipRequestService(db).list_club_requests(
        club_id=club_id,
        status_filter=status_filter,
    )


@router.post(
    "/{club_id}/membership-requests/{request_id}/approve",
    response_model=MembershipRequestResponse,
    summary="Approve club membership request",
    description="Approves a pending membership request and activates player membership. Requires MANAGE_MEMBERS permission. Staff cannot approve their own requests.",
    responses={
        400: {"description": "Request not in pending status"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions or self-approval attempt"},
        404: {"description": "Request not found in this club"},
    },
)
async def approve_club_membership_request(
    club_id: UUID,
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipRequestResponse:
    """Approve player membership request."""
    return await ClubMembershipRequestService(db).approve_request(
        club_id=club_id,
        request_id=request_id,
        reviewer_user_id=current_user.id,
    )


@router.post(
    "/{club_id}/membership-requests/{request_id}/reject",
    response_model=MembershipRequestResponse,
    summary="Reject club membership request",
    description="Rejects a pending membership request with optional reason. Requires MANAGE_MEMBERS permission.",
    responses={
        400: {"description": "Request not in pending status"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Request not found in this club"},
    },
)
async def reject_club_membership_request(
    club_id: UUID,
    request_id: UUID,
    payload: MembershipRequestReject | None = None,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipRequestResponse:
    """Reject player membership request."""
    return await ClubMembershipRequestService(db).reject_request(
        club_id=club_id,
        request_id=request_id,
        reviewer_user_id=current_user.id,
        reason=payload.rejection_reason if payload else None,
    )

