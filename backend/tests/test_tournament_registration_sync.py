"""
Regression tests for Pool Play tournament registration synchronization,
team/player count accuracy, cross-account real-time broadcasts, and duplicate prevention.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
    gender: str = "Male",
    rating: float = 4.0,
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
        gender=gender,
        skill_rating=rating,
    )
    db.add(profile)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str = "Sync Test Club",
) -> Club:
    uid = uuid.uuid4().hex[:6]
    club = Club(name=f"{name} {uid}", slug=f"sync-club-{uid}", is_active=True)
    db.add(club)
    await db.flush()
    return club


async def create_player_membership(
    db: AsyncSession,
    user: User,
    club: Club,
) -> ClubPlayerMembership:
    membership = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number=f"MEM-{uuid.uuid4().hex[:6].upper()}",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_pool_play_tournament(
    db: AsyncSession,
    club: Club,
    created_by: User,
    max_teams: int = 8,
) -> Tournament:
    now = datetime.now(timezone.utc)
    tournament = Tournament(
        club_id=club.id,
        created_by_user_id=created_by.id,
        name="Pool Play Championship",
        format=TournamentFormat.POOL_PLAY,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        min_participants=4,
        max_participants=max_teams,
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=2),
        start_date=now + timedelta(days=3),
        end_date=now + timedelta(days=4),
        format_configuration={
            "category": "Men's Doubles",
            "skill_level": "4.0",
            "gender_eligibility": "Male",
            "registration_type": "team",
            "team_size": 2,
            "pool_count": 2,
        },
        scoring_rules={"target_score": 11, "win_by": 2},
    )
    db.add(tournament)
    await db.flush()
    return tournament


@pytest.mark.asyncio
async def test_pool_play_doubles_registration_counts_teams_not_raw_players(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that in doubles pool play (max_participants=8 represents 8 teams),
    4 registered players yield participant_count=2, teams_count=2,
    and confirmed_players_count=4 across details and discovery endpoints.
    """
    owner = await create_user(db_session, "owner@sync.test", "Club Owner")
    club = await create_club(db_session)
    tournament = await create_pool_play_tournament(db_session, club, owner, max_teams=8)

    # Create 4 test players with active memberships
    p1 = await create_user(db_session, "p1@sync.test", "Player One")
    p2 = await create_user(db_session, "p2@sync.test", "Player Two")
    p3 = await create_user(db_session, "p3@sync.test", "Player Three")
    p4 = await create_user(db_session, "p4@sync.test", "Player Four")

    p1_mem = await create_player_membership(db_session, p1, club)
    p2_mem = await create_player_membership(db_session, p2, club)
    p3_mem = await create_player_membership(db_session, p3, club)
    p4_mem = await create_player_membership(db_session, p4, club)
    await db_session.commit()

    # Register Team 1: Player 1 with Partner Player 2 (via partner_membership_id)
    reg1_res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={
            "team_name": "Team Alpha",
            "partner_membership_id": str(p2_mem.id),
        },
        headers=make_auth_header(p1.id),
    )
    assert reg1_res.status_code == 201, reg1_res.text

    # Check tournament details after 1 team (2 players)
    detail1_res = await async_client.get(
        f"/api/v1/tournaments/{tournament.id}",
        headers=make_auth_header(p1.id),
    )
    assert detail1_res.status_code == 200
    d1 = detail1_res.json()
    assert d1["participant_count"] == 1  # 1 team
    assert d1["teams_count"] == 1
    assert d1["confirmed_players_count"] == 2
    assert d1["max_participants"] == 8

    # Register Team 2: Player 3 with Partner Player 4 (via partner_email)
    reg2_res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={
            "team_name": "Team Beta",
            "partner_email": "p4@sync.test",
            "partner_name": "Player Four",
        },
        headers=make_auth_header(p3.id),
    )
    assert reg2_res.status_code == 201

    # Check tournament details after 2 teams (4 players)
    # The count MUST be 2/8 (teams), NOT 4/8 (players)
    detail2_res = await async_client.get(
        f"/api/v1/tournaments/{tournament.id}",
        headers=make_auth_header(p2.id),
    )
    assert detail2_res.status_code == 200
    d2 = detail2_res.json()
    assert d2["participant_count"] == 2  # exactly 2 teams
    assert d2["teams_count"] == 2
    assert d2["confirmed_players_count"] == 4
    assert d2["max_participants"] == 8

    # Check public discovery endpoint (/api/v1/player/tournaments)
    discovery_res = await async_client.get(
        "/api/v1/player/tournaments",
        headers=make_auth_header(p4.id),
    )
    assert discovery_res.status_code == 200
    disc_items = [t for t in discovery_res.json() if t["id"] == str(tournament.id)]
    assert len(disc_items) == 1
    disc_t = disc_items[0]
    assert disc_t["participant_count"] == 2
    assert disc_t["teams_count"] == 2
    assert disc_t["confirmed_players_count"] == 4


