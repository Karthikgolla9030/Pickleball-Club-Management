"""
Aught2 Pickleball — ClubMembershipRequest Model

Represents a player's application/request to join an independent club.
Decoupled from ClubPlayerMembership and MemberSubscription.
Follows a strict lifecycle:
  pending -> approved (creates/activates ClubPlayerMembership)
  pending -> rejected (with optional rejection reason)
  pending -> withdrawn (by player)
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class MembershipRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"

    @property
    def display_label(self) -> str:
        labels = {
            MembershipRequestStatus.PENDING: "Pending",
            MembershipRequestStatus.APPROVED: "Approved",
            MembershipRequestStatus.REJECTED: "Rejected",
            MembershipRequestStatus.WITHDRAWN: "Withdrawn",
        }
        return labels[self]


class ClubMembershipRequest(Base):
    __tablename__ = "club_membership_requests"
    __table_args__ = (
        Index(
            "ix_club_membership_requests_club_status",
            "club_id",
            "status",
        ),
        Index(
            "ix_club_membership_requests_user_status",
            "user_id",
            "status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status: Mapped[MembershipRequestStatus] = mapped_column(
        Enum(
            MembershipRequestStatus,
            name="membership_request_status",
            create_type=True,
        ),
        default=MembershipRequestStatus.PENDING,
        nullable=False,
        index=True,
    )

    message: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )

    rejection_reason: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
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

    # Relationships
    club: Mapped["Club"] = relationship(  # noqa: F821
        "Club",
        back_populates="membership_requests",
    )

    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[user_id],
    )

    reviewed_by: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[reviewed_by_id],
    )
