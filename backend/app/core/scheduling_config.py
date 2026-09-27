"""
Aught2 Pickleball — Competition Scheduling Configuration (Phase 17)

Centralized defaults and constants for competition match scheduling.
DO NOT hardcode match durations or overlap logic elsewhere.
"""
from __future__ import annotations

from datetime import datetime

# Default duration for a competition match in minutes
DEFAULT_MATCH_DURATION_MINUTES: int = 60

# Configurable match duration boundaries
MIN_MATCH_DURATION_MINUTES: int = 15
MAX_MATCH_DURATION_MINUTES: int = 240
ALLOWED_MATCH_DURATIONS_MINUTES: list[int] = [30, 45, 60, 90, 120]


def intervals_overlap(
    start_a: datetime,
    end_a: datetime,
    start_b: datetime,
    end_b: datetime,
) -> bool:
    """
    Standard half-open interval overlap check [start, end).

    Two intervals overlap when:
      start_a < end_b AND end_a > start_b

    Adjacent intervals (e.g. 10:00-11:00 and 11:00-12:00) do NOT overlap.
    """
    return start_a < end_b and end_a > start_b
