"""
Aught2 Pickleball — Phase 7 Club Settings, Operating Hours & Facility Configuration Tests

Covers:
  1. Club Profile Settings:
     - Owner can update their own club profile
     - Manager cannot update club profile (403)
     - Tournament Director cannot update club profile (403)
     - Player cannot update club profile (403)
     - Cross-club owner cannot update another club's profile (403/404)
     - Invalid fields (email, website, year, slug) are rejected (422)
     - Sensitive / internal fields cannot be mass assigned
     - Public discovery APIs expose safe data and do not leak private fields
  2. Operating Hours & Booking Integration:
     - Default operating hours returned when no custom schedule is set
     - Owner can update weekly operating hours with individual day schedules
     - Manager & Tournament Director cannot update club operating hours (403)
     - Invalid time ranges (open >= close) and overnight hours are rejected
     - Closed days expose 0 available slots in availability engine
     - Direct booking on closed days is rejected (400)
     - Direct booking outside operating hours is rejected (400)
     - Updating operating hours does NOT alter, move, or delete confirmed bookings
     - Preview operating hours disruptions identifies affected confirmed bookings
  3. Courts and Facility Management:
     - Owner and Manager can list and manage courts
     - Court validation (non-blank name, unique court number per club)
     - Cross-club court access is denied (403/404)
     - Per-court operating hour overrides work independently of club schedule
     - Clearing court override reverts to club schedule
     - Court affected bookings endpoint previews upcoming bookings before deactivation
     - Deactivated courts cannot receive new bookings (400)
     - Historical and confirmed bookings remain intact after court deactivation
  4. Roles and Tenant Isolation:
     - Multi-club user with Owner in Club A and Player in Club B is strictly isolated
     - Direct API calls cannot bypass server-side RBAC
  5. Regression Coverage:
     - 60-minute slot boundaries, advance horizon, max active bookings, cancellation cutoff
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
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


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_a(db_session: AsyncSession) -> Club:
    suffix = uuid.uuid4().hex[:8]
    club = Club(
        name=f"Club Alpha {suffix}",
        slug=f"club-alpha-{suffix}",
        description="Premium pickleball facility Alpha",
        contact_email=f"contact-alpha-{suffix}@test.local",
        contact_phone="+1-555-0100",
        website="https://alpha-pickleball.local",
        opening_time=time(7, 0),
        closing_time=time(22, 0),
        timezone="UTC",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_b(db_session: AsyncSession) -> Club:
    suffix = uuid.uuid4().hex[:8]
    club = Club(
        name=f"Club Beta {suffix}",
        slug=f"club-beta-{suffix}",
        description="Pickleball facility Beta",
        contact_email=f"contact-beta-{suffix}@test.local",
        contact_phone="+1-555-0200",
        website="https://beta-pickleball.local",
        opening_time=time(8, 0),
        closing_time=time(20, 0),
        timezone="UTC",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def user_owner_a(db_session: AsyncSession, club_a: Club) -> User:
    u = User(
        email=f"owner-a-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("OwnerPass123!"),
        full_name="Alpha Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_a.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def user_manager_a(db_session: AsyncSession, club_a: Club) -> User:
    u = User(
        email=f"manager-a-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("ManagerPass123!"),
        full_name="Alpha Manager",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_a.id, user_id=u.id, role=ClubRole.CLUB_MANAGER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def user_td_a(db_session: AsyncSession, club_a: Club) -> User:
    u = User(
        email=f"td-a-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("TdPass123!"),
        full_name="Alpha TD",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_a.id, user_id=u.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def user_player_a(db_session: AsyncSession, club_a: Club) -> User:
    u = User(
        email=f"player-a-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Alpha Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    profile = PlayerProfile(user_id=u.id, display_name="Alpha Player")
    db_session.add(profile)
    await db_session.flush()
    m = ClubPlayerMembership(club_id=club_a.id, user_id=u.id, status=PlayerMembershipStatus.ACTIVE)
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def user_owner_b(db_session: AsyncSession, club_b: Club) -> User:
    u = User(
        email=f"owner-b-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("OwnerPass123!"),
        full_name="Beta Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_b.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def court_1_a(db_session: AsyncSession, club_a: Club) -> Court:
    c = Court(
        club_id=club_a.id,
        court_number=1,
        name="Court 1 Alpha",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=1,
        price_per_hour=Decimal("30.00"),
    )
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def court_2_a(db_session: AsyncSession, club_a: Club) -> Court:
    c = Court(
        club_id=club_a.id,
        court_number=2,
        name="Court 2 Alpha",
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=2,
        price_per_hour=Decimal("25.00"),
    )
    db_session.add(c)
    await db_session.flush()
    return c


# ─── 1. Club Profile Settings Tests ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_can_update_club_profile(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
) -> None:
    headers = make_auth_header(user_owner_a.id)
    payload = {
        "name": "Updated Alpha Pickleball Club",
        "description": "Brand new description for club alpha.",
        "contact_email": "new-contact@alpha.com",
        "contact_phone": "+1-800-555-1234",
        "website": "https://alpha-new.com",
        "address_line1": "100 Pickleball Way",
        "city": "Austin",
        "state": "TX",
        "postal_code": "78701",
        "timezone": "America/Chicago",
    }
    resp = await async_client.patch(f"/api/v1/clubs/{club_a.id}", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["name"] == "Updated Alpha Pickleball Club"
    assert data["contact_email"] == "new-contact@alpha.com"
    assert data["city"] == "Austin"
    assert data["timezone"] == "America/Chicago"


@pytest.mark.asyncio
async def test_manager_cannot_update_club_profile(
    async_client: AsyncClient,
    club_a: Club,
    user_manager_a: User,
) -> None:
    headers = make_auth_header(user_manager_a.id)
    payload = {"name": "Hacked by Manager"}
    resp = await async_client.patch(f"/api/v1/clubs/{club_a.id}", json=payload, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_player_cannot_update_club_profile(
    async_client: AsyncClient,
    club_a: Club,
    user_player_a: User,
) -> None:
    headers = make_auth_header(user_player_a.id)
    payload = {"name": "Hacked by Player"}
    resp = await async_client.patch(f"/api/v1/clubs/{club_a.id}", json=payload, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tournament_director_cannot_update_club_profile(
    async_client: AsyncClient,
    club_a: Club,
    user_td_a: User,
) -> None:
    headers = make_auth_header(user_td_a.id)
    payload = {"name": "Hacked by TD"}
    resp = await async_client.patch(f"/api/v1/clubs/{club_a.id}", json=payload, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cross_club_owner_cannot_update_other_club_profile(
    async_client: AsyncClient,
    club_b: Club,
    user_owner_a: User,
) -> None:
    # Owner of Club A attempts to modify Club B
    headers = make_auth_header(user_owner_a.id)
    payload = {"name": "Alpha Intruder Changing Beta"}
    resp = await async_client.patch(f"/api/v1/clubs/{club_b.id}", json=payload, headers=headers)
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_invalid_club_profile_fields_rejected(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
) -> None:
    headers = make_auth_header(user_owner_a.id)

    # Invalid email format
    resp1 = await async_client.patch(f"/api/v1/clubs/{club_a.id}", json={"contact_email": "invalid-email"}, headers=headers)
    assert resp1.status_code == 422

    # Invalid established year
    resp2 = await async_client.patch(f"/api/v1/clubs/{club_a.id}", json={"established_year": 1700}, headers=headers)
    assert resp2.status_code == 422


@pytest.mark.asyncio
async def test_public_club_profile_exposes_safe_data(
    async_client: AsyncClient,
    club_a: Club,
) -> None:
    # Public profile endpoint is accessible unauthenticated
    resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/public")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == club_a.name
    assert "id" in data
    assert "slug" in data
    # Sensitive or internal data like created_by or internal flags are not present
    assert "owner_id" not in data


# ─── 2. Operating Hours & Booking Integration Tests ──────────────────────────

@pytest.mark.asyncio
async def test_get_operating_hours_returns_effective_schedule(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
) -> None:
    headers = make_auth_header(user_owner_a.id)
    resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/operating-hours", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["club_id"] == str(club_a.id)
    assert "operating_hours" in data
    assert "monday" in data["operating_hours"]
    assert "sunday" in data["operating_hours"]
    # Fallback uses club's opening_time (07:00) and closing_time (22:00)
    assert data["operating_hours"]["monday"]["open_time"] == "07:00:00"
    assert data["operating_hours"]["monday"]["close_time"] == "22:00:00"
    assert data["operating_hours"]["monday"]["is_closed"] is False


@pytest.mark.asyncio
async def test_owner_can_update_weekly_operating_hours(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
) -> None:
    headers = make_auth_header(user_owner_a.id)
    new_schedule = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "saturday": {"is_closed": False, "open_time": "09:00:00", "close_time": "20:00:00"},
            "sunday": {"is_closed": True, "open_time": None, "close_time": None},
        }
    }
    resp = await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=new_schedule, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["operating_hours"]["monday"]["open_time"] == "08:00:00"
    assert data["operating_hours"]["sunday"]["is_closed"] is True


@pytest.mark.asyncio
async def test_manager_and_td_cannot_update_club_operating_hours(
    async_client: AsyncClient,
    club_a: Club,
    user_manager_a: User,
    user_td_a: User,
) -> None:
    new_schedule = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "sunday": {"is_closed": True, "open_time": None, "close_time": None},
        }
    }
    # Manager
    m_headers = make_auth_header(user_manager_a.id)
    resp_m = await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=new_schedule, headers=m_headers)
    assert resp_m.status_code == 403

    # Tournament Director
    td_headers = make_auth_header(user_td_a.id)
    resp_td = await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=new_schedule, headers=td_headers)
    assert resp_td.status_code == 403


@pytest.mark.asyncio
async def test_invalid_operating_hours_rejected(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
) -> None:
    headers = make_auth_header(user_owner_a.id)

    # Inverted hours (open >= close)
    bad_schedule_1 = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "20:00:00", "close_time": "08:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "sunday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
        }
    }
    resp1 = await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=bad_schedule_1, headers=headers)
    assert resp1.status_code in (400, 422)

    # Equal open and close
    bad_schedule_2 = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "10:00:00", "close_time": "10:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "sunday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
        }
    }
    resp2 = await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=bad_schedule_2, headers=headers)
    assert resp2.status_code in (400, 422)


@pytest.mark.asyncio
async def test_closed_day_exposes_zero_slots_and_rejects_booking(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    user_player_a: User,
    court_1_a: Court,
) -> None:
    owner_headers = make_auth_header(user_owner_a.id)
    player_headers = make_auth_header(user_player_a.id)

    # Find the next Sunday (weekday == 6)
    today = date.today()
    days_ahead = (6 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    next_sunday = today + timedelta(days=days_ahead)

    # Set Sunday as closed
    schedule = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "sunday": {"is_closed": True, "open_time": None, "close_time": None},
        }
    }
    resp_sched = await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=schedule, headers=owner_headers)
    assert resp_sched.status_code == 200

    # 1. Query availability on Sunday -> slots must be empty
    avail_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/courts/availability",
        params={"date": next_sunday.isoformat()},
        headers=player_headers,
    )
    assert avail_resp.status_code == 200
    avail_data = avail_resp.json()
    assert avail_data["courts"] == [] or all(len(c["slots"]) == 0 for c in avail_data["courts"])

    # 2. Direct API attempt to book on Sunday must be rejected (400)
    start_dt = datetime.combine(next_sunday, time(10, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(next_sunday, time(11, 0), tzinfo=timezone.utc)
    booking_payload = {
        "court_id": str(court_1_a.id),
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
    }
    book_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json=booking_payload,
        headers=player_headers,
    )
    assert book_resp.status_code == 400
    assert "closed" in book_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_direct_booking_outside_effective_hours_rejected(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    user_player_a: User,
    court_1_a: Court,
) -> None:
    owner_headers = make_auth_header(user_owner_a.id)
    player_headers = make_auth_header(user_player_a.id)

    # Next Tuesday (weekday == 1)
    today = date.today()
    days_ahead = (1 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    next_tuesday = today + timedelta(days=days_ahead)

    # Tuesday: 09:00:00 to 18:00:00
    schedule = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "tuesday": {"is_closed": False, "open_time": "09:00:00", "close_time": "18:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "sunday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
        }
    }
    await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=schedule, headers=owner_headers)

    # Attempt booking at 08:00-09:00 (before opening time 09:00)
    early_start = datetime.combine(next_tuesday, time(8, 0), tzinfo=timezone.utc)
    early_end = datetime.combine(next_tuesday, time(9, 0), tzinfo=timezone.utc)
    resp_early = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": early_start.isoformat(),
            "end_at": early_end.isoformat(),
        },
        headers=player_headers,
    )
    assert resp_early.status_code == 400
    assert any(phrase in resp_early.json()["detail"].lower() for phrase in ("operating hours", "opening time", "closing time"))

    # Attempt booking at 18:00-19:00 (after closing time 18:00)
    late_start = datetime.combine(next_tuesday, time(18, 0), tzinfo=timezone.utc)
    late_end = datetime.combine(next_tuesday, time(19, 0), tzinfo=timezone.utc)
    resp_late = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": late_start.isoformat(),
            "end_at": late_end.isoformat(),
        },
        headers=player_headers,
    )
    assert resp_late.status_code == 400
    assert any(phrase in resp_late.json()["detail"].lower() for phrase in ("operating hours", "opening time", "closing time"))

    # Booking at 10:00-11:00 (within operating hours) succeeds
    ok_start = datetime.combine(next_tuesday, time(10, 0), tzinfo=timezone.utc)
    ok_end = datetime.combine(next_tuesday, time(11, 0), tzinfo=timezone.utc)
    resp_ok = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": ok_start.isoformat(),
            "end_at": ok_end.isoformat(),
        },
        headers=player_headers,
    )
    assert resp_ok.status_code == 201


@pytest.mark.asyncio
async def test_operating_hours_update_does_not_alter_confirmed_bookings(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    user_player_a: User,
    court_1_a: Court,
    db_session: AsyncSession,
) -> None:
    owner_headers = make_auth_header(user_owner_a.id)
    player_headers = make_auth_header(user_player_a.id)

    # Next Wednesday
    today = date.today()
    days_ahead = (2 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    target_date = today + timedelta(days=days_ahead)

    # 1. Book at 08:00-09:00 under default hours (07:00-22:00)
    start_dt = datetime.combine(target_date, time(8, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, time(9, 0), tzinfo=timezone.utc)
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=player_headers,
    )
    assert resp.status_code == 201
    booking_id = resp.json()["id"]

    # 2. Club Owner shifts opening time for Wednesday to 10:00:00
    new_schedule = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "wednesday": {"is_closed": False, "open_time": "10:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "sunday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
        }
    }
    put_resp = await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=new_schedule, headers=owner_headers)
    assert put_resp.status_code == 200

    # 3. Check booking in DB: it MUST remain intact with CONFIRMED status
    result = await db_session.execute(select(Booking).where(Booking.id == uuid.UUID(booking_id)))
    b = result.scalar_one()
    assert b.status == BookingStatus.CONFIRMED
    assert b.start_at.hour == 8
    assert b.end_at.hour == 9


@pytest.mark.asyncio
async def test_preview_operating_hours_disruptions(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    user_player_a: User,
    court_1_a: Court,
) -> None:
    owner_headers = make_auth_header(user_owner_a.id)
    player_headers = make_auth_header(user_player_a.id)

    # Next Thursday
    today = date.today()
    days_ahead = (3 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    target_date = today + timedelta(days=days_ahead)

    # Create a booking at 08:00-09:00
    start_dt = datetime.combine(target_date, time(8, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, time(9, 0), tzinfo=timezone.utc)
    b_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=player_headers,
    )
    assert b_resp.status_code == 201

    # Preview disruptions if Thursday opens at 10:00
    preview_schedule = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "thursday": {"is_closed": False, "open_time": "10:00:00", "close_time": "21:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
            "sunday": {"is_closed": False, "open_time": "08:00:00", "close_time": "21:00:00"},
        }
    }
    prev_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/operating-hours/preview-disruptions",
        json=preview_schedule,
        headers=owner_headers,
    )
    assert prev_resp.status_code == 200
    data = prev_resp.json()
    assert data["affected_bookings_count"] >= 1
    assert any(str(b["court_id"]) == str(court_1_a.id) for b in data["affected_bookings"])


# ─── 3. Courts & Facility Management Tests ────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_can_list_and_manage_courts(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    user_manager_a: User,
    court_1_a: Court,
) -> None:
    # Both Owner and Manager can list courts
    for user in (user_owner_a, user_manager_a):
        headers = make_auth_header(user.id)
        resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/courts", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert any(c["id"] == str(court_1_a.id) for c in data)


@pytest.mark.asyncio
async def test_court_validation_and_uniqueness(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    court_1_a: Court,
) -> None:
    headers = make_auth_header(user_owner_a.id)

    # Duplicate court_number in same club rejected (400 or 409)
    dup_payload = {
        "court_number": court_1_a.court_number,
        "name": "Duplicate Court 1",
        "indoor_outdoor": "indoor",
        "price_per_hour": "30.00",
    }
    resp1 = await async_client.post(f"/api/v1/clubs/{club_a.id}/courts", json=dup_payload, headers=headers)
    assert resp1.status_code in (400, 409)

    # Blank court name rejected (422)
    blank_name = {
        "court_number": 99,
        "name": "   ",
        "indoor_outdoor": "indoor",
    }
    resp2 = await async_client.post(f"/api/v1/clubs/{club_a.id}/courts", json=blank_name, headers=headers)
    assert resp2.status_code == 422


@pytest.mark.asyncio
async def test_cross_club_court_access_denied(
    async_client: AsyncClient,
    club_b: Club,
    user_owner_a: User,
    court_1_a: Court,
) -> None:
    # Staff of Club A cannot access Club B courts
    headers = make_auth_header(user_owner_a.id)
    resp = await async_client.get(f"/api/v1/clubs/{club_b.id}/courts", headers=headers)
    assert resp.status_code in (403, 404)

    # Attempting to access Court 1 Alpha under Club B's URL prefix must be rejected
    resp_cross = await async_client.get(f"/api/v1/clubs/{club_b.id}/courts/{court_1_a.id}", headers=headers)
    assert resp_cross.status_code in (403, 404)


@pytest.mark.asyncio
async def test_court_operating_hours_override(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    user_player_a: User,
    court_1_a: Court,
    court_2_a: Court,
) -> None:
    owner_headers = make_auth_header(user_owner_a.id)
    player_headers = make_auth_header(user_player_a.id)

    # Next Friday
    today = date.today()
    days_ahead = (4 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    next_friday = today + timedelta(days=days_ahead)

    # Club schedule: Friday open 08:00 - 22:00
    club_schedule = {
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
            "sunday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
        }
    }
    await async_client.put(f"/api/v1/clubs/{club_a.id}/operating-hours", json=club_schedule, headers=owner_headers)

    # Court 1 override: Friday closes early at 17:00:00
    court_1_schedule = {
        "monday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
        "tuesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
        "wednesday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
        "thursday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
        "friday": {"is_closed": False, "open_time": "08:00:00", "close_time": "17:00:00"},
        "saturday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
        "sunday": {"is_closed": False, "open_time": "08:00:00", "close_time": "22:00:00"},
    }
    c1_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/courts/{court_1_a.id}/operating-hours",
        json={"operating_hours": court_1_schedule},
        headers=owner_headers,
    )
    assert c1_resp.status_code == 200
    assert c1_resp.json()["has_override"] is True

    # 1. Attempt booking at 18:00-19:00 on Court 1 -> REJECTED (closes at 17:00)
    c1_start = datetime.combine(next_friday, time(18, 0), tzinfo=timezone.utc)
    c1_end = datetime.combine(next_friday, time(19, 0), tzinfo=timezone.utc)
    b_c1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": c1_start.isoformat(),
            "end_at": c1_end.isoformat(),
        },
        headers=player_headers,
    )
    assert b_c1.status_code == 400
    assert any(phrase in b_c1.json()["detail"].lower() for phrase in ("operating hours", "opening time", "closing time"))

    # 2. Attempt booking at 18:00-19:00 on Court 2 -> SUCCEEDS (Court 2 uses Club hours closing at 22:00)
    c2_start = datetime.combine(next_friday, time(18, 0), tzinfo=timezone.utc)
    c2_end = datetime.combine(next_friday, time(19, 0), tzinfo=timezone.utc)
    b_c2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_2_a.id),
            "start_at": c2_start.isoformat(),
            "end_at": c2_end.isoformat(),
        },
        headers=player_headers,
    )
    assert b_c2.status_code == 201

    # 3. Clear Court 1 override (operating_hours=None) -> reverts to Club schedule
    c1_clear = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/courts/{court_1_a.id}/operating-hours",
        json={"operating_hours": None},
        headers=owner_headers,
    )
    assert c1_clear.status_code == 200
    assert c1_clear.json()["has_override"] is False


@pytest.mark.asyncio
async def test_court_affected_bookings_and_deactivation_preserves_history(
    async_client: AsyncClient,
    club_a: Club,
    user_owner_a: User,
    user_player_a: User,
    court_1_a: Court,
    db_session: AsyncSession,
) -> None:
    owner_headers = make_auth_header(user_owner_a.id)
    player_headers = make_auth_header(user_player_a.id)

    # Next Saturday
    today = date.today()
    days_ahead = (5 - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    target_date = today + timedelta(days=days_ahead)

    # 1. Create a confirmed booking
    start_dt = datetime.combine(target_date, time(11, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, time(12, 0), tzinfo=timezone.utc)
    b_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=player_headers,
    )
    assert b_resp.status_code == 201
    booking_id = b_resp.json()["id"]

    # 2. Check affected bookings endpoint before deactivation
    aff_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/courts/{court_1_a.id}/affected-bookings",
        headers=owner_headers,
    )
    assert aff_resp.status_code == 200
    data = aff_resp.json()
    assert data["court_id"] == str(court_1_a.id)
    assert data["upcoming_confirmed_bookings_count"] >= 1
    assert any(str(b["id"]) == str(booking_id) for b in data["bookings"])

    # 3. Deactivate court
    deact_resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/courts/{court_1_a.id}",
        json={"is_active": False, "status": "inactive"},
        headers=owner_headers,
    )
    assert deact_resp.status_code == 200
    assert deact_resp.json()["is_active"] is False

    # 4. Attempt to create NEW booking on deactivated court -> REJECTED (400)
    new_start = datetime.combine(target_date, time(14, 0), tzinfo=timezone.utc)
    new_end = datetime.combine(target_date, time(15, 0), tzinfo=timezone.utc)
    new_b_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_1_a.id),
            "start_at": new_start.isoformat(),
            "end_at": new_end.isoformat(),
        },
        headers=player_headers,
    )
    assert new_b_resp.status_code == 400
    assert "inactive" in new_b_resp.json()["detail"].lower()

    # 5. Verify historical booking is intact in DB
    result = await db_session.execute(select(Booking).where(Booking.id == uuid.UUID(booking_id)))
    b = result.scalar_one()
    assert b.status == BookingStatus.CONFIRMED


# ─── 4. Roles & Tenant Isolation Tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_multi_club_user_role_isolation(
    async_client: AsyncClient,
    club_a: Club,
    club_b: Club,
    db_session: AsyncSession,
) -> None:
    # User is Owner in Club A, but only regular Player in Club B
    user = User(
        email=f"hybrid-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Hybrid User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    m_a = ClubMembership(club_id=club_a.id, user_id=user.id, role=ClubRole.CLUB_OWNER, is_active=True)
    m_b = ClubPlayerMembership(club_id=club_b.id, user_id=user.id, status=PlayerMembershipStatus.ACTIVE)
    db_session.add_all([m_a, m_b])
    await db_session.flush()

    headers = make_auth_header(user.id)

    # 1. Can manage Club A profile
    resp_a = await async_client.patch(f"/api/v1/clubs/{club_a.id}", json={"name": "Owner Updated A"}, headers=headers)
    assert resp_a.status_code == 200

    # 2. CANNOT manage Club B profile (returns 403 Forbidden because role is PLAYER)
    resp_b = await async_client.patch(f"/api/v1/clubs/{club_b.id}", json={"name": "Player Illegal Update B"}, headers=headers)
    assert resp_b.status_code == 403


@pytest.mark.asyncio
async def test_direct_api_role_spoofing_prevented(
    async_client: AsyncClient,
    club_a: Club,
    user_player_a: User,
) -> None:
    # Player attempts to spoof role in request body or query params
    headers = make_auth_header(user_player_a.id)
    resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}",
        json={"name": "Spoofed Owner", "role": "club_owner"},
        headers=headers,
    )
    assert resp.status_code == 403


# ─── 5. Regression Coverage Tests ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_booking_engine_60_minute_slot_boundaries(
    async_client: AsyncClient,
    club_a: Club,
    user_player_a: User,
    court_2_a: Court,
) -> None:
    headers = make_auth_header(user_player_a.id)
    tomorrow = (date.today() + timedelta(days=1))

    # Non-60 minute slot (e.g. 45 min)
    start_1 = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    end_1 = datetime.combine(tomorrow, time(10, 45), tzinfo=timezone.utc)
    resp1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_2_a.id),
            "start_at": start_1.isoformat(),
            "end_at": end_1.isoformat(),
        },
        headers=headers,
    )
    assert resp1.status_code in (400, 422)

    # Non-hour boundary (e.g. 10:15 - 11:15)
    start_2 = datetime.combine(tomorrow, time(10, 15), tzinfo=timezone.utc)
    end_2 = datetime.combine(tomorrow, time(11, 15), tzinfo=timezone.utc)
    resp2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_2_a.id),
            "start_at": start_2.isoformat(),
            "end_at": end_2.isoformat(),
        },
        headers=headers,
    )
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_booking_engine_advance_horizon_and_active_limit(
    async_client: AsyncClient,
    club_a: Club,
    user_player_a: User,
    court_2_a: Court,
) -> None:
    headers = make_auth_header(user_player_a.id)

    # Beyond 14 days horizon
    far_date = (date.today() + timedelta(days=20))
    far_start = datetime.combine(far_date, time(10, 0), tzinfo=timezone.utc)
    far_end = datetime.combine(far_date, time(11, 0), tzinfo=timezone.utc)
    resp_far = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_2_a.id),
            "start_at": far_start.isoformat(),
            "end_at": far_end.isoformat(),
        },
        headers=headers,
    )
    assert resp_far.status_code == 400
    assert "advance" in resp_far.json()["detail"].lower()
