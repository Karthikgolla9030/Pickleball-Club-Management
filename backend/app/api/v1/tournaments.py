"""
Aught2 Pickleball — Tournament & Tournament Registration API Endpoints

Implements:
  Club-Scoped Competition Management (MANAGE_TOURNAMENTS):
    - GET /clubs/{club_id}/tournaments
    - POST /clubs/{club_id}/tournaments
    - GET /clubs/{club_id}/tournaments/{tournament_id}
    - PATCH /clubs/{club_id}/tournaments/{tournament_id}
    - POST /clubs/{club_id}/tournaments/{tournament_id}/open-registration
    - POST /clubs/{club_id}/tournaments/{tournament_id}/close-registration
    - POST /clubs/{club_id}/tournaments/{tournament_id}/cancel
    - GET /clubs/{club_id}/tournaments/{tournament_id}/registrations
    - PATCH /clubs/{club_id}/tournaments/{tournament_id}/registrations/{registration_id}

  Player Self-Registration:
    - POST /tournaments/{tournament_id}/register
    - DELETE /tournaments/{tournament_id}/register

Security & Architecture:
  - Club Owner, Club Manager, and Tournament Director possess MANAGE_TOURNAMENTS.
  - Players and unauthorized staff receive 403 Forbidden on club endpoints.
  - Strict tenant isolation enforced at database query level.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.tournament import TournamentStatus
from app.models.user import User
from app.permissions import Permission, has_permission
from app.schemas.tournament import (
    TournamentCreate,
    TournamentResponse,
    TournamentUpdate,
)
from app.schemas.tournament_registration import (
    EligiblePartnerResponse,
    PlayerSelfRegistrationRequest,
    PlayerSelfRegistrationResponse,
    PlayerTournamentRegistrationStatusResponse,
    TournamentRegistrationResponse,
    UpdateRegistrationRequest,
)
from app.services.tournament_service import TournamentService

# Router for club-scoped endpoints: /clubs/{club_id}/tournaments
club_tournaments_router = APIRouter(prefix="/clubs/{club_id}/tournaments", tags=["Club Tournaments"])

# Router for general/player tournament endpoints: /tournaments
tournaments_router = APIRouter(prefix="/tournaments", tags=["Tournaments"])


# ─── Club-Scoped Tournament Management ─────────────────────────────────────────


@club_tournaments_router.get(
    "",
    response_model=list[TournamentResponse],
    summary="List tournaments for a club",
    description="Returns all tournaments belonging to this club. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_tournaments required)"},
    },
)
async def list_club_tournaments(
    club_id: UUID,
    status_filter: TournamentStatus | None = Query(default=None, alias="status"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> list[TournamentResponse]:
    """Retrieve all tournaments for a club."""
    return await TournamentService(db).list_club_tournaments(
        club_id=club_id, status_filter=status_filter
    )


@club_tournaments_router.post(
    "",
    response_model=TournamentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new tournament in club",
    description="Creates a tournament in DRAFT status. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        400: {"description": "Validation error (e.g. date ordering, limits)"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_tournaments required)"},
        422: {"description": "Malformed request payload"},
    },
)
async def create_tournament(
    club_id: UUID,
    payload: TournamentCreate,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Create a tournament."""
    return await TournamentService(db).create_tournament(
        club_id=club_id,
        created_by_user_id=current_user.id,
        payload=payload,
    )


