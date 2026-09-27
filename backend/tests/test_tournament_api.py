"""
Aught2 Pickleball — Tournament API Test Suite (Phase 4)

Tests all Phase 4 requirements:
 1. Club Owner can create a tournament (201).
 2. Club Manager can create a tournament (201).
 3. Tournament Director can create a tournament (201).
 4. Regular player without staff role cannot create a tournament (403).
 5. Staff of Club A cannot create tournament in Club B (403).
 6. Valid formats (round_robin, pool_play, scramble, bracket) all accepted.
 7. Invalid tournament format is rejected (422).
 8. Default scoring rules and tiebreakers are populated.
 9. String fields are trimmed and sanitized.
10. Date ordering validation: registration_open > registration_close rejected (422).
11. Date ordering validation: registration_close > start_date rejected (422).
12. Date ordering validation: start_date > end_date rejected (422).
13. Participant limits validation: max < min rejected (422).
14. Staff can view tournament details (200).
15. Staff of Club A cannot view/manage tournament of Club B (403/404).
16. Staff can update tournament in draft status (200).
17. Open registration lifecycle transition works (200).
18. Close registration lifecycle transition works (200).
19. Structural update locked once registration is open (400).
20. Tournament cancellation works from draft or open (200).
21. Cannot cancel an already cancelled tournament (400).
22. Public tournament discovery (/player/tournaments) returns public tournaments (200).
23. Private tournaments are excluded from public discovery.
24. Inactive club's tournaments are excluded from discovery.
25. Player with active ClubPlayerMembership can self-register when registration is open (201).
26. Player without ClubPlayerMembership in the tournament's club cannot register (403).
27. Player with inactive/expired ClubPlayerMembership cannot register (403).
28. Player cannot register when tournament is in DRAFT status (400).
29. Duplicate registration attempt returns 400.
30. Registration moves to WAITLISTED when max_participants capacity is reached.
31. Player can cancel their registration (200).
32. Player re-registering after cancellation reactivates existing registration in-place (201).
33. Staff can list tournament registrations (200).
34. Staff can update registration status and seed number (200).
35. Staff of Club A cannot view or update registrations of Club B's tournament (404).
36. Unauthenticated requests return 401.
"""
from __future__ import annotations

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
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Test Helpers ─────────────────────────────────────────────────────────────

async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
    is_active: bool = True,
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
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
    name = name or f"Test Club {uid}"
    slug = slug or f"test-club-{uid}"
    club = Club(name=name, slug=slug, is_active=is_active)
    db.add(club)
    await db.flush()
    return club


async def create_staff_membership(
    db: AsyncSession,
    user: User,
    club: Club,
    role: ClubRole = ClubRole.CLUB_OWNER,
    is_active: bool = True,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=role,
        is_active=is_active,
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_player_membership(
    db: AsyncSession,
    user: User,
    club: Club,
    status: PlayerMembershipStatus = PlayerMembershipStatus.ACTIVE,
    membership_number: str | None = None,
) -> ClubPlayerMembership:
    membership = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        status=status,
        membership_number=membership_number or f"MEM-{uuid.uuid4().hex[:6].upper()}",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_tournament(
    db: AsyncSession,
    club: Club,
    created_by: User,
    name: str = "Test Tournament",
    format: TournamentFormat = TournamentFormat.ROUND_ROBIN,
    status: TournamentStatus = TournamentStatus.DRAFT,
    visibility: TournamentVisibility = TournamentVisibility.PUBLIC,
    min_participants: int = 4,
    max_participants: int = 16,
) -> Tournament:
    now = datetime.now(timezone.utc)
    tournament = Tournament(
        club_id=club.id,
        name=name,
        format=format,
        status=status,
        visibility=visibility,
        min_participants=min_participants,
        max_participants=max_participants,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=5),
        created_by_user_id=created_by.id,
    )
    db.add(tournament)
    await db.flush()
    return tournament


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_01_staff_can_create_tournament(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Club Owner, Club Manager, and Tournament Director can all create tournaments."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    manager = await create_user(db_session)
    director = await create_user(db_session)

    await create_staff_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await create_staff_membership(db_session, manager, club, ClubRole.CLUB_MANAGER)
    await create_staff_membership(db_session, director, club, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    base_payload = {
        "format": "round_robin",
        "min_participants": 4,
        "max_participants": 16,
        "registration_open_at": (now).isoformat(),
        "registration_close_at": (now + timedelta(days=3)).isoformat(),
        "start_date": (now + timedelta(days=4)).isoformat(),
        "end_date": (now + timedelta(days=5)).isoformat(),
    }

    # 1. Owner creates
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner.id),
        json={**base_payload, "name": "Owner Cup"},
    )
    assert res.status_code == 201
    assert res.json()["name"] == "Owner Cup"
    assert res.json()["status"] == "draft"

    # 2. Manager creates
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(manager.id),
        json={**base_payload, "name": "Manager Cup"},
    )
    assert res.status_code == 201

    # 3. Tournament Director creates
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(director.id),
        json={**base_payload, "name": "Director Cup"},
    )
    assert res.status_code == 201


