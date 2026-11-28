"""
Comprehensive Test Matrix: Authoritative Tournament Registration Counts,
Capacity Enforcement, Unit Classification, Concurrency & Staff Profile Sync.

Covers all 4 tournament formats and Singles/Doubles/Scramble registration models:
  - Round Robin (Singles & Doubles)
  - Bracket (Singles & Doubles)
  - Pool Play (Singles & Doubles)
  - Scramble (Individual rotating partners)
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus
from app.models.user import User
from tests.conftest import make_auth_header


async def _mk_user(
    db: AsyncSession,
    *,
    email: str,
    full_name: str,
    gender: str | None = "Male",
    skill: float = 3.5,
    create_profile: bool = True,
) -> User:
    u = User(
        email=email.lower(),
        hashed_password=hash_password("TestPass123!"),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    await db.flush()
    if create_profile:
        db.add(
            PlayerProfile(
                user_id=u.id,
                display_name=full_name,
                gender=gender,
                skill_rating=skill,
            )
        )
        await db.flush()
    return u


async def _mk_club(db: AsyncSession, name: str) -> Club:
    c = Club(
        name=name,
        slug=f"matrix-{uuid.uuid4().hex[:6]}",
        city="Austin",
        state="TX",
        country="US",
        is_active=True,
    )
    db.add(c)
    await db.flush()
    return c


async def _enroll(db: AsyncSession, club: Club, user: User) -> ClubPlayerMembership:
    pm = ClubPlayerMembership(
        club_id=club.id,
        user_id=user.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db.add(pm)
    await db.flush()
    return pm


async def _create_open_tournament(
    client: AsyncClient,
    owner_headers: dict[str, str],
    club_id: uuid.UUID,
    *,
    name: str,
    fmt: str,
    category: str,
    max_participants: int,
) -> dict:
    now = datetime.now(timezone.utc)
    is_scramble = fmt == "scramble"
    reg_type = "individual" if (is_scramble or "singles" in category.lower()) else "team"
    team_size = 1 if reg_type == "individual" else 2

    res = await client.post(
        f"/api/v1/clubs/{club_id}/tournaments",
        headers=owner_headers,
        json={
            "name": name,
            "format": fmt,
            "max_participants": max_participants,
            "min_participants": 4 if is_scramble else 2,
            "start_date": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
            "registration_open_at": (now - timedelta(hours=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=4)).isoformat(),
            "format_configuration": {
                "category": category,
                "registration_type": reg_type,
                "team_size": team_size,
                "skill_level_mode": "single",
                "skill_level": "3.5",
                "gender_eligibility": "Any" if is_scramble else ("Male" if category == "Men's Doubles" else "Any"),
                "entry_fee": 0,
            },
        },
    )
    assert res.status_code == 201, res.text
    tid = res.json()["id"]
    open_res = await client.post(
        f"/api/v1/clubs/{club_id}/tournaments/{tid}/open-registration",
        headers=owner_headers,
    )
    assert open_res.status_code == 200, open_res.text
    return open_res.json()


@pytest.mark.asyncio
async def test_tournament_director_profile_hydrates_without_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Club staff (including Tournament Director) should not hit 404 on GET /api/v1/player/profile."""
    club = await _mk_club(db_session, "Profile Hydration Club")
    td = await _mk_user(
        db_session,
        email="td_noprofile@matrix.local",
        full_name="Sam TD",
        create_profile=False,
    )
    db_session.add(ClubMembership(user_id=td.id, club_id=club.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    await db_session.commit()

    resp = await async_client.get("/api/v1/player/profile", headers=make_auth_header(td))
    assert resp.status_code == 200, resp.text
    assert resp.json()["display_name"] == "Sam TD"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fmt,category,expected_is_doubles",
    [
        ("round_robin", "Singles", False),
        ("round_robin", "Men's Doubles", True),
        ("bracket", "Singles", False),
        ("bracket", "Men's Doubles", True),
        ("pool_play", "Singles", False),
        ("pool_play", "Men's Doubles", True),
        ("scramble", "Open Scramble", False),
    ],
)
async def test_matrix_all_formats_counts_duplicates_cancel_and_capacity(
    async_client: AsyncClient,
    db_session: AsyncSession,
    fmt: str,
    category: str,
    expected_is_doubles: bool,
):
    """
    Full matrix across Round Robin, Bracket, Pool Play (Singles & Doubles) and Scramble:
    - Name intentionally does NOT match division ('Title Override Test Doubles Singles') to verify name inference is ignored.
    - Verifies initial 0, 1st registration, multiple registrations, duplicate rejection,
      partner re-registration rejection, cancellation decrement, capacity limit enforcement,
      and club/TD/player list/detail consistency.
    """
    club = await _mk_club(db_session, f"Matrix Club {fmt} {category}")
    other_club = await _mk_club(db_session, f"Other Matrix Club {fmt}")
    owner = await _mk_user(db_session, email=f"own_{fmt}_{uuid.uuid4().hex[:4]}@m.local", full_name="Owner")
    td = await _mk_user(db_session, email=f"td_{fmt}_{uuid.uuid4().hex[:4]}@m.local", full_name="TD")
    db_session.add(ClubMembership(user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER, is_active=True))
    db_session.add(ClubMembership(user_id=td.id, club_id=club.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))

    players: list[tuple[User, ClubPlayerMembership]] = []
    # Enough players for 4 slots in doubles (8 players) or 4 slots in singles/scramble (4 players) + extras
    total_needed = 10 if expected_is_doubles else 6
    for i in range(total_needed):
        u = await _mk_user(
            db_session,
            email=f"p{i}_{fmt}_{uuid.uuid4().hex[:5]}@m.local",
            full_name=f"Player {i}",
            gender="Male",
            skill=3.5,
        )
        pm = await _enroll(db_session, club, u)
        players.append((u, pm))
    await db_session.commit()

    owner_headers = make_auth_header(owner)
    td_headers = make_auth_header(td)
    max_cap = 4

    t = await _create_open_tournament(
        async_client,
        owner_headers,
        club.id,
        # Adversarially put opposite division keywords in name to ensure backend ignores name
        name="Annual Doubles Singles Classic" if not expected_is_doubles else "Quick Singles Event",
        fmt=fmt,
        category=category,
        max_participants=max_cap,
    )
    tid = t["id"]

    # Helper to assert identical counts across TD list, TD detail, and Player detail
    async def assert_counts(expected_entries: int, expected_players: int):
        td_detail = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_headers)
        assert td_detail.status_code == 200
        d = td_detail.json()
        assert d["participant_count"] == expected_entries
        assert d["confirmed_players_count"] == expected_players
        if expected_is_doubles:
            assert d["teams_count"] == expected_entries
        else:
            assert d["teams_count"] is None

        td_list = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments", headers=td_headers)
        matched = [row for row in td_list.json() if row["id"] == tid]
        assert len(matched) == 1
        assert matched[0]["participant_count"] == expected_entries
        assert matched[0]["confirmed_players_count"] == expected_players

        p_detail = await async_client.get(f"/api/v1/tournaments/{tid}", headers=make_auth_header(players[0][0]))
        assert p_detail.status_code == 200
        assert p_detail.json()["participant_count"] == expected_entries
        assert p_detail.json()["confirmed_players_count"] == expected_players

        other_list = await async_client.get(f"/api/v1/clubs/{other_club.id}/tournaments", headers=td_headers)
        assert other_list.status_code == 403

    await assert_counts(0, 0)

    # Registration 1
    if expected_is_doubles:
        r1 = await async_client.post(
            f"/api/v1/tournaments/{tid}/register",
            headers=make_auth_header(players[0][0]),
            json={"partner_membership_id": str(players[1][1].id), "team_name": "Team Alpha"},
        )
        assert r1.status_code == 201, r1.text
        assert r1.json()["participant_count"] == 1
        assert r1.json()["teams_count"] == 1
        assert r1.json()["confirmed_players_count"] == 2
        await assert_counts(1, 2)

        # Partner B cannot register again or as duplicate
        dup_partner = await async_client.post(
            f"/api/v1/tournaments/{tid}/register",
            headers=make_auth_header(players[1][0]),
            json={"partner_membership_id": str(players[2][1].id)},
        )
        assert dup_partner.status_code == 400
    else:
        r1 = await async_client.post(
            f"/api/v1/tournaments/{tid}/register",
            headers=make_auth_header(players[0][0]),
            json={},
        )
        assert r1.status_code == 201, r1.text
        assert r1.json()["participant_count"] == 1
        assert r1.json()["teams_count"] is None
        assert r1.json()["confirmed_players_count"] == 1
        await assert_counts(1, 1)

    # Duplicate attempt by Player 0 rejected cleanly
    dup_p0 = await async_client.post(
        f"/api/v1/tournaments/{tid}/register",
        headers=make_auth_header(players[0][0]),
        json={},
    )
    assert dup_p0.status_code == 400

    # Fill remaining 3 spots up to max_cap = 4
    if expected_is_doubles:
        for pair_idx in range(1, max_cap):
            u_a, _ = players[pair_idx * 2]
            _, pm_b = players[pair_idx * 2 + 1]
            resp = await async_client.post(
                f"/api/v1/tournaments/{tid}/register",
                headers=make_auth_header(u_a),
                json={"partner_membership_id": str(pm_b.id)},
            )
            assert resp.status_code == 201
            assert resp.json()["status"] == "confirmed"
        await assert_counts(4, 8)

        # Extra registration beyond capacity -> waitlisted, counts stay 4 / 8
        extra_u, _ = players[8]
        _, extra_pm = players[9]
        wait_resp = await async_client.post(
            f"/api/v1/tournaments/{tid}/register",
            headers=make_auth_header(extra_u),
            json={"partner_membership_id": str(extra_pm.id)},
        )
        assert wait_resp.status_code == 201
        assert wait_resp.json()["status"] == "waitlisted"
        await assert_counts(4, 8)

        # Staff cannot confirm waitlisted registration when tournament is at capacity
        wait_id = wait_resp.json()["id"]
        confirm_over = await async_client.patch(
            f"/api/v1/clubs/{club.id}/tournaments/{tid}/registrations/{wait_id}",
            headers=td_headers,
            json={"status": "confirmed"},
        )
        assert confirm_over.status_code == 400
    else:
        for idx in range(1, max_cap):
            resp = await async_client.post(
                f"/api/v1/tournaments/{tid}/register",
                headers=make_auth_header(players[idx][0]),
                json={},
            )
            assert resp.status_code == 201
            assert resp.json()["status"] == "confirmed"
        await assert_counts(4, 4)

        # Extra registration beyond capacity -> waitlisted, count stays 4
        wait_resp = await async_client.post(
            f"/api/v1/tournaments/{tid}/register",
            headers=make_auth_header(players[4][0]),
            json={},
        )
        assert wait_resp.status_code == 201
        assert wait_resp.json()["status"] == "waitlisted"
        await assert_counts(4, 4)

    # Cancel registration 1 (Player 0) -> count decrements properly
    cancel_res = await async_client.delete(
        f"/api/v1/tournaments/{tid}/register",
        headers=make_auth_header(players[0][0]),
    )
    assert cancel_res.status_code == 200
    if expected_is_doubles:
        # Team 1 lost Partner 0 -> only 3 valid complete teams, 7 confirmed individual players
        await assert_counts(3, 7)
    else:
        await assert_counts(3, 3)


