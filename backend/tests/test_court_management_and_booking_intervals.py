"""
Aught2 Pickleball — Court Operating Hours, Configurable Booking Intervals,
and Availability Enforcement Test Suite.

Verifies all 12 scenarios:
1. Create a court with 6:00 AM–10:00 PM operating hours and a 30-minute interval.
2. Verify availability generates 30-minute slots (06:00, 06:30, 07:00, ...).
3. Change the interval to 60 minutes and verify available slots change (06:00, 07:00, ...).
4. Create a second court with different operating hours (8:00 AM–8:00 PM) and verify independence.
5. Edit a court and confirm that changes persist after reload.
6. Attempt to book outside operating hours and verify backend rejects with 400.
7. Attempt to book beyond closing time and verify rejection with 400.
8. Attempt overlapping reservations and verify double booking concurrency prevention (409).
9. Test closed days and day-specific schedules (closed days return 0 slots and reject bookings).
10. Preview schedule disruptions when future bookings exist without silently modifying existing bookings.
11. Verify that booking durations, price calculations, and existing records are preserved.
12. Verify availability remains consistent across repeated calculations.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import zoneinfo
import pytest
from httpx import AsyncClient
from sqlalchemy import select
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


@pytest.fixture
def client(async_client: AsyncClient) -> AsyncClient:
    return async_client


@pytest.fixture
def db(db_session: AsyncSession) -> AsyncSession:
    return db_session


# ─── Helpers ──────────────────────────────────────────────────────────────────

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



async def create_club(
    db: AsyncSession,
    name: str | None = None,
    slug: str | None = None,
    timezone_str: str = "UTC",
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    name = name or f"Club {suffix}"
    slug = slug or f"club-{suffix}"
    club = Club(
        name=name,
        slug=slug,
        is_active=True,
        timezone=timezone_str,
        opening_time=time(6, 0),
        closing_time=time(22, 0),
    )
    db.add(club)
    await db.flush()
    return club


async def add_member(
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


# ─── Scenario 1 & 2: Create Court with 30m Interval & Verify Start Times ────────

@pytest.mark.asyncio
async def test_scenario_1_and_2_create_court_30m_interval_and_verify_slots(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await db.commit()

    headers = make_auth_header(owner.id)

    # 1. Create Court with 6:00 AM - 10:00 PM operating hours and 30m interval
    payload = {
        "name": "Court 1 (30m)",
        "court_number": 1,
        "indoor_outdoor": "indoor",
        "surface_type": "Acrylic",
        "price_per_hour": 30.00,
        "booking_interval_minutes": 30,
        "opening_time": "06:00:00",
        "closing_time": "22:00:00",
    }
    resp = await client.post(f"/api/v1/clubs/{club.id}/courts", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    court_data = resp.json()
    assert court_data["booking_interval_minutes"] == 30
    court_id = court_data["id"]

    # 2. Check Player Availability for this court
    target_date = (date.today() + timedelta(days=2)).isoformat()
    avail_resp = await client.get(
        f"/api/v1/clubs/{club.id}/courts/availability?date={target_date}",
        headers=headers,
    )
    assert avail_resp.status_code == 200, avail_resp.text
    avail_data = avail_resp.json()

    court_avail = next(c for c in avail_data["courts"] if c["court_id"] == court_id)
    assert court_avail["booking_interval_minutes"] == 30
    slots = court_avail["slots"]

    # Operating hours 06:00 to 22:00 with 30 min interval = 32 slots (16 hours * 2 slots/hour)
    assert len(slots) == 32
    # Verify first slot starts at 06:00 and ends at 06:30
    first_slot = slots[0]
    assert first_slot["start_at"].endswith("06:00:00Z") or ":06:00" in first_slot["start_at"]
    second_slot = slots[1]
    assert second_slot["start_at"].endswith("06:30:00Z") or ":06:30" in second_slot["start_at"]


# ─── Scenario 3: Change Interval to 60m and Verify Slot Generation Changes ──────

@pytest.mark.asyncio
async def test_scenario_3_change_interval_to_60m_and_verify_slots(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)

    court = Court(
        club_id=club.id,
        name="Court Flex",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=30,
        price_per_hour=Decimal("40.00"),
        operating_hours={
            day: {"is_closed": False, "open_time": "06:00:00", "close_time": "22:00:00"}
            for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        },
    )
    db.add(court)
    await db.commit()

    headers = make_auth_header(owner.id)

    # Change booking interval to 60 minutes
    update_resp = await client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court.id}",
        json={"booking_interval_minutes": 60},
        headers=headers,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["booking_interval_minutes"] == 60

    # Verify availability now generates 60-minute intervals
    target_date = (date.today() + timedelta(days=3)).isoformat()
    avail_resp = await client.get(
        f"/api/v1/clubs/{club.id}/courts/availability?date={target_date}",
        headers=headers,
    )
    assert avail_resp.status_code == 200
    court_avail = next(c for c in avail_resp.json()["courts"] if c["court_id"] == str(court.id))
    assert court_avail["booking_interval_minutes"] == 60
    # 06:00 to 22:00 with 60m slots = 16 slots
    assert len(court_avail["slots"]) == 16
    assert court_avail["slots"][0]["start_at"].endswith("06:00:00Z") or ":06:00" in court_avail["slots"][0]["start_at"]
    assert court_avail["slots"][1]["start_at"].endswith("07:00:00Z") or ":07:00" in court_avail["slots"][1]["start_at"]


# ─── Scenario 4: Multiple Courts with Independent Configurations ───────────────

@pytest.mark.asyncio
async def test_scenario_4_multiple_courts_independent_configurations(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await db.commit()

    headers = make_auth_header(owner.id)

    # Court 1: 06:00 - 22:00, 30m interval
    c1_resp = await client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json={
            "name": "Court 1",
            "court_number": 1,
            "indoor_outdoor": "indoor",
            "booking_interval_minutes": 30,
            "opening_time": "06:00:00",
            "closing_time": "22:00:00",
        },
        headers=headers,
    )
    assert c1_resp.status_code == 201

    # Court 2: 08:00 - 20:00, 60m interval
    c2_resp = await client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json={
            "name": "Court 2",
            "court_number": 2,
            "indoor_outdoor": "outdoor",
            "booking_interval_minutes": 60,
            "opening_time": "08:00:00",
            "closing_time": "20:00:00",
        },
        headers=headers,
    )
    assert c2_resp.status_code == 201

    target_date = (date.today() + timedelta(days=2)).isoformat()
    avail_resp = await client.get(
        f"/api/v1/clubs/{club.id}/courts/availability?date={target_date}",
        headers=headers,
    )
    assert avail_resp.status_code == 200
    courts_map = {c["court_name"]: c for c in avail_resp.json()["courts"]}

    # Verify Court 1 configuration and slots
    assert courts_map["Court 1"]["booking_interval_minutes"] == 30
    assert len(courts_map["Court 1"]["slots"]) == 32  # (22 - 6) * 2

    # Verify Court 2 configuration and slots
    assert courts_map["Court 2"]["booking_interval_minutes"] == 60
    assert len(courts_map["Court 2"]["slots"]) == 12  # (20 - 8) * 1


# ─── Scenario 5: Edit Court and Confirm Persistence After Reload ───────────────

@pytest.mark.asyncio
async def test_scenario_5_edit_court_persists_after_reload(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)

    court = Court(
        club_id=club.id,
        name="Court Test",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=60,
    )
    db.add(court)
    await db.commit()

    headers = make_auth_header(owner.id)

    # Edit court: update interval to 90m and operating hours
    patch_resp = await client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court.id}",
        json={
            "booking_interval_minutes": 90,
            "opening_time": "07:30:00",
            "closing_time": "21:00:00",
        },
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["booking_interval_minutes"] == 90

    # Fetch court details again (reload)
    get_resp = await client.get(
        f"/api/v1/clubs/{club.id}/courts/{court.id}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    loaded = get_resp.json()
    assert loaded["booking_interval_minutes"] == 90
    assert loaded["operating_hours"]["monday"]["open_time"] == "07:30:00"
    assert loaded["operating_hours"]["monday"]["close_time"] == "21:00:00"


# ─── Scenario 6: Book Outside Operating Hours Rejected by Backend ──────────────

@pytest.mark.asyncio
async def test_scenario_6_book_outside_operating_hours_rejected(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    player = await create_user(db, full_name="Player One")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await add_player_member(db, club, player)

    court = Court(
        club_id=club.id,
        name="Court 8am-8pm",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=60,
        operating_hours={
            day: {"is_closed": False, "open_time": "08:00:00", "close_time": "20:00:00"}
            for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        },
    )
    db.add(court)
    await db.commit()

    player_headers = make_auth_header(player.id)
    target_dt = datetime.now(timezone.utc) + timedelta(days=2)

    # Attempt booking at 06:00 AM (court opens at 08:00 AM)
    start_at = target_dt.replace(hour=6, minute=0, second=0, microsecond=0)
    end_at = start_at + timedelta(minutes=60)

    book_resp = await client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=player_headers,
    )
    assert book_resp.status_code == 400
    assert "starts before" in book_resp.json()["detail"].lower() or "opening time" in book_resp.json()["detail"].lower()


# ─── Scenario 7: Book Beyond Closing Time Rejected ────────────────────────────

@pytest.mark.asyncio
async def test_scenario_7_book_beyond_closing_time_rejected(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    player = await create_user(db, full_name="Player One")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await add_player_member(db, club, player)

    court = Court(
        club_id=club.id,
        name="Court Closes at 20:00",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=60,
        operating_hours={
            day: {"is_closed": False, "open_time": "08:00:00", "close_time": "20:00:00"}
            for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        },
    )
    db.add(court)
    await db.commit()

    player_headers = make_auth_header(player.id)
    target_dt = datetime.now(timezone.utc) + timedelta(days=2)

    # Attempt booking starting at 19:30 or 20:00 ending at 21:00 (past 20:00 closing time)
    start_at = target_dt.replace(hour=20, minute=0, second=0, microsecond=0)
    end_at = start_at + timedelta(minutes=60)

    book_resp = await client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=player_headers,
    )
    assert book_resp.status_code == 400
    assert "ends after" in book_resp.json()["detail"].lower() or "closing time" in book_resp.json()["detail"].lower()


# ─── Scenario 8: Overlapping Reservations Concurrency Prevention ───────────────

@pytest.mark.asyncio
async def test_scenario_8_overlapping_reservations_concurrency_prevention(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    player1 = await create_user(db, full_name="Player 1")
    player2 = await create_user(db, full_name="Player 2")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await add_player_member(db, club, player1)
    await add_player_member(db, club, player2)

    court = Court(
        club_id=club.id,
        name="Court Concurrent",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=60,
    )
    db.add(court)
    await db.commit()

    target_dt = datetime.now(timezone.utc) + timedelta(days=2)
    start_at = target_dt.replace(hour=10, minute=0, second=0, microsecond=0)
    end_at = start_at + timedelta(minutes=60)

    # Player 1 books the slot
    p1_headers = make_auth_header(player1.id)
    resp1 = await client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=p1_headers,
    )
    assert resp1.status_code == 201, resp1.text

    # Player 2 attempts to book the exact same slot
    p2_headers = make_auth_header(player2.id)
    resp2 = await client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=p2_headers,
    )
    assert resp2.status_code == 409
    assert "already booked" in resp2.json()["detail"].lower()


# ─── Scenario 9: Closed Days and Day-Specific Schedules ────────────────────────

@pytest.mark.asyncio
async def test_scenario_9_closed_days_and_day_specific_schedules(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    player = await create_user(db, full_name="Player One")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await add_player_member(db, club, player)

    # Court closed on Wednesdays
    court = Court(
        club_id=club.id,
        name="Court No Wednesday",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=60,
        operating_hours={
            "monday": {"is_closed": False, "open_time": "06:00:00", "close_time": "22:00:00"},
            "tuesday": {"is_closed": False, "open_time": "06:00:00", "close_time": "22:00:00"},
            "wednesday": {"is_closed": True, "open_time": None, "close_time": None},
            "thursday": {"is_closed": False, "open_time": "06:00:00", "close_time": "22:00:00"},
            "friday": {"is_closed": False, "open_time": "06:00:00", "close_time": "22:00:00"},
            "saturday": {"is_closed": False, "open_time": "06:00:00", "close_time": "22:00:00"},
            "sunday": {"is_closed": False, "open_time": "06:00:00", "close_time": "22:00:00"},
        },
    )
    db.add(court)
    await db.commit()

    # Find next Wednesday
    today = date.today()
    days_ahead = (2 - today.weekday()) % 7  # 2 is Wednesday
    if days_ahead <= 0:
        days_ahead += 7
    next_wednesday = today + timedelta(days=days_ahead)

    headers = make_auth_header(player.id)

    # 1. Availability check: court should show is_closed=True and 0 slots
    avail_resp = await client.get(
        f"/api/v1/clubs/{club.id}/courts/availability?date={next_wednesday.isoformat()}",
        headers=headers,
    )
    assert avail_resp.status_code == 200
    court_avail = next(c for c in avail_resp.json()["courts"] if c["court_id"] == str(court.id))
    assert court_avail["is_closed"] is True
    assert len(court_avail["slots"]) == 0

    # 2. Attempt to book on closed Wednesday rejected with 400
    start_at = datetime.combine(next_wednesday, time(10, 0), tzinfo=timezone.utc)
    end_at = start_at + timedelta(minutes=60)
    book_resp = await client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
        },
        headers=headers,
    )
    assert book_resp.status_code == 400
    assert "closed" in book_resp.json()["detail"].lower()


# ─── Scenario 10: Schedule Disruption Preview Without Silent Modification ──────

@pytest.mark.asyncio
async def test_scenario_10_schedule_disruption_preview_preserves_bookings(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    player = await create_user(db, full_name="Player One")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await add_player_member(db, club, player)

    court = Court(
        club_id=club.id,
        name="Court Future Bookings",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=60,
    )
    db.add(court)
    await db.flush()

    # Create a future confirmed booking at 06:00 AM
    future_start = (datetime.now(timezone.utc) + timedelta(days=3)).replace(hour=6, minute=0, second=0, microsecond=0)
    future_end = future_start + timedelta(minutes=60)
    booking = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=player.id,
        booked_by_user_id=player.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=future_start,
        end_at=future_end,
        price_per_hour=Decimal("35.00"),
        total_price=Decimal("35.00"),
    )
    db.add(booking)
    await db.commit()

    owner_headers = make_auth_header(owner.id)

    # Preview proposed operating hours changing opening from 06:00 to 09:00 AM
    proposed_hours = {
        day: {"is_closed": False, "open_time": "09:00:00", "close_time": "22:00:00"}
        for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    }
    preview_resp = await client.post(
        f"/api/v1/clubs/{club.id}/courts/{court.id}/preview-disruptions",
        json={"operating_hours": proposed_hours},
        headers=owner_headers,
    )
    assert preview_resp.status_code == 200, preview_resp.text
    preview_data = preview_resp.json()
    assert preview_data["affected_bookings_count"] == 1
    assert preview_data["affected_bookings"][0]["id"] == str(booking.id)

    # Verify that existing booking was NOT deleted, moved, or altered
    reloaded_booking = await db.scalar(select(Booking).where(Booking.id == booking.id))
    assert reloaded_booking is not None
    assert reloaded_booking.status == BookingStatus.CONFIRMED
    assert reloaded_booking.start_at == future_start
    assert reloaded_booking.duration_minutes == 60


# ─── Scenario 11: Booking Duration and Price Calculations Preserved ────────────

@pytest.mark.asyncio
async def test_scenario_11_booking_duration_and_price_preserved(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    player = await create_user(db, full_name="Player One")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)
    await add_player_member(db, club, player)

    court = Court(
        club_id=club.id,
        name="Court Pricing",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        price_per_hour=Decimal("50.00"),
        booking_interval_minutes=30,
    )
    db.add(court)
    await db.commit()

    headers = make_auth_header(player.id)
    target_dt = datetime.now(timezone.utc) + timedelta(days=2)

    # 1. Calculate price for a 30-minute booking: 0.5 * $50 = $25.00
    start_30 = target_dt.replace(hour=14, minute=0, second=0, microsecond=0)
    end_30 = start_30 + timedelta(minutes=30)
    calc30 = await client.get(
        f"/api/v1/clubs/{club.id}/bookings/calculate-price",
        params={
            "court_id": str(court.id),
            "start_at": start_30.isoformat(),
            "end_at": end_30.isoformat(),
        },
        headers=headers,
    )
    assert calc30.status_code == 200
    assert calc30.json()["duration_minutes"] == 30
    assert Decimal(str(calc30.json()["total_price"])) == Decimal("25.00")

    # 2. Calculate price for a 90-minute booking: 1.5 * $50 = $75.00
    start_90 = target_dt.replace(hour=16, minute=0, second=0, microsecond=0)
    end_90 = start_90 + timedelta(minutes=90)
    calc90 = await client.get(
        f"/api/v1/clubs/{club.id}/bookings/calculate-price",
        params={
            "court_id": str(court.id),
            "start_at": start_90.isoformat(),
            "end_at": end_90.isoformat(),
        },
        headers=headers,
    )
    assert calc90.status_code == 200
    assert calc90.json()["duration_minutes"] == 90
    assert Decimal(str(calc90.json()["total_price"])) == Decimal("75.00")


# ─── Scenario 12: Availability Consistency Across Recalculations ───────────────

@pytest.mark.asyncio
async def test_scenario_12_availability_consistency_across_recalculations(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    owner = await create_user(db, full_name="Club Owner")
    club = await create_club(db)
    await add_member(db, club, owner, ClubRole.CLUB_OWNER)

    court = Court(
        club_id=club.id,
        name="Court Reliable",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        booking_interval_minutes=60,
    )
    db.add(court)
    await db.commit()

    headers = make_auth_header(owner.id)
    target_date = (date.today() + timedelta(days=4)).isoformat()

    # Call availability multiple times
    res1 = await client.get(f"/api/v1/clubs/{club.id}/courts/availability?date={target_date}", headers=headers)
    res2 = await client.get(f"/api/v1/clubs/{club.id}/courts/availability?date={target_date}", headers=headers)

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json() == res2.json()
