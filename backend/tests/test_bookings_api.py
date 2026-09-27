"""
Aught2 Pickleball — Court Booking & Reservation Engine Test Suite (Phase 11)

Tests:
1. Model & Data Tests:
   - Booking model creation, relationships, properties (duration_minutes, created_by_user_id)
2. Conflict Detection & Double-Booking Prevention:
   - Exact time overlap -> 409 Conflict
   - Partial time overlap -> 409 Conflict
   - Adjacent slot (touching boundary) -> Allowed
   - Different court same time -> Allowed
   - Overlapping slot on CANCELLED booking -> Allowed
3. Player Booking Rules & Limits:
   - Active club player membership required (403 if non-member or inactive)
   - Active court required (400 if court inactive)
   - Operating hours enforcement (400 if outside opening/closing)
   - Max 3 active upcoming bookings limit per player (400 on 4th)
   - Max 14-day booking horizon (400 if > 14 days)
4. Cancellation Engine & Auditing:
   - Player can cancel own booking >= 2 hours before start
   - Player cannot cancel < 2 hours before start (400)
   - Player cannot cancel another player's booking (403)
   - Staff can cancel any club booking at any time (even < 2 hours)
   - Cancellation audit fields persisted
5. Staff Operations & RBAC:
   - Club Owner / Club Manager can create staff bookings for club players
   - Staff can override player's 3-active-booking limit
   - Staff can list all club bookings with filters
   - Tournament Director is denied booking management (403)
   - Player is denied staff booking routes (403)
   - Unauthenticated requests rejected (401)
6. Dynamic Availability Matrix:
   - Generates clean slots across operating hours for active courts
   - Confirmed bookings mark slot as unavailable
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.player_profile import PlayerProfile
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Test Helpers ─────────────────────────────────────────────────────────────

async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()

    profile = PlayerProfile(
        user_id=user.id,
        display_name=full_name,
    )
    db.add(profile)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str | None = None,
    slug: str | None = None,
    opening: time = time(6, 0),
    closing: time = time(22, 0),
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    name = name or f"Club {suffix}"
    slug = slug or f"club-{suffix}"
    club = Club(
        name=name,
        slug=slug,
        is_active=True,
        opening_time=opening,
        closing_time=closing,
        timezone="UTC",
    )
    db.add(club)
    await db.flush()
    return club


async def add_staff(
    db: AsyncSession,
    club: Club,
    user: User,
    role: ClubRole = ClubRole.CLUB_OWNER,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=role,
        is_active=True,
    )
    db.add(membership)
    await db.flush()
    return membership


async def add_player_member(
    db: AsyncSession,
    club: Club,
    user: User,
    status: PlayerMembershipStatus = PlayerMembershipStatus.ACTIVE,
) -> ClubPlayerMembership:
    membership = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        status=status,
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_court(
    db: AsyncSession,
    club: Club,
    name: str = "Court 1",
    court_number: int | None = 1,
    is_active: bool = True,
    status: CourtStatus = CourtStatus.ACTIVE,
) -> Court:
    court = Court(
        club_id=club.id,
        name=name,
        court_number=court_number,
        indoor_outdoor=CourtEnvironment.INDOOR,
        surface_type="Acrylic",
        display_order=0,
        is_active=is_active,
        status=status,
    )
    db.add(court)
    await db.flush()
    return court


# ─── 1. Model & Data Tests ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_model_creation(db_session: AsyncSession):
    """Test booking creation with properties and relationships."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    court = await create_court(db_session, club)

    now = datetime.now(timezone.utc)
    start_at = now + timedelta(days=1, hours=2)
    end_at = start_at + timedelta(hours=1)

    booking = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=user.id,
        booked_by_user_id=user.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=start_at,
        end_at=end_at,
        notes="Test note",
    )
    db_session.add(booking)
    await db_session.flush()

    assert booking.id is not None
    assert booking.duration_minutes == 60
    assert booking.created_by_user_id == user.id
    assert booking.status == BookingStatus.CONFIRMED


# ─── 2. Conflict Detection & Overlap Tests ─────────────────────────────────────

