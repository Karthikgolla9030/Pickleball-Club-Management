"""
Aught2 Pickleball — Event Repository (Phase 14)

Database access layer for events and event registrations.
All queries enforce tenant isolation (club_id scoping where appropriate).
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.event import (
    Event,
    EventRegistration,
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)


class EventRepository:
    """Repository for managing Event and EventRegistration entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── Event Queries ────────────────────────────────────────────────────────

    async def create(self, event: Event) -> Event:
        """Persist a new Event."""
        self.db.add(event)
        await self.db.flush()
        await self.db.refresh(event)
        return event

    async def get_by_id(
        self,
        event_id: UUID,
        club_id: UUID | None = None,
    ) -> Event | None:
        """
        Fetch an event by ID.
        If club_id is provided, enforces club ownership (tenant isolation).
        """
        stmt = (
            select(Event)
            .where(Event.id == event_id)
            .options(
                selectinload(Event.created_by),
                selectinload(Event.registrations).selectinload(EventRegistration.user),
            )
        )
        if club_id is not None:
            stmt = stmt.where(Event.club_id == club_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_club(
        self,
        club_id: UUID,
        status: EventStatus | None = None,
        event_type: EventType | None = None,
        visibility: EventVisibility | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[Event]:
        """
        List all events belonging to a club with optional filtering.
        Ordered by start_at ASC.
        """
        stmt = (
            select(Event)
            .where(Event.club_id == club_id)
            .options(
                selectinload(Event.created_by),
                selectinload(Event.registrations),
            )
        )

        if status is not None:
            stmt = stmt.where(Event.status == status)
        if event_type is not None:
            stmt = stmt.where(Event.event_type == event_type)
        if visibility is not None:
            stmt = stmt.where(Event.visibility == visibility)
        if date_from is not None:
            stmt = stmt.where(Event.start_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(Event.start_at <= date_to)

        stmt = stmt.order_by(Event.start_at.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_published_for_discovery(
        self,
        club_id: UUID,
        is_club_member: bool = False,
    ) -> list[Event]:
        """
        List published events for player discovery.
        If user is active club member, returns PUBLIC and MEMBERS_ONLY events.
        Otherwise returns only PUBLIC events.
        Private events are omitted.
        """
        stmt = (
            select(Event)
            .where(
                Event.club_id == club_id,
                Event.status == EventStatus.PUBLISHED,
            )
            .options(
                selectinload(Event.created_by),
                selectinload(Event.registrations),
            )
        )

        if is_club_member:
            stmt = stmt.where(
                Event.visibility.in_([EventVisibility.PUBLIC, EventVisibility.MEMBERS_ONLY])
            )
        else:
            stmt = stmt.where(Event.visibility == EventVisibility.PUBLIC)

        stmt = stmt.order_by(Event.start_at.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, event: Event) -> Event:
        """Update an existing event."""
        await self.db.flush()
        await self.db.refresh(event)
        return event

    # ─── Event Registration Queries ───────────────────────────────────────────

    async def create_registration(
        self,
        registration: EventRegistration,
    ) -> EventRegistration:
        """Persist a new event registration."""
        self.db.add(registration)
        await self.db.flush()
        reg = await self.get_registration(registration.id)
        return reg if reg is not None else registration

    async def get_registration(
        self,
        registration_id: UUID,
        event_id: UUID | None = None,
    ) -> EventRegistration | None:
        """Fetch an event registration by ID with optional event_id scope."""
        stmt = (
            select(EventRegistration)
            .where(EventRegistration.id == registration_id)
            .options(
                selectinload(EventRegistration.user),
                selectinload(EventRegistration.event),
            )
        )
        if event_id is not None:
            stmt = stmt.where(EventRegistration.event_id == event_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_registration_for_user(
        self,
        event_id: UUID,
        user_id: UUID,
    ) -> EventRegistration | None:
        """
        Fetch any non-cancelled registration for a given user on an event.
        Returns None if user is not registered or was cancelled.
        """
        stmt = (
            select(EventRegistration)
            .where(
                EventRegistration.event_id == event_id,
                EventRegistration.user_id == user_id,
                EventRegistration.status != EventRegistrationStatus.CANCELLED,
            )
            .options(
                selectinload(EventRegistration.user),
                selectinload(EventRegistration.event),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_registrations_for_event(
        self,
        event_id: UUID,
        status: EventRegistrationStatus | None = None,
    ) -> list[EventRegistration]:
        """
        List registrations for an event, optionally filtered by status.
        Ordered chronologically by registered_at ASC, id ASC.
        """
        stmt = (
            select(EventRegistration)
            .where(EventRegistration.event_id == event_id)
            .options(
                selectinload(EventRegistration.user),
                selectinload(EventRegistration.event),
            )
        )
        if status is not None:
            stmt = stmt.where(EventRegistration.status == status)

        stmt = stmt.order_by(
            EventRegistration.registered_at.asc(),
            EventRegistration.id.asc(),
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_registrations_for_player(
        self,
        user_id: UUID,
        status: EventRegistrationStatus | None = None,
    ) -> list[EventRegistration]:
        """
        List registrations for a specific player across events.
        Joined with Event to access title, dates, etc.
        """
        stmt = (
            select(EventRegistration)
            .where(EventRegistration.user_id == user_id)
            .join(Event, EventRegistration.event_id == Event.id)
            .options(
                selectinload(EventRegistration.event),
                selectinload(EventRegistration.user),
            )
        )
        if status is not None:
            stmt = stmt.where(EventRegistration.status == status)

        stmt = stmt.order_by(Event.start_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_registration_counts(self, event_id: UUID) -> dict[str, int]:
        """
        Return aggregate counts for registered, waitlisted, attended, and no_show.
        Note: registered_count includes REGISTERED, ATTENDED, and NO_SHOW,
        as attended/no_show players occupied a spot.
        """
        stmt = (
            select(
                EventRegistration.status,
                func.count(EventRegistration.id),
            )
            .where(EventRegistration.event_id == event_id)
            .group_by(EventRegistration.status)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        counts = {
            EventRegistrationStatus.REGISTERED: 0,
            EventRegistrationStatus.WAITLISTED: 0,
            EventRegistrationStatus.CANCELLED: 0,
            EventRegistrationStatus.ATTENDED: 0,
            EventRegistrationStatus.NO_SHOW: 0,
        }
        for st, cnt in rows:
            counts[st] = cnt

        # Active registered participants occupying capacity:
        # REGISTERED + ATTENDED + NO_SHOW
        active_capacity_used = (
            counts[EventRegistrationStatus.REGISTERED]
            + counts[EventRegistrationStatus.ATTENDED]
            + counts[EventRegistrationStatus.NO_SHOW]
        )

        return {
            "registered_count": active_capacity_used,
            "waitlisted_count": counts[EventRegistrationStatus.WAITLISTED],
            "cancelled_count": counts[EventRegistrationStatus.CANCELLED],
            "attended_count": counts[EventRegistrationStatus.ATTENDED],
            "no_show_count": counts[EventRegistrationStatus.NO_SHOW],
        }

    async def get_next_waitlisted_registration(
        self,
        event_id: UUID,
    ) -> EventRegistration | None:
        """
        Find the earliest waitlisted registration for deterministic auto-promotion.
        Ordered strictly by registered_at ASC, id ASC.
        """
        stmt = (
            select(EventRegistration)
            .where(
                EventRegistration.event_id == event_id,
                EventRegistration.status == EventRegistrationStatus.WAITLISTED,
            )
            .options(
                selectinload(EventRegistration.user),
                selectinload(EventRegistration.event),
            )
            .order_by(
                EventRegistration.registered_at.asc(),
                EventRegistration.id.asc(),
            )
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_registration(
        self,
        registration: EventRegistration,
    ) -> EventRegistration:
        """Update an existing event registration."""
        await self.db.flush()
        await self.db.refresh(registration)
        return registration
