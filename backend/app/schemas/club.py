"""Club schemas."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ClubResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserClubResponse(BaseModel):
    """
    Club item returned by GET /clubs for the authenticated user.
    Includes club info and the user's role/membership details in this club.
    """
    id: UUID
    name: str
    slug: str
    description: str | None = None
    is_active: bool
    membership_id: UUID
    role: str
    role_label: str
    membership_is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

