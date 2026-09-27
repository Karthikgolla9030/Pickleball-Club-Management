"""
Aught2 Pickleball — Tournament Registration Flow Integration Tests

Validates:
  - Scramble individual registration (no partners, rotating notice)
  - Scramble Men's / Women's gender division validation
  - Singles registration for Round Robin, Pool Play, Bracket
  - Doubles registration with partner and Team creation
  - Mixed Doubles gender balance validation
  - Full capacity waitlisting
  - Partner member eligibility checks
  - Eligible partners search endpoint
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


async def create_club(db: AsyncSession, name: str = "Test Club") -> Club:
    uid = uuid.uuid4().hex[:6]
    club = Club(name=f"{name} {uid}", slug=f"club-{uid}", is_active=True)
    db.add(club)
    await db.flush()
    return club


async def create_player_membership(
    db: AsyncSession,
    user: User,
    club: Club,
    status: PlayerMembershipStatus = PlayerMembershipStatus.ACTIVE,
) -> ClubPlayerMembership:
    membership = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        status=status,
        membership_number=f"MEM-{uuid.uuid4().hex[:6].upper()}",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(membership)
    await db.flush()
    return membership


async def set_player_profile(
    db: AsyncSession,
    user: User,
    gender: str = "Male",
) -> PlayerProfile:
    profile = PlayerProfile(
        user_id=user.id,
        display_name=user.full_name or "Player",
        gender=gender,
    )
    db.add(profile)
    await db.flush()
    return profile


async def create_tournament(
    db: AsyncSession,
    club: Club,
    created_by: User,
    name: str = "Test Tournament",
    format: TournamentFormat = TournamentFormat.ROUND_ROBIN,
    status: TournamentStatus = TournamentStatus.REGISTRATION_OPEN,
    max_participants: int = 16,
    format_configuration: dict | None = None,
) -> Tournament:
    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club.id,
        name=name,
        format=format,
        status=status,
        visibility=TournamentVisibility.PUBLIC,
        min_participants=2,
        max_participants=max_participants,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=5),
        created_by_user_id=created_by.id,
        format_configuration=format_configuration,
    )
    db.add(t)
    await db.flush()
    return t


@pytest.mark.asyncio
async def test_scramble_registration_flow(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test Scramble individual registration rejects partners and accepts single player."""
    club = await create_club(db_session, "Scramble Club")
    staff = await create_user(db_session, full_name="Director")
    player = await create_user(db_session, full_name="Karthik Golla")
    await create_player_membership(db_session, player, club)
    await set_player_profile(db_session, player, gender="Male")

    tournament = await create_tournament(
        db_session,
        club,
        staff,
        name="Downtown Weekend Scramble",
        format=TournamentFormat.SCRAMBLE,
        format_configuration={
            "category": "Open Scramble",
            "registration_type": "individual",
            "entry_fee": 35,
        },
    )
    await db_session.commit()

    # 1. Partner registration attempt on scramble must be rejected (400)
    fake_partner_id = str(uuid.uuid4())
    bad_res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={
            "partner_membership_id": fake_partner_id,
            "team_name": "Scramble Duo",
        },
        headers=make_auth_header(player.id),
    )
    assert bad_res.status_code == 400
    assert "individual" in bad_res.json()["detail"].lower()

    # 2. Valid individual registration
    reg_res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={
            "skill_level": "3.5",
            "gender": "Male",
            "age": 25,
            "payment_method": "online",
        },
        headers=make_auth_header(player.id),
    )
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert data["status"] == "confirmed"
    assert data["registration_type"] == "individual"
    assert data["reference_number"] is not None
    assert data["reference_number"].startswith("REG-")
    assert data["fee_amount"] == 35.0
    assert data["payment_status"] == "completed"


