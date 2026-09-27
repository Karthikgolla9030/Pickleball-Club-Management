"""
Aught2 Pickleball — Tournament Registration Model

Represents a player's registration in a tournament.
Links a Tournament to a ClubPlayerMembership, ensuring that only players
with an active player membership in the tournament's club can register.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RegistrationStatus(str, enum.Enum):
    """
    Status of a player's registration in a tournament.
    """
    PENDING = "pending"
    CONFIRMED = "confirmed"
    WAITLISTED = "waitlisted"
    CANCELLED = "cancelled"

    @property
    def display_label(self) -> str:
        labels = {
            RegistrationStatus.PENDING: "Pending",
            RegistrationStatus.CONFIRMED: "Confirmed",
            RegistrationStatus.WAITLISTED: "Waitlisted",
            RegistrationStatus.CANCELLED: "Cancelled",
        }
        return labels[self]


class TournamentRegistration(Base):
    __tablename__ = "tournament_registrations"
    __table_args__ = (
        UniqueConstraint(
            "tournament_id",
            "player_membership_id",
            name="uq_tournament_registrations_tournament_player",
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

    player_membership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("club_player_memberships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[RegistrationStatus] = mapped_column(
        Enum(RegistrationStatus, name="registration_status", native_enum=True),
        default=RegistrationStatus.CONFIRMED,
        nullable=False,
        index=True,
    )

    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
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

    # ─── Relationships ──────────────────────────────────────────────────────────
    tournament: Mapped["Tournament"] = relationship(  # noqa: F821
        "Tournament",
        back_populates="registrations",
    )
    player_membership: Mapped["ClubPlayerMembership"] = relationship(  # noqa: F821
        "ClubPlayerMembership",
    )

    def __repr__(self) -> str:
        return (
            f"<TournamentRegistration id={self.id} tournament_id={self.tournament_id} "
            f"player_membership_id={self.player_membership_id} status={self.status.value}>"
        )
