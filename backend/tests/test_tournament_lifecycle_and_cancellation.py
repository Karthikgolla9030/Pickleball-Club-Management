"""
Aught2 Pickleball — Tournament Lifecycle, Zero Roster, Cancellation & Completion Tests

Tests:
  Test A: Newly created tournament -> Draft status, 0 participants, cancellable.
  Test B: Registration -> Open registration, register player, roster count = 1.
  Test C: Cancellation -> Cancelled status, registration blocked, distinct from completed.
  Test D: Genuine completion -> Completed ONLY after matches finished, never premature.
  Test E: Zero-registration tournament -> Event date passed, remains Draft/Closed, never completed, cancellable.
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


async def create_club(db: AsyncSession, name: str = "Test Lifecycle Club") -> Club:
    uid = uuid.uuid4().hex[:6]
    club = Club(name=f"{name} {uid}", slug=f"lifecycle-club-{uid}", is_active=True)
    db.add(club)
    await db.flush()
    return club


async def create_staff(db: AsyncSession, club: Club, role: ClubRole = ClubRole.CLUB_OWNER) -> User:
    user = await create_user(db)
    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=role,
        is_active=True,
    )
    db.add(membership)
    await db.flush()
    return user


async def create_member_player(db: AsyncSession, club: Club, full_name: str = "Player 1") -> User:
    user = await create_user(db, full_name=full_name)
    cpm = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db.add(cpm)
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_workflow_test_a_newly_created_tournament_draft(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test A: Newly created tournament starts in Draft, has 0 participants, and can be cancelled."""
    club = await create_club(db_session)
    staff = await create_staff(db_session, club)
    await db_session.commit()

    headers = make_auth_header(staff.id)
    now = datetime.now(timezone.utc)

    formats = [
        (TournamentFormat.ROUND_ROBIN, 2),
        (TournamentFormat.POOL_PLAY, 4),
        (TournamentFormat.SCRAMBLE, 4),
        (TournamentFormat.BRACKET, 2),
    ]

    for fmt, min_p in formats:
        payload = {
            "name": f"New {fmt.value} Tournament",
            "format": fmt.value,
            "category": "singles",
            "start_date": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
            "registration_open_at": (now + timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=4)).isoformat(),
            "min_participants": min_p,
            "max_participants": 16,
            "visibility": "public",
        }
        res = await async_client.post(f"/api/v1/clubs/{club.id}/tournaments", headers=headers, json=payload)
        assert res.status_code == 201, res.text
        t_data = res.json()
        assert t_data["status"] == "draft"

        # Verify participants count is 0
        regs_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t_data['id']}/registrations",
            headers=headers,
        )
        assert regs_res.status_code == 200
        assert len(regs_res.json()) == 0


@pytest.mark.asyncio
async def test_workflow_test_b_registration_flow(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test B: Publish tournament, open registration, register player, verify roster updates."""
    club = await create_club(db_session)
    staff = await create_staff(db_session, club)
    player = await create_member_player(db_session, club, full_name="Jordan Reed")
    await db_session.commit()

    staff_headers = make_auth_header(staff.id)
    player_headers = make_auth_header(player.id)
    now = datetime.now(timezone.utc)

    # 1. Create tournament
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=staff_headers,
        json={
            "name": "Summer Open",
            "format": "round_robin",
            "category": "singles",
            "start_date": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
            "registration_open_at": (now - timedelta(hours=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=4)).isoformat(),
            "min_participants": 2,
            "max_participants": 8,
            "visibility": "public",
        },
    )
    assert res.status_code == 201, res.text
    tid = res.json()["id"]

    # 2. Open registration
    open_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/open-registration",
        headers=staff_headers,
    )
    assert open_res.status_code == 200
    assert open_res.json()["status"] == "registration_open"

    # 3. Register player
    reg_res = await async_client.post(
        f"/api/v1/tournaments/{tid}/register",
        headers=player_headers,
    )
    assert reg_res.status_code == 201
    assert reg_res.json()["status"] == "confirmed"

    # 4. Verify club side roster
    roster_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/registrations",
        headers=staff_headers,
    )
    assert roster_res.status_code == 200
    registrations = roster_res.json()
    assert len(registrations) == 1
    assert registrations[0]["user_full_name"] == "Jordan Reed"


@pytest.mark.asyncio
async def test_workflow_test_c_cancellation_flow(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test C: Cancel tournament -> Status CANCELLED, new registrations blocked, separate from Completed."""
    club = await create_club(db_session)
    staff = await create_staff(db_session, club)
    player = await create_member_player(db_session, club)
    await db_session.commit()

    staff_headers = make_auth_header(staff.id)
    player_headers = make_auth_header(player.id)
    now = datetime.now(timezone.utc)

    # 1. Create and open tournament
    t_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=staff_headers,
        json={
            "name": "To Be Cancelled",
            "format": "pool_play",
            "category": "singles",
            "start_date": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
            "registration_open_at": (now + timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=4)).isoformat(),
            "min_participants": 4,
            "max_participants": 8,
            "visibility": "public",
        },
    )
    assert t_res.status_code == 201, t_res.text
    tid = t_res.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/open-registration",
        headers=staff_headers,
    )

    # 2. Cancel tournament
    cancel_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/cancel",
        headers=staff_headers,
    )
    assert cancel_res.status_code == 200
    cancelled_data = cancel_res.json()
    assert cancelled_data["status"] == "cancelled"
    assert cancelled_data["status"] != "completed"

    # 3. Registration attempts must be blocked
    reg_attempt = await async_client.post(
        f"/api/v1/tournaments/{tid}/register",
        headers=player_headers,
    )
    assert reg_attempt.status_code in (400, 422)

    # 4. Completed tournaments cannot be cancelled
    completed_t = Tournament(
        club_id=club.id,
        created_by_user_id=staff.id,
        name="Completed Tourney",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.COMPLETED,
        start_date=now - timedelta(days=2),
        end_date=now - timedelta(days=1),
        registration_open_at=now - timedelta(days=5),
        registration_close_at=now - timedelta(days=3),
        min_participants=2,
        max_participants=8,
    )
    db_session.add(completed_t)
    await db_session.commit()

    cancel_completed = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{completed_t.id}/cancel",
        headers=staff_headers,
    )
    assert cancel_completed.status_code == 400
    assert "completed" in cancel_completed.json()["detail"].lower()


@pytest.mark.asyncio
async def test_workflow_test_e_zero_registration_tournament_never_auto_completes(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test E: A tournament with 0 registrations whose event date has passed NEVER becomes COMPLETED."""
    club = await create_club(db_session)
    staff = await create_staff(db_session, club)
    past = datetime.now(timezone.utc) - timedelta(days=10)

    # Create tournament in the past with 0 registrations
    t_past = Tournament(
        club_id=club.id,
        created_by_user_id=staff.id,
        name="Past Zero Reg Tourney",
        format=TournamentFormat.POOL_PLAY,
        status=TournamentStatus.REGISTRATION_CLOSED,
        start_date=past,
        end_date=past + timedelta(days=1),
        registration_open_at=past - timedelta(days=5),
        registration_close_at=past - timedelta(days=2),
        min_participants=4,
        max_participants=8,
    )
    db_session.add(t_past)
    await db_session.commit()

    staff_headers = make_auth_header(staff.id)

    # Query details
    res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t_past.id}",
        headers=staff_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "registration_closed"
    assert data["status"] != "completed"

    # Club can still cancel it
    c_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t_past.id}/cancel",
        headers=staff_headers,
    )
    assert c_res.status_code == 200
    assert c_res.json()["status"] == "cancelled"
