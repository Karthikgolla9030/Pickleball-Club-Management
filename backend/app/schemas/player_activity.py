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
