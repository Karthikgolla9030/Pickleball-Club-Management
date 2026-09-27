"""
Aught2 Pickleball — Booking Model (Phase 11)

Represents a court reservation for a single time interval.
Belongs to a Club and Court, created by a User (player or staff),
and reserved for a specific player User.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BookingStatus(str, enum.Enum):
    """Lifecycle status of a court reservation."""
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"

    @property
    def display_label(self) -> str:
        labels = {
            BookingStatus.CONFIRMED: "Confirmed",
            BookingStatus.CANCELLED: "Cancelled",
            BookingStatus.COMPLETED: "Completed",
        }
        return labels[self]


class BookingType(str, enum.Enum):
    """Actor/origin classification for the reservation."""
    PLAYER = "player"
    STAFF = "staff"
    MAINTENANCE = "maintenance"
    BLOCKED = "blocked"

    @property
    def display_label(self) -> str:
        labels = {
            BookingType.PLAYER: "Player Booking",
            BookingType.STAFF: "Staff Booking",
            BookingType.MAINTENANCE: "Maintenance",
            BookingType.BLOCKED: "Blocked",
        }
        return labels[self]


class Booking(Base):
    """
    A reservation of one Court for one time interval [start_at, end_at).
    """
    __tablename__ = "bookings"

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

    court_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    booked_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    end_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status", native_enum=True),
        nullable=False,
        default=BookingStatus.CONFIRMED,
        index=True,
    )

    booking_type: Mapped[BookingType] = mapped_column(
        Enum(BookingType, name="booking_type", native_enum=True),
        nullable=False,
        default=BookingType.PLAYER,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    cancellation_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    cancelled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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

    price_per_hour: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        default=None,
    )

    total_price: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
        default=None,
    )

    currency: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="INR",
    )

    # ─── Relationships ────────────────────────────────────────────────────────
    club: Mapped["Club"] = relationship("Club", back_populates="bookings")  # noqa: F821
    court: Mapped["Court"] = relationship("Court", back_populates="bookings")  # noqa: F821
    booked_by: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[booked_by_user_id]
    )
    player: Mapped["User | None"] = relationship(  # noqa: F821
        "User", foreign_keys=[player_id]
    )
    cancelled_by: Mapped["User | None"] = relationship(  # noqa: F821
        "User", foreign_keys=[cancelled_by_user_id]
    )

    @property
    def created_by_user_id(self) -> uuid.UUID:
        return self.booked_by_user_id

    @property
    def duration_minutes(self) -> int:
        return int((self.end_at - self.start_at).total_seconds() / 60)

    def __repr__(self) -> str:
        return (
            f"<Booking id={self.id} court_id={self.court_id} "
            f"start={self.start_at.isoformat()} status={self.status.value}>"
        )

