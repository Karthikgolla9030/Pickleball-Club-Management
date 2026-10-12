"""
Aught2 Pickleball — Notification Model
Stores persistent notifications for players and club staff.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.club import Club
    from app.models.user import User


class Notification(Base):
    """
    Persistent notification model for players and staff.
    Delivered via real-time WebSocket and stored for historical viewing.
    """
    __tablename__ = "notifications"

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

    club_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="general",
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    is_read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        index=True,
    )

    data: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        default=dict,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    club: Mapped["Club | None"] = relationship("Club", foreign_keys=[club_id])

    @property
    def club_name(self) -> str | None:
        return self.club.name if self.club else None

    @property
    def resource_type(self) -> str | None:
        return (self.data or {}).get("resource_type")

    @property
    def resource_id(self) -> str | None:
        return (self.data or {}).get("resource_id")

    @property
    def action_url(self) -> str | None:
        return (self.data or {}).get("action_url")

    def __repr__(self) -> str:
        return f"<Notification user={self.user_id} title={self.title} read={self.is_read}>"


class NotificationPreference(Base):
    """
    Persistent notification preferences per user.
    Controls optional in-app delivery for domain categories.
    Mandatory transactional/security notifications bypass user preference toggles.
    """
    __tablename__ = "notification_preferences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    booking_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    membership_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tournament_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    event_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    payment_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    administrative_notifications: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<NotificationPreference user={self.user_id}>"
