"""
Aught2 Pickleball — Notification Schemas
Pydantic schemas for notifications list, detail, and unread counts.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    club_id: UUID | None = None
    club_name: str | None = None
    category: str
    title: str
    message: str
    is_read: bool
    read_at: datetime | None = None
    data: dict[str, Any] | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    action_url: str | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread_count: int


class NotificationUnreadCountResponse(BaseModel):
    unread_count: int


class NotificationCreateRequest(BaseModel):
    user_id: UUID
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    category: str = Field(default="general", max_length=50)
    club_id: UUID | None = None
    data: dict[str, Any] | None = None


class NotificationPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    booking_notifications: bool = True
    membership_notifications: bool = True
    tournament_notifications: bool = True
    event_notifications: bool = True
    payment_notifications: bool = True
    administrative_notifications: bool = True


class NotificationPreferenceUpdateRequest(BaseModel):
    booking_notifications: bool | None = None
    membership_notifications: bool | None = None
    tournament_notifications: bool | None = None
    event_notifications: bool | None = None
    payment_notifications: bool | None = None
    administrative_notifications: bool | None = None
