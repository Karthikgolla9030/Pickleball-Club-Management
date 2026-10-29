"""
Aught2 Pickleball — Operating Hours Core Utilities (Phase 7)

Provides day-of-week operating hours models, resolution logic,
validation, and inheritance rules between Clubs and Courts.
"""
from __future__ import annotations

import re
from datetime import date, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self

from app.core.booking_config import (
    DEFAULT_CLUB_CLOSING_TIME,
    DEFAULT_CLUB_OPENING_TIME,
)

WEEKDAY_NAMES: list[str] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def parse_time_value(val: Any) -> time | None:
    """Helper to convert string/time/none into a standard datetime.time (supports 12h AM/PM and 24h formats)."""
    if val is None:
        return None
    if isinstance(val, time):
        return val
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        # Handle 12h AM/PM or 24h HH:mm / HH:mm:ss via regex
        m = re.match(r"^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(AM|PM)?$", val, re.IGNORECASE)
        if m:
            raw_h = int(m.group(1))
            raw_m = int(m.group(2) or 0)
            raw_s = int(m.group(3) or 0)
            ampm = m.group(4)
            if ampm:
                ampm_upper = ampm.upper()
                if ampm_upper == "PM":
                    h = 12 if raw_h == 12 else raw_h + 12
                else:
                    h = 0 if raw_h == 12 else raw_h
            else:
                h = raw_h
            if 0 <= h <= 23 and 0 <= raw_m <= 59 and 0 <= raw_s <= 59:
                return time(h, raw_m, raw_s)
        try:
            return time.fromisoformat(val)
        except Exception:
            return None
    return None


class DayOperatingHours(BaseModel):
    """Configuration for a single day of the week."""
    is_closed: bool = Field(default=False, description="Whether the facility is closed this day")
    open_time: time | None = Field(default=None, description="Opening time (e.g. 06:00)")
    close_time: time | None = Field(default=None, description="Closing time (e.g. 22:00)")

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def parse_time_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            data_copy = dict(data)
            if "open_time" in data_copy:
                data_copy["open_time"] = parse_time_value(data_copy["open_time"])
            if "close_time" in data_copy:
                data_copy["close_time"] = parse_time_value(data_copy["close_time"])
            return data_copy
        return data

    @model_validator(mode="after")
    def validate_hours(self) -> Self:
        if not self.is_closed:
            if self.open_time is None or self.close_time is None:
                raise ValueError("Both open_time and close_time must be provided when day is not closed")

            # Check overnight or inverted times:
            # Note: close_time == time(0, 0) represents closing at midnight (allowed if open_time > 00:00)
            if self.close_time != time(0, 0):
                if self.open_time >= self.close_time:
                    raise ValueError(
                        f"Opening time ({self.open_time.strftime('%H:%M')}) must be strictly earlier than closing time ({self.close_time.strftime('%H:%M')}). "
                        "Overnight operating hours crossing calendar days are not supported."
                    )
        else:
            # When closed, clear out open/close times to prevent ambiguous states
            self.open_time = None
            self.close_time = None
        return self


class WeeklyOperatingHours(BaseModel):
    """7-day weekly schedule for a Club or Court."""
    monday: DayOperatingHours | None = None
    tuesday: DayOperatingHours | None = None
    wednesday: DayOperatingHours | None = None
    thursday: DayOperatingHours | None = None
    friday: DayOperatingHours | None = None
    saturday: DayOperatingHours | None = None
    sunday: DayOperatingHours | None = None

    model_config = ConfigDict(from_attributes=True)

    def to_dict(self) -> dict[str, dict[str, Any]]:
        """Serialize schedule for JSON column storage."""
        result: dict[str, dict[str, Any]] = {}
        for day in WEEKDAY_NAMES:
            day_obj = getattr(self, day, None)
            if day_obj is not None:
                result[day] = {
                    "is_closed": day_obj.is_closed,
                    "open_time": day_obj.open_time.strftime("%H:%M:%S") if day_obj.open_time else None,
                    "close_time": day_obj.close_time.strftime("%H:%M:%S") if day_obj.close_time else None,
                }
        return result


