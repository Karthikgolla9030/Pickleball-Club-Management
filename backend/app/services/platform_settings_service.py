"""
Aught2 Pickleball — Platform Settings Service

Handles runtime retrieval, validation, transactional persistence,
and audit logging for platform-wide settings.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.platform_setting import PlatformSetting
from app.models.user import User
from app.schemas.platform_setting import (
    PlatformReadOnlyConfig,
    PlatformRuntimeSettings,
    PlatformSettingsResponse,
    PlatformSettingsUpdateRequest,
)
from app.services.platform_audit_service import record_platform_audit_event

logger = logging.getLogger(__name__)


class PlatformSettingsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_settings(self) -> PlatformSetting:
        """Retrieve existing settings singleton row or create default."""
        result = await self.db.execute(select(PlatformSetting).limit(1))
        setting = result.scalar_one_or_none()
        if not setting:
            setting = PlatformSetting(
                platform_name="Aught2 Pickleball",
                platform_support_email="support@pickleball.com",
                allow_new_club_registrations=True,
                allow_user_registrations=True,
                maintenance_mode=False,
                max_upload_size_mb=5,
            )
            self.db.add(setting)
            await self.db.commit()
            await self.db.refresh(setting)
        return setting

    async def get_platform_settings(self) -> PlatformSettingsResponse:
        """Return combined runtime settings and sanitized read-only environment configuration."""
        setting = await self.get_or_create_settings()
        core_cfg = get_settings()

        cors_list = (
            core_cfg.CORS_ORIGINS
            if isinstance(core_cfg.CORS_ORIGINS, list)
            else [c.strip() for c in str(core_cfg.CORS_ORIGINS).split(",") if c.strip()]
        )

        owner_emails = (
            core_cfg.PLATFORM_OWNER_EMAILS
            if isinstance(core_cfg.PLATFORM_OWNER_EMAILS, list)
            else [e.strip() for e in str(core_cfg.PLATFORM_OWNER_EMAILS).split(",") if e.strip()]
        )

        read_only_config = PlatformReadOnlyConfig(
            app_name=core_cfg.APP_NAME,
            app_version=core_cfg.APP_VERSION,
            app_env=core_cfg.APP_ENV,
            log_level=core_cfg.LOG_LEVEL,
            storage_backend=core_cfg.STORAGE_BACKEND,
            upload_base_url=core_cfg.UPLOAD_BASE_URL,
            max_upload_size_bytes_default=core_cfg.MAX_UPLOAD_SIZE_BYTES,
            s3_bucket=core_cfg.S3_BUCKET,
            s3_region=core_cfg.S3_REGION,
            jwt_algorithm=core_cfg.JWT_ALGORITHM,
            access_token_expire_minutes=core_cfg.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
            refresh_token_expire_days=core_cfg.JWT_REFRESH_TOKEN_EXPIRE_DAYS,
            platform_owner_emails=owner_emails,
            cors_origins=cors_list,
        )

        return PlatformSettingsResponse(
            runtime_settings=PlatformRuntimeSettings.model_validate(setting),
            read_only_config=read_only_config,
        )

    async def update_platform_settings(
        self,
        admin_actor: User,
        payload: PlatformSettingsUpdateRequest,
    ) -> PlatformSettingsResponse:
        """
        Atomically update platform runtime settings with locking, validation,
        and Platform Audit Log recording.
        """
        # Ensure row exists and lock for atomic update
        query = select(PlatformSetting).with_for_update().limit(1)
        result = await self.db.execute(query)
        setting = result.scalar_one_or_none()
        if not setting:
            setting = await self.get_or_create_settings()
            # Re-lock
            result = await self.db.execute(select(PlatformSetting).where(PlatformSetting.id == setting.id).with_for_update())
            setting = result.scalar_one()

        changed_keys: list[str] = []
        before_state: dict[str, any] = {}
        after_state: dict[str, any] = {}

        fields_to_check = [
            "platform_name",
            "platform_support_email",
            "allow_new_club_registrations",
            "allow_user_registrations",
            "maintenance_mode",
            "max_upload_size_mb",
        ]

        for field in fields_to_check:
            new_val = getattr(payload, field)
            if new_val is not None:
                current_val = getattr(setting, field)
                if current_val != new_val:
                    changed_keys.append(field)
                    before_state[field] = current_val
                    after_state[field] = new_val
                    setattr(setting, field, new_val)

        if not changed_keys:
            # No changes requested or all values already match
            return await self.get_platform_settings()

        setting.updated_at = datetime.now(timezone.utc)
        setting.updated_by_id = admin_actor.id
        setting.updated_by_email = admin_actor.email
        self.db.add(setting)

        # Audit log event
        audit_reason = payload.reason or f"Updated platform settings: {', '.join(changed_keys)}"
        await record_platform_audit_event(
            self.db,
            actor=admin_actor,
            action="platform_settings.updated",
            entity_type="platform_settings",
            entity_id=setting.id,
            entity_name="Global Platform Settings",
            outcome="success",
            reason=audit_reason,
            details={
                "changed_keys": changed_keys,
                "before": before_state,
                "after": after_state,
            },
        )

        await self.db.commit()
        await self.db.refresh(setting)

        logger.info(
            "Platform owner %s updated platform settings: %s",
            admin_actor.email,
            changed_keys,
        )

        return await self.get_platform_settings()

    @staticmethod
    async def is_club_registration_allowed(db: AsyncSession) -> bool:
        """Fast check whether club application submissions are currently permitted."""
        result = await db.execute(select(PlatformSetting.allow_new_club_registrations).limit(1))
        val = result.scalar_one_or_none()
        return True if val is None else bool(val)

    @staticmethod
    async def is_user_registration_allowed(db: AsyncSession) -> bool:
        """Fast check whether public player self-registrations are currently permitted."""
        result = await db.execute(select(PlatformSetting.allow_user_registrations).limit(1))
        val = result.scalar_one_or_none()
        return True if val is None else bool(val)
