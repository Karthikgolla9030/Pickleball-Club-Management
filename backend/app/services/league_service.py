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
from app.models.user import User
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.league_repository import LeagueRepository
from app.schemas.league import (
    LeagueCreateRequest,
    LeagueMatchResponse,
    LeagueRegistrationStatusResponse,
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
    LeagueWeekUpdateRequest,
    LeagueEligiblePartnerResponse,
    PlayerLeagueRegisterRequest,
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
            max_teams=payload.max_teams,
            registration_fee=payload.registration_fee,
            registration_open_at=payload.registration_open_at,
            registration_close_at=payload.registration_close_at,
            scoring_rules=scoring_rules,
            start_date=payload.start_date,
            end_date=payload.end_date,
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

    async def _format_league_response(
        self,
        league: League,
        teams_count: int | None = None,
        total_matches: int = 0,
        completed_matches: int = 0,
        is_registered: bool = False,
        my_team_id: uuid.UUID | None = None,
        my_team_name: str | None = None,
    ) -> LeagueResponse:
        if teams_count is None:
            teams_count = await self.league_repo.count_teams_by_league(league.id)

        champion_team_dict = None
        if league.champion_team:
            champion_team_dict = {"id": str(league.champion_team.id), "name": league.champion_team.name}
        elif league.champion_team_id:
            champ = await self.league_repo.get_team_by_id(league.champion_team_id, league_id=league.id)
            if champ:
                champion_team_dict = {"id": str(champ.id), "name": champ.name}

        return LeagueResponse(
            id=league.id,
            club_id=league.club_id,
            name=league.name,
            description=league.description,
            status=league.status,
            status_display=league.status.display_label,
            number_of_weeks=league.number_of_weeks,
            current_week=league.current_week,
            team_size=league.team_size,
            playoff_team_count=league.playoff_team_count,
            max_teams=league.max_teams,
            registration_fee=float(league.registration_fee) if league.registration_fee is not None else None,
            registration_open_at=league.registration_open_at,
            registration_close_at=league.registration_close_at,
            scoring_rules=league.scoring_rules,
            start_date=league.start_date,
            end_date=league.end_date,
            champion_team_id=league.champion_team_id,
            champion_team=champion_team_dict,
            teams_count=teams_count,
            weeks_count=league.number_of_weeks,
            total_matches_count=total_matches,
            completed_matches_count=completed_matches,
            is_registered=is_registered,
            my_team_id=my_team_id,
            my_team_name=my_team_name,
            created_at=league.created_at,
            updated_at=league.updated_at,
        )

    async def get_league(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
        current_user: User | None = None,
    ) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        m_counts = await self.league_repo.get_match_counts(league_id)
        is_reg = False
        my_tid = None
        my_tname = None
        if current_user:
            user_teams = await self.league_repo.get_user_teams_for_leagues(current_user.id, [league_id])
            if league_id in user_teams:
                is_reg = True
                my_tid = user_teams[league_id].id
                my_tname = user_teams[league_id].name

        return await self._format_league_response(
            league,
            total_matches=m_counts.get("total", 0),
            completed_matches=m_counts.get("completed", 0),
            is_registered=is_reg,
            my_team_id=my_tid,
            my_team_name=my_tname,
        )

    async def list_club_leagues(self, club_id: uuid.UUID) -> list[LeagueResponse]:
        leagues = await self.league_repo.list_leagues_by_club(club_id)
        l_ids = [l.id for l in leagues]
        counts = await self.league_repo.get_team_counts_for_leagues(l_ids)
        m_counts = await self.league_repo.get_match_counts_for_leagues(l_ids)
        return [
            await self._format_league_response(
                l,
                teams_count=counts.get(l.id, 0),
                total_matches=m_counts.get(l.id, {}).get("total", 0),
                completed_matches=m_counts.get(l.id, {}).get("completed", 0),
            )
            for l in leagues
        ]

    async def list_public_leagues(self, current_user: User | None = None) -> list[LeagueResponse]:
        leagues = await self.league_repo.list_public_leagues()
        l_ids = [l.id for l in leagues]
        counts = await self.league_repo.get_team_counts_for_leagues(l_ids)
        m_counts = await self.league_repo.get_match_counts_for_leagues(l_ids)
        user_teams: dict[uuid.UUID, Any] = {}
        if current_user and l_ids:
            user_teams = await self.league_repo.get_user_teams_for_leagues(current_user.id, l_ids)

        return [
            await self._format_league_response(
                l,
                teams_count=counts.get(l.id, 0),
                total_matches=m_counts.get(l.id, {}).get("total", 0),
                completed_matches=m_counts.get(l.id, {}).get("completed", 0),
                is_registered=l.id in user_teams,
                my_team_id=user_teams[l.id].id if l.id in user_teams else None,
                my_team_name=user_teams[l.id].name if l.id in user_teams else None,
            )
            for l in leagues
        ]

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
        if payload.team_size is not None:
            updates["team_size"] = payload.team_size
        if payload.max_teams is not None:
            updates["max_teams"] = payload.max_teams
        if payload.registration_fee is not None:
            updates["registration_fee"] = payload.registration_fee
        if payload.registration_open_at is not None:
            updates["registration_open_at"] = payload.registration_open_at
        if payload.registration_close_at is not None:
            updates["registration_close_at"] = payload.registration_close_at
        if payload.start_date is not None:
            updates["start_date"] = payload.start_date
        if payload.end_date is not None:
            updates["end_date"] = payload.end_date
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
        if not league.name or not league.name.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="League name is required before opening registration.")
        if (league.number_of_weeks or 0) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="League must have at least 2 weeks configured before opening registration.")
        if (league.max_teams or 0) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="League must allow at least 2 teams before opening registration.")

        league = await self.league_repo.update_league(league, status=LeagueStatus.REGISTRATION_OPEN)
        await self.db.commit()
        return await self.get_league(club_id, league_id)

    async def close_registration(self, club_id: uuid.UUID, league_id: uuid.UUID) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(league, [LeagueStatus.REGISTRATION_OPEN], "close registration")
        league = await self.league_repo.update_league(league, status=LeagueStatus.REGISTRATION_CLOSED)
        await self.db.commit()
        return await self.get_league(club_id, league_id)

    async def start_league(self, club_id: uuid.UUID, league_id: uuid.UUID) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(league, [LeagueStatus.REGISTRATION_CLOSED], "start league")

        teams = await self.league_repo.list_teams_by_league(league_id)
        if len(teams) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"At least 2 teams required to start league (got {len(teams)}).",
            )

        reg_matches = await self.league_repo.list_league_matches(
            league_id, stage=MatchStage.REGULAR_SEASON
        )
        if not reg_matches:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start league: regular season schedule has not been generated yet. Please generate schedule first.",
            )

        # Advance league status to IN_PROGRESS, current_week to 1
        await self.league_repo.update_league(
            league,
            status=LeagueStatus.IN_PROGRESS,
            current_week=1,
        )

        # Transition Week 1 to IN_PROGRESS if pending
        week1 = await self.league_repo.get_league_week_by_number(league_id, 1)
        if week1 and week1.status == LeagueWeekStatus.PENDING:
            await self.league_repo.update_league_week(
                week1,
                status=LeagueWeekStatus.IN_PROGRESS,
            )

        await self.db.commit()
        return await self.get_league(club_id, league_id)

    async def complete_league(self, club_id: uuid.UUID, league_id: uuid.UUID) -> LeagueResponse:
        league = await self._get_league_or_404(league_id, club_id=club_id)
        if league.status == LeagueStatus.COMPLETED:
            return await self.get_league(club_id, league_id)
        self._assert_status(
            league,
            [LeagueStatus.IN_PROGRESS, LeagueStatus.PLAYOFFS],
            "complete league",
        )

        # 1. Check if playoffs are configured for this league
        if league.playoff_team_count and league.playoff_team_count > 0:
            playoff_matches = await self.league_repo.list_league_matches(
                league_id, stage=MatchStage.PLAYOFFS
            )
            if not playoff_matches:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot complete league: playoff bracket has not been generated yet. Conclude regular season and generate playoffs first.",
                )
            unfinished_playoffs = [m for m in playoff_matches if m.status != MatchStatus.COMPLETED]
            if unfinished_playoffs:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot complete league: {len(unfinished_playoffs)} playoff match(es) remain unfinished.",
                )
            total_rounds = max(m.bracket_round or 0 for m in playoff_matches)
            final_matches = [m for m in playoff_matches if m.bracket_round == total_rounds]
            champion_id = final_matches[0].winner_team_id if final_matches else None
        else:
            # No playoffs configured: all regular season matches must be completed
            reg_matches = await self.league_repo.list_league_matches(
                league_id, stage=MatchStage.REGULAR_SEASON
            )
            if not reg_matches:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot complete league: no matches have been generated or played.",
                )
            unfinished_reg = [m for m in reg_matches if m.status != MatchStatus.COMPLETED]
            if unfinished_reg:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot complete league: {len(unfinished_reg)} regular season match(es) remain unfinished.",
                )
            standings_resp = await self.get_standings(club_id, league_id)
            champion_id = standings_resp.standings[0].team_id if standings_resp.standings else None

        await self.league_repo.update_league(
            league,
            status=LeagueStatus.COMPLETED,
            champion_team_id=champion_id,
        )

        # Mark all league weeks as completed
        weeks = await self.league_repo.list_league_weeks(league_id)
        for w in weeks:
            if w.status != LeagueWeekStatus.COMPLETED:
                await self.league_repo.update_league_week(w, status=LeagueWeekStatus.COMPLETED)

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
        skill_ratings: list[float] = []
        for m in team.members:
            disp_name = None
            rating: float | None = None
            if m.player_membership and m.player_membership.user:
                if m.player_membership.user.player_profile:
                    disp_name = m.player_membership.user.player_profile.display_name or m.player_membership.user.full_name
                    if m.player_membership.user.player_profile.skill_rating is not None:
                        rating = float(m.player_membership.user.player_profile.skill_rating)
                if not disp_name:
                    disp_name = m.player_membership.user.full_name
            elif m.guest_name:
                disp_name = m.guest_name

            member_rating = rating if rating is not None else 3.5
            skill_ratings.append(member_rating)

            members.append(
                LeagueTeamMemberResponse(
                    id=m.id,
                    player_membership_id=m.player_membership_id,
                    display_name=disp_name,
                    is_guest=m.player_membership_id is None,
                    skill_rating=round(member_rating, 1),
                )
            )

        avg_skill = round(sum(skill_ratings) / len(skill_ratings), 1) if skill_ratings else 3.5
        return LeagueTeamResponse(
            id=team.id,
            league_id=team.league_id,
            name=team.name,
            seed=team.seed,
            avg_skill_level=avg_skill,
            members=members,
            created_at=team.created_at,
        )

    # ─── Regular Season Scheduling ────────────────────────────────────────────

    async def generate_schedule(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        force: bool = False,
    ) -> list[LeagueWeekResponse]:
        """
        Generate regular-season round-robin schedule for all configured regular-season weeks.
        Does NOT generate playoff matches (playoffs are managed separately).
        Does NOT transition league status to IN_PROGRESS (the manager uses Start League).
        """
        league = await self._get_league_or_404(league_id, club_id=club_id)
        self._assert_status(
            league,
            [LeagueStatus.REGISTRATION_CLOSED, LeagueStatus.IN_PROGRESS],
            "generate schedule",
        )

        existing_matches = await self.league_repo.list_league_matches(
            league_id, stage=MatchStage.REGULAR_SEASON
        )
        if existing_matches:
            # Check if any matches have recorded scores / completed
            has_completed = any(
                m.status == MatchStatus.COMPLETED or m.score_a is not None or m.score_b is not None
                for m in existing_matches
            )
            if has_completed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot regenerate schedule: regular season match scores have already been recorded. Completed results must be preserved.",
                )
            if not force:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Schedule already generated for this league. Confirm regeneration to overwrite existing unplayed fixtures.",
                )
            # Safe regeneration requested: remove unplayed regular-season matches
            await self.league_repo.delete_league_matches_by_stage(league_id, MatchStage.REGULAR_SEASON)

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
        reg_weeks = (
            league.number_of_weeks - 1
            if (league.playoff_team_count and league.playoff_team_count > 0)
            else league.number_of_weeks
        )
        if reg_weeks < 1:
            reg_weeks = 1

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

        # Note: We do NOT auto-transition league to IN_PROGRESS here.
        # Schedule preparation can happen before the first match, and the manager
        # uses the Start League action to begin play.

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
                    start_date=w.start_date,
                    end_date=w.end_date,
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
            start_date=lw.start_date,
            end_date=lw.end_date,
            matches=[self._format_match_response(m) for m in matches],
        )

    async def update_week(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
        week_number: int,
        payload: LeagueWeekUpdateRequest,
    ) -> LeagueWeekResponse:
        await self._get_league_or_404(league_id, club_id=club_id)
        lw = await self.league_repo.get_league_week_by_number(league_id, week_number)
        if not lw:
            raise HTTPException(status_code=404, detail=f"Week {week_number} not found.")

        updates: dict[str, Any] = {}
        if payload.start_date is not None:
            updates["start_date"] = payload.start_date
        if payload.end_date is not None:
            updates["end_date"] = payload.end_date

        if updates:
            await self.league_repo.update_league_week(lw, **updates)
            await self.db.commit()

        return await self.get_week(club_id, league_id, week_number)

    async def list_matches(
        self,
        club_id: uuid.UUID | None,
        league_id: uuid.UUID,
        week_number: int | None = None,
        week_id: uuid.UUID | None = None,
        stage: MatchStage | None = None,
    ) -> list[LeagueMatchResponse]:
        await self._get_league_or_404(league_id, club_id=club_id)
        target_week_id = week_id
        if target_week_id is None and week_number is not None:
            lw = await self.league_repo.get_league_week_by_number(league_id, week_number)
            if not lw:
                return []
            target_week_id = lw.id
        matches = await self.league_repo.list_league_matches(league_id, week_id=target_week_id, stage=stage)
        return [self._format_match_response(m) for m in matches]

    def _format_match_response(self, m: Match) -> LeagueMatchResponse:
        team_a_name = m.team_a.name if m.team_a else None
        team_b_name = m.team_b.name if m.team_b else None
        winner_name = m.winner_team.name if m.winner_team else None
        week_num = m.league_week.week_number if m.league_week else m.round_number
        is_bye = bool(m.status == MatchStatus.COMPLETED and m.score_a is None and m.score_b is None)

        team_a_members: list[str] = []
        if m.team_a and hasattr(m.team_a, "members") and m.team_a.members:
            for member in m.team_a.members:
                name = None
                if member.player_membership and member.player_membership.user:
                    name = member.player_membership.user.full_name or member.player_membership.user.email
                elif member.guest_name:
                    name = member.guest_name
                if name:
                    team_a_members.append(name)

        team_b_members: list[str] = []
        if m.team_b and hasattr(m.team_b, "members") and m.team_b.members:
            for member in m.team_b.members:
                name = None
                if member.player_membership and member.player_membership.user:
                    name = member.player_membership.user.full_name or member.player_membership.user.email
                elif member.guest_name:
                    name = member.guest_name
                if name:
                    team_b_members.append(name)

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
            team_a_members=team_a_members,
            team_b_members=team_b_members,
            score_a=m.score_a,
            score_b=m.score_b,
            status=m.status,
            winner_team_id=m.winner_team_id,
            winner_team_name=winner_name,
            completed_at=m.completed_at,
            is_bye=is_bye,
            court_id=m.court_id,
            court_name=m.court.name if m.court else None,
            scheduled_start_at=m.scheduled_start_at,
            scheduled_end_at=m.scheduled_end_at,
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
        team_members_map: dict[uuid.UUID, list[str]] = {}
        for t in teams:
            m_names: list[str] = []
            for m in t.members:
                if m.player_membership and m.player_membership.user:
                    m_names.append(m.player_membership.user.full_name or m.player_membership.user.email)
                elif m.guest_name:
                    m_names.append(m.guest_name)
            team_members_map[t.id] = m_names

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
                members=team_members_map.get(s.team_id, []),
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

    # ─── Manual Snapshot Operations ───────────────────────────────────────────

    async def snapshot_week(
        self,
        club_id: uuid.UUID,
        league_id: uuid.UUID,
        week_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Manually trigger or refresh standing snapshot for a specific week."""
        league = await self._get_league_or_404(league_id, club_id=club_id)
        weeks = await self.league_repo.list_league_weeks(league_id)
        target_week = next((w for w in weeks if w.id == week_id), None)
        if not target_week:
            raise HTTPException(status_code=404, detail="Week not found in this league.")

        teams = await self.league_repo.list_teams_by_league(league_id)
        team_dicts = [{"id": t.id, "name": t.name, "seed": t.seed} for t in teams]

        reg_matches = await self.league_repo.list_league_matches(
            league_id, stage=MatchStage.REGULAR_SEASON
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
            if (m.league_week.week_number if m.league_week else m.round_number or 0) <= target_week.week_number
        ]

        standings_w = self.engine.calculate_standings(team_dicts, completed_matches)
        await self.league_repo.save_weekly_snapshots(
            league_id=league.id,
            league_week_id=target_week.id,
            week_number=target_week.week_number,
            standings_rows=standings_w,
        )
        await self.db.commit()

        return {
            "league_id": str(league_id),
            "week_id": str(week_id),
            "week_number": target_week.week_number,
            "count": len(standings_w),
            "message": f"Successfully created standing snapshot for Week {target_week.week_number}.",
        }

    # ─── Player Registration Operations ───────────────────────────────────────

    async def register_player_team(
        self,
        league_id: uuid.UUID,
        user: User,
        payload: PlayerLeagueRegisterRequest,
    ) -> LeagueTeamResponse:
        """Allow an authenticated active club member to register a doubles team with a partner."""
        league = await self._get_league_or_404(league_id)
        self._assert_status(league, [LeagueStatus.REGISTRATION_OPEN], "register for league")

        # 1. Caller must have an active player membership in this club
        caller_pm = await self.member_repo.get_by_user_and_club(
            user_id=user.id,
            club_id=league.club_id,
        )
        if not caller_pm or caller_pm.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must have an active player membership in this club to register.",
            )

        # 1b. Validate registration dates and capacity
        now = datetime.now(timezone.utc)
        if league.registration_open_at and now < league.registration_open_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration for this league is not open yet.",
            )
        if league.registration_close_at and now > league.registration_close_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration for this league has closed.",
            )
        if league.max_teams:
            current_teams = await self.league_repo.count_teams_by_league(league_id)
            if current_teams >= league.max_teams:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="League has reached maximum team capacity.",
                )

        # 2. Check caller not already registered
        caller_existing_team = await self.league_repo.find_player_team_in_league(
            league_id, caller_pm.id
        )
        if caller_existing_team:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You are already registered for this league in team '{caller_existing_team.name}'.",
            )

        # 3. Format-specific member list
        if league.team_size == 1:
            clean_name = payload.team_name.strip() if payload.team_name else (user.full_name or "Player")
            members_data = [{"player_membership_id": caller_pm.id, "guest_name": None}]
        else:
            # Doubles: validate partner (either member or manual guest name)
            partner_member_data: dict[str, Any]
            if payload.partner_membership_id is not None:
                if payload.partner_membership_id == caller_pm.id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="You cannot select yourself as your doubles partner.",
                    )

                partner_pm = await self.member_repo.get_by_id(payload.partner_membership_id)
                if not partner_pm or partner_pm.club_id != league.club_id or partner_pm.status != PlayerMembershipStatus.ACTIVE:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Selected partner is not an active player member of this club.",
                    )

                partner_existing_team = await self.league_repo.find_player_team_in_league(
                    league_id, partner_pm.id
                )
                if partner_existing_team:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Selected partner is already registered in team '{partner_existing_team.name}'.",
                    )
                partner_member_data = {"player_membership_id": partner_pm.id, "guest_name": None}
            elif payload.partner_name and payload.partner_name.strip():
                clean_partner_name = payload.partner_name.strip()
                # Prevent registering player from entering themselves as partner
                caller_names = [user.full_name.lower().strip() if user.full_name else ""]
                if hasattr(user, "player_profile") and user.player_profile and user.player_profile.display_name:
                    caller_names.append(user.player_profile.display_name.lower().strip())
                if clean_partner_name.lower() in [n for n in caller_names if n]:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="You cannot enter yourself as your doubles partner.",
                    )
                partner_member_data = {"player_membership_id": None, "guest_name": clean_partner_name}
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please enter a doubles partner name or select an active club member.",
                )
            clean_name = payload.team_name.strip()
            members_data = [
                {"player_membership_id": caller_pm.id, "guest_name": None},
                partner_member_data,
            ]

        # 4. Check team name uniqueness
        existing_named = await self.league_repo.get_team_by_name(league_id, clean_name)
        if existing_named:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A team named '{clean_name}' already exists in this league.",
            )

        team = await self.league_repo.create_team(
            league_id=league_id,
            name=clean_name,
            members_data=members_data,
        )
        if payload.skill_rating is not None and getattr(user, "player_profile", None):
            user.player_profile.skill_rating = payload.skill_rating
        await self.db.commit()
        return self._format_team_response(team)

    async def cancel_player_registration(
        self,
        league_id: uuid.UUID,
        user: User,
    ) -> dict[str, str]:
        """Allow a registered player to cancel their registration while registration is still open."""
        league = await self._get_league_or_404(league_id)
        self._assert_status(league, [LeagueStatus.REGISTRATION_OPEN], "cancel registration")

        caller_pm = await self.member_repo.get_by_user_and_club(
            user_id=user.id,
            club_id=league.club_id,
        )
        if not caller_pm:
            raise HTTPException(status_code=400, detail="No membership found.")

        team = await self.league_repo.find_player_team_in_league(league_id, caller_pm.id)
        if not team:
            raise HTTPException(status_code=404, detail="You are not registered in this league.")

        await self.league_repo.delete_team(team)
        await self.db.commit()
        return {"message": "Registration cancelled successfully."}

    async def get_player_registration_status(
        self,
        league_id: uuid.UUID,
        user: User,
    ) -> LeagueRegistrationStatusResponse:
        """Get authenticated player's registration status in this league."""
        league = await self._get_league_or_404(league_id)
        caller_pm = await self.member_repo.get_by_user_and_club(
            user_id=user.id,
            club_id=league.club_id,
        )
        if not caller_pm:
            return LeagueRegistrationStatusResponse(is_registered=False, team=None)

        team = await self.league_repo.find_player_team_in_league(league_id, caller_pm.id)
        if not team:
            return LeagueRegistrationStatusResponse(is_registered=False, team=None)

        return LeagueRegistrationStatusResponse(
            is_registered=True,
            team=self._format_team_response(team),
        )

    async def get_eligible_partners(
        self,
        league_id: uuid.UUID,
        user_id: uuid.UUID,
        search_query: str | None = None,
    ) -> list[LeagueEligiblePartnerResponse]:
        """List active club members eligible to be selected as doubles partner for this league."""
        league = await self._get_league_or_404(league_id)
        caller_membership = await self.member_repo.get_by_user_and_club(
            user_id=user_id, club_id=league.club_id
        )
        if not caller_membership or caller_membership.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must have an active player membership in this club",
            )

        teams = await self.league_repo.list_teams_by_league(league_id)
        active_registered_ids = {
            m.player_membership_id
            for t in teams
            for m in t.members
            if m.player_membership_id is not None
        }

        members = await self.member_repo.get_club_player_memberships(league.club_id)
        q = (search_query or "").strip().lower()

        results: list[LeagueEligiblePartnerResponse] = []
        for m in members:
            if m.status != PlayerMembershipStatus.ACTIVE:
                continue
            if m.user_id == user_id or m.id == caller_membership.id:
                continue
            if m.id in active_registered_ids:
                continue

            user = m.user
            profile = getattr(user, "player_profile", None) if user else None
            full_name = (user.full_name if user and user.full_name else (profile.display_name if profile else "Member")).strip()
            email = (user.email if user else "").strip()
            mem_num = m.membership_number or ""

            if q:
                matches_q = (
                    q in full_name.lower()
                    or q in email.lower()
                    or q in mem_num.lower()
                )
                if not matches_q:
                    continue

            results.append(
                LeagueEligiblePartnerResponse(
                    membership_id=m.id,
                    user_id=m.user_id,
                    full_name=full_name,
                    email=email,
                    membership_number=m.membership_number,
                    gender=getattr(profile, "gender", None),
                    profile_image_url=getattr(profile, "profile_image_url", None),
                    skill_rating=getattr(profile, "skill_rating", None),
                )
            )

        return results