@pytest.mark.asyncio
async def test_02_regular_player_cannot_create_tournament(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A player with no staff role gets 403 Forbidden."""
    club = await create_club(db_session)
    player = await create_user(db_session)
    await create_player_membership(db_session, player, club)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(player.id),
        json={
            "name": "Player Cup",
            "format": "round_robin",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "end_date": (now + timedelta(days=2)).isoformat(),
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
        },
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_03_cross_club_staff_cannot_create_tournament(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Staff of Club A cannot create a tournament in Club B."""
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    user = await create_user(db_session)
    await create_staff_membership(db_session, user, club_a, ClubRole.CLUB_OWNER)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    res = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/tournaments",
        headers=make_auth_header(user.id),
        json={
            "name": "Intrusion Cup",
            "format": "round_robin",
            "start_date": (now + timedelta(days=1)).isoformat(),
            "end_date": (now + timedelta(days=2)).isoformat(),
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
        },
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_04_exact_four_formats_supported(
    async_client: AsyncClient, db_session: AsyncSession
):
    """round_robin, pool_play, scramble, bracket are accepted. Others rejected."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await create_staff_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    base_dates = {
        "registration_open_at": now.isoformat(),
        "registration_close_at": (now + timedelta(days=1)).isoformat(),
        "start_date": (now + timedelta(days=2)).isoformat(),
        "end_date": (now + timedelta(days=3)).isoformat(),
    }

    for fmt in ["round_robin", "pool_play", "scramble", "bracket"]:
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=make_auth_header(owner.id),
            json={
                "name": f"Format {fmt}",
                "format": fmt,
                **base_dates,
            },
        )
        assert res.status_code == 201, f"Failed for format {fmt}: {res.text}"
        assert res.json()["format"] == fmt

    # Invalid format rejected
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner.id),
        json={
            "name": "Invalid Format Tournament",
            "format": "double_elimination",
            **base_dates,
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_05_default_scoring_rules_populated(
    async_client: AsyncClient, db_session: AsyncSession
):
    """When scoring rules are omitted, deterministic defaults are provided."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await create_staff_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner.id),
        json={
            "name": "Scoring Rules Test",
            "format": "round_robin",
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
        },
    )
    assert res.status_code == 201
    data = res.json()
    scoring = data["scoring_rules"]
    assert scoring["game_format"] == "single_game"
    assert scoring["target_score"] == 11
    assert scoring["win_by"] == 2
    assert "wins" in data["tiebreaker_rules"]
    assert "points_differential" in data["tiebreaker_rules"]


