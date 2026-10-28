"""
Aught2 Pickleball — Court Operating Hours & Time Validation API Tests

Verifies that court creation and updates reliably handle:
- Standard 24h "HH:mm" time strings (e.g. "06:00", "22:00")
- 3-part "HH:mm:ss" time strings (e.g. "06:00:00", "22:00:00")
- Rejection of invalid inverted/overnight hours
- Rejection of equal opening and closing times
- Midnight closing boundary handling
- Weekly operating hours persistence and availability slot generation
"""
from __future__ import annotations

import uuid
from datetime import date, time
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.user import User
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test Owner",
) -> User:
    email = email or f"owner_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_club(db: AsyncSession, name: str = "Time Validation Club") -> Club:
    slug = f"club-{uuid.uuid4().hex[:6]}"
    club = Club(
        name=name,
        slug=slug,
        is_active=True,
        timezone="UTC",
    )
    db.add(club)
    await db.flush()
    return club


async def create_membership(
    db: AsyncSession,
    user: User,
    club: Club,
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


@pytest.mark.asyncio
async def test_create_court_with_canonical_24h_times(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Court created with 24h '06:00' and '22:00' succeeds and saves properly."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "name": "Court Canonical Time",
        "opening_time": "06:00",
        "closing_time": "22:00",
        "price_per_hour": 35.00,
        "booking_interval_minutes": 60,
    }

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["name"] == "Court Canonical Time"
    assert data["operating_hours"] is not None
    # Operating hours must contain all 7 days open from 06:00:00 to 22:00:00
    mon = data["operating_hours"]["monday"]
    assert mon["is_closed"] is False
    assert mon["open_time"].startswith("06:00")
    assert mon["close_time"].startswith("22:00")


@pytest.mark.asyncio
async def test_create_court_with_three_part_seconds_times(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Court created with '06:00:00' and '22:00:00' succeeds seamlessly."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "name": "Court Seconds Time",
        "opening_time": "06:00:00",
        "closing_time": "22:00:00",
    }

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["operating_hours"] is not None


@pytest.mark.asyncio
async def test_create_court_inverted_overnight_hours_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Opening time later than closing time (e.g. 22:00 to 06:00) must be rejected."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "name": "Court Inverted Hours",
        "opening_time": "22:00",
        "closing_time": "06:00",
    }

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 422, "Inverted operating hours must trigger 422 Unprocessable Entity"
    assert "strictly earlier than closing time" in resp.text


@pytest.mark.asyncio
async def test_create_court_equal_times_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Opening time equal to closing time (e.g. 06:00 to 06:00) must be rejected."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "name": "Court Equal Hours",
        "opening_time": "06:00",
        "closing_time": "06:00",
    }

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 422
    assert "strictly earlier than closing time" in resp.text


@pytest.mark.asyncio
async def test_update_court_opening_and_closing_times_independently(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Owner can update opening time, closing time, or weekly hours independently."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    # 1. Create court
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json={
            "name": "Court Modifiable",
            "opening_time": "06:00",
            "closing_time": "22:00",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    court_id = create_resp.json()["id"]

    # 2. Update operating hours via weekly schedule map
    new_hours = {
        day: {
            "is_closed": day in ["sunday"],
            "open_time": "07:30",
            "close_time": "21:30",
        }
        for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    }

    patch_resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court_id}",
        json={"operating_hours": new_hours},
        headers=headers,
    )
    assert patch_resp.status_code == 200, patch_resp.text
    updated = patch_resp.json()
    assert updated["operating_hours"]["sunday"]["is_closed"] is True
    assert updated["operating_hours"]["monday"]["is_closed"] is False
    assert updated["operating_hours"]["monday"]["open_time"].startswith("07:30")
    assert updated["operating_hours"]["monday"]["close_time"].startswith("21:30")

    # Verify fresh from DB
    db_session.expire_all()
    fresh_court = (await db_session.execute(select(Court).where(Court.id == uuid.UUID(court_id)))).scalar_one()
    print("FRESH COURT IN DB OPERATING HOURS:", fresh_court.operating_hours)
    assert fresh_court.operating_hours["monday"]["open_time"].startswith("07:30")


@pytest.mark.asyncio
async def test_exact_frontend_edit_court_payload(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Sends the exact full payload generated by the frontend Edit Court form."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)

    # 1. Create an existing court
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json={
            "name": "court 1",
            "court_number": 1,
            "opening_time": "06:00",
            "closing_time": "22:00",
            "price_per_hour": 30.00,
            "surface_type": "Acrylic",
            "indoor_outdoor": "indoor",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    court_id = create_resp.json()["id"]

    # 2. Send the exact payload from courts.tsx performCourtUpdate
    exact_frontend_payload = {
        "name": "court 1",
        "display_name": None,
        "court_number": 1,
        "indoor_outdoor": "indoor",
        "surface_type": "Acrylic",
        "description": None,
        "price_per_hour": None,
        "photo_url": None,
        "booking_interval_minutes": 60,
        "operating_hours": {
            "monday": {"is_closed": False, "open_time": "06:00", "close_time": "22:00"},
            "tuesday": {"is_closed": False, "open_time": "06:00", "close_time": "22:00"},
            "wednesday": {"is_closed": False, "open_time": "06:00", "close_time": "22:00"},
            "thursday": {"is_closed": False, "open_time": "06:00", "close_time": "22:00"},
            "friday": {"is_closed": False, "open_time": "06:00", "close_time": "22:00"},
            "saturday": {"is_closed": False, "open_time": "06:00", "close_time": "22:00"},
            "sunday": {"is_closed": False, "open_time": "06:00", "close_time": "22:00"},
        },
        "opening_time": "06:00",
        "closing_time": "22:00",
    }

    patch_resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court_id}",
        json=exact_frontend_payload,
        headers=headers,
    )
    assert patch_resp.status_code == 200, f"Expected 200, got {patch_resp.status_code}: {patch_resp.text}"
    data = patch_resp.json()
    assert data["name"] == "court 1"
    assert data["court_number"] == 1
    assert data["operating_hours"]["monday"]["open_time"].startswith("06:00")


@pytest.mark.asyncio
async def test_courts_with_different_operating_timings_availability(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Court 1 has timings from 10:00, Court 2 from 07:00. Verify availability slots returned."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)

    # Court 1: 10:00 to 22:00
    c1_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json={
            "name": "Court 1",
            "court_number": 1,
            "opening_time": "10:00",
            "closing_time": "22:00",
        },
        headers=headers,
    )
    assert c1_resp.status_code == 201

    # Court 2: 07:00 to 22:00
    c2_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json={
            "name": "Court 2",
            "court_number": 2,
            "opening_time": "07:00",
            "closing_time": "22:00",
        },
        headers=headers,
    )
    assert c2_resp.status_code == 201

    target_date = "2026-10-28"  # Wednesday
    avail_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/availability?date={target_date}&duration=60",
        headers=headers,
    )
    assert avail_resp.status_code == 200
    data = avail_resp.json()
    courts = data["courts"]
    assert len(courts) == 2

    c1 = next(c for c in courts if c["court_name"] == "Court 1")
    c2 = next(c for c in courts if c["court_name"] == "Court 2")

    print("\n--- C1 SLOTS ---")
    for s in c1["slots"]:
        print("C1 slot:", s["start_at"])

    print("\n--- C2 SLOTS ---")
    for s in c2["slots"]:
        print("C2 slot:", s["start_at"])

    assert len(c1["slots"]) == 12  # 10:00 to 22:00 = 12 hours
    assert len(c2["slots"]) == 15  # 07:00 to 22:00 = 15 hours