@club_tournaments_router.get(
    "/{tournament_id}",
    response_model=TournamentResponse,
    summary="Get tournament details",
    description="Returns full tournament details. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_tournaments required)"},
        404: {"description": "Tournament not found in this club"},
    },
)
async def get_tournament(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Retrieve tournament by ID."""
    return await TournamentService(db).get_club_tournament(
        club_id=club_id, tournament_id=tournament_id
    )


@club_tournaments_router.patch(
    "/{tournament_id}",
    response_model=TournamentResponse,
    summary="Update tournament configuration",
    description="Updates tournament settings subject to lifecycle locking rules. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        400: {"description": "Update rejected due to lifecycle locking or invalid dates"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_tournaments required)"},
        404: {"description": "Tournament not found in this club"},
    },
)
async def update_tournament(
    club_id: UUID,
    tournament_id: UUID,
    payload: TournamentUpdate,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Update tournament."""
    return await TournamentService(db).update_tournament(
        club_id=club_id,
        tournament_id=tournament_id,
        payload=payload,
    )


# ─── Lifecycle State Transitions ──────────────────────────────────────────────


@club_tournaments_router.post(
    "/{tournament_id}/open-registration",
    response_model=TournamentResponse,
    summary="Open tournament registration",
    description="Transitions status from draft to registration_open. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        400: {"description": "Tournament not in draft status"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Tournament not found in this club"},
    },
)
async def open_registration(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Open tournament registration."""
    return await TournamentService(db).open_registration(
        club_id=club_id, tournament_id=tournament_id
    )


@club_tournaments_router.post(
    "/{tournament_id}/close-registration",
    response_model=TournamentResponse,
    summary="Close tournament registration",
    description="Transitions status from registration_open to registration_closed. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        400: {"description": "Tournament not in registration_open status"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Tournament not found in this club"},
    },
)
async def close_registration(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Close tournament registration."""
    return await TournamentService(db).close_registration(
        club_id=club_id, tournament_id=tournament_id
    )


@club_tournaments_router.post(
    "/{tournament_id}/cancel",
    response_model=TournamentResponse,
    summary="Cancel tournament",
    description="Cancels tournament from draft, registration_open, or registration_closed. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        400: {"description": "Tournament already completed or cancelled"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Tournament not found in this club"},
    },
)
async def cancel_tournament(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Cancel tournament."""
    return await TournamentService(db).cancel_tournament(
        club_id=club_id, tournament_id=tournament_id
    )


# ─── Participant Administration (Staff) ────────────────────────────────────────


@club_tournaments_router.get(
    "/{tournament_id}/registrations",
    response_model=list[TournamentRegistrationResponse],
    summary="List tournament registrations",
    description="Lists all player registrations for a tournament. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Tournament not found in this club"},
    },
)
async def list_registrations(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> list[TournamentRegistrationResponse]:
    """Retrieve tournament registrations."""
    return await TournamentService(db).list_tournament_registrations(
        club_id=club_id, tournament_id=tournament_id
    )


@club_tournaments_router.patch(
    "/{tournament_id}/registrations/{registration_id}",
    response_model=TournamentRegistrationResponse,
    summary="Manage participant registration",
    description="Update registration status (confirm, waitlist, cancel), seed, or notes. Requires MANAGE_TOURNAMENTS permission.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Tournament or registration not found in this club"},
    },
)
async def update_registration(
    club_id: UUID,
    tournament_id: UUID,
    registration_id: UUID,
    payload: UpdateRegistrationRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentRegistrationResponse:
    """Update participant registration status or seed."""
    return await TournamentService(db).update_tournament_registration(
        club_id=club_id,
        tournament_id=tournament_id,
        registration_id=registration_id,
        payload=payload,
    )


# ─── Player Self-Registration & Tournament View ────────────────────────────────


@tournaments_router.get(
    "/{tournament_id}",
    response_model=TournamentResponse,
    summary="Get tournament by ID",
    description="Returns public tournament details or club tournament details.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Tournament not found"},
    },
)
async def get_tournament_public(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Retrieve tournament by ID."""
    return await TournamentService(db).get_tournament_by_id(
        tournament_id=tournament_id, current_user_id=current_user.id
    )


@tournaments_router.post(
    "/{tournament_id}/close-registration",
    response_model=TournamentResponse,
    summary="Close tournament registration (direct endpoint)",
    description="Transitions status from registration_open to registration_closed. Requires MANAGE_TOURNAMENTS permission in the hosting club.",
    responses={
        400: {"description": "Tournament not in registration_open status"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Tournament not found"},
    },
)
async def close_registration_direct(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Close tournament registration directly via tournament ID."""
    service = TournamentService(db)
    tournament = await service.tournament_repo.get_by_id(tournament_id)
    if not tournament:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tournament {tournament_id} not found",
        )
    membership = await service.club_membership_repo.get_by_user_and_club(
        user_id=current_user.id, club_id=tournament.club_id
    )
    if not membership or not has_permission(membership.role, Permission.MANAGE_TOURNAMENTS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage tournaments in this club",
        )
    return await service.close_registration(
        club_id=tournament.club_id, tournament_id=tournament_id
    )


@tournaments_router.get(
    "/{tournament_id}/eligible-partners",
    response_model=list[EligiblePartnerResponse],
    summary="List eligible partners for tournament registration",
    description="Returns active club members eligible to be chosen as a partner in doubles registration.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "User has no active player membership in this club"},
        404: {"description": "Tournament not found"},
    },
)
async def get_eligible_partners(
    tournament_id: UUID,
    query: str | None = Query(default=None, description="Search term by name, email, or member number"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EligiblePartnerResponse]:
    """Retrieve eligible partner candidates for doubles registration."""
    return await TournamentService(db).get_eligible_partners(
        tournament_id=tournament_id,
        user_id=current_user.id,
        search_query=query,
    )


@tournaments_router.get(
    "/{tournament_id}/registrations",
    response_model=list[TournamentRegistrationResponse],
    summary="List confirmed registrations for tournament (player)",
    description="Returns all confirmed participant registrations for a public tournament.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Tournament not found"},
    },
)
async def list_registrations_public(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TournamentRegistrationResponse]:
    """Retrieve confirmed participant registrations for a public tournament."""
    return await TournamentService(db).list_tournament_registrations_public(tournament_id)


@tournaments_router.get(
    "/{tournament_id}/my-registration",
    response_model=PlayerTournamentRegistrationStatusResponse,
    summary="Get current player's registration status and details",
    description="Returns registration record, status, team/partner, and payment details for the authenticated user.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Tournament not found"},
    },
)
async def get_my_tournament_registration(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerTournamentRegistrationStatusResponse:
    """Retrieve caller's registration status and saved registration details for tournament."""
    return await TournamentService(db).get_player_registration_status(
        tournament_id=tournament_id, user_id=current_user.id
    )


@tournaments_router.post(
    "/{tournament_id}/register",
    response_model=PlayerSelfRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register player for tournament",
    description="Registers the authenticated user for the tournament. Requires active player membership in the tournament's club.",
    responses={
        400: {"description": "Registration closed, duplicate, or validation error"},
        401: {"description": "Not authenticated"},
        403: {"description": "User has no active player membership in this club"},
        404: {"description": "Tournament not found"},
    },
)
async def player_register(
    tournament_id: UUID,
    payload: PlayerSelfRegistrationRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerSelfRegistrationResponse:
    """Register caller for tournament."""
    return await TournamentService(db).register_player(
        tournament_id=tournament_id,
        user_id=current_user.id,
        payload=payload,
    )


@tournaments_router.delete(
    "/{tournament_id}/register",
    response_model=PlayerSelfRegistrationResponse,
    summary="Cancel own tournament registration",
    description="Cancels authenticated user's registration in tournament.",
    responses={
        400: {"description": "Cannot cancel registration for tournament in progress/completed"},
        401: {"description": "Not authenticated"},
        404: {"description": "Registration not found"},
    },
)
async def player_cancel_registration(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerSelfRegistrationResponse:
    """Cancel caller's registration in tournament."""
    return await TournamentService(db).cancel_player_registration(
        tournament_id=tournament_id, user_id=current_user.id
    )
