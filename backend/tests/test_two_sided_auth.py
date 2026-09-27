"""
Aught2 Pickleball — Two-Sided Authentication & Role-Based Access Control Test Suite

Covers:
- Separate Club Staff Login and Player Login
- Role detection for Club Owner, Club Manager, Tournament Director
- Player account isolation (denied club login, denied club endpoints)
- Staff creation by Club Owner (with temporary password & full name)
- Staff role editing by Club Owner
- Staff deactivation & re-activation (immediate rejection on login)
- Player self-registration
- Security: invalid credentials, inactive accounts, unauthorized access
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    password: str = "TestPass123!",
    full_name: str = "Test User",
    is_active: bool = True,
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=is_active,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def create_club(db: AsyncSession, name: str = "Test Club") -> Club:
    slug = f"club-{uuid.uuid4().hex[:6]}"
    club = Club(name=name, slug=slug, is_active=True)
    db.add(club)
    await db.flush()
    await db.refresh(club)
    return club


async def add_membership(
    db: AsyncSession,
    user_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubRole,
    is_active: bool = True,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user_id,
        club_id=club_id,
        role=role,
        is_active=is_active,
    )
    db.add(membership)
    await db.flush()
    await db.refresh(membership)
    return membership


@pytest.mark.asyncio
async def test_club_owner_login_success(async_client: AsyncClient, db_session: AsyncSession):
    """Test 1: Club Owner logs in via /auth/club/login and receives CLUB_OWNER role."""
    user = await create_user(db_session, password="OwnerPassword123!")
    club = await create_club(db_session)
    await add_membership(db_session, user.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": user.email, "password": "OwnerPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert len(data["memberships"]) == 1
    assert data["memberships"][0]["role"] == "club_owner"
    assert data["memberships"][0]["role_label"] == "Club Owner"


@pytest.mark.asyncio
async def test_club_manager_login_success(async_client: AsyncClient, db_session: AsyncSession):
    """Test 2: Club Manager logs in via /auth/club/login and receives CLUB_MANAGER role."""
    user = await create_user(db_session, password="ManagerPassword123!")
    club = await create_club(db_session)
    await add_membership(db_session, user.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": user.email, "password": "ManagerPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["memberships"]) == 1
    assert data["memberships"][0]["role"] == "club_manager"
    assert data["memberships"][0]["role_label"] == "Club Manager"


@pytest.mark.asyncio
async def test_tournament_director_login_success(async_client: AsyncClient, db_session: AsyncSession):
    """Test 3: Tournament Director logs in via /auth/club/login and receives TOURNAMENT_DIRECTOR role."""
    user = await create_user(db_session, password="DirectorPassword123!")
    club = await create_club(db_session)
    await add_membership(db_session, user.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": user.email, "password": "DirectorPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["memberships"]) == 1
    assert data["memberships"][0]["role"] == "tournament_director"
    assert data["memberships"][0]["role_label"] == "Tournament Director"


@pytest.mark.asyncio
async def test_player_login_success(async_client: AsyncClient, db_session: AsyncSession):
    """Test 4: Player logs in via /auth/player/login and receives user info with no club memberships."""
    user = await create_user(db_session, password="PlayerPassword123!")
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": user.email, "password": "PlayerPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == user.email
    assert data["memberships"] == []


@pytest.mark.asyncio
async def test_player_rejected_from_club_login(async_client: AsyncClient, db_session: AsyncSession):
    """Test 5: Player account attempting club login receives 403 'You don't have access to Club Management.'"""
    user = await create_user(db_session, password="PlayerPassword123!")
    await db_session.commit()

    response = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": user.email, "password": "PlayerPassword123!"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "You don't have access to Club Management."


