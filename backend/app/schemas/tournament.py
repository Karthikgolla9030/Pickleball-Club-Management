"""
Aught2 Pickleball — Tournament Pydantic Schemas

Validates tournament creation, updates, and response payloads.
Enforces strict date ordering, participant limits, and configuration constraints.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.tournament import (
    DEFAULT_SCORING_RULES,
    DEFAULT_TIEBREAKER_RULES,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)


VALID_STANDARD_CATEGORIES = {
    "Singles",
    "Men's Doubles",
    "Women's Doubles",
    "Mixed Doubles",
}

VALID_SCRAMBLE_DIVISIONS = {
    "Open Scramble",
    "Men's Scramble",
    "Women's Scramble",
    "Mixed Scramble",
}

VALID_COMPETITION_CATEGORIES = VALID_STANDARD_CATEGORIES | VALID_SCRAMBLE_DIVISIONS

VALID_SKILL_LEVELS = {
    "2.5",
    "3.0",
    "3.5",
    "4.0",
    "4.5",
    "5.0",
}

VALID_SKILL_MODES = {
    "single",
    "range",
}


def validate_skill_level_config(v: dict) -> dict:
    mode_raw = v.get("skill_level_mode")
    skill_raw = v.get("skill_level")
    min_skill_raw = v.get("min_skill_level")
    max_skill_raw = v.get("max_skill_level")

    if mode_raw is None and skill_raw is None and min_skill_raw is None and max_skill_raw is None:
        return v

    if not mode_raw:
        if min_skill_raw is not None and max_skill_raw is not None and str(min_skill_raw) != str(max_skill_raw):
            mode = "range"
        elif skill_raw and ("-" in str(skill_raw) or "–" in str(skill_raw)):
            mode = "range"
        else:
            mode = "single"
    else:
        mode = str(mode_raw).strip().lower()

    if mode not in VALID_SKILL_MODES:
        raise ValueError(f"skill_level_mode must be one of: {sorted(VALID_SKILL_MODES)}")

    if mode == "range":
        if min_skill_raw is None or max_skill_raw is None:
            if skill_raw and ("-" in str(skill_raw) or "–" in str(skill_raw)):
                parts = str(skill_raw).replace("–", "-").split("-")
                min_skill_raw = min_skill_raw or parts[0].strip()
                max_skill_raw = max_skill_raw or parts[1].strip()
            else:
                raise ValueError("Both min_skill_level and max_skill_level are required for range mode")

        min_s = str(min_skill_raw).strip()
        max_s = str(max_skill_raw).strip()

        if min_s not in VALID_SKILL_LEVELS:
            raise ValueError(f"Minimum skill level must be one of: {sorted(VALID_SKILL_LEVELS)}")
        if max_s not in VALID_SKILL_LEVELS:
            raise ValueError(f"Maximum skill level must be one of: {sorted(VALID_SKILL_LEVELS)}")
        if float(min_s) > float(max_s):
            raise ValueError("Minimum skill level must be less than or equal to maximum skill level")

        v["skill_level_mode"] = "range"
        v["min_skill_level"] = min_s
        v["max_skill_level"] = max_s
        v["skill_level"] = f"{min_s}-{max_s}"
    else:
        exact = str(skill_raw if skill_raw is not None else (min_skill_raw or max_skill_raw or "3.5")).strip()
        if exact not in VALID_SKILL_LEVELS:
            raise ValueError(f"Skill level must be one of: {sorted(VALID_SKILL_LEVELS)}")

        v["skill_level_mode"] = "single"
        v["min_skill_level"] = exact
        v["max_skill_level"] = exact
        v["skill_level"] = exact

    return v

VALID_GENDER_ELIGIBILITIES = {
    "Any",
    "Male",
    "Female",
}

VALID_REGISTRATION_TYPES = {
    "individual",
    "team",
}


class ScoringRulesSchema(BaseModel):
    game_format: str = Field(default="single_game", description="Format of individual games")
    target_score: int = Field(default=11, ge=1, description="Winning score threshold")
    win_by: int = Field(default=2, ge=1, description="Points lead required to win")

    @field_validator("game_format")
    @classmethod
    def validate_game_format(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned != "single_game":
            raise ValueError("Currently only 'single_game' format is supported")
        return cleaned


class TournamentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    format: TournamentFormat
    visibility: TournamentVisibility = TournamentVisibility.PUBLIC
    start_date: datetime
    end_date: datetime
    registration_open_at: datetime
    registration_close_at: datetime
    location_name: str | None = Field(default=None, max_length=255)
    min_participants: int | None = Field(default=None, ge=2)
    max_participants: int | None = Field(default=None, ge=2)
    scoring_rules: ScoringRulesSchema = Field(default_factory=ScoringRulesSchema)
    tiebreaker_rules: list[str] = Field(default_factory=lambda: list(DEFAULT_TIEBREAKER_RULES))
    format_configuration: dict | None = None

    @field_validator("name", "location_name", mode="before")
    @classmethod
    def strip_strings(cls, v: str | None) -> str | None:
        if v is not None and isinstance(v, str):
            cleaned = v.strip()
            return cleaned if cleaned else None
        return v

    @field_validator("name")
    @classmethod
    def validate_name_not_empty(cls, v: str | None) -> str:
        if not v:
            raise ValueError("Tournament name cannot be empty")
        return v

    @field_validator("format_configuration")
    @classmethod
    def validate_format_configuration(cls, v: dict | None) -> dict | None:
        if not v:
            return v
        cat = v.get("category")
        if cat is not None and cat not in VALID_COMPETITION_CATEGORIES:
            raise ValueError(f"Competition category must be one of: {sorted(VALID_COMPETITION_CATEGORIES)}")
        v = validate_skill_level_config(v)
        gen = v.get("gender_eligibility")
        if gen is not None and gen not in VALID_GENDER_ELIGIBILITIES:
            raise ValueError(f"Gender eligibility must be one of: {sorted(VALID_GENDER_ELIGIBILITIES)}")
        reg_type = v.get("registration_type")
        if reg_type is not None and reg_type not in VALID_REGISTRATION_TYPES:
            raise ValueError(f"registration_type must be one of: {sorted(VALID_REGISTRATION_TYPES)}")
        min_a = v.get("min_age")
        max_a = v.get("max_age")
        if min_a is not None:
            if not isinstance(min_a, int) or min_a < 0:
                raise ValueError("Minimum age cannot be negative")
        if max_a is not None:
            if not isinstance(max_a, int) or max_a < 0:
                raise ValueError("Maximum age cannot be negative")
        if min_a is not None and max_a is not None and max_a < min_a:
            raise ValueError("Maximum age cannot be less than minimum age")
        return v

    @model_validator(mode="after")
    def validate_dates_and_limits(self) -> TournamentBase:
        if self.registration_open_at > self.registration_close_at:
            raise ValueError("registration_open_at must be before or equal to registration_close_at")
        if self.registration_close_at > self.start_date:
            raise ValueError("registration_close_at must be before or equal to start_date")
        if self.start_date > self.end_date:
            raise ValueError("start_date must be before or equal to end_date")
        if self.min_participants is not None and self.max_participants is not None:
            if self.max_participants < self.min_participants:
                raise ValueError("max_participants must be greater than or equal to min_participants")
        if self.format == TournamentFormat.SCRAMBLE:
            if self.min_participants is not None and self.min_participants < 4:
                raise ValueError("Scramble tournament requires a minimum of at least 4 individual players")
            if self.format_configuration:
                reg_type = self.format_configuration.get("registration_type")
                if reg_type is not None and reg_type != "individual":
                    raise ValueError("Scramble tournaments must use 'individual' registration type")
                cat = self.format_configuration.get("category")
                if cat is not None and cat not in VALID_SCRAMBLE_DIVISIONS:
                    raise ValueError(
                        f"Scramble tournaments must use one of the Scramble divisions: {sorted(VALID_SCRAMBLE_DIVISIONS)}"
                    )
        else:
            if self.format_configuration:
                cat = self.format_configuration.get("category")
                if cat is not None and cat in VALID_SCRAMBLE_DIVISIONS:
                    raise ValueError(
                        f"Scramble divisions cannot be used with {self.format.value} format. Use a standard category."
                    )
        return self


class TournamentCreate(TournamentBase):
    pass


class TournamentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    format: TournamentFormat | None = None
    visibility: TournamentVisibility | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    registration_open_at: datetime | None = None
    registration_close_at: datetime | None = None
    location_name: str | None = None
    min_participants: int | None = Field(default=None, ge=2)
    max_participants: int | None = Field(default=None, ge=2)
    scoring_rules: ScoringRulesSchema | None = None
    tiebreaker_rules: list[str] | None = None
    format_configuration: dict | None = None

    @field_validator("name", "location_name", mode="before")
    @classmethod
    def strip_strings(cls, v: str | None) -> str | None:
        if v is not None and isinstance(v, str):
            cleaned = v.strip()
            return cleaned if cleaned else None
        return v

    @field_validator("name")
    @classmethod
    def validate_name_not_empty(cls, v: str | None) -> str | None:
        if v is not None and not v:
            raise ValueError("Tournament name cannot be empty")
        return v

    @field_validator("format_configuration")
    @classmethod
    def validate_format_configuration(cls, v: dict | None) -> dict | None:
        if not v:
            return v
        cat = v.get("category")
        if cat is not None and cat not in VALID_COMPETITION_CATEGORIES:
            raise ValueError(f"Competition category must be one of: {sorted(VALID_COMPETITION_CATEGORIES)}")
        v = validate_skill_level_config(v)
        gen = v.get("gender_eligibility")
        if gen is not None and gen not in VALID_GENDER_ELIGIBILITIES:
            raise ValueError(f"Gender eligibility must be one of: {sorted(VALID_GENDER_ELIGIBILITIES)}")
        reg_type = v.get("registration_type")
        if reg_type is not None and reg_type not in VALID_REGISTRATION_TYPES:
            raise ValueError(f"registration_type must be one of: {sorted(VALID_REGISTRATION_TYPES)}")
        min_a = v.get("min_age")
        max_a = v.get("max_age")
        if min_a is not None:
            if not isinstance(min_a, int) or min_a < 0:
                raise ValueError("Minimum age cannot be negative")
        if max_a is not None:
            if not isinstance(max_a, int) or max_a < 0:
                raise ValueError("Maximum age cannot be negative")
        if min_a is not None and max_a is not None and max_a < min_a:
            raise ValueError("Maximum age cannot be less than minimum age")
        return v

    @model_validator(mode="after")
    def validate_limits(self) -> TournamentUpdate:
        if self.min_participants is not None and self.max_participants is not None:
            if self.max_participants < self.min_participants:
                raise ValueError("max_participants must be greater than or equal to min_participants")
        if self.format == TournamentFormat.SCRAMBLE:
            if self.min_participants is not None and self.min_participants < 4:
                raise ValueError("Scramble tournament requires a minimum of at least 4 individual players")
            if self.format_configuration:
                reg_type = self.format_configuration.get("registration_type")
                if reg_type is not None and reg_type != "individual":
                    raise ValueError("Scramble tournaments must use 'individual' registration type")
                cat = self.format_configuration.get("category")
                if cat is not None and cat not in VALID_SCRAMBLE_DIVISIONS:
                    raise ValueError(
                        f"Scramble tournaments must use one of the Scramble divisions: {sorted(VALID_SCRAMBLE_DIVISIONS)}"
                    )
        elif self.format is not None:
            if self.format_configuration:
                cat = self.format_configuration.get("category")
                if cat is not None and cat in VALID_SCRAMBLE_DIVISIONS:
                    raise ValueError(
                        f"Scramble divisions cannot be used with {self.format.value} format. Use a standard category."
                    )
        return self


class TournamentResponse(BaseModel):
    id: UUID
    club_id: UUID
    created_by_user_id: UUID | None = None
    name: str
    description: str | None = None
    status: TournamentStatus
    status_label: str
    format: TournamentFormat
    format_label: str
    visibility: TournamentVisibility
    visibility_label: str
    start_date: datetime
    end_date: datetime
    registration_open_at: datetime
    registration_close_at: datetime
    location_name: str | None = None
    min_participants: int | None = None
    max_participants: int | None = None
    scoring_rules: dict
    tiebreaker_rules: list[str]
    format_configuration: dict | None = None
    participant_count: int = 0
    is_registered: bool = False
    my_registration_id: UUID | None = None
    my_registration_status: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TournamentDiscoveryResponse(BaseModel):
    id: UUID
    club_id: UUID
    club_name: str
    club_slug: str
    name: str
    description: str | None = None
    format: TournamentFormat
    format_label: str
    status: TournamentStatus
    status_label: str
    start_date: datetime
    end_date: datetime
    registration_open_at: datetime
    registration_close_at: datetime
    location_name: str | None = None
    participant_count: int
    max_participants: int | None = None
    format_configuration: dict | None = None
    scoring_rules: dict | None = None
    is_registration_open: bool
    is_registered: bool = False
    my_registration_id: UUID | None = None
    my_registration_status: str | None = None

    model_config = {"from_attributes": True}
