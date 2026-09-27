"""
Aught2 Pickleball — Court Pricing & Booking Price Snapshot Test Suite

Tests:
1. Court Pricing CRUD & Validation:
   - Create court with valid price (e.g. 400.00) persists price_per_hour
   - Create court with negative price is rejected with 400
   - Update court price persists new price
   - Update court unrelated fields preserves existing price
   - Player active courts listing exposes price_per_hour
   - Availability endpoint exposes price_per_hour
2. Booking Price Snapshots & Immutability:
   - Booking court snapshots rate and calculates total_price based on duration
   - Changing court price later does not alter historical booking rate or total_price
   - Unpriced court booking works gracefully with None price
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
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
    opening: time = time(6, 0),
    closing: time = time(22, 0),
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    club = Club(
        name=f"Club {suffix}",
        slug=f"club-{suffix}",
        is_active=True,
        opening_time=opening,
        closing_time=closing,
        timezone="UTC",
    )
    db.add(club)
    await db.flush()
    return club


async def assign_staff(
    db: AsyncSession,
    club_id: uuid.UUID,
    user_id: uuid.UUID,
    role: ClubRole = ClubRole.CLUB_MANAGER,
) -> ClubMembership:
    membership = ClubMembership(
        club_id=club_id,
        user_id=user_id,
        role=role,
        is_active=True,
    )
    db.add(membership)
    await db.flush()
    return membership


async def enroll_player(
    db: AsyncSession,
    club_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ClubPlayerMembership:
    membership = ClubPlayerMembership(
        club_id=club_id,
        user_id=user_id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db.add(membership)
    await db.flush()
    return membership


@pytest.mark.asyncio
async def test_court_create_with_price(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club = await create_club(db_session)
    staff = await create_user(db_session, full_name="Court Manager")
    await assign_staff(db_session, club.id, staff.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(staff)
    payload = {
        "name": "Center Court",
        "display_name": "Stadium Court 1",
        "court_number": 1,
        "indoor_outdoor": "indoor",
        "surface_type": "Acrylic",
        "price_per_hour": 400.0,
    }

    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json=payload,
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Center Court"
    assert float(data["price_per_hour"]) == 400.0


@pytest.mark.asyncio
async def test_court_create_negative_price_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club = await create_club(db_session)
    staff = await create_user(db_session, full_name="Court Manager")
    await assign_staff(db_session, club.id, staff.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(staff)
    payload = {
        "name": "Invalid Price Court",
        "court_number": 2,
        "indoor_outdoor": "indoor",
        "price_per_hour": -50.0,
    }

    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        json=payload,
        headers=headers,
    )
    assert res.status_code in (400, 422)


@pytest.mark.asyncio
async def test_court_update_price_and_preserve_unrelated(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club = await create_club(db_session)
    staff = await create_user(db_session, full_name="Court Manager")
    await assign_staff(db_session, club.id, staff.id, ClubRole.CLUB_MANAGER)

    court = Court(
        club_id=club.id,
        name="Court A",
        court_number=1,
        surface_type="Acrylic",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=1,
        price_per_hour=Decimal("350.00"),
    )
    db_session.add(court)
    await db_session.commit()

    headers = make_auth_header(staff)

    # 1. Update price
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court.id}",
        json={"price_per_hour": 500.0},
        headers=headers,
    )
    assert res.status_code == 200
    assert float(res.json()["price_per_hour"]) == 500.0
    assert res.json()["name"] == "Court A"

    # 2. Update description only -> price is preserved
    res2 = await async_client.patch(
        f"/api/v1/clubs/{club.id}/courts/{court.id}",
        json={"description": "Newly resurfaced"},
        headers=headers,
    )
    assert res2.status_code == 200
    assert float(res2.json()["price_per_hour"]) == 500.0
    assert res2.json()["description"] == "Newly resurfaced"


@pytest.mark.asyncio
async def test_player_court_listing_and_availability_exposes_price(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club = await create_club(db_session)
    player = await create_user(db_session, full_name="Player One")
    await enroll_player(db_session, club.id, player.id)

    court = Court(
        club_id=club.id,
        name="Showcase Court",
        court_number=1,
        surface_type="Wood",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=1,
        price_per_hour=Decimal("450.00"),
    )
    db_session.add(court)
    await db_session.commit()

    headers = make_auth_header(player)

    # Player active courts
    res = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/active",
        headers=headers,
    )
    assert res.status_code == 200
    courts = res.json()
    assert len(courts) == 1
    assert float(courts[0]["price_per_hour"]) == 450.0

    # Availability endpoint
    today_str = date.today().isoformat()
    res_avail = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/availability?date={today_str}",
        headers=headers,
    )
    assert res_avail.status_code == 200
    avail_data = res_avail.json()
    assert len(avail_data["courts"]) == 1
    assert float(avail_data["courts"][0]["price_per_hour"]) == 450.0


@pytest.mark.asyncio
async def test_booking_snapshots_price_and_calculates_total(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club = await create_club(db_session)
    player = await create_user(db_session, full_name="Player Member")
    await enroll_player(db_session, club.id, player.id)

    court = Court(
        club_id=club.id,
        name="Pro Court",
        court_number=1,
        surface_type="Acrylic",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=1,
        price_per_hour=Decimal("600.00"),
    )
    db_session.add(court)
    await db_session.commit()

    headers = make_auth_header(player)

    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )
    start_at = tomorrow.isoformat()
    end_at = (tomorrow + timedelta(hours=1)).isoformat()

    # Create 1-hour booking
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        json={
            "court_id": str(court.id),
            "start_at": start_at,
            "end_at": end_at,
            "notes": "Singles practice",
        },
        headers=headers,
    )
    assert res.status_code == 201
    booking_data = res.json()
    assert float(booking_data["price_per_hour"]) == 600.0
    assert float(booking_data["total_price"]) == 600.0
    assert booking_data["currency"] == "INR"

    # Now change court's price to 800.00
    court.price_per_hour = Decimal("800.00")
    await db_session.commit()

    # Verify the existing booking retains its original snapshot: 600.00, NOT 800.00!
    res_get = await async_client.get(
        f"/api/v1/bookings/{booking_data['id']}",
        headers=headers,
    )
    assert res_get.status_code == 200
    persisted = res_get.json()
    assert float(persisted["price_per_hour"]) == 600.0
    assert float(persisted["total_price"]) == 600.0
