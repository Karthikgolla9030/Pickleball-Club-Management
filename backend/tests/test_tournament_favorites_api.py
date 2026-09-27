"""
Tests for Player Tournament Favorites & Enhanced Discovery (scoring_rules)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.user import User


@pytest.fixture
async def favorite_test_data(db_session: AsyncSession):
    now = datetime.now(timezone.utc)

    # 1. Create User
    user = User(
        id=uuid.uuid4(),
        email=f"fav_player_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("FavPass123!"),
        full_name="Favorite Test Player",
        is_active=True,
    )
    db_session.add(user)

    # 2. Create Club
    club = Club(
        id=uuid.uuid4(),
        name="Sunset Hills Club",
        slug=f"sunset-hills-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(club)

    # 3. Create Tournament
    tournament = Tournament(
        id=uuid.uuid4(),
        club_id=club.id,
        name="Summer Slam Pool Play",
        description="Exciting pool play tournament.",
        format=TournamentFormat.POOL_PLAY,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=10),
        end_date=now + timedelta(days=12),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=5),
        location_name="Riverside Pickleball Club",
        max_participants=16,
        min_participants=4,
        scoring_rules={"target_score": 11, "win_by": 2, "description": "First to 11 (win by 2)"},
    )
    db_session.add(tournament)
    await db_session.commit()

    return {"user": user, "club": club, "tournament": tournament}


@pytest.mark.asyncio
async def test_tournament_favorites_lifecycle(
    async_client: AsyncClient,
    favorite_test_data: dict,
):
    user = favorite_test_data["user"]
    tournament = favorite_test_data["tournament"]

    # Login
    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "FavPass123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Check initial favorites (empty)
    get_resp = await async_client.get("/api/v1/player/tournaments/favorites", headers=headers)
    assert get_resp.status_code == 200
    assert str(tournament.id) not in [str(x) for x in get_resp.json()]

    # 2. Add to favorites
    add_resp = await async_client.post(
        f"/api/v1/player/tournaments/{tournament.id}/favorite",
        headers=headers,
    )
    assert add_resp.status_code == 200
    assert add_resp.json()["favorited"] is True

    # 3. Verify it is now in favorites list
    get_resp2 = await async_client.get("/api/v1/player/tournaments/favorites", headers=headers)
    assert get_resp2.status_code == 200
    fav_ids = [str(x) for x in get_resp2.json()]
    assert str(tournament.id) in fav_ids

    # 4. Duplicate add is safe and idempotent
    add_resp2 = await async_client.post(
        f"/api/v1/player/tournaments/{tournament.id}/favorite",
        headers=headers,
    )
    assert add_resp2.status_code == 200

    # 5. Remove from favorites
    del_resp = await async_client.delete(
        f"/api/v1/player/tournaments/{tournament.id}/favorite",
        headers=headers,
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["favorited"] is False

    # 6. Verify removed from favorites list
    get_resp3 = await async_client.get("/api/v1/player/tournaments/favorites", headers=headers)
    assert get_resp3.status_code == 200
    fav_ids3 = [str(x) for x in get_resp3.json()]
    assert str(tournament.id) not in fav_ids3


@pytest.mark.asyncio
async def test_tournament_discovery_includes_scoring_rules(
    async_client: AsyncClient,
    favorite_test_data: dict,
):
    user = favorite_test_data["user"]
    tournament = favorite_test_data["tournament"]

    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": "FavPass123!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Discover tournaments
    resp = await async_client.get("/api/v1/player/tournaments", headers=headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) > 0

    target_item = next((it for it in items if it["id"] == str(tournament.id)), None)
    assert target_item is not None
    assert target_item["name"] == "Summer Slam Pool Play"
    assert target_item["scoring_rules"] is not None
    assert target_item["scoring_rules"]["target_score"] == 11
    assert target_item["scoring_rules"]["win_by"] == 2
