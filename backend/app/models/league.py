"""
Aught2 Pickleball — League Competition Models (Phase 9)

A League is a distinct competition domain featuring:
  - Fixed teams (League teams)
  - Configurable duration (N weeks: 1..N-1 Regular Season, Week N Playoffs)
  - Weekly match scheduling
  - Cumulative standings & weekly snapshots
  - Championship playoffs (single-elimination bracket seeded from standings)
"""
from __future__ import annotations

from decimal import Decimal
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LeagueStatus(str, enum.Enum):
    """
    Centralized lifecycle status for a League.

    draft → registration_open → registration_closed → in_progress → playoffs → completed
                                                     ↘ cancelled
    """
    DRAFT = "draft"
    REGISTRATION_OPEN = "registration_open"
    REGISTRATION_CLOSED = "registration_closed"
    IN_PROGRESS = "in_progress"
    PLAYOFFS = "playoffs"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

    @property
    def display_label(self) -> str:
        labels = {
            LeagueStatus.DRAFT: "Draft",
            LeagueStatus.REGISTRATION_OPEN: "Registration Open",
            LeagueStatus.REGISTRATION_CLOSED: "Registration Closed",
            LeagueStatus.IN_PROGRESS: "In Progress",
            LeagueStatus.PLAYOFFS: "Playoffs",
            LeagueStatus.COMPLETED: "Completed",
            LeagueStatus.CANCELLED: "Cancelled",
        }
        return labels[self]


class LeagueWeekType(str, enum.Enum):
    """
    Type of a league competition week.
    Weeks 1..N-1 are regular season; Week N is playoffs.
    """
    REGULAR_SEASON = "regular_season"
    PLAYOFFS = "playoffs"

    @property
    def display_label(self) -> str:
        labels = {
            LeagueWeekType.REGULAR_SEASON: "Regular Season",
            LeagueWeekType.PLAYOFFS: "Playoffs",
        }
        return labels[self]


class LeagueWeekStatus(str, enum.Enum):
    """Lifecycle status of a specific league week."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"

    @property
    def display_label(self) -> str:
        labels = {
            LeagueWeekStatus.PENDING: "Pending",
            LeagueWeekStatus.IN_PROGRESS: "In Progress",
            LeagueWeekStatus.COMPLETED: "Completed",
        }
        return labels[self]


class League(Base):
    """
    A League competition belonging to a Club.
    Separate domain from Tournaments.
    """
    __tablename__ = "leagues"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[LeagueStatus] = mapped_column(
        Enum(LeagueStatus, name="league_status", native_enum=True),
        default=LeagueStatus.DRAFT,
        nullable=False,
        index=True,
    )

    number_of_weeks: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=4,
    )

    current_week: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=1,
    )

    team_size: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=2,
    )

    playoff_team_count: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=4,
    )

    max_teams: Mapped[int | None] = mapped_column(
        SmallInteger,
        nullable=True,
        default=8,
    )

    registration_fee: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        default=0,
    )

    registration_open_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    registration_close_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    scoring_rules: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        default=lambda: {"game_format": "single_game", "target_score": 11, "win_by": 2},
    )

    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    champion_team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL", use_alter=True, name="fk_leagues_champion_team_id"),
        nullable=True,
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
    club: Mapped["Club"] = relationship("Club")  # noqa: F821
    champion_team: Mapped["Team | None"] = relationship(  # noqa: F821
        "Team", foreign_keys=[champion_team_id], post_update=True
    )
    weeks: Mapped[list["LeagueWeek"]] = relationship(
        "LeagueWeek",
        back_populates="league",
        cascade="all, delete-orphan",
        order_by="LeagueWeek.week_number.asc()",
    )
    teams: Mapped[list["Team"]] = relationship(  # noqa: F821
        "Team",
        foreign_keys="Team.league_id",
        back_populates="league",
        cascade="all, delete-orphan",
    )
    matches: Mapped[list["Match"]] = relationship(  # noqa: F821
        "Match",
        back_populates="league",
        cascade="all, delete-orphan",
    )
    weekly_standings: Mapped[list["LeagueWeeklyStanding"]] = relationship(
        "LeagueWeeklyStanding",
        back_populates="league",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<League id={self.id} club_id={self.club_id} name={self.name!r} status={self.status.value}>"


class LeagueWeek(Base):
    """A scheduled competition week in a league."""
    __tablename__ = "league_weeks"
    __table_args__ = (
        UniqueConstraint(
            "league_id", "week_number",
            name="uq_league_weeks_league_number",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leagues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    week_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    week_type: Mapped[LeagueWeekType] = mapped_column(
        Enum(LeagueWeekType, name="league_week_type", native_enum=True),
        nullable=False,
        default=LeagueWeekType.REGULAR_SEASON,
    )

    status: Mapped[LeagueWeekStatus] = mapped_column(
        Enum(LeagueWeekStatus, name="league_week_status", native_enum=True),
        nullable=False,
        default=LeagueWeekStatus.PENDING,
    )

    start_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
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
    league: Mapped["League"] = relationship("League", back_populates="weeks")
    matches: Mapped[list["Match"]] = relationship(  # noqa: F821
        "Match",
        back_populates="league_week",
        cascade="all, delete-orphan",
    )
    standings_snapshots: Mapped[list["LeagueWeeklyStanding"]] = relationship(
        "LeagueWeeklyStanding",
        back_populates="league_week",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<LeagueWeek id={self.id} league_id={self.league_id} "
            f"week_number={self.week_number} type={self.week_type.value}>"
        )


class LeagueWeeklyStanding(Base):
    """A preserved snapshot of team standings for a completed regular-season week."""
    __tablename__ = "league_weekly_standings"
    __table_args__ = (
        UniqueConstraint(
            "league_week_id", "team_id",
            name="uq_league_weekly_standings_week_team",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    league_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leagues.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    league_week_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("league_weeks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    week_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    matches_played: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    wins: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    losses: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    points_scored: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_allowed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    points_differential: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    league: Mapped["League"] = relationship("League", back_populates="weekly_standings")
    league_week: Mapped["LeagueWeek"] = relationship("LeagueWeek", back_populates="standings_snapshots")
    team: Mapped["Team"] = relationship("Team")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<LeagueWeeklyStanding league_id={self.league_id} week={self.week_number} "
            f"team_id={self.team_id} rank={self.rank}>"
        )
