"""
Aught2 Pickleball — Court Booking & Reservation Configuration (Phase 11)

Centralizes all default rules, time boundaries, horizons, limits, and cancellation policies.
"""
from __future__ import annotations

from datetime import time

# Default duration for standard court reservation
DEFAULT_BOOKING_DURATION_MINUTES: int = 60

# Supported booking durations (future club configurations can choose from these)
ALLOWED_BOOKING_DURATIONS: set[int] = {30, 60, 90, 120}

# Slot boundary alignment interval in minutes (e.g. 60 min intervals: :00 boundaries)
DEFAULT_SLOT_INTERVAL_MINUTES: int = 60

# Cancellation window cutoff in hours (players cannot cancel within this window before start)
DEFAULT_CANCELLATION_WINDOW_HOURS: int = 2

# Maximum concurrent upcoming active (confirmed) bookings allowed per player
DEFAULT_MAX_ACTIVE_BOOKINGS_PER_PLAYER: int = 3

# How many days in advance players can make reservations
DEFAULT_BOOKING_HORIZON_DAYS: int = 14

# Default club operating hours when not overridden
DEFAULT_CLUB_OPENING_TIME: time = time(6, 0)
DEFAULT_CLUB_CLOSING_TIME: time = time(22, 0)
DEFAULT_CLUB_TIMEZONE: str = "UTC"

# Aliases
ALLOWED_DURATIONS_MINUTES = ALLOWED_BOOKING_DURATIONS
CANCELLATION_WINDOW_HOURS = DEFAULT_CANCELLATION_WINDOW_HOURS
MAX_ACTIVE_BOOKINGS_PER_PLAYER = DEFAULT_MAX_ACTIVE_BOOKINGS_PER_PLAYER
MAX_BOOKING_HORIZON_DAYS = DEFAULT_BOOKING_HORIZON_DAYS
MIN_SLOT_INTERVAL_MINUTES = 30

