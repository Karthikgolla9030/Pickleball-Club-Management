"""User schemas — request and response models."""
from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, computed_field, field_validator

_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserBase(BaseModel):
    email: str
    full_name: str | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_REGEX.match(v):
            raise ValueError("Invalid email address format")
        return v


class UserResponse(UserBase):
    """Public user response — no password hash ever exposed."""
    id: UUID
    is_active: bool
    is_verified: bool
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def is_platform_admin(self) -> bool:
        """Dynamically evaluate whether user is an authorized platform administrator."""
        try:
            from app.core.config import get_settings
            owners = {e.lower().strip() for e in get_settings().PLATFORM_OWNER_EMAILS}
            return bool(self.email and self.email.lower().strip() in owners)
        except Exception:
            return False

    model_config = {"from_attributes": True}
