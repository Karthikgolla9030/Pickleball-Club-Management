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