@pytest.mark.asyncio
async def test_scramble_gender_division_enforcement(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test Men's Scramble rejects female participant."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    female_player = await create_user(db_session, full_name="Jane Doe")
    await create_player_membership(db_session, female_player, club)
    await set_player_profile(db_session, female_player, gender="Female")

    tournament = await create_tournament(
        db_session,
        club,
        staff,
        name="Men's Special Scramble",
        format=TournamentFormat.SCRAMBLE,
        format_configuration={
            "category": "Men's Scramble",
            "registration_type": "individual",
            "entry_fee": 35,
        },
    )
    await db_session.commit()

    # Register as Female for Men's Scramble -> 400
    res = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={"gender": "Female", "skill_level": "3.5"},
        headers=make_auth_header(female_player.id),
    )
    assert res.status_code == 400
    assert "male" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_round_robin_singles_and_doubles(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test Round Robin singles flow and doubles partner team registration."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    player1 = await create_user(db_session, full_name="Alex Pickler")
    player2 = await create_user(db_session, full_name="Bob Smasher")
    mem1 = await create_player_membership(db_session, player1, club)
    mem2 = await create_player_membership(db_session, player2, club)
    await set_player_profile(db_session, player1, gender="Male")
    await set_player_profile(db_session, player2, gender="Male")

    # 1. Singles
    singles_tourney = await create_tournament(
        db_session,
        club,
        staff,
        name="Aught2 Fall Singles Open",
        format=TournamentFormat.ROUND_ROBIN,
        format_configuration={
            "category": "Singles",
            "registration_type": "individual",
            "skill_level": "4.0",
            "entry_fee": 30,
        },
    )
    await db_session.commit()

    res1 = await async_client.post(
        f"/api/v1/tournaments/{singles_tourney.id}/register",
        json={"skill_level": "4.0", "gender": "Male", "age": 22},
        headers=make_auth_header(player1.id),
    )
    assert res1.status_code == 201
    assert res1.json()["registration_type"] == "individual"
    assert res1.json()["fee_amount"] == 30.0

    # 2. Men's Doubles with partner
    doubles_tourney = await create_tournament(
        db_session,
        club,
        staff,
        name="Aught2 Men's Doubles Open",
        format=TournamentFormat.ROUND_ROBIN,
        format_configuration={
            "category": "Men's Doubles",
            "registration_type": "team",
            "entry_fee": 50,
        },
    )
    await db_session.commit()

    # Query eligible partners
    partners_res = await async_client.get(
        f"/api/v1/tournaments/{doubles_tourney.id}/eligible-partners",
        headers=make_auth_header(player1.id),
    )
    assert partners_res.status_code == 200
    partners_list = partners_res.json()
    assert any(p["user_id"] == str(player2.id) for p in partners_list)

    # Register team
    res2 = await async_client.post(
        f"/api/v1/tournaments/{doubles_tourney.id}/register",
        json={
            "team_name": "The Smashers",
            "partner_membership_id": str(mem2.id),
            "skill_level": "4.0",
            "gender": "Male",
        },
        headers=make_auth_header(player1.id),
    )
    assert res2.status_code == 201
    doubles_data = res2.json()
    assert doubles_data["registration_type"] == "team"
    assert doubles_data["team_name"] == "The Smashers"
    assert doubles_data["team_id"] is not None
    assert doubles_data["partner_name"] == "Bob Smasher"


@pytest.mark.asyncio
async def test_mixed_doubles_and_waitlist(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Test Mixed Doubles requires one male and one female, and handles waitlist."""
    club = await create_club(db_session)
    staff = await create_user(db_session)
    male_user = await create_user(db_session, full_name="John Doe")
    male_partner = await create_user(db_session, full_name="Jack Doe")
    female_partner = await create_user(db_session, full_name="Jill Smith")

    male_mem = await create_player_membership(db_session, male_user, club)
    male_partner_mem = await create_player_membership(db_session, male_partner, club)
    female_partner_mem = await create_player_membership(db_session, female_partner, club)

    await set_player_profile(db_session, male_user, gender="Male")
    await set_player_profile(db_session, male_partner, gender="Male")
    await set_player_profile(db_session, female_partner, gender="Female")

    tournament = await create_tournament(
        db_session,
        club,
        staff,
        name="Summer Pool Play Showcase",
        format=TournamentFormat.POOL_PLAY,
        max_participants=2,  # max 2 players = 1 team
        format_configuration={
            "category": "Mixed Doubles",
            "registration_type": "team",
            "entry_fee": 50,
        },
    )
    await db_session.commit()

    # 1. Invalid gender pairing: Male + Male in Mixed Doubles -> 400
    res_bad = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={
            "team_name": "Invalid Team",
            "partner_membership_id": str(male_partner_mem.id),
            "gender": "Male",
        },
        headers=make_auth_header(male_user.id),
    )
    assert res_bad.status_code == 400
    assert "mixed doubles" in res_bad.json()["detail"].lower()

    # 2. Valid pairing: Male + Female in Mixed Doubles -> Confirmed
    res_ok = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={
            "team_name": "SVCE Picklers",
            "partner_membership_id": str(female_partner_mem.id),
            "gender": "Male",
        },
        headers=make_auth_header(male_user.id),
    )
    assert res_ok.status_code == 201
    assert res_ok.json()["status"] == "confirmed"

    # 3. Next registration must be waitlisted because capacity (2) is reached
    other_player = await create_user(db_session, full_name="Extra Player")
    await create_player_membership(db_session, other_player, club)
    await set_player_profile(db_session, other_player, gender="Male")
    await db_session.commit()

    res_wait = await async_client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        json={"gender": "Male"},
        headers=make_auth_header(other_player.id),
    )
    assert res_wait.status_code == 201
    assert res_wait.json()["status"] == "waitlisted"

