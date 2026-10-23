"""
Aught2 Pickleball — Global Platform Settings Model

Persists runtime-editable global platform parameters:
- Platform display branding
- Public registration gates (clubs and players)
- Global maintenance notice toggle
- Max media upload threshold (MB)
- Global support contact email

Security:
- Never used to store credentials, database URLs, JWT secrets, or cloud access keys.
- Infrastructure and secret configurations are managed in environment variables.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    platform_name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="Aught2 Pickleball",
    )

    platform_support_email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        default="support@pickleball.com",
    )

    allow_new_club_registrations: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    allow_user_registrations: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    maintenance_mode: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    max_upload_size_mb: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=5,
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

    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    updated_by_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    updated_by = relationship("User", foreign_keys=[updated_by_id])