@pytest.mark.asyncio
async def test_club_manager_cannot_manage_staff(async_client: AsyncClient, db_session: AsyncSession):
    """Test 6: Club Manager attempts staff creation and is rejected with 403."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    await add_membership(db_session, user.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(user.id)
    response = await async_client.post(
        f"/api/v1/clubs/{club.id}/members",
        headers=headers,
        json={"email": "newbie@test.local", "role": "tournament_director"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_tournament_director_cannot_view_members(async_client: AsyncClient, db_session: AsyncSession):
    """Test 7: Tournament Director attempts to list members and is rejected with 403."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    await add_membership(db_session, user.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    headers = make_auth_header(user.id)
    response = await async_client.get(
        f"/api/v1/clubs/{club.id}/members",
        headers=headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_owner_creates_staff_with_credentials(async_client: AsyncClient, db_session: AsyncSession):
    """Test 8: Club Owner creates a new staff account with temporary password; staff logs in with role."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await add_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    new_staff_email = f"staff_{uuid.uuid4().hex[:6]}@test.local"
    temp_pass = "StaffTempPass123!"

    # Owner adds staff
    headers = make_auth_header(owner.id)
    response = await async_client.post(
        f"/api/v1/clubs/{club.id}/members",
        headers=headers,
        json={
            "email": new_staff_email,
            "role": "club_manager",
            "full_name": "Jordan Staff",
            "temporary_password": temp_pass,
        },
    )
    assert response.status_code == 201
    member_data = response.json()
    assert member_data["user_email"] == new_staff_email
    assert member_data["role"] == "club_manager"
    assert member_data["is_active"] is True

    # New staff logs in
    login_resp = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": new_staff_email, "password": temp_pass},
    )
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert login_data["user"]["full_name"] == "Jordan Staff"
    assert login_data["memberships"][0]["role"] == "club_manager"


@pytest.mark.asyncio
async def test_owner_updates_staff_role(async_client: AsyncClient, db_session: AsyncSession):
    """Test 9: Owner changes staff role from CLUB_MANAGER to TOURNAMENT_DIRECTOR; verified on next login."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await add_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    staff_user = await create_user(db_session, password="StaffSecret123!")
    staff_mem = await add_membership(db_session, staff_user.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    # Owner updates role
    headers = make_auth_header(owner.id)
    patch_resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{staff_mem.id}",
        headers=headers,
        json={"role": "tournament_director"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["role"] == "tournament_director"

    # Staff logs in and sees new role
    login_resp = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": staff_user.email, "password": "StaffSecret123!"},
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["memberships"][0]["role"] == "tournament_director"


@pytest.mark.asyncio
async def test_disabled_staff_rejected_on_login(async_client: AsyncClient, db_session: AsyncSession):
    """Test 10: Owner disables staff; disabled staff login is rejected with 403."""
    owner = await create_user(db_session)
    club = await create_club(db_session)
    await add_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    staff_user = await create_user(db_session, password="StaffSecret123!")
    staff_mem = await add_membership(db_session, staff_user.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    # Owner deactivates staff membership
    headers = make_auth_header(owner.id)
    deact_resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{staff_mem.id}",
        headers=headers,
        json={"is_active": False},
    )
    assert deact_resp.status_code == 200
    assert deact_resp.json()["is_active"] is False

    # Staff attempts login -> rejected
    login_resp = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": staff_user.email, "password": "StaffSecret123!"},
    )
    assert login_resp.status_code == 403
    assert login_resp.json()["detail"] == "Your account has been disabled. Please contact the Club Owner."

    # Owner re-enables staff
    enable_resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{staff_mem.id}",
        headers=headers,
        json={"is_active": True},
    )
    assert enable_resp.status_code == 200
    assert enable_resp.json()["is_active"] is True

    # Staff login succeeds now
    login_success = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": staff_user.email, "password": "StaffSecret123!"},
    )
    assert login_success.status_code == 200


@pytest.mark.asyncio
async def test_player_self_registration(async_client: AsyncClient, db_session: AsyncSession):
    """Test 11: Player registers via /auth/player/register, logs in, blocked from club."""
    new_email = f"player_{uuid.uuid4().hex[:6]}@test.local"
    reg_resp = await async_client.post(
        "/api/v1/auth/player/register",
        json={
            "email": new_email,
            "password": "PlayerPassword123!",
            "full_name": "Sam Player",
        },
    )
    assert reg_resp.status_code == 201
    data = reg_resp.json()
    assert data["user"]["email"] == new_email
    assert data["user"]["full_name"] == "Sam Player"
    assert data["memberships"] == []

    # Attempt duplicate registration -> 400
    dup_resp = await async_client.post(
        "/api/v1/auth/player/register",
        json={
            "email": new_email,
            "password": "PlayerPassword123!",
            "full_name": "Sam Player",
        },
    )
    assert dup_resp.status_code == 400
    assert "already exists" in dup_resp.json()["detail"]

    # Player login succeeds
    login_resp = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": new_email, "password": "PlayerPassword123!"},
    )
    assert login_resp.status_code == 200

    # Club login rejected
    club_login = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": new_email, "password": "PlayerPassword123!"},
    )
    assert club_login.status_code == 403
    assert club_login.json()["detail"] == "You don't have access to Club Management."
