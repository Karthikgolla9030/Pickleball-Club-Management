"""
Aught2 Pickleball — League Repository (Phase 9)

Database operations for:
  - League
  - LeagueWeek
  - League Teams & TeamMembers (scoped to league_id)
  - League Matches (scoped to league_id and league_week_id)
  - LeagueWeeklyStanding (weekly standings snapshots)

Enforces club-scoped tenant isolation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_player_membership import ClubPlayerMembership
from app.models.competition import Match, MatchStage, MatchStatus, Team, TeamMember
from app.models.league import (
    League,
    LeagueStatus,
    LeagueWeek,
    LeagueWeekStatus,
    LeagueWeekType,
    LeagueWeeklyStanding,
)
from app.models.user import User


def _team_eager_options():
    return [
        selectinload(Team.members).selectinload(
            TeamMember.player_membership
        ).selectinload(
            ClubPlayerMembership.user
        ).selectinload(User.player_profile),
    ]


def _match_eager_options():
    return [
        selectinload(Match.team_a).selectinload(Team.members),
        selectinload(Match.team_b).selectinload(Team.members),
        selectinload(Match.winner_team),
        selectinload(Match.league_week),
        selectinload(Match.next_match),
    ]


class LeagueRepository:
    """Repository for all League domain queries and mutations."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── League Operations ────────────────────────────────────────────────────

    async def create_league(self, **kwargs: Any) -> League:
        league = League(**kwargs)
        self.db.add(league)
        await self.db.flush()
        return league

    async def get_league(
        self,
        league_id: uuid.UUID,
        club_id: uuid.UUID | None = None,
    ) -> League | None:
        stmt = select(League).where(League.id == league_id)
        if club_id is not None:
            stmt = stmt.where(League.club_id == club_id)
        stmt = stmt.options(
            selectinload(League.weeks),
            selectinload(League.champion_team),
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_leagues_by_club(self, club_id: uuid.UUID) -> list[League]:
        stmt = (
            select(League)
            .where(League.club_id == club_id)
            .order_by(League.created_at.desc())
            .options(
                selectinload(League.weeks),
                selectinload(League.champion_team),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_public_leagues(self) -> list[League]:
        """List active/published leagues for players."""
        stmt = (
            select(League)
            .where(League.status != LeagueStatus.DRAFT)
            .order_by(League.created_at.desc())
            .options(
                selectinload(League.weeks),
                selectinload(League.champion_team),
                selectinload(League.club),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_league(self, league: League, **kwargs: Any) -> League:
        for key, value in kwargs.items():
            setattr(league, key, value)
        await self.db.flush()
        return league

    # ─── LeagueWeek Operations ────────────────────────────────────────────────

    async def create_league_weeks_bulk(
        self,
        weeks_data: list[dict[str, Any]],
    ) -> list[LeagueWeek]:
        weeks = [LeagueWeek(**data) for data in weeks_data]
        self.db.add_all(weeks)
        await self.db.flush()
        return weeks

    async def list_league_weeks(self, league_id: uuid.UUID) -> list[LeagueWeek]:
        stmt = (
            select(LeagueWeek)
            .where(LeagueWeek.league_id == league_id)
            .order_by(LeagueWeek.week_number.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_league_week_by_number(
        self,
        league_id: uuid.UUID,
        week_number: int,
    ) -> LeagueWeek | None:
        stmt = (
            select(LeagueWeek)
            .where(
                LeagueWeek.league_id == league_id,
                LeagueWeek.week_number == week_number,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def update_league_week(
        self,
        league_week: LeagueWeek,
        **kwargs: Any,
    ) -> LeagueWeek:
        for key, value in kwargs.items():
            setattr(league_week, key, value)
        await self.db.flush()
        return league_week

    # ─── Team Operations (Scoped to League) ───────────────────────────────────

    async def create_team(
        self,
        league_id: uuid.UUID,
        name: str,
        member_membership_ids: list[uuid.UUID],
        seed: int | None = None,
    ) -> Team:
        team = Team(
            tournament_id=None,
            league_id=league_id,
            name=name,
            seed=seed,
        )
        self.db.add(team)
        await self.db.flush()

        members = [
            TeamMember(team_id=team.id, player_membership_id=pm_id)
            for pm_id in member_membership_ids
        ]
        self.db.add_all(members)
        await self.db.flush()

        return await self.get_team_by_id(team.id, league_id=league_id)  # reload with options

    async def list_teams_by_league(self, league_id: uuid.UUID) -> list[Team]:
        stmt = (
            select(Team)
            .where(Team.league_id == league_id)
            .options(*_team_eager_options())
            .order_by(Team.seed.asc().nullslast(), Team.name.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_team_by_id(
        self,
        team_id: uuid.UUID,
        league_id: uuid.UUID | None = None,
    ) -> Team | None:
        stmt = select(Team).where(Team.id == team_id)
        if league_id is not None:
            stmt = stmt.where(Team.league_id == league_id)
        stmt = stmt.options(*_team_eager_options())
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_team_by_name(
        self,
        league_id: uuid.UUID,
        name: str,
    ) -> Team | None:
        stmt = select(Team).where(
            Team.league_id == league_id,
            func.lower(Team.name) == name.lower().strip(),
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def find_player_team_in_league(
        self,
        league_id: uuid.UUID,
        player_membership_id: uuid.UUID,
    ) -> Team | None:
        stmt = (
            select(Team)
            .join(TeamMember, TeamMember.team_id == Team.id)
            .where(
                Team.league_id == league_id,
                TeamMember.player_membership_id == player_membership_id,
            )
            .options(*_team_eager_options())
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def update_team(self, team: Team, **kwargs: Any) -> Team:
        for key, value in kwargs.items():
            setattr(team, key, value)
        await self.db.flush()
        return team

    async def delete_team(self, team: Team) -> None:
        await self.db.delete(team)
        await self.db.flush()

    # ─── Match Operations (Scoped to League) ──────────────────────────────────

    async def create_matches_bulk(
        self,
        matches_data: list[dict[str, Any]],
    ) -> list[Match]:
        matches = [Match(**data) for data in matches_data]
        self.db.add_all(matches)
        await self.db.flush()
        return matches

    async def list_league_matches(
        self,
        league_id: uuid.UUID,
        week_id: uuid.UUID | None = None,
        stage: MatchStage | None = None,
    ) -> list[Match]:
        stmt = select(Match).where(Match.league_id == league_id)
        if week_id is not None:
            stmt = stmt.where(Match.league_week_id == week_id)
        if stage is not None:
            stmt = stmt.where(Match.stage == stage)
        stmt = stmt.options(*_match_eager_options()).order_by(
            Match.round_number.asc(),
            Match.match_number.asc(),
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_match_by_id(
        self,
        match_id: uuid.UUID,
        league_id: uuid.UUID | None = None,
    ) -> Match | None:
        stmt = select(Match).where(Match.id == match_id)
        if league_id is not None:
            stmt = stmt.where(Match.league_id == league_id)
        stmt = stmt.options(*_match_eager_options())
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def update_match(self, match: Match, **kwargs: Any) -> Match:
        for key, value in kwargs.items():
            setattr(match, key, value)
        await self.db.flush()
        return match

    async def count_all_league_matches(self, league_id: uuid.UUID) -> int:
        stmt = select(func.count(Match.id)).where(Match.league_id == league_id)
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def count_completed_league_matches(self, league_id: uuid.UUID) -> int:
        stmt = (
            select(func.count(Match.id))
            .where(
                Match.league_id == league_id,
                Match.status == MatchStatus.COMPLETED,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def delete_league_matches_by_stage(
        self,
        league_id: uuid.UUID,
        stage: MatchStage,
    ) -> None:
        stmt = delete(Match).where(
            Match.league_id == league_id,
            Match.stage == stage,
        )
        await self.db.execute(stmt)
        await self.db.flush()

    # ─── Weekly Standings Snapshots ───────────────────────────────────────────

    async def save_weekly_snapshots(
        self,
        league_id: uuid.UUID,
        league_week_id: uuid.UUID,
        week_number: int,
        standings_rows: list[Any],
    ) -> list[LeagueWeeklyStanding]:
        # Delete existing snapshot for this week if any (for idempotent recalculation)
        del_stmt = delete(LeagueWeeklyStanding).where(
            LeagueWeeklyStanding.league_id == league_id,
            LeagueWeeklyStanding.league_week_id == league_week_id,
        )
        await self.db.execute(del_stmt)

        snapshots = [
            LeagueWeeklyStanding(
                league_id=league_id,
                league_week_id=league_week_id,
                week_number=week_number,
                team_id=row.team_id,
                rank=row.rank,
                matches_played=row.matches_played,
                wins=row.wins,
                losses=row.losses,
                points_scored=row.points_scored,
                points_allowed=row.points_allowed,
                points_differential=row.points_differential,
            )
            for row in standings_rows
        ]
        self.db.add_all(snapshots)
        await self.db.flush()
        return snapshots

    async def list_weekly_snapshots(
        self,
        league_id: uuid.UUID,
        week_number: int | None = None,
    ) -> list[LeagueWeeklyStanding]:
        stmt = (
            select(LeagueWeeklyStanding)
            .where(LeagueWeeklyStanding.league_id == league_id)
        )
        if week_number is not None:
            stmt = stmt.where(LeagueWeeklyStanding.week_number == week_number)
        stmt = stmt.options(
            selectinload(LeagueWeeklyStanding.team),
            selectinload(LeagueWeeklyStanding.league_week),
        ).order_by(
            LeagueWeeklyStanding.week_number.asc(),
            LeagueWeeklyStanding.rank.asc(),
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
