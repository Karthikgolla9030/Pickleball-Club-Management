"""
Aught2 Pickleball — Competition API (Phase 5, 6, 7 & 8)

Round Robin, Pool Play, Scramble, and Standalone Bracket team management,
match generation, score recording, standings, and bracket tournament view.

Club-scoped endpoints require staff authorization (manage_teams / manage_matches / manage_results).
Player endpoints are read-only and require authentication only.

Routes:
  # Club-scoped (Staff)
  POST   /clubs/{club_id}/tournaments/{tournament_id}/teams
  GET    /clubs/{club_id}/tournaments/{tournament_id}/teams
  PATCH  /clubs/{club_id}/tournaments/{tournament_id}/teams/{team_id}
  DELETE /clubs/{club_id}/tournaments/{tournament_id}/teams/{team_id}

  # Round Robin Generation (Staff)
  POST   /clubs/{club_id}/tournaments/{tournament_id}/generate-round-robin
  POST   /clubs/{club_id}/tournaments/{tournament_id}/regenerate-round-robin

  # Pool Play Management & Generation (Staff - Phase 6)
  POST   /clubs/{club_id}/tournaments/{tournament_id}/pools/configure
  GET    /clubs/{club_id}/tournaments/{tournament_id}/pools
  POST   /clubs/{club_id}/tournaments/{tournament_id}/pools/assign-serpentine
  POST   /clubs/{club_id}/tournaments/{tournament_id}/pools/assign-manual
  POST   /clubs/{club_id}/tournaments/{tournament_id}/generate-pool-play
  POST   /clubs/{club_id}/tournaments/{tournament_id}/regenerate-pool-play
  GET    /clubs/{club_id}/tournaments/{tournament_id}/pools/standings
  GET    /clubs/{club_id}/tournaments/{tournament_id}/pools/matches

  # Championship Knockout Bracket (Staff - Phase 6)
  POST   /clubs/{club_id}/tournaments/{tournament_id}/generate-championship
  GET    /clubs/{club_id}/tournaments/{tournament_id}/championship/matches

  # Standalone Bracket (Staff - Phase 8)
  POST   /clubs/{club_id}/tournaments/{tournament_id}/generate-bracket
  POST   /clubs/{club_id}/tournaments/{tournament_id}/regenerate-bracket
  GET    /clubs/{club_id}/tournaments/{tournament_id}/bracket
  GET    /clubs/{club_id}/tournaments/{tournament_id}/bracket/matches

  # Match Management (Staff)
  GET    /clubs/{club_id}/tournaments/{tournament_id}/matches
  GET    /clubs/{club_id}/tournaments/{tournament_id}/matches/{match_id}
  POST   /clubs/{club_id}/tournaments/{tournament_id}/matches/{match_id}/result
  PATCH  /clubs/{club_id}/tournaments/{tournament_id}/matches/{match_id}/result

  # Standings (Staff)
  GET    /clubs/{club_id}/tournaments/{tournament_id}/standings

  # Player Read-Only
  GET    /tournaments/{tournament_id}/teams
  GET    /tournaments/{tournament_id}/matches
  GET    /tournaments/{tournament_id}/standings
  GET    /tournaments/{tournament_id}/pools
  GET    /tournaments/{tournament_id}/pools/standings
  GET    /tournaments/{tournament_id}/pools/matches
  GET    /tournaments/{tournament_id}/championship/matches
  GET    /tournaments/{tournament_id}/bracket
  GET    /tournaments/{tournament_id}/bracket/matches
"""
from __future__ import annotations

from typing import Union
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.user import User
from app.permissions import Permission
from app.schemas.competition import (
    AllPoolsStandingsResponse,
    BracketGenerationResponse,
    BracketSummaryResponse,
    ChampionshipGenerationResponse,
    GenerationResponse,
    MatchResponse,
    MatchResultRequest,
    PoolConfigureRequest,
    PoolManualAssignRequest,
    PoolPlayGenerationResponse,
    PoolResponse,
    PoolStandingsResponse,
    ScrambleAvailabilityRequest,
    ScrambleConfigureRequest,
    ScrambleConfigureRoundsRequest,
    ScrambleGenerationResponse,
    ScrambleMatchupGenerateRequest,
    ScrambleStandingsResponse,
    ScrambleStateResponse,
    StandingsResponse,
    TeamCreate,
    TeamResponse,
    TeamUpdate,
    CustomizeTeamsRequest,
    CustomizePoolsRequest,
    CustomizeMatchupsRequest,
    CustomizeSeedingRequest,
)

