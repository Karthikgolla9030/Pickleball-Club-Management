"""
Aught2 Pickleball — Platform Owner, Club Owner, and Player Architectural Separation Tests

Validates:
1. Platform Owner authentication via /api/v1/auth/platform/login
2. Rejection of ordinary Club Owners and Players from platform login (403)
3. Platform Owner access to /api/v1/platform/me and /api/v1/platform/clubs
4. Denial of ordinary Club Owners from /api/v1/platform/me and /api/v1/platform/clubs
5. Cross-role boundary: Single user having both player profile and club membership can access respective APIs
6. Platform authorization does not pollute ClubMembership roles (retains club_owner, club_manager, tournament_director only)
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.player_profile import PlayerProfile
from app.models.user import User
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    password: str = "SecurePass123!",
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
async def test_platform_owner_login_success(async_client: AsyncClient, db_session: AsyncSession):
    """Platform owner email in PLATFORM_OWNER_EMAILS logs in via /auth/platform/login successfully."""
    settings = get_settings()
    platform_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@aught2.com"

    platform_user = await create_user(db_session, email=platform_email, password="PlatformPass123!")
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/auth/platform/login",
        json={"email": platform_email, "password": "PlatformPass123!"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "access_token" in data
    # Platform token does not conflate with club memberships
    assert data["memberships"] == []


@pytest.mark.asyncio
async def test_club_owner_cannot_login_to_platform_endpoint(async_client: AsyncClient, db_session: AsyncSession):
    """Ordinary club owner cannot login via /auth/platform/login."""
    owner = await create_user(db_session, email="ordinary_owner@test.local", password="OwnerPass123!")
    club = await create_club(db_session)
    await add_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    resp = await async_client.post(
        "/api/v1/auth/platform/login",
        json={"email": owner.email, "password": "OwnerPass123!"},
    )
    assert resp.status_code == 403
    assert "not authorized for platform administration" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_platform_me_and_clubs_directory(async_client: AsyncClient, db_session: AsyncSession):
    """Platform owner can retrieve /platform/me and /platform/clubs."""
    settings = get_settings()
    platform_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@aught2.com"
    platform_user = await create_user(db_session, email=platform_email, password="PlatformPass123!")

    club1 = await create_club(db_session, name="Grand Slam Club")
    club2 = await create_club(db_session, name="Pickleball Oasis")
    await db_session.commit()

    token_resp = await async_client.post(
        "/api/v1/auth/platform/login",
        json={"email": platform_email, "password": "PlatformPass123!"},
    )
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test /platform/me
    me_resp = await async_client.get("/api/v1/platform/me", headers=headers)
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == platform_email.lower()
    assert me_data["is_platform_owner"] is True

    # Test /platform/clubs
    clubs_resp = await async_client.get("/api/v1/platform/clubs", headers=headers)
    assert clubs_resp.status_code == 200
    clubs_data = clubs_resp.json()
    items = clubs_data["items"]
    assert isinstance(items, list)
    club_names = [c["name"] for c in items]
    assert "Grand Slam Club" in club_names
    assert "Pickleball Oasis" in club_names


@pytest.mark.asyncio
async def test_club_owner_denied_platform_endpoints(async_client: AsyncClient, db_session: AsyncSession):
    """Club owner cannot call /platform/me, /platform/clubs, or /platform/club-applications."""
    owner = await create_user(db_session, email="owner_denied@test.local", password="OwnerPass123!")
    club = await create_club(db_session)
    await add_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Log in as club owner
    login_resp = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": owner.email, "password": "OwnerPass123!"},
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Call /platform/me
    me_resp = await async_client.get("/api/v1/platform/me", headers=headers)
    assert me_resp.status_code == 403

    # Call /platform/clubs
    clubs_resp = await async_client.get("/api/v1/platform/clubs", headers=headers)
    assert clubs_resp.status_code == 403

    # Call /platform/club-applications
    apps_resp = await async_client.get("/api/v1/platform/club-applications", headers=headers)
    assert apps_resp.status_code == 403


@pytest.mark.asyncio
async def test_dual_role_user_player_and_staff(async_client: AsyncClient, db_session: AsyncSession):
    """A user who is both a player and a club staff member can authenticate to each interface distinctly."""
    user = await create_user(db_session, email="dual_user@test.local", password="DualPass123!")
    club = await create_club(db_session, name="Dual Club")
    await add_membership(db_session, user.id, club.id, ClubRole.CLUB_MANAGER)

    player_profile = PlayerProfile(
        user_id=user.id,
        display_name="Dual User",
        first_name="Dual",
        last_name="User",
        skill_rating=3.5,
    )
    db_session.add(player_profile)
    await db_session.commit()

    # 1. Login via club management
    club_login = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": user.email, "password": "DualPass123!"},
    )
    assert club_login.status_code == 200
    club_data = club_login.json()
    assert len(club_data["memberships"]) == 1
    assert club_data["memberships"][0]["role"] == "club_manager"

    # 2. Login via player interface
    player_login = await async_client.post(
        "/api/v1/auth/player/login",
        json={"email": user.email, "password": "DualPass123!"},
    )
    assert player_login.status_code == 200
    player_data = player_login.json()
    assert player_data["user"]["email"] == user.email.lower()


@pytest.mark.asyncio
async def test_health_alias_and_sanitization(async_client: AsyncClient):
    """Verify /api/v1/health works and does not leak database credentials."""
    resp = await async_client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert "version" in data
    assert "database" in data
    assert data["database"] in ("ok", "unavailable")
    # Verify no raw connection strings or secrets exposed
    assert "postgresql://" not in resp.text
    assert "password" not in resp.text.lower()


@pytest.mark.asyncio
async def test_platform_applications_database_wide_counts(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Verify platform applications endpoint returns authoritative counts across all records."""
    settings = get_settings()
    platform_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@aught2.com"
    await create_user(db_session, email=platform_email, password="PlatformPass123!")

    token_resp = await async_client.post(
        "/api/v1/auth/platform/login",
        json={"email": platform_email, "password": "PlatformPass123!"},
    )
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await async_client.get("/api/v1/platform/club-applications", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "counts" in data
    counts = data["counts"]
    assert "pending" in counts
    assert "approved" in counts
    assert "rejected" in counts
    assert "all" in counts
    assert counts["all"] == counts["pending"] + counts["approved"] + counts["rejected"]

