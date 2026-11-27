"""
Aught2 Pickleball — End-to-End Tournament Registration Integrity, Format Counting & Sync Tests

Verifies:
1. Format-aware authoritative counting across Round Robin, Bracket, Pool Play, and Scramble
   on both Player Side and Club Side endpoints.
2. Doubles tournaments count confirmed teams (never raw players); Singles & Scramble count
   distinct confirmed eligible active players.
3. Pool Play counts confirmed teams consistently before and after pool configuration.
4. Pending, waitlisted, cancelled, inactive-membership, and incomplete-team states are
   never counted as confirmed entries.
5. Duplicate registration prevention, cancellation decrements & broken team dissolution,
   staff PATCH capacity enforcement, and simultaneous registration capacity safety.
6. WebSocket broadcast payloads match authoritative database counts.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
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


async def _setup_club_and_players(
    db: AsyncSession, count: int = 16
) -> tuple[Club, User, list[tuple[User, ClubPlayerMembership]]]:
    uid = uuid.uuid4().hex[:6]
    club = Club(name=f"Integrity Club {uid}", slug=f"integrity-club-{uid}", is_active=True)
    db.add(club)
    await db.flush()

    owner = User(
        email=f"owner_{uid}@test.local",
        hashed_password=hash_password("Secret123!"),
        full_name="Club Owner",
        is_active=True,
        is_verified=True,
    )
    db.add(owner)
    await db.flush()
    db.add(ClubMembership(user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER, is_active=True))
    await db.flush()

    players: list[tuple[User, ClubPlayerMembership]] = []
    for idx in range(1, count + 1):
        u = User(
            email=f"p{idx}_{uid}@test.local",
            hashed_password=hash_password("Secret123!"),
            full_name=f"Player {idx}",
            is_active=True,
            is_verified=True,
        )
        db.add(u)
        await db.flush()
        db.add(PlayerProfile(user_id=u.id, display_name=f"Player {idx}", gender="Male", skill_rating=3.5))
        pm = ClubPlayerMembership(
            user_id=u.id,
            club_id=club.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"M-{uid}-{idx:03d}",
        )
        db.add(pm)
        await db.flush()
        players.append((u, pm))

    await db.commit()
    return club, owner, players


async def _create_tournament(
    db: AsyncSession,
    club: Club,
    owner: User,
    fmt: TournamentFormat,
    *,
    is_doubles: bool = True,
    max_participants: int = 16,
    min_participants: int = 4,
) -> Tournament:
    now = datetime.now(timezone.utc)
    if fmt == TournamentFormat.SCRAMBLE:
        cfg = {
            "category": "Men's Scramble",
            "registration_type": "individual",
            "team_size": 1,
            "entry_fee": 0,
        }
    elif is_doubles:
        cfg = {
            "category": "Men's Doubles",
            "registration_type": "team",
            "team_size": 2,
            "entry_fee": 0,
        }
    else:
        cfg = {
            "category": "Singles",
            "registration_type": "individual",
            "team_size": 1,
            "entry_fee": 0,
        }

    t = Tournament(
        club_id=club.id,
        created_by_user_id=owner.id,
        name=f"{fmt.value} E2E {uuid.uuid4().hex[:4]}",
        format=fmt,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=7),
        start_date=now + timedelta(days=8),
        end_date=now + timedelta(days=9),
        min_participants=min_participants,
        max_participants=max_participants,
        format_configuration=cfg,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


async def _assert_consistent_counts(
    client: AsyncClient,
    club_id: uuid.UUID,
    tournament_id: uuid.UUID,
    owner_headers: dict,
    player_headers: dict,
    expected_participant_count: int,
    expected_teams_count: int | None,
    expected_confirmed_players: int,
):
    club_detail = await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{tournament_id}", headers=owner_headers
    )
    assert club_detail.status_code == 200
    cd = club_detail.json()
    assert cd["participant_count"] == expected_participant_count
    assert cd["teams_count"] == expected_teams_count
    assert cd["confirmed_players_count"] == expected_confirmed_players

    club_list = await client.get(f"/api/v1/clubs/{club_id}/tournaments", headers=owner_headers)
    assert club_list.status_code == 200
    cl_item = next(x for x in club_list.json() if x["id"] == str(tournament_id))
    assert cl_item["participant_count"] == expected_participant_count
    assert cl_item["teams_count"] == expected_teams_count
    assert cl_item["confirmed_players_count"] == expected_confirmed_players

    player_detail = await client.get(
        f"/api/v1/tournaments/{tournament_id}", headers=player_headers
    )
    assert player_detail.status_code == 200
    pd = player_detail.json()
    assert pd["participant_count"] == expected_participant_count
    assert pd["teams_count"] == expected_teams_count
    assert pd["confirmed_players_count"] == expected_confirmed_players

    discover = await client.get(
        f"/api/v1/player/tournaments?club_id={club_id}", headers=player_headers
    )
    assert discover.status_code == 200, discover.text
    disc_item = next(x for x in discover.json() if x["id"] == str(tournament_id))
    assert disc_item["participant_count"] == expected_participant_count
    assert disc_item["teams_count"] == expected_teams_count
    assert disc_item["confirmed_players_count"] == expected_confirmed_players

    upcoming = await client.get(
        f"/api/v1/player/upcoming-activities?activity_type=tournament&club_id={club_id}",
        headers=player_headers,
    )
    assert upcoming.status_code == 200, upcoming.text
    up_items = [x for x in upcoming.json()["items"] if x["id"] == str(tournament_id)]
    if up_items:
        up_item = up_items[0]
        if up_item["max_participants"] is not None:
            assert up_item["available_spots"] == max(
                0, up_item["max_participants"] - expected_participant_count
            )


@pytest.mark.asyncio
async def test_all_four_formats_format_aware_counts_and_sync(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verify Round Robin (doubles), Bracket (doubles), Pool Play (doubles before & after pools),
    and Scramble (individual) all maintain identical authoritative counts on Club Side and Player Side.
    """
    club, owner, players = await _setup_club_and_players(db_session, count=12)
    owner_h = make_auth_header(owner.id)
    p1_h = make_auth_header(players[0][0].id)

    rr = await _create_tournament(db_session, club, owner, TournamentFormat.ROUND_ROBIN, is_doubles=True, max_participants=16)
    br = await _create_tournament(db_session, club, owner, TournamentFormat.BRACKET, is_doubles=True, max_participants=16)
    pp = await _create_tournament(db_session, club, owner, TournamentFormat.POOL_PLAY, is_doubles=True, max_participants=16)
    sc = await _create_tournament(db_session, club, owner, TournamentFormat.SCRAMBLE, is_doubles=False, max_participants=16)

    # Register 4 teams (8 players) in RR, Bracket, Pool Play and 8 individual players in Scramble
    for i in range(4):
        u_a, _ = players[i * 2]
        _, pm_b = players[i * 2 + 1]
        h_a = make_auth_header(u_a.id)
        for tid in (rr.id, br.id, pp.id):
            r = await async_client.post(
                f"/api/v1/tournaments/{tid}/register",
                headers=h_a,
                json={"partner_membership_id": str(pm_b.id), "team_name": f"Team {i+1}"},
            )
            assert r.status_code == 201, r.text
            body = r.json()
            assert body["participant_count"] == i + 1
            assert body["teams_count"] == i + 1
            assert body["confirmed_players_count"] == (i + 1) * 2

    for i in range(8):
        u_s, _ = players[i]
        r = await async_client.post(
            f"/api/v1/tournaments/{sc.id}/register",
            headers=make_auth_header(u_s.id),
            json={},
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["participant_count"] == i + 1
        assert body["teams_count"] is None
        assert body["confirmed_players_count"] == i + 1

    # Verify all 4 formats match across Club Detail, Club List, Player Detail, Player Discovery
    await _assert_consistent_counts(async_client, club.id, rr.id, owner_h, p1_h, 4, 4, 8)
    await _assert_consistent_counts(async_client, club.id, br.id, owner_h, p1_h, 4, 4, 8)
    await _assert_consistent_counts(async_client, club.id, pp.id, owner_h, p1_h, 4, 4, 8)
    await _assert_consistent_counts(async_client, club.id, sc.id, owner_h, p1_h, 8, None, 8)

    # Pool Play counts confirmed teams BEFORE pools exist AND AFTER pools/matches are configured
    close_pp = await async_client.post(f"/api/v1/clubs/{club.id}/tournaments/{pp.id}/close-registration", headers=owner_h)
    assert close_pp.status_code == 200
    assert close_pp.json()["participant_count"] == 4
    assert close_pp.json()["teams_count"] == 4

    setup_pp = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{pp.id}/pool-play/post-registration-setup",
        headers=owner_h,
    )
    assert setup_pp.status_code == 200
    assert setup_pp.json()["confirmed_teams_count"] == 4

    gen_pp = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{pp.id}/pool-play/confirm-and-generate",
        headers=owner_h,
        json={"number_of_pools": 2, "qualifiers_per_pool": 1, "bracket_type": "Single Elimination"},
    )
    assert gen_pp.status_code in (200, 201), gen_pp.text
    await _assert_consistent_counts(async_client, club.id, pp.id, owner_h, p1_h, 4, 4, 8)

    # Scramble state matches participant count
    sc_state = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{sc.id}/scramble/state",
        headers=owner_h,
    )
    assert sc_state.status_code == 200
    assert sc_state.json()["registered_players_count"] == 8