from app.services.competition_service import CompetitionService

# Club-scoped competition router
club_competition_router = APIRouter(
    prefix="/clubs/{club_id}/tournaments/{tournament_id}",
    tags=["Club Competition"],
)

# Player read-only competition router
player_competition_router = APIRouter(
    prefix="/tournaments/{tournament_id}",
    tags=["Competition (Player View)"],
)


# ─── Team Management (Staff) ──────────────────────────────────────────────────


@club_competition_router.get(
    "/teams",
    response_model=list[TeamResponse],
    summary="List teams in tournament",
)
async def list_teams(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
    db: AsyncSession = Depends(get_db),
) -> list[TeamResponse]:
    return await CompetitionService(db).list_teams(club_id, tournament_id)


@club_competition_router.post(
    "/teams",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a fixed partner team",
    description=(
        "Creates a team with exactly 2 confirmed registered players. "
        "Only allowed before match generation."
    ),
)
async def create_team(
    club_id: UUID,
    tournament_id: UUID,
    payload: TeamCreate,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
    db: AsyncSession = Depends(get_db),
) -> TeamResponse:
    return await CompetitionService(db).create_team(club_id, tournament_id, payload)


@club_competition_router.patch(
    "/teams/{team_id}",
    response_model=TeamResponse,
    summary="Update team name, seed, or members",
    description="Only allowed before match generation.",
)
async def update_team(
    club_id: UUID,
    tournament_id: UUID,
    team_id: UUID,
    payload: TeamUpdate,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
    db: AsyncSession = Depends(get_db),
) -> TeamResponse:
    return await CompetitionService(db).update_team(
        club_id, tournament_id, team_id, payload
    )


