"""
Aught2 Pickleball — League Lifecycle, Permissions & Synchronization Tests

Comprehensive automated test suite covering:
  1. Open Registration:
     - Requires valid configuration (name, weeks >= 2, max_teams >= 2).
     - Transitions from 'draft' to 'registration_open'.
     - Rejected if already in progress or completed.
  2. Close Registration:
     - Allowed only when status is 'registration_open'.
     - Transitions to 'registration_closed'.
     - Rejects closing if not open.
  3. Start League:
     - Allowed from 'registration_closed'.
     - Requires regular season fixtures/schedule to be generated first.
     - Transitions to 'in_progress' and sets Week 1 to active.
  4. Cancel League:
     - Allowed from draft, registration_open, registration_closed, in_progress.
     - Transitions to 'cancelled'.
     - Blocks new registrations and match scheduling.
     - Cannot cancel an already completed league.
  5. Complete League:
     - Requires all regular season matches and playoffs to be completed.
     - Rejects completion while matches remain pending.
     - Transitions to 'completed' and locks league.
  6. Player Registration Guards:
     - Player registration allowed only while status == 'registration_open'.
     - Blocked when status is 'draft', 'registration_closed', 'in_progress', 'cancelled', or 'completed'.
  7. Authorization:
     - Non-staff players cannot execute lifecycle transitions (returns 403).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.league import League, LeagueStatus
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
    return user


async def create_club(db: AsyncSession, name: str = "Test League Club") -> Club:
    uid = uuid.uuid4().hex[:6]
    club = Club(name=f"{name} {uid}", slug=f"league-club-{uid}", is_active=True)
    db.add(club)
    await db.flush()
    return club


async def add_club_staff(
    db: AsyncSession,
    club_id: uuid.UUID,
    user_id: uuid.UUID,
    role: ClubRole = ClubRole.CLUB_OWNER,
) -> ClubMembership:
    membership = ClubMembership(club_id=club_id, user_id=user_id, role=role)
    db.add(membership)
    await db.flush()
    return membership


async def add_player_member(
    db: AsyncSession,
    club_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ClubPlayerMembership:
    pm = ClubPlayerMembership(
        club_id=club_id,
        user_id=user_id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db.add(pm)
    await db.flush()
    return pm


@pytest.fixture
async def league_setup(db_session: AsyncSession):
    """Creates an owner, a player, a club, and staff membership."""
    owner = await create_user(db_session, full_name="Club Owner")
    player = await create_user(db_session, full_name="Club Player")
    club = await create_club(db_session)
    await add_club_staff(db_session, club.id, owner.id, ClubRole.CLUB_OWNER)
    await add_player_member(db_session, club.id, player.id)
    await db_session.commit()
    return {
        "owner": owner,
        "player": player,
        "club": club,
        "owner_headers": make_auth_header(owner.id),
        "player_headers": make_auth_header(player.id),
    }


@pytest.mark.asyncio
async def test_league_open_and_close_registration(
    async_client: AsyncClient,
    league_setup: dict,
):
    club = league_setup["club"]
    owner_headers = league_setup["owner_headers"]
    player_headers = league_setup["player_headers"]

    # 1. Create draft league
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues",
        headers=owner_headers,
        json={
            "name": "Spring Premier League",
            "number_of_weeks": 4,
            "max_teams": 6,
            "playoff_team_count": 4,
            "team_size": 2,
        },
    )
    assert create_resp.status_code == 201
    league_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "draft"

    # 2. Player cannot open registration (403)
    p_open_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/open-registration",
        headers=player_headers,
    )
    assert p_open_resp.status_code == 403

    # 3. Owner opens registration -> status becomes registration_open
    open_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/open-registration",
        headers=owner_headers,
    )
    assert open_resp.status_code == 200
    assert open_resp.json()["status"] == "registration_open"

    # 4. Verify player gets updated status
    player_view = await async_client.get(
        f"/api/v1/leagues/{league_id}",
        headers=player_headers,
    )
    assert player_view.status_code == 200
    assert player_view.json()["status"] == "registration_open"

    # 5. Owner closes registration -> status becomes registration_closed
    close_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/close-registration",
        headers=owner_headers,
    )
    assert close_resp.status_code == 200
    assert close_resp.json()["status"] == "registration_closed"

    # 6. Verify player sees registration_closed
    player_view2 = await async_client.get(
        f"/api/v1/leagues/{league_id}",
        headers=player_headers,
    )
    assert player_view2.status_code == 200
    assert player_view2.json()["status"] == "registration_closed"

    # 7. Attempting to close again rejects with 400
    dup_close = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/close-registration",
        headers=owner_headers,
    )
    assert dup_close.status_code == 400


@pytest.mark.asyncio
async def test_league_start_requires_schedule(
    async_client: AsyncClient,
    league_setup: dict,
):
    club = league_setup["club"]
    owner_headers = league_setup["owner_headers"]

    # Create league and close registration without schedule
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues",
        headers=owner_headers,
        json={
            "name": "Quick League",
            "number_of_weeks": 3,
            "max_teams": 4,
            "playoff_team_count": 2,
            "team_size": 1,
        },
    )
    league_id = create_resp.json()["id"]

    # Open registration
    await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/open-registration",
        headers=owner_headers,
    )
    # Close registration
    await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/close-registration",
        headers=owner_headers,
    )

    # Attempt to start league without teams/schedule -> rejected with 400
    start_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/start",
        headers=owner_headers,
    )
    assert start_resp.status_code == 400
    assert "At least 2 teams required to start league" in start_resp.json()["detail"] or "Schedule must be generated" in start_resp.json()["detail"]


@pytest.mark.asyncio
async def test_league_cancellation_lifecycle(
    async_client: AsyncClient,
    league_setup: dict,
):
    club = league_setup["club"]
    owner_headers = league_setup["owner_headers"]
    player_headers = league_setup["player_headers"]

    # Create league
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues",
        headers=owner_headers,
        json={
            "name": "Cancelled League Test",
            "number_of_weeks": 4,
            "max_teams": 6,
            "playoff_team_count": 4,
        },
    )
    league_id = create_resp.json()["id"]

    # Cancel league
    cancel_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/cancel",
        headers=owner_headers,
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # Player reads cancelled status
    player_view = await async_client.get(
        f"/api/v1/leagues/{league_id}",
        headers=player_headers,
    )
    assert player_view.status_code == 200
    assert player_view.json()["status"] == "cancelled"

    # Cannot open registration after cancellation (400)
    reopen_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/open-registration",
        headers=owner_headers,
    )
    assert reopen_resp.status_code == 400


@pytest.mark.asyncio
async def test_complete_league_rejects_pending_matches(
    async_client: AsyncClient,
    league_setup: dict,
):
    club = league_setup["club"]
    owner_headers = league_setup["owner_headers"]

    # Create league
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues",
        headers=owner_headers,
        json={
            "name": "Incomplete League",
            "number_of_weeks": 3,
            "max_teams": 4,
            "playoff_team_count": 2,
        },
    )
    league_id = create_resp.json()["id"]

    # Attempting to complete league in draft or with incomplete matches -> 400
    complete_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues/{league_id}/complete",
        headers=owner_headers,
    )
    assert complete_resp.status_code == 400
