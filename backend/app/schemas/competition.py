"""
Aught2 Pickleball — Competition Schemas (Phase 5 & 6)

Request/response schemas for teams, matches, standings, pools, and championship brackets.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.competition import MatchStage, MatchStatus


# ─── Team ─────────────────────────────────────────────────────────────────────

class TeamMemberResponse(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID
    player_membership_id: uuid.UUID
    user_id: uuid.UUID | None = None
    user_email: str | None = None
    display_name: str | None = None
    membership_number: str | None = None
    skill_rating: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamResponse(BaseModel):
    id: uuid.UUID
    tournament_id: uuid.UUID
    name: str
    seed: int | None
    members: list[TeamMemberResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TeamCreate(BaseModel):
    """
    Create a team / entry for Round Robin, Pool Play, or Bracket.
    1 player required for Singles, 2 players required for Doubles.
    """
    name: str = Field(..., min_length=1, max_length=255)
    seed: int | None = None
    player_membership_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=2)


class TeamUpdate(BaseModel):
    """
    Update team name or seed before matches are generated.
    Cannot update player_membership_ids after team creation
    without using the dedicated member-replace endpoint.
    """
    name: str | None = Field(default=None, min_length=1, max_length=255)
    seed: int | None = None
    player_membership_ids: list[uuid.UUID] | None = Field(
        default=None, min_length=1, max_length=2
    )


# ─── Match ────────────────────────────────────────────────────────────────────

class MatchTeamSummary(BaseModel):
    id: uuid.UUID
    name: str
    seed: int | None = None

    model_config = {"from_attributes": True}


class MatchParticipantUpdate(BaseModel):
    player_membership_id: uuid.UUID


# ─── Customization Requests (Phase 6) ─────────────────────────────────────────

class TeamCustomization(BaseModel):
    id: uuid.UUID
    name: str | None = None
    player_membership_ids: list[uuid.UUID]

class CustomizeTeamsRequest(BaseModel):
    teams: list[TeamCustomization]

class PoolCustomization(BaseModel):
    id: uuid.UUID
    team_ids: list[uuid.UUID]

class CustomizePoolsRequest(BaseModel):
    pools: list[PoolCustomization]

class MatchupCustomization(BaseModel):
    id: uuid.UUID
    side_a_participant_ids: list[uuid.UUID]
    side_b_participant_ids: list[uuid.UUID]

class CustomizeMatchupsRequest(BaseModel):
    matchups: list[MatchupCustomization]

class SeedingCustomization(BaseModel):
    team_id: uuid.UUID
    seed: int

class CustomizeSeedingRequest(BaseModel):
    seeds: list[SeedingCustomization]


class MatchParticipantResponse(BaseModel):
    id: uuid.UUID
    player_membership_id: uuid.UUID
    side: str
    partner_slot: int
    user_id: uuid.UUID | None = None
    display_name: str | None = None
    membership_number: str | None = None

    model_config = {"from_attributes": True}


class MatchResponse(BaseModel):
    id: uuid.UUID
    tournament_id: uuid.UUID
    round_number: int | None = None
    match_number: int | None = None
    stage: MatchStage | str | None = None
    stage_label: str | None = None
    pool_id: uuid.UUID | None = None
    bracket_round: int | None = None
    bracket_position: int | None = None
    bracket_section: str | None = None
    label: str | None = None
    next_match_id: uuid.UUID | None = None
    next_match_slot: str | None = None
    loser_next_match_id: uuid.UUID | None = None
    loser_next_match_slot: str | None = None
    winner_next_match_number: int | None = None
    loser_next_match_number: int | None = None
    feeder_a_label: str | None = None
    feeder_b_label: str | None = None
    is_conditional: bool | None = False
    team_a_id: uuid.UUID | None = None
    team_b_id: uuid.UUID | None = None
    team_a: MatchTeamSummary | None = None
    team_b: MatchTeamSummary | None = None
    side_a_participants: list[MatchParticipantResponse] | None = None
    side_b_participants: list[MatchParticipantResponse] | None = None
    status: MatchStatus
    status_label: str
    score_a: int | None = None
    score_b: int | None = None
    winner_team_id: uuid.UUID | None = None
    winner_team: MatchTeamSummary | None = None
    winner_side: str | None = None
    sit_out_participant: MatchParticipantResponse | None = None
    completed_at: datetime | None = None
    court_id: uuid.UUID | None = None
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MatchResultRequest(BaseModel):
    """
    Record or correct a match result.

    IMPORTANT: Do NOT accept winner_team_id from client.
    The backend derives the winner from the scores.
    """
    score_a: int = Field(..., ge=0, description="Score for team A (non-negative integer)")
    score_b: int = Field(..., ge=0, description="Score for team B (non-negative integer)")


# ─── Standings ────────────────────────────────────────────────────────────────

class StandingRow(BaseModel):
    """
    One row in the standings table for a team.

    Tiebreaker order (exact, as per tournament tiebreaker_rules):
      1. wins           (descending)
      2. points_differential (descending)
      3. points_scored  (descending)
      4. team_name      (ascending, case-insensitive, deterministic fallback)
    """
    rank: int
    team_id: uuid.UUID
    team_name: str
    team_seed: int | None
    wins: int
    losses: int
    matches_played: int
    points_scored: int
    points_allowed: int
    points_differential: int
    status: str | None = None


class StandingsResponse(BaseModel):
    tournament_id: uuid.UUID
    standings: list[StandingRow]


# ─── Round Robin Generation ───────────────────────────────────────────────────

class GenerationResponse(BaseModel):
    """Response from generate-round-robin or regenerate-round-robin."""
    tournament_id: uuid.UUID
    teams_count: int
    matches_generated: int
    rounds_count: int
    message: str


# ─── Pool Play Schemas (Phase 6) ──────────────────────────────────────────────

class PoolConfigureRequest(BaseModel):
    """
    Configure pools and qualifier rules for a pool_play tournament.
    """
    number_of_pools: int = Field(..., ge=2, le=16, description="Number of pools (2 to 16)")
    qualifiers_per_pool: int = Field(..., ge=1, le=8, description="Number of qualifiers per pool")
    pool_names: list[str] | None = Field(default=None, description="Optional custom names for each pool")


class PoolTeamResponse(BaseModel):
    id: uuid.UUID
    pool_id: uuid.UUID
    team_id: uuid.UUID
    team_name: str | None = None
    seed: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PoolResponse(BaseModel):
    id: uuid.UUID
    tournament_id: uuid.UUID
    name: str
    display_order: int
    teams_count: int = 0
    pool_teams: list[PoolTeamResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PoolTeamAssignment(BaseModel):
    team_id: uuid.UUID
    pool_id: uuid.UUID


class PoolManualAssignRequest(BaseModel):
    assignments: list[PoolTeamAssignment] = Field(
        ..., min_length=1, description="List of team to pool assignments"
    )


class PoolStandingRow(StandingRow):
    pool_id: uuid.UUID
    pool_name: str
    qualified: bool = False


class PoolStandingsResponse(BaseModel):
    tournament_id: uuid.UUID
    pool_id: uuid.UUID
    pool_name: str
    standings: list[PoolStandingRow]


class AllPoolsStandingsResponse(BaseModel):
    tournament_id: uuid.UUID
    pools: list[PoolStandingsResponse]


class PoolPlayGenerationResponse(BaseModel):
    tournament_id: uuid.UUID
    pools_count: int
    teams_count: int
    matches_generated: int
    message: str


class ChampionshipGenerationResponse(BaseModel):
    tournament_id: uuid.UUID
    qualifiers_count: int
    rounds_count: int
    matches_generated: int
    message: str


# ─── Scramble Schemas (Phase 7) ───────────────────────────────────────────────

class ScrambleConfigureRequest(BaseModel):
    rounds: int = Field(default=3, ge=1, le=20, description="Number of rounds to generate")
    matches_per_player: int | None = Field(default=None, ge=1, le=20)
    partner_rotation: str = Field(default="balanced", description="Rotation strategy: balanced")


class ScrambleGenerationResponse(BaseModel):
    tournament_id: uuid.UUID
    participants_count: int
    rounds_count: int
    matches_generated: int
    message: str
    quality_summary: dict | None = None



class ScrambleStandingRow(BaseModel):
    rank: int
    player_membership_id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    skill_rating: float | None = None
    wins: int
    losses: int
    matches_played: int
    points_scored: int
    points_allowed: int
    points_differential: int

    model_config = {"from_attributes": True}


class ScrambleStandingsResponse(BaseModel):
    tournament_id: uuid.UUID
    standings: list[ScrambleStandingRow]

    model_config = {"from_attributes": True}


class ScrambleAvailabilityRequest(BaseModel):
    player_membership_ids: list[uuid.UUID] = Field(..., description="List of available player membership IDs")


class ScrambleMatchupGenerateRequest(BaseModel):
    court_ids: list[uuid.UUID] | None = Field(default=None, description="Optional court IDs")


class ScrambleCourtPlayerInfo(BaseModel):
    id: uuid.UUID
    display_name: str
    seed: int | None = None
    rating: float | None = None


class ScrambleCourtInfo(BaseModel):
    court_number: int
    court_id: str | None = None
    court_name: str
    player_count: int
    players: list[ScrambleCourtPlayerInfo] = []


class ScrambleConfigureRoundsRequest(BaseModel):
    planned_rounds: int = Field(..., ge=1, le=20, description="Planned number of rounds for this Scramble tournament")


class ScrambleStateResponse(BaseModel):
    tournament_id: uuid.UUID
    tournament_status: str
    current_round: int
    round_status: str  # 'setup' | 'matchups_created' | 'in_progress' | 'completed'
    planned_rounds: int = 3
    is_final_round: bool = False
    registered_players_count: int
    available_players_count: int
    available_player_ids: list[uuid.UUID] = []
    courts_count: int
    games_completed: int
    games_remaining: int
    total_games: int
    round_games_completed: int = 0
    round_games_remaining: int = 0
    round_games_total: int = 0
    tournament_games_completed: int = 0
    expected_total_games: int = 0
    recommended_rounds: int | None = None
    recommendation_reason: str | None = None
    current_leader: str | None = None
    champion_player_id: uuid.UUID | None = None
    champion_player_name: str | None = None
    courts: list[ScrambleCourtInfo] = []
    valid_actions: list[str] = []
    quality_summary: dict | None = None
    coverage_summary: dict | None = None

    model_config = {"from_attributes": True}


# ─── Bracket Schemas (Phase 8) ────────────────────────────────────────────────

class BracketGenerationResponse(BaseModel):
    """Response from generate-bracket or regenerate-bracket."""
    tournament_id: uuid.UUID
    teams_count: int
    bracket_size: int         # next power of 2 >= teams_count
    rounds_count: int
    matches_generated: int    # total slots created (includes BYE matches)
    byes_count: int           # number of BYE auto-advances
    played_matches_count: int  # matches_generated - byes_count (real playable matches)
    message: str


class BracketSummaryResponse(BaseModel):
    """High-level state summary for a bracket tournament."""
    tournament_id: uuid.UUID
    teams_count: int
    bracket_size: int
    total_rounds: int
    byes_count: int
    matches_total: int
    matches_played: int
    matches_remaining: int
    current_round: int | None = None
    champion_team_id: uuid.UUID | None = None
    champion_team_name: str | None = None