@club_competition_router.delete(
    "/teams/{team_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a team",
    description="Only allowed before match generation.",
)
async def delete_team(
    club_id: UUID,
    tournament_id: UUID,
    team_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await CompetitionService(db).delete_team(club_id, tournament_id, team_id)


# ─── Round Robin Generation ───────────────────────────────────────────────────


@club_competition_router.post(
    "/generate-round-robin",
    response_model=GenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate Round Robin matchups",
    description=(
        "Generates all N*(N-1)/2 matchups deterministically. "
        "Requires registration_closed status and valid teams. "
        "Transitions tournament to in_progress."
    ),
)
async def generate_round_robin(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> GenerationResponse:
    return await CompetitionService(db).generate_round_robin(club_id, tournament_id)


@club_competition_router.post(
    "/regenerate-round-robin",
    response_model=GenerationResponse,
    summary="Regenerate Round Robin matchups",
    description=(
        "Deletes all pending matches and regenerates deterministically. "
        "Blocked if any completed match results exist."
    ),
)
async def regenerate_round_robin(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> GenerationResponse:
    return await CompetitionService(db).regenerate_round_robin(club_id, tournament_id)


# ─── Pool Play Management (Staff - Phase 6) ───────────────────────────────────


@club_competition_router.post(
    "/pools/configure",
    response_model=list[PoolResponse],
    status_code=status.HTTP_200_OK,
    summary="Configure pools and qualifier settings",
    description=(
        "Configures pool count and qualifiers per pool. "
        "Validates pool balance against team count and creates pools."
    ),
)
async def configure_pools(
    club_id: UUID,
    tournament_id: UUID,
    payload: PoolConfigureRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> list[PoolResponse]:
    return await CompetitionService(db).configure_pools(
        club_id, tournament_id, payload
    )


@club_competition_router.get(
    "/pools",
    response_model=list[PoolResponse],
    summary="List pools and assigned teams",
)
async def list_pools(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> list[PoolResponse]:
    return await CompetitionService(db).list_pools(club_id, tournament_id)


@club_competition_router.post(
    "/pools/assign-serpentine",
    response_model=list[PoolResponse],
    summary="Auto-distribute teams across pools (serpentine / snake)",
    description="Seeds teams across configured pools using standard serpentine distribution.",
)
async def assign_teams_serpentine(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
    db: AsyncSession = Depends(get_db),
) -> list[PoolResponse]:
    return await CompetitionService(db).assign_teams_serpentine(club_id, tournament_id)


@club_competition_router.post(
    "/pools/assign-manual",
    response_model=list[PoolResponse],
    summary="Manually assign teams to pools",
    description="Validates pool balance (difference between max and min pool <= 1) and assigns teams.",
)
async def assign_teams_manual(
    club_id: UUID,
    tournament_id: UUID,
    payload: PoolManualAssignRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TEAMS)),
    db: AsyncSession = Depends(get_db),
) -> list[PoolResponse]:
    return await CompetitionService(db).assign_teams_manual(
        club_id, tournament_id, payload
    )


@club_competition_router.post(
    "/generate-pool-play",
    response_model=PoolPlayGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate pool stage Round Robin matches",
    description="Generates isolated Round Robin matches for every pool and transitions tournament to in_progress.",
)
async def generate_pool_play(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> PoolPlayGenerationResponse:
    return await CompetitionService(db).generate_pool_play(club_id, tournament_id)


@club_competition_router.post(
    "/regenerate-pool-play",
    response_model=PoolPlayGenerationResponse,
    summary="Regenerate pool stage matches",
    description="Regenerates pool matches if no pool results have been entered yet.",
)
async def regenerate_pool_play(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> PoolPlayGenerationResponse:
    return await CompetitionService(db).regenerate_pool_play(club_id, tournament_id)


@club_competition_router.get(
    "/pools/standings",
    response_model=Union[AllPoolsStandingsResponse, PoolStandingsResponse],
    summary="Get pool standings",
    description="Derives pool standings per pool using Phase 5 tiebreakers.",
)
async def get_pool_standings(
    club_id: UUID,
    tournament_id: UUID,
    pool_id: UUID | None = Query(default=None, description="Optional pool ID filter"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_STANDINGS)),
    db: AsyncSession = Depends(get_db),
) -> Union[AllPoolsStandingsResponse, PoolStandingsResponse]:
    return await CompetitionService(db).get_pool_standings(club_id, tournament_id, pool_id)


@club_competition_router.get(
    "/pools/matches",
    response_model=list[MatchResponse],
    summary="List pool stage matches",
)
async def list_pool_matches(
    club_id: UUID,
    tournament_id: UUID,
    pool_id: UUID | None = Query(default=None, description="Optional pool ID filter"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_pool_matches(
        club_id, tournament_id, pool_id
    )


# ─── Championship Bracket (Staff - Phase 6) ───────────────────────────────────


@club_competition_router.post(
    "/generate-championship",
    response_model=ChampionshipGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate championship knockout bracket",
    description=(
        "Qualifies top teams from each pool, seeds them deterministically into a single-elimination bracket "
        "tree, and creates placeholder matches with auto-advance links."
    ),
)
async def generate_championship(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ChampionshipGenerationResponse:
    return await CompetitionService(db).generate_championship(club_id, tournament_id)


@club_competition_router.get(
    "/championship/matches",
    response_model=list[MatchResponse],
    summary="List championship bracket matches",
)
async def list_championship_matches(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_championship_matches(
        club_id, tournament_id
    )


# ─── Match Operations (Staff) ─────────────────────────────────────────────────


@club_competition_router.get(
    "/matches",
    response_model=list[MatchResponse],
    summary="List all matches in tournament",
)
async def list_matches(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_matches(club_id, tournament_id)


@club_competition_router.get(
    "/matches/{match_id}",
    response_model=MatchResponse,
    summary="Get single match details",
)
async def get_match(
    club_id: UUID,
    tournament_id: UUID,
    match_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    return await CompetitionService(db).get_match(club_id, tournament_id, match_id)


@club_competition_router.post(
    "/matches/{match_id}/start",
    response_model=MatchResponse,
    status_code=status.HTTP_200_OK,
    summary="Start a scheduled match",
    description="Transitions match status from pending (Scheduled) to in_progress.",
)
async def start_match(
    club_id: UUID,
    tournament_id: UUID,
    match_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    return await CompetitionService(db).start_match(club_id, tournament_id, match_id)


@club_competition_router.post(
    "/matches/{match_id}/result",
    response_model=MatchResponse,
    status_code=status.HTTP_200_OK,
    summary="Record match result",
    description=(
        "Records score for a pending match. Winner is derived from scores. "
        "In championship stage, advances winner to next match or completes tournament."
    ),
)
async def record_match_result(
    club_id: UUID,
    tournament_id: UUID,
    match_id: UUID,
    payload: MatchResultRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_RESULTS)),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    return await CompetitionService(db).record_match_result(
        club_id, tournament_id, match_id, payload.score_a, payload.score_b
    )


@club_competition_router.patch(
    "/matches/{match_id}/result",
    response_model=MatchResponse,
    summary="Correct an existing match result",
    description=(
        "Corrects a completed match result. Recalculates winner and standings. "
        "Requires manage_results permission."
    ),
)
async def correct_match_result(
    club_id: UUID,
    tournament_id: UUID,
    match_id: UUID,
    payload: MatchResultRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_RESULTS)),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    return await CompetitionService(db).correct_match_result(
        club_id, tournament_id, match_id, payload.score_a, payload.score_b
    )


# ─── Standings (Staff) ────────────────────────────────────────────────────────


@club_competition_router.get(
    "/standings",
    response_model=StandingsResponse,
    summary="Get live tournament standings",
    description=(
        "Derives standings from completed match results. "
        "Tiebreakers: 1. Wins, 2. Points Differential, 3. Points Scored, 4. Team Name."
    ),
)
async def get_standings(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_STANDINGS)),
    db: AsyncSession = Depends(get_db),
) -> StandingsResponse:
    return await CompetitionService(db).get_standings(club_id, tournament_id)


# ─── Scramble Management & Matches (Staff - Phase 7) ──────────────────────────


@club_competition_router.post(
    "/generate-scramble",
    response_model=ScrambleGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate Scramble tournament matches",
    description="Generates rotating doubles matches for confirmed players.",
)
async def generate_scramble(
    club_id: UUID,
    tournament_id: UUID,
    payload: ScrambleConfigureRequest = ScrambleConfigureRequest(),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleGenerationResponse:
    return await CompetitionService(db).generate_scramble(
        club_id, tournament_id, payload
    )


@club_competition_router.post(
    "/regenerate-scramble",
    response_model=ScrambleGenerationResponse,
    status_code=status.HTTP_200_OK,
    summary="Regenerate Scramble tournament matches",
    description="Regenerates matches before any scores are entered.",
)
async def regenerate_scramble(
    club_id: UUID,
    tournament_id: UUID,
    payload: ScrambleConfigureRequest = ScrambleConfigureRequest(),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleGenerationResponse:
    return await CompetitionService(db).regenerate_scramble(
        club_id, tournament_id, payload
    )


@club_competition_router.get(
    "/scramble/matches",
    response_model=list[MatchResponse],
    summary="List Scramble matches (Staff)",
)
async def list_scramble_matches(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_scramble_matches(club_id, tournament_id)


@club_competition_router.get(
    "/scramble/matches/{match_id}",
    response_model=MatchResponse,
    summary="Get single Scramble match (Staff)",
)
async def get_scramble_match(
    club_id: UUID,
    tournament_id: UUID,
    match_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> MatchResponse:
    return await CompetitionService(db).get_match(club_id, tournament_id, match_id)


@club_competition_router.get(
    "/scramble/standings",
    response_model=ScrambleStandingsResponse,
    summary="Get Scramble individual standings (Staff)",
)
async def get_scramble_standings(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_STANDINGS)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStandingsResponse:
    return await CompetitionService(db).get_scramble_standings(club_id, tournament_id)


@club_competition_router.get(
    "/scramble/state",
    response_model=ScrambleStateResponse,
    summary="Get Scramble round state and lifecycle actions (Staff)",
)
async def get_scramble_state(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).get_scramble_state(club_id, tournament_id)


@club_competition_router.post(
    "/scramble/availability",
    response_model=ScrambleStateResponse,
    summary="Update player availability for next Scramble round",
)
async def set_scramble_availability(
    club_id: UUID,
    tournament_id: UUID,
    payload: ScrambleAvailabilityRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).set_scramble_player_availability(
        club_id, tournament_id, payload
    )


@club_competition_router.post(
    "/scramble/matchups",
    response_model=ScrambleStateResponse,
    summary="Create matchups for current Scramble round",
)
async def create_scramble_matchups(
    club_id: UUID,
    tournament_id: UUID,
    payload: ScrambleMatchupGenerateRequest = ScrambleMatchupGenerateRequest(),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).create_scramble_round_matchups(
        club_id, tournament_id, payload
    )


@club_competition_router.post(
    "/scramble/start-round",
    response_model=ScrambleStateResponse,
    summary="Start the current Scramble round",
)
async def start_scramble_round(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).start_scramble_round(club_id, tournament_id)


@club_competition_router.post(
    "/scramble/finish-round",
    response_model=ScrambleStateResponse,
    summary="Finish the current Scramble round",
)
async def finish_scramble_round(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).finish_scramble_round(club_id, tournament_id)


@club_competition_router.post(
    "/scramble/next-round",
    response_model=ScrambleStateResponse,
    summary="Start the next Scramble round",
)
async def start_scramble_next_round(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).start_scramble_next_round(club_id, tournament_id)


@club_competition_router.post(
    "/scramble/end-tournament",
    response_model=ScrambleStateResponse,
    summary="End the Scramble tournament and crown champion",
)
async def end_scramble_tournament(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).end_scramble_tournament(club_id, tournament_id)


@club_competition_router.post(
    "/scramble/planned-rounds",
    response_model=ScrambleStateResponse,
    summary="Configure planned rotation rounds for Scramble tournament",
)
async def set_scramble_planned_rounds(
    club_id: UUID,
    tournament_id: UUID,
    payload: ScrambleConfigureRoundsRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).set_scramble_planned_rounds(
        club_id, tournament_id, payload.planned_rounds
    )


# ─── Player Read-Only Endpoints ───────────────────────────────────────────────



@player_competition_router.get(
    "/teams",
    response_model=list[TeamResponse],
    summary="View teams (player)",
)
async def player_list_teams(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TeamResponse]:
    return await CompetitionService(db).list_teams_public(tournament_id)


@player_competition_router.get(
    "/matches",
    response_model=list[MatchResponse],
    summary="View matches (player)",
)
async def player_list_matches(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_matches_public(tournament_id)


@player_competition_router.get(
    "/standings",
    response_model=StandingsResponse,
    summary="View standings (player)",
)
async def player_get_standings(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandingsResponse:
    return await CompetitionService(db).get_standings_public(tournament_id)


@player_competition_router.get(
    "/pools",
    response_model=list[PoolResponse],
    summary="View pools and assigned teams (player)",
)
async def player_list_pools(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PoolResponse]:
    return await CompetitionService(db).list_pools_public(tournament_id)


@player_competition_router.get(
    "/pools/standings",
    response_model=Union[AllPoolsStandingsResponse, PoolStandingsResponse],
    summary="View pool standings (player)",
)
async def player_get_pool_standings(
    tournament_id: UUID,
    pool_id: UUID | None = Query(default=None, description="Optional pool ID filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Union[AllPoolsStandingsResponse, PoolStandingsResponse]:
    return await CompetitionService(db).get_pool_standings_public(tournament_id, pool_id)


@player_competition_router.get(
    "/pools/matches",
    response_model=list[MatchResponse],
    summary="View pool matches (player)",
)
async def player_list_pool_matches(
    tournament_id: UUID,
    pool_id: UUID | None = Query(default=None, description="Optional pool ID filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_pool_matches_public(tournament_id, pool_id)


@player_competition_router.get(
    "/championship/matches",
    response_model=list[MatchResponse],
    summary="View championship bracket matches (player)",
)
async def player_list_championship_matches(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_championship_matches_public(tournament_id)


@player_competition_router.get(
    "/scramble/matches",
    response_model=list[MatchResponse],
    summary="View Scramble matches (player)",
)
async def player_list_scramble_matches(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).list_scramble_matches_public(tournament_id)


@player_competition_router.get(
    "/scramble/standings",
    response_model=ScrambleStandingsResponse,
    summary="View Scramble individual standings (player)",
)
async def player_get_scramble_standings(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStandingsResponse:
    return await CompetitionService(db).get_scramble_standings_public(tournament_id)


@player_competition_router.get(
    "/scramble/state",
    response_model=ScrambleStateResponse,
    summary="View Scramble round state (player)",
)
async def player_get_scramble_state(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScrambleStateResponse:
    return await CompetitionService(db).get_scramble_state(None, tournament_id)


# ─── Standalone Bracket (Staff - Phase 8) ─────────────────────────────────────


@club_competition_router.post(
    "/generate-bracket",
    response_model=BracketGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate standalone bracket",
    description=(
        "Generate a single-elimination bracket for a Bracket-format tournament. "
        "Tournament must be in registration_closed status. "
        "BYE slots are auto-resolved (higher-numbered seeds receive BYEs). "
        "Once generated, use record/correct match results to advance teams."
    ),
)
async def generate_bracket(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> BracketGenerationResponse:
    return await CompetitionService(db).generate_bracket(club_id, tournament_id)


@club_competition_router.post(
    "/regenerate-bracket",
    response_model=BracketGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Regenerate standalone bracket",
    description=(
        "Regenerate the bracket from scratch. Only allowed before any real match "
        "results (with scores) have been entered. BYE-only completions do not block regeneration."
    ),
)
async def regenerate_bracket(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> BracketGenerationResponse:
    return await CompetitionService(db).regenerate_bracket(club_id, tournament_id)


@club_competition_router.get(
    "/bracket",
    response_model=BracketSummaryResponse,
    summary="Get bracket summary (staff)",
    description="Returns the high-level bracket state: teams count, rounds, matches played, champion.",
)
async def get_bracket_summary(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> BracketSummaryResponse:
    return await CompetitionService(db).get_bracket_summary(club_id, tournament_id)


@club_competition_router.get(
    "/bracket/matches",
    response_model=list[MatchResponse],
    summary="List bracket matches (staff)",
    description="Returns all matches in a standalone Bracket tournament ordered by round and position.",
)
async def list_bracket_matches(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MATCHES)),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).get_bracket_matches(club_id, tournament_id)


# ─── Standalone Bracket (Player - Phase 8) ────────────────────────────────────


@player_competition_router.get(
    "/bracket",
    response_model=BracketSummaryResponse,
    summary="View bracket summary (player)",
    description="Returns the high-level bracket state for a Bracket-format tournament.",
)
async def player_get_bracket_summary(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BracketSummaryResponse:
    return await CompetitionService(db).get_bracket_summary(None, tournament_id)


@player_competition_router.get(
    "/bracket/matches",
    response_model=list[MatchResponse],
    summary="View bracket matches (player)",
    description="Returns all matches in a standalone Bracket tournament.",
)
async def player_list_bracket_matches(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MatchResponse]:
    return await CompetitionService(db).get_bracket_matches(None, tournament_id)


# ─── Competition Customization & Lock (Phase 6) ───────────────────────────

@club_competition_router.patch(
    "/competition/teams/customize",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Customize teams",
)
async def customize_teams(
    club_id: UUID,
    tournament_id: UUID,
    payload: CustomizeTeamsRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await CompetitionService(db).customize_teams(club_id, tournament_id, payload)


@club_competition_router.patch(
    "/competition/pools/customize",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Customize pools",
)
async def customize_pools(
    club_id: UUID,
    tournament_id: UUID,
    payload: CustomizePoolsRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await CompetitionService(db).customize_pools(club_id, tournament_id, payload)


@club_competition_router.patch(
    "/competition/matchups/customize",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Customize scramble matchups",
)
async def customize_matchups(
    club_id: UUID,
    tournament_id: UUID,
    payload: CustomizeMatchupsRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await CompetitionService(db).customize_matchups(club_id, tournament_id, payload)


@club_competition_router.patch(
    "/competition/seeding/customize",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Customize bracket seeding",
)
async def customize_seeding(
    club_id: UUID,
    tournament_id: UUID,
    payload: CustomizeSeedingRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await CompetitionService(db).customize_seeding(club_id, tournament_id, payload)


@club_competition_router.post(
    "/competition/lock",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Lock competition",
)
async def lock_competition(
    club_id: UUID,
    tournament_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> None:
    await CompetitionService(db).lock_competition(club_id, tournament_id)
