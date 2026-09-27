"""
Player service — business logic for player profile and club player memberships.
Ensures tenant isolation, validation, and complete separation from staff roles.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.booking import Booking, BookingStatus
from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.event import EventRegistration
from app.models.player_profile import PlayerProfile
from app.models.tournament_registration import TournamentRegistration
from app.repositories.club_player_membership_repository import (
    ClubPlayerMembershipRepository,
)
from app.repositories.club_repository import ClubRepository
from app.repositories.player_profile_repository import PlayerProfileRepository
from app.repositories.user_repository import UserRepository
from app.schemas.club_player_membership import (
    ClubPlayerMembershipResponse,
    CreateClubPlayerMembershipRequest,
    PlayerClubMembershipDetailResponse,
    PlayerClubResponse,
    UpdateClubPlayerMembershipRequest,
)
from app.schemas.player_activity import PlayerActivityItem
from app.schemas.player_profile import (
    PlayerProfileCreate,
    PlayerProfileResponse,
    PlayerProfileUpdate,
)
from app.core.events import EventType, dispatch_event
from app.services.notification_service import NotificationService


def _build_club_player_response(m: ClubPlayerMembership) -> ClubPlayerMembershipResponse:
    profile_img: str | None = None
    if m.user and getattr(m.user, "player_profile", None):
        profile_img = m.user.player_profile.profile_image_url

    return ClubPlayerMembershipResponse(
        id=m.id,
        user_id=m.user_id,
        club_id=m.club_id,
        user_email=m.user.email if m.user else "",
        user_full_name=m.user.full_name if m.user else None,
        profile_image_url=profile_img,
        membership_number=m.membership_number,
        status=m.status,
        status_label=m.status.display_label,
        joined_at=m.joined_at,
        expires_at=m.expires_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


class PlayerService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.profile_repo = PlayerProfileRepository(db)
        self.player_membership_repo = ClubPlayerMembershipRepository(db)
        self.club_repo = ClubRepository(db)
        self.user_repo = UserRepository(db)

    # ─── Player Profile ──────────────────────────────────────────────────────────

    async def get_profile(self, user_id: UUID) -> PlayerProfileResponse:
        """Return the authenticated user's player profile or raise 404."""
        profile = await self.profile_repo.get_by_user_id(user_id)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Player profile not found",
            )
        return PlayerProfileResponse.model_validate(profile)

    async def create_profile(
        self, user_id: UUID, payload: PlayerProfileCreate
    ) -> PlayerProfileResponse:
        """Create player profile for the authenticated user."""
        existing = await self.profile_repo.get_by_user_id(user_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Player profile already exists for this user",
            )

        profile = await self.profile_repo.create(
            user_id=user_id,
            display_name=payload.display_name,
            first_name=payload.first_name,
            last_name=payload.last_name,
            phone=payload.phone,
            date_of_birth=payload.date_of_birth,
            profile_image_url=payload.profile_image_url,
            bio=payload.bio,
        )
        await self.db.commit()
        return PlayerProfileResponse.model_validate(profile)

    async def update_profile(
        self, user_id: UUID, payload: PlayerProfileUpdate
    ) -> PlayerProfileResponse:
        """Update authenticated user's player profile."""
        profile = await self.profile_repo.get_by_user_id(user_id)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Player profile not found",
            )

        updated = await self.profile_repo.update(
            profile=profile,
            display_name=payload.display_name,
            first_name=payload.first_name,
            last_name=payload.last_name,
            phone=payload.phone,
            date_of_birth=payload.date_of_birth,
            profile_image_url=payload.profile_image_url,
            bio=payload.bio,
        )
        await self.db.commit()
        resp = PlayerProfileResponse.model_validate(updated)

        # Dispatch real-time profile update to user and their clubs
        try:
            memberships = await self.player_membership_repo.get_user_player_memberships(user_id)
            profile_data = {
                "user_id": str(user_id),
                "display_name": updated.display_name,
                "first_name": updated.first_name,
                "last_name": updated.last_name,
                "profile_image_url": updated.profile_image_url,
                "phone": updated.phone,
            }
            await dispatch_event(
                event_type=EventType.PLAYER_PROFILE_UPDATED,
                data=profile_data,
                user_id=user_id,
            )
            for m in memberships:
                await dispatch_event(
                    event_type=EventType.PLAYER_PROFILE_UPDATED,
                    data=profile_data,
                    club_id=m.club_id,
                )
        except Exception:
            pass

        return resp

    # ─── Player's Own Club Memberships ──────────────────────────────────────────

    async def list_player_clubs(self, user_id: UUID) -> list[PlayerClubResponse]:
        """Return clubs where the authenticated user has a player membership."""
        memberships = await self.player_membership_repo.get_user_player_memberships(
            user_id
        )
        return [
            PlayerClubResponse(
                club_id=m.club.id,
                club_name=m.club.name,
                club_slug=m.club.slug,
                membership_id=m.id,
                membership_number=m.membership_number,
                status=m.status,
                joined_at=m.joined_at,
                expires_at=m.expires_at,
            )
            for m in memberships
        ]

    async def get_player_club_membership(
        self, user_id: UUID, club_id: UUID
    ) -> PlayerClubMembershipDetailResponse:
        """Return the authenticated user's player membership in a specific club."""
        membership = await self.player_membership_repo.get_by_user_and_club(
            user_id=user_id, club_id=club_id
        )
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Player membership not found in this club",
            )

        return PlayerClubMembershipDetailResponse(
            id=membership.id,
            user_id=membership.user_id,
            club_id=membership.club_id,
            club_name=membership.club.name,
            membership_number=membership.membership_number,
            status=membership.status,
            joined_at=membership.joined_at,
            expires_at=membership.expires_at,
            created_at=membership.created_at,
            updated_at=membership.updated_at,
        )

    # ─── Club-Side Player Administration ────────────────────────────────────────

    async def list_club_player_memberships(
        self, club_id: UUID
    ) -> list[ClubPlayerMembershipResponse]:
        """List all player memberships for a club."""
        memberships = await self.player_membership_repo.get_club_player_memberships(
            club_id
        )
        return [_build_club_player_response(m) for m in memberships]

    async def add_club_player_membership(
        self, club_id: UUID, payload: CreateClubPlayerMembershipRequest
    ) -> ClubPlayerMembershipResponse:
        """Enroll an existing user as a player member in the club."""
        user = await self.user_repo.get_by_email(payload.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with email '{payload.email}' not found",
            )

        existing = await self.player_membership_repo.get_by_user_and_club(
            user.id, club_id
        )
        if existing:
            if existing.status == PlayerMembershipStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User already has an active player membership in this club",
                )
            # Reactivate / update existing membership
            updated = await self.player_membership_repo.update(
                existing,
                status=payload.status,
                membership_number=payload.membership_number,
                expires_at=payload.expires_at,
            )
            await self.db.commit()
            return _build_club_player_response(updated)

        membership = await self.player_membership_repo.create(
            user_id=user.id,
            club_id=club_id,
            status=payload.status,
            membership_number=payload.membership_number,
            joined_at=payload.joined_at,
            expires_at=payload.expires_at,
        )
        await self.db.commit()
        return _build_club_player_response(membership)

    async def update_club_player_membership(
        self,
        club_id: UUID,
        membership_id: UUID,
        payload: UpdateClubPlayerMembershipRequest,
    ) -> ClubPlayerMembershipResponse:
        """Update a club player membership status or expiry."""
        target = await self.player_membership_repo.get_by_id(membership_id)
        if not target or target.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Player membership not found in this club",
            )

        if payload.expires_at and payload.expires_at < target.joined_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_at cannot be before joined_at",
            )

        updated = await self.player_membership_repo.update(
            target,
            status=payload.status,
            membership_number=payload.membership_number,
            expires_at=payload.expires_at,
        )
        await self.db.commit()
        resp = _build_club_player_response(updated)

        try:
            event_payload = {
                "user_id": str(target.user_id),
                "club_id": str(club_id),
                "membership_id": str(target.id),
                "status": payload.status.value,
                "membership_number": payload.membership_number,
            }
            await dispatch_event(
                event_type=EventType.PLAYER_MEMBERSHIP_UPDATED,
                data=event_payload,
                club_id=club_id,
                user_id=target.user_id,
            )
            await NotificationService(self.db).create_notification(
                user_id=target.user_id,
                club_id=club_id,
                category="membership",
                title="Club Membership Updated",
                message=f"Your club membership status is now {payload.status.value.capitalize()}.",
                data={"club_id": str(club_id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return resp

    async def get_recent_activity(self, user_id: UUID) -> list[PlayerActivityItem]:
        """
        Retrieve recent chronological activity for authenticated player.
        Includes bookings, tournament registrations, and event registrations.
        """
        items: list[PlayerActivityItem] = []

        # 1. Bookings for this player
        stmt_b = (
            select(Booking)
            .options(selectinload(Booking.court), selectinload(Booking.club))
            .where(Booking.player_id == user_id)
            .order_by(Booking.updated_at.desc())
            .limit(5)
        )
        res_b = await self.db.execute(stmt_b)
        for b in res_b.scalars().all():
            court_name = b.court.name if b.court else "Court"
            # Format date e.g. "Tomorrow, 10:00 AM – 11:00 AM" or "Sep 27, 10:00 AM – 11:00 AM"
            start_str = b.start_at.strftime("%I:%M %p")
            end_str = b.end_at.strftime("%I:%M %p")
            date_str = b.start_at.strftime("%b %d")
            time_desc = f"{court_name} • {date_str}, {start_str} – {end_str}"

            if b.status == BookingStatus.CONFIRMED:
                items.append(
                    PlayerActivityItem(
                        id=f"booking-{b.id}",
                        activity_type="booking_confirmed",
                        title="Booking Confirmed",
                        description=time_desc,
                        timestamp=b.created_at,
                        entity_type="booking",
                        entity_id=str(b.id),
                    )
                )
            elif b.status == BookingStatus.CANCELLED:
                items.append(
                    PlayerActivityItem(
                        id=f"booking-cancelled-{b.id}",
                        activity_type="booking_cancelled",
                        title="Booking Cancelled",
                        description=time_desc,
                        timestamp=b.cancelled_at or b.updated_at,
                        entity_type="booking",
                        entity_id=str(b.id),
                    )
                )

        # 2. Tournament registrations
        stmt_tr = (
            select(TournamentRegistration)
            .join(ClubPlayerMembership, TournamentRegistration.player_membership_id == ClubPlayerMembership.id)
            .options(selectinload(TournamentRegistration.tournament))
            .where(ClubPlayerMembership.user_id == user_id)
            .order_by(TournamentRegistration.registered_at.desc())
            .limit(5)
        )
        res_tr = await self.db.execute(stmt_tr)
        for tr in res_tr.scalars().all():
            tourney_name = tr.tournament.name if tr.tournament else "Tournament"
            items.append(
                PlayerActivityItem(
                    id=f"tourney-{tr.id}",
                    activity_type="tournament_registration",
                    title="Tournament Registration",
                    description=f"You registered for {tourney_name}",
                    timestamp=tr.registered_at or tr.created_at,
                    entity_type="tournament",
                    entity_id=str(tr.tournament_id),
                )
            )

        # 3. Event registrations
        stmt_er = (
            select(EventRegistration)
            .options(selectinload(EventRegistration.event))
            .where(EventRegistration.user_id == user_id)
            .order_by(EventRegistration.registered_at.desc())
            .limit(5)
        )
        res_er = await self.db.execute(stmt_er)
        for er in res_er.scalars().all():
            event_title = er.event.title if er.event else "Club Event"
            items.append(
                PlayerActivityItem(
                    id=f"event-{er.id}",
                    activity_type="event_registration",
                    title="Event Registration",
                    description=f"You registered for {event_title}",
                    timestamp=er.registered_at,
                    entity_type="event",
                    entity_id=str(er.event_id),
                )
            )

        # Sort all activities by timestamp descending and take up to 5
        items.sort(key=lambda x: x.timestamp, reverse=True)
        return items[:5]

