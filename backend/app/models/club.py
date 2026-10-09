"""
Aught2 Pickleball — Club Model
A facility/club entity. Users are associated through ClubMembership.
"""
from __future__ import annotations

import uuid
from datetime import datetime, time, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Club(Base):
    __tablename__ = "clubs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    short_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ─── Contact Information ─────────────────────────────────────
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    established_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ─── Location Information ────────────────────────────────────
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True, default="United States")

    # ─── Operating & Facility Information ─────────────────────────
    operating_days: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        default="Monday - Sunday",
    )
    opening_time: Mapped[time] = mapped_column(
        Time,
        default=time(6, 0),
        nullable=False,
    )
    closing_time: Mapped[time] = mapped_column(
        Time,
        default=time(22, 0),
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(
        String(50),
        default="UTC",
        nullable=False,
    )
    holiday_closure_notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    facilities_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
    memberships: Mapped[list["ClubMembership"]] = relationship(  # noqa: F821
        "ClubMembership",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    player_memberships: Mapped[list["ClubPlayerMembership"]] = relationship(  # noqa: F821
        "ClubPlayerMembership",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    tournaments: Mapped[list["Tournament"]] = relationship(  # noqa: F821
        "Tournament",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    courts: Mapped[list["Court"]] = relationship(  # noqa: F821
        "Court",
        back_populates="club",
        cascade="all, delete-orphan",
        order_by="Court.display_order",
    )
    bookings: Mapped[list["Booking"]] = relationship(  # noqa: F821
        "Booking",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    membership_plans: Mapped[list["MembershipPlan"]] = relationship(  # noqa: F821
        "MembershipPlan",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    subscriptions: Mapped[list["MemberSubscription"]] = relationship(  # noqa: F821
        "MemberSubscription",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    payments: Mapped[list["Payment"]] = relationship(  # noqa: F821
        "Payment",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["Event"]] = relationship(  # noqa: F821
        "Event",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    coaches: Mapped[list["Coach"]] = relationship(  # noqa: F821
        "Coach",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    lesson_types: Mapped[list["LessonType"]] = relationship(  # noqa: F821
        "LessonType",
        back_populates="club",
        cascade="all, delete-orphan",
    )
    lessons: Mapped[list["Lesson"]] = relationship(  # noqa: F821
        "Lesson",
        back_populates="club",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Club id={self.id} name={self.name} slug={self.slug}>"

