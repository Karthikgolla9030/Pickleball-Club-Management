"""Common schema utilities and base classes."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TimestampMixin(BaseModel):
    created_at: datetime
    updated_at: datetime


class UUIDMixin(BaseModel):
    id: UUID
