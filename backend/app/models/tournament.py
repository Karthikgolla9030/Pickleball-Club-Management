"""
Aught2 Pickleball — Tournament Model

Represents a tournament belonging to a single club.
Defines tournament format, status lifecycle, visibility, schedule,
and deterministic scoring & tiebreaker rules.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TournamentStatus(str, enum.Enum):
    """
    Strict lifecycle statuses for a tournament.
    """
    DRAFT = "draft"
    REGISTRATION_OPEN = "registration_open"
    REGISTRATION_CLOSED = "registration_closed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

    @property
    def display_label(self) -> str:
        labels = {
            TournamentStatus.DRAFT: "Draft",
            TournamentStatus.REGISTRATION_OPEN: "Registration Open",
            TournamentStatus.REGISTRATION_CLOSED: "Registration Closed",
            TournamentStatus.IN_PROGRESS: "In Progress",
            TournamentStatus.COMPLETED: "Completed",
            TournamentStatus.CANCELLED: "Cancelled",
        }
        return labels[self]


class TournamentFormat(str, enum.Enum):
    """
    Strictly four distinct tournament format identities.
    No aliases (e.g. elimination, round_robin_knockout).
    """
    ROUND_ROBIN = "round_robin"
    POOL_PLAY = "pool_play"
    SCRAMBLE = "scramble"
    BRACKET = "bracket"

    @property
    def display_label(self) -> str:
        labels = {
            TournamentFormat.ROUND_ROBIN: "Round Robin",
            TournamentFormat.POOL_PLAY: "Pool Play",
            TournamentFormat.SCRAMBLE: "Scramble",
            TournamentFormat.BRACKET: "Bracket",
        }
        return labels[self]


class TournamentVisibility(str, enum.Enum):
    """
    Tournament discoverability settings.
    """
    PUBLIC = "public"
    PRIVATE = "private"

    @property
    def display_label(self) -> str:
        labels = {
            TournamentVisibility.PUBLIC: "Public",
            TournamentVisibility.PRIVATE: "Private",
        }
        return labels[self]


DEFAULT_SCORING_RULES = {
    "game_format": "single_game",
    "target_score": 11,
    "win_by": 2,
}

DEFAULT_TIEBREAKER_RULES = [
    "wins",
    "points_differential",
    "total_points_scored",
    "team_name_deterministic",
]


class Tournament(Base):
    __tablename__ = "tournaments"

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

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[TournamentStatus] = mapped_column(
        Enum(TournamentStatus, name="tournament_status", native_enum=True),
        default=TournamentStatus.DRAFT,
        nullable=False,
        index=True,
    )

    format: Mapped[TournamentFormat] = mapped_column(
        Enum(TournamentFormat, name="tournament_format", native_enum=True),
        nullable=False,
        index=True,
    )

    is_competition_locked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    visibility: Mapped[TournamentVisibility] = mapped_column(
        Enum(TournamentVisibility, name="tournament_visibility", native_enum=True),
        default=TournamentVisibility.PUBLIC,
        nullable=False,
        index=True,
    )

    start_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    end_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    registration_open_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    registration_close_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    min_participants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_participants: Mapped[int | None] = mapped_column(Integer, nullable=True)

    scoring_rules: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: dict(DEFAULT_SCORING_RULES),
    )
    tiebreaker_rules: Mapped[list] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: list(DEFAULT_TIEBREAKER_RULES),
    )
    format_configuration: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        default=dict,
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

    # ─── Relationships ──────────────────────────────────────────────────────────
    club: Mapped["Club"] = relationship("Club", back_populates="tournaments")  # noqa: F821
    created_by: Mapped["User | None"] = relationship("User")  # noqa: F821
    registrations: Mapped[list["TournamentRegistration"]] = relationship(  # noqa: F821
        "TournamentRegistration",
        back_populates="tournament",
        cascade="all, delete-orphan",
    )
    teams: Mapped[list["Team"]] = relationship(  # noqa: F821
        "Team",
        back_populates="tournament",
        cascade="all, delete-orphan",
    )
    matches: Mapped[list["Match"]] = relationship(  # noqa: F821
        "Match",
        back_populates="tournament",
        cascade="all, delete-orphan",
    )
    pools: Mapped[list["Pool"]] = relationship(  # noqa: F821
        "Pool",
        back_populates="tournament",
        cascade="all, delete-orphan",
        order_by="Pool.display_order.asc()",
    )

    def __repr__(self) -> str:
        return (
            f"<Tournament id={self.id} club_id={self.club_id} name={self.name} "
            f"format={self.format.value} status={self.status.value}>"
        )


class TournamentFavorite(Base):
    __tablename__ = "tournament_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "tournament_id", name="uq_user_tournament_favorite"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tournament_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tournaments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User")  # noqa: F821
    tournament: Mapped["Tournament"] = relationship("Tournament")