@pytest.mark.asyncio
async def test_websocket_broadcasts_global_and_contains_consistent_counts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that self-registration broadcasts TOURNAMENT_REGISTRATION_CREATED
    globally (ws_manager.broadcast_all) with consistent team and player counts.
    """
    owner = await create_user(db_session, "owner2@sync.test", "Club Owner 2")
    club = await create_club(db_session)
    tournament = await create_pool_play_tournament(db_session, club, owner, max_teams=8)

    p1 = await create_user(db_session, "p1b@sync.test", "P1")
    p2 = await create_user(db_session, "p2b@sync.test", "P2")
    p1_mem = await create_player_membership(db_session, p1, club)
    p2_mem = await create_player_membership(db_session, p2, club)
    await db_session.commit()

    with patch("app.services.tournament_service.ws_manager") as mock_ws:
        mock_ws.broadcast_all = AsyncMock()
        mock_ws.broadcast_to_club = AsyncMock()

        reg_res = await async_client.post(
            f"/api/v1/tournaments/{tournament.id}/register",
            json={
                "team_name": "Test Global Broadcast",
                "partner_membership_id": str(p2_mem.id),
            },
            headers=make_auth_header(p1.id),
        )
        assert reg_res.status_code == 201

        # Assert broadcast_all was called for global player synchronization
        assert mock_ws.broadcast_all.called
        calls = [c.args[0] for c in mock_ws.broadcast_all.call_args_list]
        event_types = [call["type"] for call in calls]
        assert "tournament.registration.created" in event_types

        reg_event = next(c for c in calls if c["type"] == "tournament.registration.created")
        payload = reg_event["data"]
        assert payload["tournament_id"] == str(tournament.id)
        assert payload["participant_count"] == 1  # 1 team
        assert payload["teams_count"] == 1
        assert payload["confirmed_players_count"] == 2


@pytest.mark.asyncio
async def test_duplicate_registration_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that a player cannot register twice for the same tournament.
    """
    owner = await create_user(db_session, "owner3@sync.test", "Club Owner 3")
    club = await create_club(db_session)
    tournament = await create_pool_play_tournament(db_session, club, owner, max_teams=8)

    p1 = await create_user(db_session, "p1c@sync.test", "Duplicate P1")
    p2 = await create_user(db_session, "p2c@sync.test", "Duplicate P2")
    p1_mem = await create_player_membership(db_session, p1, club)
    p2_mem = await create_player_membership(db_session, p2, club)
    await db_session.commit()

    # First registration
    res1 = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={"partner_membership_id": str(p2_mem.id)},
        headers=make_auth_header(p1.id),
    )
    assert res1.status_code == 201

    # Second registration attempt by same player
    res2 = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={"partner_membership_id": str(p2_mem.id)},
        headers=make_auth_header(p1.id),
    )
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cancel_registration_updates_counts_and_broadcasts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify that cancelling a registration decrements the participant count,
    updates teams_count and confirmed_players_count, and broadcasts globally.
    """
    owner = await create_user(db_session, "owner4@sync.test", "Club Owner 4")
    club = await create_club(db_session)
    tournament = await create_pool_play_tournament(db_session, club, owner, max_teams=8)

    p1 = await create_user(db_session, "p1d@sync.test", "P1 Cancel")
    p2 = await create_user(db_session, "p2d@sync.test", "P2 Cancel")
    p1_mem = await create_player_membership(db_session, p1, club)
    p2_mem = await create_player_membership(db_session, p2, club)
    await db_session.commit()

    # Register
    reg_res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={"partner_membership_id": str(p2_mem.id)},
        headers=make_auth_header(p1.id),
    )
    assert reg_res.status_code == 201

    with patch("app.services.tournament_service.ws_manager") as mock_ws:
        mock_ws.broadcast_all = AsyncMock()
        mock_ws.broadcast_to_club = AsyncMock()

        # Cancel Player 1
        cancel_res = await async_client.delete(
            f"/api/v1/tournaments/{tournament.id}/register",
            headers=make_auth_header(p1.id),
        )
        assert cancel_res.status_code == 200

        # Assert broadcast_all was called
        assert mock_ws.broadcast_all.called
        calls = [c.args[0] for c in mock_ws.broadcast_all.call_args_list]
        event_types = [call["type"] for call in calls]
        assert "tournament.registration.cancelled" in event_types

    # Check tournament details now reflect the cancellation
    detail_res = await async_client.get(
        f"/api/v1/tournaments/{tournament.id}",
        headers=make_auth_header(owner.id),
    )
    assert detail_res.status_code == 200
    d = detail_res.json()
    assert d["participant_count"] == 0  # 0 complete teams now
    assert d["teams_count"] == 0
    assert d["confirmed_players_count"] == 1  # only p2 remains confirmed, p1 cancelled