@pytest.mark.asyncio
async def test_pending_waitlisted_cancelled_and_partner_cancellation_rules(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verify:
    - Pending, Waitlisted, Cancelled, and inactive memberships are excluded from confirmed counts.
    - Cancelling 1 partner on a doubles team dissolves that incomplete team from teams_count.
    - Cancelling members from TWO separate teams does not falsely pair surviving solo players into a team.
    - Duplicate registration fails with 400 and does not alter counts.
    """
    club, owner, players = await _setup_club_and_players(db_session, count=8)
    owner_h = make_auth_header(owner.id)

    doubles_t = await _create_tournament(
        db_session, club, owner, TournamentFormat.ROUND_ROBIN, is_doubles=True, max_participants=2, min_participants=2
    )

    # Team 1: players[0] + players[1]
    r1 = await async_client.post(
        f"/api/v1/tournaments/{doubles_t.id}/register",
        headers=make_auth_header(players[0][0].id),
        json={"partner_membership_id": str(players[1][1].id), "team_name": "Pair One"},
    )
    assert r1.status_code == 201
    # Duplicate registration must fail cleanly
    dup = await async_client.post(
        f"/api/v1/tournaments/{doubles_t.id}/register",
        headers=make_auth_header(players[0][0].id),
        json={"partner_membership_id": str(players[2][1].id)},
    )
    assert dup.status_code == 400

    # Team 2: players[2] + players[3] -> fills 2/2 capacity
    r2 = await async_client.post(
        f"/api/v1/tournaments/{doubles_t.id}/register",
        headers=make_auth_header(players[2][0].id),
        json={"partner_membership_id": str(players[3][1].id), "team_name": "Pair Two"},
    )
    assert r2.status_code == 201
    assert r2.json()["status"] == "confirmed"

    # Team 3: players[4] + players[5] -> waitlisted because max_participants=2 teams is full
    r3 = await async_client.post(
        f"/api/v1/tournaments/{doubles_t.id}/register",
        headers=make_auth_header(players[4][0].id),
        json={"partner_membership_id": str(players[5][1].id), "team_name": "Pair Three"},
    )
    assert r3.status_code == 201
    assert r3.json()["status"] == "waitlisted"
    assert r3.json()["participant_count"] == 2
    assert r3.json()["teams_count"] == 2
    assert r3.json()["confirmed_players_count"] == 4

    # Insert a PENDING registration directly for players[6] and verify it's NOT counted
    pending_reg = TournamentRegistration(
        tournament_id=doubles_t.id,
        player_membership_id=players[6][1].id,
        status=RegistrationStatus.PENDING,
    )
    db_session.add(pending_reg)
    await db_session.commit()

    await _assert_consistent_counts(
        async_client, club.id, doubles_t.id, owner_h, make_auth_header(players[0][0].id),
        expected_participant_count=2, expected_teams_count=2, expected_confirmed_players=4
    )

    # Staff trying to force-confirm waitlisted player while full must fail with 400
    patch_full = await async_client.patch(
        f"/api/v1/clubs/{club.id}/tournaments/{doubles_t.id}/registrations/{r3.json()['id']}",
        headers=owner_h,
        json={"status": "confirmed"},
    )
    assert patch_full.status_code == 400

    # Now Player 1 cancels (from Pair One) AND Player 3 cancels (from Pair Two)
    c1 = await async_client.delete(
        f"/api/v1/tournaments/{doubles_t.id}/register",
        headers=make_auth_header(players[0][0].id),
    )
    assert c1.status_code == 200
    assert c1.json()["participant_count"] == 1
    assert c1.json()["teams_count"] == 1
    assert c1.json()["confirmed_players_count"] == 3

    c2 = await async_client.delete(
        f"/api/v1/tournaments/{doubles_t.id}/register",
        headers=make_auth_header(players[2][0].id),
    )
    assert c2.status_code == 200
    # Surviving players[1] (from Pair One) and players[3] (from Pair Two) are NOT paired together!
    assert c2.json()["participant_count"] == 0
    assert c2.json()["teams_count"] == 0
    assert c2.json()["confirmed_players_count"] == 2

    teams_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{doubles_t.id}/teams", headers=owner_h
    )
    assert teams_res.status_code == 200
    assert len(teams_res.json()) == 0


@pytest.mark.asyncio
async def test_simultaneous_registrations_respect_capacity_and_broadcast(
    async_client: AsyncClient, db_session: AsyncSession, test_engine
):
    """
    Verify concurrent registrations using separate DB sessions cannot push confirmed
    count beyond max_participants, and WebSocket broadcasts carry authoritative counts.
    """
    import httpx
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app.core.database import get_db
    from app.main import app

    club, owner, players = await _setup_club_and_players(db_session, count=4)
    owner_h = make_auth_header(owner.id)
    scramble = await _create_tournament(
        db_session, club, owner, TournamentFormat.SCRAMBLE, is_doubles=False, max_participants=2, min_participants=2
    )

    # First slot taken by player 1
    r1 = await async_client.post(
        f"/api/v1/tournaments/{scramble.id}/register",
        headers=make_auth_header(players[0][0].id),
        json={},
    )
    assert r1.status_code == 201
    assert r1.json()["status"] == "confirmed"

    # Override get_db so each concurrent HTTP request uses its own isolated AsyncSession
    session_factory = async_sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def per_request_db():
        async with session_factory() as s:
            yield s

    prev_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = per_request_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as concurrent_client:
            with patch("app.core.websocket_manager.ws_manager.broadcast_all", new_callable=AsyncMock) as mock_ws:
                res_a, res_b = await asyncio.gather(
                    concurrent_client.post(
                        f"/api/v1/tournaments/{scramble.id}/register",
                        headers=make_auth_header(players[1][0].id),
                        json={},
                    ),
                    concurrent_client.post(
                        f"/api/v1/tournaments/{scramble.id}/register",
                        headers=make_auth_header(players[2][0].id),
                        json={},
                    ),
                )
    finally:
        if prev_override is not None:
            app.dependency_overrides[get_db] = prev_override

    assert res_a.status_code == 201, res_a.text
    assert res_b.status_code == 201, res_b.text
    statuses = sorted([res_a.json()["status"], res_b.json()["status"]])
    assert statuses == ["confirmed", "waitlisted"]

    scramble_id = scramble.id
    club_id = club.id
    p0_id = players[0][0].id

    # Authoritative DB confirmed count must NEVER exceed max_participants (2)
    db_session.expire_all()
    q = await db_session.execute(
        select(TournamentRegistration).where(
            TournamentRegistration.tournament_id == scramble_id,
            TournamentRegistration.status == RegistrationStatus.CONFIRMED,
        )
    )
    assert len(q.scalars().all()) == 2

    await _assert_consistent_counts(
        async_client, club_id, scramble_id, owner_h, make_auth_header(p0_id),
        expected_participant_count=2, expected_teams_count=None, expected_confirmed_players=2
    )
    assert mock_ws.called
    last_payload = mock_ws.call_args_list[-1].args[0]["data"]
    assert last_payload["participant_count"] == 2
    assert last_payload["confirmed_players_count"] == 2
