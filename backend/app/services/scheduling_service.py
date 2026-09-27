"""
Aught2 Pickleball — Competition Scheduling Service (Phase 17)

Orchestrates court assignment, match start/end scheduling, conflict prevention,
and schedule visibility across tournaments, leagues, courts, and players.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any
import uuid

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scheduling_config import (
    DEFAULT_MATCH_DURATION_MINUTES,
    MAX_MATCH_DURATION_MINUTES,
    MIN_MATCH_DURATION_MINUTES,
    intervals_overlap,
)
from app.models.club import Club
from app.models.competition import Match, MatchParticipant, MatchStatus
from app.models.court import Court, CourtStatus
from app.models.league import League
from app.models.tournament import Tournament, TournamentFormat
from app.repositories.booking_repository import BookingRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.competition_repository import CompetitionRepository
from app.repositories.court_repository import CourtRepository
from app.repositories.league_repository import LeagueRepository
from app.repositories.scheduling_repository import SchedulingRepository, _ensure_utc
from app.repositories.tournament_repository import TournamentRepository
from app.schemas.competition import MatchParticipantResponse
from app.schemas.scheduling import (
    CourtAvailabilityResponse,
    CourtScheduleResponse,
    CourtSlotAvailability,
    PlayerMatchScheduleResponse,
    ScheduledMatchResponse,
)


class SchedulingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.scheduling_repo = SchedulingRepository(db)
        self.booking_repo = BookingRepository(db)
        self.tournament_repo = TournamentRepository(db)
        self.league_repo = LeagueRepository(db)
        self.court_repo = CourtRepository(db)
        self.club_repo = ClubRepository(db)
        self.competition_repo = CompetitionRepository(db)

    # ─── Serializer ───────────────────────────────────────────────────────────

    def _serialize_match(self, match: Match) -> ScheduledMatchResponse:
        comp_type = "tournament" if match.tournament_id else "league"
        comp_id = match.tournament_id or match.league_id or uuid.uuid4()
        comp_name = ""
        tourn_format = None

        if match.tournament:
            comp_name = match.tournament.name
            tourn_format = (
                match.tournament.format.value
                if hasattr(match.tournament.format, "value")
                else str(match.tournament.format)
            )
        elif match.league:
            comp_name = match.league.name

        side_a_parts: list[MatchParticipantResponse] = []
        side_b_parts: list[MatchParticipantResponse] = []
        for p in match.participants:
            user = p.player_membership.user if p.player_membership else None
            disp = None
            mem_num = (
                p.player_membership.membership_number
                if p.player_membership
                else None
            )
            if user:
                disp = (
                    user.player_profile.display_name
                    if user.player_profile and user.player_profile.display_name
                    else user.full_name
                )
            part_resp = MatchParticipantResponse(
                id=p.id,
                match_id=p.match_id,
                player_membership_id=p.player_membership_id,
                side=p.side,
                partner_slot=p.partner_slot,
                user_id=user.id if user else None,
                display_name=disp,
                membership_number=mem_num,
            )
            if p.side == "side_a":
                side_a_parts.append(part_resp)
            else:
                side_b_parts.append(part_resp)

        duration = None
        if match.scheduled_start_at and match.scheduled_end_at:
            duration = int(
                (match.scheduled_end_at - match.scheduled_start_at).total_seconds() / 60
            )

        winner_name = None
        if match.winner_team:
            winner_name = match.winner_team.name

        return ScheduledMatchResponse(
            match_id=match.id,
            competition_type=comp_type,
            competition_id=comp_id,
            competition_name=comp_name,
            tournament_format=tourn_format,
            stage=match.stage.value if match.stage and hasattr(match.stage, "value") else (str(match.stage) if match.stage else None),
            round_number=match.round_number,
            match_number=match.match_number,
            pool_id=match.pool_id,
            pool_name=match.pool.name if match.pool else None,
            bracket_round=match.bracket_round,
            bracket_position=match.bracket_position,
            league_week_id=match.league_week_id,
            league_week_number=match.league_week.week_number if match.league_week else None,
            is_playoff=bool(
                match.league_week
                and hasattr(match.league_week.week_type, "value")
                and match.league_week.week_type.value == "playoffs"
            ),
            team_a_id=match.team_a_id,
            team_a_name=match.team_a.name if match.team_a else None,
            team_b_id=match.team_b_id,
            team_b_name=match.team_b.name if match.team_b else None,
            side_a_participants=side_a_parts if side_a_parts else None,
            side_b_participants=side_b_parts if side_b_parts else None,
            court_id=match.court_id,
            court_name=match.court.name if match.court else None,
            court_number=match.court.court_number if match.court else None,
            scheduled_start_at=match.scheduled_start_at,
            scheduled_end_at=match.scheduled_end_at,
            duration_minutes=duration,
            status=match.status.value if hasattr(match.status, "value") else str(match.status),
            score_a=match.score_a,
            score_b=match.score_b,
            winner_team_id=match.winner_team_id,
            winner_team_name=winner_name,
        )

    # ─── Validation Helpers ───────────────────────────────────────────────────

    async def _validate_court(self, court_id: uuid.UUID, club_id: uuid.UUID) -> Court:
        court = await self.scheduling_repo.lock_court_for_update(court_id)
        if not court:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Court not found",
            )
        if court.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court does not belong to this club",
            )
        if not court.is_active or court.status != CourtStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court is inactive and cannot be scheduled",
            )
        return court

    def _validate_match_schedulability(self, match: Match) -> None:
        """Verify match is in pending status and has all required competitors."""
        if match.status != MatchStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only pending matches can be scheduled or rescheduled (current: {match.status.value})",
            )

        # Scramble format check
        is_scramble = bool(
            match.tournament
            and match.tournament.format == TournamentFormat.SCRAMBLE
        )
        if is_scramble:
            # Must have complete participants (doubles requires 4 participants)
            if len(match.participants) < 4:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot schedule Scramble match without complete participants",
                )
        else:
            # Fixed team formats (Round Robin, Pool Play, Bracket, League)
            if match.team_a_id is None or match.team_b_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot schedule match without two valid competitors",
                )

    async def _check_schedule_conflicts(
        self,
        match: Match,
        court_id: uuid.UUID,
        start_at: datetime,
        end_at: datetime,
    ) -> None:
        """Enforce court, booking, team, and scramble player conflict rules."""
        # 1. Court conflict with other competition matches
        court_conflicts = await self.scheduling_repo.find_court_conflicts(
            court_id=court_id,
            start_at=start_at,
            end_at=end_at,
            exclude_match_id=match.id,
        )
        if court_conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already scheduled for another competition match during this time",
            )

        # 2. Court conflict with existing player bookings
        booking_conflicts = await self.booking_repo.find_conflicts(
            court_id=court_id,
            start_at=start_at,
            end_at=end_at,
        )
        if booking_conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court has a confirmed player booking during this time",
            )

        # 3. Team conflicts (for fixed teams)
        is_scramble = bool(
            match.tournament
            and match.tournament.format == TournamentFormat.SCRAMBLE
        )
        if not is_scramble:
            if match.team_a_id:
                team_a_conflicts = await self.scheduling_repo.find_team_conflicts(
                    team_id=match.team_a_id,
                    start_at=start_at,
                    end_at=end_at,
                    exclude_match_id=match.id,
                )
                if team_a_conflicts:
                    team_name = match.team_a.name if match.team_a else "Team A"
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Team '{team_name}' has another match scheduled during this time",
                    )
            if match.team_b_id:
                team_b_conflicts = await self.scheduling_repo.find_team_conflicts(
                    team_id=match.team_b_id,
                    start_at=start_at,
                    end_at=end_at,
                    exclude_match_id=match.id,
                )
                if team_b_conflicts:
                    team_name = match.team_b.name if match.team_b else "Team B"
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Team '{team_name}' has another match scheduled during this time",
                    )
        else:
            # 4. Player conflicts (for Scramble participants)
            for p in match.participants:
                p_conflicts = await self.scheduling_repo.find_player_conflicts(
                    player_membership_id=p.player_membership_id,
                    start_at=start_at,
                    end_at=end_at,
                    exclude_match_id=match.id,
                )
                if p_conflicts:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="A participant in this match is scheduled in another match during this time",
                    )

    # ─── Tournament Scheduling ────────────────────────────────────────────────

    async def schedule_tournament_match(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        match_id: uuid.UUID,
        court_id: uuid.UUID,
        start_at: datetime,
        duration_minutes: int = DEFAULT_MATCH_DURATION_MINUTES,
    ) -> ScheduledMatchResponse:
        start_utc = _ensure_utc(start_at)
        if duration_minutes < MIN_MATCH_DURATION_MINUTES or duration_minutes > MAX_MATCH_DURATION_MINUTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duration must be between {MIN_MATCH_DURATION_MINUTES} and {MAX_MATCH_DURATION_MINUTES} minutes",
            )
        end_utc = start_utc + timedelta(minutes=duration_minutes)

        match = await self.scheduling_repo.lock_match_for_update(match_id)
        if not match or match.tournament_id != tournament_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this tournament",
            )
        if not match.tournament or match.tournament.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tournament does not belong to this club",
            )

        self._validate_match_schedulability(match)
        court = await self._validate_court(court_id, club_id)
        await self._check_schedule_conflicts(match, court_id, start_utc, end_utc)

        try:
            await self.scheduling_repo.set_match_schedule(
                match=match,
                court_id=court_id,
                start_at=start_utc,
                end_at=end_utc,
            )
        except IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already scheduled for this time slot",
            )

        # Refresh for relations
        refreshed = await self.scheduling_repo.get_match(match.id)
        return self._serialize_match(refreshed or match)

    async def reschedule_tournament_match(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        match_id: uuid.UUID,
        court_id: uuid.UUID | None = None,
        start_at: datetime | None = None,
        duration_minutes: int | None = None,
    ) -> ScheduledMatchResponse:
        match = await self.scheduling_repo.lock_match_for_update(match_id)
        if not match or match.tournament_id != tournament_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this tournament",
            )
        if not match.tournament or match.tournament.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tournament does not belong to this club",
            )
        if match.status != MatchStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Completed matches retain historical schedule and cannot be rescheduled",
            )

        target_court_id = court_id or match.court_id
        if not target_court_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court must be assigned to schedule match",
            )

        target_start = _ensure_utc(start_at) if start_at else match.scheduled_start_at
        if not target_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start time must be provided to schedule match",
            )

        if duration_minutes:
            target_duration = duration_minutes
        elif match.scheduled_start_at and match.scheduled_end_at:
            target_duration = int((match.scheduled_end_at - match.scheduled_start_at).total_seconds() / 60)
        else:
            target_duration = DEFAULT_MATCH_DURATION_MINUTES

        target_end = target_start + timedelta(minutes=target_duration)

        self._validate_match_schedulability(match)
        court = await self._validate_court(target_court_id, club_id)
        await self._check_schedule_conflicts(match, target_court_id, target_start, target_end)

        try:
            await self.scheduling_repo.set_match_schedule(
                match=match,
                court_id=target_court_id,
                start_at=target_start,
                end_at=target_end,
            )
        except IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already scheduled for this time slot",
            )

        refreshed = await self.scheduling_repo.get_match(match.id)
        return self._serialize_match(refreshed or match)

    async def unschedule_tournament_match(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        match_id: uuid.UUID,
    ) -> ScheduledMatchResponse:
        match = await self.scheduling_repo.lock_match_for_update(match_id)
        if not match or match.tournament_id != tournament_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this tournament",
            )
        if not match.tournament or match.tournament.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tournament does not belong to this club",
            )
        if match.status != MatchStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot unschedule a completed match",
            )

        await self.scheduling_repo.clear_match_schedule(match)
        refreshed = await self.scheduling_repo.get_match(match.id)
        return self._serialize_match(refreshed or match)

    async def get_tournament_schedule(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> list[ScheduledMatchResponse]:
        tournament = await self.tournament_repo.get_by_id(tournament_id)
        if not tournament or tournament.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )
        matches = await self.scheduling_repo.list_by_tournament(
            tournament_id=tournament_id,
            scheduled=True,
        )
        return [self._serialize_match(m) for m in matches]

    async def get_tournament_unscheduled(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> list[ScheduledMatchResponse]:
        tournament = await self.tournament_repo.get_by_id(tournament_id)
        if not tournament or tournament.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )
        matches = await self.scheduling_repo.list_by_tournament(
            tournament_id=tournament_id,
            scheduled=False,
        )
        return [self._serialize_match(m) for m in matches]

    # ─── League Scheduling ────────────────────────────────────────────────────

    async def schedule_league_match(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        match_id: uuid.UUID,
        court_id: uuid.UUID,
        start_at: datetime,
        duration_minutes: int = DEFAULT_MATCH_DURATION_MINUTES,
    ) -> ScheduledMatchResponse:
        start_utc = _ensure_utc(start_at)
        if duration_minutes < MIN_MATCH_DURATION_MINUTES or duration_minutes > MAX_MATCH_DURATION_MINUTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duration must be between {MIN_MATCH_DURATION_MINUTES} and {MAX_MATCH_DURATION_MINUTES} minutes",
            )
        end_utc = start_utc + timedelta(minutes=duration_minutes)

        match = await self.scheduling_repo.lock_match_for_update(match_id)
        if not match or match.league_id != league_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this league",
            )
        if not match.league or match.league.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="League does not belong to this club",
            )

        self._validate_match_schedulability(match)
        court = await self._validate_court(court_id, club_id)
        await self._check_schedule_conflicts(match, court_id, start_utc, end_utc)

        try:
            await self.scheduling_repo.set_match_schedule(
                match=match,
                court_id=court_id,
                start_at=start_utc,
                end_at=end_utc,
            )
        except IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already scheduled for this time slot",
            )

        refreshed = await self.scheduling_repo.get_match(match.id)
        return self._serialize_match(refreshed or match)

    async def reschedule_league_match(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        match_id: uuid.UUID,
        court_id: uuid.UUID | None = None,
        start_at: datetime | None = None,
        duration_minutes: int | None = None,
    ) -> ScheduledMatchResponse:
        match = await self.scheduling_repo.lock_match_for_update(match_id)
        if not match or match.league_id != league_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this league",
            )
        if not match.league or match.league.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="League does not belong to this club",
            )
        if match.status != MatchStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Completed matches retain historical schedule and cannot be rescheduled",
            )

        target_court_id = court_id or match.court_id
        if not target_court_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Court must be assigned to schedule match",
            )

        target_start = _ensure_utc(start_at) if start_at else match.scheduled_start_at
        if not target_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Start time must be provided to schedule match",
            )

        if duration_minutes:
            target_duration = duration_minutes
        elif match.scheduled_start_at and match.scheduled_end_at:
            target_duration = int((match.scheduled_end_at - match.scheduled_start_at).total_seconds() / 60)
        else:
            target_duration = DEFAULT_MATCH_DURATION_MINUTES

        target_end = target_start + timedelta(minutes=target_duration)

        self._validate_match_schedulability(match)
        court = await self._validate_court(target_court_id, club_id)
        await self._check_schedule_conflicts(match, target_court_id, target_start, target_end)

        try:
            await self.scheduling_repo.set_match_schedule(
                match=match,
                court_id=target_court_id,
                start_at=target_start,
                end_at=target_end,
            )
        except IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Court is already scheduled for this time slot",
            )

        refreshed = await self.scheduling_repo.get_match(match.id)
        return self._serialize_match(refreshed or match)

    async def unschedule_league_match(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        match_id: uuid.UUID,
    ) -> ScheduledMatchResponse:
        match = await self.scheduling_repo.lock_match_for_update(match_id)
        if not match or match.league_id != league_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this league",
            )
        if not match.league or match.league.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="League does not belong to this club",
            )
        if match.status != MatchStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot unschedule a completed match",
            )

        await self.scheduling_repo.clear_match_schedule(match)
        refreshed = await self.scheduling_repo.get_match(match.id)
        return self._serialize_match(refreshed or match)

    async def get_league_schedule(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
    ) -> list[ScheduledMatchResponse]:
        league = await self.league_repo.get_league(league_id, club_id)
        if not league:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="League not found in this club",
            )
        matches = await self.scheduling_repo.list_by_league(
            league_id=league_id,
            scheduled=True,
        )
        return [self._serialize_match(m) for m in matches]

    async def get_league_unscheduled(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
    ) -> list[ScheduledMatchResponse]:
        league = await self.league_repo.get_league(league_id, club_id)
        if not league:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="League not found in this club",
            )
        matches = await self.scheduling_repo.list_by_league(
            league_id=league_id,
            scheduled=False,
        )
        return [self._serialize_match(m) for m in matches]

    # ─── Club Schedule & Availability ─────────────────────────────────────────

    async def get_club_daily_schedule(
        self,
        club_id: uuid.UUID,
        target_date: date,
        court_id: uuid.UUID | None = None,
    ) -> list[CourtScheduleResponse]:
        """Returns competition schedule organized by court for a specific day."""
        courts = await self.court_repo.list_by_club(club_id)
        active_courts = [c for c in courts if c.is_active and c.status == CourtStatus.ACTIVE]
        if court_id:
            active_courts = [c for c in active_courts if c.id == court_id]

        scheduled_matches = await self.scheduling_repo.list_scheduled_by_club_date(
            club_id=club_id,
            target_date=target_date,
            court_id=court_id,
        )

        matches_by_court: dict[uuid.UUID, list[ScheduledMatchResponse]] = {
            c.id: [] for c in active_courts
        }
        for m in scheduled_matches:
            if m.court_id in matches_by_court:
                matches_by_court[m.court_id].append(self._serialize_match(m))

        response: list[CourtScheduleResponse] = []
        for c in active_courts:
            response.append(
                CourtScheduleResponse(
                    court_id=c.id,
                    court_name=c.name,
                    display_name=c.display_name,
                    surface_type=c.surface_type,
                    indoor_outdoor=c.indoor_outdoor.value if hasattr(c.indoor_outdoor, "value") else str(c.indoor_outdoor),
                    display_order=c.display_order,
                    scheduled_matches=matches_by_court.get(c.id, []),
                )
            )
        return response

    async def get_club_court_availability(
        self,
        club_id: uuid.UUID,
        target_date: date,
        start_time: time | None = None,
        end_time: time | None = None,
    ) -> list[CourtAvailabilityResponse]:
        """Calculates 60-min slots for courts, checking both matches and player bookings."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Club not found")

        open_time = start_time or getattr(club, "opening_time", time(6, 0))
        close_time = end_time or getattr(club, "closing_time", time(22, 0))

        day_start = datetime.combine(target_date, open_time, tzinfo=timezone.utc)
        day_end = datetime.combine(target_date, close_time, tzinfo=timezone.utc)

        courts = await self.court_repo.list_by_club(club_id)
        active_courts = [c for c in courts if c.is_active and c.status == CourtStatus.ACTIVE]
        active_court_ids = [c.id for c in active_courts]

        # Load confirmed bookings for this day
        confirmed_bookings = await self.booking_repo.list_confirmed_for_date_range(
            club_id=club_id,
            start_time=day_start,
            end_time=day_end,
            court_ids=active_court_ids,
        )

        # Load scheduled competition matches for this day
        scheduled_matches = await self.scheduling_repo.list_scheduled_by_club_date(
            club_id=club_id,
            target_date=target_date,
        )

        response: list[CourtAvailabilityResponse] = []
        slot_delta = timedelta(minutes=60)

        for court in active_courts:
            court_matches = [m for m in scheduled_matches if m.court_id == court.id]
            serialized_matches = [self._serialize_match(m) for m in court_matches]

            slots: list[CourtSlotAvailability] = []
            slot_start = day_start
            while slot_start + slot_delta <= day_end:
                slot_end = slot_start + slot_delta

                # Check booking conflict
                booking_conflict = next(
                    (
                        b for b in confirmed_bookings
                        if b.court_id == court.id and intervals_overlap(_ensure_utc(b.start_at), _ensure_utc(b.end_at), slot_start, slot_end)
                    ),
                    None,
                )

                # Check match conflict
                match_conflict = next(
                    (
                        m for m in court_matches
                        if m.scheduled_start_at and m.scheduled_end_at and intervals_overlap(_ensure_utc(m.scheduled_start_at), _ensure_utc(m.scheduled_end_at), slot_start, slot_end)
                    ),
                    None,
                )

                is_avail = booking_conflict is None and match_conflict is None
                reason = None
                conf_id = None
                conf_title = None

                if booking_conflict:
                    reason = "booking"
                    conf_id = booking_conflict.id
                    conf_title = f"Player Booking"
                elif match_conflict:
                    reason = "competition_match"
                    conf_id = match_conflict.id
                    if match_conflict.tournament:
                        conf_title = f"Tournament Match: {match_conflict.tournament.name}"
                    elif match_conflict.league:
                        conf_title = f"League Match: {match_conflict.league.name}"
                    else:
                        conf_title = "Competition Match"

                slots.append(
                    CourtSlotAvailability(
                        start_at=slot_start,
                        end_at=slot_end,
                        is_available=is_avail,
                        conflict_reason=reason,
                        conflict_id=conf_id,
                        conflict_title=conf_title,
                    )
                )
                slot_start += slot_delta

            response.append(
                CourtAvailabilityResponse(
                    court_id=court.id,
                    court_name=court.name,
                    display_name=court.display_name,
                    surface_type=court.surface_type,
                    indoor_outdoor=court.indoor_outdoor.value if hasattr(court.indoor_outdoor, "value") else str(court.indoor_outdoor),
                    display_order=court.display_order,
                    scheduled_matches=serialized_matches,
                    slots=slots,
                )
            )
        return response

    # ─── Player Personal Schedule ─────────────────────────────────────────────

    async def get_player_competition_schedule(
        self,
        user_id: uuid.UUID,
        timeframe: str | None = None,
    ) -> list[PlayerMatchScheduleResponse]:
        matches = await self.scheduling_repo.list_player_schedule(
            user_id=user_id,
            timeframe=timeframe,
        )

        response: list[PlayerMatchScheduleResponse] = []
        for m in matches:
            comp_type = "tournament" if m.tournament_id else "league"
            comp_id = m.tournament_id or m.league_id or uuid.uuid4()
            comp_name = m.tournament.name if m.tournament else (m.league.name if m.league else "")
            fmt = None
            if m.tournament:
                fmt = (
                    m.tournament.format.value
                    if hasattr(m.tournament.format, "value")
                    else str(m.tournament.format)
                )

            round_or_week = ""
            if m.round_number:
                round_or_week = f"Round {m.round_number}"
            elif m.bracket_round:
                round_or_week = f"Bracket Round {m.bracket_round}"
            elif m.league_week:
                round_or_week = f"Week {m.league_week.week_number}"

            opp_name = None
            partner_name = None
            is_winner = None

            # Check if user is in team_a or team_b
            user_in_team_a = False
            user_in_team_b = False
            if m.team_a and m.team_a.members:
                for tm in m.team_a.members:
                    if tm.player_membership and tm.player_membership.user_id == user_id:
                        user_in_team_a = True
                        break
            if m.team_b and m.team_b.members:
                for tm in m.team_b.members:
                    if tm.player_membership and tm.player_membership.user_id == user_id:
                        user_in_team_b = True
                        break

            if user_in_team_a:
                opp_name = m.team_b.name if m.team_b else "TBD"
                if m.winner_team_id:
                    is_winner = m.winner_team_id == m.team_a_id
            elif user_in_team_b:
                opp_name = m.team_a.name if m.team_a else "TBD"
                if m.winner_team_id:
                    is_winner = m.winner_team_id == m.team_b_id
            else:
                # Scramble participant
                user_part = next(
                    (p for p in m.participants if p.player_membership and p.player_membership.user_id == user_id),
                    None,
                )
                if user_part:
                    partner = next(
                        (
                            p for p in m.participants
                            if p.side == user_part.side and p.id != user_part.id
                        ),
                        None,
                    )
                    if partner and partner.player_membership and partner.player_membership.user:
                        partner_user = partner.player_membership.user
                        partner_name = (
                            partner_user.player_profile.display_name
                            if partner_user.player_profile and partner_user.player_profile.display_name
                            else partner_user.full_name
                        )

                    opps = [
                        p for p in m.participants
                        if p.side != user_part.side and p.player_membership and p.player_membership.user
                    ]
                    opp_names = [
                        (p.player_membership.user.player_profile.display_name
                         if p.player_membership.user.player_profile and p.player_membership.user.player_profile.display_name
                         else p.player_membership.user.full_name)
                        for p in opps
                    ]
                    opp_name = " & ".join(opp_names) if opp_names else "Opponents"

            duration = None
            if m.scheduled_start_at and m.scheduled_end_at:
                duration = int((m.scheduled_end_at - m.scheduled_start_at).total_seconds() / 60)

            response.append(
                PlayerMatchScheduleResponse(
                    match_id=m.id,
                    competition_type=comp_type,
                    competition_id=comp_id,
                    competition_name=comp_name,
                    format=fmt,
                    round_or_week=round_or_week,
                    opponent_name=opp_name,
                    partner_name=partner_name,
                    court_id=m.court_id,
                    court_name=m.court.name if m.court else None,
                    scheduled_start_at=m.scheduled_start_at,
                    scheduled_end_at=m.scheduled_end_at,
                    duration_minutes=duration,
                    status=m.status.value if hasattr(m.status, "value") else str(m.status),
                    score_a=m.score_a,
                    score_b=m.score_b,
                    is_winner=is_winner,
                )
            )
        return response
