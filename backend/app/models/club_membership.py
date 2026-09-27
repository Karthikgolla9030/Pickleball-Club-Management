"""
Aught2 Pickleball — ClubMembership Model

THE role lives HERE — not on User.

This design allows:
  - A user to be Club Owner at Club A and Tournament Director at Club B
  - A user to have player identity completely separate from club roles
  - Future multi-club support without any schema changes

Valid roles:
  - club_owner
  - club_manager
  - tournament_director
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ClubRole(str, enum.Enum):
    """
    The three and only three club management roles.
    Display labels are defined in the permissions module.
    """
    CLUB_OWNER = "club_owner"
    CLUB_MANAGER = "club_manager"
    TOURNAMENT_DIRECTOR = "tournament_director"

    @property
    def display_label(self) -> str:
        labels = {
            ClubRole.CLUB_OWNER: "Club Owner",
            ClubRole.CLUB_MANAGER: "Club Manager",
            ClubRole.TOURNAMENT_DIRECTOR: "Tournament Director",
        }
        return labels[self]


class ClubMembership(Base):
    __tablename__ = "club_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "club_id", name="uq_club_memberships_user_club"),
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

    # ─── THE ROLE LIVES HERE — NOT ON USER ──────────────────────
    role: Mapped[ClubRole] = mapped_column(
        Enum(ClubRole, name="club_role", create_type=True),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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
    user: Mapped["User"] = relationship("User", back_populates="club_memberships")  # noqa: F821
    club: Mapped["Club"] = relationship("Club", back_populates="memberships")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<ClubMembership user={self.user_id} "
            f"club={self.club_id} role={self.role}>"
        )