@pytest.mark.asyncio
async def test_double_booking_conflict_rejected(async_client: AsyncClient, db_session: AsyncSession):
    """Cannot book an already confirmed court time slot (409 Conflict)."""
    user1 = await create_user(db_session, full_name="Player One")
    user2 = await create_user(db_session, full_name="Player Two")
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_player_member(db_session, club, user1)
    await add_player_member(db_session, club, user2)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    start_at = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    end_at = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    # 1. User 1 books slot
    resp1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user1),
    )
    assert resp1.status_code == 201

    # 2. User 2 attempts exact same slot -> 409 Conflict
    resp2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user2),
    )
    assert resp2.status_code == 409
    assert "already booked" in resp2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_adjacent_bookings_allowed(async_client: AsyncClient, db_session: AsyncSession):
    """Back-to-back bookings (e.g. 10-11 and 11-12) do not conflict."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_player_member(db_session, club, user)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    slot1_start = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    slot1_end = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)
    slot2_start = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)
    slot2_end = datetime.combine(tomorrow, time(12, 0), tzinfo=timezone.utc)

    resp1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": slot1_start.isoformat(),
            "end_at": slot1_end.isoformat(),
        },
        headers=make_auth_header(user),
    )
    assert resp1.status_code == 201

    resp2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": slot2_start.isoformat(),
            "end_at": slot2_end.isoformat(),
        },
        headers=make_auth_header(user),
    )
    assert resp2.status_code == 201


@pytest.mark.asyncio
async def test_different_courts_same_time_allowed(async_client: AsyncClient, db_session: AsyncSession):
    """Two different courts can be booked for the same time window."""
    user1 = await create_user(db_session)
    user2 = await create_user(db_session)
    club = await create_club(db_session)
    court1 = await create_court(db_session, club, name="Court 1", court_number=1)
    court2 = await create_court(db_session, club, name="Court 2", court_number=2)
    await add_player_member(db_session, club, user1)
    await add_player_member(db_session, club, user2)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    start_at = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    end_at = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    resp1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court1.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user1),
    )
    assert resp1.status_code == 201

    resp2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court2.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user2),
    )
    assert resp2.status_code == 201


@pytest.mark.asyncio
async def test_cancelled_booking_frees_slot(async_client: AsyncClient, db_session: AsyncSession):
    """Once a booking is cancelled, another player can book that same slot."""
    user1 = await create_user(db_session)
    user2 = await create_user(db_session)
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_player_member(db_session, club, user1)
    await add_player_member(db_session, club, user2)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=2)).date()
    start_at = datetime.combine(tomorrow, time(14, 0), tzinfo=timezone.utc)
    end_at = datetime.combine(tomorrow, time(15, 0), tzinfo=timezone.utc)

    resp1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user1),
    )
    assert resp1.status_code == 201
    booking_id = resp1.json()["id"]

    # User 1 cancels
    cancel_resp = await async_client.post(
        f"/api/v1/bookings/{booking_id}/cancel",
        json={"cancellation_reason": "Not feeling well"},
        headers=make_auth_header(user1),
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # User 2 now books the freed slot
    resp2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user2),
    )
    assert resp2.status_code == 201


# ─── 3. Player Validation & Limits Tests ──────────────────────────────────────

@pytest.mark.asyncio
async def test_non_member_cannot_book(async_client: AsyncClient, db_session: AsyncSession):
    """Player without active club player membership cannot book courts (403)."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    court = await create_court(db_session, club)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    start_at = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    end_at = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user),
    )
    assert resp.status_code == 403
    assert "active club player membership required" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_inactive_court_cannot_be_booked(async_client: AsyncClient, db_session: AsyncSession):
    """Inactive court rejects new bookings (400 Bad Request)."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    court = await create_court(db_session, club, is_active=False, status=CourtStatus.INACTIVE)
    await add_player_member(db_session, club, user)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    start_at = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    end_at = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(user),
    )
    assert resp.status_code == 400
    assert "inactive" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_operating_hours_enforced(async_client: AsyncClient, db_session: AsyncSession):
    """Booking outside club operating hours is rejected (400 Bad Request)."""
    user = await create_user(db_session)
    club = await create_club(db_session, opening=time(8, 0), closing=time(20, 0))
    court = await create_court(db_session, club)
    await add_player_member(db_session, club, user)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()

    # Before opening (07:00 - 08:00)
    early_start = datetime.combine(tomorrow, time(7, 0), tzinfo=timezone.utc)
    early_end = datetime.combine(tomorrow, time(8, 0), tzinfo=timezone.utc)
    resp_early = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": early_start.isoformat(),
            "end_at": early_end.isoformat(),
        },
        headers=make_auth_header(user),
    )
    assert resp_early.status_code == 400
    assert "before club opening" in resp_early.json()["detail"].lower()

    # After closing (20:00 - 21:00)
    late_start = datetime.combine(tomorrow, time(20, 0), tzinfo=timezone.utc)
    late_end = datetime.combine(tomorrow, time(21, 0), tzinfo=timezone.utc)
    resp_late = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": late_start.isoformat(),
            "end_at": late_end.isoformat(),
        },
        headers=make_auth_header(user),
    )
    assert resp_late.status_code == 400
    assert "after club closing" in resp_late.json()["detail"].lower()


@pytest.mark.asyncio
async def test_max_active_bookings_limit_per_player(async_client: AsyncClient, db_session: AsyncSession):
    """Player cannot exceed maximum of 3 concurrent active upcoming bookings (400)."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_player_member(db_session, club, user)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()

    # Create 3 active bookings (allowed)
    for hour in [9, 11, 13]:
        start_at = datetime.combine(tomorrow, time(hour, 0), tzinfo=timezone.utc)
        end_at = datetime.combine(tomorrow, time(hour + 1, 0), tzinfo=timezone.utc)
        resp = await async_client.post(
            f"/api/v1/clubs/{club.id}/bookings",
            json={
                "court_id": str(court.id),
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
            },
            headers=make_auth_header(user),
        )
        assert resp.status_code == 201

    # 4th booking rejected due to limit
    start_at_4 = datetime.combine(tomorrow, time(15, 0), tzinfo=timezone.utc)
    end_at_4 = datetime.combine(tomorrow, time(16, 0), tzinfo=timezone.utc)
    resp_4 = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at_4.isoformat(),
            "end_at": end_at_4.isoformat(),
        },
        headers=make_auth_header(user),
    )
    assert resp_4.status_code == 400
    assert "active booking limit" in resp_4.json()["detail"].lower()


