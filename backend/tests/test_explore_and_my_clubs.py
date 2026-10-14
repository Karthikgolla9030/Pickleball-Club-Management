"""
Unit and integration tests for Explore Clubs, My Clubs, and Logo Synchronization.
Uses the project test fixtures (SQLite in-memory, async_client, db_session, make_auth_header).
"""
import uuid
from datetime import datetime, time, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtStatus
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_explore_clubs_discovery_and_search(async_client: AsyncClient, db_session: AsyncSession):
    # Setup test club with courts and player memberships
    club = Club(
        name="Aught2 Test Club",
        slug="aught2-test-club",
        city="Austin",
        state="TX",
        operating_days="Monday - Sunday",
        opening_time=time(6, 0),
        closing_time=time(22, 0),
        timezone="UTC",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    # Add 2 courts
    for i in range(2):
        court = Court(
            club_id=club.id,
            name=f"Court {i + 1}",
            status=CourtStatus.ACTIVE,
        )
        db_session.add(court)

    # Add 3 active player members
    for i in range(3):
        u = User(
            email=f"member_{i}_{uuid.uuid4().hex[:6]}@test.local",
            hashed_password="pw",
            is_active=True,
        )
        db_session.add(u)
        await db_session.flush()
        pm = ClubPlayerMembership(
            club_id=club.id,
            user_id=u.id,
            membership_number=f"AUG-{i+1:03d}",
            status=PlayerMembershipStatus.ACTIVE,
            joined_at=datetime.now(timezone.utc),
        )
        db_session.add(pm)

    await db_session.commit()

    # 1. Discover public clubs
    resp = await async_client.get("/api/v1/clubs/public")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    found = next((c for c in data["items"] if c["id"] == str(club.id)), None)
    assert found is not None
    assert found["court_count"] == 2
    assert found["member_count"] == 3
    assert found["operating_days"] == "Monday - Sunday"

    # 2. Search by name
    resp_name = await async_client.get("/api/v1/clubs/public?search=Aught2")
    assert resp_name.status_code == 200
    assert any(c["id"] == str(club.id) for c in resp_name.json()["items"])

    # 3. Search by city
    resp_city = await async_client.get("/api/v1/clubs/public?city=Austin")
    assert resp_city.status_code == 200
    assert any(c["id"] == str(club.id) for c in resp_city.json()["items"])

    # 4. Search by state
    resp_state = await async_client.get("/api/v1/clubs/public?state=TX")
    assert resp_state.status_code == 200
    assert any(c["id"] == str(club.id) for c in resp_state.json()["items"])

    # 5. Non-matching search returns 0
    resp_none = await async_client.get("/api/v1/clubs/public?search=NonExistent999")
    assert resp_none.status_code == 200
    assert resp_none.json()["total"] == 0


@pytest.mark.asyncio
async def test_my_clubs_player_memberships(async_client: AsyncClient, db_session: AsyncSession):
    # Create player user
    player = User(
        email=f"player_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password="pw",
        is_active=True,
    )
    db_session.add(player)
    await db_session.flush()

    # Create club
    club = Club(
        name="Green Valley Club",
        slug="green-valley-club",
        city="Nellore",
        state="AP",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    # Enroll player
    pm = ClubPlayerMembership(
        club_id=club.id,
        user_id=player.id,
        membership_number="GVPC-034",
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime(2026, 8, 15, tzinfo=timezone.utc),
    )
    db_session.add(pm)
    await db_session.commit()

    headers = make_auth_header(player.id)

    # Fetch player's enrolled clubs
    resp = await async_client.get("/api/v1/player/clubs", headers=headers)
    assert resp.status_code == 200
    clubs = resp.json()
    assert len(clubs) == 1
    enrolled = clubs[0]
    assert enrolled["club_id"] == str(club.id)
    assert enrolled["club_name"] == "Green Valley Club"
    assert enrolled["city"] == "Nellore"
    assert enrolled["state"] == "AP"
    assert enrolled["membership_number"] == "GVPC-034"
    assert enrolled["status"] == "active"
    assert "2026-08-15" in enrolled["joined_at"]


@pytest.mark.asyncio
async def test_owner_logo_synchronization_across_views(async_client: AsyncClient, db_session: AsyncSession):
    # Create Owner and Player
    owner = User(
        email=f"owner_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password="pw",
        is_active=True,
    )
    player = User(
        email=f"player_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password="pw",
        is_active=True,
    )
    db_session.add_all([owner, player])
    await db_session.flush()

    # Create club
    club = Club(
        name="Sunrise Pickleball Academy",
        slug="sunrise-pickleball-academy",
        city="Tirupati",
        state="AP",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    # Assign owner membership
    owner_mem = ClubMembership(
        club_id=club.id,
        user_id=owner.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    # Assign player membership
    player_mem = ClubPlayerMembership(
        club_id=club.id,
        user_id=player.id,
        membership_number="SPA-100",
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add_all([owner_mem, player_mem])
    await db_session.commit()

    owner_headers = make_auth_header(owner.id)
    player_headers = make_auth_header(player.id)

    new_logo_url = "/uploads/logos/sunrise_academy_logo_test.png"

    # Step 1: Owner updates club branding
    update_resp = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        json={"logo_url": new_logo_url},
        headers=owner_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["logo_url"] == new_logo_url

    # Step 2: Public Club Profile displays the updated logo
    profile_resp = await async_client.get(f"/api/v1/clubs/{club.id}/public")
    assert profile_resp.status_code == 200
    assert profile_resp.json()["logo_url"] == new_logo_url

    # Step 3: Explore Clubs displays the updated logo
    explore_resp = await async_client.get("/api/v1/clubs/public")
    assert explore_resp.status_code == 200
    items = explore_resp.json()["items"]
    target = next((c for c in items if c["id"] == str(club.id)), None)
    assert target is not None
    assert target["logo_url"] == new_logo_url

    # Step 4: Player's My Clubs displays the updated logo
    my_clubs_resp = await async_client.get("/api/v1/player/clubs", headers=player_headers)
    assert my_clubs_resp.status_code == 200
    enrolled_clubs = my_clubs_resp.json()
    enrolled_target = next((c for c in enrolled_clubs if c["club_id"] == str(club.id)), None)
    assert enrolled_target is not None
    assert enrolled_target["logo_url"] == new_logo_url