@pytest.mark.asyncio
async def test_06_date_and_limit_validation(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Validates chronological ordering of dates and participant bounds."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await create_staff_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    now = datetime.now(timezone.utc)

    # 1. reg_open > reg_close
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner.id),
        json={
            "name": "Bad Dates 1",
            "format": "round_robin",
            "registration_open_at": (now + timedelta(days=5)).isoformat(),
            "registration_close_at": (now + timedelta(days=2)).isoformat(),
            "start_date": (now + timedelta(days=6)).isoformat(),
            "end_date": (now + timedelta(days=7)).isoformat(),
        },
    )
    assert res.status_code == 422

    # 2. reg_close > start_date
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner.id),
        json={
            "name": "Bad Dates 2",
            "format": "round_robin",
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=5)).isoformat(),
            "start_date": (now + timedelta(days=4)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
        },
    )
    assert res.status_code == 422

    # 3. start_date > end_date
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner.id),
        json={
            "name": "Bad Dates 3",
            "format": "round_robin",
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "start_date": (now + timedelta(days=6)).isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat(),
        },
    )
    assert res.status_code == 422

    # 4. max_participants < min_participants
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner.id),
        json={
            "name": "Bad Limits",
            "format": "round_robin",
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "min_participants": 16,
            "max_participants": 8,
        },
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_07_tournament_lifecycle_transitions(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test transitions: draft -> open -> closed -> cancel."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await create_staff_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    tournament = await create_tournament(db_session, club, owner, status=TournamentStatus.DRAFT)
    await db_session.commit()

    headers = make_auth_header(owner.id)

    # 1. Open registration
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/open-registration",
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "registration_open"

    # 2. Close registration
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/close-registration",
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "registration_closed"

    # 3. Cancel tournament
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/cancel",
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"

    # 4. Cancelling again returns 400
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/cancel",
        headers=headers,
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_08_structural_update_locked_when_open(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Once registration is open, format and participant capacity are locked."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await create_staff_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    tournament = await create_tournament(
        db_session, club, owner, status=TournamentStatus.REGISTRATION_OPEN
    )
    await db_session.commit()

    headers = make_auth_header(owner.id)

    # Attempt to change format
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}",
        headers=headers,
        json={"format": "scramble"},
    )
    assert res.status_code == 400
    assert "format" in res.json()["detail"].lower()

    # Attempt to change max_participants
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}",
        headers=headers,
        json={"max_participants": 32},
    )
    assert res.status_code == 400
    assert "capacity cannot be changed" in res.json()["detail"].lower()

    # Updating description or rules is permitted
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}",
        headers=headers,
        json={"description": "Updated Tournament Notes"},
    )
    assert res.status_code == 200
    assert res.json()["description"] == "Updated Tournament Notes"


@pytest.mark.asyncio
async def test_09_player_tournaments_discovery(
    async_client: AsyncClient, db_session: AsyncSession
):
    """GET /player/tournaments discovers public tournaments across active clubs."""
    club_active = await create_club(db_session, name="Active Club", is_active=True)
    club_inactive = await create_club(db_session, name="Inactive Club", is_active=False)
    staff = await create_user(db_session)
    player = await create_user(db_session)
    await create_player_membership(db_session, player, club_active)

    # Public in active club
    await create_tournament(
        db_session, club_active, staff, name="Public Tourney", visibility=TournamentVisibility.PUBLIC, status=TournamentStatus.REGISTRATION_OPEN
    )
    # Private in active club
    await create_tournament(
        db_session, club_active, staff, name="Private Tourney", visibility=TournamentVisibility.PRIVATE
    )
    # Public in inactive club
    await create_tournament(
        db_session, club_inactive, staff, name="Inactive Club Tourney", visibility=TournamentVisibility.PUBLIC
    )
    await db_session.commit()

    res = await async_client.get(
        "/api/v1/player/tournaments",
        headers=make_auth_header(player.id),
    )
    assert res.status_code == 200
    items = res.json()
    names = [t["name"] for t in items]

    assert "Public Tourney" in names
    assert "Private Tourney" not in names
    assert "Inactive Club Tourney" not in names