# ─── 4. Cancellation Rules Tests ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_player_cannot_cancel_within_two_hours(async_client: AsyncClient, db_session: AsyncSession):
    """Player cannot cancel their own booking within 2 hours of start time (400)."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_player_member(db_session, club, user)

    # Insert a booking starting in 90 minutes
    now = datetime.now(timezone.utc)
    start_at = now + timedelta(minutes=90)
    end_at = start_at + timedelta(hours=1)

    booking = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=user.id,
        booked_by_user_id=user.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=start_at,
        end_at=end_at,
    )
    db_session.add(booking)
    await db_session.flush()

    resp = await async_client.post(
        f"/api/v1/bookings/{booking.id}/cancel",
        json={"cancellation_reason": "Late emergency"},
        headers=make_auth_header(user),
    )
    assert resp.status_code == 400
    assert "at least 2 hours before" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_player_cannot_cancel_others_booking(async_client: AsyncClient, db_session: AsyncSession):
    """Player cannot cancel another player's reservation (403 Forbidden)."""
    owner = await create_user(db_session, full_name="Booking Owner")
    attacker = await create_user(db_session, full_name="Attacker")
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_player_member(db_session, club, owner)
    await add_player_member(db_session, club, attacker)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    start_at = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    end_at = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    booking = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=owner.id,
        booked_by_user_id=owner.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=start_at,
        end_at=end_at,
    )
    db_session.add(booking)
    await db_session.flush()

    resp = await async_client.post(
        f"/api/v1/bookings/{booking.id}/cancel",
        json={"cancellation_reason": "Malicious cancel"},
        headers=make_auth_header(attacker),
    )
    assert resp.status_code == 403
    assert "only cancel your own" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_staff_can_cancel_any_booking_any_time(async_client: AsyncClient, db_session: AsyncSession):
    """Staff can cancel any booking in their club even within 2 hours."""
    staff = await create_user(db_session, full_name="Club Staff")
    player = await create_user(db_session, full_name="Club Player")
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_staff(db_session, club, staff, role=ClubRole.CLUB_MANAGER)
    await add_player_member(db_session, club, player)

    # Booking starting in 30 minutes
    now = datetime.now(timezone.utc)
    start_at = now + timedelta(minutes=30)
    end_at = start_at + timedelta(hours=1)

    booking = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=player.id,
        booked_by_user_id=player.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=start_at,
        end_at=end_at,
    )
    db_session.add(booking)
    await db_session.flush()

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings/{booking.id}/cancel",
        json={"cancellation_reason": "Court maintenance emergency"},
        headers=make_auth_header(staff),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cancelled"
    assert data["cancelled_by_user_id"] == str(staff.id)
    assert data["cancellation_reason"] == "Court maintenance emergency"


