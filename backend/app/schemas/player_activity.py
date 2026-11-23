"""
Aught2 Pickleball — Player Activity Schema
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PlayerActivityItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    activity_type: str
    title: str
    description: str
    timestamp: datetime
    entity_type: str
    entity_id: str


class UpcomingActivityItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_type: str  # "tournament" | "league" | "event" | "lesson"
    title: str
    description: str | None = None
    club_id: UUID
    club_name: str
    start_date: datetime
    end_date: datetime | None = None
    image_url: str | None = None
    location: str | None = None
    price: float | None = None
    currency: str = "USD"
    status: str
    status_label: str
    format_label: str | None = None
    is_registration_open: bool = False
    is_registered: bool = False
    available_spots: int | None = None
    max_participants: int | None = None


class UpcomingActivitiesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[UpcomingActivityItem]
    total: int
    has_more: bool
