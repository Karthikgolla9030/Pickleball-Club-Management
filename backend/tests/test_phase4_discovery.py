"""
Aught2 Pickleball — Phase 4: Platform-Wide Tournament & League Discovery Tests

Verifies:
 1. Public tournament discovery across multiple active clubs.
 2. Tournaments include host club details (club_id, club_name, club_slug).
 3. Tournament search by tournament name.
 4. Tournament search by host club name.
 5. Tournament filter by format (round_robin, pool_play, scramble, bracket).
 6. Tournament filter by status (registration_open, in_progress, completed, etc.).
 7. Private tournaments excluded from public discovery.
 8. Inactive clubs excluded from public discovery.
 9. Public league discovery across multiple active clubs with host club metadata.
10. League search by league name and host club name.
11. League filtering by status and exclusion of draft/cancelled leagues.
12. Player cannot register for competition without active host-club membership (403).
13. Player with active host-club membership can register (201).
14. Duplicate registrations are rejected (400).
15. Tournament details endpoint includes host club association.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.league import League, LeagueStatus
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Test Helpers ─────────────────────────────────────────────────────────────

async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test Player",
    is_active: bool = True,
) -> User:
    email = email or f"player_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=is_active,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str | None = None,
    slug: str | None = None,
    is_active: bool = True,
) -> Club:
    uid = uuid.uuid4().hex[:6]
    name = name or f"Discovery Club {uid}"
    slug = slug or f"discovery-club-{uid}"
    club = Club(name=name, slug=slug, is_active=is_active)
    db.add(club)
    await db.flush()
    return club


async def create_tournament(
    db: AsyncSession,
    club: Club,
    created_by: User,
    name: str = "Test Open Tournament",
    format: TournamentFormat = TournamentFormat.ROUND_ROBIN,
    status: TournamentStatus = TournamentStatus.REGISTRATION_OPEN,
    visibility: TournamentVisibility = TournamentVisibility.PUBLIC,
    max_participants: int = 16,
) -> Tournament:
    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club.id,
        created_by_user_id=created_by.id,
        name=name,
        description="Public discovery tournament",
        format=format,
        status=status,
        visibility=visibility,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=6),
        location_name=f"{club.name} Courts",
        min_participants=4,
        max_participants=max_participants,
        scoring_rules={"target_score": 11, "win_by": 2},
        tiebreaker_rules=["head_to_head", "point_differential", "total_points"],
    )
    db.add(t)
    await db.flush()
    return t


async def create_league(
    db: AsyncSession,
    club: Club,
    name: str = "Summer Premier League",
    status: LeagueStatus = LeagueStatus.REGISTRATION_OPEN,
    max_teams: int = 12,
) -> League:
    now = datetime.now(timezone.utc)
    league = League(
        club_id=club.id,
        name=name,
        description="Public doubles league across clubs",
        status=status,
        team_size=2,
        number_of_weeks=8,
        playoff_team_count=4,
        max_teams=max_teams,
        scoring_rules={"points_to_win": 11, "win_by": 2},
        start_date=now + timedelta(days=14),
        end_date=now + timedelta(days=70),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=10),
    )
    db.add(league)
    await db.flush()
    return league


# ─── Test Suite ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_multiclub_tournament_discovery(async_client: AsyncClient, db_session: AsyncSession):
    """Tournaments from multiple active clubs are discoverable platform-wide with host club metadata."""
    club_a = await create_club(db_session, name="Oakland Pickleball Club")
    club_b = await create_club(db_session, name="Berkeley Net Society")
    owner_a = await create_user(db_session, email="owner_a@oakland.local")
    owner_b = await create_user(db_session, email="owner_b@berkeley.local")
    player = await create_user(db_session)
    headers = make_auth_header(player.id)

    t1 = await create_tournament(db_session, club_a, owner_a, name="Oakland Open Round Robin", format=TournamentFormat.ROUND_ROBIN)
    t2 = await create_tournament(db_session, club_b, owner_b, name="Berkeley Pool Clash", format=TournamentFormat.POOL_PLAY)
    await db_session.commit()

    resp = await async_client.get("/api/v1/player/tournaments", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    t_ids = [item["id"] for item in data]
    assert str(t1.id) in t_ids
    assert str(t2.id) in t_ids

    # Verify host club metadata is populated
    item_a = next(i for i in data if i["id"] == str(t1.id))
    assert item_a["club_id"] == str(club_a.id)
    assert item_a["club_name"] == club_a.name
    assert item_a["club_slug"] == club_a.slug

    item_b = next(i for i in data if i["id"] == str(t2.id))
    assert item_b["club_id"] == str(club_b.id)
    assert item_b["club_name"] == club_b.name
    assert item_b["club_slug"] == club_b.slug


@pytest.mark.asyncio
async def test_tournament_search_by_name_and_host_club(async_client: AsyncClient, db_session: AsyncSession):
    """Searching matches tournament name or host club name."""
    club_a = await create_club(db_session, name="Sunnyvale Smashers Club")
    club_b = await create_club(db_session, name="Fremont Spinners Club")
    owner_a = await create_user(db_session)
    owner_b = await create_user(db_session)
    player = await create_user(db_session)
    headers = make_auth_header(player.id)

    t1 = await create_tournament(db_session, club_a, owner_a, name="Silicon Championship", format=TournamentFormat.BRACKET)
    t2 = await create_tournament(db_session, club_b, owner_b, name="East Bay Scramble", format=TournamentFormat.SCRAMBLE)
    await db_session.commit()

    # Search by tournament name
    resp_name = await async_client.get("/api/v1/player/tournaments?search=Silicon", headers=headers)
    assert resp_name.status_code == 200
    ids_name = [i["id"] for i in resp_name.json()]
    assert str(t1.id) in ids_name
    assert str(t2.id) not in ids_name

    # Search by host club name
    resp_club = await async_client.get(f"/api/v1/player/tournaments?search={club_b.name}", headers=headers)
    assert resp_club.status_code == 200
    ids_club = [i["id"] for i in resp_club.json()]
    assert str(t2.id) in ids_club
    assert str(t1.id) not in ids_club


@pytest.mark.asyncio
async def test_tournament_format_and_status_filtering(async_client: AsyncClient, db_session: AsyncSession):
    """Players can filter tournaments by format and lifecycle status."""
    club = await create_club(db_session, name="Metro Club")
    owner = await create_user(db_session)
    player = await create_user(db_session)
    headers = make_auth_header(player.id)

    rr_open = await create_tournament(db_session, club, owner, name="RR Open", format=TournamentFormat.ROUND_ROBIN, status=TournamentStatus.REGISTRATION_OPEN)
    bracket_live = await create_tournament(db_session, club, owner, name="Bracket Live", format=TournamentFormat.BRACKET, status=TournamentStatus.IN_PROGRESS)
    scramble_comp = await create_tournament(db_session, club, owner, name="Scramble Done", format=TournamentFormat.SCRAMBLE, status=TournamentStatus.COMPLETED)
    await db_session.commit()

    # Filter by format
    resp_format = await async_client.get("/api/v1/player/tournaments?format=bracket", headers=headers)
    assert resp_format.status_code == 200
    ids_format = [i["id"] for i in resp_format.json()]
    assert str(bracket_live.id) in ids_format
    assert str(rr_open.id) not in ids_format
    assert str(scramble_comp.id) not in ids_format

    # Filter by status
    resp_status = await async_client.get("/api/v1/player/tournaments?status=in_progress", headers=headers)
    assert resp_status.status_code == 200
    ids_status = [i["id"] for i in resp_status.json()]
    assert str(bracket_live.id) in ids_status
    assert str(rr_open.id) not in ids_status
    assert str(scramble_comp.id) not in ids_status


@pytest.mark.asyncio
async def test_private_tournaments_excluded(async_client: AsyncClient, db_session: AsyncSession):
    """Private tournaments are strictly excluded from public discovery."""
    club = await create_club(db_session, name="Private Sanctuary")
    owner = await create_user(db_session)
    player = await create_user(db_session)
    headers = make_auth_header(player.id)

    t_pub = await create_tournament(db_session, club, owner, name="Public Event", visibility=TournamentVisibility.PUBLIC)
    t_priv = await create_tournament(db_session, club, owner, name="Members Secret Invitational", visibility=TournamentVisibility.PRIVATE)
    await db_session.commit()

    resp = await async_client.get("/api/v1/player/tournaments", headers=headers)
    assert resp.status_code == 200
    ids = [i["id"] for i in resp.json()]
    assert str(t_pub.id) in ids
    assert str(t_priv.id) not in ids


@pytest.mark.asyncio
async def test_inactive_club_tournaments_excluded(async_client: AsyncClient, db_session: AsyncSession):
    """Tournaments from deactivated/inactive clubs are excluded from public discovery."""
    active_club = await create_club(db_session, name="Active Club", is_active=True)
    inactive_club = await create_club(db_session, name="Suspended Club", is_active=False)
    owner_a = await create_user(db_session)
    owner_b = await create_user(db_session)
    player = await create_user(db_session)
    headers = make_auth_header(player.id)

    t_active = await create_tournament(db_session, active_club, owner_a, name="Active Club Tourney")
    t_inactive = await create_tournament(db_session, inactive_club, owner_b, name="Inactive Club Tourney")
    await db_session.commit()

    resp = await async_client.get("/api/v1/player/tournaments", headers=headers)
    assert resp.status_code == 200
    ids = [i["id"] for i in resp.json()]
    assert str(t_active.id) in ids
    assert str(t_inactive.id) not in ids


@pytest.mark.asyncio
async def test_multiclub_league_discovery(async_client: AsyncClient, db_session: AsyncSession):
    """Leagues across multiple clubs are discoverable, with host club metadata and filtering."""
    club_x = await create_club(db_session, name="Apex Pickleball")
    club_y = await create_club(db_session, name="Summit Paddle Center")

    l1 = await create_league(db_session, club_x, name="Apex Premier Doubles", status=LeagueStatus.REGISTRATION_OPEN)
    l2 = await create_league(db_session, club_y, name="Summit Spring Cup", status=LeagueStatus.IN_PROGRESS)
    l_draft = await create_league(db_session, club_x, name="Apex Draft League", status=LeagueStatus.DRAFT)
    await db_session.commit()

    # Discover all public leagues
    resp = await async_client.get("/api/v1/leagues")
    assert resp.status_code == 200
    data = resp.json()
    league_ids = [l["id"] for l in data]

    assert str(l1.id) in league_ids
    assert str(l2.id) in league_ids
    assert str(l_draft.id) not in league_ids  # Draft excluded

    # Verify host club fields
    item1 = next(l for l in data if l["id"] == str(l1.id))
    assert item1["club_id"] == str(club_x.id)
    assert item1["club_name"] == club_x.name
    assert item1["club_slug"] == club_x.slug

    # Search by host club name
    resp_search = await async_client.get(f"/api/v1/leagues?search={club_y.name}")
    assert resp_search.status_code == 200
    search_ids = [l["id"] for l in resp_search.json()]
    assert str(l2.id) in search_ids
    assert str(l1.id) not in search_ids

    # Filter by status
    resp_status = await async_client.get("/api/v1/leagues?status=registration_open")
    assert resp_status.status_code == 200
    status_ids = [l["id"] for l in resp_status.json()]
    assert str(l1.id) in status_ids
    assert str(l2.id) not in status_ids


@pytest.mark.asyncio
async def test_registration_eligibility_enforced(async_client: AsyncClient, db_session: AsyncSession):
    """
    Players can browse competitions without club membership, but registration strictly
    requires active membership in the host club.
    """
    host_club = await create_club(db_session, name="Exclusive Host Club")
    owner = await create_user(db_session)
    tournament = await create_tournament(db_session, host_club, owner, name="Member-Only Open")

    # Unaffiliated player
    player = await create_user(db_session, email="outsider@player.local")
    auth_headers = make_auth_header(player.id)
    await db_session.commit()

    # 1. Player without membership tries to register -> 403 Forbidden
    reg_payload = {"team_name": "Solo Ace"}
    resp_fail = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json=reg_payload,
        headers=auth_headers,
    )
    assert resp_fail.status_code == 403
    assert "player membership in this club" in resp_fail.json()["detail"].lower()

    # 2. Grant player active membership in the host club
    membership = ClubPlayerMembership(
        club_id=host_club.id,
        user_id=player.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(membership)
    await db_session.commit()

    # 3. Registration now succeeds -> 201 Created
    resp_success = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json=reg_payload,
        headers=auth_headers,
    )
    assert resp_success.status_code == 201
    assert resp_success.json()["status"] == "confirmed"

    # 4. Duplicate registration rejected -> 400 Bad Request
    resp_dup = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json=reg_payload,
        headers=auth_headers,
    )
    assert resp_dup.status_code == 400
    assert "already registered" in resp_dup.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tournament_details_includes_host_club(async_client: AsyncClient, db_session: AsyncSession):
    """Tournament details endpoint provides host club details for profile navigation."""
    club = await create_club(db_session, name="Grand Rapids Club")
    owner = await create_user(db_session)
    player = await create_user(db_session)
    headers = make_auth_header(player.id)
    t = await create_tournament(db_session, club, owner, name="Grand Rapids Cup")
    await db_session.commit()

    resp = await async_client.get(f"/api/v1/tournaments/{t.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == str(t.id)
    assert data["club_id"] == str(club.id)
    assert data["club_name"] == club.name
    assert data["club_slug"] == club.slug