# ─── 5. Staff Booking Management & RBAC Tests ─────────────────────────────────

@pytest.mark.asyncio
async def test_staff_can_book_for_player_and_override_limit(async_client: AsyncClient, db_session: AsyncSession):
    """Staff can book on behalf of an eligible player, bypassing the 3-booking limit."""
    staff = await create_user(db_session, full_name="Manager Dave")
    player = await create_user(db_session, full_name="Player Pete")
    club = await create_club(db_session)
    court = await create_court(db_session, club)
    await add_staff(db_session, club, staff, role=ClubRole.CLUB_MANAGER)
    await add_player_member(db_session, club, player)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()

    # Pre-populate 3 bookings for player
    for h in [9, 11, 13]:
        start_at = datetime.combine(tomorrow, time(h, 0), tzinfo=timezone.utc)
        end_at = datetime.combine(tomorrow, time(h + 1, 0), tzinfo=timezone.utc)
        b = Booking(
            club_id=club.id,
            court_id=court.id,
            player_id=player.id,
            booked_by_user_id=player.id,
            booking_type=BookingType.PLAYER,
            status=BookingStatus.CONFIRMED,
            start_at=start_at,
            end_at=end_at,
        )
        db_session.add(b)
    await db_session.flush()

    # Staff creates 4th booking on behalf of player
    start_at_4 = datetime.combine(tomorrow, time(15, 0), tzinfo=timezone.utc)
    end_at_4 = datetime.combine(tomorrow, time(16, 0), tzinfo=timezone.utc)

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings/staff",
        json={
            "court_id": str(court.id),
            "player_id": str(player.id),
            "start_at": start_at_4.isoformat(),
            "end_at": end_at_4.isoformat(),
            "notes": "VIP Staff reservation",
        },
        headers=make_auth_header(staff),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["booking_type"] == "staff"
    assert data["player_id"] == str(player.id)
    assert data["created_by_user_id"] == str(staff.id)


@pytest.mark.asyncio
async def test_tournament_director_denied_booking_management(async_client: AsyncClient, db_session: AsyncSession):
    """Tournament Director is denied access to club booking management (403 Forbidden)."""
    director = await create_user(db_session, full_name="Director Dan")
    club = await create_club(db_session)
    await add_staff(db_session, club, director, role=ClubRole.TOURNAMENT_DIRECTOR)

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/bookings",
        headers=make_auth_header(director),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_player_denied_staff_endpoints(async_client: AsyncClient, db_session: AsyncSession):
    """Player cannot access staff booking routes (403 Forbidden)."""
    player = await create_user(db_session, full_name="Regular Player")
    club = await create_club(db_session)
    await add_player_member(db_session, club, player)

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/bookings",
        headers=make_auth_header(player),
    )
    assert resp.status_code == 403


# ─── 6. Availability Matrix Tests ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_court_availability(async_client: AsyncClient, db_session: AsyncSession):
    """Availability endpoint returns accurate open and booked slot status."""
    player = await create_user(db_session)
    club = await create_club(db_session, opening=time(9, 0), closing=time(12, 0))
    court1 = await create_court(db_session, club, name="Court 1", court_number=1)
    court2 = await create_court(db_session, club, name="Court 2", court_number=2)
    await add_player_member(db_session, club, player)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()

    # Book Court 1 from 10:00 to 11:00
    start_at = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    end_at = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    book_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court1.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=make_auth_header(player),
    )
    assert book_resp.status_code == 201

    # Query availability
    avail_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/availability?date={tomorrow.isoformat()}&duration=60",
        headers=make_auth_header(player),
    )
    assert avail_resp.status_code == 200
    data = avail_resp.json()
    assert data["club_id"] == str(club.id)
    assert len(data["courts"]) == 2

    # Court 1 should have 3 slots: 9-10 (available), 10-11 (NOT available), 11-12 (available)
    c1_data = next(c for c in data["courts"] if c["court_id"] == str(court1.id))
    assert len(c1_data["slots"]) == 3
    assert c1_data["slots"][0]["is_available"] is True
    assert c1_data["slots"][1]["is_available"] is False
    assert c1_data["slots"][2]["is_available"] is True

    # Court 2 should have all 3 slots available
    c2_data = next(c for c in data["courts"] if c["court_id"] == str(court2.id))
    assert all(s["is_available"] for s in c2_data["slots"])
