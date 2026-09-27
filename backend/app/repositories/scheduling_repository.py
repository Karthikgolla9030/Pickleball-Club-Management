"""
Aught2 Pickleball — Competition Scheduling Repository (Phase 17)

Data access layer for:
  - Court locking and match locking (concurrency control)
  - Conflict detection (court, team, scramble player)
  - Club-scoped daily competition schedules
  - Tournament and League scheduled/unscheduled match queries
  - Player personal match schedules
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any
import uuid

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_player_membership import ClubPlayerMembership
from app.models.competition import (
    Match,
    MatchParticipant,
    MatchStatus,
    Pool,
    Team,
    TeamMember,
)
from app.models.court import Court, CourtStatus
from app.models.league import League, LeagueWeek
from app.models.tournament import Tournament
from app.models.user import User


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _scheduling_match_options():
    """Consistent eager load chain for scheduled matches."""
    return [
        selectinload(Match.court),
        selectinload(Match.tournament),
        selectinload(Match.league),
        selectinload(Match.league_week),
        selectinload(Match.pool),
        selectinload(Match.team_a).selectinload(Team.members).selectinload(
            TeamMember.player_membership
        ).selectinload(
            ClubPlayerMembership.user
        ).selectinload(User.player_profile),
        selectinload(Match.team_b).selectinload(Team.members).selectinload(
            TeamMember.player_membership
        ).selectinload(
            ClubPlayerMembership.user
        ).selectinload(User.player_profile),
        selectinload(Match.winner_team),
        selectinload(Match.participants).selectinload(
            MatchParticipant.player_membership
        ).selectinload(
            ClubPlayerMembership.user
        ).selectinload(User.player_profile),
    ]


class SchedulingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── Locks & Retrieval ───────────────────────────────────────────────────

    async def lock_court_for_update(self, court_id: uuid.UUID) -> Court | None:
        """Acquire a row-level lock on the court record."""
        stmt = select(Court).where(Court.id == court_id).with_for_update()
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def lock_match_for_update(self, match_id: uuid.UUID) -> Match | None:
        """Acquire a row-level lock on the match record."""
        stmt = (
            select(Match)
            .where(Match.id == match_id)
            .options(*_scheduling_match_options())
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_court(self, court_id: uuid.UUID) -> Court | None:
        stmt = select(Court).where(Court.id == court_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_match(self, match_id: uuid.UUID) -> Match | None:
        stmt = (
            select(Match)
            .where(Match.id == match_id)
            .options(*_scheduling_match_options())
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    # ─── Conflict Detection ───────────────────────────────────────────────────

    async def find_court_conflicts(
        self,
        court_id: uuid.UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_match_id: uuid.UUID | None = None,
    ) -> list[Match]:
        """
        Find any non-cancelled scheduled match on court_id overlapping [start_at, end_at).
        Overlap condition: existing.start < new.end AND existing.end > new.start.
        """
        stmt = (
            select(Match)
            .where(
                Match.court_id == court_id,
                Match.status != MatchStatus.CANCELLED,
                Match.scheduled_start_at.isnot(None),
                Match.scheduled_end_at.isnot(None),
                Match.scheduled_start_at < end_at,
                Match.scheduled_end_at > start_at,
            )
            .options(selectinload(Match.court))
        )
        if exclude_match_id is not None:
            stmt = stmt.where(Match.id != exclude_match_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def find_team_conflicts(
        self,
        team_id: uuid.UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_match_id: uuid.UUID | None = None,
    ) -> list[Match]:
        """
        Find any scheduled match where team_id plays overlapping [start_at, end_at).
        """
        stmt = (
            select(Match)
            .where(
                or_(Match.team_a_id == team_id, Match.team_b_id == team_id),
                Match.status != MatchStatus.CANCELLED,
                Match.scheduled_start_at.isnot(None),
                Match.scheduled_end_at.isnot(None),
                Match.scheduled_start_at < end_at,
                Match.scheduled_end_at > start_at,
            )
            .options(selectinload(Match.court))
        )
        if exclude_match_id is not None:
            stmt = stmt.where(Match.id != exclude_match_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def find_player_conflicts(
        self,
        player_membership_id: uuid.UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_match_id: uuid.UUID | None = None,
    ) -> list[Match]:
        """
        Find any scheduled match where player_membership_id plays overlapping [start_at, end_at)
        (checks Scramble MatchParticipant).
        """
        stmt = (
            select(Match)
            .join(MatchParticipant, MatchParticipant.match_id == Match.id)
            .where(
                MatchParticipant.player_membership_id == player_membership_id,
                Match.status != MatchStatus.CANCELLED,
                Match.scheduled_start_at.isnot(None),
                Match.scheduled_end_at.isnot(None),
                Match.scheduled_start_at < end_at,
                Match.scheduled_end_at > start_at,
            )
            .options(selectinload(Match.court))
        )
        if exclude_match_id is not None:
            stmt = stmt.where(Match.id != exclude_match_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ─── Mutations ────────────────────────────────────────────────────────────

    async def set_match_schedule(
        self,
        match: Match,
        court_id: uuid.UUID,
        start_at: datetime,
        end_at: datetime,
    ) -> Match:
        match.court_id = court_id
        match.scheduled_start_at = _ensure_utc(start_at)
        match.scheduled_end_at = _ensure_utc(end_at)
        await self.db.flush()
        return match

    async def clear_match_schedule(self, match: Match) -> Match:
        match.court_id = None
        match.scheduled_start_at = None
        match.scheduled_end_at = None
        await self.db.flush()
        return match

    # ─── Schedule Listing Queries ─────────────────────────────────────────────

    async def list_scheduled_by_club_date(
        self,
        club_id: uuid.UUID,
        target_date: date,
        court_id: uuid.UUID | None = None,
    ) -> list[Match]:
        """
        List all scheduled competition matches for a club on target_date.
        Deterministic sorting: scheduled_start_at, Court.display_order, match_id.
        """
        day_start = datetime.combine(target_date, time.min, tzinfo=timezone.utc)
        day_end = datetime.combine(target_date, time.max, tzinfo=timezone.utc)

        stmt = (
            select(Match)
            .join(Court, Match.court_id == Court.id)
            .outerjoin(Tournament, Match.tournament_id == Tournament.id)
            .outerjoin(League, Match.league_id == League.id)
            .where(
                or_(
                    Tournament.club_id == club_id,
                    League.club_id == club_id,
                ),
                Match.court_id.isnot(None),
                Match.scheduled_start_at.isnot(None),
                Match.scheduled_end_at.isnot(None),
                Match.status != MatchStatus.CANCELLED,
                Match.scheduled_start_at < day_end,
                Match.scheduled_end_at > day_start,
            )
            .options(*_scheduling_match_options())
            .order_by(
                Match.scheduled_start_at.asc(),
                Court.display_order.asc(),
                Match.id.asc(),
            )
        )
        if court_id is not None:
            stmt = stmt.where(Match.court_id == court_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_tournament(
        self,
        tournament_id: uuid.UUID,
        scheduled: bool | None = None,
    ) -> list[Match]:
        stmt = (
            select(Match)
            .where(
                Match.tournament_id == tournament_id,
                Match.status != MatchStatus.CANCELLED,
            )
            .options(*_scheduling_match_options())
        )
        if scheduled is True:
            stmt = stmt.where(Match.scheduled_start_at.isnot(None))
            stmt = stmt.order_by(
                Match.scheduled_start_at.asc(),
                Match.round_number.asc().nullslast(),
                Match.bracket_round.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )
        elif scheduled is False:
            stmt = stmt.where(Match.scheduled_start_at.is_(None))
            stmt = stmt.order_by(
                Match.round_number.asc().nullslast(),
                Match.bracket_round.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )
        else:
            stmt = stmt.order_by(
                Match.round_number.asc().nullslast(),
                Match.bracket_round.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_league(
        self,
        league_id: uuid.UUID,
        scheduled: bool | None = None,
    ) -> list[Match]:
        stmt = (
            select(Match)
            .where(
                Match.league_id == league_id,
                Match.status != MatchStatus.CANCELLED,
            )
            .options(*_scheduling_match_options())
        )
        if scheduled is True:
            stmt = stmt.where(Match.scheduled_start_at.isnot(None))
            stmt = stmt.order_by(
                Match.scheduled_start_at.asc(),
                Match.round_number.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )
        elif scheduled is False:
            stmt = stmt.where(Match.scheduled_start_at.is_(None))
            stmt = stmt.order_by(
                Match.round_number.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )
        else:
            stmt = stmt.order_by(
                Match.round_number.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_player_schedule(
        self,
        user_id: uuid.UUID,
        timeframe: str | None = None,
    ) -> list[Match]:
        """
        List scheduled matches for a player across tournaments and leagues.
        Derives participation from TeamMember (fixed teams) and MatchParticipant (Scramble).
        """
        now = datetime.now(timezone.utc)

        player_membership_ids_subquery = (
            select(ClubPlayerMembership.id)
            .where(ClubPlayerMembership.user_id == user_id)
        )

        team_ids_subquery = (
            select(TeamMember.team_id)
            .where(TeamMember.player_membership_id.in_(player_membership_ids_subquery))
        )

        scramble_match_ids_subquery = (
            select(MatchParticipant.match_id)
            .where(MatchParticipant.player_membership_id.in_(player_membership_ids_subquery))
        )

        stmt = (
            select(Match)
            .where(
                Match.scheduled_start_at.isnot(None),
                Match.scheduled_end_at.isnot(None),
                Match.status != MatchStatus.CANCELLED,
                or_(
                    Match.team_a_id.in_(team_ids_subquery),
                    Match.team_b_id.in_(team_ids_subquery),
                    Match.id.in_(scramble_match_ids_subquery),
                ),
            )
            .options(*_scheduling_match_options())
        )

        if timeframe == "upcoming":
            stmt = stmt.where(Match.scheduled_start_at >= now).order_by(
                Match.scheduled_start_at.asc()
            )
        elif timeframe == "past":
            stmt = stmt.where(Match.scheduled_end_at < now).order_by(
                Match.scheduled_start_at.desc()
            )
        elif timeframe == "today":
            today_start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
            today_end = datetime.combine(now.date(), time.max, tzinfo=timezone.utc)
            stmt = stmt.where(
                Match.scheduled_start_at < today_end,
                Match.scheduled_end_at > today_start,
            ).order_by(Match.scheduled_start_at.asc())
        else:
            stmt = stmt.order_by(Match.scheduled_start_at.asc())

        result = await self.db.execute(stmt)
        return list(result.scalars().all())
