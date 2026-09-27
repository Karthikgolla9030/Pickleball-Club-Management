"""
Aught2 Pickleball — Competition Service (Phase 5, 6, 7 & 8)

Business logic for team management, match generation, score recording,
standings calculation, pool play configuration, championship bracket,
Scramble competition, and standalone Bracket tournament.
Orchestrates RoundRobinEngine, PoolPlayEngine, ScrambleEngine, BracketEngine.

All operations enforce:
  - Club tenant isolation (club_id scope)
  - Tournament format guards (round_robin / pool_play / scramble / bracket)
  - Tournament lifecycle guards
  - Authorization is handled at the API layer via require_permission()
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.events import EventType, dispatch_event
from app.models.club_player_membership import PlayerMembershipStatus
from app.models.competition import (
    Match,
    MatchParticipant,
    MatchStage,
    MatchStatus,
    Pool,
    PoolTeam,
    Team,
)
from app.models.tournament import TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus
from app.repositories.club_player_membership_repository import (
    ClubPlayerMembershipRepository,
)
from app.repositories.competition_repository import CompetitionRepository
from app.repositories.tournament_registration_repository import (
    TournamentRegistrationRepository,
)
from app.repositories.tournament_repository import TournamentRepository
from app.schemas.competition import (
    AllPoolsStandingsResponse,
    BracketGenerationResponse,
    BracketSummaryResponse,
    ChampionshipGenerationResponse,
    GenerationResponse,
    MatchParticipantResponse,
    MatchResponse,
    MatchTeamSummary,
    PoolConfigureRequest,
    PoolManualAssignRequest,
    PoolPlayGenerationResponse,
    PoolResponse,
    PoolStandingRow,
    PoolStandingsResponse,
    PoolTeamResponse,
    ScrambleAvailabilityRequest,
    ScrambleConfigureRequest,
    ScrambleCourtInfo,
    ScrambleCourtPlayerInfo,
    ScrambleGenerationResponse,
    ScrambleMatchupGenerateRequest,
    ScrambleStandingRow,
    ScrambleStandingsResponse,
    ScrambleStateResponse,
    StandingRow,
    StandingsResponse,
    TeamCreate,
    TeamMemberResponse,
    TeamResponse,
    TeamUpdate,
)
from app.repositories.court_repository import CourtRepository
from app.services.competition.bracket_engine import (
    BracketConfigurationError,
    BracketEngine,
)
from app.services.competition.pool_play_engine import (
    ChampionshipError,
    PoolConfigurationError,
    PoolPlayEngine,
)
from app.services.competition.round_robin_engine import RoundRobinEngine
from app.services.competition.scramble_engine import (
    ScrambleConfigurationError,
    ScrambleEngine,
    ScrambleError,
)
from app.services.competition.score_validator import (
    ScoreValidationError,
    derive_winner_side,
)



# ─── Response Builders ────────────────────────────────────────────────────────

def _build_team_response(team: Team) -> TeamResponse:
    members = []
    for m in (team.members or []):
        pm = m.player_membership
        user = pm.user if pm and hasattr(pm, "user") else None
        profile = None
        if user and hasattr(user, "player_profile"):
            profile = user.player_profile
        members.append(
            TeamMemberResponse(
                id=m.id,
                team_id=m.team_id,
                player_membership_id=m.player_membership_id,
                user_id=user.id if user else None,
                user_email=user.email if user else None,
                display_name=(
                    profile.display_name
                    if profile
                    else (user.full_name if user else None)
                ),
                membership_number=pm.membership_number if pm else None,
                skill_rating=(
                    float(profile.skill_rating)
                    if profile and profile.skill_rating is not None
                    else 3.5
                ),
                created_at=m.created_at,
            )
        )
    return TeamResponse(
        id=team.id,
        tournament_id=team.tournament_id,
        name=team.name,
        seed=team.seed,
        members=members,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


def _build_match_response(
    match: Match, sit_out_p: MatchParticipantResponse | None = None
) -> MatchResponse:
    stage_val = match.stage.value if match.stage else None
    stage_label = match.stage.display_label if match.stage else None

    side_a_participants: list[MatchParticipantResponse] = []
    side_b_participants: list[MatchParticipantResponse] = []
    for p in (match.participants or []):
        pm = p.player_membership
        user = pm.user if pm and hasattr(pm, "user") else None
        profile = user.player_profile if user and hasattr(user, "player_profile") else None
        display_name = (
            profile.display_name
            if profile and profile.display_name
            else (user.full_name if user and user.full_name else (user.email if user else "Player"))
        )
        p_resp = MatchParticipantResponse(
            id=p.id,
            player_membership_id=p.player_membership_id,
            side=p.side,
            partner_slot=p.partner_slot,
            user_id=user.id if user else None,
            display_name=display_name,
            membership_number=pm.membership_number if pm else None,
        )
        if p.side == "side_a":
            side_a_participants.append(p_resp)
        elif p.side == "side_b":
            side_b_participants.append(p_resp)

    side_a_participants.sort(key=lambda x: x.partner_slot)
    side_b_participants.sort(key=lambda x: x.partner_slot)

    winner_side = None
    if match.status == MatchStatus.COMPLETED and match.score_a is not None and match.score_b is not None:
        winner_side = "side_a" if match.score_a > match.score_b else "side_b"

    return MatchResponse(
        id=match.id,
        tournament_id=match.tournament_id,
        round_number=match.round_number,
        match_number=match.match_number,
        stage=stage_val,
        stage_label=stage_label,
        pool_id=match.pool_id,
        bracket_round=match.bracket_round,
        bracket_position=match.bracket_position,
        next_match_id=match.next_match_id,
        next_match_slot=match.next_match_slot,
        team_a_id=match.team_a_id,
        team_b_id=match.team_b_id,
        team_a=(
            MatchTeamSummary(
                id=match.team_a.id,
                name=match.team_a.name,
                seed=match.team_a.seed,
            )
            if match.team_a else None
        ),
        team_b=(
            MatchTeamSummary(
                id=match.team_b.id,
                name=match.team_b.name,
                seed=match.team_b.seed,
            )
            if match.team_b else None
        ),
        side_a_participants=side_a_participants,
        side_b_participants=side_b_participants,
        sit_out_participant=sit_out_p,
        status=match.status,
        status_label=match.status.display_label,
        score_a=match.score_a,
        score_b=match.score_b,
        winner_team_id=match.winner_team_id,
        winner_team=(
            MatchTeamSummary(
                id=match.winner_team.id,
                name=match.winner_team.name,
                seed=match.winner_team.seed,
            )
            if match.winner_team else None
        ),
        winner_side=winner_side,
        completed_at=match.completed_at,
        court_id=match.court_id,
        scheduled_start_at=match.scheduled_start_at,
        scheduled_end_at=match.scheduled_end_at,
        created_at=match.created_at,
        updated_at=match.updated_at,
    )



def _build_pool_response(pool: Pool) -> PoolResponse:
    teams_res = []
    for pt in (pool.pool_teams or []):
        teams_res.append(
            PoolTeamResponse(
                id=pt.id,
                pool_id=pt.pool_id,
                team_id=pt.team_id,
                team_name=pt.team.name if pt.team else None,
                seed=pt.seed if pt.seed is not None else (pt.team.seed if pt.team else None),
                created_at=pt.created_at,
            )
        )
    return PoolResponse(
        id=pool.id,
        tournament_id=pool.tournament_id,
        name=pool.name,
        display_order=pool.display_order,
        teams_count=len(teams_res),
        pool_teams=teams_res,
        created_at=pool.created_at,
        updated_at=pool.updated_at,
    )


# ─── Competition Service ──────────────────────────────────────────────────────

class CompetitionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.competition_repo = CompetitionRepository(db)
        self.tournament_repo = TournamentRepository(db)
        self.registration_repo = TournamentRegistrationRepository(db)
        self.player_membership_repo = ClubPlayerMembershipRepository(db)
        self.court_repo = CourtRepository(db)

    # ─── Internal Helpers ────────────────────────────────────────────────────

    async def _get_tournament_or_404(
        self, tournament_id: uuid.UUID, club_id: uuid.UUID
    ):
        tournament = await self.tournament_repo.get_by_id_minimal(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )
        return tournament

    def _assert_round_robin(self, tournament) -> None:
        if tournament.format != TournamentFormat.ROUND_ROBIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"This operation is only available for Round Robin tournaments "
                    f"(tournament format is '{tournament.format.value}')"
                ),
            )

    def _assert_pool_play(self, tournament) -> None:
        if tournament.format != TournamentFormat.POOL_PLAY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"This operation is only available for Pool Play tournaments "
                    f"(tournament format is '{tournament.format.value}')"
                ),
            )

    def _assert_round_robin_or_pool_play(self, tournament) -> None:
        if tournament.format not in (
            TournamentFormat.ROUND_ROBIN,
            TournamentFormat.POOL_PLAY,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"This operation is only available for Round Robin and Pool Play tournaments "
                    f"(tournament format is '{tournament.format.value}')"
                ),
            )

    def _assert_scramble(self, tournament) -> None:
        if tournament.format != TournamentFormat.SCRAMBLE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"This operation is only available for Scramble tournaments "
                    f"(tournament format is '{tournament.format.value}')"
                ),
            )

    def _assert_bracket(self, tournament) -> None:
        if tournament.format != TournamentFormat.BRACKET:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"This operation is only available for Bracket tournaments "
                    f"(tournament format is '{tournament.format.value}')"
                ),
            )

    def _assert_team_based_format(self, tournament) -> None:
        """Assert format is one that uses fixed Team/TeamMember model (RR, Pool Play, Bracket)."""
        if tournament.format not in (
            TournamentFormat.ROUND_ROBIN,
            TournamentFormat.POOL_PLAY,
            TournamentFormat.BRACKET,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Team management is not available for tournament format '{tournament.format.value}'. "
                    f"Use Round Robin, Pool Play, or Bracket formats."
                ),
            )

    def _get_tournament_team_size(self, tournament) -> int:
        """Return expected team size (1 for Singles, 2 for Doubles)."""
        config = tournament.format_configuration or {}
        if "team_size" in config and config["team_size"] is not None:
            return int(config["team_size"])
        category = str(config.get("category", "")).lower()
        if "singles" in category:
            return 1
        desc = (tournament.description or "").lower()
        if "singles" in desc:
            return 1
        return 2

    def _assert_supports_match_scoring(self, tournament) -> None:
        if tournament.format not in (
            TournamentFormat.ROUND_ROBIN,
            TournamentFormat.POOL_PLAY,
            TournamentFormat.SCRAMBLE,
            TournamentFormat.BRACKET,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Match scoring is not supported for tournament format '{tournament.format.value}'"
                ),
            )


    def _assert_registration_closed_or_later(self, tournament) -> None:
        allowed = {
            TournamentStatus.REGISTRATION_CLOSED,
            TournamentStatus.IN_PROGRESS,
        }
        if tournament.status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Registration must be closed before managing teams/matches "
                    f"(current status: '{tournament.status.value}')"
                ),
            )

    def _assert_not_completed_or_cancelled(self, tournament) -> None:
        if tournament.status in (TournamentStatus.COMPLETED, TournamentStatus.CANCELLED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tournament is '{tournament.status.value}' — no further modifications allowed",
            )

    async def _assert_no_matches_generated(self, tournament_id: uuid.UUID) -> None:
        count = await self.competition_repo.count_all_matches(tournament_id)
        if count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Teams cannot be modified after matches have been generated",
            )

    # ─── Team Operations ─────────────────────────────────────────────────────

    async def list_teams(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> list[TeamResponse]:
        await self._get_tournament_or_404(tournament_id, club_id)
        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        return [_build_team_response(t) for t in teams]

    async def create_team(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        payload: TeamCreate,
    ) -> TeamResponse:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_team_based_format(tournament)
        self._assert_not_completed_or_cancelled(tournament)
        await self._assert_no_matches_generated(tournament_id)

        # Validate team member count (1 for Singles, 2 for Doubles)
        expected_size = self._get_tournament_team_size(tournament)
        if len(payload.player_membership_ids) != expected_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Teams must have exactly {expected_size} player{'s' if expected_size > 1 else ''}",
            )

        # Validate no duplicates in the provided list
        if len(set(payload.player_membership_ids)) != expected_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate player membership IDs in team creation request",
            )

        # Validate each member: confirmed registration + correct club
        for pm_id in payload.player_membership_ids:
            await self._validate_team_member(tournament_id, club_id, pm_id)

        # Create team
        team = await self.competition_repo.create_team(
            tournament_id=tournament_id,
            name=payload.name,
            seed=payload.seed,
        )

        # Add members
        for pm_id in payload.player_membership_ids:
            await self.competition_repo.create_team_member(
                team_id=team.id,
                player_membership_id=pm_id,
            )

        team_id = team.id
        await self.db.commit()
        refreshed = await self.competition_repo.get_team(team_id)
        return _build_team_response(refreshed)  # type: ignore

    async def update_team(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        team_id: uuid.UUID,
        payload: TeamUpdate,
    ) -> TeamResponse:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_team_based_format(tournament)
        self._assert_not_completed_or_cancelled(tournament)
        await self._assert_no_matches_generated(tournament_id)

        team = await self.competition_repo.get_team_in_tournament(team_id, tournament_id)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found in this tournament",
            )

        update_fields: dict = {}
        if payload.name is not None:
            update_fields["name"] = payload.name
        if payload.seed is not None:
            update_fields["seed"] = payload.seed

        if payload.player_membership_ids is not None:
            expected_size = self._get_tournament_team_size(tournament)
            if len(set(payload.player_membership_ids)) != expected_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Teams must have exactly {expected_size} unique player{'s' if expected_size > 1 else ''}",
                )
            for pm_id in payload.player_membership_ids:
                await self._validate_team_member(
                    tournament_id, club_id, pm_id, exclude_team_id=team_id
                )
            # Replace members
            await self.competition_repo.delete_team_members(team_id)
            for pm_id in payload.player_membership_ids:
                await self.competition_repo.create_team_member(
                    team_id=team_id,
                    player_membership_id=pm_id,
                )

        if update_fields:
            await self.competition_repo.update_team(team, **update_fields)

        await self.db.commit()
        refreshed = await self.competition_repo.get_team(team_id)
        return _build_team_response(refreshed)  # type: ignore

    async def delete_team(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> None:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_team_based_format(tournament)
        self._assert_not_completed_or_cancelled(tournament)
        await self._assert_no_matches_generated(tournament_id)

        team = await self.competition_repo.get_team_in_tournament(team_id, tournament_id)
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found in this tournament",
            )

        await self.competition_repo.delete_team(team)
        await self.db.commit()

    async def _validate_team_member(
        self,
        tournament_id: uuid.UUID,
        club_id: uuid.UUID,
        player_membership_id: uuid.UUID,
        exclude_team_id: uuid.UUID | None = None,
    ) -> None:
        """
        Validate that a player_membership can be added to a team:
        1. Player membership exists and belongs to this club.
        2. Player has a confirmed registration in this tournament.
        3. Player is not already on another team in this tournament.
        """
        pm = await self.player_membership_repo.get_by_id(player_membership_id)
        if not pm or pm.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Player membership {player_membership_id} not found in this club",
            )
        if pm.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Player membership {player_membership_id} is not active",
            )

        reg = await self.registration_repo.get_by_tournament_and_player(
            tournament_id=tournament_id,
            player_membership_id=player_membership_id,
        )
        if not reg or reg.status != RegistrationStatus.CONFIRMED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Player membership {player_membership_id} does not have "
                    f"a confirmed registration in this tournament"
                ),
            )

        existing_team = await self.competition_repo.get_player_team_in_tournament(
            tournament_id=tournament_id,
            player_membership_id=player_membership_id,
        )
        if existing_team and existing_team.id != exclude_team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Player membership {player_membership_id} is already "
                    f"on team '{existing_team.name}' in this tournament"
                ),
            )

    async def _auto_generate_teams_from_registrations(self, tournament: Tournament) -> list["Team"]:
        """
        Auto-generates Team records from confirmed registrations.
        Pairs players sequentially for doubles categories.
        """
        regs = await self.registration_repo.list_by_tournament(tournament.id)
        confirmed = [r for r in regs if r.status == RegistrationStatus.CONFIRMED]

        if not confirmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot generate competition: no confirmed registrations.",
            )

        cat = (tournament.format_configuration or {}).get("category", "Singles")
        is_doubles = "Doubles" in cat
        team_size = 2 if is_doubles else 1

        if is_doubles and len(confirmed) % 2 != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot automatically pair an odd number of players ({len(confirmed)}) for a Doubles tournament.",
            )

        # Sort by registration date to pair deterministically (e.g. first two register = Team 1)
        confirmed.sort(key=lambda x: x.registered_at)

        created_teams = []
        for i in range(0, len(confirmed), team_size):
            group = confirmed[i:i + team_size]
            names = []
            for r in group:
                pm = await self.player_membership_repo.get_by_id(r.player_membership_id)
                user = pm.user if pm and hasattr(pm, "user") else None
                profile = user.player_profile if user and hasattr(user, "player_profile") else None
                name = profile.display_name if profile and profile.display_name else (user.full_name if user and user.full_name else (user.email if user else "Player"))
                names.append(name)

            team_name = " & ".join(names) if is_doubles else names[0]
            team = await self.competition_repo.create_team(
                tournament_id=tournament.id,
                name=team_name,
                seed=None
            )
            for r in group:
                await self.competition_repo.create_team_member(
                    team_id=team.id,
                    player_membership_id=r.player_membership_id
                )
            created_teams.append(team)

        await self.db.commit()
        # Fetch fully hydrated teams
        return await self.competition_repo.list_teams_by_tournament(tournament.id)

    async def _calculate_team_rating(self, team: Team) -> float:
        """Calculate average rating for a team based on its members' player profiles."""
        ratings = []
        for m in (team.members or []):
            pm = m.player_membership
            user = pm.user if pm and hasattr(pm, "user") else None
            profile = user.player_profile if user and hasattr(user, "player_profile") else None
            if profile and profile.skill_rating is not None:
                ratings.append(float(profile.skill_rating))
            else:
                ratings.append(3.5)
        if not ratings:
            return 3.5
        return round(sum(ratings) / len(ratings), 2)

    async def _seed_teams_by_rating(self, tournament_id: uuid.UUID) -> list[Team]:
        """Sort teams by average skill rating descending and assign seeds 1..N."""
        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        if not teams:
            return []

        team_ratings = []
        for t in teams:
            rating = await self._calculate_team_rating(t)
            team_ratings.append((t, rating))

        team_ratings.sort(
            key=lambda item: (
                -item[1],
                item[0].seed if item[0].seed is not None else 9999,
                (
                    item[0].created_at.timestamp()
                    if item[0].created_at
                    else 0.0
                ),
                item[0].name or "",
            )
        )

        for seed_num, (team, _) in enumerate(team_ratings, start=1):
            await self.competition_repo.update_team(team, seed=seed_num)

        await self.db.commit()
        return await self.competition_repo.list_teams_by_tournament(tournament_id)

    async def finalize_registrations_and_seed(self, tournament: Tournament) -> list[Team]:
        """
        Ensure all confirmed registrations are mapped to teams (1 per team for Singles,
        2 per team for Doubles), and all teams are seeded by skill rating descending.
        """
        teams = await self.competition_repo.list_teams_by_tournament(tournament.id)
        regs = await self.registration_repo.list_by_tournament(tournament.id)
        confirmed = [r for r in regs if r.status == RegistrationStatus.CONFIRMED]

        if not confirmed and not teams:
            return []

        assigned_pm_ids = {
            m.player_membership_id
            for t in teams
            for m in (t.members or [])
        }
        unassigned = [r for r in confirmed if r.player_membership_id not in assigned_pm_ids]

        if unassigned:
            expected_size = self._get_tournament_team_size(tournament)
            unassigned.sort(key=lambda x: x.registered_at.timestamp() if x.registered_at else 0.0)

            for i in range(0, len(unassigned), expected_size):
                group = unassigned[i:i + expected_size]
                names = []
                for r in group:
                    pm = await self.player_membership_repo.get_by_id(r.player_membership_id)
                    user = pm.user if pm and hasattr(pm, "user") else None
                    profile = user.player_profile if user and hasattr(user, "player_profile") else None
                    name = (
                        profile.display_name
                        if profile and profile.display_name
                        else (user.full_name if user and user.full_name else "Player")
                    )
                    names.append(name)
                team_name = " & ".join(names) if len(names) > 1 else names[0]
                new_team = await self.competition_repo.create_team(
                    tournament_id=tournament.id,
                    name=team_name,
                    seed=None,
                )
                for r in group:
                    await self.competition_repo.create_team_member(
                        team_id=new_team.id,
                        player_membership_id=r.player_membership_id,
                    )
            await self.db.commit()

        # Seed all teams by rating descending
        return await self._seed_teams_by_rating(tournament.id)

    # ─── Round Robin Generation ───────────────────────────────────────────────

    async def generate_round_robin(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> GenerationResponse:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_round_robin(tournament)

        if tournament.status != TournamentStatus.REGISTRATION_CLOSED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Round Robin generation requires tournament status "
                    f"'registration_closed' (current: '{tournament.status.value}')"
                ),
            )

        existing_matches = await self.competition_repo.count_all_matches(tournament_id)
        if existing_matches > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Matches already generated. Use regenerate-round-robin "
                    "to rebuild (only allowed before any results are entered)."
                ),
            )

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        if not teams:
            teams = await self._auto_generate_teams_from_registrations(tournament)

        self._validate_teams_for_generation(tournament, teams)

        team_ids = [t.id for t in teams]
        engine = RoundRobinEngine()
        slots = engine.generate_schedule(team_ids)

        active_courts = await self.court_repo.list_by_club(club_id, is_active=True)
        match_dicts = [
            {
                "tournament_id": tournament_id,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "round_number": s.round_number,
                "match_number": s.match_number,
                "court_id": (
                    active_courts[(s.match_number - 1) % len(active_courts)].id
                    if active_courts
                    else None
                ),
            }
            for s in slots
        ]
        await self.competition_repo.create_matches_bulk(match_dicts)

        await self.tournament_repo.update(
            tournament, status=TournamentStatus.IN_PROGRESS
        )
        await self.db.commit()

        rounds_count = max(s.round_number for s in slots) if slots else 0
        return GenerationResponse(
            tournament_id=tournament_id,
            teams_count=len(teams),
            matches_generated=len(slots),
            rounds_count=rounds_count,
            message=(
                f"Generated {len(slots)} matches across {rounds_count} rounds "
                f"for {len(teams)} teams."
            ),
        )

    async def regenerate_round_robin(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> GenerationResponse:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_round_robin(tournament)

        if tournament.status not in (
            TournamentStatus.REGISTRATION_CLOSED,
            TournamentStatus.IN_PROGRESS,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Regeneration requires tournament in registration_closed or in_progress status",
            )

        completed = await self.competition_repo.count_completed_matches(tournament_id)
        if completed > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot regenerate: {completed} match result(s) already recorded. "
                    "Remove results before regenerating."
                ),
            )

        deleted = await self.competition_repo.delete_pending_matches(tournament_id)

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        self._validate_teams_for_generation(tournament, teams)

        team_ids = [t.id for t in teams]
        engine = RoundRobinEngine()
        slots = engine.generate_schedule(team_ids)

        active_courts = await self.court_repo.list_by_club(club_id, is_active=True)
        match_dicts = [
            {
                "tournament_id": tournament_id,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "round_number": s.round_number,
                "match_number": s.match_number,
                "court_id": (
                    active_courts[(s.match_number - 1) % len(active_courts)].id
                    if active_courts
                    else None
                ),
            }
            for s in slots
        ]
        await self.competition_repo.create_matches_bulk(match_dicts)

        if tournament.status == TournamentStatus.REGISTRATION_CLOSED:
            await self.tournament_repo.update(
                tournament, status=TournamentStatus.IN_PROGRESS
            )
        await self.db.commit()

        rounds_count = max(s.round_number for s in slots) if slots else 0
        return GenerationResponse(
            tournament_id=tournament_id,
            teams_count=len(teams),
            matches_generated=len(slots),
            rounds_count=rounds_count,
            message=(
                f"Regenerated {len(slots)} matches ({deleted} pending deleted) "
                f"across {rounds_count} rounds for {len(teams)} teams."
            ),
        )

    def _validate_teams_for_generation(self, tournament, teams: list) -> None:
        if len(teams) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Round Robin requires at least 2 teams "
                    f"({len(teams)} found). Create teams before generating."
                ),
            )
        expected_size = self._get_tournament_team_size(tournament)
        for team in teams:
            if len(team.members) != expected_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Team '{team.name}' has {len(team.members)} member(s). "
                        f"All teams must have exactly {expected_size} player{'s' if expected_size > 1 else ''}."
                    ),
                )

    # ─── Pool Play Operations (Phase 6) ───────────────────────────────────────

    async def configure_pools(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        payload: PoolConfigureRequest,
    ) -> list[PoolResponse]:
        """Configure pools and qualifiers count for a pool_play tournament."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_pool_play(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        completed = await self.competition_repo.count_completed_matches(tournament_id)
        if completed > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot configure pools: {completed} match result(s) already recorded.",
            )

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        engine = PoolPlayEngine()
        if teams:
            try:
                engine.validate_pool_configuration(
                    len(teams), payload.number_of_pools, payload.qualifiers_per_pool
                )
            except PoolConfigurationError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(e),
                ) from e
        else:
            if payload.number_of_pools < 2 or payload.qualifiers_per_pool < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Number of pools must be >= 2 and qualifiers per pool >= 1",
                )

        if payload.pool_names:
            if len(payload.pool_names) != payload.number_of_pools:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Expected {payload.number_of_pools} pool names, got {len(payload.pool_names)}",
                )
            pool_names = payload.pool_names
        else:
            pool_names = [f"Pool {chr(65 + i)}" for i in range(payload.number_of_pools)]

        # Save configuration to tournament (merge with existing)
        config = dict(tournament.format_configuration or {})
        config.update({
            "number_of_pools": payload.number_of_pools,
            "qualifiers_per_pool": payload.qualifiers_per_pool,
        })
        await self.tournament_repo.update(tournament, format_configuration=config)

        # Clean existing pending matches, pool teams, and pools
        await self.competition_repo.delete_pending_matches(tournament_id)
        await self.competition_repo.delete_pool_teams_by_tournament(tournament_id)
        await self.competition_repo.delete_pools_by_tournament(tournament_id)

        # Create new pools
        pools = await self.competition_repo.create_pools_bulk(tournament_id, pool_names)

        # If teams already exist, auto-distribute serpentine
        if teams:
            team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
            pool_names_list = [p.name for p in pools]
            dist = engine.distribute_teams_serpentine(team_dicts, pool_names_list)
            pool_name_to_pool = {p.name: p for p in pools}
            assignments = []
            for p_name, assigned_teams in dist.items():
                target_pool = pool_name_to_pool[p_name]
                for seed_in_pool, t in enumerate(assigned_teams, start=1):
                    assignments.append({
                        "pool_id": target_pool.id,
                        "team_id": t["id"],
                        "seed": seed_in_pool,
                    })
            await self.competition_repo.assign_teams_to_pools_bulk(assignments)

        await self.db.commit()
        refreshed_pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        return [_build_pool_response(p) for p in refreshed_pools]

    async def list_pools(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> list[PoolResponse]:
        await self._get_tournament_or_404(tournament_id, club_id)
        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        return [_build_pool_response(p) for p in pools]

    async def assign_teams_serpentine(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> list[PoolResponse]:
        """Automatically distribute teams across configured pools using Serpentine distribution."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_pool_play(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        completed = await self.competition_repo.count_completed_matches(tournament_id)
        if completed > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reassign teams: match results already recorded.",
            )

        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        if not pools or len(pools) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pools must be configured before assigning teams.",
            )

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        if not teams:
            teams = await self._auto_generate_teams_from_registrations(tournament)

        config = tournament.format_configuration or {}
        qualifiers_per_pool = config.get("qualifiers_per_pool", 2)

        engine = PoolPlayEngine()
        try:
            engine.validate_pool_configuration(len(teams), len(pools), qualifiers_per_pool)
        except PoolConfigurationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

        # Remove existing pending matches and assignments
        await self.competition_repo.delete_pending_matches(tournament_id)
        await self.competition_repo.delete_pool_teams_by_tournament(tournament_id)

        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
        pool_names = [p.name for p in pools]
        dist = engine.distribute_teams_serpentine(team_dicts, pool_names)
        pool_name_to_pool = {p.name: p for p in pools}
        assignments = []
        for p_name, assigned_teams in dist.items():
            target_pool = pool_name_to_pool[p_name]
            for seed_in_pool, t in enumerate(assigned_teams, start=1):
                assignments.append({
                    "pool_id": target_pool.id,
                    "team_id": t["id"],
                    "seed": seed_in_pool,
                })
        await self.competition_repo.assign_teams_to_pools_bulk(assignments)
        await self.db.commit()

        refreshed = await self.competition_repo.list_pools_by_tournament(tournament_id)
        return [_build_pool_response(p) for p in refreshed]

    async def assign_teams_manual(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        payload: PoolManualAssignRequest,
    ) -> list[PoolResponse]:
        """Manually assign teams to pools with strict balance validation."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_pool_play(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        completed = await self.competition_repo.count_completed_matches(tournament_id)
        if completed > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reassign teams: match results already recorded.",
            )

        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        if not pools or len(pools) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pools must be configured before assigning teams.",
            )
        pool_map = {p.id: p for p in pools}

        # Check valid pools
        for a in payload.assignments:
            if a.pool_id not in pool_map:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Pool {a.pool_id} does not belong to this tournament.",
                )

        # Check unique teams
        assigned_team_ids = [a.team_id for a in payload.assignments]
        if len(assigned_team_ids) != len(set(assigned_team_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A team cannot be assigned to multiple pools.",
            )

        all_teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        valid_team_ids = {t.id for t in all_teams}
        for tid in assigned_team_ids:
            if tid not in valid_team_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Team {tid} does not belong to this tournament.",
                )

        # Check balance rules
        counts: dict[uuid.UUID, int] = {p.id: 0 for p in pools}
        for a in payload.assignments:
            counts[a.pool_id] += 1

        sizes = list(counts.values())
        if any(s == 0 for s in sizes):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Every configured pool must have at least one team assigned.",
            )
        if max(sizes) - min(sizes) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Pool sizes are unbalanced (max: {max(sizes)}, min: {min(sizes)}, diff must be <= 1).",
            )

        config = tournament.format_configuration or {}
        qualifiers_per_pool = config.get("qualifiers_per_pool", 2)
        if qualifiers_per_pool > min(sizes):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Qualifiers per pool ({qualifiers_per_pool}) exceeds "
                    f"minimum pool size ({min(sizes)})."
                ),
            )

        await self.competition_repo.delete_pending_matches(tournament_id)
        await self.competition_repo.delete_pool_teams_by_tournament(tournament_id)

        # Auto-compute seed in pool (order of appearance)
        pool_counters: dict[uuid.UUID, int] = {p.id: 0 for p in pools}
        assignments_dicts = []
        for a in payload.assignments:
            pool_counters[a.pool_id] += 1
            assignments_dicts.append({
                "pool_id": a.pool_id,
                "team_id": a.team_id,
                "seed": pool_counters[a.pool_id],
            })

        await self.competition_repo.assign_teams_to_pools_bulk(assignments_dicts)
        await self.db.commit()

        refreshed = await self.competition_repo.list_pools_by_tournament(tournament_id)
        return [_build_pool_response(p) for p in refreshed]

    async def generate_pool_play(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> PoolPlayGenerationResponse:
        """Generate isolated Round Robin matches for all pools."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_pool_play(tournament)

        existing_matches = await self.competition_repo.count_all_matches(tournament_id)
        if existing_matches > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Matches already generated. Use regenerate-pool-play "
                    "to rebuild (only allowed before any results are entered)."
                ),
            )

        if tournament.status != TournamentStatus.REGISTRATION_CLOSED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Pool Play generation requires tournament status 'registration_closed' "
                    f"(current: '{tournament.status.value}')"
                ),
            )

        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        if not pools or len(pools) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least 2 pools must be configured before generating matches.",
            )

        pool_teams_map: dict[uuid.UUID, list[uuid.UUID]] = {}
        total_teams = 0
        for p in pools:
            tids = [pt.team_id for pt in p.pool_teams]
            if len(tids) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Pool '{p.name}' has fewer than 2 teams. All pools must have >= 2 teams.",
                )
            pool_teams_map[p.id] = tids
            total_teams += len(tids)

        engine = PoolPlayEngine()
        slots = engine.generate_pool_matches(pool_teams_map)

        match_dicts = [
            {
                "tournament_id": tournament_id,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "round_number": s.round_number,
                "match_number": s.match_number,
                "stage": MatchStage.POOL,
                "pool_id": s.pool_id,
            }
            for s in slots
        ]
        await self.competition_repo.create_matches_bulk(match_dicts)

        await self.tournament_repo.update(
            tournament, status=TournamentStatus.IN_PROGRESS
        )
        await self.db.commit()

        return PoolPlayGenerationResponse(
            tournament_id=tournament_id,
            pools_count=len(pools),
            teams_count=total_teams,
            matches_generated=len(slots),
            message=f"Generated {len(slots)} pool stage matches across {len(pools)} pools for {total_teams} teams.",
        )

    async def regenerate_pool_play(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> PoolPlayGenerationResponse:
        """Regenerate pool stage matches — only allowed before any pool results entered."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_pool_play(tournament)

        if tournament.status not in (
            TournamentStatus.REGISTRATION_CLOSED,
            TournamentStatus.IN_PROGRESS,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Regeneration requires tournament in registration_closed or in_progress status",
            )

        completed = await self.competition_repo.count_completed_matches_by_stage(
            tournament_id, MatchStage.POOL
        )
        if completed > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot regenerate: {completed} pool match result(s) already recorded. "
                    "Remove results before regenerating."
                ),
            )

        # Delete any pending championship matches and pending pool matches
        await self.competition_repo.delete_pending_matches_by_stage(
            tournament_id, MatchStage.CHAMPIONSHIP
        )
        deleted = await self.competition_repo.delete_pending_matches_by_stage(
            tournament_id, MatchStage.POOL
        )

        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        pool_teams_map: dict[uuid.UUID, list[uuid.UUID]] = {}
        total_teams = 0
        for p in pools:
            tids = [pt.team_id for pt in p.pool_teams]
            if len(tids) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Pool '{p.name}' has fewer than 2 teams.",
                )
            pool_teams_map[p.id] = tids
            total_teams += len(tids)

        engine = PoolPlayEngine()
        slots = engine.generate_pool_matches(pool_teams_map)

        match_dicts = [
            {
                "tournament_id": tournament_id,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "round_number": s.round_number,
                "match_number": s.match_number,
                "stage": MatchStage.POOL,
                "pool_id": s.pool_id,
            }
            for s in slots
        ]
        await self.competition_repo.create_matches_bulk(match_dicts)

        if tournament.status == TournamentStatus.REGISTRATION_CLOSED:
            await self.tournament_repo.update(
                tournament, status=TournamentStatus.IN_PROGRESS
            )
        await self.db.commit()

        return PoolPlayGenerationResponse(
            tournament_id=tournament_id,
            pools_count=len(pools),
            teams_count=total_teams,
            matches_generated=len(slots),
            message=f"Regenerated {len(slots)} pool stage matches ({deleted} deleted) across {len(pools)} pools.",
        )

    async def get_pool_standings(
        self,
        club_id: uuid.UUID | None,
        tournament_id: uuid.UUID,
        pool_id: uuid.UUID | None = None,
    ) -> AllPoolsStandingsResponse | PoolStandingsResponse:
        """Derive standings independently for each pool or a single pool."""
        if club_id is not None:
            tournament = await self._get_tournament_or_404(tournament_id, club_id)
        else:
            tournament = await self.tournament_repo.get_by_id(tournament_id)
            if not tournament:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tournament not found",
                )

        config = tournament.format_configuration or {}
        qualifiers_per_pool = config.get("qualifiers_per_pool", 2)

        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        if pool_id is not None:
            pools = [p for p in pools if p.id == pool_id]
            if not pools:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pool not found in this tournament",
                )

        engine = PoolPlayEngine()
        all_results: list[PoolStandingsResponse] = []

        for p in pools:
            pt_list = await self.competition_repo.get_pool_teams(p.id)
            p_matches = await self.competition_repo.list_matches_by_pool(tournament_id, p.id)

            team_dicts = [
                {"id": pt.team.id, "name": pt.team.name, "seed": pt.seed}
                for pt in pt_list
                if pt.team
            ]
            match_dicts = [
                {
                    "team_a_id": m.team_a_id,
                    "team_b_id": m.team_b_id,
                    "score_a": m.score_a,
                    "score_b": m.score_b,
                    "winner_team_id": m.winner_team_id,
                    "status": m.status.value,
                }
                for m in p_matches
            ]

            rows = engine.calculate_pool_standings(team_dicts, match_dicts)
            is_pool_finished = bool(p_matches) and all(m.status == MatchStatus.COMPLETED for m in p_matches)
            pool_standing_rows = [
                PoolStandingRow(
                    rank=r.rank,
                    team_id=r.team_id,
                    team_name=r.team_name,
                    team_seed=r.team_seed,
                    wins=r.wins,
                    losses=r.losses,
                    matches_played=r.matches_played,
                    points_scored=r.points_scored,
                    points_allowed=r.points_allowed,
                    points_differential=r.points_differential,
                    pool_id=p.id,
                    pool_name=p.name,
                    qualified=bool(is_pool_finished and (r.rank <= qualifiers_per_pool)),
                )
                for r in rows
            ]
            all_results.append(
                PoolStandingsResponse(
                    tournament_id=tournament_id,
                    pool_id=p.id,
                    pool_name=p.name,
                    standings=pool_standing_rows,
                )
            )

        if pool_id is not None:
            return all_results[0]
        return AllPoolsStandingsResponse(tournament_id=tournament_id, pools=all_results)

    async def generate_championship(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> ChampionshipGenerationResponse:
        """Generate single-elimination knockout bracket from completed pool standings."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_pool_play(tournament)

        if tournament.status != TournamentStatus.IN_PROGRESS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tournament must be in progress to generate championship bracket (current: '{tournament.status.value}')",
            )

        # Check all pool stage matches are completed
        pool_matches = await self.competition_repo.list_matches_by_stage(
            tournament_id, MatchStage.POOL
        )
        if not pool_matches:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pool stage matches have not been generated yet.",
            )

        pending_pool = [m for m in pool_matches if m.status != MatchStatus.COMPLETED]
        if pending_pool:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"All pool stage matches must be completed before generating championship bracket ({len(pending_pool)} match(es) pending).",
            )

        # Check if championship matches already exist
        existing_champ = await self.competition_repo.count_matches_by_stage(
            tournament_id, MatchStage.CHAMPIONSHIP
        )
        if existing_champ > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Championship bracket has already been generated.",
            )

        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        config = tournament.format_configuration or {}
        qualifiers_per_pool = config.get("qualifiers_per_pool", 2)

        engine = PoolPlayEngine()
        all_pool_standings: dict[uuid.UUID, list] = {}
        for p in pools:
            pt_list = await self.competition_repo.get_pool_teams(p.id)
            p_matches = await self.competition_repo.list_matches_by_pool(tournament_id, p.id)
            team_dicts = [
                {"id": pt.team.id, "name": pt.team.name, "seed": pt.seed}
                for pt in pt_list
                if pt.team
            ]
            m_dicts = [
                {
                    "team_a_id": m.team_a_id,
                    "team_b_id": m.team_b_id,
                    "score_a": m.score_a,
                    "score_b": m.score_b,
                    "winner_team_id": m.winner_team_id,
                    "status": m.status.value,
                }
                for m in p_matches
            ]
            all_pool_standings[p.id] = engine.calculate_pool_standings(team_dicts, m_dicts)

        try:
            qualifiers = engine.determine_qualifiers(all_pool_standings, qualifiers_per_pool)
            offset = len(pool_matches) + 1
            bracket_matches = engine.generate_championship_bracket(
                tournament_id, qualifiers, match_number_offset=offset
            )
        except (PoolConfigurationError, ChampionshipError) as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

        await self.competition_repo.create_matches_bulk(bracket_matches)
        await self.db.commit()

        bracket_size = 1 << (len(qualifiers) - 1).bit_length()
        if bracket_size < 2:
            bracket_size = 2
        total_rounds = int(math.log2(bracket_size))

        return ChampionshipGenerationResponse(
            tournament_id=tournament_id,
            qualifiers_count=len(qualifiers),
            rounds_count=total_rounds,
            matches_generated=len(bracket_matches),
            message=f"Generated championship bracket with {len(bracket_matches)} matches across {total_rounds} rounds for {len(qualifiers)} qualifiers.",
        )

    # ─── Match Operations ─────────────────────────────────────────────────────

    async def list_matches(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> list[MatchResponse]:
        await self._get_tournament_or_404(tournament_id, club_id)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        return [_build_match_response(m) for m in matches]

    async def list_pool_matches(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        pool_id: uuid.UUID | None = None,
    ) -> list[MatchResponse]:
        await self._get_tournament_or_404(tournament_id, club_id)
        if pool_id is not None:
            matches = await self.competition_repo.list_matches_by_pool(tournament_id, pool_id)
        else:
            matches = await self.competition_repo.list_matches_by_stage(
                tournament_id, MatchStage.POOL
            )
        return [_build_match_response(m) for m in matches]

    async def list_championship_matches(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> list[MatchResponse]:
        await self._get_tournament_or_404(tournament_id, club_id)
        matches = await self.competition_repo.list_matches_by_stage(
            tournament_id, MatchStage.CHAMPIONSHIP
        )
        return [_build_match_response(m) for m in matches]

    async def get_match(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID, match_id: uuid.UUID
    ) -> MatchResponse:
        await self._get_tournament_or_404(tournament_id, club_id)
        match = await self.competition_repo.get_match(match_id, tournament_id)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this tournament",
            )
        return _build_match_response(match)

    async def start_match(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID, match_id: uuid.UUID
    ) -> MatchResponse:
        """Start a match, advancing its status to in_progress."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        if tournament.status not in (
            TournamentStatus.IN_PROGRESS,
            TournamentStatus.REGISTRATION_CLOSED,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start match: tournament status is '{tournament.status.value}'.",
            )
        match = await self.competition_repo.get_match(match_id, tournament_id)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this tournament",
            )
        if match.status == MatchStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start an already completed match",
            )
        if match.status == MatchStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start a cancelled match",
            )
        if match.status == MatchStatus.IN_PROGRESS:
            return _build_match_response(match)

        # Scramble format check
        if tournament.format == TournamentFormat.SCRAMBLE:
            if not match.participants or len(match.participants) < 4:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot start Scramble match: must have all 4 participants assigned",
                )
        else:
            # Fixed-team or player formats (Bracket, Round Robin, Pool Play)
            if not match.team_a_id or not match.team_b_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot start match: both competitors must be determined first",
                )

        now = datetime.now(timezone.utc)
        await self.competition_repo.update_match(
            match,
            status=MatchStatus.IN_PROGRESS,
            scheduled_start_at=match.scheduled_start_at or now,
        )
        await self.db.commit()
        refreshed = await self.competition_repo.get_match(match_id, tournament_id)
        return _build_match_response(refreshed)  # type: ignore

    async def _handle_bye_auto_advancement(
        self,
        tournament_id: uuid.UUID,
        target_match: Match,
        target_slot: str,
        advancing_team_id: uuid.UUID,
        matches_meta: dict[str, Any],
    ) -> None:
        """
        If target_match has an opponent slot fed by a BYE (so no team will ever arrive),
        auto-complete target_match as a BYE and advance advancing_team_id downstream.
        """
        if target_match.status == MatchStatus.COMPLETED:
            return

        meta = matches_meta.get(str(target_match.id), {})
        feeder_a = meta.get("feeder_a") or {}
        feeder_b = meta.get("feeder_b") or {}

        fa_is_bye = (
            (isinstance(feeder_a, dict) and feeder_a.get("is_bye") is True)
            or (isinstance(feeder_a, dict) and feeder_a.get("label") == "BYE")
            or feeder_a == "BYE"
        )
        fb_is_bye = (
            (isinstance(feeder_b, dict) and feeder_b.get("is_bye") is True)
            or (isinstance(feeder_b, dict) and feeder_b.get("label") == "BYE")
            or feeder_b == "BYE"
        )

        other_is_bye = False
        if target_slot == "team_a" and fb_is_bye:
            other_is_bye = True
        elif target_slot == "team_b" and fa_is_bye:
            other_is_bye = True

        if other_is_bye:
            await self.competition_repo.update_match(
                target_match,
                winner_team_id=advancing_team_id,
                status=MatchStatus.COMPLETED,
                completed_at=datetime.now(timezone.utc),
            )
            meta["is_bye"] = True

            if target_match.next_match_id and target_match.next_match_slot:
                await self.competition_repo.advance_team_to_next_match(
                    target_match.next_match_id, target_match.next_match_slot, advancing_team_id
                )
                next_m = await self.competition_repo.get_match(target_match.next_match_id, tournament_id)
                if next_m:
                    await self._handle_bye_auto_advancement(
                        tournament_id, next_m, target_match.next_match_slot, advancing_team_id, matches_meta
                    )

    async def record_match_result(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        match_id: uuid.UUID,
        score_a: int,
        score_b: int,
    ) -> MatchResponse:
        """Record a new match result. Match must be pending."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_supports_match_scoring(tournament)

        if tournament.status == TournamentStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot record match result: tournament is already completed.",
            )

        match = await self.competition_repo.get_match(match_id, tournament_id)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this tournament",
            )

        if match.status == MatchStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Match result already recorded. Use PATCH .../result "
                    "to correct an existing result."
                ),
            )

        if match.status == MatchStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot record result for a cancelled match",
            )

        if tournament.format == TournamentFormat.SCRAMBLE:
            if not match.participants or len(match.participants) != 4:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot record score: Scramble match must have 4 participants assigned",
                )
            try:
                derive_winner_side(score_a, score_b, tournament.scoring_rules)
            except ScoreValidationError as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=str(e),
                ) from e
            winner_id = None
        else:
            if not match.team_a_id or not match.team_b_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot record score for a match that does not have both teams determined yet",
                )
            winner_id = await self._validate_and_derive_winner(
                match, score_a, score_b, tournament.scoring_rules
            )

        updated = await self.competition_repo.update_match(
            match,
            score_a=score_a,
            score_b=score_b,
            winner_team_id=winner_id,
            status=MatchStatus.COMPLETED,
            completed_at=datetime.now(timezone.utc),
        )

        # Championship bracket auto-advance (Pool Play championship stage)
        if match.stage == MatchStage.CHAMPIONSHIP:
            if match.next_match_id and match.next_match_slot:
                await self.competition_repo.advance_team_to_next_match(
                    match.next_match_id, match.next_match_slot, winner_id
                )

        # Standalone Bracket auto-advance
        if tournament.format == TournamentFormat.BRACKET and not match.stage:
            format_cfg = tournament.format_configuration or {}
            bracket_data = format_cfg.get("bracket_data", {})
            matches_meta = bracket_data.get("matches", {})
            match_meta = matches_meta.get(str(match.id), {})

            # 1. Advance winner
            if match.next_match_id and match.next_match_slot and winner_id:
                await self.competition_repo.advance_team_to_next_match(
                    match.next_match_id, match.next_match_slot, winner_id
                )
                next_m = await self.competition_repo.get_match(match.next_match_id, tournament_id)
                if next_m:
                    await self._handle_bye_auto_advancement(
                        tournament_id, next_m, match.next_match_slot, winner_id, matches_meta
                    )

            # 2. Advance loser (for consolation and double elimination)
            loser_id = match.team_b_id if winner_id == match.team_a_id else match.team_a_id
            loser_next_id = match_meta.get("loser_next_match_id")
            loser_next_slot = match_meta.get("loser_next_match_slot")
            if loser_next_id and loser_next_slot and loser_id:
                dest_uuid = uuid.UUID(loser_next_id)
                await self.competition_repo.advance_team_to_next_match(
                    dest_uuid, loser_next_slot, loser_id
                )
                loser_m = await self.competition_repo.get_match(dest_uuid, tournament_id)
                if loser_m:
                    await self._handle_bye_auto_advancement(
                        tournament_id, loser_m, loser_next_slot, loser_id, matches_meta
                    )

            # 3. Double elimination Grand Final & Reset Final handling
            label = match_meta.get("label", "")
            bracket_sec = match_meta.get("bracket_section", "")
            if label == "Grand Final" or bracket_sec == "grand_final":
                reset_final_id = None
                for m_id, m_info in matches_meta.items():
                    if m_info.get("label") == "Grand Final (Reset Match)" or m_info.get("bracket_section") == "reset_final":
                        reset_final_id = uuid.UUID(m_id)
                        break

                if reset_final_id:
                    reset_match = await self.competition_repo.get_match(reset_final_id, tournament_id)
                    if reset_match:
                        wb_slot = match_meta.get("wb_champion_slot", "team_a")
                        wb_team_id = match.team_a_id if wb_slot == "team_a" else match.team_b_id
                        if winner_id == wb_team_id:
                            # Undefeated WB winner won Grand Final -> No reset match needed, cancel it
                            await self.competition_repo.update_match(
                                reset_match,
                                status=MatchStatus.CANCELLED,
                                score_a=None,
                                score_b=None,
                                winner_team_id=None,
                            )
                        else:
                            # LB winner beat WB winner -> Reset Match must be played!
                            await self.competition_repo.update_match(
                                reset_match,
                                team_a_id=winner_id,
                                team_b_id=loser_id,
                                status=MatchStatus.PENDING,
                                score_a=None,
                                score_b=None,
                                winner_team_id=None,
                            )

        # Scramble round completion check
        if tournament.format == TournamentFormat.SCRAMBLE:
            config = dict(tournament.format_configuration or {})
            rounds_store = config.get("rounds_data")
            if rounds_store and isinstance(rounds_store, dict):
                current_round = config.get("current_round", 1)
                all_m = await self.competition_repo.list_match_statuses_by_tournament(tournament_id)
                round_matches = [m for m in all_m if m.round_number == current_round]
                if round_matches and all(m.status == MatchStatus.COMPLETED for m in round_matches):
                    if config.get("round_status") == "in_progress":
                        config["round_status"] = "completed"
                        if str(current_round) in rounds_store:
                            rounds_store[str(current_round)]["status"] = "completed"
                            config["rounds_data"] = rounds_store
                        flag_modified(tournament, "format_configuration")
                        await self.tournament_repo.update(tournament, format_configuration=config)

        # Standardized automatic tournament completion & winner evaluation for ALL formats
        await self._evaluate_and_persist_tournament_completion(tournament)

        await self.db.commit()
        refreshed = await self.competition_repo.get_match(match_id, tournament_id)
        resp = _build_match_response(refreshed)  # type: ignore
        format_cfg = tournament.format_configuration or {}
        meta = format_cfg.get("bracket_data", {}).get("matches", {}).get(str(match_id), {})
        if meta:
            all_m = await self.competition_repo.list_matches_by_tournament(tournament_id)
            id_map = {m.id: m.match_number for m in all_m}
            resp.bracket_section = meta.get("bracket_section")
            resp.label = meta.get("label")
            loser_id_str = meta.get("loser_next_match_id")
            loser_uuid = uuid.UUID(loser_id_str) if loser_id_str else None
            resp.loser_next_match_id = loser_uuid
            resp.loser_next_match_slot = meta.get("loser_next_match_slot")
            resp.winner_next_match_number = id_map.get(refreshed.next_match_id) if refreshed.next_match_id else None
            resp.loser_next_match_number = id_map.get(loser_uuid) if loser_uuid else None
            fa = meta.get("feeder_a")
            resp.feeder_a_label = fa.get("label") if isinstance(fa, dict) else (fa if isinstance(fa, str) else None)
            fb = meta.get("feeder_b")
            resp.feeder_b_label = fb.get("label") if isinstance(fb, dict) else (fb if isinstance(fb, str) else None)
            resp.is_conditional = meta.get("is_conditional", False)
        return resp

    async def correct_match_result(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        match_id: uuid.UUID,
        score_a: int,
        score_b: int,
    ) -> MatchResponse:
        """Correct an already-completed match result (authorized operation)."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_supports_match_scoring(tournament)

        if tournament.status == TournamentStatus.COMPLETED:
            format_cfg = tournament.format_configuration or {}
            match_meta = format_cfg.get("bracket_data", {}).get("matches", {}).get(str(match_id), {})
            b_sec = match_meta.get("bracket_section") or ""
            b_lbl = (match_meta.get("label") or "").lower()
            is_final_decider = (
                b_sec in ("grand_final", "reset_final")
                or "grand final" in b_lbl
                or "final" in b_lbl
                or match.next_match_id is None
            )
            if not is_final_decider:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot edit match result: tournament is already completed. Only final match results may be corrected.",
                )

        match = await self.competition_repo.get_match(match_id, tournament_id)
        if not match:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Match not found in this tournament",
            )

        if match.status != MatchStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Match is not completed (status: '{match.status.value}'). "
                    "Use POST .../result to record a new result."
                ),
            )

        if tournament.format == TournamentFormat.SCRAMBLE:
            if not match.participants or len(match.participants) != 4:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot record score: Scramble match must have 4 participants assigned",
                )
            try:
                derive_winner_side(score_a, score_b, tournament.scoring_rules)
            except ScoreValidationError as e:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=str(e),
                ) from e
            winner_id = None
        else:
            if not match.team_a_id or not match.team_b_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Both teams must be present to record a result",
                )
            winner_id = await self._validate_and_derive_winner(
                match, score_a, score_b, tournament.scoring_rules
            )

            # In championship bracket, if advancing winner changes, ensure next match hasn't already completed
            if match.stage == MatchStage.CHAMPIONSHIP and match.next_match_id:
                next_m = await self.competition_repo.get_match(match.next_match_id)
                if next_m and next_m.status == MatchStatus.COMPLETED:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot correct match result: subsequent championship match has already been completed.",
                    )
                if next_m and match.next_match_slot:
                    await self.competition_repo.advance_team_to_next_match(
                        match.next_match_id, match.next_match_slot, winner_id
                    )

            # In standalone Bracket, safety check and progression update
            if tournament.format == TournamentFormat.BRACKET and not match.stage:
                format_cfg = tournament.format_configuration or {}
                bracket_data = format_cfg.get("bracket_data", {})
                matches_meta = bracket_data.get("matches", {})
                match_meta = matches_meta.get(str(match.id), {})

                label = match_meta.get("label", "")
                bracket_sec = match_meta.get("bracket_section", "")
                is_grand_final = label == "Grand Final" or bracket_sec == "grand_final"

                if match.next_match_id:
                    next_m = await self.competition_repo.get_match(match.next_match_id, tournament_id)
                    if next_m and next_m.status == MatchStatus.COMPLETED and next_m.score_a is not None:
                        err_name = "reset final" if is_grand_final else "subsequent bracket match"
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Cannot correct match result: the {err_name} has already been "
                                "completed. Correct that result first before correcting this one."
                            ),
                        )
                    if is_grand_final and next_m:
                        wb_slot = match_meta.get("wb_champion_slot", "team_a")
                        wb_team_id = match.team_a_id if wb_slot == "team_a" else match.team_b_id
                        loser_id = match.team_b_id if winner_id == match.team_a_id else match.team_a_id
                        if winner_id == wb_team_id:
                            # Undefeated WB winner won GF -> Cancel Reset Final
                            await self.competition_repo.update_match(
                                next_m,
                                status=MatchStatus.CANCELLED,
                                score_a=None,
                                score_b=None,
                                winner_team_id=None,
                            )
                        else:
                            # LB winner won GF -> Reset Final must be played!
                            await self.competition_repo.update_match(
                                next_m,
                                team_a_id=winner_id,
                                team_b_id=loser_id,
                                status=MatchStatus.PENDING,
                                score_a=None,
                                score_b=None,
                                winner_team_id=None,
                            )
                            # Re-open tournament if it was marked COMPLETED
                            if tournament.status == TournamentStatus.COMPLETED:
                                tournament.status = TournamentStatus.IN_PROGRESS
                                cfg = dict(tournament.format_configuration or {})
                                cfg.pop("winner", None)
                                cfg.pop("podium", None)
                                cfg.pop("final_results", None)
                                tournament.format_configuration = cfg
                                flag_modified(tournament, "format_configuration")
                                await self.tournament_repo.update(
                                    tournament,
                                    status=TournamentStatus.IN_PROGRESS,
                                    format_configuration=cfg,
                                )
                    elif next_m and match.next_match_slot and winner_id:
                        await self.competition_repo.advance_team_to_next_match(
                            match.next_match_id, match.next_match_slot, winner_id
                        )

                loser_id = match.team_b_id if winner_id == match.team_a_id else match.team_a_id
                loser_next_id = match_meta.get("loser_next_match_id")
                loser_next_slot = match_meta.get("loser_next_match_slot")
                if loser_next_id and loser_next_slot and loser_id and not is_grand_final:
                    loser_m = await self.competition_repo.get_match(uuid.UUID(loser_next_id), tournament_id)
                    if loser_m and loser_m.status == MatchStatus.COMPLETED and loser_m.score_a is not None:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Cannot correct match result: the subsequent loser bracket match has already been completed.",
                        )
                    if loser_m:
                        await self.competition_repo.advance_team_to_next_match(
                            uuid.UUID(loser_next_id), loser_next_slot, loser_id
                        )

        updated = await self.competition_repo.update_match(
            match,
            score_a=score_a,
            score_b=score_b,
            winner_team_id=winner_id,
            completed_at=datetime.now(timezone.utc),
        )

        # Standardized automatic tournament completion & winner evaluation for ALL formats
        await self._evaluate_and_persist_tournament_completion(tournament)

        await self.db.commit()
        # Single refresh after commit to get fully-populated relationships for the response
        refreshed = await self.competition_repo.get_match(match_id, tournament_id)
        resp = _build_match_response(refreshed)  # type: ignore
        format_cfg = tournament.format_configuration or {}
        meta = format_cfg.get("bracket_data", {}).get("matches", {}).get(str(match_id), {})
        if meta:
            all_m = await self.competition_repo.list_matches_by_tournament(tournament_id)
            id_map = {m.id: m.match_number for m in all_m}
            resp.bracket_section = meta.get("bracket_section")
            resp.label = meta.get("label")
            loser_id_str = meta.get("loser_next_match_id")
            loser_uuid = uuid.UUID(loser_id_str) if loser_id_str else None
            resp.loser_next_match_id = loser_uuid
            resp.loser_next_match_slot = meta.get("loser_next_match_slot")
            resp.winner_next_match_number = id_map.get(refreshed.next_match_id) if refreshed.next_match_id else None
            resp.loser_next_match_number = id_map.get(loser_uuid) if loser_uuid else None
            fa = meta.get("feeder_a")
            resp.feeder_a_label = fa.get("label") if isinstance(fa, dict) else (fa if isinstance(fa, str) else None)
            fb = meta.get("feeder_b")
            resp.feeder_b_label = fb.get("label") if isinstance(fb, dict) else (fb if isinstance(fb, str) else None)
            resp.is_conditional = meta.get("is_conditional", False)
        return resp

    async def _evaluate_and_persist_tournament_completion(
        self, tournament: Tournament, force_scramble_end: bool = False
    ) -> bool:
        """
        Evaluate if all matches and stages for the tournament format are complete.
        If complete:
          - Calculates final standings / winner deterministically using the format engine
          - Persists winner & podium metadata to tournament.format_configuration
          - Transitions tournament status to COMPLETED
          - Dispatches real-time TOURNAMENT_UPDATED event over WebSockets to club & players
        Returns True if tournament completed, False otherwise.
        """
        tournament_id = tournament.id

        # ── Fast path: use a lightweight status-only query first ─────────────────
        # This avoids loading all match relationships (teams, members, participants)
        # just to determine whether the tournament might be finished.
        status_only_matches = await self.competition_repo.list_match_statuses_by_tournament(tournament_id)
        if not status_only_matches and not force_scramble_end:
            return False

        playable_status = [m for m in status_only_matches if m.status != MatchStatus.CANCELLED]
        all_completed_quick = bool(playable_status) and all(
            m.status == MatchStatus.COMPLETED for m in playable_status
        )

        # Short-circuit: if not all completed, skip the expensive full load
        if not all_completed_quick and not force_scramble_end:
            # For scramble with rounds_data, check round completion even if not all done
            if tournament.format == TournamentFormat.SCRAMBLE:
                config = dict(tournament.format_configuration or {})
                has_workspace = "rounds_data" in config or "round_status" in config
                if not has_workspace and not force_scramble_end:
                    return False
            else:
                return False

        # ── Full load: only runs when completion is plausible ────────────────────
        all_matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        if not all_matches and not force_scramble_end:
            return False

        playable_matches = [m for m in all_matches if m.status != MatchStatus.CANCELLED]
        all_completed = bool(playable_matches) and all(m.status == MatchStatus.COMPLETED for m in playable_matches)


        is_finished = False
        winner_info: dict | None = None
        podium_info: list[dict] = []

        if tournament.format == TournamentFormat.ROUND_ROBIN:
            if all_completed:
                is_finished = True
                teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
                team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
                match_dicts = [
                    {
                        "team_a_id": m.team_a_id,
                        "team_b_id": m.team_b_id,
                        "score_a": m.score_a,
                        "score_b": m.score_b,
                        "winner_team_id": m.winner_team_id,
                        "status": m.status.value,
                    }
                    for m in playable_matches
                ]
                engine = RoundRobinEngine()
                rows = engine.calculate_standings(team_dicts, match_dicts)
                team_map = {t.id: t for t in teams}
                team_size = self._get_tournament_team_size(tournament)
                for r in rows:
                    t_obj = team_map.get(r.team_id)
                    members = []
                    if t_obj and t_obj.members:
                        for tm in t_obj.members:
                            pm = tm.player_membership
                            u = pm.user if pm and hasattr(pm, "user") else None
                            p = u.player_profile if u and hasattr(u, "player_profile") else None
                            members.append(p.display_name if p and p.display_name else (u.full_name if u and u.full_name else "Player"))
                    podium_info.append({
                        "rank": r.rank,
                        "team_id": str(r.team_id),
                        "team_name": r.team_name,
                        "members": members,
                        "wins": r.wins,
                        "losses": r.losses,
                        "points_differential": r.points_differential,
                    })
                if podium_info:
                    champ = podium_info[0]
                    winner_info = {
                        "team_id": champ["team_id"],
                        "name": champ["team_name"],
                        "type": "team" if team_size > 1 else "player",
                        "members": champ["members"],
                        "display_name": champ["members"][0] if (team_size == 1 and champ["members"]) else champ["team_name"],
                    }

        elif tournament.format == TournamentFormat.BRACKET:
            if all_completed:
                format_cfg = tournament.format_configuration or {}
                bracket_data = format_cfg.get("bracket_data", {})
                pending_matches = [m for m in all_matches if m.status in (MatchStatus.PENDING, MatchStatus.IN_PROGRESS)]
                if not pending_matches:
                    is_finished = True
                    teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
                    team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
                    match_dicts = [
                        {
                            "team_a_id": m.team_a_id,
                            "team_b_id": m.team_b_id,
                            "score_a": m.score_a,
                            "score_b": m.score_b,
                            "winner_team_id": m.winner_team_id,
                            "status": m.status.value,
                            "label": bracket_data.get("matches", {}).get(str(m.id), {}).get("label"),
                            "bracket_section": bracket_data.get("matches", {}).get(str(m.id), {}).get("bracket_section"),
                            "bracket_round": m.bracket_round,
                        }
                        for m in playable_matches
                    ]
                    engine = BracketEngine()
                    bracket_format = format_cfg.get("bracket_format") or format_cfg.get("bracket_type") or "Single Elimination"
                    rows = engine.calculate_bracket_standings(team_dicts, match_dicts, bracket_format=bracket_format)
                    team_map = {t.id: t for t in teams}
                    team_size = self._get_tournament_team_size(tournament)
                    for r in rows:
                        t_obj = team_map.get(r["team_id"])
                        members = []
                        if t_obj and t_obj.members:
                            for tm in t_obj.members:
                                pm = tm.player_membership
                                u = pm.user if pm and hasattr(pm, "user") else None
                                p = u.player_profile if u and hasattr(u, "player_profile") else None
                                members.append(p.display_name if p and p.display_name else (u.full_name if u and u.full_name else "Player"))
                        podium_info.append({
                            "rank": r["rank"],
                            "team_id": str(r["team_id"]),
                            "team_name": r["team_name"],
                            "members": members,
                            "finish": r.get("status") or ("Champion" if str(r["rank"]) == "1" else ("Runner-Up" if str(r["rank"]) == "2" else "Participant")),
                        })
                    if podium_info:
                        champ = podium_info[0]
                        winner_info = {
                            "team_id": champ["team_id"],
                            "name": champ["team_name"],
                            "type": "team" if team_size > 1 else "player",
                            "members": champ["members"],
                            "display_name": champ["members"][0] if (team_size == 1 and champ["members"]) else champ["team_name"],
                        }

        elif tournament.format == TournamentFormat.POOL_PLAY:
            pool_matches = [m for m in playable_matches if m.stage == MatchStage.POOL]
            champ_matches = [m for m in playable_matches if m.stage == MatchStage.CHAMPIONSHIP]
            pool_done = bool(pool_matches) and all(m.status == MatchStatus.COMPLETED for m in pool_matches)

            if champ_matches:
                champ_done = all(m.status == MatchStatus.COMPLETED for m in champ_matches)
                if pool_done and champ_done:
                    is_finished = True
                    finals = [m for m in champ_matches if m.next_match_id is None]
                    final_match = finals[-1] if finals else champ_matches[-1]
                    winner_team_id = final_match.winner_team_id
                    runner_up_id = final_match.team_b_id if winner_team_id == final_match.team_a_id else final_match.team_a_id

                    teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
                    team_map = {t.id: t for t in teams}
                    team_size = self._get_tournament_team_size(tournament)

                    winner_team = team_map.get(winner_team_id)
                    runner_team = team_map.get(runner_up_id)

                    def get_mems(t_obj):
                        if not t_obj or not t_obj.members:
                            return []
                        m_list = []
                        for tm in t_obj.members:
                            pm = tm.player_membership
                            u = pm.user if pm and hasattr(pm, "user") else None
                            p = u.player_profile if u and hasattr(u, "player_profile") else None
                            m_list.append(p.display_name if p and p.display_name else (u.full_name if u and u.full_name else "Player"))
                        return m_list

                    if winner_team:
                        podium_info.append({
                            "rank": 1,
                            "team_id": str(winner_team.id),
                            "team_name": winner_team.name,
                            "members": get_mems(winner_team),
                            "finish": "Champion",
                        })
                        winner_info = {
                            "team_id": str(winner_team.id),
                            "name": winner_team.name,
                            "type": "team" if team_size > 1 else "player",
                            "members": get_mems(winner_team),
                            "display_name": get_mems(winner_team)[0] if (team_size == 1 and get_mems(winner_team)) else winner_team.name,
                        }
                    if runner_team:
                        podium_info.append({
                            "rank": 2,
                            "team_id": str(runner_team.id),
                            "team_name": runner_team.name,
                            "members": get_mems(runner_team),
                            "finish": "Runner-Up",
                        })
            else:
                # Championship stage matches have not been generated yet.
                # A Pool Play tournament requires advancing qualifying teams to the championship bracket.
                # Do NOT mark the entire tournament completed merely because pool matches have ended.
                is_finished = False

        elif tournament.format == TournamentFormat.SCRAMBLE:
            config = dict(tournament.format_configuration or {})
            has_workspace = "rounds_data" in config or "round_status" in config
            if force_scramble_end:
                is_finished = True
            elif not has_workspace and all_completed and playable_matches:
                is_finished = True

            if is_finished:
                standings_resp = await self.get_scramble_standings(tournament.club_id, tournament_id)
                for s in standings_resp.standings:
                    podium_info.append({
                        "rank": s.rank,
                        "player_membership_id": str(s.player_membership_id),
                        "user_id": str(s.user_id),
                        "name": s.display_name,
                        "wins": s.wins,
                        "losses": s.losses,
                        "points_differential": s.points_differential,
                    })
                if podium_info:
                    champ = podium_info[0]
                    winner_info = {
                        "player_membership_id": champ["player_membership_id"],
                        "name": champ["name"],
                        "type": "player",
                        "display_name": champ["name"],
                    }

        if is_finished and winner_info:
            cfg = dict(tournament.format_configuration or {})
            cfg["winner"] = winner_info
            cfg["podium"] = podium_info[:3]
            cfg["final_results"] = {
                "winner": winner_info,
                "podium": podium_info[:3],
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
            cfg["completed_at"] = datetime.now(timezone.utc).isoformat()
            tournament.format_configuration = cfg
            tournament.status = TournamentStatus.COMPLETED
            flag_modified(tournament, "format_configuration")
            await self.tournament_repo.update(
                tournament,
                status=TournamentStatus.COMPLETED,
                format_configuration=cfg,
            )
            try:
                await dispatch_event(
                    event_type=EventType.TOURNAMENT_UPDATED,
                    data={
                        "tournament_id": str(tournament.id),
                        "status": TournamentStatus.COMPLETED.value,
                        "winner": winner_info,
                        "podium": podium_info[:3],
                    },
                    club_id=tournament.club_id,
                )
            except Exception:
                pass
            return True

        return False


    async def _validate_and_derive_winner(
        self,
        match: Match,
        score_a: int,
        score_b: int,
        scoring_rules: dict,
    ) -> uuid.UUID:
        """Validate scores and return the winner_team_id derived from results."""
        try:
            winner_side = derive_winner_side(score_a, score_b, scoring_rules)
        except ScoreValidationError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            ) from e

        return match.team_a_id if winner_side == "a" else match.team_b_id  # type: ignore

    # ─── Standings ────────────────────────────────────────────────────────────

    async def get_standings(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> StandingsResponse:
        """Derive overall Round Robin or Bracket standings."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)

        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
        match_dicts = [
            {
                "team_a_id": m.team_a_id,
                "team_b_id": m.team_b_id,
                "score_a": m.score_a,
                "score_b": m.score_b,
                "winner_team_id": m.winner_team_id,
                "status": m.status.value,
            }
            for m in matches
        ]

        if tournament.format == TournamentFormat.BRACKET:
            format_cfg = tournament.format_configuration or {}
            bracket_meta = format_cfg.get("bracket_data", {}).get("matches", {})
            for md, m in zip(match_dicts, matches):
                meta = bracket_meta.get(str(m.id), {})
                if meta.get("label"):
                    md["label"] = meta["label"]
                if meta.get("bracket_section"):
                    md["bracket_section"] = meta["bracket_section"]
                md["bracket_round"] = m.bracket_round
            engine = BracketEngine()
            bracket_format = format_cfg.get("bracket_format") or format_cfg.get("bracket_type") or "Single Elimination"
            rows = engine.calculate_bracket_standings(team_dicts, match_dicts, bracket_format=bracket_format)
            return StandingsResponse(
                tournament_id=tournament_id,
                standings=[
                    StandingRow(
                        rank=r["rank"],
                        team_id=r["team_id"],
                        team_name=r["team_name"],
                        team_seed=r.get("team_seed"),
                        wins=r["wins"],
                        losses=r["losses"],
                        matches_played=r["matches_played"],
                        points_scored=r["points_scored"],
                        points_allowed=r["points_allowed"],
                        points_differential=r["points_differential"],
                        status=r.get("status"),
                    )
                    for r in rows
                ],
            )

        engine = RoundRobinEngine()
        rows = engine.calculate_standings(team_dicts, match_dicts)

        standing_rows = [
            StandingRow(
                rank=r.rank,
                team_id=r.team_id,
                team_name=r.team_name,
                team_seed=r.team_seed,
                wins=r.wins,
                losses=r.losses,
                matches_played=r.matches_played,
                points_scored=r.points_scored,
                points_allowed=r.points_allowed,
                points_differential=r.points_differential,
            )
            for r in rows
        ]

        return StandingsResponse(
            tournament_id=tournament_id,
            standings=standing_rows,
        )

    # ─── Player Read-Only Access ──────────────────────────────────────────────

    async def list_teams_public(
        self, tournament_id: uuid.UUID
    ) -> list[TeamResponse]:
        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        return [_build_team_response(t) for t in teams]

    async def list_matches_public(
        self, tournament_id: uuid.UUID
    ) -> list[MatchResponse]:
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        return [_build_match_response(m) for m in matches]

    async def list_pool_matches_public(
        self, tournament_id: uuid.UUID, pool_id: uuid.UUID | None = None
    ) -> list[MatchResponse]:
        if pool_id is not None:
            matches = await self.competition_repo.list_matches_by_pool(tournament_id, pool_id)
        else:
            matches = await self.competition_repo.list_matches_by_stage(
                tournament_id, MatchStage.POOL
            )
        return [_build_match_response(m) for m in matches]

    async def list_championship_matches_public(
        self, tournament_id: uuid.UUID
    ) -> list[MatchResponse]:
        matches = await self.competition_repo.list_matches_by_stage(
            tournament_id, MatchStage.CHAMPIONSHIP
        )
        return [_build_match_response(m) for m in matches]

    async def list_pools_public(
        self, tournament_id: uuid.UUID
    ) -> list[PoolResponse]:
        pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
        return [_build_pool_response(p) for p in pools]

    async def get_standings_public(
        self, tournament_id: uuid.UUID
    ) -> StandingsResponse:
        tournament = await self.tournament_repo.get_by_id(tournament_id)
        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)

        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
        match_dicts = [
            {
                "team_a_id": m.team_a_id,
                "team_b_id": m.team_b_id,
                "score_a": m.score_a,
                "score_b": m.score_b,
                "winner_team_id": m.winner_team_id,
                "status": m.status.value,
            }
            for m in matches
        ]

        if tournament and tournament.format == TournamentFormat.BRACKET:
            format_cfg = tournament.format_configuration or {}
            bracket_meta = format_cfg.get("bracket_data", {}).get("matches", {})
            for md, m in zip(match_dicts, matches):
                meta = bracket_meta.get(str(m.id), {})
                if meta.get("label"):
                    md["label"] = meta["label"]
            engine = BracketEngine()
            rows = engine.calculate_bracket_standings(team_dicts, match_dicts)
            return StandingsResponse(
                tournament_id=tournament_id,
                standings=[
                    StandingRow(
                        rank=r["rank"],
                        team_id=r["team_id"],
                        team_name=r["team_name"],
                        team_seed=r.get("team_seed"),
                        wins=r["wins"],
                        losses=r["losses"],
                        matches_played=r["matches_played"],
                        points_scored=r["points_scored"],
                        points_allowed=r["points_allowed"],
                        points_differential=r["points_differential"],
                        status=r.get("status"),
                    )
                    for r in rows
                ],
            )

        engine = RoundRobinEngine()
        rows = engine.calculate_standings(team_dicts, match_dicts)

        return StandingsResponse(
            tournament_id=tournament_id,
            standings=[
                StandingRow(
                    rank=r.rank,
                    team_id=r.team_id,
                    team_name=r.team_name,
                    team_seed=r.team_seed,
                    wins=r.wins,
                    losses=r.losses,
                    matches_played=r.matches_played,
                    points_scored=r.points_scored,
                    points_allowed=r.points_allowed,
                    points_differential=r.points_differential,
                )
                for r in rows
            ],
        )

    async def get_pool_standings_public(
        self, tournament_id: uuid.UUID, pool_id: uuid.UUID | None = None
    ) -> AllPoolsStandingsResponse | PoolStandingsResponse:
        return await self.get_pool_standings(None, tournament_id, pool_id)

    # ─── Scramble Operations (Phase 7) ────────────────────────────────────────

    async def generate_scramble(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        payload: ScrambleConfigureRequest,
    ) -> ScrambleGenerationResponse:
        """Generate rotating doubles matches for a Scramble tournament."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        existing_matches = await self.competition_repo.count_all_matches(tournament_id)
        if existing_matches > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Matches already generated. Use regenerate-scramble "
                    "to rebuild (only allowed before any results are entered)."
                ),
            )

        if tournament.status != TournamentStatus.REGISTRATION_CLOSED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Scramble generation requires tournament status "
                    f"'registration_closed' (current: '{tournament.status.value}')"
                ),
            )

        # Get confirmed participants with active membership in tournament club
        regs = await self.registration_repo.list_by_tournament(tournament_id)
        eligible_players = []
        for r in regs:
            if (
                r.status == RegistrationStatus.CONFIRMED
                and r.player_membership
                and r.player_membership.status == PlayerMembershipStatus.ACTIVE
                and r.player_membership.club_id == club_id
            ):
                user = r.player_membership.user if hasattr(r.player_membership, "user") else None
                profile = user.player_profile if user and hasattr(user, "player_profile") else None
                name = (
                    profile.display_name
                    if profile and profile.display_name
                    else (user.full_name if user and user.full_name else (user.email if user else "Player"))
                )
                gender = getattr(profile, "gender", None) or getattr(user, "gender", None)
                eligible_players.append({
                    "id": r.player_membership_id,
                    "player_membership_id": r.player_membership_id,
                    "user_id": user.id if user else None,
                    "display_name": name,
                    "name": name,
                    "seed": r.seed,
                    "gender": gender,
                    "registered_at": r.registered_at.isoformat() if r.registered_at else "",
                })

        engine = ScrambleEngine()
        division = (tournament.format_configuration or {}).get("category")
        try:
            engine.validate_scramble_configuration(
                len(eligible_players), payload.rounds, payload.matches_per_player
            )
            matchups = engine.generate_matchups(
                eligible_players, payload.rounds, payload.matches_per_player, division=division
            )
        except ScrambleConfigurationError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            ) from e

        # Save configuration to tournament preserving existing category
        config = dict(tournament.format_configuration or {})
        config.update({
            "rounds": payload.rounds,
            "matches_per_player": payload.matches_per_player or payload.rounds,
            "partner_rotation": payload.partner_rotation,
        })
        await self.tournament_repo.update(tournament, format_configuration=config)

        # Create Match and MatchParticipant records
        match_dicts = [
            {
                "tournament_id": tournament_id,
                "round_number": m["round_number"],
                "match_number": m["match_number"],
                "stage": None,
                "status": MatchStatus.PENDING,
            }
            for m in matchups
        ]
        created_matches = await self.competition_repo.create_matches_bulk(match_dicts)

        participant_dicts = []
        for m_model, m_spec in zip(created_matches, matchups):
            side_a_players = m_spec["side_a"]
            side_b_players = m_spec["side_b"]
            for slot, p in enumerate(side_a_players, start=1):
                participant_dicts.append({
                    "match_id": m_model.id,
                    "player_membership_id": p["id"],
                    "side": "side_a",
                    "partner_slot": slot,
                })
            for slot, p in enumerate(side_b_players, start=1):
                participant_dicts.append({
                    "match_id": m_model.id,
                    "player_membership_id": p["id"],
                    "side": "side_b",
                    "partner_slot": slot,
                })

        await self.competition_repo.create_match_participants_bulk(participant_dicts)

        # Advance tournament status to in_progress
        await self.tournament_repo.update(
            tournament, status=TournamentStatus.IN_PROGRESS
        )
        await self.db.commit()

        return ScrambleGenerationResponse(
            tournament_id=tournament_id,
            participants_count=len(eligible_players),
            rounds_count=payload.rounds,
            matches_generated=len(created_matches),
            message=(
                f"Generated {len(created_matches)} Scramble matches across {payload.rounds} rounds "
                f"for {len(eligible_players)} players."
            ),
        )

    async def regenerate_scramble(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        payload: ScrambleConfigureRequest,
    ) -> ScrambleGenerationResponse:
        """Regenerate Scramble schedule before any match scores are entered."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        completed_count = await self.competition_repo.count_completed_matches(tournament_id)
        if completed_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot regenerate Scramble: {completed_count} match result(s) "
                    f"have already been recorded."
                ),
            )

        # Delete existing pending matches
        await self.competition_repo.delete_pending_matches(tournament_id)

        # Get confirmed participants
        regs = await self.registration_repo.list_by_tournament(tournament_id)
        eligible_players = []
        for r in regs:
            if (
                r.status == RegistrationStatus.CONFIRMED
                and r.player_membership
                and r.player_membership.status == PlayerMembershipStatus.ACTIVE
                and r.player_membership.club_id == club_id
            ):
                user = r.player_membership.user if hasattr(r.player_membership, "user") else None
                profile = user.player_profile if user and hasattr(user, "player_profile") else None
                name = (
                    profile.display_name
                    if profile and profile.display_name
                    else (user.full_name if user and user.full_name else (user.email if user else "Player"))
                )
                gender = getattr(profile, "gender", None) or getattr(user, "gender", None)
                eligible_players.append({
                    "id": r.player_membership_id,
                    "player_membership_id": r.player_membership_id,
                    "user_id": user.id if user else None,
                    "display_name": name,
                    "name": name,
                    "seed": r.seed,
                    "gender": gender,
                    "registered_at": r.registered_at.isoformat() if r.registered_at else "",
                })

        engine = ScrambleEngine()
        division = (tournament.format_configuration or {}).get("category")
        try:
            engine.validate_scramble_configuration(
                len(eligible_players), payload.rounds, payload.matches_per_player
            )
            matchups = engine.generate_matchups(
                eligible_players, payload.rounds, payload.matches_per_player, division=division
            )
        except ScrambleConfigurationError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            ) from e

        config = dict(tournament.format_configuration or {})
        config.update({
            "rounds": payload.rounds,
            "matches_per_player": payload.matches_per_player or payload.rounds,
            "partner_rotation": payload.partner_rotation,
        })
        await self.tournament_repo.update(tournament, format_configuration=config)

        match_dicts = [
            {
                "tournament_id": tournament_id,
                "round_number": m["round_number"],
                "match_number": m["match_number"],
                "stage": None,
                "status": MatchStatus.PENDING,
            }
            for m in matchups
        ]
        created_matches = await self.competition_repo.create_matches_bulk(match_dicts)

        participant_dicts = []
        for m_model, m_spec in zip(created_matches, matchups):
            side_a_players = m_spec["side_a"]
            side_b_players = m_spec["side_b"]
            for slot, p in enumerate(side_a_players, start=1):
                participant_dicts.append({
                    "match_id": m_model.id,
                    "player_membership_id": p["id"],
                    "side": "side_a",
                    "partner_slot": slot,
                })
            for slot, p in enumerate(side_b_players, start=1):
                participant_dicts.append({
                    "match_id": m_model.id,
                    "player_membership_id": p["id"],
                    "side": "side_b",
                    "partner_slot": slot,
                })

        await self.competition_repo.create_match_participants_bulk(participant_dicts)

        if tournament.status != TournamentStatus.IN_PROGRESS:
            await self.tournament_repo.update(
                tournament, status=TournamentStatus.IN_PROGRESS
            )
        await self.db.commit()

        return ScrambleGenerationResponse(
            tournament_id=tournament_id,
            participants_count=len(eligible_players),
            rounds_count=payload.rounds,
            matches_generated=len(created_matches),
            message=(
                f"Regenerated {len(created_matches)} Scramble matches across {payload.rounds} rounds "
                f"for {len(eligible_players)} players."
            ),
        )

    def _get_sit_out_map(self, tournament: Tournament) -> dict[int, MatchParticipantResponse]:
        config = tournament.format_configuration or {}
        rounds_cfg = config.get("rounds_data")
        if not isinstance(rounds_cfg, dict):
            raw_rounds = config.get("rounds")
            rounds_cfg = raw_rounds if isinstance(raw_rounds, dict) else {}
        sit_out_map: dict[int, MatchParticipantResponse] = {}
        for _, r_data in rounds_cfg.items():
            if not isinstance(r_data, dict):
                continue
            for court_data in r_data.get("courts", []):
                for m_spec in court_data.get("matches", []):
                    m_num = m_spec.get("match_number")
                    sit_out = m_spec.get("sit_out_player")
                    if m_num and sit_out:
                        p_id = uuid.UUID(str(sit_out.get("id") or sit_out.get("player_membership_id")))
                        u_id = uuid.UUID(str(sit_out.get("user_id"))) if sit_out.get("user_id") else None
                        sit_out_map[m_num] = MatchParticipantResponse(
                            id=uuid.uuid4(),
                            player_membership_id=p_id,
                            side="sit_out",
                            partner_slot=0,
                            user_id=u_id,
                            display_name=sit_out.get("display_name") or sit_out.get("name") or "Sit-out",
                            membership_number=None,
                        )
        return sit_out_map

    async def list_scramble_matches(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> list[MatchResponse]:
        """List all scramble matches for tournament."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        sit_outs = self._get_sit_out_map(tournament)
        return [_build_match_response(m, sit_outs.get(m.match_number)) for m in matches]

    async def get_scramble_standings(
        self, club_id: uuid.UUID | None, tournament_id: uuid.UUID
    ) -> ScrambleStandingsResponse:
        """Calculate and return individual player standings for a Scramble tournament."""
        if club_id is not None:
            tournament = await self._get_tournament_or_404(tournament_id, club_id)
        else:
            tournament = await self.tournament_repo.get_by_id(tournament_id)
            if not tournament:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tournament not found",
                )
        self._assert_scramble(tournament)

        regs = await self.registration_repo.list_by_tournament(tournament_id)
        players = []
        for r in regs:
            if (
                r.status == RegistrationStatus.CONFIRMED
                and r.player_membership
                and r.player_membership.status == PlayerMembershipStatus.ACTIVE
            ):
                user = r.player_membership.user if hasattr(r.player_membership, "user") else None
                profile = user.player_profile if user and hasattr(user, "player_profile") else None
                name = (
                    profile.display_name
                    if profile and profile.display_name
                    else (user.full_name if user and user.full_name else (user.email if user else "Player"))
                )
                rating = float(profile.skill_rating) if profile and profile.skill_rating is not None else 3.5
                players.append({
                    "id": r.player_membership_id,
                    "player_membership_id": r.player_membership_id,
                    "user_id": user.id if user else uuid.uuid4(),
                    "display_name": name,
                    "name": name,
                    "seed": r.seed,
                    "rating": rating,
                    "skill_rating": rating,
                    "registered_at": r.registered_at.isoformat() if r.registered_at else "",
                })

        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        match_dicts = []
        for m in matches:
            side_a = [
                {"id": p.player_membership_id, "player_membership_id": p.player_membership_id}
                for p in (m.participants or [])
                if p.side == "side_a"
            ]
            side_b = [
                {"id": p.player_membership_id, "player_membership_id": p.player_membership_id}
                for p in (m.participants or [])
                if p.side == "side_b"
            ]
            match_dicts.append({
                "status": m.status.value,
                "score_a": m.score_a,
                "score_b": m.score_b,
                "side_a": side_a,
                "side_b": side_b,
            })

        engine = ScrambleEngine()
        calculated_standings = engine.calculate_scramble_standings(players, match_dicts)

        standing_rows = [
            ScrambleStandingRow(
                rank=s.rank,
                player_membership_id=s.player_membership_id,
                user_id=s.user_id,
                display_name=s.display_name,
                wins=s.wins,
                losses=s.losses,
                matches_played=s.matches_played,
                points_scored=s.points_scored,
                points_allowed=s.points_allowed,
                points_differential=s.points_differential,
                skill_rating=s.skill_rating,
            )
            for s in calculated_standings
        ]

        return ScrambleStandingsResponse(
            tournament_id=tournament_id,
            standings=standing_rows,
        )

    async def list_scramble_matches(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> list[MatchResponse]:
        """Staff list of scramble matches for a tournament."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        sit_outs = self._get_sit_out_map(tournament)
        return [_build_match_response(m, sit_outs.get(m.match_number)) for m in matches]

    async def list_scramble_matches_public(
        self, tournament_id: uuid.UUID
    ) -> list[MatchResponse]:
        """Player read-only list of scramble matches."""
        tournament = await self.tournament_repo.get_by_id(tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )
        self._assert_scramble(tournament)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        sit_outs = self._get_sit_out_map(tournament)
        return [_build_match_response(m, sit_outs.get(m.match_number)) for m in matches]

    async def get_scramble_standings_public(
        self, tournament_id: uuid.UUID
    ) -> ScrambleStandingsResponse:
        """Player read-only individual standings for a Scramble tournament."""
        return await self.get_scramble_standings(None, tournament_id)

    async def finalize_scramble_registrations_and_seed(
        self, tournament: Tournament
    ) -> None:
        """Seed confirmed scramble players by skill rating (descending) and initialize round 1 setup."""
        self._assert_scramble(tournament)
        regs = await self.registration_repo.list_by_tournament(tournament.id)
        confirmed_regs = [
            r for r in regs
            if r.status == RegistrationStatus.CONFIRMED
            and r.player_membership
            and r.player_membership.status == PlayerMembershipStatus.ACTIVE
        ]

        def _get_sort_key(r):
            user = r.player_membership.user if r.player_membership else None
            profile = user.player_profile if user else None
            rating = float(profile.skill_rating) if profile and profile.skill_rating is not None else 3.5
            reg_time = r.registered_at or datetime.min.replace(tzinfo=timezone.utc)
            return (-rating, reg_time, str(r.player_membership_id))

        sorted_regs = sorted(confirmed_regs, key=_get_sort_key)

        for seed_idx, r in enumerate(sorted_regs, start=1):
            r.seed = seed_idx

        config = dict(tournament.format_configuration or {})
        config["available_player_ids"] = [str(r.player_membership_id) for r in sorted_regs]
        config["seeded_players"] = [
            {
                "membership_id": str(r.player_membership_id),
                "name": (
                    r.player_membership.user.player_profile.display_name
                    if r.player_membership and r.player_membership.user and r.player_membership.user.player_profile
                    else (r.player_membership.user.full_name if r.player_membership and r.player_membership.user else "Player")
                ),
                "seed": seed_idx,
                "rating": (
                    float(r.player_membership.user.player_profile.skill_rating)
                    if r.player_membership and r.player_membership.user and r.player_membership.user.player_profile and r.player_membership.user.player_profile.skill_rating is not None
                    else 3.5
                ),
            }
            for seed_idx, r in enumerate(sorted_regs, start=1)
        ]
        config["current_round"] = 1
        config["round_status"] = "setup"
        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(tournament, format_configuration=config)
        await self.db.commit()

    async def get_scramble_state(
        self, club_id: uuid.UUID | None, tournament_id: uuid.UUID
    ) -> ScrambleStateResponse:
        """Get the authoritative Scramble tournament round state, availability, courts, and valid actions."""
        if club_id is not None:
            tournament = await self._get_tournament_or_404(tournament_id, club_id)
        else:
            tournament = await self.tournament_repo.get_by_id(tournament_id)
            if not tournament:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found")
        self._assert_scramble(tournament)

        config = dict(tournament.format_configuration or {})
        current_round = config.get("current_round", 1)
        round_status = config.get("round_status", "setup")
        division = config.get("category") or "Open Scramble"
        raw_planned = config.get("planned_rounds") or config.get("rounds")
        try:
            planned_rounds = int(raw_planned) if raw_planned is not None else 3
        except (ValueError, TypeError):
            planned_rounds = 3
        if planned_rounds < 1:
            planned_rounds = 1

        is_final_round = current_round >= planned_rounds

        regs = await self.registration_repo.list_by_tournament(tournament_id)
        confirmed_regs = [
            r for r in regs
            if r.status == RegistrationStatus.CONFIRMED
            and r.player_membership
            and r.player_membership.status == PlayerMembershipStatus.ACTIVE
        ]
        registered_count = len(confirmed_regs)

        # Sort confirmed regs by rating descending for stable ordering
        def _get_reg_rating(r):
            user = r.player_membership.user if r.player_membership else None
            profile = user.player_profile if user else None
            return float(profile.skill_rating) if profile and profile.skill_rating is not None else 3.5

        sorted_by_rating = sorted(
            confirmed_regs,
            key=lambda r: (
                r.seed if r.seed is not None else 9999,
                -_get_reg_rating(r),
                r.registered_at or datetime.min.replace(tzinfo=timezone.utc),
                str(r.player_membership_id),
            ),
        )

        saved_avail = config.get("available_player_ids")
        if saved_avail is not None:
            available_player_ids = [uuid.UUID(str(pid)) for pid in saved_avail]
        else:
            available_player_ids = [r.player_membership_id for r in sorted_by_rating]

        engine = ScrambleEngine()
        recommended_rounds, rec_reason, rec_details = engine.calculate_recommended_rounds(
            player_count=len(confirmed_regs),
            division=division,
            courts_count=config.get("courts_count"),
        )

        all_matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        total_games = len(all_matches)
        games_completed = sum(1 for m in all_matches if m.status == MatchStatus.COMPLETED)
        games_remaining = total_games - games_completed

        round_matches = [m for m in all_matches if m.round_number == current_round]
        round_games_completed = sum(1 for m in round_matches if m.status == MatchStatus.COMPLETED)
        round_games_total = len(round_matches)
        round_games_remaining = max(0, round_games_total - round_games_completed)
        all_round_completed = round_games_total > 0 and (round_games_completed == round_games_total)

        tournament_games_completed = games_completed

        # Calculate expected total tournament games across all planned rounds
        round_1_matches = [m for m in all_matches if m.round_number == 1]
        if round_1_matches:
            expected_total_games = len(round_1_matches) * planned_rounds
        elif round_matches:
            expected_total_games = round_games_total * planned_rounds
        else:
            expected_total_games = rec_details.get("expected_total_games", planned_rounds * 3)

        if round_status == "in_progress" and all_round_completed:
            round_status = "completed"
            config["round_status"] = "completed"
            rounds_store = dict(config.get("rounds_data") or {})
            if str(current_round) in rounds_store:
                rounds_store[str(current_round)]["status"] = "completed"
                config["rounds_data"] = rounds_store
            flag_modified(tournament, "format_configuration")
            await self.tournament_repo.update(tournament, format_configuration=config)
            await self.db.commit()

        standings_resp = await self.get_scramble_standings(club_id, tournament_id)
        standings = standings_resp.standings
        current_leader = standings[0].display_name if standings else None

        champion_id = None
        champion_name = None
        if (
            tournament.status == TournamentStatus.COMPLETED
            and standings
            and total_games > 0
            and games_completed == total_games
        ):
            champion_id = standings[0].player_membership_id
            champion_name = standings[0].display_name

        rounds_data_cfg = config.get("rounds_data")
        if not isinstance(rounds_data_cfg, dict):
            raw_r = config.get("rounds")
            rounds_data_cfg = raw_r if isinstance(raw_r, dict) else {}
        round_data = rounds_data_cfg.get(str(current_round), {})
        courts_data = round_data.get("courts", [])
        courts_list: list[ScrambleCourtInfo] = []
        for c in courts_data:
            players_info = [
                ScrambleCourtPlayerInfo(
                    id=uuid.UUID(str(p.get("id") or p.get("player_membership_id"))),
                    display_name=p.get("display_name") or p.get("name") or "Player",
                    seed=p.get("seed"),
                    rating=p.get("rating") if p.get("rating") is not None else p.get("skill_rating"),
                )
                for p in c.get("players", [])
            ]
            courts_list.append(
                ScrambleCourtInfo(
                    court_number=c.get("court_number", 1),
                    court_id=str(c.get("court_id")) if c.get("court_id") else None,
                    court_name=c.get("court_name") or f"Court {c.get('court_number', 1)}",
                    player_count=c.get("player_count", len(players_info)),
                    players=players_info,
                )
            )

        # Fallback court reconstruction if courts_list is empty but round_matches exist
        if not courts_list and round_matches:
            reg_lookup = {r.player_membership_id: r for r in confirmed_regs}
            court_map: dict[str, list[Match]] = {}
            for m in round_matches:
                ckey = str(m.court_id) if m.court_id else f"court_{m.round_number}"
                court_map.setdefault(ckey, []).append(m)

            for c_idx, (ckey, c_matches) in enumerate(court_map.items(), start=1):
                seen_pids = set()
                c_players = []
                for m in c_matches:
                    for p in (m.participants or []):
                        if p.player_membership_id not in seen_pids:
                            seen_pids.add(p.player_membership_id)
                            reg = reg_lookup.get(p.player_membership_id)
                            user = reg.player_membership.user if reg and reg.player_membership else None
                            profile = user.player_profile if user else None
                            dname = profile.display_name if profile else (user.full_name if user else "Player")
                            s_rating = float(profile.skill_rating) if profile and profile.skill_rating is not None else 3.5
                            c_players.append(
                                ScrambleCourtPlayerInfo(
                                    id=p.player_membership_id,
                                    display_name=dname,
                                    seed=reg.seed if reg else None,
                                    rating=s_rating,
                                )
                            )
                c_name = f"Court {c_idx}"
                courts_list.append(
                    ScrambleCourtInfo(
                        court_number=c_idx,
                        court_id=ckey if not ckey.startswith("court_") else None,
                        court_name=c_name,
                        player_count=len(c_players),
                        players=c_players,
                    )
                )

        valid_actions: list[str] = []
        if tournament.status == TournamentStatus.REGISTRATION_OPEN:
            valid_actions.append("close_registration")
        if tournament.status not in (TournamentStatus.COMPLETED, TournamentStatus.CANCELLED):
            if round_status == "setup":
                valid_actions.append("prepare_round")
                valid_actions.append("create_matchups")
                if total_games > 0:
                    valid_actions.append("end_tournament")
            elif round_status == "matchups_created":
                valid_actions.append("start_round")
                valid_actions.append("create_matchups")
            elif round_status == "in_progress":
                if all_round_completed:
                    valid_actions.append("finish_round")
                else:
                    valid_actions.append("record_scores")
            elif round_status == "completed":
                if not is_final_round:
                    valid_actions.append("start_next_round")
                valid_actions.append("end_tournament")

        rounds_data_cfg = config.get("rounds_data")
        if not isinstance(rounds_data_cfg, dict):
            raw_r = config.get("rounds")
            rounds_data_cfg = raw_r if isinstance(raw_r, dict) else {}
        round_data = rounds_data_cfg.get(str(current_round), {})
        quality_summary = round_data.get("quality_summary")

        # Compute full-field coverage summary across all matches
        coverage_players = []
        for r in confirmed_regs:
            u = r.player_membership.user if r.player_membership else None
            prof = u.player_profile if u and hasattr(u, "player_profile") else None
            g = getattr(prof, "gender", None) or getattr(u, "gender", None) or "Any"
            dname = prof.display_name if prof and prof.display_name else (u.full_name if u else "Player")
            coverage_players.append({
                "id": str(r.player_membership_id),
                "display_name": dname,
                "gender": g,
            })

        coverage_matches = [
            {
                "status": m.status.value if hasattr(m.status, "value") else str(m.status),
                "side_a": [{"id": str(p.player_membership_id)} for p in (m.participants or []) if p.side == "side_a"],
                "side_b": [{"id": str(p.player_membership_id)} for p in (m.participants or []) if p.side == "side_b"],
            }
            for m in all_matches
        ]
        coverage_summary = engine.calculate_overall_coverage(
            players=coverage_players,
            matches=coverage_matches,
            division=division,
        )

        return ScrambleStateResponse(
            tournament_id=tournament_id,
            tournament_status=tournament.status.value,
            current_round=current_round,
            round_status=round_status,
            planned_rounds=planned_rounds,
            is_final_round=is_final_round,
            registered_players_count=registered_count,
            available_players_count=len(available_player_ids),
            available_player_ids=available_player_ids,
            courts_count=len(courts_list),
            games_completed=games_completed,
            games_remaining=games_remaining,
            total_games=total_games,
            round_games_completed=round_games_completed,
            round_games_remaining=round_games_remaining,
            round_games_total=round_games_total,
            tournament_games_completed=tournament_games_completed,
            expected_total_games=expected_total_games,
            recommended_rounds=recommended_rounds,
            recommendation_reason=rec_reason,
            current_leader=current_leader,
            champion_player_id=champion_id,
            champion_player_name=champion_name,
            courts=courts_list,
            valid_actions=valid_actions,
            quality_summary=quality_summary,
            coverage_summary=coverage_summary,
        )

    async def set_scramble_player_availability(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        payload: ScrambleAvailabilityRequest,
    ) -> ScrambleStateResponse:
        """Update available players for the round, enforcing 4/5-player court partition or 4-player balanced mixed courts."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        config = dict(tournament.format_configuration or {})
        division = config.get("category")

        if division == "Mixed Scramble":
            if len(payload.player_membership_ids) % 4 != 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Mixed Scramble requires player count to be a multiple of 4 (strictly 4-player courts). "
                        f"Selected: {len(payload.player_membership_ids)} players."
                    ),
                )
            regs = await self.registration_repo.list_by_tournament(tournament_id)
            confirmed_regs = {
                str(r.player_membership_id): r
                for r in regs
                if r.status == RegistrationStatus.CONFIRMED
                and r.player_membership
                and r.player_membership.status == PlayerMembershipStatus.ACTIVE
                and r.player_membership.club_id == club_id
            }
            males = []
            females = []
            for pid in payload.player_membership_ids:
                r = confirmed_regs.get(str(pid))
                user = r.player_membership.user if r and r.player_membership else None
                profile = user.player_profile if user and hasattr(user, "player_profile") else None
                gender = getattr(profile, "gender", None) or getattr(user, "gender", None)
                norm_g = (gender or "").strip().capitalize()
                if norm_g not in ("Male", "Female"):
                    name = (
                        profile.display_name
                        if profile and profile.display_name
                        else (user.full_name if user and user.full_name else "Player")
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Player '{name}' has no verified gender in their profile. "
                            f"Mixed Scramble requires verified profile gender (Male or Female) to form mixed-gender doubles teams."
                        ),
                    )
                if norm_g == "Male":
                    males.append(pid)
                else:
                    females.append(pid)

            if len(males) != len(females):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Mixed Scramble requires an equal number of male and female players. "
                        f"Selected: {len(males)} men and {len(females)} women."
                    ),
                )
        else:
            engine = ScrambleEngine()
            partition = engine.partition_players_into_courts(len(payload.player_membership_ids))
            if partition is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Selected {len(payload.player_membership_ids)} players cannot be divided into valid courts of 4 or 5 players. "
                        f"Please adjust player availability (valid counts: 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18...)."
                    ),
                )

        config["available_player_ids"] = [str(pid) for pid in payload.player_membership_ids]
        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(tournament, format_configuration=config)
        await self.db.commit()

        return await self.get_scramble_state(club_id, tournament_id)

    async def create_scramble_round_matchups(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
        payload: ScrambleMatchupGenerateRequest = ScrambleMatchupGenerateRequest(),
    ) -> ScrambleStateResponse:
        """Create deterministic rotating doubles matchups for the current round."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        config = dict(tournament.format_configuration or {})
        current_round = config.get("current_round", 1)
        round_status = config.get("round_status", "setup")

        if round_status not in ("setup", "matchups_created"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot generate matchups when round is in '{round_status}' state.",
            )

        raw_planned = config.get("planned_rounds") or config.get("rounds")
        try:
            planned_rounds = int(raw_planned) if raw_planned is not None else 3
        except (ValueError, TypeError):
            planned_rounds = 3
        if planned_rounds < 1:
            planned_rounds = 1

        if current_round > planned_rounds:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot create matchups: current round ({current_round}) exceeds planned limit of {planned_rounds} rounds.",
            )

        all_matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        current_round_matches = [m for m in all_matches if m.round_number == current_round]
        if any(m.status == MatchStatus.COMPLETED for m in current_round_matches):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot regenerate matchups: match results have already been recorded for this round.",
            )

        for m in current_round_matches:
            await self.competition_repo.delete_match(m.id)

        regs = await self.registration_repo.list_by_tournament(tournament_id)
        confirmed_regs = {
            str(r.player_membership_id): r
            for r in regs
            if r.status == RegistrationStatus.CONFIRMED
            and r.player_membership
            and r.player_membership.status == PlayerMembershipStatus.ACTIVE
            and r.player_membership.club_id == club_id
        }

        saved_avail = config.get("available_player_ids")
        if saved_avail is not None:
            avail_pids = [str(pid) for pid in saved_avail if str(pid) in confirmed_regs]
        else:
            avail_pids = list(confirmed_regs.keys())

        eligible_players = []
        for pid in avail_pids:
            r = confirmed_regs[pid]
            user = r.player_membership.user if hasattr(r.player_membership, "user") else None
            profile = user.player_profile if user and hasattr(user, "player_profile") else None
            name = (
                profile.display_name
                if profile and profile.display_name
                else (user.full_name if user and user.full_name else (user.email if user else "Player"))
            )
            gender = getattr(profile, "gender", None) or getattr(user, "gender", None)
            rating = float(profile.skill_rating) if profile and profile.skill_rating is not None else 3.5
            eligible_players.append({
                "id": str(r.player_membership_id),
                "player_membership_id": str(r.player_membership_id),
                "user_id": str(user.id) if user else None,
                "display_name": name,
                "name": name,
                "seed": r.seed,
                "rating": rating,
                "skill_rating": rating,
                "gender": gender,
                "registered_at": r.registered_at.isoformat() if r.registered_at else "",
            })

        engine = ScrambleEngine()
        division = (tournament.format_configuration or {}).get("category")
        if division != "Mixed Scramble":
            partition = engine.partition_players_into_courts(len(eligible_players))
            if partition is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Selected {len(eligible_players)} players cannot be divided into valid courts of 4 or 5 players. "
                        f"Please adjust player availability (valid counts: 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18...)."
                    ),
                )

        partner_history: dict[str, dict[str, int]] = {}
        opponent_history: dict[str, dict[str, int]] = {}
        for m in all_matches:
            if m.round_number and m.round_number < current_round and m.status == MatchStatus.COMPLETED:
                sa = [str(p.player_membership_id) for p in (m.participants or []) if p.side == "side_a"]
                sb = [str(p.player_membership_id) for p in (m.participants or []) if p.side == "side_b"]
                if len(sa) == 2:
                    p1, p2 = sa
                    partner_history.setdefault(p1, {})[p2] = partner_history.setdefault(p1, {}).get(p2, 0) + 1
                    partner_history.setdefault(p2, {})[p1] = partner_history.setdefault(p2, {}).get(p1, 0) + 1
                if len(sb) == 2:
                    p1, p2 = sb
                    partner_history.setdefault(p1, {})[p2] = partner_history.setdefault(p1, {}).get(p2, 0) + 1
                    partner_history.setdefault(p2, {})[p1] = partner_history.setdefault(p2, {}).get(p1, 0) + 1
                for a in sa:
                    for b in sb:
                        opponent_history.setdefault(a, {})[b] = opponent_history.setdefault(a, {}).get(b, 0) + 1
                        opponent_history.setdefault(b, {})[a] = opponent_history.setdefault(b, {}).get(a, 0) + 1

        active_courts = await self.court_repo.list_by_club(club_id, is_active=True)
        courts_info = []
        if payload.court_ids:
            court_map = {c.id: c for c in active_courts}
            for cid in payload.court_ids:
                if cid in court_map:
                    courts_info.append({"id": str(cid), "court_id": str(cid), "name": court_map[cid].name})
        else:
            for c in active_courts:
                courts_info.append({"id": str(c.id), "court_id": str(c.id), "name": c.name})

        prior_matches = [m for m in all_matches if m.round_number and m.round_number < current_round]
        start_match_num = max([m.match_number or 0 for m in prior_matches], default=0) + 1

        try:
            plan = engine.generate_round_matchups(
                players=eligible_players,
                round_number=current_round,
                start_match_number=start_match_num,
                partner_history=partner_history,
                opponent_history=opponent_history,
                courts_info=courts_info if courts_info else None,
                division=division,
            )
        except ScrambleConfigurationError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            ) from e

        match_dicts = [
            {
                "tournament_id": tournament_id,
                "round_number": current_round,
                "match_number": m["match_number"],
                "court_id": uuid.UUID(str(m["court_id"])) if m.get("court_id") else None,
                "stage": None,
                "status": MatchStatus.PENDING,
            }
            for m in plan["matches"]
        ]
        created_matches = await self.competition_repo.create_matches_bulk(match_dicts)

        participant_dicts = []
        for m_model, m_spec in zip(created_matches, plan["matches"]):
            for slot, p in enumerate(m_spec["side_a"], start=1):
                pid = p["id"]
                participant_dicts.append({
                    "match_id": m_model.id,
                    "player_membership_id": uuid.UUID(str(pid)) if not isinstance(pid, uuid.UUID) else pid,
                    "side": "side_a",
                    "partner_slot": slot,
                })
            for slot, p in enumerate(m_spec["side_b"], start=1):
                pid = p["id"]
                participant_dicts.append({
                    "match_id": m_model.id,
                    "player_membership_id": uuid.UUID(str(pid)) if not isinstance(pid, uuid.UUID) else pid,
                    "side": "side_b",
                    "partner_slot": slot,
                })

        await self.competition_repo.create_match_participants_bulk(participant_dicts)

        rounds_store = dict(config.get("rounds_data") or {})
        rounds_store[str(current_round)] = {
            "status": "matchups_created",
            "c4_courts": plan["c4_courts"],
            "c5_courts": plan["c5_courts"],
            "courts": plan["courts"],
            "quality_summary": plan.get("quality_summary"),
        }
        config["rounds_data"] = rounds_store
        config["round_status"] = "matchups_created"
        config["current_round"] = current_round
        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(tournament, format_configuration=config)

        if tournament.status == TournamentStatus.REGISTRATION_CLOSED:
            await self.tournament_repo.update(tournament, status=TournamentStatus.IN_PROGRESS)

        await self.db.commit()
        return await self.get_scramble_state(club_id, tournament_id)

    async def start_scramble_round(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> ScrambleStateResponse:
        """Start the current Scramble round."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        config = dict(tournament.format_configuration or {})
        if config.get("round_status") != "matchups_created":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start round: round status is '{config.get('round_status')}' (expected 'matchups_created').",
            )

        config["round_status"] = "in_progress"
        current_round = config.get("current_round", 1)
        rounds_store = dict(config.get("rounds_data") or {})
        if str(current_round) in rounds_store:
            rounds_store[str(current_round)]["status"] = "in_progress"
            config["rounds_data"] = rounds_store
        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(tournament, format_configuration=config)
        await self.db.commit()

        return await self.get_scramble_state(club_id, tournament_id)

    async def finish_scramble_round(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> ScrambleStateResponse:
        """Finish the current Scramble round after all games are completed."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        config = dict(tournament.format_configuration or {})
        current_round = config.get("current_round", 1)

        all_matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        round_matches = [m for m in all_matches if m.round_number == current_round]
        if not round_matches:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No matches exist for this round.",
            )
        if not all(m.status == MatchStatus.COMPLETED for m in round_matches):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot finish round: some matches are still pending results.",
            )

        config["round_status"] = "completed"
        rounds_store = dict(config.get("rounds_data") or {})
        if str(current_round) in rounds_store:
            rounds_store[str(current_round)]["status"] = "completed"
            config["rounds_data"] = rounds_store
        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(tournament, format_configuration=config)
        await self.db.commit()

        return await self.get_scramble_state(club_id, tournament_id)

    async def start_scramble_next_round(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> ScrambleStateResponse:
        """Advance to the next Scramble round, respecting configured planned rounds limit."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        config = dict(tournament.format_configuration or {})
        if config.get("round_status") != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start next round: current round status is '{config.get('round_status')}' (expected 'completed').",
            )

        current_round = config.get("current_round", 1)
        raw_planned = config.get("planned_rounds") or config.get("rounds")
        try:
            planned_rounds = int(raw_planned) if raw_planned is not None else 3
        except (ValueError, TypeError):
            planned_rounds = 3
        if planned_rounds < 1:
            planned_rounds = 1

        if current_round >= planned_rounds:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot start next round: tournament has reached its configured limit of {planned_rounds} rounds. Please end the tournament and publish results.",
            )

        config["current_round"] = current_round + 1
        config["round_status"] = "setup"

        # Carry forward previous round's availability by default so manager does not need to re-check
        # every player if the roster is unchanged
        saved_avail = config.get("available_player_ids")
        if saved_avail:
            config["available_player_ids"] = saved_avail

        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(tournament, format_configuration=config)
        await self.db.commit()

        return await self.get_scramble_state(club_id, tournament_id)

    async def set_scramble_planned_rounds(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID, planned_rounds: int
    ) -> ScrambleStateResponse:
        """Update the planned rounds count for a Scramble tournament."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        if planned_rounds < 1 or planned_rounds > 20:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Planned rounds must be between 1 and 20.",
            )

        config = dict(tournament.format_configuration or {})
        current_round = config.get("current_round", 1)
        if current_round > planned_rounds:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot set planned rounds to {planned_rounds}: current round is already {current_round}.",
            )

        config["planned_rounds"] = planned_rounds
        config["rounds"] = planned_rounds
        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(tournament, format_configuration=config)
        await self.db.commit()

        return await self.get_scramble_state(club_id, tournament_id)

    async def end_scramble_tournament(
        self, club_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> ScrambleStateResponse:
        """Explicitly end the Scramble tournament and crown the champion."""
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_scramble(tournament)
        self._assert_not_completed_or_cancelled(tournament)

        config = dict(tournament.format_configuration or {})
        config["round_status"] = "completed"
        flag_modified(tournament, "format_configuration")
        await self.tournament_repo.update(
            tournament,
            format_configuration=config,
        )
        await self._evaluate_and_persist_tournament_completion(tournament, force_scramble_end=True)
        await self.db.commit()

        return await self.get_scramble_state(club_id, tournament_id)


    # ─── Standalone Bracket Operations (Phase 8) ─────────────────────────────

    async def generate_bracket(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> BracketGenerationResponse:
        """Generate a standalone single-elimination bracket.

        Tournament must be in registration_closed status, format must be bracket.
        At least 2 teams each with exactly 2 players.
        No existing matches may exist.
        BYE slots are auto-resolved (score_a and score_b stay None).
        """
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_bracket(tournament)

        # Check for existing matches first (already generated)
        existing = await self.competition_repo.count_all_matches(tournament_id)
        if existing > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Bracket already generated. Use regenerate-bracket to rebuild "
                    "(only allowed before any results are entered)."
                ),
            )

        if tournament.status != TournamentStatus.REGISTRATION_CLOSED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Bracket generation requires tournament status 'registration_closed' "
                    f"(current: '{tournament.status.value}')"
                ),
            )

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        if not teams:
            teams = await self.finalize_registrations_and_seed(tournament)
        else:
            if any(t.seed is None for t in teams):
                teams = await self._seed_teams_by_rating(tournament_id)

        # Sort teams by seed ascending (Seed 1, 2, ...)
        teams.sort(key=lambda t: t.seed if t.seed is not None else 9999)

        team_dicts = [
            {
                "id": t.id,
                "name": t.name,
                "seed": t.seed or (idx + 1),
                "members": [{"player_membership_id": m.player_membership_id} for m in (t.members or [])],
            }
            for idx, t in enumerate(teams)
        ]

        expected_size = self._get_tournament_team_size(tournament)
        format_cfg = tournament.format_configuration or {}
        bracket_type = format_cfg.get("bracket_format") or format_cfg.get("bracket_type") or "Single Elimination"

        engine = BracketEngine()
        try:
            engine.validate_bracket_teams(team_dicts, expected_member_count=expected_size)
            slots = engine.generate_bracket(tournament_id, team_dicts, bracket_format=bracket_type)
        except BracketConfigurationError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            ) from e

        active_courts = await self.court_repo.list_by_club(club_id, is_active=True)
        match_dicts = [
            {
                "id": s.id,
                "tournament_id": s.tournament_id,
                "bracket_round": s.bracket_round,
                "bracket_position": s.bracket_position,
                "match_number": s.match_number,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "status": s.status,
                "winner_team_id": s.winner_team_id,
                "score_a": s.score_a,
                "score_b": s.score_b,
                "next_match_id": s.next_match_id,
                "next_match_slot": s.next_match_slot,
                "stage": None,
                "pool_id": None,
                "court_id": (
                    active_courts[(s.match_number - 1) % len(active_courts)].id
                    if active_courts and not s.is_bye
                    else None
                ),
            }
            for s in slots
        ]
        await self.competition_repo.create_matches_bulk(match_dicts)

        bracket_matches_meta = {
            str(s.id): {
                "bracket_section": s.bracket_section,
                "label": s.label,
                "loser_next_match_id": str(s.loser_next_match_id) if s.loser_next_match_id else None,
                "loser_next_match_slot": s.loser_next_match_slot,
                "is_bye": s.is_bye,
                "feeder_a": s.feeder_a,
                "feeder_b": s.feeder_b,
                "is_conditional": s.is_conditional,
                "wb_champion_slot": "team_a" if (s.bracket_section == "grand_final" or s.label == "Grand Final") else None,
            }
            for s in slots
        }
        updated_cfg = dict(tournament.format_configuration or {})
        updated_cfg["bracket_data"] = {
            "format": bracket_type,
            "matches": bracket_matches_meta,
        }

        await self.tournament_repo.update(
            tournament,
            format_configuration=updated_cfg,
            status=TournamentStatus.IN_PROGRESS,
        )
        await self.db.commit()

        n = len(teams)
        bracket_size = BracketEngine.calculate_bracket_size(n)
        total_rounds = int(math.log2(bracket_size))
        byes_count = sum(1 for s in slots if s.is_bye)
        played_count = len(slots) - byes_count

        return BracketGenerationResponse(
            tournament_id=tournament_id,
            teams_count=n,
            bracket_size=bracket_size,
            rounds_count=total_rounds,
            matches_generated=len(slots),
            byes_count=byes_count,
            played_matches_count=played_count,
            message=(
                f"Generated {bracket_type} bracket with {played_count} playable matches "
                f"({byes_count} BYE advance(s)) across {total_rounds} rounds "
                f"for {n} team(s)."
            ),
        )

    async def regenerate_bracket(
        self,
        club_id: uuid.UUID,
        tournament_id: uuid.UUID,
    ) -> BracketGenerationResponse:
        """Regenerate the standalone bracket from scratch.

        Only allowed if no real match results (with scores) have been recorded.
        BYE-completed matches (score_a=None) are treated as not recorded.
        """
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        self._assert_bracket(tournament)

        if tournament.status not in (
            TournamentStatus.REGISTRATION_CLOSED,
            TournamentStatus.IN_PROGRESS,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Regeneration requires tournament in registration_closed or in_progress status",
            )

        all_matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        real_completed = [
            m for m in all_matches
            if m.status == MatchStatus.COMPLETED and m.score_a is not None
        ]
        if real_completed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot regenerate: {len(real_completed)} match result(s) already recorded. "
                    "Remove results before regenerating."
                ),
            )

        # Delete all existing bracket matches (pending + BYE-completed)
        for m in list(all_matches):
            await self.db.delete(m)
        await self.db.flush()

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        if not teams:
            teams = await self.finalize_registrations_and_seed(tournament)
        else:
            if any(t.seed is None for t in teams):
                teams = await self._seed_teams_by_rating(tournament_id)

        teams.sort(key=lambda t: t.seed if t.seed is not None else 9999)

        team_dicts = [
            {
                "id": t.id,
                "name": t.name,
                "seed": t.seed or (idx + 1),
                "members": [{"player_membership_id": m.player_membership_id} for m in (t.members or [])],
            }
            for idx, t in enumerate(teams)
        ]

        expected_size = self._get_tournament_team_size(tournament)
        format_cfg = tournament.format_configuration or {}
        bracket_type = format_cfg.get("bracket_format") or format_cfg.get("bracket_type") or "Single Elimination"

        engine = BracketEngine()
        try:
            engine.validate_bracket_teams(team_dicts, expected_member_count=expected_size)
            slots = engine.generate_bracket(tournament_id, team_dicts, bracket_format=bracket_type)
        except BracketConfigurationError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            ) from e

        active_courts = await self.court_repo.list_by_club(club_id, is_active=True)
        match_dicts = [
            {
                "id": s.id,
                "tournament_id": s.tournament_id,
                "bracket_round": s.bracket_round,
                "bracket_position": s.bracket_position,
                "match_number": s.match_number,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "status": s.status,
                "winner_team_id": s.winner_team_id,
                "score_a": s.score_a,
                "score_b": s.score_b,
                "next_match_id": s.next_match_id,
                "next_match_slot": s.next_match_slot,
                "stage": None,
                "pool_id": None,
                "court_id": (
                    active_courts[(s.match_number - 1) % len(active_courts)].id
                    if active_courts and not s.is_bye
                    else None
                ),
            }
            for s in slots
        ]
        await self.competition_repo.create_matches_bulk(match_dicts)

        bracket_matches_meta = {
            str(s.id): {
                "bracket_section": s.bracket_section,
                "label": s.label,
                "loser_next_match_id": str(s.loser_next_match_id) if s.loser_next_match_id else None,
                "loser_next_match_slot": s.loser_next_match_slot,
                "is_bye": s.is_bye,
                "feeder_a": s.feeder_a,
                "feeder_b": s.feeder_b,
                "is_conditional": s.is_conditional,
                "wb_champion_slot": "team_a" if (s.bracket_section == "grand_final" or s.label == "Grand Final") else None,
            }
            for s in slots
        }
        updated_cfg = dict(tournament.format_configuration or {})
        updated_cfg["bracket_data"] = {
            "format": bracket_type,
            "matches": bracket_matches_meta,
        }

        await self.tournament_repo.update(
            tournament,
            format_configuration=updated_cfg,
            status=TournamentStatus.IN_PROGRESS,
        )
        await self.db.commit()

        n = len(teams)
        bracket_size = BracketEngine.calculate_bracket_size(n)
        total_rounds = int(math.log2(bracket_size))
        byes_count = sum(1 for s in slots if s.is_bye)
        played_count = len(slots) - byes_count

        return BracketGenerationResponse(
            tournament_id=tournament_id,
            teams_count=n,
            bracket_size=bracket_size,
            rounds_count=total_rounds,
            matches_generated=len(slots),
            byes_count=byes_count,
            played_matches_count=played_count,
            message=(
                f"Regenerated {bracket_type} bracket with {played_count} playable matches "
                f"({byes_count} BYE advance(s)) across {total_rounds} rounds "
                f"for {n} team(s)."
            ),
        )

    async def get_bracket_matches(
        self,
        club_id: uuid.UUID | None,
        tournament_id: uuid.UUID,
    ) -> list[MatchResponse]:
        """List all bracket matches for a standalone Bracket tournament."""
        if club_id is not None:
            tournament = await self._get_tournament_or_404(tournament_id, club_id)
        else:
            tournament = await self.tournament_repo.get_by_id(tournament_id)
            if not tournament:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tournament not found",
                )
        self._assert_bracket(tournament)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        format_cfg = tournament.format_configuration or {}
        bracket_meta = format_cfg.get("bracket_data", {}).get("matches", {})
        id_to_num = {m.id: m.match_number for m in matches}

        responses = []
        for m in matches:
            meta = bracket_meta.get(str(m.id), {})
            resp = _build_match_response(m)
            resp.bracket_section = meta.get("bracket_section")
            resp.label = meta.get("label")
            loser_id = meta.get("loser_next_match_id")
            loser_uuid = uuid.UUID(loser_id) if loser_id else None
            resp.loser_next_match_id = loser_uuid
            resp.loser_next_match_slot = meta.get("loser_next_match_slot")
            resp.winner_next_match_number = id_to_num.get(m.next_match_id) if m.next_match_id else None
            resp.loser_next_match_number = id_to_num.get(loser_uuid) if loser_uuid else None
            fa = meta.get("feeder_a")
            resp.feeder_a_label = fa.get("label") if isinstance(fa, dict) else (fa if isinstance(fa, str) else None)
            fb = meta.get("feeder_b")
            resp.feeder_b_label = fb.get("label") if isinstance(fb, dict) else (fb if isinstance(fb, str) else None)
            resp.is_conditional = meta.get("is_conditional", False)
            responses.append(resp)

        section_order = {"winners": 1, "main": 1, "losers": 2, "consolation": 2, "grand_final": 3, "reset_final": 4}
        responses.sort(key=lambda r: (
            section_order.get(r.bracket_section or "", 5),
            r.bracket_round or 0,
            r.bracket_position or 0,
            r.match_number or 0,
        ))
        return responses

    async def get_bracket_summary(
        self,
        club_id: uuid.UUID | None,
        tournament_id: uuid.UUID,
    ) -> BracketSummaryResponse:
        """Return a high-level bracket summary with current state and champion."""
        if club_id is not None:
            tournament = await self._get_tournament_or_404(tournament_id, club_id)
        else:
            tournament = await self.tournament_repo.get_by_id(tournament_id)
            if not tournament:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tournament not found",
                )
        self._assert_bracket(tournament)

        teams = await self.competition_repo.list_teams_by_tournament(tournament_id)
        matches = await self.competition_repo.list_matches_by_tournament(tournament_id)
        format_cfg = tournament.format_configuration or {}
        bracket_meta = format_cfg.get("bracket_data", {}).get("matches", {})

        matches_dicts = []
        for m in matches:
            meta = bracket_meta.get(str(m.id), {})
            matches_dicts.append({
                "id": m.id,
                "bracket_round": m.bracket_round,
                "bracket_position": m.bracket_position,
                "bracket_section": meta.get("bracket_section"),
                "label": meta.get("label"),
                "status": m.status.value if m.status else "pending",
                "score_a": m.score_a,
                "score_b": m.score_b,
                "winner_team_id": m.winner_team_id,
                "winner_team_name": m.winner_team.name if m.winner_team else None,
                "is_bye": meta.get("is_bye", False),
            })

        summary = BracketEngine.calculate_bracket_summary(
            tournament_id=tournament_id,
            teams_count=len(teams),
            matches=matches_dicts,
        )

        return BracketSummaryResponse(
            tournament_id=tournament_id,
            teams_count=summary.teams_count,
            bracket_size=summary.bracket_size,
            total_rounds=summary.total_rounds,
            byes_count=summary.byes_count,
            matches_total=summary.matches_total,
            matches_played=summary.matches_played,
            matches_remaining=summary.matches_remaining,
            current_round=summary.current_round,
            champion_team_id=summary.champion_team_id,
            champion_team_name=summary.champion_team_name,
        )

    # ─── Competition Customization & Lock (Phase 6) ───────────────────────────

    async def customize_teams(self, club_id: uuid.UUID, tournament_id: uuid.UUID, payload: "CustomizeTeamsRequest") -> None:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        if tournament.is_competition_locked:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Competition is locked")
        for t in payload.teams:
            await self.competition_repo.delete_team_members(t.id)
            for pm_id in t.player_membership_ids:
                await self.competition_repo.create_team_member(team_id=t.id, player_membership_id=pm_id)
            if t.name:
                team_obj = await self.competition_repo.get_team(t.id)
                if team_obj:
                    await self.competition_repo.update_team(team_obj, name=t.name)
        await self.db.commit()

    async def customize_pools(self, club_id: uuid.UUID, tournament_id: uuid.UUID, payload: "CustomizePoolsRequest") -> None:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        if tournament.is_competition_locked:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Competition is locked")
        for p in payload.pools:
            await self.competition_repo.delete_pool_teams(p.id)
            for team_id in p.team_ids:
                await self.competition_repo.create_pool_team(pool_id=p.id, team_id=team_id)
        await self.db.commit()

    async def customize_matchups(self, club_id: uuid.UUID, tournament_id: uuid.UUID, payload: "CustomizeMatchupsRequest") -> None:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        if tournament.is_competition_locked:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Competition is locked")
        for m in payload.matchups:
            await self.competition_repo.delete_match_participants(m.id)
            for slot, pm_id in enumerate(m.side_a_participant_ids, start=1):
                await self.competition_repo.create_match_participant(
                    match_id=m.id, player_membership_id=pm_id, side="side_a", partner_slot=slot
                )
            for slot, pm_id in enumerate(m.side_b_participant_ids, start=1):
                await self.competition_repo.create_match_participant(
                    match_id=m.id, player_membership_id=pm_id, side="side_b", partner_slot=slot
                )
        await self.db.commit()

    async def customize_seeding(self, club_id: uuid.UUID, tournament_id: uuid.UUID, payload: "CustomizeSeedingRequest") -> None:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        if tournament.is_competition_locked:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Competition is locked")
        for s in payload.seeds:
            team_obj = await self.competition_repo.get_team(s.team_id)
            if team_obj:
                await self.competition_repo.update_team(team_obj, seed=s.seed)
        await self.db.commit()

    async def lock_competition(self, club_id: uuid.UUID, tournament_id: uuid.UUID) -> None:
        tournament = await self._get_tournament_or_404(tournament_id, club_id)
        if tournament.is_competition_locked:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Competition is already locked")
        await self.tournament_repo.update(tournament, is_competition_locked=True, status=TournamentStatus.IN_PROGRESS)
        await self.db.commit()

