"""
Aught2 Pickleball — Club Asset & Media Schemas
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ClubBrandingResponse(BaseModel):
    """Current branding state for a club."""
    club_id: UUID
    name: str
    logo_url: str | None = None
    cover_image_url: str | None = None
    owner_banner_url: str | None = None
    default_tournament_round_robin_url: str | None = None
    default_tournament_scramble_url: str | None = None
    default_tournament_pool_play_url: str | None = None
    default_tournament_bracket_url: str | None = None
    default_league_banner_url: str | None = None
    default_event_banner_url: str | None = None
    default_lesson_banner_url: str | None = None

    has_custom_logo: bool = False
    has_custom_cover: bool = False
    has_custom_owner_banner: bool = False
    has_custom_tournament_round_robin: bool = False
    has_custom_tournament_scramble: bool = False
    has_custom_tournament_pool_play: bool = False
    has_custom_tournament_bracket: bool = False
    has_custom_league_banner: bool = False
    has_custom_event_banner: bool = False
    has_custom_lesson_banner: bool = False

    model_config = {"from_attributes": True}


class ClubBrandingUpdateRequest(BaseModel):
    """Payload to update club logo, cover, owner banner, or activity defaults."""
    logo_url: str | None = Field(None, max_length=1000)
    cover_image_url: str | None = Field(None, max_length=1000)
    owner_banner_url: str | None = Field(None, max_length=1000)
    default_tournament_round_robin_url: str | None = Field(None, max_length=1000)
    default_tournament_scramble_url: str | None = Field(None, max_length=1000)
    default_tournament_pool_play_url: str | None = Field(None, max_length=1000)
    default_tournament_bracket_url: str | None = Field(None, max_length=1000)
    default_league_banner_url: str | None = Field(None, max_length=1000)
    default_event_banner_url: str | None = Field(None, max_length=1000)
    default_lesson_banner_url: str | None = Field(None, max_length=1000)


class ClubCarouselSlideResponse(BaseModel):
    """Response schema for a single carousel slide / promotional ad."""
    id: UUID
    club_id: UUID
    title: str | None = None
    subtitle: str | None = None
    tag: str | None = "PICKLEBALL"
    image_url: str
    cta_text: str | None = "Book a Court"
    cta_route: str | None = "/(player)/bookings"
    display_order: int = 0
    is_active: bool = True
    start_date: datetime | None = None
    end_date: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ClubCarouselSlideCreateRequest(BaseModel):
    """Payload to create a new promotional carousel slide / ad."""
    title: str | None = Field(None, max_length=255)
    subtitle: str | None = Field(None, max_length=500)
    tag: str | None = Field("PICKLEBALL", max_length=100)
    image_url: str = Field(..., min_length=1, max_length=1000)
    cta_text: str | None = Field("Book a Court", max_length=100)
    cta_route: str | None = Field("/(player)/bookings", max_length=255)
    display_order: int = Field(0, ge=0)
    is_active: bool = True
    start_date: datetime | None = None
    end_date: datetime | None = None


class ClubCarouselSlideUpdateRequest(BaseModel):
    """Payload to update an existing promotional carousel slide / ad."""
    title: str | None = Field(None, max_length=255)
    subtitle: str | None = Field(None, max_length=500)
    tag: str | None = Field(None, max_length=100)
    image_url: str | None = Field(None, min_length=1, max_length=1000)
    cta_text: str | None = Field(None, max_length=100)
    cta_route: str | None = Field(None, max_length=255)
    display_order: int | None = Field(None, ge=0)
    is_active: bool | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None


class UniversalPromotionalAdResponse(BaseModel):
    """Response schema for an aggregated club promotional ad shown in Player App."""
    id: UUID
    club_id: UUID
    club_name: str
    club_logo_url: str | None = None
    title: str | None = None
    subtitle: str | None = None
    tag: str | None = None
    image_url: str
    cta_text: str | None = None
    cta_route: str | None = None
    display_order: int = 0
    is_active: bool = True
    start_date: datetime | None = None
    end_date: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReorderSlidesRequest(BaseModel):
    """Payload to reorder carousel slides."""
    slide_ids: list[UUID]


class MediaUploadResponse(BaseModel):
    """Response returned upon successful file upload."""
    asset_id: UUID
    public_url: str
    asset_type: str
    width: int | None = None
    height: int | None = None
    file_size_bytes: int | None = None


class EntityImageUpdateRequest(BaseModel):
    """Payload to update or reset an entity-specific image (tournament, league, event, court, lesson)."""
    image_url: str | None = Field(None, max_length=1000)
