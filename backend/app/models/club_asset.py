"""
Aught2 Pickleball — Club Media and Asset Models

Represents:
- ClubCarouselSlide: Customizable hero promotional carousel slides scoped to a single club.
- ClubMediaAsset: Tracked uploaded assets for audit, deduplication, and cleanup.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ClubCarouselSlide(Base):
    """
    Hero promotional carousel slide owned by a specific club.
    Supports title, subtitle, category tag, CTA label, target route, ordering, and active toggle.
    """
    __tablename__ = "club_carousel_slides"

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

    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subtitle: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tag: Mapped[str | None] = mapped_column(String(100), nullable=True, default="PICKLEBALL")
    image_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    cta_text: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Book a Court")
    cta_route: Mapped[str | None] = mapped_column(String(255), nullable=True, default="/(player)/bookings")

    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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

    # Relationship back to Club
    club: Mapped["Club"] = relationship("Club", back_populates="carousel_slides")  # noqa: F821

    def __repr__(self) -> str:
        return f"<ClubCarouselSlide id={self.id} club_id={self.club_id} order={self.display_order} active={self.is_active}>"


class ClubMediaAsset(Base):
    """
    Audit registry for club-uploaded visual assets (logos, covers, banners, cards).
    Enables safe cleanup, quota auditing, and multi-tenant isolation verification.
    """
    __tablename__ = "club_media_assets"

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
    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    asset_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )  # e.g., 'club_logo', 'club_cover', 'carousel_slide', 'tournament_banner', 'league_banner', 'event_cover', 'court_photo', 'lesson_image'
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)

    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    public_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship back to Club
    club: Mapped["Club"] = relationship("Club", back_populates="media_assets")  # noqa: F821

    def __repr__(self) -> str:
        return f"<ClubMediaAsset id={self.id} club_id={self.club_id} type={self.asset_type}>"
