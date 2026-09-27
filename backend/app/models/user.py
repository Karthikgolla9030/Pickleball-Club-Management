"""
Aught2 Pickleball — User Model
Identity model. Role is NOT stored here — it lives on ClubMembership.
A user may have zero, one, or multiple club memberships.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    club_memberships: Mapped[list["ClubMembership"]] = relationship(  # noqa: F821
        "ClubMembership",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    player_profile: Mapped["PlayerProfile | None"] = relationship(  # noqa: F821
        "PlayerProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    club_player_memberships: Mapped[list["ClubPlayerMembership"]] = relationship(  # noqa: F821
        "ClubPlayerMembership",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    payments: Mapped[list["Payment"]] = relationship(  # noqa: F821
        "Payment",
        foreign_keys="Payment.player_id",
        back_populates="player",
        cascade="all, delete-orphan",
    )
    event_registrations: Mapped[list["EventRegistration"]] = relationship(  # noqa: F821
        "EventRegistration",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    created_events: Mapped[list["Event"]] = relationship(  # noqa: F821
        "Event",
        foreign_keys="Event.created_by_user_id",
        back_populates="created_by",
        cascade="all, delete-orphan",
    )
    coach_profiles: Mapped[list["Coach"]] = relationship(  # noqa: F821
        "Coach",
        foreign_keys="Coach.user_id",
        back_populates="user",
    )
    lesson_registrations: Mapped[list["LessonRegistration"]] = relationship(  # noqa: F821
        "LessonRegistration",
        foreign_keys="LessonRegistration.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    created_lessons: Mapped[list["Lesson"]] = relationship(  # noqa: F821
        "Lesson",
        foreign_keys="Lesson.created_by_user_id",
        back_populates="created_by",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"

