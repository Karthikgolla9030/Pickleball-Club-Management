"""
Aught2 Pickleball — League Schemas (Phase 9)

Pydantic schemas for League domain API requests and responses.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.competition import MatchStage, MatchStatus
from app.models.league import LeagueStatus, LeagueWeekStatus, LeagueWeekType


# ─── League CRUD Schemas ──────────────────────────────────────────────────────

class LeagueCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="League display name")
    description: str | None = Field(None, max_length=2000)
    number_of_weeks: int = Field(4, ge=2, le=52, description="Total duration (Weeks 1..N-1 Regular Season, Week N Playoffs)")
    team_size: int = Field(2, ge=1, le=4, description="Default 2 for doubles")
    playoff_team_count: int = Field(4, ge=2, le=32, description="Number of teams qualifying for playoffs")
    start_date: datetime | None = None
    scoring_rules: dict[str, Any] | None = None


class LeagueUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)
    number_of_weeks: int | None = Field(None, ge=2, le=52)
    playoff_team_count: int | None = Field(None, ge=2, le=32)
    start_date: datetime | None = None
    scoring_rules: dict[str, Any] | None = None


class LeagueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    description: str | None
    status: LeagueStatus
    number_of_weeks: int
    current_week: int
    team_size: int
    playoff_team_count: int
    scoring_rules: dict[str, Any] | None
    start_date: datetime | None
    champion_team_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


# ─── League Team Schemas ──────────────────────────────────────────────────────

class LeagueTeamMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    player_membership_id: uuid.UUID
    display_name: str | None = None


class LeagueTeamResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    league_id: uuid.UUID | None
    name: str
    seed: int | None
    members: list[LeagueTeamMemberResponse] = []
    created_at: datetime


class LeagueTeamCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    member_player_membership_ids: list[uuid.UUID] = Field(
        ..., min_length=1, max_length=4, description="Player membership IDs (exactly team_size)"
    )
    seed: int | None = None


class LeagueTeamUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    seed: int | None = None


# ─── Match & Week Schemas ─────────────────────────────────────────────────────

class LeagueMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    league_id: uuid.UUID
    league_week_id: uuid.UUID | None
    week_number: int | None = None
    round_number: int | None
    match_number: int | None
    stage: MatchStage | None
    bracket_round: int | None = None
    bracket_position: int | None = None
    team_a_id: uuid.UUID | None
    team_b_id: uuid.UUID | None
    team_a_name: str | None = None
    team_b_name: str | None = None
    score_a: int | None
    score_b: int | None
    status: MatchStatus
    winner_team_id: uuid.UUID | None
    winner_team_name: str | None = None
    completed_at: datetime | None
    is_bye: bool = False
    court_id: uuid.UUID | None = None
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None


class LeagueWeekResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    league_id: uuid.UUID
    week_number: int
    week_type: LeagueWeekType
    status: LeagueWeekStatus
    matches: list[LeagueMatchResponse] = []


# ─── Standings & Snapshot Schemas ─────────────────────────────────────────────

class LeagueStandingRowResponse(BaseModel):
    team_id: uuid.UUID
    team_name: str
    rank: int
    matches_played: int
    wins: int
    losses: int
    points_scored: int
    points_allowed: int
    points_differential: int


class LeagueStandingsResponse(BaseModel):
    league_id: uuid.UUID
    current_week: int
    is_playoffs_started: bool
    standings: list[LeagueStandingRowResponse]


class LeagueSnapshotResponse(BaseModel):
    league_id: uuid.UUID
    week_number: int
    standings: list[LeagueStandingRowResponse]


# ─── Playoff Schemas ──────────────────────────────────────────────────────────

class PlayoffSummaryResponse(BaseModel):
    league_id: uuid.UUID
    playoff_week_number: int
    total_playoff_teams: int
    bracket_size: int
    total_rounds: int
    byes_count: int
    matches: list[LeagueMatchResponse]
    champion_team_id: uuid.UUID | None = None
    champion_team_name: str | None = None
