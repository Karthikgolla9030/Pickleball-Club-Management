"""
Aught2 Pickleball — ClubPlayerMembership Model

Represents a player's membership and participation rights at a specific club.
Completely separate from staff authorization (ClubMembership).
A user can have both ClubMembership (staff role) and ClubPlayerMembership at the same club.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlayerMembershipStatus(str, enum.Enum):
    """
    Valid statuses for player membership at a club.
    """
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    EXPIRED = "expired"

    @property
    def display_label(self) -> str:
        labels = {
            PlayerMembershipStatus.ACTIVE: "Active",
            PlayerMembershipStatus.INACTIVE: "Inactive",
            PlayerMembershipStatus.SUSPENDED: "Suspended",
            PlayerMembershipStatus.EXPIRED: "Expired",
        }
        return labels[self]


class ClubPlayerMembership(Base):
    __tablename__ = "club_player_memberships"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "club_id", name="uq_club_player_memberships_user_club"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    membership_number: Mapped[str | None] = mapped_column(String(100), nullable=True)

    status: Mapped[PlayerMembershipStatus] = mapped_column(
        Enum(
            PlayerMembershipStatus,
            name="player_membership_status",
            create_type=True,
        ),
        default=PlayerMembershipStatus.ACTIVE,
        nullable=False,
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
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

    # ─── Relationships ───────────────────────────────────────────
    user: Mapped["User"] = relationship("User", back_populates="club_player_memberships")  # noqa: F821
    club: Mapped["Club"] = relationship("Club", back_populates="player_memberships")  # noqa: F821
    subscriptions: Mapped[list["MemberSubscription"]] = relationship(  # noqa: F821
        "MemberSubscription",
        back_populates="player_membership",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<ClubPlayerMembership user={self.user_id} club={self.club_id} "
            f"status={self.status}>"
        )
