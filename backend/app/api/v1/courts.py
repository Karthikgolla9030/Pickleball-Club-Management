"""
Aught2 Pickleball — Court Management API Endpoints (Phase 10)

Provides staff court management (CRUD, active/inactive lifecycle, reordering)
and player-facing read-only active court access.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.user import User
from app.permissions import Permission
from app.schemas.court import (
    CourtCreateRequest,
    CourtReorderRequest,
    CourtResponse,
    CourtUpdateRequest,
    PlayerCourtResponse,
)
from app.services.court_service import CourtService


club_courts_router = APIRouter(prefix="/clubs/{club_id}/courts", tags=["club-courts"])
player_courts_router = APIRouter(prefix="/clubs/{club_id}/courts", tags=["player-courts"])


# ─── Player Active Courts Endpoint ───────────────────────────────────────────

@player_courts_router.get(
    "/active",
    response_model=list[PlayerCourtResponse],
    summary="List active courts in club (Player-facing)",
    description="Returns active courts with informational metadata. Inactive courts are never returned.",
)
async def list_player_active_courts(
    club_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerCourtResponse]:
    return await CourtService(db).list_active_courts(club_id)


# ─── Club Staff Court Management ─────────────────────────────────────────────

@club_courts_router.post(
    "",
    response_model=CourtResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new court",
    description="Creates a new court in the club. Requires MANAGE_COURTS permission.",
)
async def create_court(
    club_id: UUID,
    payload: CourtCreateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> CourtResponse:
    return await CourtService(db).create_court(club_id=club_id, payload=payload)


@club_courts_router.get(
    "",
    response_model=list[CourtResponse],
    summary="List all club courts (Staff)",
    description="Returns club courts. Supports filtering by status ('all', 'active', 'inactive'). Requires MANAGE_COURTS permission.",
)
async def list_courts(
    club_id: UUID,
    status_filter: str = Query("all", alias="status", pattern="^(all|active|inactive)$"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> list[CourtResponse]:
    return await CourtService(db).list_courts(club_id=club_id, status_filter=status_filter)


@club_courts_router.patch(
    "/reorder",
    response_model=list[CourtResponse],
    summary="Reorder club courts",
    description="Persists deterministic display_order for all courts in the club. Requires MANAGE_COURTS permission.",
)
async def reorder_courts(
    club_id: UUID,
    payload: CourtReorderRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> list[CourtResponse]:
    return await CourtService(db).reorder_courts(club_id=club_id, payload=payload)


@club_courts_router.get(
    "/{court_id}",
    response_model=CourtResponse,
    summary="Get court details",
    description="Returns full court details. Requires MANAGE_COURTS permission.",
)
async def get_court(
    club_id: UUID,
    court_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> CourtResponse:
    return await CourtService(db).get_court(club_id=club_id, court_id=court_id)


@club_courts_router.patch(
    "/{court_id}",
    response_model=CourtResponse,
    summary="Update court information",
    description="Updates court details. club_id cannot be changed. Requires MANAGE_COURTS permission.",
)
async def update_court(
    club_id: UUID,
    court_id: UUID,
    payload: CourtUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> CourtResponse:
    return await CourtService(db).update_court(club_id=club_id, court_id=court_id, payload=payload)


@club_courts_router.post(
    "/{court_id}/deactivate",
    response_model=CourtResponse,
    summary="Deactivate court",
    description="Deactivates court so it is excluded from player lists and future booking. Requires MANAGE_COURTS permission.",
)
@club_courts_router.patch(
    "/{court_id}/deactivate",
    response_model=CourtResponse,
    include_in_schema=False,
)
async def deactivate_court(
    club_id: UUID,
    court_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> CourtResponse:
    return await CourtService(db).deactivate_court(club_id=club_id, court_id=court_id)


@club_courts_router.post(
    "/{court_id}/reactivate",
    response_model=CourtResponse,
    summary="Reactivate court",
    description="Restores an inactive court to active status. Requires MANAGE_COURTS permission.",
)
@club_courts_router.patch(
    "/{court_id}/reactivate",
    response_model=CourtResponse,
    include_in_schema=False,
)
async def reactivate_court(
    club_id: UUID,
    court_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> CourtResponse:
    return await CourtService(db).reactivate_court(club_id=club_id, court_id=court_id)


@club_courts_router.delete(
    "/{court_id}",
    response_model=CourtResponse,
    summary="Deactivate court (Soft delete)",
    description="Standard soft-delete endpoint that deactivates the court. Requires MANAGE_COURTS permission.",
)
async def delete_court(
    club_id: UUID,
    court_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> CourtResponse:
    return await CourtService(db).deactivate_court(club_id=club_id, court_id=court_id)
