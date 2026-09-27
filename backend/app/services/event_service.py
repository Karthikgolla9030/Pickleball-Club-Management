"""
Aught2 Pickleball — Event Service (Phase 14)

Business logic layer for events and event registrations.
Handles:
  - Event lifecycle state machine: draft -> published -> completed / cancelled
  - Eligibility verification (public, members_only, private)
  - Registration window validation
  - Capacity calculation and automatic waitlist placement
  - Deterministic waitlist auto-promotion on cancellation
  - Staff attendance tracking (attended, no_show)
  - Cross-club tenant isolation
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_player_membership import PlayerMembershipStatus
from app.models.event import (
    Event,
    EventRegistration,
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)
from app.models.user import User
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.event_repository import EventRepository
from app.repositories.user_repository import UserRepository
from app.schemas.event import (
    EventCreateRequest,
    EventDetailResponse,
    EventRegistrationResponse,
    EventResponse,
    EventUpdateRequest,
    PlayerEventDetailResponse,
)
from app.core.events import EventType as WSEventType, dispatch_event
from app.services.notification_service import NotificationService


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class EventService:
    """Service encapsulating event and event-registration business rules."""

    ALLOWED_EVENT_TRANSITIONS: dict[EventStatus, set[EventStatus]] = {
        EventStatus.DRAFT: {EventStatus.PUBLISHED, EventStatus.CANCELLED},
        EventStatus.PUBLISHED: {EventStatus.COMPLETED, EventStatus.CANCELLED},
        EventStatus.COMPLETED: set(),  # Terminal
        EventStatus.CANCELLED: set(),  # Terminal
    }

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.event_repo = EventRepository(db)
        self.club_repo = ClubRepository(db)
        self.cpm_repo = ClubPlayerMembershipRepository(db)
        self.user_repo = UserRepository(db)

    # ─── Event Management ─────────────────────────────────────────────────────

    async def create_event(
        self,
        club_id: UUID,
        payload: EventCreateRequest,
        created_by_user_id: UUID,
    ) -> EventDetailResponse:
        """Create a new event in DRAFT status."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        event = Event(
            club_id=club_id,
            title=payload.title,
            description=payload.description,
            event_type=payload.event_type,
            status=EventStatus.DRAFT,
            visibility=payload.visibility,
            start_at=payload.start_at,
            end_at=payload.end_at,
            location=payload.location or club.name,
            capacity=payload.capacity,
            registration_required=payload.registration_required,
            registration_opens_at=payload.registration_opens_at,
            registration_closes_at=payload.registration_closes_at,
            registration_fee=payload.registration_fee,
            currency=payload.currency,
            created_by_user_id=created_by_user_id,
        )

        event = await self.event_repo.create(event)
        return await self._to_event_detail_response(event)

    async def get_event_detail(
        self,
        event_id: UUID,
        club_id: UUID | None = None,
    ) -> EventDetailResponse:
        """Fetch event detail by ID with optional tenant isolation check."""
        event = await self.event_repo.get_by_id(event_id, club_id=club_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found",
            )
        return await self._to_event_detail_response(event)

    async def list_club_events(
        self,
        club_id: UUID,
        event_status: EventStatus | None = None,
        event_type: EventType | None = None,
        visibility: EventVisibility | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> list[EventDetailResponse]:
        """List events for staff management view with full filter support."""
        events = await self.event_repo.list_for_club(
            club_id=club_id,
            status=event_status,
            event_type=event_type,
            visibility=visibility,
            date_from=date_from,
            date_to=date_to,
        )
        return [await self._to_event_detail_response(ev) for ev in events]

    async def list_discovery_events(
        self,
        club_id: UUID,
        current_user: User | None = None,
    ) -> list[EventDetailResponse]:
        """
        List published events eligible for a player to discover.
        Filters visibility based on active club player membership.
        """
        is_club_member = False
        if current_user:
            membership = await self.cpm_repo.get_by_user_and_club(current_user.id, club_id)
            is_club_member = (
                membership is not None
                and membership.status == PlayerMembershipStatus.ACTIVE
            )

        events = await self.event_repo.list_published_for_discovery(
            club_id=club_id,
            is_club_member=is_club_member,
        )
        return [await self._to_event_detail_response(ev) for ev in events]

    async def update_event(
        self,
        event_id: UUID,
        club_id: UUID,
        payload: EventUpdateRequest,
    ) -> EventDetailResponse:
        """Update event details. Completed and cancelled events cannot be modified."""
        event = await self.event_repo.get_by_id(event_id, club_id=club_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found",
            )

        if event.status in (EventStatus.COMPLETED, EventStatus.CANCELLED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot update event in '{event.status.value}' status",
            )

        # Apply updates
        data = payload.model_dump(exclude_unset=True)

        # Validate schedule if times updated
        new_start = _ensure_utc(data.get("start_at", event.start_at))
        new_end = _ensure_utc(data.get("end_at", event.end_at))
        if new_end and new_start and new_end <= new_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="end_at must be strictly after start_at",
            )

        new_opens = _ensure_utc(data.get("registration_opens_at", event.registration_opens_at))
        new_closes = _ensure_utc(data.get("registration_closes_at", event.registration_closes_at))
        if new_opens and new_closes and new_closes <= new_opens:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="registration_closes_at must be after registration_opens_at",
            )

        for field, value in data.items():
            setattr(event, field, value)

        event = await self.event_repo.update(event)
        resp = await self._to_event_detail_response(event)
        try:
            await dispatch_event(
                event_type=WSEventType.EVENT_UPDATED,
                data={"event_id": str(event.id), "title": event.title, "status": event.status.value},
                club_id=club_id,
            )
        except Exception:
            pass
        return resp

    async def publish_event(
        self,
        event_id: UUID,
        club_id: UUID,
    ) -> EventDetailResponse:
        """Publish a draft event."""
        return await self._transition_event(event_id, club_id, EventStatus.PUBLISHED)

    async def cancel_event(
        self,
        event_id: UUID,
        club_id: UUID,
    ) -> EventDetailResponse:
        """Cancel a draft or published event."""
        return await self._transition_event(event_id, club_id, EventStatus.CANCELLED)

    async def complete_event(
        self,
        event_id: UUID,
        club_id: UUID,
    ) -> EventDetailResponse:
        """Mark a published event as completed."""
        return await self._transition_event(event_id, club_id, EventStatus.COMPLETED)

    async def _transition_event(
        self,
        event_id: UUID,
        club_id: UUID,
        target_status: EventStatus,
    ) -> EventDetailResponse:
        event = await self.event_repo.get_by_id(event_id, club_id=club_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found",
            )

        allowed = self.ALLOWED_EVENT_TRANSITIONS.get(event.status, set())
        if target_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot transition event from '{event.status.value}' to '{target_status.value}'",
            )

        event.status = target_status
        event = await self.event_repo.update(event)
        resp = await self._to_event_detail_response(event)

        try:
            if target_status == EventStatus.PUBLISHED:
                await dispatch_event(
                    event_type=WSEventType.EVENT_PUBLISHED,
                    data={"event_id": str(event.id), "title": event.title, "status": event.status.value},
                    club_id=club_id,
                )
            elif target_status == EventStatus.CANCELLED:
                await dispatch_event(
                    event_type=WSEventType.EVENT_CANCELLED,
                    data={"event_id": str(event.id), "title": event.title},
                    club_id=club_id,
                )
                # Notify attendees
                regs = await self.event_repo.list_registrations_for_event(event_id)
                notif_service = NotificationService(self.db)
                for r in regs:
                    if r.status in (EventRegistrationStatus.REGISTERED, EventRegistrationStatus.WAITLISTED):
                        await notif_service.create_notification(
                            user_id=r.user_id,
                            club_id=club_id,
                            category="event",
                            title="Event Cancelled",
                            message=f"Event '{event.title}' has been cancelled by the club.",
                            data={"event_id": str(event.id)},
                        )
            else:
                await dispatch_event(
                    event_type=WSEventType.EVENT_UPDATED,
                    data={"event_id": str(event.id), "title": event.title, "status": event.status.value},
                    club_id=club_id,
                )
        except Exception:
            pass

        return resp

    # ─── Event Registration Logic ─────────────────────────────────────────────

    async def register_player(
        self,
        event_id: UUID,
        user_id: UUID,
        notes: str | None = None,
        is_staff: bool = False,
    ) -> EventRegistrationResponse:
        """
        Register a player for an event.
        Enforces:
          - Event must be published
          - Registration window open
          - User eligibility based on visibility (public vs members_only vs private)
          - Capacity constraints: becomes registered if spots available, otherwise waitlisted
          - No duplicate active registration
        """
        event = await self.event_repo.get_by_id(event_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found",
            )

        # 1. Event Status Check
        if event.status != EventStatus.PUBLISHED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot register for an event in '{event.status.value}' status",
            )

        if not event.registration_required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration is not required for this event",
            )

        now = datetime.now(timezone.utc)
        opens_at = _ensure_utc(event.registration_opens_at)
        closes_at = _ensure_utc(event.registration_closes_at)
        start_at = _ensure_utc(event.start_at)

        # 2. Registration Window Check
        if not is_staff:
            if opens_at and now < opens_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Registration is not open yet",
                )

            close_cutoff = closes_at or start_at
            if close_cutoff and now > close_cutoff:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Registration has closed for this event",
                )

        # 3. Eligibility Check
        if not is_staff:
            if event.visibility == EventVisibility.PRIVATE:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This is a private event. Only club staff can register attendees.",
                )
            elif event.visibility == EventVisibility.MEMBERS_ONLY:
                membership = await self.cpm_repo.get_by_user_and_club(user_id, event.club_id)
                if not membership or membership.status != PlayerMembershipStatus.ACTIVE:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="This event is restricted to active club members",
                    )

        # 4. Duplicate Active Registration Check
        existing = await self.event_repo.get_active_registration_for_user(event_id, user_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User already has an active registration ({existing.status.value}) for this event",
            )

        # 5. Capacity Check & Initial Status
        counts = await self.event_repo.get_registration_counts(event_id)
        registered_count = counts["registered_count"]

        if event.capacity is None or registered_count < event.capacity:
            initial_status = EventRegistrationStatus.REGISTERED
        else:
            initial_status = EventRegistrationStatus.WAITLISTED

        registration = EventRegistration(
            event_id=event_id,
            user_id=user_id,
            status=initial_status,
            registered_at=now,
            notes=notes,
        )

        registration = await self.event_repo.create_registration(registration)
        # Reload with user metadata
        full_reg = await self.event_repo.get_registration(registration.id)
        resp = self._to_registration_response(full_reg or registration)

        try:
            event = await self.event_repo.get_by_id(event_id)
            if event:
                counts = await self.event_repo.get_registration_counts(event_id)
                await dispatch_event(
                    event_type=WSEventType.EVENT_REGISTRATION_CREATED,
                    data={
                        "event_id": str(event.id),
                        "event_title": event.title,
                        "registration_id": str(registration.id),
                        "user_id": str(user_id),
                        "status": registration.status.value,
                        "registered_count": counts.get("registered_count", 0),
                    },
                    club_id=event.club_id,
                    user_id=user_id,
                )
                title = "Event Registration Confirmed" if initial_status == EventRegistrationStatus.REGISTERED else "Event Waitlist Confirmed"
                body = f"You are registered for '{event.title}'." if initial_status == EventRegistrationStatus.REGISTERED else f"You are waitlisted for '{event.title}'."
                notif_svc = NotificationService(self.db)
                await notif_svc.create_notification(
                    user_id=user_id,
                    club_id=event.club_id,
                    category="event",
                    title=title,
                    message=body,
                    data={"event_id": str(event.id)},
                )
                await notif_svc.notify_club_staff(
                    club_id=event.club_id,
                    title="New Event Registration",
                    message=f"New player registered for '{event.title}'.",
                    category="event",
                    data={"event_id": str(event.id), "user_id": str(user_id)},
                )
                await self.db.commit()
        except Exception:
            pass

        return resp

    async def cancel_registration(
        self,
        event_id: UUID,
        registration_id: UUID,
        actor_user_id: UUID,
        is_staff: bool = False,
    ) -> EventRegistrationResponse:
        """
        Cancel an active registration.
        If a REGISTERED spot is freed up, deterministically promotes the earliest waitlisted player.
        """
        registration = await self.event_repo.get_registration(
            registration_id, event_id=event_id
        )
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found",
            )

        # Permission check: player can only cancel their own registration
        if not is_staff and registration.user_id != actor_user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot cancel another player's registration",
            )

        if registration.status == EventRegistrationStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration is already cancelled",
            )

        was_registered = (registration.status == EventRegistrationStatus.REGISTERED)

        # Cancel current registration
        registration.status = EventRegistrationStatus.CANCELLED
        registration.cancelled_at = datetime.now(timezone.utc)
        await self.event_repo.update_registration(registration)

        # Deterministic Auto-Promotion from waitlist
        promoted_user = None
        if was_registered:
            event = await self.event_repo.get_by_id(event_id)
            if event and event.capacity is not None:
                next_waitlisted = await self.event_repo.get_next_waitlisted_registration(event_id)
                if next_waitlisted:
                    next_waitlisted.status = EventRegistrationStatus.REGISTERED
                    await self.event_repo.update_registration(next_waitlisted)
                    promoted_user = next_waitlisted

        resp = self._to_registration_response(registration)

        try:
            event = await self.event_repo.get_by_id(event_id)
            if event:
                counts = await self.event_repo.get_registration_counts(event_id)
                await dispatch_event(
                    event_type=WSEventType.EVENT_REGISTRATION_CANCELLED,
                    data={
                        "event_id": str(event.id),
                        "event_title": event.title,
                        "registration_id": str(registration.id),
                        "user_id": str(actor_user_id),
                        "status": registration.status.value,
                        "registered_count": counts.get("registered_count", 0),
                    },
                    club_id=event.club_id,
                    user_id=actor_user_id,
                )
                await NotificationService(self.db).create_notification(
                    user_id=actor_user_id,
                    club_id=event.club_id,
                    category="event",
                    title="Event Registration Cancelled",
                    message=f"Your registration for '{event.title}' was cancelled.",
                    data={"event_id": str(event.id)},
                )
                if promoted_user:
                    await dispatch_event(
                        event_type=WSEventType.EVENT_REGISTRATION_CREATED,
                        data={
                            "event_id": str(event.id),
                            "event_title": event.title,
                            "registration_id": str(promoted_user.id),
                            "user_id": str(promoted_user.user_id),
                            "status": promoted_user.status.value,
                        },
                        club_id=event.club_id,
                        user_id=promoted_user.user_id,
                    )
                    await NotificationService(self.db).create_notification(
                        user_id=promoted_user.user_id,
                        club_id=event.club_id,
                        category="event",
                        title="Promoted from Event Waitlist",
                        message=f"A spot opened up and you are now registered for '{event.title}'.",
                        data={"event_id": str(event.id)},
                    )
                await self.db.commit()
        except Exception:
            pass

        return resp

    async def mark_attendance(
        self,
        event_id: UUID,
        registration_id: UUID,
        club_id: UUID,
        attendance_status: EventRegistrationStatus,
    ) -> EventRegistrationResponse:
        """
        Mark attendance for a registered player (attended or no_show).
        Waitlisted or cancelled registrations cannot be marked attended.
        """
        if attendance_status not in (
            EventRegistrationStatus.ATTENDED,
            EventRegistrationStatus.NO_SHOW,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status must be 'attended' or 'no_show'",
            )

        # Verify event belongs to club
        event = await self.event_repo.get_by_id(event_id, club_id=club_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found in this club",
            )

        registration = await self.event_repo.get_registration(
            registration_id, event_id=event_id
        )
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found",
            )

        if registration.status == EventRegistrationStatus.WAITLISTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot mark attendance for a waitlisted player. Must be registered first.",
            )

        if registration.status == EventRegistrationStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot mark attendance for a cancelled registration",
            )

        registration.status = attendance_status
        await self.event_repo.update_registration(registration)
        return self._to_registration_response(registration)

    async def promote_waitlisted(
        self,
        event_id: UUID,
        registration_id: UUID,
        club_id: UUID,
    ) -> EventRegistrationResponse:
        """Staff manually promotes a waitlisted player to registered."""
        event = await self.event_repo.get_by_id(event_id, club_id=club_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found in this club",
            )

        registration = await self.event_repo.get_registration(
            registration_id, event_id=event_id
        )
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found",
            )

        if registration.status != EventRegistrationStatus.WAITLISTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only waitlisted registrations can be promoted. Current status: '{registration.status.value}'",
            )

        registration.status = EventRegistrationStatus.REGISTERED
        await self.event_repo.update_registration(registration)
        return self._to_registration_response(registration)

    async def list_event_registrations(
        self,
        event_id: UUID,
        club_id: UUID,
        registration_status: EventRegistrationStatus | None = None,
    ) -> list[EventRegistrationResponse]:
        """List registrations for an event (staff view)."""
        event = await self.event_repo.get_by_id(event_id, club_id=club_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found in this club",
            )

        regs = await self.event_repo.list_registrations_for_event(
            event_id=event_id,
            status=registration_status,
        )
        return [self._to_registration_response(r) for r in regs]

    async def list_player_registrations(
        self,
        user_id: UUID,
        registration_status: EventRegistrationStatus | None = None,
    ) -> list[EventRegistrationResponse]:
        """List all event registrations for a given player."""
        regs = await self.event_repo.list_registrations_for_player(
            user_id=user_id,
            status=registration_status,
        )
        return [self._to_registration_response(r) for r in regs]

    async def get_player_event_detail(
        self,
        event_id: UUID,
        user: User,
    ) -> PlayerEventDetailResponse:
        """Fetch event detail for a player, including their active registration status."""
        event = await self.event_repo.get_by_id(event_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event not found",
            )

        # Check visibility
        if event.status != EventStatus.PUBLISHED:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Event is not published",
            )

        if event.visibility == EventVisibility.PRIVATE:
            # Check if user has an active registration (invited/registered by staff)
            active_reg = await self.event_repo.get_active_registration_for_user(event_id, user.id)
            if not active_reg:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This is a private event",
                )
        elif event.visibility == EventVisibility.MEMBERS_ONLY:
            membership = await self.cpm_repo.get_by_user_and_club(user.id, event.club_id)
            if not membership or membership.status != PlayerMembershipStatus.ACTIVE:
                # Allowed to view only if already registered (edge case), else 403
                active_reg = await self.event_repo.get_active_registration_for_user(event_id, user.id)
                if not active_reg:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="This event is restricted to active club members",
                    )

        detail = await self._to_event_detail_response(event)
        active_reg = await self.event_repo.get_active_registration_for_user(event_id, user.id)

        return PlayerEventDetailResponse(
            **detail.model_dump(),
            user_registration_status=active_reg.status if active_reg else None,
            user_registration_id=active_reg.id if active_reg else None,
            user_registered_at=active_reg.registered_at if active_reg else None,
        )

    # ─── Response Builders ────────────────────────────────────────────────────

    async def _to_event_detail_response(self, event: Event) -> EventDetailResponse:
        counts = await self.event_repo.get_registration_counts(event.id)
        registered_count = counts["registered_count"]

        available_spots = (
            max(0, event.capacity - registered_count)
            if event.capacity is not None
            else None
        )

        now = datetime.now(timezone.utc)
        opens_at = _ensure_utc(event.registration_opens_at)
        closes_at = _ensure_utc(event.registration_closes_at)
        start_at = _ensure_utc(event.start_at)

        is_open = False
        if event.status == EventStatus.PUBLISHED and event.registration_required:
            opens_ok = (opens_at is None) or (now >= opens_at)
            close_cutoff = closes_at or start_at
            closes_ok = (close_cutoff is None) or (now <= close_cutoff)
            is_open = opens_ok and closes_ok

        return EventDetailResponse(
            id=event.id,
            club_id=event.club_id,
            title=event.title,
            description=event.description,
            event_type=event.event_type,
            event_type_label=event.event_type.value.capitalize(),
            status=event.status,
            status_label=event.status.value.capitalize(),
            visibility=event.visibility,
            visibility_label=event.visibility.value.replace("_", " ").capitalize(),
            start_at=_ensure_utc(event.start_at),
            end_at=_ensure_utc(event.end_at),
            location=event.location,
            capacity=event.capacity,
            registration_required=event.registration_required,
            registration_opens_at=_ensure_utc(event.registration_opens_at),
            registration_closes_at=_ensure_utc(event.registration_closes_at),
            registration_fee=event.registration_fee,
            currency=event.currency,
            created_by_user_id=event.created_by_user_id,
            created_at=_ensure_utc(event.created_at),
            updated_at=_ensure_utc(event.updated_at),
            registered_count=registered_count,
            waitlisted_count=counts["waitlisted_count"],
            cancelled_count=counts["cancelled_count"],
            attended_count=counts["attended_count"],
            no_show_count=counts["no_show_count"],
            available_spots=available_spots,
            is_registration_open=is_open,
        )

    def _to_registration_response(
        self,
        reg: EventRegistration,
    ) -> EventRegistrationResponse:
        user_name = None
        user_email = None
        if reg.user:
            user_email = reg.user.email
            user_name = reg.user.full_name or reg.user.email

        event_title = reg.event.title if reg.event else None
        event_start_at = _ensure_utc(reg.event.start_at) if reg.event else None

        return EventRegistrationResponse(
            id=reg.id,
            event_id=reg.event_id,
            user_id=reg.user_id,
            status=reg.status,
            status_label=reg.status.value.replace("_", " ").capitalize(),
            registered_at=_ensure_utc(reg.registered_at),
            cancelled_at=_ensure_utc(reg.cancelled_at),
            notes=reg.notes,
            user_full_name=user_name,
            user_email=user_email,
            event_title=event_title,
            event_start_at=event_start_at,
            created_at=_ensure_utc(reg.created_at),
            updated_at=_ensure_utc(reg.updated_at),
        )
