"""
Aught2 Pickleball — Platform Banner Schemas
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PlatformBannerResponse(BaseModel):
    id: UUID
    banner_type: str
    image_url: str | None = None
    title: str | None = None
    subtitle: str | None = None
    cta_text: str | None = None
    cta_destination: str | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlatformBannerUpdateRequest(BaseModel):
    image_url: str | None = Field(None, max_length=1000)
    title: str | None = Field(None, max_length=255)
    subtitle: str | None = Field(None, max_length=500)
    cta_text: str | None = Field(None, max_length=100)
    cta_destination: str | None = Field(None, max_length=255)
    is_active: bool | None = None


class PlatformBannersListResponse(BaseModel):
    banners: dict[str, PlatformBannerResponse]
