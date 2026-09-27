"""
Aught2 Pickleball — Competition Repository (Phase 5 & 6)

Database access for Team, TeamMember, Match, Pool, and PoolTeam.
All queries enforce tournament-scoped tenant isolation.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_player_membership import ClubPlayerMembership
from app.models.competition import (
    Match,
    MatchParticipant,
    MatchStage,
    MatchStatus,
    Pool,
    PoolTeam,
    Team,
    TeamMember,
)
from app.models.user import User


def _team_member_options():
    """Consistent eager load chain for team members → player membership → user → profile."""
    return selectinload(Team.members).selectinload(
        TeamMember.player_membership
    ).selectinload(
        ClubPlayerMembership.user
    ).selectinload(User.player_profile)


def _match_options():
    """Consistent eager load chain for matches."""
    return [
        selectinload(Match.team_a),
        selectinload(Match.team_b),
        selectinload(Match.winner_team),
        selectinload(Match.pool),
        selectinload(Match.next_match),
        selectinload(Match.participants).selectinload(
            MatchParticipant.player_membership
        ).selectinload(
            ClubPlayerMembership.user
        ).selectinload(User.player_profile),
    ]


def _pool_options():
    """Consistent eager load chain for pools."""
    return selectinload(Pool.pool_teams).selectinload(PoolTeam.team)


class CompetitionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── Team ─────────────────────────────────────────────────────────────────

    async def create_team(
        self,
        tournament_id: uuid.UUID,
        name: str,
        seed: int | None = None,
    ) -> Team:
        team = Team(tournament_id=tournament_id, name=name, seed=seed)
        self.db.add(team)
        await self.db.flush()
        return team

    async def get_team(self, team_id: uuid.UUID) -> Team | None:
        result = await self.db.execute(
            select(Team)
            .where(Team.id == team_id)
            .options(_team_member_options())
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_team_in_tournament(
        self, team_id: uuid.UUID, tournament_id: uuid.UUID
    ) -> Team | None:
        result = await self.db.execute(
            select(Team)
            .where(Team.id == team_id, Team.tournament_id == tournament_id)
            .options(_team_member_options())
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_teams_by_tournament(self, tournament_id: uuid.UUID) -> list[Team]:
        result = await self.db.execute(
            select(Team)
            .where(Team.tournament_id == tournament_id)
            .options(_team_member_options())
            .order_by(Team.seed.asc().nullslast(), Team.name.asc())
        )
        return list(result.scalars().all())

    async def update_team(self, team: Team, **fields) -> Team:
        for key, value in fields.items():
            setattr(team, key, value)
        await self.db.flush()
        return team

    async def delete_team(self, team: Team) -> None:
        await self.db.delete(team)
        await self.db.flush()

    async def get_player_team_in_tournament(
        self, tournament_id: uuid.UUID, player_membership_id: uuid.UUID
    ) -> Team | None:
        """Find the team a player belongs to within a tournament."""
        result = await self.db.execute(
            select(Team)
            .join(Team.members)
            .where(
                Team.tournament_id == tournament_id,
                TeamMember.player_membership_id == player_membership_id,
            )
            .options(_team_member_options())
        )
        return result.scalar_one_or_none()

    # ─── TeamMember ───────────────────────────────────────────────────────────

    async def create_team_member(
        self,
        team_id: uuid.UUID,
        player_membership_id: uuid.UUID,
    ) -> TeamMember:
        member = TeamMember(
            team_id=team_id,
            player_membership_id=player_membership_id,
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def delete_team_members(self, team_id: uuid.UUID) -> None:
        """Remove all members from a team (for member reassignment)."""
        result = await self.db.execute(
            select(TeamMember).where(TeamMember.team_id == team_id)
        )
        for member in result.scalars().all():
            await self.db.delete(member)
        await self.db.flush()

    # ─── Match ────────────────────────────────────────────────────────────────

    async def create_matches_bulk(
        self,
        slots: list[dict],
    ) -> list[Match]:
        """
        Create multiple matches from pre-computed slot dicts.
        Each slot: {
            id (optional), tournament_id, team_a_id, team_b_id,
            round_number, match_number, stage, pool_id, bracket_round,
            bracket_position, next_match_id, next_match_slot, status,
            winner_team_id
        }
        """
        matches = []
        for slot in slots:
            status_val = slot.get("status", MatchStatus.PENDING)
            if isinstance(status_val, str):
                status_val = MatchStatus(status_val)
            stage_val = slot.get("stage")
            if isinstance(stage_val, str):
                stage_val = MatchStage(stage_val)
            m = Match(
                id=slot.get("id", uuid.uuid4()),
                tournament_id=slot["tournament_id"],
                team_a_id=slot.get("team_a_id"),
                team_b_id=slot.get("team_b_id"),
                round_number=slot.get("round_number"),
                match_number=slot.get("match_number"),
                stage=stage_val,
                pool_id=slot.get("pool_id"),
                bracket_round=slot.get("bracket_round"),
                bracket_position=slot.get("bracket_position"),
                next_match_id=None,
                next_match_slot=slot.get("next_match_slot"),
                status=status_val,
                court_id=slot.get("court_id"),
                scheduled_start_at=slot.get("scheduled_start_at"),
                scheduled_end_at=slot.get("scheduled_end_at"),
                winner_team_id=slot.get("winner_team_id"),
                completed_at=datetime.now(timezone.utc) if status_val == MatchStatus.COMPLETED else None,
            )
            self.db.add(m)
            matches.append(m)
        await self.db.flush()

        has_links = False
        for m, slot in zip(matches, slots):
            if slot.get("next_match_id"):
                m.next_match_id = slot["next_match_id"]
                has_links = True
        if has_links:
            await self.db.flush()

        return matches

    async def create_match_participants_bulk(
        self,
        participants_data: list[dict[str, Any]],
    ) -> list[MatchParticipant]:
        """Bulk create match participants for Scramble matches."""
        participants: list[MatchParticipant] = []
        for p in participants_data:
            mp = MatchParticipant(
                match_id=p["match_id"],
                player_membership_id=p["player_membership_id"],
                side=p["side"],
                partner_slot=p["partner_slot"],
            )
            self.db.add(mp)
            participants.append(mp)
        await self.db.flush()
        return participants


    async def get_match(
        self, match_id: uuid.UUID, tournament_id: uuid.UUID | None = None
    ) -> Match | None:
        q = (
            select(Match)
            .where(Match.id == match_id)
            .options(*_match_options())
            .execution_options(populate_existing=True)
        )
        if tournament_id is not None:
            q = q.where(Match.tournament_id == tournament_id)
        result = await self.db.execute(q)
        return result.scalar_one_or_none()

    async def list_matches_by_tournament(
        self, tournament_id: uuid.UUID
    ) -> list[Match]:
        result = await self.db.execute(
            select(Match)
            .where(Match.tournament_id == tournament_id)
            .options(*_match_options())
            .order_by(
                Match.round_number.asc().nullslast(),
                Match.bracket_round.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )
        )
        return list(result.scalars().all())

    async def list_match_statuses_by_tournament(
        self, tournament_id: uuid.UUID
    ) -> list[Match]:
        """Lightweight query: loads only fields needed to check completion status.
        
        Skips all eager-loaded relationships (team members, participants, pool, etc.)
        to avoid a heavy join chain when we only need to count statuses.
        """
        result = await self.db.execute(
            select(Match)
            .where(Match.tournament_id == tournament_id)
            .order_by(
                Match.round_number.asc().nullslast(),
                Match.bracket_round.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )
        )
        return list(result.scalars().all())

    async def list_matches_by_stage(
        self, tournament_id: uuid.UUID, stage: MatchStage | str
    ) -> list[Match]:
        stage_enum = MatchStage(stage) if isinstance(stage, str) else stage
        result = await self.db.execute(
            select(Match)
            .where(Match.tournament_id == tournament_id, Match.stage == stage_enum)
            .options(*_match_options())
            .order_by(
                Match.round_number.asc().nullslast(),
                Match.bracket_round.asc().nullslast(),
                Match.bracket_position.asc().nullslast(),
                Match.match_number.asc().nullslast(),
            )
        )
        return list(result.scalars().all())

    async def list_matches_by_pool(
        self, tournament_id: uuid.UUID, pool_id: uuid.UUID
    ) -> list[Match]:
        result = await self.db.execute(
            select(Match)
            .where(Match.tournament_id == tournament_id, Match.pool_id == pool_id)
            .options(*_match_options())
            .order_by(Match.round_number.asc().nullslast(), Match.match_number.asc())
        )
        return list(result.scalars().all())

    async def update_match(self, match: Match, **fields) -> Match:
        """Update match fields in-place. Returns the same object (already in session).
        
        Avoids a redundant re-fetch: callers that need a fully-refreshed match for the
        response should call get_match() themselves after commit.
        """
        for key, value in fields.items():
            setattr(match, key, value)
        await self.db.flush()
        return match

    async def delete_pending_matches(self, tournament_id: uuid.UUID) -> int:
        """Delete all pending (unplayed) matches for a tournament. Returns count deleted."""
        result = await self.db.execute(
            select(Match).where(
                Match.tournament_id == tournament_id,
                Match.status == MatchStatus.PENDING,
            )
        )
        pending = list(result.scalars().all())
        for m in pending:
            await self.db.delete(m)
        await self.db.flush()
        return len(pending)

    async def delete_pending_matches_by_stage(
        self, tournament_id: uuid.UUID, stage: MatchStage | str
    ) -> int:
        """Delete all pending matches for a specific stage. Returns count deleted."""
        stage_enum = MatchStage(stage) if isinstance(stage, str) else stage
        result = await self.db.execute(
            select(Match).where(
                Match.tournament_id == tournament_id,
                Match.stage == stage_enum,
                Match.status == MatchStatus.PENDING,
            )
        )
        pending = list(result.scalars().all())
        for m in pending:
            await self.db.delete(m)
        await self.db.flush()
        return len(pending)

    async def count_completed_matches(self, tournament_id: uuid.UUID) -> int:
        """Count completed matches — used to block regeneration after results."""
        result = await self.db.execute(
            select(func.count()).select_from(Match).where(
                Match.tournament_id == tournament_id,
                Match.status == MatchStatus.COMPLETED,
            )
        )
        return result.scalar_one()

    async def count_completed_matches_by_stage(
        self, tournament_id: uuid.UUID, stage: MatchStage | str
    ) -> int:
        stage_enum = MatchStage(stage) if isinstance(stage, str) else stage
        result = await self.db.execute(
            select(func.count()).select_from(Match).where(
                Match.tournament_id == tournament_id,
                Match.stage == stage_enum,
                Match.status == MatchStatus.COMPLETED,
            )
        )
        return result.scalar_one()

    async def count_matches_by_stage(
        self, tournament_id: uuid.UUID, stage: MatchStage | str
    ) -> int:
        stage_enum = MatchStage(stage) if isinstance(stage, str) else stage
        result = await self.db.execute(
            select(func.count()).select_from(Match).where(
                Match.tournament_id == tournament_id,
                Match.stage == stage_enum,
            )
        )
        return result.scalar_one()

    async def count_all_matches(self, tournament_id: uuid.UUID) -> int:
        """Count all matches for a tournament."""
        result = await self.db.execute(
            select(func.count()).select_from(Match).where(
                Match.tournament_id == tournament_id
            )
        )
        return result.scalar_one()

    async def advance_team_to_next_match(
        self, next_match_id: uuid.UUID, next_match_slot: str, winner_team_id: uuid.UUID
    ) -> Match | None:
        """Populate team slot in next match of championship bracket.
        
        Uses a lightweight query (no eager-loaded relationships) since we only
        need to set team_a_id / team_b_id and flush.
        """
        result = await self.db.execute(
            select(Match).where(Match.id == next_match_id)
        )
        target = result.scalar_one_or_none()
        if not target:
            return None
        if next_match_slot == "team_a":
            target.team_a_id = winner_team_id
        elif next_match_slot == "team_b":
            target.team_b_id = winner_team_id
        await self.db.flush()
        return target

    # ─── Pool ─────────────────────────────────────────────────────────────────

    async def create_pool(
        self,
        tournament_id: uuid.UUID,
        name: str,
        display_order: int,
    ) -> Pool:
        pool = Pool(
            tournament_id=tournament_id,
            name=name,
            display_order=display_order,
        )
        self.db.add(pool)
        await self.db.flush()
        return pool

    async def create_pools_bulk(
        self,
        tournament_id: uuid.UUID,
        pool_names: list[str],
    ) -> list[Pool]:
        pools = []
        for idx, name in enumerate(pool_names, start=1):
            p = Pool(
                tournament_id=tournament_id,
                name=name,
                display_order=idx,
            )
            self.db.add(p)
            pools.append(p)
        await self.db.flush()
        return pools

    async def get_pool(
        self, pool_id: uuid.UUID, tournament_id: uuid.UUID | None = None
    ) -> Pool | None:
        q = (
            select(Pool)
            .where(Pool.id == pool_id)
            .options(_pool_options())
            .execution_options(populate_existing=True)
        )
        if tournament_id is not None:
            q = q.where(Pool.tournament_id == tournament_id)
        result = await self.db.execute(q)
        return result.scalar_one_or_none()

    async def list_pools_by_tournament(
        self, tournament_id: uuid.UUID
    ) -> list[Pool]:
        result = await self.db.execute(
            select(Pool)
            .where(Pool.tournament_id == tournament_id)
            .options(_pool_options())
            .order_by(Pool.display_order.asc())
        )
        return list(result.scalars().all())

    async def delete_pools_by_tournament(self, tournament_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(Pool).where(Pool.tournament_id == tournament_id)
        )
        pools = list(result.scalars().all())
        for p in pools:
            await self.db.delete(p)
        await self.db.flush()
        return len(pools)

    # ─── PoolTeam ─────────────────────────────────────────────────────────────

    async def assign_team_to_pool(
        self,
        pool_id: uuid.UUID,
        team_id: uuid.UUID,
        seed: int | None = None,
    ) -> PoolTeam:
        pt = PoolTeam(
            pool_id=pool_id,
            team_id=team_id,
            seed=seed,
        )
        self.db.add(pt)
        await self.db.flush()
        return pt

    async def assign_teams_to_pools_bulk(
        self,
        assignments: list[dict],
    ) -> list[PoolTeam]:
        """assignments: list of {pool_id, team_id, seed}"""
        pts = []
        for a in assignments:
            pt = PoolTeam(
                pool_id=a["pool_id"],
                team_id=a["team_id"],
                seed=a.get("seed"),
            )
            self.db.add(pt)
            pts.append(pt)
        await self.db.flush()
        return pts

    async def get_pool_teams(self, pool_id: uuid.UUID) -> list[PoolTeam]:
        result = await self.db.execute(
            select(PoolTeam)
            .where(PoolTeam.pool_id == pool_id)
            .options(selectinload(PoolTeam.team))
            .order_by(PoolTeam.seed.asc().nullslast())
        )
        return list(result.scalars().all())

    async def get_team_pool(self, team_id: uuid.UUID) -> PoolTeam | None:
        result = await self.db.execute(
            select(PoolTeam)
            .where(PoolTeam.team_id == team_id)
            .options(selectinload(PoolTeam.pool))
        )
        return result.scalar_one_or_none()

    async def delete_pool_teams_by_tournament(self, tournament_id: uuid.UUID) -> int:
        """Remove all pool assignments for a tournament."""
        pools = await self.list_pools_by_tournament(tournament_id)
        pool_ids = [p.id for p in pools]
        if not pool_ids:
            return 0
        result = await self.db.execute(
            select(PoolTeam).where(PoolTeam.pool_id.in_(pool_ids))
        )
        pts = list(result.scalars().all())
        for pt in pts:
            await self.db.delete(pt)
        await self.db.flush()
        return len(pts)
