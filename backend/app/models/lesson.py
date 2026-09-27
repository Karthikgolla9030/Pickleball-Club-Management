"""
Aught2 Pickleball — Lesson & Coaching Models (Phase 15)

Defines:
  - LessonStatus: draft, published, cancelled, completed
  - LessonRegistrationStatus: registered, cancelled, attended, no_show
  - Coach: Club coaching personnel (informational record, NOT an RBAC role)
  - LessonType: Reusable lesson template (name, duration, default capacity, price, is_private)
  - Lesson: Scheduled coaching session with coach, optional court, capacity, and status
  - LessonRegistration: Player registration record with attendance tracking
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

class LessonStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class LessonRegistrationStatus(str, enum.Enum):
    REGISTERED = "registered"
    CANCELLED = "cancelled"
    ATTENDED = "attended"
    NO_SHOW = "no_show"


# ─── Coach Model ──────────────────────────────────────────────────────────────

class Coach(Base):
    """
    Club coaching personnel record.
    A coach belongs to exactly one club.
    Optionally links to a User record via user_id.
    IMPORTANT: A coach is an informational record, NOT a staff login role.
    """
    __tablename__ = "coaches"

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
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    bio: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    specialization: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    phone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
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

    # ─── Relationships ────────────────────────────────────────────
    club: Mapped["Club"] = relationship("Club", back_populates="coaches")  # noqa: F821
    user: Mapped["User | None"] = relationship("User", back_populates="coach_profiles")  # noqa: F821
    lessons: Mapped[list["Lesson"]] = relationship("Lesson", back_populates="coach")

    def __repr__(self) -> str:
        return f"<Coach id={self.id} name={self.name!r} club_id={self.club_id} is_active={self.is_active}>"


# ─── Lesson Type Model ────────────────────────────────────────────────────────

class LessonType(Base):
    """
    Reusable lesson configuration template.
    Defines name, default duration, default capacity, and default price.
    is_private denotes private lessons (single player capacity).
    """
    __tablename__ = "lesson_types"

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
        String(255),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    duration_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=60,
    )
    default_capacity: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    default_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=Decimal("0.00"),
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )
    is_private: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
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

    # ─── Relationships ────────────────────────────────────────────
    club: Mapped["Club"] = relationship("Club", back_populates="lesson_types")  # noqa: F821
    lessons: Mapped[list["Lesson"]] = relationship("Lesson", back_populates="lesson_type")

    def __repr__(self) -> str:
        return f"<LessonType id={self.id} name={self.name!r} club_id={self.club_id} is_private={self.is_private}>"


# ─── Lesson Model ─────────────────────────────────────────────────────────────

class Lesson(Base):
    """
    Scheduled coaching session.
    Belongs to a club, assigned to a coach and optionally a court.
    Copies price from LessonType at creation time; historical prices remain immutable.
    """
    __tablename__ = "lessons"

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
    lesson_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lesson_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    coach_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("coaches.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    court_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courts.id", ondelete="SET NULL"),
        nullable=True,
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
    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    end_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    capacity: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        default=Decimal("0.00"),
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )
    status: Mapped[LessonStatus] = mapped_column(
        Enum(LessonStatus, name="lesson_status", create_type=True),
        nullable=False,
        default=LessonStatus.DRAFT,
        index=True,
    )
    registration_opens_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    registration_closes_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
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
    club: Mapped["Club"] = relationship("Club", back_populates="lessons")  # noqa: F821
    lesson_type: Mapped["LessonType"] = relationship("LessonType", back_populates="lessons")
    coach: Mapped["Coach"] = relationship("Coach", back_populates="lessons")
    court: Mapped["Court | None"] = relationship("Court", back_populates="lessons")  # noqa: F821
    created_by: Mapped["User | None"] = relationship("User", back_populates="created_lessons")  # noqa: F821
    registrations: Mapped[list["LessonRegistration"]] = relationship(
        "LessonRegistration",
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="LessonRegistration.registered_at",
    )

    def __repr__(self) -> str:
        return f"<Lesson id={self.id} title={self.title!r} status={self.status} club_id={self.club_id}>"


# ─── Lesson Registration Model ────────────────────────────────────────────────

class LessonRegistration(Base):
    """
    Player registration record for a coaching lesson.
    Enforces one active registration per user per lesson.
    """
    __tablename__ = "lesson_registrations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    lesson_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[LessonRegistrationStatus] = mapped_column(
        Enum(LessonRegistrationStatus, name="lesson_registration_status", create_type=True),
        nullable=False,
        default=LessonRegistrationStatus.REGISTERED,
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
    attended_at: Mapped[datetime | None] = mapped_column(
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
    lesson: Mapped["Lesson"] = relationship(
        "Lesson",
        back_populates="registrations",
    )
    user: Mapped["User"] = relationship(  # noqa: F821
        "User",
        back_populates="lesson_registrations",
    )

    __table_args__ = (
        # Partial unique index: one active registration per user per lesson.
        # Cancelled registrations can be retained historically.
        Index(
            "uq_lesson_registrations_one_active_per_user",
            "lesson_id",
            "user_id",
            unique=True,
            postgresql_where=(text("status != 'CANCELLED'")),
            sqlite_where=(text("status != 'CANCELLED'")),
        ),
    )

    def __repr__(self) -> str:
        return f"<LessonRegistration id={self.id} lesson_id={self.lesson_id} user_id={self.user_id} status={self.status}>"
