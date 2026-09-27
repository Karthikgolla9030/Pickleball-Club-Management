"""
Aught2 Pickleball — League Service (Phase 9)

Orchestrates all business logic, lifecycle rules, authorization checks,
team management, scheduling, scoring, standings, snapshots, and playoff execution.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_player_membership import PlayerMembershipStatus
from app.models.competition import Match, MatchStage, MatchStatus, Team
from app.models.league import (
    League,
    LeagueStatus,
    LeagueWeek,
    LeagueWeekStatus,
    LeagueWeekType,
    LeagueWeeklyStanding,
)
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.league_repository import LeagueRepository
from app.schemas.league import (
    LeagueCreateRequest,
    LeagueMatchResponse,
    LeagueResponse,
    LeagueSnapshotResponse,
    LeagueStandingRowResponse,
    LeagueStandingsResponse,
    LeagueTeamCreateRequest,
    LeagueTeamMemberResponse,
    LeagueTeamResponse,
    LeagueTeamUpdateRequest,
    LeagueUpdateRequest,
    LeagueWeekResponse,
    PlayoffSummaryResponse,
)
from app.services.competition.bracket_engine import BracketEngine
from app.services.competition.league_engine import (
    LeagueConfigurationError,
    LeagueEngine,
    LeagueStandingRow,
)
from app.services.competition.score_validator import ScoreValidationError, validate_score


class LeagueService:
    """Service layer for the League competition domain."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.league_repo = LeagueRepository(db)
        self.member_repo = ClubPlayerMembershipRepository(db)
        self.engine = LeagueEngine()
        self.bracket_engine = BracketEngine()

    # ─── Internal Helpers ─────────────────────────────────────────────────────

    async def _get_league_or_404(
        self,
        league_id: uuid.UUID,
        club_id: uuid.UUID | None = None,
    ) -> League:
        league = await self.league_repo.get_league(league_id, club_id=club_id)
        if not league:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="League not found or does not belong to this club.",
            )
        return league

    def _assert_status(self, league: League, allowed: list[LeagueStatus], action: str) -> None:
        if league.status not in allowed:
            allowed_str = ", ".join(s.value for s in allowed)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot {action} when league status is '{league.status.value}'. Allowed: {allowed_str}.",
            )

    # ─── League Lifecycle ─────────────────────────────────────────────────────

    async def create_league(
        self,
        club_id: uuid.UUID,
        payload: LeagueCreateRequest,
    ) -> LeagueResponse:
        """Create a new league in DRAFT status and initialize its weeks."""
        if payload.number_of_weeks < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="League duration must be at least 2 weeks (Weeks 1..N-1 Regular Season, Week N Playoffs).",
            )
        if payload.playoff_team_count < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Playoff team count must be at least 2.",
            )

        scoring_rules = payload.scoring_rules or {
            "game_format": "single_game",
            "target_score": 11,
            "win_by": 2,
        }

        league = await self.league_repo.create_league(
            club_id=club_id,
            name=payload.name.strip(),
            description=payload.description.strip() if payload.description else None,
            status=LeagueStatus.DRAFT,
            number_of_weeks=payload.number_of_weeks,
            current_week=1,
            team_size=payload.team_size,
            playoff_team_count=payload.playoff_team_count,
            scoring_rules=scoring_rules,
            start_date=payload.start_date,
        )

        # Create LeagueWeek records: 1..N-1 Regular Season, N Playoffs
        weeks_data = []
        for w in range(1, payload.number_of_weeks + 1):
            is_playoff = (w == payload.number_of_weeks)
            weeks_data.append({
                "league_id": league.id,
                "week_number": w,
                "week_type": LeagueWeekType.PLAYOFFS if is_playoff else LeagueWeekType.REGULAR_SEASON,
                "status": LeagueWeekStatus.PENDING,
            })
        await self.league_repo.create_league_weeks_bulk(weeks_data)
        await self.db.commit()

        return await self.get_league(club_id, league.id)

    async def get_league(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
    ) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        return LeagueResponse.model_validate(league)

    async def list_club_leagues(self, club_id: uuid.UUID) -> list[LeagueResponse]:
        leagues = await self.league_repo.list_leagues_by_club(club_id)
        return [LeagueResponse.model_validate(l) for l in leagues]

    async def list_public_leagues(self) -> list[LeagueResponse]:
        leagues = await self.league_repo.list_public_leagues()
        return [LeagueResponse.model_validate(l) for l in leagues]

    async def update_league(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        payload: LeagueUpdateRequest,
    ) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(league, [LeagueStatus.DRAFT, LeagueStatus.REGISTRATION_OPEN], "update league")

        updates: dict[str, Any] = {}
        if payload.name is not None:
            updates["name"] = payload.name.strip()
        if payload.description is not None:
            updates["description"] = payload.description.strip()
        if payload.playoff_team_count is not None:
            if payload.playoff_team_count < 2:
                raise HTTPException(status_code=400, detail="Playoff team count must be at least 2.")
            updates["playoff_team_count"] = payload.playoff_team_count
        if payload.start_date is not None:
            updates["start_date"] = payload.start_date
        if payload.scoring_rules is not None:
            updates["scoring_rules"] = payload.scoring_rules

        # If number of weeks changed before schedule generation
        if payload.number_of_weeks is not None and payload.number_of_weeks != league.number_of_weeks:
            if payload.number_of_weeks < 2:
                raise HTTPException(status_code=400, detail="Duration must be at least 2 weeks.")
            existing_matches = await self.league_repo.count_all_league_matches(league_id)
            if existing_matches > 0:
                raise HTTPException(status_code=400, detail="Cannot change duration after schedule is generated.")
            updates["number_of_weeks"] = payload.number_of_weeks

            # Recreate weeks
            current_weeks = await self.league_repo.list_league_weeks(league_id)
            for cw in current_weeks:
                await self.db.delete(cw)
            await self.db.flush()

            weeks_data = []
            for w in range(1, payload.number_of_weeks + 1):
                is_playoff = (w == payload.number_of_weeks)
                weeks_data.append({
                    "league_id": league.id,
                    "week_number": w,
                    "week_type": LeagueWeekType.PLAYOFFS if is_playoff else LeagueWeekType.REGULAR_SEASON,
                    "status": LeagueWeekStatus.PENDING,
                })
            await self.league_repo.create_league_weeks_bulk(weeks_data)

        league = await self.league_repo.update_league(league, **updates)
        await self.db.commit()
        return await self.get_league(club_id, league_id)

    async def open_registration(self, club_id: uuid.UUID, league_id: uuid.UUID) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(league, [LeagueStatus.DRAFT], "open registration")
        league = await self.league_repo.update_league(league, status=LeagueStatus.REGISTRATION_OPEN)
        await self.db.commit()
        return await self.get_league(club_id, league_id)

    async def close_registration(self, club_id: uuid.UUID, league_id: uuid.UUID) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(league, [LeagueStatus.REGISTRATION_OPEN], "close registration")
        league = await self.league_repo.update_league(league, status=LeagueStatus.REGISTRATION_CLOSED)
        await self.db.commit()
        return await self.get_league(club_id, league_id)

    async def cancel_league(self, club_id: uuid.UUID, league_id: uuid.UUID) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        if league.status in (LeagueStatus.COMPLETED, LeagueStatus.CANCELLED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel a league that is already {league.status.value}.",
            )
        league = await self.league_repo.update_league(league, status=LeagueStatus.CANCELLED)
        await self.db.commit()
        return await self.get_league(club_id, league_id)

    # ─── Team Management ──────────────────────────────────────────────────────

    async def create_team(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        payload: LeagueTeamCreateRequest,
    ) -> LeagueTeamResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(
            league,
            [LeagueStatus.DRAFT, LeagueStatus.REGISTRATION_OPEN, LeagueStatus.REGISTRATION_CLOSED],
            "create team",
        )

        name = payload.name.strip()
        existing = await self.league_repo.get_team_by_name(league_id, name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A team named '{name}' already exists in this league.",
            )

        # Validate team size
        if len(payload.member_player_membership_ids) != league.team_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Team must have exactly {league.team_size} members (got {len(payload.member_player_membership_ids)}).",
            )

        # Validate duplicate player members
        if len(set(payload.member_player_membership_ids)) != len(payload.member_player_membership_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A team cannot contain duplicate players.",
            )

        # Validate membership existence, club ownership, and active status
        for pm_id in payload.member_player_membership_ids:
            pm = await self.member_repo.get_by_id(pm_id)
            if not pm or pm.club_id != club_id or pm.status != PlayerMembershipStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Player membership {pm_id} is not an active member of this club.",
                )

            # Validate player not already in another team in this league
            already_team = await self.league_repo.find_player_team_in_league(league_id, pm_id)
            if already_team:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Player is already a member of team '{already_team.name}' in this league.",
                )

        team = await self.league_repo.create_team(
            league_id=league_id,
            name=name,
            member_membership_ids=payload.member_player_membership_ids,
            seed=payload.seed,
        )
        await self.db.commit()
        return self._format_team_response(team)

    async def list_teams(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
    ) -> list[LeagueTeamResponse]:
        await self._get_league_or_404(league_id, club_id=club_id)
        teams = await self.league_repo.list_teams_by_league(league_id)
        return [self._format_team_response(t) for t in teams]

    async def get_team(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> LeagueTeamResponse:
        await self._get_league_or_404(league_id, club_id=club_id)
        team = await self.league_repo.get_team_by_id(team_id, league_id=league_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found in this league.")
        return self._format_team_response(team)

    async def update_team(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        team_id: uuid.UUID,
        payload: LeagueTeamUpdateRequest,
    ) -> LeagueTeamResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(
            league,
            [LeagueStatus.DRAFT, LeagueStatus.REGISTRATION_OPEN, LeagueStatus.REGISTRATION_CLOSED],
            "update team",
        )
        team = await self.league_repo.get_team_by_id(team_id, league_id=league_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found in this league.")

        updates: dict[str, Any] = {}
        if payload.name is not None:
            name = payload.name.strip()
            existing = await self.league_repo.get_team_by_name(league_id, name)
            if existing and existing.id != team_id:
                raise HTTPException(status_code=400, detail=f"Team '{name}' already exists.")
            updates["name"] = name
        if payload.seed is not None:
            updates["seed"] = payload.seed

        team = await self.league_repo.update_team(team, **updates)
        await self.db.commit()
        return self._format_team_response(team)

    async def delete_team(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        team_id: uuid.UUID,
    ) -> None:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(
            league,
            [LeagueStatus.DRAFT, LeagueStatus.REGISTRATION_OPEN, LeagueStatus.REGISTRATION_CLOSED],
            "delete team",
        )
        team = await self.league_repo.get_team_by_id(team_id, league_id=league_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found in this league.")

        matches_count = await self.league_repo.count_all_league_matches(league_id)
        if matches_count > 0:
            raise HTTPException(status_code=400, detail="Cannot delete team after schedule generation.")

        await self.league_repo.delete_team(team)
        await self.db.commit()

    async def get_player_team(
        self,
        league_id: uuid.UUID,
        player_membership_id: uuid.UUID,
    ) -> LeagueTeamResponse | None:
        team = await self.league_repo.find_player_team_in_league(league_id, player_membership_id)
        if not team:
            return None
        return self._format_team_response(team)

    def _format_team_response(self, team: Team) -> LeagueTeamResponse:
        members = []
        for m in team.members:
            disp_name = None
            if m.player_membership and m.player_membership.user and m.player_membership.user.player_profile:
                disp_name = m.player_membership.user.player_profile.display_name
            elif m.player_membership and m.player_membership.user:
                disp_name = m.player_membership.user.full_name
            members.append(
                LeagueTeamMemberResponse(
                    id=m.id,
                    player_membership_id=m.player_membership_id,
                    display_name=disp_name,
                )
            )
        return LeagueTeamResponse(
            id=team.id,
            league_id=team.league_id,
            name=team.name,
            seed=team.seed,
            members=members,
            created_at=team.created_at,
        )

    # ─── Regular Season Scheduling ────────────────────────────────────────────

    async def generate_schedule(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
    ) -> list[LeagueWeekResponse]:
        """
        Generate regular-season round-robin schedule and transition league to IN_PROGRESS.
        """
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(league, [LeagueStatus.REGISTRATION_CLOSED], "generate schedule")

        existing_matches = await self.league_repo.count_all_league_matches(league_id)
        if existing_matches > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Schedule already generated for this league.",
            )

        teams = await self.league_repo.list_teams_by_league(league_id)
        if len(teams) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"At least 2 teams required to generate schedule (got {len(teams)}).",
            )

        if league.playoff_team_count > len(teams):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Playoff team count ({league.playoff_team_count}) cannot exceed registered teams ({len(teams)}).",
            )

        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
        reg_weeks = league.number_of_weeks - 1

        try:
            match_slots = self.engine.generate_regular_season_schedule(team_dicts, reg_weeks)
        except LeagueConfigurationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

        # Map week_number to LeagueWeek id
        weeks = await self.league_repo.list_league_weeks(league_id)
        week_by_number = {w.week_number: w for w in weeks}

        matches_data = []
        for slot in match_slots:
            lw = week_by_number.get(slot.week_number)
            if not lw:
                continue
            matches_data.append({
                "league_id": league_id,
                "league_week_id": lw.id,
                "stage": MatchStage.REGULAR_SEASON,
                "round_number": slot.week_number,
                "match_number": slot.match_number,
                "team_a_id": slot.team_a_id,
                "team_b_id": slot.team_b_id,
                "status": MatchStatus.PENDING,
            })

        await self.league_repo.create_matches_bulk(matches_data)

        # Advance league status to IN_PROGRESS, Week 1 to IN_PROGRESS
        await self.league_repo.update_league(
            league,
            status=LeagueStatus.IN_PROGRESS,
            current_week=1,
        )
        if 1 in week_by_number:
            await self.league_repo.update_league_week(
                week_by_number[1],
                status=LeagueWeekStatus.IN_PROGRESS,
            )

        await self.db.commit()
        return await self.list_weeks(club_id, league_id)

    # ─── Weeks & Matches ──────────────────────────────────────────────────────

    async def list_weeks(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
    ) -> list[LeagueWeekResponse]:
        await self._get_league_or_404(league_id, club_id=club_id)
        weeks = await self.league_repo.list_league_weeks(league_id)
        matches = await self.league_repo.list_league_matches(league_id)

        matches_by_week: dict[uuid.UUID, list[LeagueMatchResponse]] = {}
        for m in matches:
            if m.league_week_id:
                matches_by_week.setdefault(m.league_week_id, []).append(self._format_match_response(m))

        resp = []
        for w in weeks:
            resp.append(
                LeagueWeekResponse(
                    id=w.id,
                    league_id=w.league_id,
                    week_number=w.week_number,
                    week_type=w.week_type,
                    status=w.status,
                    matches=matches_by_week.get(w.id, []),
                )
            )
        return resp

    async def get_week(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
        week_number: int,
    ) -> LeagueWeekResponse:
        await self._get_league_or_404(league_id, club_id=club_id)
        lw = await self.league_repo.get_league_week_by_number(league_id, week_number)
        if not lw:
            raise HTTPException(status_code=404, detail=f"Week {week_number} not found.")

        matches = await self.league_repo.list_league_matches(league_id, week_id=lw.id)
        return LeagueWeekResponse(
            id=lw.id,
            league_id=lw.league_id,
            week_number=lw.week_number,
            week_type=lw.week_type,
            status=lw.status,
            matches=[self._format_match_response(m) for m in matches],
        )

    async def list_matches(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
        week_number: int | None = None,
        stage: MatchStage | None = None,
    ) -> list[LeagueMatchResponse]:
        await self._get_league_or_404(league_id, club_id=club_id)
        week_id = None
        if week_number is not None:
            lw = await self.league_repo.get_league_week_by_number(league_id, week_number)
            if not lw:
                return []
            week_id = lw.id
        matches = await self.league_repo.list_league_matches(league_id, week_id=week_id, stage=stage)
        return [self._format_match_response(m) for m in matches]

    def _format_match_response(self, m: Match) -> LeagueMatchResponse:
        team_a_name = m.team_a.name if m.team_a else None
        team_b_name = m.team_b.name if m.team_b else None
        winner_name = m.winner_team.name if m.winner_team else None
        week_num = m.league_week.week_number if m.league_week else m.round_number
        is_bye = bool(m.status == MatchStatus.COMPLETED and m.score_a is None and m.score_b is None)

        return LeagueMatchResponse(
            id=m.id,
            league_id=m.league_id,
            league_week_id=m.league_week_id,
            week_number=week_num,
            round_number=m.round_number,
            match_number=m.match_number,
            stage=m.stage,
            bracket_round=m.bracket_round,
            bracket_position=m.bracket_position,
            team_a_id=m.team_a_id,
            team_b_id=m.team_b_id,
            team_a_name=team_a_name,
            team_b_name=team_b_name,
            score_a=m.score_a,
            score_b=m.score_b,
            status=m.status,
            winner_team_id=m.winner_team_id,
            winner_team_name=winner_name,
            completed_at=m.completed_at,
            is_bye=is_bye,
        )

    # ─── Match Scoring & Result Correction ────────────────────────────────────

    async def record_match_result(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        match_id: uuid.UUID,
        score_a: int,
        score_b: int,
    ) -> LeagueMatchResponse:
        """Record score for a pending match with validation and auto-advancement."""
        league = await self._get_league_or_404(league_id, club_id=club_id)
        match = await self.league_repo.get_match_by_id(match_id, league_id=league_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found in this league.")

        # Guard: check lock if regular season
        if match.stage == MatchStage.REGULAR_SEASON:
            if league.status in (LeagueStatus.PLAYOFFS, LeagueStatus.COMPLETED):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Regular season results are locked once playoffs begin.",
                )

        if match.status != MatchStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Score already recorded. Use correct-score to modify.",
            )

        if not match.team_a_id or not match.team_b_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot record scores on matches with unassigned teams.",
            )

        # Validate score (first to 11, win by 2)
        rules = league.scoring_rules or {"target_score": 11, "win_by": 2}
        target = rules.get("target_score", 11)
        win_by = rules.get("win_by", 2)
        try:
            winner_side = validate_score(score_a, score_b, target_score=target, win_by=win_by)
        except ScoreValidationError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e

        winner_id = match.team_a_id if winner_side == "a" else match.team_b_id

        # Update match
        now = datetime.now(timezone.utc)
        await self.league_repo.update_match(
            match,
            score_a=score_a,
            score_b=score_b,
            winner_team_id=winner_id,
            status=MatchStatus.COMPLETED,
            completed_at=now,
        )

        # Handle post-scoring logic depending on stage
        if match.stage == MatchStage.REGULAR_SEASON:
            await self._handle_regular_season_match_scored(league, match)
        elif match.stage == MatchStage.PLAYOFFS:
            await self._handle_playoff_match_scored(league, match, winner_id)

        await self.db.commit()
        updated_match = await self.league_repo.get_match_by_id(match_id, league_id=league_id)
        return self._format_match_response(updated_match)

    async def correct_match_result(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        match_id: uuid.UUID,
        score_a: int,
        score_b: int,
    ) -> LeagueMatchResponse:
        """Safely correct score on an already completed match."""
        league = await self._get_league_or_404(league_id, club_id=club_id)
        match = await self.league_repo.get_match_by_id(match_id, league_id=league_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found in this league.")

        if match.status != MatchStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot correct result: match is not completed.",
            )

        # Guard: cannot modify regular season if playoffs have begun
        if match.stage == MatchStage.REGULAR_SEASON:
            if league.status in (LeagueStatus.PLAYOFFS, LeagueStatus.COMPLETED):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Regular season results are locked once playoffs begin.",
                )
        elif match.stage == MatchStage.PLAYOFFS:
            # Playoff correction safety: check downstream match
            if match.next_match_id:
                next_m = await self.league_repo.get_match_by_id(match.next_match_id, league_id=league_id)
                if next_m and next_m.status == MatchStatus.COMPLETED:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot correct playoff match result: the downstream match has already been completed.",
                    )

        # Validate score
        rules = league.scoring_rules or {"target_score": 11, "win_by": 2}
        target = rules.get("target_score", 11)
        win_by = rules.get("win_by", 2)
        try:
            winner_side = validate_score(score_a, score_b, target_score=target, win_by=win_by)
        except ScoreValidationError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e

        winner_id = match.team_a_id if winner_side == "a" else match.team_b_id

        await self.league_repo.update_match(
            match,
            score_a=score_a,
            score_b=score_b,
            winner_team_id=winner_id,
        )

        # Recalculate standings & snapshots if regular season
        if match.stage == MatchStage.REGULAR_SEASON:
            await self._update_standings_and_snapshots(league)
        elif match.stage == MatchStage.PLAYOFFS:
            # Update winner in next match if applicable
            if match.next_match_id and match.next_match_slot:
                next_m = await self.league_repo.get_match_by_id(match.next_match_id, league_id=league_id)
                if next_m:
                    if match.next_match_slot == "team_a":
                        await self.league_repo.update_match(next_m, team_a_id=winner_id)
                    else:
                        await self.league_repo.update_match(next_m, team_b_id=winner_id)
            # If this is the final, update champion
            total_rounds = await self._get_playoff_total_rounds(league_id)
            if match.bracket_round == total_rounds:
                await self.league_repo.update_league(league, champion_team_id=winner_id)

        await self.db.commit()
        updated_match = await self.league_repo.get_match_by_id(match_id, league_id=league_id)
        return self._format_match_response(updated_match)

    async def _handle_regular_season_match_scored(self, league: League, match: Match) -> None:
        """Post-scoring handler for regular season matches."""
        # 1. Update standings & snapshots
        await self._update_standings_and_snapshots(league)

        # 2. Check if week is completed
        if match.league_week_id:
            week_matches = await self.league_repo.list_league_matches(
                league.id, week_id=match.league_week_id
            )
            all_week_done = all(m.status == MatchStatus.COMPLETED for m in week_matches)
            if all_week_done:
                lw = await self.league_repo.get_league_week_by_number(
                    league.id, match.league_week.week_number if match.league_week else match.round_number
                )
                if lw:
                    await self.league_repo.update_league_week(lw, status=LeagueWeekStatus.COMPLETED)

                    # Transition next week to IN_PROGRESS if exists
                    next_week = await self.league_repo.get_league_week_by_number(
                        league.id, lw.week_number + 1
                    )
                    if next_week and next_week.week_type == LeagueWeekType.REGULAR_SEASON:
                        await self.league_repo.update_league_week(
                            next_week, status=LeagueWeekStatus.IN_PROGRESS
                        )
                        await self.league_repo.update_league(
                            league, current_week=next_week.week_number
                        )

        # 3. Check if ALL regular season matches are completed
        all_reg_matches = await self.league_repo.list_league_matches(
            league.id, stage=MatchStage.REGULAR_SEASON
        )
        if all_reg_matches and all(m.status == MatchStatus.COMPLETED for m in all_reg_matches):
            # Auto-transition to playoffs!
            await self._generate_playoffs_internal(league)

    async def _handle_playoff_match_scored(
        self,
        league: League,
        match: Match,
        winner_id: uuid.UUID,
    ) -> None:
        """Post-scoring handler for playoff matches."""
        # 1. Auto-advance winner to next match
        if match.next_match_id and match.next_match_slot:
            next_m = await self.league_repo.get_match_by_id(match.next_match_id, league_id=league.id)
            if next_m:
                if match.next_match_slot == "team_a":
                    await self.league_repo.update_match(next_m, team_a_id=winner_id)
                else:
                    await self.league_repo.update_match(next_m, team_b_id=winner_id)

        # 2. Check if final match completed
        total_rounds = await self._get_playoff_total_rounds(league.id)
        if match.bracket_round == total_rounds:
            # League is completed! Champion crowned!
            await self.league_repo.update_league(
                league,
                champion_team_id=winner_id,
                status=LeagueStatus.COMPLETED,
            )
            # Mark playoff week completed
            playoff_week = await self.league_repo.get_league_week_by_number(
                league.id, league.number_of_weeks
            )
            if playoff_week:
                await self.league_repo.update_league_week(
                    playoff_week, status=LeagueWeekStatus.COMPLETED
                )

    async def _get_playoff_total_rounds(self, league_id: uuid.UUID) -> int:
        playoff_matches = await self.league_repo.list_league_matches(
            league_id, stage=MatchStage.PLAYOFFS
        )
        if not playoff_matches:
            return 0
        return max((m.bracket_round or 0) for m in playoff_matches)

    # ─── Standings & Snapshots ────────────────────────────────────────────────

    async def _update_standings_and_snapshots(self, league: League) -> None:
        """Recalculate cumulative standings and update weekly snapshots."""
        teams = await self.league_repo.list_teams_by_league(league.id)
        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]

        reg_matches = await self.league_repo.list_league_matches(
            league.id, stage=MatchStage.REGULAR_SEASON
        )
        completed_matches = [
            {
                "status": m.status.value,
                "score_a": m.score_a,
                "score_b": m.score_b,
                "team_a_id": m.team_a_id,
                "team_b_id": m.team_b_id,
                "week_number": m.league_week.week_number if m.league_week else m.round_number,
            }
            for m in reg_matches
        ]

        weeks = await self.league_repo.list_league_weeks(league.id)
        for w in weeks:
            if w.week_type != LeagueWeekType.REGULAR_SEASON:
                continue
            # Standings for week w = matches completed up through week w
            matches_up_to_w = [
                m for m in completed_matches
                if m.get("week_number", 0) <= w.week_number
            ]
            standings_w = self.engine.calculate_standings(team_dicts, matches_up_to_w)
            await self.league_repo.save_weekly_snapshots(
                league_id=league.id,
                league_week_id=w.id,
                week_number=w.week_number,
                standings_rows=standings_w,
            )

    async def get_standings(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
        week_number: int | None = None,
    ) -> LeagueStandingsResponse:
        """
        Return current cumulative regular-season standings or snapshot for a specific week.
        """
        league = await self._get_league_or_404(league_id, club_id=club_id)

        if week_number is not None:
            # Return snapshot from database
            snapshots = await self.league_repo.list_weekly_snapshots(
                league_id, week_number=week_number
            )
            rows = [
                LeagueStandingRowResponse(
                    team_id=s.team_id,
                    team_name=s.team.name if s.team else "Unknown",
                    rank=s.rank,
                    matches_played=s.matches_played,
                    wins=s.wins,
                    losses=s.losses,
                    points_scored=s.points_scored,
                    points_allowed=s.points_allowed,
                    points_differential=s.points_differential,
                )
                for s in snapshots
            ]
            return LeagueStandingsResponse(
                league_id=league.id,
                current_week=week_number,
                is_playoffs_started=league.status in (LeagueStatus.PLAYOFFS, LeagueStatus.COMPLETED),
                standings=rows,
            )

        # Return live cumulative standings
        teams = await self.league_repo.list_teams_by_league(league.id)
        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]
        reg_matches = await self.league_repo.list_league_matches(
            league.id, stage=MatchStage.REGULAR_SEASON
        )
        completed_matches = [
            {
                "status": m.status.value,
                "score_a": m.score_a,
                "score_b": m.score_b,
                "team_a_id": m.team_a_id,
                "team_b_id": m.team_b_id,
            }
            for m in reg_matches
        ]
        standings = self.engine.calculate_standings(team_dicts, completed_matches)

        rows = [
            LeagueStandingRowResponse(
                team_id=s.team_id,
                team_name=s.team_name,
                rank=s.rank,
                matches_played=s.matches_played,
                wins=s.wins,
                losses=s.losses,
                points_scored=s.points_scored,
                points_allowed=s.points_allowed,
                points_differential=s.points_differential,
            )
            for s in standings
        ]
        return LeagueStandingsResponse(
            league_id=league.id,
            current_week=league.current_week,
            is_playoffs_started=league.status in (LeagueStatus.PLAYOFFS, LeagueStatus.COMPLETED),
            standings=rows,
        )

    async def list_snapshots(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
    ) -> list[LeagueSnapshotResponse]:
        """Return all weekly snapshots grouped by week."""
        await self._get_league_or_404(league_id, club_id=club_id)
        snapshots = await self.league_repo.list_weekly_snapshots(league_id)

        grouped: dict[int, list[LeagueStandingRowResponse]] = {}
        for s in snapshots:
            grouped.setdefault(s.week_number, []).append(
                LeagueStandingRowResponse(
                    team_id=s.team_id,
                    team_name=s.team.name if s.team else "Unknown",
                    rank=s.rank,
                    matches_played=s.matches_played,
                    wins=s.wins,
                    losses=s.losses,
                    points_scored=s.points_scored,
                    points_allowed=s.points_allowed,
                    points_differential=s.points_differential,
                )
            )

        return [
            LeagueSnapshotResponse(
                league_id=league_id,
                week_number=w_num,
                standings=rows,
            )
            for w_num, rows in sorted(grouped.items())
        ]

    # ─── Playoff Generation & Execution ───────────────────────────────────────

    async def generate_playoffs(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
    ) -> PlayoffSummaryResponse:
        """Staff endpoint to explicitly trigger playoff generation."""
        league = await self._get_league_or_404(league_id, club_id=club_id)
        if league.status in (LeagueStatus.PLAYOFFS, LeagueStatus.COMPLETED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Playoff bracket already generated for this league.",
            )
        self._assert_status(league, [LeagueStatus.IN_PROGRESS], "generate playoffs")

        # Verify all regular season matches are completed
        reg_matches = await self.league_repo.list_league_matches(
            league_id, stage=MatchStage.REGULAR_SEASON
        )
        if not reg_matches:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot generate playoffs: regular season schedule has not been generated.",
            )
        if any(m.status != MatchStatus.COMPLETED for m in reg_matches):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="All regular season matches must be completed before generating playoffs.",
            )

        await self._generate_playoffs_internal(league)
        await self.db.commit()
        return await self.get_playoffs(club_id, league_id)

    async def _generate_playoffs_internal(self, league: League) -> None:
        """Internal worker to qualify teams, seed, and generate playoff bracket."""
        existing_playoffs = await self.league_repo.list_league_matches(
            league.id, stage=MatchStage.PLAYOFFS
        )
        if existing_playoffs:
            return  # Idempotent: already generated

        teams = await self.league_repo.list_teams_by_league(league.id)
        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]

        reg_matches = await self.league_repo.list_league_matches(
            league.id, stage=MatchStage.REGULAR_SEASON
        )
        completed_matches = [
            {
                "status": m.status.value,
                "score_a": m.score_a,
                "score_b": m.score_b,
                "team_a_id": m.team_a_id,
                "team_b_id": m.team_b_id,
            }
            for m in reg_matches
        ]
        standings = self.engine.calculate_standings(team_dicts, completed_matches)

        try:
            qualified = self.engine.prepare_playoff_teams(
                standings, league.playoff_team_count
            )
            bracket_slots = self.engine.generate_playoff_bracket(league.id, qualified)
        except LeagueConfigurationError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

        # Find playoff week (Week N)
        playoff_week = await self.league_repo.get_league_week_by_number(
            league.id, league.number_of_weeks
        )
        if not playoff_week:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Playoff week configuration missing.",
            )

        matches_data = []
        for slot in bracket_slots:
            matches_data.append({
                "id": slot.id,
                "tournament_id": None,
                "league_id": league.id,
                "league_week_id": playoff_week.id,
                "stage": MatchStage.PLAYOFFS,
                "round_number": slot.bracket_round,
                "match_number": slot.match_number,
                "bracket_round": slot.bracket_round,
                "bracket_position": slot.bracket_position,
                "next_match_id": slot.next_match_id,
                "next_match_slot": slot.next_match_slot,
                "team_a_id": slot.team_a_id,
                "team_b_id": slot.team_b_id,
                "status": MatchStatus.COMPLETED if slot.is_bye else MatchStatus.PENDING,
                "winner_team_id": slot.winner_team_id,
                "score_a": None,
                "score_b": None,
                "completed_at": datetime.now(timezone.utc) if slot.is_bye else None,
            })

        await self.league_repo.create_matches_bulk(matches_data)

        # Update league status to PLAYOFFS, current_week to playoff week
        await self.league_repo.update_league(
            league,
            status=LeagueStatus.PLAYOFFS,
            current_week=league.number_of_weeks,
        )
        await self.league_repo.update_league_week(
            playoff_week,
            status=LeagueWeekStatus.IN_PROGRESS,
        )

    async def get_playoffs(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
    ) -> PlayoffSummaryResponse:
        """Return playoff bracket, rounds, and champion."""
        league = await self._get_league_or_404(league_id, club_id=club_id)
        playoff_matches = await self.league_repo.list_league_matches(
            league_id, stage=MatchStage.PLAYOFFS
        )

        formatted_matches = [self._format_match_response(m) for m in playoff_matches]
        total_rounds = max((m.bracket_round or 0) for m in playoff_matches) if playoff_matches else 0
        byes_count = sum(1 for m in formatted_matches if m.is_bye)

        champ_name = None
        if league.champion_team_id:
            champ = await self.league_repo.get_team_by_id(league.champion_team_id, league_id=league_id)
            if champ:
                champ_name = champ.name

        return PlayoffSummaryResponse(
            league_id=league.id,
            playoff_week_number=league.number_of_weeks,
            total_playoff_teams=league.playoff_team_count,
            bracket_size=1 << total_rounds if total_rounds > 0 else 0,
            total_rounds=total_rounds,
            byes_count=byes_count,
            matches=formatted_matches,
            champion_team_id=league.champion_team_id,
            champion_team_name=champ_name,
        )