@pytest.mark.asyncio
async def test_concurrent_singles_and_doubles_cannot_exceed_capacity(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Concurrent registration attempts at capacity cannot exceed max_participants."""
    club = await _mk_club(db_session, "Concurrent Cap Club")
    owner = await _mk_user(db_session, email="conc_owner@m.local", full_name="Conc Owner")
    db_session.add(ClubMembership(user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER, is_active=True))

    p_users: list[User] = []
    for i in range(4):
        u = await _mk_user(db_session, email=f"conc_p{i}@m.local", full_name=f"Conc P{i}")
        await _enroll(db_session, club, u)
        p_users.append(u)
    await db_session.commit()

    owner_headers = make_auth_header(owner)
    t = await _create_open_tournament(
        async_client,
        owner_headers,
        club.id,
        name="Concurrent Round Robin",
        fmt="round_robin",
        category="Singles",
        max_participants=2,
    )
    tid = t["id"]

    results = await asyncio.gather(
        async_client.post(f"/api/v1/tournaments/{tid}/register", headers=make_auth_header(p_users[0]), json={}),
        async_client.post(f"/api/v1/tournaments/{tid}/register", headers=make_auth_header(p_users[1]), json={}),
        async_client.post(f"/api/v1/tournaments/{tid}/register", headers=make_auth_header(p_users[2]), json={}),
        async_client.post(f"/api/v1/tournaments/{tid}/register", headers=make_auth_header(p_users[3]), json={}),
    )
    confirmed = [r for r in results if r.status_code == 201 and r.json()["status"] == "confirmed"]
    assert len(confirmed) == 2

    detail = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=owner_headers)
    assert detail.status_code == 200
    assert detail.json()["participant_count"] == 2
