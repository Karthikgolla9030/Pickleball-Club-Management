"""
Aught2 Pickleball — League API Endpoints (Phase 9)

Club-scoped staff routes:
  POST   /api/v1/clubs/{club_id}/leagues
  GET    /api/v1/clubs/{club_id}/leagues
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}
  PATCH  /api/v1/clubs/{club_id}/leagues/{league_id}
  POST   /api/v1/clubs/{club_id}/leagues/{league_id}/open-registration
  POST   /api/v1/clubs/{club_id}/leagues/{league_id}/close-registration
  POST   /api/v1/clubs/{club_id}/leagues/{league_id}/cancel
  POST   /api/v1/clubs/{club_id}/leagues/{league_id}/teams
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/teams
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/teams/{team_id}
  PATCH  /api/v1/clubs/{club_id}/leagues/{league_id}/teams/{team_id}
  DELETE /api/v1/clubs/{club_id}/leagues/{league_id}/teams/{team_id}
  POST   /api/v1/clubs/{club_id}/leagues/{league_id}/generate-schedule
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/weeks
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/weeks/{week_number}
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/matches
  POST   /api/v1/clubs/{club_id}/leagues/{league_id}/matches/{match_id}/score
  PATCH  /api/v1/clubs/{club_id}/leagues/{league_id}/matches/{match_id}/score
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/standings
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/snapshots
  POST   /api/v1/clubs/{club_id}/leagues/{league_id}/generate-playoffs
  GET    /api/v1/clubs/{club_id}/leagues/{league_id}/playoffs

Player public & read-only routes:
  GET    /api/v1/leagues
  GET    /api/v1/leagues/{league_id}
  GET    /api/v1/leagues/{league_id}/teams
  GET    /api/v1/leagues/{league_id}/my-team
  GET    /api/v1/leagues/{league_id}/weeks
  GET    /api/v1/leagues/{league_id}/weeks/{week_number}
  GET    /api/v1/leagues/{league_id}/matches
  GET    /api/v1/leagues/{league_id}/standings
  GET    /api/v1/leagues/{league_id}/snapshots
  GET    /api/v1/leagues/{league_id}/playoffs
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.competition import MatchStage
from app.models.user import User
from app.permissions import Permission
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.schemas.league import (
    LeagueCreateRequest,
    LeagueMatchResponse,
    LeagueResponse,
    LeagueSnapshotResponse,
    LeagueStandingsResponse,
    LeagueTeamCreateRequest,
    LeagueTeamResponse,
    LeagueTeamUpdateRequest,
    LeagueUpdateRequest,
    LeagueWeekResponse,
    PlayoffSummaryResponse,
)
from app.services.league_service import LeagueService


class ScorePayload(BaseModel):
    score_a: int = Field(..., ge=0)
    score_b: int = Field(..., ge=0)


club_league_router = APIRouter(prefix="/clubs/{club_id}/leagues", tags=["club-leagues"])
player_league_router = APIRouter(prefix="/leagues", tags=["player-leagues"])


# ─── Club Staff League Operations ─────────────────────────────────────────────

@club_league_router.post(
    "",
    response_model=LeagueResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new league (draft)",
)
async def create_league(
    club_id: uuid.UUID,
    payload: LeagueCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
) -> LeagueResponse:
    return await LeagueService(db).create_league(club_id, payload)


@club_league_router.get(
    "",
    response_model=list[LeagueResponse],
    summary="List club leagues",
)
async def list_club_leagues(
    club_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
) -> list[LeagueResponse]:
    return await LeagueService(db).list_club_leagues(club_id)


@club_league_router.get(
    "/{league_id}",
    response_model=LeagueResponse,
    summary="Get league details",
)
async def get_league(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
) -> LeagueResponse:
    return await LeagueService(db).get_league(club_id, league_id)


@club_league_router.patch(
    "/{league_id}",
    response_model=LeagueResponse,
    summary="Update league settings",
)
async def update_league(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    payload: LeagueUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
) -> LeagueResponse:
    return await LeagueService(db).update_league(club_id, league_id, payload)


@club_league_router.post(
    "/{league_id}/open-registration",
    response_model=LeagueResponse,
    summary="Open registration",
)
async def open_registration(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
) -> LeagueResponse:
    return await LeagueService(db).open_registration(club_id, league_id)


@club_league_router.post(
    "/{league_id}/close-registration",
    response_model=LeagueResponse,
    summary="Close registration",
)
async def close_registration(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
) -> LeagueResponse:
    return await LeagueService(db).close_registration(club_id, league_id)


@club_league_router.post(
    "/{league_id}/cancel",
    response_model=LeagueResponse,
    summary="Cancel league",
)
async def cancel_league(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
) -> LeagueResponse:
    return await LeagueService(db).cancel_league(club_id, league_id)


# ─── Club Staff Team Operations ───────────────────────────────────────────────

@club_league_router.post(
    "/{league_id}/teams",
    response_model=LeagueTeamResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a league team",
)
async def create_league_team(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    payload: LeagueTeamCreateRequest,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
) -> LeagueTeamResponse:
    return await LeagueService(db).create_team(club_id, league_id, payload)


@club_league_router.get(
    "/{league_id}/teams",
    response_model=list[LeagueTeamResponse],
    summary="List league teams",
)
async def list_league_teams(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
) -> list[LeagueTeamResponse]:
    return await LeagueService(db).list_teams(club_id, league_id)


@club_league_router.get(
    "/{league_id}/teams/{team_id}",
    response_model=LeagueTeamResponse,
    summary="Get league team",
)
async def get_league_team(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    team_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
) -> LeagueTeamResponse:
    return await LeagueService(db).get_team(club_id, league_id, team_id)


@club_league_router.patch(
    "/{league_id}/teams/{team_id}",
    response_model=LeagueTeamResponse,
    summary="Update league team",
)
async def update_league_team(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    team_id: uuid.UUID,
    payload: LeagueTeamUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
) -> LeagueTeamResponse:
    return await LeagueService(db).update_team(club_id, league_id, team_id, payload)


@club_league_router.delete(
    "/{league_id}/teams/{team_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete league team",
)
async def delete_league_team(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    team_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
) -> None:
    await LeagueService(db).delete_team(club_id, league_id, team_id)


# ─── Club Staff Schedule & Matches ────────────────────────────────────────────

@club_league_router.post(
    "/{league_id}/generate-schedule",
    response_model=list[LeagueWeekResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Generate regular season schedule",
)
async def generate_schedule(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
) -> list[LeagueWeekResponse]:
    return await LeagueService(db).generate_schedule(club_id, league_id)


@club_league_router.get(
    "/{league_id}/weeks",
    response_model=list[LeagueWeekResponse],
    summary="List league weeks",
)
async def list_weeks(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
) -> list[LeagueWeekResponse]:
    return await LeagueService(db).list_weeks(club_id, league_id)


@club_league_router.get(
    "/{league_id}/weeks/{week_number}",
    response_model=LeagueWeekResponse,
    summary="Get league week matches",
)
async def get_week(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    week_number: int,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
) -> LeagueWeekResponse:
    return await LeagueService(db).get_week(club_id, league_id, week_number)


@club_league_router.get(
    "/{league_id}/matches",
    response_model=list[LeagueMatchResponse],
    summary="List league matches",
)
async def list_matches(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    week: int | None = Query(None, alias="week_number"),
    stage: MatchStage | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
) -> list[LeagueMatchResponse]:
    return await LeagueService(db).list_matches(club_id, league_id, week_number=week, stage=stage)


@club_league_router.post(
    "/{league_id}/matches/{match_id}/score",
    response_model=LeagueMatchResponse,
    summary="Record match score",
)
async def record_score(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    match_id: uuid.UUID,
    payload: ScorePayload,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCORES)),
) -> LeagueMatchResponse:
    return await LeagueService(db).record_match_result(
        club_id, league_id, match_id, payload.score_a, payload.score_b
    )


@club_league_router.patch(
    "/{league_id}/matches/{match_id}/score",
    response_model=LeagueMatchResponse,
    summary="Correct match score",
)
async def correct_score(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    match_id: uuid.UUID,
    payload: ScorePayload,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_SCORES)),
) -> LeagueMatchResponse:
    return await LeagueService(db).correct_match_result(
        club_id, league_id, match_id, payload.score_a, payload.score_b
    )


# ─── Club Staff Standings & Snapshots ─────────────────────────────────────────

@club_league_router.get(
    "/{league_id}/standings",
    response_model=LeagueStandingsResponse,
    summary="Get regular season standings",
)
async def get_standings(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    week: int | None = Query(None, alias="week_number"),
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_STANDINGS)),
) -> LeagueStandingsResponse:
    return await LeagueService(db).get_standings(club_id, league_id, week_number=week)


@club_league_router.get(
    "/{league_id}/snapshots",
    response_model=list[LeagueSnapshotResponse],
    summary="List all weekly snapshots",
)
async def list_snapshots(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_STANDINGS)),
) -> list[LeagueSnapshotResponse]:
    return await LeagueService(db).list_snapshots(club_id, league_id)


# ─── Club Staff Playoffs ──────────────────────────────────────────────────────

@club_league_router.post(
    "/{league_id}/generate-playoffs",
    response_model=PlayoffSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate playoff bracket",
)
async def generate_playoffs(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
) -> PlayoffSummaryResponse:
    return await LeagueService(db).generate_playoffs(club_id, league_id)


@club_league_router.get(
    "/{league_id}/playoffs",
    response_model=PlayoffSummaryResponse,
    summary="Get playoff bracket and summary",
)
async def get_playoffs(
    club_id: uuid.UUID,
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
) -> PlayoffSummaryResponse:
    return await LeagueService(db).get_playoffs(club_id, league_id)


# ─── Player Read-Only Endpoints ───────────────────────────────────────────────

@player_league_router.get(
    "",
    response_model=list[LeagueResponse],
    summary="List active leagues (player view)",
)
async def player_list_leagues(
    db: AsyncSession = Depends(get_db),
) -> list[LeagueResponse]:
    return await LeagueService(db).list_public_leagues()


@player_league_router.get(
    "/{league_id}",
    response_model=LeagueResponse,
    summary="Get league overview (player view)",
)
async def player_get_league(
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> LeagueResponse:
    return await LeagueService(db).get_league(None, league_id)


@player_league_router.get(
    "/{league_id}/teams",
    response_model=list[LeagueTeamResponse],
    summary="List league teams (player view)",
)
async def player_list_teams(
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[LeagueTeamResponse]:
    return await LeagueService(db).list_teams(None, league_id)


@player_league_router.get(
    "/{league_id}/my-team",
    response_model=LeagueTeamResponse | None,
    summary="Get authenticated player's team in this league",
)
async def player_get_my_team(
    league_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LeagueTeamResponse | None:
    league = await LeagueService(db)._get_league_or_404(league_id)
    # Find player's membership in league's club
    pm = await ClubPlayerMembershipRepository(db).get_by_user_and_club(
        user_id=current_user.id,
        club_id=league.club_id,
    )
    if not pm:
        return None
    return await LeagueService(db).get_player_team(league_id, pm.id)


@player_league_router.get(
    "/{league_id}/weeks",
    response_model=list[LeagueWeekResponse],
    summary="List league weeks (player view)",
)
async def player_list_weeks(
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[LeagueWeekResponse]:
    return await LeagueService(db).list_weeks(None, league_id)


@player_league_router.get(
    "/{league_id}/weeks/{week_number}",
    response_model=LeagueWeekResponse,
    summary="Get week matches (player view)",
)
async def player_get_week(
    league_id: uuid.UUID,
    week_number: int,
    db: AsyncSession = Depends(get_db),
) -> LeagueWeekResponse:
    return await LeagueService(db).get_week(None, league_id, week_number)


@player_league_router.get(
    "/{league_id}/matches",
    response_model=list[LeagueMatchResponse],
    summary="List league matches (player view)",
)
async def player_list_matches(
    league_id: uuid.UUID,
    week: int | None = Query(None, alias="week_number"),
    stage: MatchStage | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[LeagueMatchResponse]:
    return await LeagueService(db).list_matches(None, league_id, week_number=week, stage=stage)


@player_league_router.get(
    "/{league_id}/standings",
    response_model=LeagueStandingsResponse,
    summary="Get regular season standings (player view)",
)
async def player_get_standings(
    league_id: uuid.UUID,
    week: int | None = Query(None, alias="week_number"),
    db: AsyncSession = Depends(get_db),
) -> LeagueStandingsResponse:
    return await LeagueService(db).get_standings(None, league_id, week_number=week)


@player_league_router.get(
    "/{league_id}/snapshots",
    response_model=list[LeagueSnapshotResponse],
    summary="List weekly snapshots (player view)",
)
async def player_list_snapshots(
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[LeagueSnapshotResponse]:
    return await LeagueService(db).list_snapshots(None, league_id)


@player_league_router.get(
    "/{league_id}/playoffs",
    response_model=PlayoffSummaryResponse,
    summary="Get playoff bracket and champion (player view)",
)
async def player_get_playoffs(
    league_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> PlayoffSummaryResponse:
    return await LeagueService(db).get_playoffs(None, league_id)