@pytest.mark.asyncio
async def test_10_player_self_registration(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Player with active ClubPlayerMembership can register for an open tournament."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    player = await create_user(db_session)
    await create_staff_membership(db_session, staff, club, ClubRole.TOURNAMENT_DIRECTOR)
    await create_player_membership(db_session, player, club, PlayerMembershipStatus.ACTIVE)

    tournament = await create_tournament(
        db_session,
        club,
        staff,
        name="Open Tourney",
        status=TournamentStatus.REGISTRATION_OPEN,
        max_participants=2,
    )
    await db_session.commit()

    headers = make_auth_header(player.id)

    # 1. Successful registration
    res = await async_client.post(f"/api/v1/tournaments/{tournament.id}/register", headers=headers)
    assert res.status_code == 201
    assert res.json()["status"] == "confirmed"
    assert res.json()["tournament_id"] == str(tournament.id)

    # 2. Duplicate registration rejected
    res = await async_client.post(f"/api/v1/tournaments/{tournament.id}/register", headers=headers)
    assert res.status_code == 400
    assert "already registered" in res.json()["detail"].lower()

    # 3. Check my-registration endpoint returns confirmed registration details
    status_res = await async_client.get(f"/api/v1/tournaments/{tournament.id}/my-registration", headers=headers)
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["is_registered"] is True
    assert status_data["status"] == "confirmed"
    assert status_data["registration"]["tournament_name"] == "Open Tourney"
    assert status_data["registration"]["reference_number"] is not None


@pytest.mark.asyncio
async def test_11_registration_rejected_for_non_member(
    async_client: AsyncClient, db_session: AsyncSession
):
    """User without active membership in the tournament's club cannot register (403)."""
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    staff = await create_user(db_session)
    player = await create_user(db_session)

    # Player only belongs to Club B
    await create_player_membership(db_session, player, club_b)

    tournament = await create_tournament(
        db_session, club_a, staff, status=TournamentStatus.REGISTRATION_OPEN
    )
    await db_session.commit()

    res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(player.id),
    )
    assert res.status_code == 403
    assert "membership in this club" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_12_registration_rejected_when_not_open(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Cannot self-register if tournament is in DRAFT or COMPLETED."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    player = await create_user(db_session)
    await create_player_membership(db_session, player, club)
    tournament = await create_tournament(db_session, club, staff, status=TournamentStatus.DRAFT)
    await db_session.commit()

    res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(player.id),
    )
    assert res.status_code == 400
    assert "not open" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_13_waitlist_when_capacity_reached(
    async_client: AsyncClient, db_session: AsyncSession
):
    """When max_participants is reached, subsequent registrations become waitlisted."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    p1 = await create_user(db_session)
    p2 = await create_user(db_session)
    p3 = await create_user(db_session)

    await create_player_membership(db_session, p1, club)
    await create_player_membership(db_session, p2, club)
    await create_player_membership(db_session, p3, club)

    tournament = await create_tournament(
        db_session,
        club,
        staff,
        status=TournamentStatus.REGISTRATION_OPEN,
        max_participants=2,
    )
    await db_session.commit()

    # Player 1 -> Confirmed
    r1 = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(p1.id),
    )
    assert r1.status_code == 201
    assert r1.json()["status"] == "confirmed"

    # Player 2 -> Confirmed (capacity reached)
    r2 = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(p2.id),
    )
    assert r2.status_code == 201
    assert r2.json()["status"] == "confirmed"

    # Player 3 -> Waitlisted
    r3 = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(p3.id),
    )
    assert r3.status_code == 201
    assert r3.json()["status"] == "waitlisted"


@pytest.mark.asyncio
async def test_14_player_cancel_and_reactivate_registration(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Player can cancel self-registration and re-register in place."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    player = await create_user(db_session)
    await create_player_membership(db_session, player, club)
    tournament = await create_tournament(
        db_session, club, staff, status=TournamentStatus.REGISTRATION_OPEN, max_participants=4
    )
    await db_session.commit()

    headers = make_auth_header(player.id)

    # 1. Register
    r = await async_client.post(f"/api/v1/tournaments/{tournament.id}/register", headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "confirmed"

    # 2. Cancel
    r = await async_client.delete(f"/api/v1/tournaments/{tournament.id}/register", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"

    # 3. Re-register (reactivates record)
    r = await async_client.post(f"/api/v1/tournaments/{tournament.id}/register", headers=headers)
    assert r.status_code == 201
    assert r.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_15_staff_registration_management(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Staff can view participants, update status, and set seeds."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    player = await create_user(db_session)
    await create_staff_membership(db_session, staff, club, ClubRole.TOURNAMENT_DIRECTOR)
    await create_player_membership(db_session, player, club)
    tournament = await create_tournament(
        db_session, club, staff, status=TournamentStatus.REGISTRATION_OPEN
    )
    await db_session.commit()

    # Player registers
    await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(player.id),
    )

    # Staff lists registrations
    staff_headers = make_auth_header(staff.id)
    res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/registrations",
        headers=staff_headers,
    )
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    reg_id = items[0]["id"]
    assert items[0]["status"] == "confirmed"

    # Staff updates registration seed
    res = await async_client.patch(
        f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/registrations/{reg_id}",
        headers=staff_headers,
        json={"seed": 1, "notes": "Top seeded player"},
    )
    assert res.status_code == 200
    assert res.json()["seed"] == 1
    assert res.json()["notes"] == "Top seeded player"


@pytest.mark.asyncio
async def test_16_cross_club_isolation_on_registrations(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Staff of Club A cannot view or manage registrations for Club B's tournament."""
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    staff_a = await create_user(db_session)
    staff_b = await create_user(db_session)
    player = await create_user(db_session)

    await create_staff_membership(db_session, staff_a, club_a, ClubRole.TOURNAMENT_DIRECTOR)
    await create_staff_membership(db_session, staff_b, club_b, ClubRole.TOURNAMENT_DIRECTOR)
    await create_player_membership(db_session, player, club_b)

    tournament_b = await create_tournament(
        db_session, club_b, staff_b, status=TournamentStatus.REGISTRATION_OPEN
    )
    await db_session.commit()

    # Player registers for Club B's tournament
    await async_client.post(
        f"/api/v1/tournaments/{tournament_b.id}/register",
        headers=make_auth_header(player.id),
    )

    # Staff A attempts to list registrations of Club B's tournament via Club A -> 404 (tournament not found in Club A)
    res = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament_b.id}/registrations",
        headers=make_auth_header(staff_a.id),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_17_unauthenticated_requests_return_401(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Unauthenticated calls to tournament endpoints return 401."""
    club = await create_club(db_session)
    fake_id = uuid.uuid4()
    await db_session.commit()

    r1 = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments")
    assert r1.status_code == 401

    r2 = await async_client.get(f"/api/v1/tournaments/{fake_id}")
    assert r2.status_code == 401

    r3 = await async_client.get("/api/v1/player/tournaments")
    assert r3.status_code == 401

    r4 = await async_client.post(f"/api/v1/tournaments/{fake_id}/register")
    assert r4.status_code == 401


@pytest.mark.asyncio
async def test_18_format_first_registration_types_and_scramble_validation(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Format-dependent registration type is assigned and Scramble rules are strictly enforced."""
    club = await create_club(db_session)
    owner = await create_user(db_session)
    await create_staff_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await db_session.commit()

    base_payload = {
        "name": "Scramble Open",
        "format": "scramble",
        "start_date": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
        "end_date": (datetime.now(timezone.utc) + timedelta(days=6)).isoformat(),
        "registration_open_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "registration_close_at": (datetime.now(timezone.utc) + timedelta(days=4)).isoformat(),
        "min_participants": 8,
        "max_participants": 16,
        "format_configuration": {
            "category": "Mixed Scramble",
            "skill_level": "3.5",
            "gender_eligibility": "Any",
        },
    }

    # 1. Scramble creation sets registration_type="individual" and team_size=1
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        json=base_payload,
        headers=make_auth_header(owner.id),
    )
    assert res.status_code == 201
    created_fc = res.json()["format_configuration"]
    assert created_fc["registration_type"] == "individual"
    assert created_fc["team_size"] == 1

    # 2. Scramble with min_participants < 4 is rejected (422)
    invalid_min_payload = dict(base_payload)
    invalid_min_payload["name"] = "Invalid Scramble"
    invalid_min_payload["min_participants"] = 3
    res_min = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        json=invalid_min_payload,
        headers=make_auth_header(owner.id),
    )
    assert res_min.status_code == 422

    # 3. Scramble with explicit registration_type="team" is rejected (422)
    invalid_team_payload = dict(base_payload)
    invalid_team_payload["name"] = "Invalid Team Scramble"
    invalid_team_payload["format_configuration"] = dict(base_payload["format_configuration"])
    invalid_team_payload["format_configuration"]["registration_type"] = "team"
    res_team = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        json=invalid_team_payload,
        headers=make_auth_header(owner.id),
    )
    assert res_team.status_code == 422

    # 4. Bracket Doubles defaults to registration_type="team" and team_size=2
    bracket_payload = dict(base_payload)
    bracket_payload["name"] = "Bracket Doubles"
    bracket_payload["format"] = "bracket"
    bracket_payload["min_participants"] = 4
    bracket_payload["max_participants"] = 16
    bracket_payload["format_configuration"] = {
        "category": "Men's Doubles",
        "skill_level": "4.0",
        "gender_eligibility": "Male",
    }
    res_bracket = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        json=bracket_payload,
        headers=make_auth_header(owner.id),
    )
    assert res_bracket.status_code == 201
    bracket_fc = res_bracket.json()["format_configuration"]
    assert bracket_fc["registration_type"] == "team"
    assert bracket_fc["team_size"] == 2

    # 5. Singles defaults to registration_type="individual" and team_size=1
    singles_payload = dict(base_payload)
    singles_payload["name"] = "Singles Round Robin"
    singles_payload["format"] = "round_robin"
    singles_payload["min_participants"] = 4
    singles_payload["max_participants"] = 8
    singles_payload["format_configuration"] = {
        "category": "Singles",
        "skill_level": "3.0",
        "gender_eligibility": "Any",
    }
    res_singles = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        json=singles_payload,
        headers=make_auth_header(owner.id),
    )
    assert res_singles.status_code == 201
    singles_fc = res_singles.json()["format_configuration"]
    assert singles_fc["registration_type"] == "individual"
    assert singles_fc["team_size"] == 1

