"""
Aught2 Pickleball — Backend Configuration
Reads all settings from environment variables via pydantic-settings.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Union

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", str(_BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Application ────────────────────────────────────────────
    APP_NAME: str = "Pickleball API"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    DEBUG: bool = False

    # ─── Database ───────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:9030@localhost:5432/aught2_pickleball"

    # ─── JWT / Security ─────────────────────────────────────────
    JWT_SECRET_KEY: str = "CHANGE-THIS-IN-PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: Any) -> str:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("postgres://"):
                v = "postgresql+asyncpg://" + v[len("postgres://"):]
            elif v.startswith("postgresql://") and not v.startswith("postgresql+"):
                v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    # ─── CORS ───────────────────────────────────────────────────
    CORS_ORIGINS: Union[list[str], str] = [
        "http://localhost:8081",
        "http://localhost:19006",
        "https://pickleball-club-management.vercel.app",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return [
                    "http://localhost:8081",
                    "http://localhost:19006",
                    "https://pickleball-club-management.vercel.app",
                ]
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.replace(";", ",").split(",") if origin.strip()]
        elif isinstance(v, (list, tuple, set)):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return [
            "http://localhost:8081",
            "http://localhost:19006",
            "https://pickleball-club-management.vercel.app",
        ]

    MIGRATION_SECRET: str | None = None

    # ─── Platform Owners (distinct from club staff roles) ─────────
    PLATFORM_OWNER_EMAILS: Union[list[str], str] = [
        "platform.owner@pickleball.com",
        "platform@pickleball.com",
        "admin@pickleball.com",
        "platform.owner@aught2.com",
        "platform@aught2.com",
        "admin@aught2.com",
    ]

    @field_validator("PLATFORM_OWNER_EMAILS", mode="before")
    @classmethod
    def parse_platform_owner_emails(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return ["platform.owner@pickleball.com", "platform@pickleball.com", "admin@pickleball.com", "platform.owner@aught2.com", "platform@aught2.com"]
            if v.startswith("[") and v.endswith("]"):
                try:
                    return [e.strip().lower() for e in json.loads(v)]
                except Exception:
                    pass
            return [e.strip().lower() for e in v.replace(";", ",").split(",") if e.strip()]
        elif isinstance(v, (list, tuple, set)):
            return [str(e).strip().lower() for e in v if str(e).strip()]
        return ["platform.owner@pickleball.com", "platform@pickleball.com", "admin@pickleball.com", "platform.owner@aught2.com", "platform@aught2.com"]

    @model_validator(mode="after")
    def validate_production_settings(self) -> Settings:
        """
        Fail closed at startup if production environment lacks mandatory secure configuration.
        Ensures production never runs with default placeholder credentials or debug configurations.
        """
        if self.is_production:
            insecure_placeholders = {
                "change-this-in-production",
                "your-super-secret-jwt-key-change-this-in-production",
                "your-super-secret-key-at-least-32-characters",
                "secret",
                "password",
            }
            # 1. JWT Signing Secret
            jwt_key = (self.JWT_SECRET_KEY or "").strip()
            if not jwt_key or jwt_key.lower() in insecure_placeholders:
                raise ValueError(
                    "Production configuration error: JWT_SECRET_KEY must be a cryptographically secure string and cannot be a default placeholder."
                )
            if len(jwt_key) < 32:
                raise ValueError(
                    "Production configuration error: JWT_SECRET_KEY must be at least 32 characters long."
                )

            # 2. Database Connection URL
            db_url = (self.DATABASE_URL or "").lower()
            if "localhost" in db_url or "127.0.0.1" in db_url:
                raise ValueError(
                    "Production configuration error: DATABASE_URL must not point to localhost in production."
                )
            if "sqlite" in db_url:
                raise ValueError(
                    "Production configuration error: DATABASE_URL must be a PostgreSQL connection in production."
                )

            # 3. Dedicated Migration Secret Separation
            if self.MIGRATION_SECRET and self.MIGRATION_SECRET.strip() == jwt_key:
                raise ValueError(
                    "Production configuration error: MIGRATION_SECRET must not be identical to JWT_SECRET_KEY."
                )

            # 4. Debug Mode Guard
            if self.DEBUG:
                raise ValueError(
                    "Production configuration error: DEBUG mode must not be enabled in production."
                )

            # 5. CORS Origins
            if isinstance(self.CORS_ORIGINS, list):
                if "*" in self.CORS_ORIGINS:
                    raise ValueError(
                        "Production configuration error: CORS_ORIGINS must not contain wildcard '*' in production."
                    )
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton — call this everywhere instead of Settings()."""
    return Settings()
