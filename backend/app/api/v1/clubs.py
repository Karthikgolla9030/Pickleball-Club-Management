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

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_club_membership,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.user import User
from app.permissions import Permission
from app.schemas.club import ClubResponse, UserClubResponse
from app.schemas.club_membership import (
    AddMemberRequest,
    ClubMembershipDetailResponse,
    MemberResponse,
    UpdateMemberRequest,
)
from app.schemas.club_player_membership import (
    ClubPlayerMembershipResponse,
    CreateClubPlayerMembershipRequest,
    UpdateClubPlayerMembershipRequest,
)
from app.services.club_service import ClubService
from app.services.player_service import PlayerService

router = APIRouter(prefix="/clubs", tags=["Clubs & Memberships"])


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
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> list[MemberResponse]:
    """List members of the selected club."""
    return await ClubService(db).list_members(club_id)


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
    status_code=status.HTTP_201_CREATED,
    summary="Add / enroll a player in this club",
    description="Enrolls an existing user as a player member in the club. If previously expired/inactive/suspended, reactivates the membership. Requires MANAGE_MEMBERS permission.",
    responses={
        400: {"description": "User already has an active player membership or validation error"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_members required)"},
        404: {"description": "User with email not found"},
    },
)
async def add_club_player_membership(
    club_id: UUID,
    payload: CreateClubPlayerMembershipRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERS)),
    db: AsyncSession = Depends(get_db),
) -> ClubPlayerMembershipResponse:
    """Add a player member to the club."""
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
