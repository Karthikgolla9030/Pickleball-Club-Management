"""
Player Profile schemas.
Used for player identity and profile creation/updates.
"""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, field_validator


class PlayerProfileValidatorsMixin:
    @field_validator("first_name", "last_name", "phone", "bio", mode="before")
    @classmethod
    def clean_optional_strings(cls, v: str | None) -> str | None:
        if v is not None and isinstance(v, str):
            cleaned = v.strip()
            return cleaned if cleaned else None
        return v

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: date | None) -> date | None:
        if v is not None and v > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return v

    @field_validator("profile_image_url")
    @classmethod
    def validate_profile_image_url(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                return ""
            if not (
                cleaned.startswith("http://")
                or cleaned.startswith("https://")
                or cleaned.startswith("/uploads/")
                or cleaned.startswith("data:image/")
            ):
                raise ValueError("profile_image_url must start with http://, https://, /uploads/, or data:image/")
            return cleaned
        return v


class PlayerProfileBase(BaseModel, PlayerProfileValidatorsMixin):
    display_name: str
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    profile_image_url: str | None = None
    bio: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("display_name cannot be empty")
        return cleaned


class PlayerProfileCreate(PlayerProfileBase):
    pass


class PlayerProfileUpdate(BaseModel, PlayerProfileValidatorsMixin):
    display_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    profile_image_url: str | None = None
    bio: str | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name_optional(cls, v: str | None) -> str | None:
        if v is not None:
            cleaned = v.strip()
            if not cleaned:
                raise ValueError("display_name cannot be empty")
            return cleaned
        return v


class PlayerProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    display_name: str
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    date_of_birth: date | None = None
    profile_image_url: str | None = None
    bio: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
