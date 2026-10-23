"""
Aught2 Pickleball — Global Platform Settings Schemas

Defines request/response models for runtime platform settings and
sanitized read-only environment configurations.

Security:
- Secrets (JWT_SECRET_KEY, DATABASE_URL, MIGRATION_SECRET, S3 credentials)
  are strictly prohibited and excluded from all schemas.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PlatformRuntimeSettings(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    platform_name: str = Field(description="Display brand name for the platform")
    platform_support_email: str = Field(description="Global support contact email")
    allow_new_club_registrations: bool = Field(description="Whether prospective clubs can submit registration applications")
    allow_user_registrations: bool = Field(description="Whether public players can self-register accounts")
    maintenance_mode: bool = Field(description="Whether platform maintenance banner is displayed")
    max_upload_size_mb: int = Field(description="Maximum client upload size in megabytes")
    created_at: datetime
    updated_at: datetime
    updated_by_id: UUID | None = None
    updated_by_email: str | None = None


class PlatformReadOnlyConfig(BaseModel):
    """
    Sanitized, read-only system and infrastructure parameters.
    No secrets, connection passwords, or cryptographic keys are ever returned.
    """
    app_name: str
    app_version: str
    app_env: str
    log_level: str
    storage_backend: str
    upload_base_url: str
    max_upload_size_bytes_default: int
    s3_bucket: str | None = None
    s3_region: str | None = None
    jwt_algorithm: str
    access_token_expire_minutes: int
    refresh_token_expire_days: int
    platform_owner_emails: list[str]
    cors_origins: list[str]


class PlatformSettingsResponse(BaseModel):
    """Combined platform configuration response."""
    runtime_settings: PlatformRuntimeSettings
    read_only_config: PlatformReadOnlyConfig


class PlatformSettingsUpdateRequest(BaseModel):
    """
    Validated update payload for runtime settings.
    Strictly forbids unexpected keys to prevent storing unauthorized attributes.
    """
    model_config = ConfigDict(extra="forbid")

    platform_name: str | None = Field(default=None, min_length=2, max_length=64)
    platform_support_email: EmailStr | None = None
    allow_new_club_registrations: bool | None = None
    allow_user_registrations: bool | None = None
    maintenance_mode: bool | None = None
    max_upload_size_mb: int | None = Field(default=None, ge=1, le=25)
    reason: str | None = Field(default=None, max_length=500, description="Administrative justification for the change")
