"""
Aught2 Pickleball — Tournament Registration Schemas

Validates tournament registration updates, player self-registration,
and responses for participant administration.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.tournament_registration import RegistrationStatus


class TournamentRegistrationResponse(BaseModel):
    id: UUID
    tournament_id: UUID
    player_membership_id: UUID
    user_id: UUID
    user_email: str
    user_full_name: str | None = None
    display_name: str | None = None
    membership_number: str | None = None
    status: RegistrationStatus
    status_label: str
    seed: int | None = None
    skill_rating: float | None = None
    notes: str | None = None
    registered_at: datetime
    cancelled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UpdateRegistrationRequest(BaseModel):
    status: RegistrationStatus | None = None
    seed: int | None = Field(default=None, ge=1)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("notes", mode="before")
    @classmethod
    def strip_notes(cls, v: str | None) -> str | None:
        if v is not None and isinstance(v, str):
            cleaned = v.strip()
            return cleaned if cleaned else None
        return v


class PlayerSelfRegistrationRequest(BaseModel):
    team_name: str | None = Field(default=None, max_length=255)
    partner_membership_id: UUID | None = None
    skill_level: str | None = Field(default=None, max_length=20)
    partner_skill_level: str | None = Field(default=None, max_length=20)
    gender: str | None = Field(default=None, max_length=20)
    age: int | None = Field(default=None, ge=1, le=120)
    payment_method: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("team_name", "skill_level", "partner_skill_level", "gender", "notes", mode="before")
    @classmethod
    def strip_text(cls, v: str | None) -> str | None:
        if v is not None and isinstance(v, str):
            cleaned = v.strip()
            return cleaned if cleaned else None
        return v


class EligiblePartnerResponse(BaseModel):
    membership_id: UUID
    user_id: UUID
    full_name: str
    email: str
    membership_number: str | None = None
    gender: str | None = None
    profile_image_url: str | None = None
    skill_rating: float | None = None


class PlayerSelfRegistrationResponse(BaseModel):
    id: UUID
    tournament_id: UUID
    status: RegistrationStatus
    status_label: str
    registered_at: datetime
    message: str
    reference_number: str | None = None
    registration_type: str | None = None
    team_id: UUID | None = None
    team_name: str | None = None
    partner_membership_id: UUID | None = None
    partner_name: str | None = None
    partner_email: str | None = None
    fee_amount: float | None = None
    payment_status: str | None = None
    payment_method: str | None = None
    notes: str | None = None
    tournament_name: str | None = None
    tournament_format: str | None = None
    tournament_format_label: str | None = None
    division: str | None = None
    location_name: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    player_name: str | None = None
    player_email: str | None = None
    skill_level: str | None = None
    cancelled_at: datetime | None = None

    model_config = {"from_attributes": True}


class PlayerTournamentRegistrationStatusResponse(BaseModel):
    is_registered: bool
    status: RegistrationStatus | None = None
    status_label: str | None = None
    registration: PlayerSelfRegistrationResponse | None = None


