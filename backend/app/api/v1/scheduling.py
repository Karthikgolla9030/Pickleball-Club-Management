"""
Aught2 Pickleball — Competition Scheduling API Endpoints (Phase 17)

Endpoints for:
  - Tournament match scheduling, rescheduling, unscheduling
  - League match scheduling, rescheduling, unscheduling
  - Club-wide daily competition schedule and court availability (staff-facing)
  - Player personal competition match schedule (player-facing)
"""
from __future__ import annotations

from datetime import date, time
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.user import User
from app.permissions import Permission
from app.schemas.scheduling import (
    CourtAvailabilityResponse,
    CourtScheduleResponse,
    PlayerMatchScheduleResponse,
    RescheduleMatchRequest,
    ScheduleMatchRequest,
    ScheduledMatchResponse,
)
from app.services.scheduling_service import SchedulingService

# ─── Routers ──────────────────────────────────────────────────────────────────
club_scheduling_router = APIRouter(prefix="/clubs/{club_id}", tags=["Competition Scheduling"])
player_scheduling_router = APIRouter(prefix="/players/me", tags=["Player Competition Schedule"])


# ─── Tournament Match Scheduling ──────────────────────────────────────────────

@club_scheduling_router.post(
    "/tournaments/{tournament_id}/matches/{match_id}/schedule",
    response_model=ScheduledMatchResponse,
    summary="Schedule a tournament match onto a court and time",
    responses={
        400: {"description": "Validation error or invalid match state"},
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "Tournament, match, or court not found"},
        409: {"description": "Court, team, or player scheduling conflict"},
    },
)
async def schedule_tournament_match(
    club_id: uuid.UUID,
    tournament_id: uuid.UUID,
    match_id: uuid.UUID,
    payload: ScheduleMatchRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> ScheduledMatchResponse:
    return await SchedulingService(db).schedule_tournament_match(
        club_id=club_id,
        tournament_id=tournament_id,
        match_id=match_id,
        court_id=payload.court_id,
        start_at=payload.start_at,
        duration_minutes=payload.duration_minutes,
    )


@club_scheduling_router.patch(
    "/tournaments/{tournament_id}/matches/{match_id}/schedule",
    response_model=ScheduledMatchResponse,
    summary="Reschedule a tournament match",
    responses={
        400: {"description": "Validation error or match already completed"},
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "Tournament or match not found"},
        409: {"description": "Court, team, or player scheduling conflict"},
    },
)
async def reschedule_tournament_match(
    club_id: uuid.UUID,
    tournament_id: uuid.UUID,
    match_id: uuid.UUID,
    payload: RescheduleMatchRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> ScheduledMatchResponse:
    return await SchedulingService(db).reschedule_tournament_match(
        club_id=club_id,
        tournament_id=tournament_id,
        match_id=match_id,
        court_id=payload.court_id,
        start_at=payload.start_at,
        duration_minutes=payload.duration_minutes,
    )


@club_scheduling_router.delete(
    "/tournaments/{tournament_id}/matches/{match_id}/schedule",
    response_model=ScheduledMatchResponse,
    summary="Remove schedule from a pending tournament match",
    responses={
        400: {"description": "Cannot unschedule completed match"},
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "Tournament or match not found"},
    },
)
async def unschedule_tournament_match(
    club_id: uuid.UUID,
    tournament_id: uuid.UUID,
    match_id: uuid.UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> ScheduledMatchResponse:
    return await SchedulingService(db).unschedule_tournament_match(
        club_id=club_id,
        tournament_id=tournament_id,
        match_id=match_id,
    )


@club_scheduling_router.get(
    "/tournaments/{tournament_id}/schedule",
    response_model=list[ScheduledMatchResponse],
    summary="Get all scheduled matches for a tournament",
    responses={
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "Tournament not found"},
    },
)
async def get_tournament_schedule(
    club_id: uuid.UUID,
    tournament_id: uuid.UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> list[ScheduledMatchResponse]:
    return await SchedulingService(db).get_tournament_schedule(
        club_id=club_id,
        tournament_id=tournament_id,
    )


@club_scheduling_router.get(
    "/tournaments/{tournament_id}/matches/unscheduled",
    response_model=list[ScheduledMatchResponse],
    summary="Get all unscheduled matches for a tournament",
    responses={
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "Tournament not found"},
    },
)
async def get_tournament_unscheduled_matches(
    club_id: uuid.UUID,
    tournament_id: uuid.UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> list[ScheduledMatchResponse]:
    return await SchedulingService(db).get_tournament_unscheduled(
        club_id=club_id,
        tournament_id=tournament_id,
    )


# ─── League Match Scheduling ──────────────────────────────────────────────────

@club_scheduling_router.post(
    "/leagues/{league_id}/matches/{match_id}/schedule",
    response_model=ScheduledMatchResponse,
    summary="Schedule a league match onto a court and time",
    responses={
        400: {"description": "Validation error or invalid match state"},
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "League, match, or court not found"},
        409: {"description": "Court or team scheduling conflict"},
    },
)
async def schedule_league_match(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    match_id: uuid.UUID,
    payload: ScheduleMatchRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> ScheduledMatchResponse:
    return await SchedulingService(db).schedule_league_match(
        club_id=club_id,
        league_id=league_id,
        match_id=match_id,
        court_id=payload.court_id,
        start_at=payload.start_at,
        duration_minutes=payload.duration_minutes,
    )


@club_scheduling_router.patch(
    "/leagues/{league_id}/matches/{match_id}/schedule",
    response_model=ScheduledMatchResponse,
    summary="Reschedule a league match",
    responses={
        400: {"description": "Validation error or match already completed"},
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "League or match not found"},
        409: {"description": "Court or team scheduling conflict"},
    },
)
async def reschedule_league_match(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    match_id: uuid.UUID,
    payload: RescheduleMatchRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> ScheduledMatchResponse:
    return await SchedulingService(db).reschedule_league_match(
        club_id=club_id,
        league_id=league_id,
        match_id=match_id,
        court_id=payload.court_id,
        start_at=payload.start_at,
        duration_minutes=payload.duration_minutes,
    )


@club_scheduling_router.delete(
    "/leagues/{league_id}/matches/{match_id}/schedule",
    response_model=ScheduledMatchResponse,
    summary="Remove schedule from a pending league match",
    responses={
        400: {"description": "Cannot unschedule completed match"},
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "League or match not found"},
    },
)
async def unschedule_league_match(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    match_id: uuid.UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> ScheduledMatchResponse:
    return await SchedulingService(db).unschedule_league_match(
        club_id=club_id,
        league_id=league_id,
        match_id=match_id,
    )


@club_scheduling_router.get(
    "/leagues/{league_id}/schedule",
    response_model=list[ScheduledMatchResponse],
    summary="Get all scheduled matches for a league",
    responses={
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "League not found"},
    },
)
async def get_league_schedule(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> list[ScheduledMatchResponse]:
    return await SchedulingService(db).get_league_schedule(
        club_id=club_id,
        league_id=league_id,
    )


@club_scheduling_router.get(
    "/leagues/{league_id}/matches/unscheduled",
    response_model=list[ScheduledMatchResponse],
    summary="Get all unscheduled matches for a league",
    responses={
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "League not found"},
    },
)
async def get_league_unscheduled_matches(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> list[ScheduledMatchResponse]:
    return await SchedulingService(db).get_league_unscheduled(
        club_id=club_id,
        league_id=league_id,
    )


# ─── Daily Club Schedule & Availability ───────────────────────────────────────

@club_scheduling_router.get(
    "/competition-schedule",
    response_model=list[CourtScheduleResponse],
    summary="Get club daily competition schedule by court",
    responses={
        403: {"description": "Insufficient permissions (manage_schedules required)"},
    },
)
async def get_club_competition_schedule(
    club_id: uuid.UUID,
    target_date: date = Query(..., alias="date", description="Target date in YYYY-MM-DD format"),
    court_id: Optional[uuid.UUID] = Query(default=None, description="Optional court ID filter"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> list[CourtScheduleResponse]:
    return await SchedulingService(db).get_club_daily_schedule(
        club_id=club_id,
        target_date=target_date,
        court_id=court_id,
    )


@club_scheduling_router.get(
    "/competition-court-availability",
    response_model=list[CourtAvailabilityResponse],
    summary="Get court availability breakdown considering both matches and player bookings",
    responses={
        403: {"description": "Insufficient permissions (manage_schedules required)"},
        404: {"description": "Club not found"},
    },
)
async def get_competition_court_availability(
    club_id: uuid.UUID,
    target_date: date = Query(..., alias="date", description="Target date in YYYY-MM-DD format"),
    start_time: Optional[time] = Query(default=None, description="Optional opening window time"),
    end_time: Optional[time] = Query(default=None, description="Optional closing window time"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCHEDULES)),
    db: AsyncSession = Depends(get_db),
) -> list[CourtAvailabilityResponse]:
    return await SchedulingService(db).get_club_court_availability(
        club_id=club_id,
        target_date=target_date,
        start_time=start_time,
        end_time=end_time,
    )


# ─── Player Personal Competition Schedule ─────────────────────────────────────

@player_scheduling_router.get(
    "/competition-schedule",
    response_model=list[PlayerMatchScheduleResponse],
    summary="Get personalized competition match schedule for authenticated player",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def get_player_competition_schedule(
    timeframe: Optional[str] = Query(
        default=None,
        description="Filter by timeframe: 'upcoming', 'today', or 'past'",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerMatchScheduleResponse]:
    return await SchedulingService(db).get_player_competition_schedule(
        user_id=current_user.id,
        timeframe=timeframe,
    )
