"""
Aught2 Pickleball — PlayerProfile Model

Represents the individual player identity for tournament, league, and club participation.
One User → zero or one PlayerProfile.
Separated from staff authentication and authorization roles.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlayerProfile(Base):
    __tablename__ = "player_profiles"

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

    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(50), nullable=True)
    profile_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    skill_rating: Mapped[float | None] = mapped_column(nullable=True, default=3.5)

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
    user: Mapped["User"] = relationship("User", back_populates="player_profile")  # noqa: F821

    def __repr__(self) -> str:
        return f"<PlayerProfile id={self.id} user_id={self.user_id} display_name={self.display_name}>"
