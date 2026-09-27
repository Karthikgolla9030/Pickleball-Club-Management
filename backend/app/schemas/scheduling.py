"""
Aught2 Pickleball — Competition Scheduling Schemas (Phase 17)

Pydantic schemas for tournament and league match scheduling, court assignment,
availability queries, and player competition schedules.
"""
from __future__ import annotations

from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.core.scheduling_config import (
    DEFAULT_MATCH_DURATION_MINUTES,
    MAX_MATCH_DURATION_MINUTES,
    MIN_MATCH_DURATION_MINUTES,
)
from app.schemas.competition import MatchParticipantResponse


class ScheduleMatchRequest(BaseModel):
    """Payload to assign a court and time window to a pending match."""
    court_id: uuid.UUID = Field(..., description="ID of the club court to assign")
    start_at: datetime = Field(..., description="Scheduled start time (UTC timezone-aware)")
    duration_minutes: int = Field(
        default=DEFAULT_MATCH_DURATION_MINUTES,
        ge=MIN_MATCH_DURATION_MINUTES,
        le=MAX_MATCH_DURATION_MINUTES,
        description="Duration of the match in minutes",
    )


class RescheduleMatchRequest(BaseModel):
    """Payload to modify the court, start time, or duration of a scheduled match."""
    court_id: uuid.UUID | None = Field(default=None, description="New court ID")
    start_at: datetime | None = Field(default=None, description="New start time (UTC)")
    duration_minutes: int | None = Field(
        default=None,
        ge=MIN_MATCH_DURATION_MINUTES,
        le=MAX_MATCH_DURATION_MINUTES,
        description="New duration in minutes",
    )


class ScheduledMatchResponse(BaseModel):
    """Detailed view of a scheduled or unscheduled competition match."""
    model_config = ConfigDict(from_attributes=True)

    match_id: uuid.UUID
    competition_type: str = Field(..., description="'tournament' or 'league'")
    competition_id: uuid.UUID
    competition_name: str
    tournament_format: str | None = None

    stage: str | None = None
    round_number: int | None = None
    match_number: int | None = None
    pool_id: uuid.UUID | None = None
    pool_name: str | None = None
    bracket_round: int | None = None
    bracket_position: int | None = None

    league_week_id: uuid.UUID | None = None
    league_week_number: int | None = None
    is_playoff: bool = False

    team_a_id: uuid.UUID | None = None
    team_a_name: str | None = None
    team_b_id: uuid.UUID | None = None
    team_b_name: str | None = None

    side_a_participants: list[MatchParticipantResponse] | None = None
    side_b_participants: list[MatchParticipantResponse] | None = None

    court_id: uuid.UUID | None = None
    court_name: str | None = None
    court_number: int | None = None

    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    duration_minutes: int | None = None

    status: str
    score_a: int | None = None
    score_b: int | None = None
    winner_team_id: uuid.UUID | None = None
    winner_team_name: str | None = None


class CourtSlotAvailability(BaseModel):
    """Availability status of a single time slot on a court."""
    start_at: datetime
    end_at: datetime
    is_available: bool
    conflict_reason: str | None = None  # "competition_match" or "booking"
    conflict_id: uuid.UUID | None = None
    conflict_title: str | None = None


class CourtScheduleResponse(BaseModel):
    """Daily schedule of competition matches on a court."""
    court_id: uuid.UUID
    court_name: str
    display_name: str | None = None
    surface_type: str | None = None
    indoor_outdoor: str
    display_order: int = 0
    scheduled_matches: list[ScheduledMatchResponse] = []


class CourtAvailabilityResponse(BaseModel):
    """Court availability breakdown with slots for scheduling."""
    court_id: uuid.UUID
    court_name: str
    display_name: str | None = None
    surface_type: str | None = None
    indoor_outdoor: str
    display_order: int = 0
    scheduled_matches: list[ScheduledMatchResponse] = []
    slots: list[CourtSlotAvailability] = []


class PlayerMatchScheduleResponse(BaseModel):
    """Personalized view of an upcoming, today, or past match for a player."""
    match_id: uuid.UUID
    competition_type: str
    competition_id: uuid.UUID
    competition_name: str
    format: str | None = None
    round_or_week: str
    opponent_name: str | None = None
    partner_name: str | None = None
    court_id: uuid.UUID | None = None
    court_name: str | None = None
    scheduled_start_at: datetime | None = None
    scheduled_end_at: datetime | None = None
    duration_minutes: int | None = None
    status: str
    score_a: int | None = None
    score_b: int | None = None
    is_winner: bool | None = None
