"""
Aught2 Pickleball — Event API Endpoints (Phase 14)

Staff Endpoints (/api/v1/clubs/{club_id}/events):
  - GET    /
  - POST   /
  - GET    /{event_id}
  - PATCH  /{event_id}
  - POST   /{event_id}/publish
  - POST   /{event_id}/cancel
  - POST   /{event_id}/complete
  - GET    /{event_id}/registrations
  - POST   /{event_id}/registrations
  - POST   /{event_id}/registrations/{registration_id}/cancel
  - POST   /{event_id}/registrations/{registration_id}/attend
  - POST   /{event_id}/registrations/{registration_id}/no-show
  - POST   /{event_id}/registrations/{registration_id}/promote

Player Endpoints:
  - GET    /players/me/events
  - GET    /players/me/events/{event_id}
  - POST   /players/me/events/{event_id}/register
  - POST   /players/me/events/{event_id}/cancel
  - GET    /clubs/{club_id}/events/discover
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.event import (
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)
from app.models.user import User
from app.permissions import Permission
from app.schemas.event import (
    EventCreateRequest,
    EventDetailResponse,
    EventRegistrationResponse,
    EventUpdateRequest,
    PlayerEventDetailResponse,
    PlayerRegisterRequest,
    StaffRegisterPlayerRequest,
)
from app.services.event_service import EventService


# ─── Routers ──────────────────────────────────────────────────────────────────

club_events_router = APIRouter(
    prefix="/clubs/{club_id}/events",
    tags=["Club Events"],
)

player_events_router = APIRouter(
    tags=["Player Events"],
)


# ═══════════════════════════════════════════════════════════════════════════════
# STAFF EVENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@club_events_router.get(
    "",
    response_model=list[EventDetailResponse],
    summary="List club events",
    description="List all events for a club with optional filtering by status, event type, visibility, and date range.",
)
async def list_club_events(
    club_id: UUID,
    event_status: EventStatus | None = Query(default=None, alias="status"),
    event_type: EventType | None = Query(default=None),
    visibility: EventVisibility | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> list[EventDetailResponse]:
    service = EventService(db)
    return await service.list_club_events(
        club_id=club_id,
        event_status=event_status,
        event_type=event_type,
        visibility=visibility,
        date_from=date_from,
        date_to=date_to,
    )


@club_events_router.post(
    "",
    response_model=EventDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create event",
    description="Create a new event in draft status for the specified club.",
)
async def create_event(
    club_id: UUID,
    payload: EventCreateRequest,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventDetailResponse:
    service = EventService(db)
    return await service.create_event(
        club_id=club_id,
        payload=payload,
        created_by_user_id=current_user.id,
    )


@club_events_router.get(
    "/{event_id}",
    response_model=EventDetailResponse,
    summary="Get event details",
    description="Get detailed information about an event including capacity, registered, and waitlisted counts.",
)
async def get_event(
    club_id: UUID,
    event_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventDetailResponse:
    service = EventService(db)
    return await service.get_event_detail(event_id=event_id, club_id=club_id)


@club_events_router.patch(
    "/{event_id}",
    response_model=EventDetailResponse,
    summary="Update event",
    description="Update mutable fields of an event in draft or published status.",
)
async def update_event(
    club_id: UUID,
    event_id: UUID,
    payload: EventUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventDetailResponse:
    service = EventService(db)
    return await service.update_event(
        event_id=event_id,
        club_id=club_id,
        payload=payload,
    )


@club_events_router.post(
    "/{event_id}/publish",
    response_model=EventDetailResponse,
    summary="Publish event",
    description="Transition event from draft to published status.",
)
async def publish_event(
    club_id: UUID,
    event_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventDetailResponse:
    service = EventService(db)
    return await service.publish_event(event_id=event_id, club_id=club_id)


@club_events_router.post(
    "/{event_id}/cancel",
    response_model=EventDetailResponse,
    summary="Cancel event",
    description="Cancel a draft or published event.",
)
async def cancel_event(
    club_id: UUID,
    event_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventDetailResponse:
    service = EventService(db)
    return await service.cancel_event(event_id=event_id, club_id=club_id)


@club_events_router.post(
    "/{event_id}/complete",
    response_model=EventDetailResponse,
    summary="Complete event",
    description="Mark a published event as completed.",
)
async def complete_event(
    club_id: UUID,
    event_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventDetailResponse:
    service = EventService(db)
    return await service.complete_event(event_id=event_id, club_id=club_id)


@club_events_router.get(
    "/{event_id}/registrations",
    response_model=list[EventRegistrationResponse],
    summary="List event registrations",
    description="List all registrations for an event with optional status filtering.",
)
async def list_event_registrations(
    club_id: UUID,
    event_id: UUID,
    reg_status: EventRegistrationStatus | None = Query(default=None, alias="status"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> list[EventRegistrationResponse]:
    service = EventService(db)
    return await service.list_event_registrations(
        event_id=event_id,
        club_id=club_id,
        registration_status=reg_status,
    )


@club_events_router.post(
    "/{event_id}/registrations",
    response_model=EventRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Staff register player",
    description="Staff manually registers an eligible player for an event.",
)
async def staff_register_player(
    club_id: UUID,
    event_id: UUID,
    payload: StaffRegisterPlayerRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationResponse:
    service = EventService(db)
    # Validate event belongs to club
    await service.get_event_detail(event_id=event_id, club_id=club_id)
    return await service.register_player(
        event_id=event_id,
        user_id=payload.user_id,
        notes=payload.notes,
        is_staff=True,
    )


@club_events_router.post(
    "/{event_id}/registrations/{registration_id}/cancel",
    response_model=EventRegistrationResponse,
    summary="Staff cancel registration",
    description="Staff cancels a player's registration. If spots open up, promotes earliest waitlisted player.",
)
async def staff_cancel_registration(
    club_id: UUID,
    event_id: UUID,
    registration_id: UUID,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationResponse:
    service = EventService(db)
    # Validate event belongs to club
    await service.get_event_detail(event_id=event_id, club_id=club_id)
    return await service.cancel_registration(
        event_id=event_id,
        registration_id=registration_id,
        actor_user_id=current_user.id,
        is_staff=True,
    )


@club_events_router.post(
    "/{event_id}/registrations/{registration_id}/attend",
    response_model=EventRegistrationResponse,
    summary="Mark player attended",
    description="Staff marks a registered player as attended.",
)
async def mark_player_attended(
    club_id: UUID,
    event_id: UUID,
    registration_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationResponse:
    service = EventService(db)
    return await service.mark_attendance(
        event_id=event_id,
        registration_id=registration_id,
        club_id=club_id,
        attendance_status=EventRegistrationStatus.ATTENDED,
    )


@club_events_router.post(
    "/{event_id}/registrations/{registration_id}/no-show",
    response_model=EventRegistrationResponse,
    summary="Mark player no-show",
    description="Staff marks a registered player as a no-show.",
)
async def mark_player_no_show(
    club_id: UUID,
    event_id: UUID,
    registration_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationResponse:
    service = EventService(db)
    return await service.mark_attendance(
        event_id=event_id,
        registration_id=registration_id,
        club_id=club_id,
        attendance_status=EventRegistrationStatus.NO_SHOW,
    )


@club_events_router.post(
    "/{event_id}/registrations/{registration_id}/promote",
    response_model=EventRegistrationResponse,
    summary="Promote waitlisted player",
    description="Staff manually promotes a waitlisted player to registered.",
)
async def promote_waitlisted_player(
    club_id: UUID,
    event_id: UUID,
    registration_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationResponse:
    service = EventService(db)
    return await service.promote_waitlisted(
        event_id=event_id,
        registration_id=registration_id,
        club_id=club_id,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PLAYER EVENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@player_events_router.get(
    "/clubs/{club_id}/events/discover",
    response_model=list[EventDetailResponse],
    summary="Discover club events",
    description="List published events eligible for current player (public + members-only if club member).",
)
async def discover_club_events(
    club_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EventDetailResponse]:
    service = EventService(db)
    return await service.list_discovery_events(
        club_id=club_id,
        current_user=current_user,
    )


@player_events_router.get(
    "/players/me/events",
    response_model=list[EventRegistrationResponse],
    summary="My event registrations",
    description="List all event registrations for the authenticated player.",
)
async def list_my_event_registrations(
    reg_status: EventRegistrationStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EventRegistrationResponse]:
    service = EventService(db)
    return await service.list_player_registrations(
        user_id=current_user.id,
        registration_status=reg_status,
    )


@player_events_router.get(
    "/players/me/events/{event_id}",
    response_model=PlayerEventDetailResponse,
    summary="Get event details for player",
    description="View event details along with the current player's registration status.",
)
async def get_my_event_detail(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerEventDetailResponse:
    service = EventService(db)
    return await service.get_player_event_detail(
        event_id=event_id,
        user=current_user,
    )


@player_events_router.post(
    "/players/me/events/{event_id}/register",
    response_model=EventRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register for event",
    description="Player registers for an event. Automatically waitlisted if capacity is full.",
)
async def player_register_for_event(
    event_id: UUID,
    payload: PlayerRegisterRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationResponse:
    service = EventService(db)
    notes = payload.notes if payload else None
    return await service.register_player(
        event_id=event_id,
        user_id=current_user.id,
        notes=notes,
        is_staff=False,
    )


@player_events_router.post(
    "/players/me/events/{event_id}/cancel",
    response_model=EventRegistrationResponse,
    summary="Cancel event registration",
    description="Player cancels their own registration. If registered, auto-promotes earliest waitlisted player.",
)
async def player_cancel_event_registration(
    event_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationResponse:
    service = EventService(db)
    # Find user's active registration
    reg = await service.event_repo.get_active_registration_for_user(
        event_id=event_id,
        user_id=current_user.id,
    )
    if not reg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You do not have an active registration for this event",
        )

    return await service.cancel_registration(
        event_id=event_id,
        registration_id=reg.id,
        actor_user_id=current_user.id,
        is_staff=False,
    )
