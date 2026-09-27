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
    category: str
    title: str
    message: str
    is_read: bool
    data: dict[str, Any] | None = None
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
