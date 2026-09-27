"""
Aught2 Pickleball — Competition Models (Phase 5)

Generic, reusable models for team-based competition.
Designed to support Round Robin now and Pool Play / Bracket in future phases.

Models:
  Team        — a fixed partner team within a tournament
  TeamMember  — links a Team to a ClubPlayerMembership (2 per team for RR)
  Match       — a single match between two teams
  MatchStatus — pending → completed | cancelled
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MatchStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

    @property
    def display_label(self) -> str:
        labels = {
            MatchStatus.PENDING: "Scheduled",
            MatchStatus.IN_PROGRESS: "In Progress",
            MatchStatus.COMPLETED: "Completed",
            MatchStatus.CANCELLED: "Cancelled",
        }
        return labels[self]


class MatchStage(str, enum.Enum):
    """
    Competition stage for matches.
    pool = pool stage match
    championship = championship knockout bracket match
    regular_season = league regular season match
    playoffs = league championship playoff match
    """
    POOL = "pool"
    CHAMPIONSHIP = "championship"
    REGULAR_SEASON = "regular_season"
    PLAYOFFS = "playoffs"

    @property
    def display_label(self) -> str:
        labels = {
            MatchStage.POOL: "Pool Stage",
            MatchStage.CHAMPIONSHIP: "Championship",
            MatchStage.REGULAR_SEASON: "Regular Season",
            MatchStage.PLAYOFFS: "Playoffs",
        }
        return labels[self]


# ─── Pool ─────────────────────────────────────────────────────────────────────

class Pool(Base):
    """
    A pool within a Pool Play tournament.
    Each pool contains teams that play a round-robin stage against each other.
    """
    __tablename__ = "pools"
    __table_args__ = (
        UniqueConstraint(
            "tournament_id", "name",
            name="uq_pools_tournament_name",
        ),
        UniqueConstraint(
            "tournament_id", "display_order",
            name="uq_pools_tournament_display_order",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    tournament_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tournaments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(50), nullable=False)
    display_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    tournament: Mapped["Tournament"] = relationship(  # noqa: F821
        "Tournament", back_populates="pools"
    )
    pool_teams: Mapped[list["PoolTeam"]] = relationship(
        "PoolTeam",
        back_populates="pool",
        cascade="all, delete-orphan",
        order_by="PoolTeam.seed.asc().nullslast()",
    )
    matches: Mapped[list["Match"]] = relationship(
        "Match",
        back_populates="pool",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Pool id={self.id} tournament_id={self.tournament_id} name={self.name!r}>"


# ─── PoolTeam ─────────────────────────────────────────────────────────────────

class PoolTeam(Base):
    """
    Associates a Team with a Pool.
    A team belongs to at most one pool in the pool stage.
    """
    __tablename__ = "pool_teams"
    __table_args__ = (
        UniqueConstraint(
            "pool_id", "team_id",
            name="uq_pool_teams_pool_team",
        ),
        UniqueConstraint(
            "team_id",
            name="uq_pool_teams_team",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    pool_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pools.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    seed: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    pool: Mapped["Pool"] = relationship("Pool", back_populates="pool_teams")
    team: Mapped["Team"] = relationship("Team", back_populates="pool_membership")

    def __repr__(self) -> str:
        return f"<PoolTeam pool_id={self.pool_id} team_id={self.team_id} seed={self.seed}>"


# ─── Team ─────────────────────────────────────────────────────────────────────

class Team(Base):
    """
    A fixed competition team belonging to one tournament.

    Round Robin & Pool Play: exactly 2 members per team (enforced at service layer).
    Future formats may allow different member counts.
    """
    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint(
            "tournament_id", "name",
            name="uq_teams_tournament_name",
        ),
        UniqueConstraint(
            "league_id", "name",
            name="uq_teams_league_name",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    tournament_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tournaments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    league_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leagues.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    seed: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    tournament: Mapped["Tournament | None"] = relationship(  # noqa: F821
        "Tournament", back_populates="teams"
    )
    league: Mapped["League | None"] = relationship(  # noqa: F821
        "League", foreign_keys=[league_id], back_populates="teams"
    )
    members: Mapped[list["TeamMember"]] = relationship(
        "TeamMember",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    matches_as_a: Mapped[list["Match"]] = relationship(
        "Match",
        foreign_keys="Match.team_a_id",
        back_populates="team_a",
        cascade="all, delete-orphan",
    )
    matches_as_b: Mapped[list["Match"]] = relationship(
        "Match",
        foreign_keys="Match.team_b_id",
        back_populates="team_b",
        cascade="all, delete-orphan",
    )
    pool_membership: Mapped["PoolTeam | None"] = relationship(
        "PoolTeam",
        back_populates="team",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Team id={self.id} tournament_id={self.tournament_id} name={self.name!r}>"


# ─── TeamMember ───────────────────────────────────────────────────────────────

class TeamMember(Base):
    """
    Links a Team to a ClubPlayerMembership.

    Constraints:
      - A player cannot belong to two teams in the same tournament.
      - Enforced via uq_team_members_tournament_player (app-level) and
        uq_team_members_team_player (DB unique constraint).
    """
    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint(
            "team_id", "player_membership_id",
            name="uq_team_members_team_player",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    player_membership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("club_player_memberships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    team: Mapped["Team"] = relationship("Team", back_populates="members")
    player_membership: Mapped["ClubPlayerMembership"] = relationship(  # noqa: F821
        "ClubPlayerMembership"
    )

    def __repr__(self) -> str:
        return (
            f"<TeamMember team_id={self.team_id} "
            f"player_membership_id={self.player_membership_id}>"
        )


# ─── Match ────────────────────────────────────────────────────────────────────

class Match(Base):
    """
    A single competition match between two teams.

    Generic model — suitable for Round Robin, Pool Play, and Bracket.
    Format-specific generation logic lives in the competition engine, not here.

    Score recording:
      - winner_team_id is DERIVED from scores by the backend service.
      - Clients submit score_a and score_b only.
      - The API refuses client-provided winner_team_id.

    Status transitions:
      pending → completed (score recorded)
      pending → cancelled (admin action)
    """
    __tablename__ = "matches"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    tournament_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tournaments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    league_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leagues.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    league_week_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("league_weeks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    round_number: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    match_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    stage: Mapped[MatchStage | None] = mapped_column(
        Enum(MatchStage, name="match_stage", native_enum=True),
        nullable=True,
        index=True,
    )
    pool_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("pools.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    bracket_round: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    bracket_position: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    next_match_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    next_match_slot: Mapped[str | None] = mapped_column(String(10), nullable=True)

    team_a_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    team_b_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    court_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    scheduled_start_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    scheduled_end_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="match_status", native_enum=True),
        default=MatchStatus.PENDING,
        nullable=False,
        index=True,
    )

    score_a: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_b: Mapped[int | None] = mapped_column(Integer, nullable=True)

    winner_team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    tournament: Mapped["Tournament | None"] = relationship(  # noqa: F821
        "Tournament", back_populates="matches"
    )
    league: Mapped["League | None"] = relationship(  # noqa: F821
        "League", back_populates="matches"
    )
    league_week: Mapped["LeagueWeek | None"] = relationship(  # noqa: F821
        "LeagueWeek", back_populates="matches"
    )
    pool: Mapped["Pool | None"] = relationship(
        "Pool", back_populates="matches"
    )
    team_a: Mapped["Team | None"] = relationship(
        "Team", foreign_keys=[team_a_id], back_populates="matches_as_a"
    )
    team_b: Mapped["Team | None"] = relationship(
        "Team", foreign_keys=[team_b_id], back_populates="matches_as_b"
    )
    winner_team: Mapped["Team | None"] = relationship(
        "Team", foreign_keys=[winner_team_id]
    )
    next_match: Mapped["Match | None"] = relationship(
        "Match", foreign_keys=[next_match_id], remote_side="Match.id"
    )
    participants: Mapped[list["MatchParticipant"]] = relationship(
        "MatchParticipant", back_populates="match", cascade="all, delete-orphan"
    )
    court: Mapped["Court | None"] = relationship(  # noqa: F821
        "Court", back_populates="matches"
    )

    def __repr__(self) -> str:
        return (
            f"<Match id={self.id} tournament_id={self.tournament_id} "
            f"round={self.round_number} status={self.status.value}>"
        )


# ─── MatchParticipant (Phase 7 - Scramble) ───────────────────────────────────

class MatchParticipant(Base):
    """
    Links an individual player to a specific match and side in a Scramble tournament.
    Doubles matches consist of two sides (side_a, side_b), each with partner_slot (1 or 2).
    """
    __tablename__ = "match_participants"
    __table_args__ = (
        UniqueConstraint(
            "match_id", "player_membership_id",
            name="uq_match_participants_match_player",
        ),
        UniqueConstraint(
            "match_id", "side", "partner_slot",
            name="uq_match_participants_match_side_slot",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    player_membership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("club_player_memberships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    side: Mapped[str] = mapped_column(String(10), nullable=False)  # "side_a" or "side_b"
    partner_slot: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 1 or 2

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    match: Mapped["Match"] = relationship("Match", back_populates="participants")
    player_membership: Mapped["ClubPlayerMembership"] = relationship(  # noqa: F821
        "ClubPlayerMembership"
    )

    def __repr__(self) -> str:
        return (
            f"<MatchParticipant match_id={self.match_id} "
            f"player_membership_id={self.player_membership_id} "
            f"side={self.side} slot={self.partner_slot}>"
        )

