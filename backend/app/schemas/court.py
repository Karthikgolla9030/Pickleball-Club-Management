"""
Aught2 Pickleball — Court Schemas (Phase 10)

Pydantic validation schemas for Court creation, update, reordering, and serialization.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.court import CourtEnvironment, CourtStatus


class CourtSurfaceType(str, enum.Enum):
    ACRYLIC = "acrylic"
    CONCRETE = "concrete"
    SPORT_COURT = "sport_court"
    CUSHIONED_ACRYLIC = "cushioned_acrylic"
    WOOD = "wood"
    CLAY = "clay"
    OTHER = "other"


# ─── Requests ─────────────────────────────────────────────────────────────────

class CourtCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Court name (e.g. 'Court 1', 'Center Court')")
    display_name: str | None = Field(None, max_length=100, description="Optional custom human-friendly display label")
    description: str | None = Field(None, description="Optional informational notes")
    court_number: int | None = Field(None, ge=1, description="Optional unique court number within the club")
    surface_type: str | None = Field(None, max_length=50, description="Court playing surface")
    indoor_outdoor: CourtEnvironment = Field(default=CourtEnvironment.INDOOR, description="Indoor, outdoor, or covered")
    status: CourtStatus = Field(default=CourtStatus.ACTIVE, description="Active or inactive status")
    is_active: bool = Field(default=True, description="Active flag")
    display_order: int | None = Field(None, ge=0, description="Manual display sort order")
    price_per_hour: Decimal | None = Field(None, ge=0, description="Court booking price per hour in INR")


class CourtUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    display_name: str | None = Field(None, max_length=100)
    description: str | None = None
    court_number: int | None = Field(None, ge=1)
    surface_type: str | None = Field(None, max_length=50)
    indoor_outdoor: CourtEnvironment | None = None
    status: CourtStatus | None = None
    is_active: bool | None = None
    display_order: int | None = Field(None, ge=0)
    price_per_hour: Decimal | None = Field(None, ge=0, description="Court booking price per hour in INR")


class CourtReorderRequest(BaseModel):
    court_ids: list[uuid.UUID] = Field(..., min_length=1, description="Complete list of court IDs in desired order")


# ─── Responses ────────────────────────────────────────────────────────────────

class CourtResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    display_name: str | None = None
    description: str | None = None
    court_number: int | None = None
    surface_type: str | None = None
    indoor_outdoor: CourtEnvironment
    status: CourtStatus
    is_active: bool
    display_order: int
    created_at: datetime
    updated_at: datetime
    price_per_hour: Decimal | None = None


class PlayerCourtResponse(BaseModel):
    """Read-only player-facing court representation (no admin metadata)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    display_name: str | None = None
    description: str | None = None
    court_number: int | None = None
    surface_type: str | None = None
    indoor_outdoor: CourtEnvironment
    display_order: int
    price_per_hour: Decimal | None = None
