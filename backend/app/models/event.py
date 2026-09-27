"""
Aught2 Pickleball — Event Models (Phase 14)

Defines:
  - EventType: social, clinic, community, special, other
  - EventStatus: draft, published, cancelled, completed
  - EventVisibility: public, members_only, private
  - EventRegistrationStatus: registered, waitlisted, cancelled, attended, no_show
  - Event: Club event entity with capacity, registration windows, and pricing
  - EventRegistration: Player registration record with waitlist and attendance states
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import enum
import uuid

import sqlalchemy as sa
from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ─── Enums ────────────────────────────────────────────────────────────────────

class EventType(str, enum.Enum):
    SOCIAL = "social"
    CLINIC = "clinic"
    COMMUNITY = "community"
    SPECIAL = "special"
    OTHER = "other"


class EventStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class EventVisibility(str, enum.Enum):
    PUBLIC = "public"
    MEMBERS_ONLY = "members_only"
    PRIVATE = "private"


class EventRegistrationStatus(str, enum.Enum):
    REGISTERED = "registered"
    WAITLISTED = "waitlisted"
    CANCELLED = "cancelled"
    ATTENDED = "attended"
    NO_SHOW = "no_show"


# ─── Event Model ──────────────────────────────────────────────────────────────

class Event(Base):
    """
    Club Event entity.
    Events are distinct from tournaments, leagues, and open play.
    Belongs to exactly one club.
    """
    __tablename__ = "events"

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
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    event_type: Mapped[EventType] = mapped_column(
        Enum(EventType, name="event_type", create_type=True),
        nullable=False,
        default=EventType.SOCIAL,
        index=True,
    )
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, name="event_status", create_type=True),
        nullable=False,
        default=EventStatus.DRAFT,
        index=True,
    )
    visibility: Mapped[EventVisibility] = mapped_column(
        Enum(EventVisibility, name="event_visibility", create_type=True),
        nullable=False,
        default=EventVisibility.PUBLIC,
        index=True,
    )

    # Schedule
    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    end_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    location: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Capacity controls (null = unlimited)
    capacity: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # Registration configuration
    registration_required: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )
    registration_opens_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    registration_closes_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Fee storage (informational in Phase 14; no automated payment gateway)
    registration_fee: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=Decimal("0.00"),
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    # Creator audit
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
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

    # ─── Relationships ────────────────────────────────────────────
    club: Mapped["Club"] = relationship(  # noqa: F821
        "Club",
        back_populates="events",
    )
    created_by: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[created_by_user_id],
        back_populates="created_events",
    )
    registrations: Mapped[list["EventRegistration"]] = relationship(
        "EventRegistration",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="EventRegistration.registered_at",
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} title={self.title!r} status={self.status} club_id={self.club_id}>"


# ─── Event Registration Model ─────────────────────────────────────────────────

class EventRegistration(Base):
    """
    Player registration record for a club event.
    Supports registered, waitlisted, attended, no-show, and cancelled statuses.
    Enforces one active registration per user per event.
    """
    __tablename__ = "event_registrations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[EventRegistrationStatus] = mapped_column(
        Enum(EventRegistrationStatus, name="event_registration_status", create_type=True),
        nullable=False,
        default=EventRegistrationStatus.REGISTERED,
        index=True,
    )

    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
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

    # ─── Relationships ────────────────────────────────────────────
    event: Mapped["Event"] = relationship(
        "Event",
        back_populates="registrations",
    )
    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        back_populates="event_registrations",
    )

    __table_args__ = (
        # Partial unique index: one active registration per user per event.
        # Cancelled registrations can be retained historically.
        Index(
            "uq_event_registrations_one_active_per_user",
            "event_id",
            "user_id",
            unique=True,
            postgresql_where=(text("status != 'CANCELLED'")),
            sqlite_where=(text("status != 'CANCELLED'")),
        ),
    )

    def __repr__(self) -> str:
        return f"<EventRegistration id={self.id} event_id={self.event_id} user_id={self.user_id} status={self.status}>"
