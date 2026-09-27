"""
Aught2 Pickleball — Court Model (Phase 10)

Represents a playable court belonging to a specific Club.
Serves as the foundation for future booking, schedule, and facility features.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CourtStatus(str, enum.Enum):
    """
    Operational status of a court.
    ACTIVE = available for use / visible to players
    INACTIVE = unavailable / staff-only visibility / not bookable
    """
    ACTIVE = "active"
    INACTIVE = "inactive"

    @property
    def display_label(self) -> str:
        return "Active" if self == CourtStatus.ACTIVE else "Inactive"


class CourtEnvironment(str, enum.Enum):
    """Setting of the court: indoor, outdoor, or covered."""
    INDOOR = "indoor"
    OUTDOOR = "outdoor"
    COVERED = "covered"

    @property
    def display_label(self) -> str:
        labels = {
            CourtEnvironment.INDOOR: "Indoor",
            CourtEnvironment.OUTDOOR: "Outdoor",
            CourtEnvironment.COVERED: "Covered",
        }
        return labels.get(self, self.value.capitalize())


class Court(Base):
    """
    A court facility resource owned by exactly one Club.
    """
    __tablename__ = "courts"
    __table_args__ = (
        UniqueConstraint("club_id", "court_number", name="uq_courts_club_court_number"),
        UniqueConstraint("club_id", "name", name="uq_courts_club_name"),
    )

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

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    display_name: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    court_number: Mapped[int | None] = mapped_column(
        SmallInteger,
        nullable=True,
        index=True,
    )

    surface_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    indoor_outdoor: Mapped[CourtEnvironment] = mapped_column(
        Enum(CourtEnvironment, name="court_environment", native_enum=True),
        nullable=False,
        default=CourtEnvironment.INDOOR,
    )

    status: Mapped[CourtStatus] = mapped_column(
        Enum(CourtStatus, name="court_status", native_enum=True),
        nullable=False,
        default=CourtStatus.ACTIVE,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        index=True,
    )

    display_order: Mapped[int] = mapped_column(
        SmallInteger,
        default=0,
        nullable=False,
        index=True,
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

    # ─── Relationships ────────────────────────────────────────────────────────
    club: Mapped["Club"] = relationship("Club", back_populates="courts")  # noqa: F821
    bookings: Mapped[list["Booking"]] = relationship(  # noqa: F821
        "Booking",
        back_populates="court",
    )
    lessons: Mapped[list["Lesson"]] = relationship(  # noqa: F821
        "Lesson",
        back_populates="court",
    )
    matches: Mapped[list["Match"]] = relationship(  # noqa: F821
        "Match",
        back_populates="court",
    )

    def __repr__(self) -> str:
        return (
            f"<Court id={self.id} club_id={self.club_id} number={self.court_number} "
            f"name={self.name!r} status={self.status.value}>"
        )
