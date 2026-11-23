"""
Player service — business logic for player profile and club player memberships.
Ensures tenant isolation, validation, and complete separation from staff roles.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.club import Club

from app.models.booking import Booking, BookingStatus
from app.models.club_membership import ClubMembership
from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.membership import MemberSubscription, SubscriptionStatus
from app.models.user import User
from app.models.event import Event, EventRegistration, EventRegistrationStatus, EventStatus, EventVisibility
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus, TournamentVisibility
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.league import League, LeagueStatus
from app.models.competition import Team, TeamMember
from app.models.lesson import (
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)
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
from app.schemas.player_activity import (
    PlayerActivityItem,
    UpcomingActivitiesResponse,
    UpcomingActivityItem,
)
from app.schemas.player_profile import (
    PlayerProfileCreate,
    PlayerProfileResponse,
    PlayerProfileUpdate,
)
from app.core.events import EventType, dispatch_event
from app.services.notification_service import NotificationService


def _build_club_player_response(
    m: ClubPlayerMembership,
    sub: MemberSubscription | None = None,
) -> ClubPlayerMembershipResponse:
    profile_img: str | None = None
    if m.user and getattr(m.user, "player_profile", None):
        profile_img = m.user.player_profile.profile_image_url

    is_sub = False
    sub_status: str | None = None
    sub_id: UUID | None = None
    plan_name: str | None = None

    if sub:
        eff_status = (
            sub.effective_status.value
            if hasattr(sub.effective_status, "value")
            else str(sub.effective_status)
        )
        is_sub = eff_status in ("active", "scheduled")
        sub_status = eff_status
        sub_id = sub.id
        if getattr(sub, "plan", None):
            plan_name = sub.plan.name

    eff_status_enum = m.status
    if is_sub and eff_status_enum == PlayerMembershipStatus.INACTIVE:
        eff_status_enum = PlayerMembershipStatus.ACTIVE

    return ClubPlayerMembershipResponse(
        id=m.id,
        user_id=m.user_id,
        club_id=m.club_id,
        user_email=m.user.email if m.user else "",
        user_full_name=m.user.full_name if m.user else None,
        profile_image_url=profile_img,
        membership_number=m.membership_number,
        status=eff_status_enum,
        status_label=eff_status_enum.display_label,
        joined_at=m.joined_at,
        expires_at=m.expires_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
        is_subscriber=is_sub,
        subscription_status=sub_status,
        subscription_id=sub_id,
        plan_name=plan_name,
    )


def _build_player_club_response(m: ClubPlayerMembership, club: Club) -> PlayerClubResponse:
    return PlayerClubResponse(
        club_id=club.id,
        club_name=club.name,
        club_slug=club.slug,
        logo_url=club.logo_url,
        short_description=club.short_description,
        description=club.description,
        address_line1=club.address_line1,
        address_line2=club.address_line2,
        city=club.city,
        state=club.state,
        postal_code=club.postal_code,
        country=club.country,
        contact_email=club.contact_email,
        contact_phone=club.contact_phone,
        website=club.website,
        operating_days=club.operating_days,
        opening_time=club.opening_time,
        closing_time=club.closing_time,
        timezone=club.timezone,
        facilities_summary=club.facilities_summary,
        established_year=club.established_year,
        membership_id=m.id,
        membership_number=m.membership_number,
        status=m.status,
        joined_at=m.joined_at,
        expires_at=m.expires_at,
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
            gender=payload.gender,
            profile_image_url=payload.profile_image_url,
            bio=payload.bio,
        )
        await self.db.commit()
        return PlayerProfileResponse.model_validate(profile)

    async def update_profile(
        self, user_id: UUID, payload: PlayerProfileUpdate
    ) -> PlayerProfileResponse:
        """Update authenticated user's player profile with authoritative persistence."""
        profile = await self.profile_repo.get_by_user_id(user_id)
        fields_set = payload.model_fields_set
        clear_fields: set[str] = set()
        for f in ("first_name", "last_name", "phone", "date_of_birth", "gender", "profile_image_url", "bio"):
            if f in fields_set and getattr(payload, f) is None:
                clear_fields.add(f)

        if not profile:
            user = await self.user_repo.get_by_id(user_id)
            display_name = (
                payload.display_name
                or (user.full_name if user and user.full_name else "Player")
            )
            profile = await self.profile_repo.create(
                user_id=user_id,
                display_name=display_name,
                first_name=payload.first_name,
                last_name=payload.last_name,
                phone=payload.phone,
                date_of_birth=payload.date_of_birth,
                gender=payload.gender,
                profile_image_url=payload.profile_image_url,
                bio=payload.bio,
            )
            await self.db.commit()
            await self.db.refresh(profile)
            resp = PlayerProfileResponse.model_validate(profile)
            updated = profile
        else:
            updated = await self.profile_repo.update(
                profile=profile,
                display_name=payload.display_name,
                first_name=payload.first_name,
                last_name=payload.last_name,
                phone=payload.phone,
                date_of_birth=payload.date_of_birth,
                gender=payload.gender,
                profile_image_url=payload.profile_image_url,
                bio=payload.bio,
                clear_fields=clear_fields,
            )
            await self.db.commit()
            await self.db.refresh(updated)
            resp = PlayerProfileResponse.model_validate(updated)

        # Synchronize User.full_name if name fields were updated
        try:
            user = await self.user_repo.get_by_id(user_id)
            if user:
                name_parts = [p for p in (updated.first_name, updated.last_name) if p]
                if name_parts:
                    user.full_name = " ".join(name_parts)
                elif updated.display_name:
                    user.full_name = updated.display_name
                await self.db.commit()
        except Exception:
            pass

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
                "gender": updated.gender,
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
                logo_url=m.club.logo_url,
                short_description=m.club.short_description,
                description=m.club.description,
                address_line1=m.club.address_line1,
                address_line2=m.club.address_line2,
                city=m.club.city,
                state=m.club.state,
                postal_code=m.club.postal_code,
                country=m.club.country,
                contact_email=m.club.contact_email,
                contact_phone=m.club.contact_phone,
                website=m.club.website,
                operating_days=m.club.operating_days,
                opening_time=m.club.opening_time,
                closing_time=m.club.closing_time,
                timezone=m.club.timezone,
                facilities_summary=m.club.facilities_summary,
                established_year=m.club.established_year,
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
            logo_url=membership.club.logo_url,
            short_description=membership.club.short_description,
            description=membership.club.description,
            address_line1=membership.club.address_line1,
            address_line2=membership.club.address_line2,
            city=membership.club.city,
            state=membership.club.state,
            postal_code=membership.club.postal_code,
            country=membership.club.country,
            contact_email=membership.club.contact_email,
            contact_phone=membership.club.contact_phone,
            website=membership.club.website,
            operating_days=membership.club.operating_days,
            opening_time=membership.club.opening_time,
            closing_time=membership.club.closing_time,
            timezone=membership.club.timezone,
            facilities_summary=membership.club.facilities_summary,
            established_year=membership.club.established_year,
            membership_number=membership.membership_number,
            status=membership.status,
            joined_at=membership.joined_at,
            expires_at=membership.expires_at,
            created_at=membership.created_at,
            updated_at=membership.updated_at,
        )

    async def join_club(self, user_id: UUID, club_id: UUID) -> PlayerClubResponse:
        """
        Player joins a club directly.
        Automatically activates ordinary player club membership without manual staff approval.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club or not club.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found or inactive",
            )

        if not getattr(club, "allows_free_join", True):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This club does not permit free joining. Please choose a membership plan.",
            )

        now = datetime.now(timezone.utc)
        existing = await self.player_membership_repo.get_by_user_and_club(user_id, club_id)
        if existing:
            if existing.status == PlayerMembershipStatus.ACTIVE:
                return _build_player_club_response(existing, club)
            # Reactivate membership if it was inactive or suspended
            updated = await self.player_membership_repo.update(
                existing,
                status=PlayerMembershipStatus.ACTIVE,
                joined_at=now,
            )
            membership = updated
        else:
            membership = await self.player_membership_repo.create(
                user_id=user_id,
                club_id=club_id,
                status=PlayerMembershipStatus.ACTIVE,
                joined_at=now,
            )

        # If any pending membership request exists for this user and club, mark it approved
        from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
        stmt = select(ClubMembershipRequest).where(
            ClubMembershipRequest.club_id == club_id,
            ClubMembershipRequest.user_id == user_id,
            ClubMembershipRequest.status == MembershipRequestStatus.PENDING,
        )
        pending_reqs = (await self.db.execute(stmt)).scalars().all()
        for pr in pending_reqs:
            pr.status = MembershipRequestStatus.APPROVED
            pr.reviewed_at = now
            pr.updated_at = now

        await self.db.commit()

        try:
            await dispatch_event(
                event_type=EventType.PLAYER_MEMBERSHIP_UPDATED,
                data={
                    "membership_id": str(membership.id),
                    "club_id": str(club_id),
                    "user_id": str(user_id),
                    "status": membership.status.value,
                },
                club_id=club_id,
                user_id=user_id,
            )
            notif_svc = NotificationService(self.db)
            await notif_svc.create_notification(
                user_id=user_id,
                club_id=club_id,
                category="membership",
                title=f"Welcome to {club.name}!",
                message=f"You have joined {club.name}. Your player membership is now active.",
                data={"club_id": str(club_id), "membership_id": str(membership.id)},
            )
            user_obj = await self.user_repo.get_by_id(user_id)
            user_name = user_obj.full_name or user_obj.email if user_obj else "A new player"
            await notif_svc.notify_club_staff(
                club_id=club_id,
                category="membership",
                title="New Club Member",
                message=f"{user_name} joined {club.name}.",
                data={"club_id": str(club_id), "user_id": str(user_id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return _build_player_club_response(membership, club)

    # ─── Club-Side Player Administration ────────────────────────────────────────

    async def list_club_player_memberships(
        self, club_id: UUID
    ) -> list[ClubPlayerMembershipResponse]:
        """List all player memberships for a club, strictly excluding club staff and unconfirmed checkouts."""
        memberships = await self.player_membership_repo.get_club_player_memberships(
            club_id
        )
        # Fetch staff user IDs for this club to enforce strict separation
        staff_stmt = select(ClubMembership.user_id).where(ClubMembership.club_id == club_id)
        staff_res = await self.db.execute(staff_stmt)
        staff_user_ids = set(staff_res.scalars().all())

        # Fetch active and scheduled subscriptions for this club to identify subscribers
        sub_stmt = (
            select(MemberSubscription)
            .options(
                selectinload(MemberSubscription.plan),
                selectinload(MemberSubscription.player_membership)
                .selectinload(ClubPlayerMembership.user)
                .selectinload(User.player_profile),
            )
            .where(
                MemberSubscription.club_id == club_id,
                MemberSubscription.status.in_([
                    SubscriptionStatus.ACTIVE,
                    SubscriptionStatus.SCHEDULED,
                ]),
            )
        )
        sub_res = await self.db.execute(sub_stmt)
        active_subs = list(sub_res.scalars().all())

        # Determine valid active or scheduled subscriptions using effective_status
        valid_subs: list[MemberSubscription] = []
        for s in active_subs:
            eff_s = s.effective_status if hasattr(s, "effective_status") else s.status
            if eff_s in (SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED):
                valid_subs.append(s)

        sub_by_pm_id: dict[UUID, MemberSubscription] = {}
        sub_by_user_id: dict[UUID, MemberSubscription] = {}
        for s in valid_subs:
            if s.player_membership_id:
                sub_by_pm_id[s.player_membership_id] = s
            if s.player_membership and s.player_membership.user_id:
                sub_by_user_id[s.player_membership.user_id] = s

        # Include all legitimate club player memberships:
        # Exclude staff accounts.
        # Exclude inactive checkouts EXCEPT if they have a qualifying (active or scheduled) subscription.
        # If a member has a qualifying subscription, they are an active club member.
        filtered: list[ClubPlayerMembership] = []
        seen_pm_ids = set()

        for m in memberships:
            if m.user_id in staff_user_ids:
                continue
            has_sub = (m.id in sub_by_pm_id) or (m.user_id in sub_by_user_id)
            if m.status == PlayerMembershipStatus.INACTIVE and not has_sub:
                continue
            filtered.append(m)
            seen_pm_ids.add(m.id)

        # Ensure any qualifying subscriber belonging to this club whose PM was not in memberships is included
        for s in valid_subs:
            if s.player_membership and s.player_membership.id not in seen_pm_ids:
                pm = s.player_membership
                if pm.user_id not in staff_user_ids:
                    filtered.append(pm)
                    seen_pm_ids.add(pm.id)

        return [
            _build_club_player_response(
                m,
                sub=sub_by_pm_id.get(m.id) or sub_by_user_id.get(m.user_id),
            )
            for m in filtered
        ]

    async def add_club_player_membership(
        self, club_id: UUID, payload: CreateClubPlayerMembershipRequest
    ) -> ClubPlayerMembershipResponse:
        """Disabled: Staff cannot manually enroll players directly. Players must join via player self-service or approved request."""
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manual player enrollment is disabled. Players must join the club via player self-service or through membership request approval.",
        )

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

    async def get_upcoming_activities(
        self,
        user_id: UUID,
        activity_type: str | None = None,
        club_id: UUID | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> UpcomingActivitiesResponse:
        """
        Unified multi-club activity discovery for players.
        Aggregates persisted upcoming tournaments, leagues, events, and lessons.
        Respects active status, publication, and date filters.
        """
        now = datetime.now(timezone.utc)
        all_activities: list[UpcomingActivityItem] = []

        # 1. Fetch user's registered activity IDs to populate is_registered
        user_tourney_ids: set[UUID] = set()
        tr_stmt = (
            select(TournamentRegistration.tournament_id)
            .join(
                ClubPlayerMembership,
                TournamentRegistration.player_membership_id == ClubPlayerMembership.id,
            )
            .where(
                ClubPlayerMembership.user_id == user_id,
                TournamentRegistration.status.in_([
                    RegistrationStatus.CONFIRMED,
                    RegistrationStatus.PENDING,
                    RegistrationStatus.WAITLISTED,
                ]),
            )
        )
        tr_res = await self.db.execute(tr_stmt)
        user_tourney_ids = set(tr_res.scalars().all())

        user_league_ids: set[UUID] = set()
        lr_stmt = (
            select(Team.league_id)
            .join(TeamMember, Team.id == TeamMember.team_id)
            .join(
                ClubPlayerMembership,
                TeamMember.player_membership_id == ClubPlayerMembership.id,
            )
            .where(
                ClubPlayerMembership.user_id == user_id,
                Team.league_id.isnot(None),
            )
        )
        lr_res = await self.db.execute(lr_stmt)
        user_league_ids = set(lr_res.scalars().all())

        user_event_ids: set[UUID] = set()
        er_stmt = select(EventRegistration.event_id).where(
            EventRegistration.user_id == user_id,
            EventRegistration.status == EventRegistrationStatus.REGISTERED,
        )
        er_res = await self.db.execute(er_stmt)
        user_event_ids = set(er_res.scalars().all())

        user_lesson_ids: set[UUID] = set()
        ls_stmt = select(LessonRegistration.lesson_id).where(
            LessonRegistration.user_id == user_id,
            LessonRegistration.status == LessonRegistrationStatus.REGISTERED,
        )
        ls_res = await self.db.execute(ls_stmt)
        user_lesson_ids = set(ls_res.scalars().all())

        # Caller's active club memberships
        user_club_ids: set[UUID] = set()
        c_stmt = select(ClubPlayerMembership.club_id).where(
            ClubPlayerMembership.user_id == user_id,
            ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
        )
        c_res = await self.db.execute(c_stmt)
        user_club_ids = set(c_res.scalars().all())

        norm_type = activity_type.lower().strip() if activity_type else "all"

        # ─── 2. TOURNAMENTS ──────────────────────────────────────────────────
        if norm_type in ("all", "tournament", "tournaments"):
            t_query = (
                select(Tournament, Club)
                .join(Club, Tournament.club_id == Club.id)
                .where(
                    Club.is_active == True,
                    Tournament.status.in_([
                        TournamentStatus.REGISTRATION_OPEN,
                        TournamentStatus.REGISTRATION_CLOSED,
                        TournamentStatus.IN_PROGRESS,
                    ]),
                    Tournament.end_date >= now,
                )
            )
            if club_id:
                t_query = t_query.where(Tournament.club_id == club_id)
            t_res = await self.db.execute(t_query)
            for tourney, club in t_res.all():
                if tourney.visibility == TournamentVisibility.PRIVATE and tourney.club_id not in user_club_ids:
                    continue

                reg_open = (
                    tourney.status == TournamentStatus.REGISTRATION_OPEN
                    and (tourney.registration_open_at is None or tourney.registration_open_at <= now)
                    and (tourney.registration_close_at is None or now <= tourney.registration_close_at)
                )

                if tourney.status == TournamentStatus.REGISTRATION_OPEN:
                    st_label = "Registration Open"
                elif tourney.status == TournamentStatus.IN_PROGRESS:
                    st_label = "In Progress"
                elif tourney.status == TournamentStatus.REGISTRATION_CLOSED:
                    st_label = "Registration Closed"
                else:
                    st_label = "Upcoming"

                fee = float((tourney.format_configuration or {}).get("registration_fee", 0) or 0)
                fmt_lbl = (
                    tourney.format.display_label
                    if hasattr(tourney.format, "display_label")
                    else str(tourney.format).replace("_", " ").title()
                )
                img = tourney.banner_image_url or club.default_tournament_banner_url or club.cover_image_url

                all_activities.append(
                    UpcomingActivityItem(
                        id=tourney.id,
                        activity_type="tournament",
                        title=tourney.name,
                        description=tourney.description,
                        club_id=club.id,
                        club_name=club.name,
                        start_date=tourney.start_date,
                        end_date=tourney.end_date,
                        image_url=img,
                        location=tourney.location_name or club.name,
                        price=fee if fee > 0 else 0.0,
                        currency="USD",
                        status=tourney.status.value,
                        status_label=st_label,
                        format_label=fmt_lbl,
                        is_registration_open=reg_open,
                        is_registered=tourney.id in user_tourney_ids,
                        available_spots=None,
                        max_participants=tourney.max_participants,
                    )
                )

        # ─── 3. LEAGUES ──────────────────────────────────────────────────────
        if norm_type in ("all", "league", "leagues"):
            l_query = (
                select(League, Club)
                .join(Club, League.club_id == Club.id)
                .where(
                    Club.is_active == True,
                    League.status.in_([
                        LeagueStatus.REGISTRATION_OPEN,
                        LeagueStatus.REGISTRATION_CLOSED,
                        LeagueStatus.IN_PROGRESS,
                        LeagueStatus.PLAYOFFS,
                    ]),
                )
            )
            if club_id:
                l_query = l_query.where(League.club_id == club_id)
            l_res = await self.db.execute(l_query)
            for lg, club in l_res.all():
                if lg.end_date and lg.end_date < now:
                    continue

                if lg.status == LeagueStatus.REGISTRATION_OPEN:
                    st_label = "Registration Open"
                elif lg.status == LeagueStatus.IN_PROGRESS:
                    st_label = "In Progress"
                elif lg.status == LeagueStatus.PLAYOFFS:
                    st_label = "Playoffs"
                elif lg.status == LeagueStatus.REGISTRATION_CLOSED:
                    st_label = "Registration Closed"
                else:
                    st_label = "Upcoming"

                reg_open = (
                    lg.status == LeagueStatus.REGISTRATION_OPEN
                    and (lg.registration_open_at is None or lg.registration_open_at <= now)
                    and (lg.registration_close_at is None or now <= lg.registration_close_at)
                )
                fee = float(lg.registration_fee or 0)
                fmt_lbl = f"{lg.number_of_weeks} Weeks League"
                img = lg.banner_image_url or club.default_league_banner_url or club.cover_image_url

                all_activities.append(
                    UpcomingActivityItem(
                        id=lg.id,
                        activity_type="league",
                        title=lg.name,
                        description=lg.description,
                        club_id=club.id,
                        club_name=club.name,
                        start_date=lg.start_date or lg.created_at,
                        end_date=lg.end_date,
                        image_url=img,
                        location=club.name,
                        price=fee if fee > 0 else 0.0,
                        currency="USD",
                        status=lg.status.value,
                        status_label=st_label,
                        format_label=fmt_lbl,
                        is_registration_open=reg_open,
                        is_registered=lg.id in user_league_ids,
                        available_spots=None,
                        max_participants=lg.max_teams * lg.team_size if lg.max_teams else None,
                    )
                )

        # ─── 4. EVENTS ───────────────────────────────────────────────────────
        if norm_type in ("all", "event", "events"):
            e_query = (
                select(Event, Club)
                .join(Club, Event.club_id == Club.id)
                .where(
                    Club.is_active == True,
                    Event.status == EventStatus.PUBLISHED,
                    Event.end_at >= now,
                )
            )
            if club_id:
                e_query = e_query.where(Event.club_id == club_id)
            e_res = await self.db.execute(e_query)
            for ev, club in e_res.all():
                if ev.visibility == EventVisibility.PRIVATE and ev.club_id not in user_club_ids:
                    continue

                reg_open = (
                    (ev.registration_opens_at is None or ev.registration_opens_at <= now)
                    and (ev.registration_closes_at is None or now <= ev.registration_closes_at)
                )
                st_label = "Registration Open" if reg_open else "Upcoming"
                fee = float(ev.registration_fee or 0)
                ev_type_val = (
                    ev.event_type.value
                    if hasattr(ev.event_type, "value")
                    else str(ev.event_type)
                )
                fmt_lbl = ev_type_val.replace("_", " ").title()
                img = ev.cover_image_url or club.default_event_banner_url or club.cover_image_url

                all_activities.append(
                    UpcomingActivityItem(
                        id=ev.id,
                        activity_type="event",
                        title=ev.title,
                        description=ev.description,
                        club_id=club.id,
                        club_name=club.name,
                        start_date=ev.start_at,
                        end_date=ev.end_at,
                        image_url=img,
                        location=ev.location or club.name,
                        price=fee if fee > 0 else 0.0,
                        currency=ev.currency or "USD",
                        status=ev.status.value,
                        status_label=st_label,
                        format_label=fmt_lbl,
                        is_registration_open=reg_open,
                        is_registered=ev.id in user_event_ids,
                        available_spots=ev.capacity,
                        max_participants=ev.capacity,
                    )
                )

        # ─── 5. LESSONS ──────────────────────────────────────────────────────
        if norm_type in ("all", "lesson", "lessons"):
            ls_query = (
                select(Lesson, Club, LessonType)
                .join(Club, Lesson.club_id == Club.id)
                .join(LessonType, Lesson.lesson_type_id == LessonType.id)
                .where(
                    Club.is_active == True,
                    Lesson.status == LessonStatus.PUBLISHED,
                    Lesson.end_at >= now,
                )
            )
            if club_id:
                ls_query = ls_query.where(Lesson.club_id == club_id)
            ls_res = await self.db.execute(ls_query)
            for ls, club, lt in ls_res.all():
                reg_open = (
                    (ls.registration_opens_at is None or ls.registration_opens_at <= now)
                    and (ls.registration_closes_at is None or now <= ls.registration_closes_at)
                )
                st_label = "Registration Open" if reg_open else "Upcoming"
                fee = float(ls.price or 0)
                fmt_lbl = "Private Lesson" if lt.is_private else (lt.name or "Group Clinic")
                img = ls.image_url or lt.image_url or club.default_lesson_banner_url or club.cover_image_url

                all_activities.append(
                    UpcomingActivityItem(
                        id=ls.id,
                        activity_type="lesson",
                        title=ls.title,
                        description=ls.description or lt.description,
                        club_id=club.id,
                        club_name=club.name,
                        start_date=ls.start_at,
                        end_date=ls.end_at,
                        image_url=img,
                        location=club.name,
                        price=fee if fee > 0 else 0.0,
                        currency=ls.currency or "USD",
                        status=ls.status.value,
                        status_label=st_label,
                        format_label=fmt_lbl,
                        is_registration_open=reg_open,
                        is_registered=ls.id in user_lesson_ids,
                        available_spots=ls.capacity,
                        max_participants=ls.capacity,
                    )
                )

        # ─── 6. DEDUPLICATE & SORT DETERMINISTICALLY ──────────────────────────
        seen = set()
        unique_activities: list[UpcomingActivityItem] = []
        for item in all_activities:
            item_key = (item.activity_type, str(item.id))
            if item_key not in seen:
                seen.add(item_key)
                unique_activities.append(item)

        def to_utc(dt: datetime | None) -> datetime:
            if dt is None:
                return datetime.now(timezone.utc)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)

        unique_activities.sort(key=lambda x: to_utc(x.start_date))

        total = len(unique_activities)
        paginated = unique_activities[offset : offset + limit]
        has_more = (offset + limit) < total

        return UpcomingActivitiesResponse(
            items=paginated,
            total=total,
            has_more=has_more,
        )

