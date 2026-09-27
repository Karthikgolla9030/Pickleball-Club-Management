"""
Aught2 Pickleball — Real-Time Event Dispatcher & Protocol
Defines event types, payloads, and post-commit dispatch mechanisms.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID

from app.core.websocket_manager import ws_manager

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    # Player / Profile
    PLAYER_PROFILE_UPDATED = "player.profile.updated"
    PLAYER_MEMBERSHIP_UPDATED = "player.membership.updated"

    # Court Bookings & Availability
    BOOKING_CREATED = "booking.created"
    BOOKING_UPDATED = "booking.updated"
    BOOKING_CANCELLED = "booking.cancelled"
    COURT_AVAILABILITY_CHANGED = "court.availability.changed"

    # Tournaments
    TOURNAMENT_PUBLISHED = "tournament.published"
    TOURNAMENT_UPDATED = "tournament.updated"
    TOURNAMENT_CANCELLED = "tournament.cancelled"
    TOURNAMENT_REGISTRATION_CREATED = "tournament.registration.created"
    TOURNAMENT_REGISTRATION_CANCELLED = "tournament.registration.cancelled"

    # Leagues
    LEAGUE_PUBLISHED = "league.published"
    LEAGUE_UPDATED = "league.updated"
    LEAGUE_REGISTRATION_CREATED = "league.registration.created"
    LEAGUE_STANDINGS_UPDATED = "league.standings.updated"

    # Events
    EVENT_PUBLISHED = "event.published"
    EVENT_UPDATED = "event.updated"
    EVENT_REGISTRATION_CREATED = "event.registration.created"
    EVENT_REGISTRATION_CANCELLED = "event.registration.cancelled"

    # Lessons
    LESSON_PUBLISHED = "lesson.published"
    LESSON_UPDATED = "lesson.updated"
    LESSON_REGISTRATION_CREATED = "lesson.registration.created"
    LESSON_REGISTRATION_CANCELLED = "lesson.registration.cancelled"

    # Notifications
    NOTIFICATION_CREATED = "notification.created"


def serialize_for_event(obj: Any) -> Any:
    """Helper to ensure all UUIDs and datetimes are JSON-serializable."""
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: serialize_for_event(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [serialize_for_event(x) for x in obj]
    return obj


async def dispatch_event(
    event_type: EventType | str,
    data: dict[str, Any] | None = None,
    club_id: UUID | str | None = None,
    user_id: UUID | str | None = None,
    exclude_user_id: UUID | str | None = None,
) -> None:
    """
    Dispatch an event to connected clients.
    - If user_id is provided, delivers directly to that user's private channel.
    - If club_id is provided, broadcasts to all clients subscribed to that club.
    - If neither is provided, broadcasts globally.
    """
    event_name = event_type.value if isinstance(event_type, EventType) else str(event_type)
    cleaned_data = serialize_for_event(data or {})

    payload = {
        "type": event_name,
        "data": cleaned_data,
        "club_id": str(club_id) if club_id else None,
        "user_id": str(user_id) if user_id else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        if user_id and not club_id:
            # Deliver solely to target user
            await ws_manager.broadcast_to_user(user_id, payload)
        elif club_id:
            # Broadcast to club members / staff
            await ws_manager.broadcast_to_club(club_id, payload, exclude_user_id=exclude_user_id)
            # If target user is also specified and might not be subscribed to club channel, also deliver to user
            if user_id:
                await ws_manager.broadcast_to_user(user_id, payload)
        else:
            # Broadcast to all
            await ws_manager.broadcast_all(payload)

        logger.debug(
            "Dispatched event: type=%s club=%s user=%s",
            event_name,
            club_id,
            user_id,
        )
    except Exception as exc:
        logger.error("Failed to dispatch event %s: %s", event_name, exc, exc_info=True)


def dispatch_event_background(
    event_type: EventType | str,
    data: dict[str, Any] | None = None,
    club_id: UUID | str | None = None,
    user_id: UUID | str | None = None,
    exclude_user_id: UUID | str | None = None,
) -> None:
    """Non-blocking background helper for synchronous or fire-and-forget contexts."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            dispatch_event(
                event_type=event_type,
                data=data,
                club_id=club_id,
                user_id=user_id,
                exclude_user_id=exclude_user_id,
            )
        )
    except RuntimeError:
        # If no loop is running, run synchronously with asyncio.run
        asyncio.run(
            dispatch_event(
                event_type=event_type,
                data=data,
                club_id=club_id,
                user_id=user_id,
                exclude_user_id=exclude_user_id,
            )
        )