def resolve_effective_operating_hours(
    target_date: date,
    club: Any,
    court: Any | None = None,
) -> tuple[bool, time, time]:
    """
    Resolves the effective operating hours for a specific date.

    Priority order:
      1. Court-specific operating hours for that weekday (if configured on court)
      2. Club-level operating hours for that weekday (if configured on club)
      3. Fallback to club.opening_time and club.closing_time (defaulting to 06:00 - 22:00, not closed)

    Returns:
      (is_closed: bool, open_time: time, close_time: time)
    """
    weekday_idx = target_date.weekday()  # 0=Monday, 6=Sunday
    day_name = WEEKDAY_NAMES[weekday_idx]

    def _extract_from_hours_dict(hours_dict: Any) -> tuple[bool, time, time] | None:
        if isinstance(hours_dict, str):
            try:
                import json
                hours_dict = json.loads(hours_dict)
            except Exception:
                return None
        if not isinstance(hours_dict, dict):
            return None
        # 1. Match day name case-insensitively or via 3-letter prefix
        cfg = None
        if day_name in hours_dict:
            cfg = hours_dict[day_name]
        else:
            for k, v in hours_dict.items():
                k_clean = str(k).strip().lower()
                if k_clean == day_name or k_clean == day_name[:3]:
                    cfg = v
                    break

        if not cfg and ("open_time" in hours_dict or "close_time" in hours_dict or "opening_time" in hours_dict):
            cfg = hours_dict

        if isinstance(cfg, str):
            try:
                import json
                cfg = json.loads(cfg)
            except Exception:
                pass

        if isinstance(cfg, dict):
            is_closed = bool(cfg.get("is_closed", False))
            if is_closed:
                return (True, time(0, 0), time(0, 0))
            o_raw = cfg.get("open_time") or cfg.get("opening_time") or cfg.get("open")
            c_raw = cfg.get("close_time") or cfg.get("closing_time") or cfg.get("close")
            o_time = parse_time_value(o_raw)
            c_time = parse_time_value(c_raw)
            if o_time and c_time:
                return (False, o_time, c_time)
        return None

    # 1. Check Court override
    if court is not None and getattr(court, "operating_hours", None):
        res = _extract_from_hours_dict(court.operating_hours)
        if res is not None:
            return res

    # 2. Check Club schedule
    if club is not None and getattr(club, "operating_hours", None):
        res = _extract_from_hours_dict(club.operating_hours)
        if res is not None:
            return res

    # 3. Fallback to club scalar opening_time / closing_time
    fallback_open = getattr(club, "opening_time", None) or DEFAULT_CLUB_OPENING_TIME
    fallback_close = getattr(club, "closing_time", None) or DEFAULT_CLUB_CLOSING_TIME
    return (False, fallback_open, fallback_close)


def build_weekly_schedule_dict(
    club: Any,
    court: Any | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Constructs a complete 7-day schedule map with resolved effective hours.
    """
    schedule: dict[str, dict[str, Any]] = {}
    fallback_open = getattr(club, "opening_time", None) or DEFAULT_CLUB_OPENING_TIME
    fallback_close = getattr(club, "closing_time", None) or DEFAULT_CLUB_CLOSING_TIME

    # Reference Monday date to iterate days 0..6
    ref_monday = date(2026, 1, 5)

    for i, day_name in enumerate(WEEKDAY_NAMES):
        day_date = date.fromordinal(ref_monday.toordinal() + i)
        is_closed, o_time, c_time = resolve_effective_operating_hours(day_date, club, court)
        schedule[day_name] = {
            "is_closed": is_closed,
            "open_time": o_time.strftime("%H:%M:%S") if not is_closed and o_time else None,
            "close_time": c_time.strftime("%H:%M:%S") if not is_closed and c_time else None,
        }

    return schedule
