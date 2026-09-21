"""
Aught2 Pickleball — Backend Configuration
Reads all settings from environment variables via pydantic-settings.
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Application ────────────────────────────────────────────
    APP_NAME: str = "Aught2 Pickleball API"
    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    DEBUG: bool = False

    # ─── Database ───────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+psycopg://postgres:password@localhost:5432/aught2_pickleball"

    # ─── JWT / Security ─────────────────────────────────────────
    JWT_SECRET_KEY: str = "CHANGE-THIS-IN-PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ─── CORS ───────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:8081",
        "http://localhost:19006",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",")]
        return v

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
