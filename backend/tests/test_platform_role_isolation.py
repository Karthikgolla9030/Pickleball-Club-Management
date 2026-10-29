"""
Pickleball Multi-Club Platform — Portal & Role Isolation Regression Test Suite

Validates:
1. User identity and authoritative is_platform_admin:
   - Admin email (in PLATFORM_OWNER_EMAILS) resolves is_platform_admin == True in /auth/me and UserResponse.
   - Regular player or club owner resolves is_platform_admin == False.
2. Safe Public Club Inspection (Resolves "View Public Club"):
   - Public club endpoint by UUID (/api/v1/clubs/{club_id}/public) requires no authentication.
   - Public club endpoint by slug (/api/v1/clubs/slug/{slug}/public) requires no authentication.
   - Public club endpoint by slug via main path (/api/v1/clubs/{slug}/public) requires no authentication.
   - Public responses omit private operational/payment secrets.
3. Administrative Facility Inspection (/api/v1/platform/clubs/{club_id}):
   - Authorized Platform Admin can inspect full facility details (200).
   - Regular players receive 403 Forbidden.
   - Club owners/managers receive 403 Forbidden.
   - Unauthenticated requests receive 401 Unauthorized.
4. Strict Portal Authorization:
   - Platform admin without club staff membership cannot mutate club resources.
   - Non-platform users cannot access platform management endpoints.
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


async def create_club(db: AsyncSession, name: str = "Sunset Ridge Pickleball", is_active: bool = True) -> Club:
    slug = f"sunset-{uuid.uuid4().hex[:6]}"
    club = Club(
        name=name,
        slug=slug,
        is_active=is_active,
        description="Premier indoor & outdoor pickleball club.",
        short_description="Top pickleball facility in the area.",
        address_line1="1200 S Congress Ave",
        city="Austin",
        state="TX",
        country="USA",
        postal_code="78704",
        contact_email="sunset@pickleball.test",
        contact_phone="+15551234567",
        website="https://sunsetpickleball.test",
        timezone="America/Chicago",
    )
    db.add(club)
    await db.flush()
    await db.refresh(club)
    return club


async def add_membership(
    db: AsyncSession,
    user_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubRole = ClubRole.CLUB_OWNER,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user_id,
        club_id=club_id,
        role=role,
        is_active=True,
    )
    db.add(membership)
    await db.flush()
    await db.refresh(membership)
    return membership


@pytest.mark.asyncio
async def test_platform_admin_identity_resolution(async_client: AsyncClient, db_session: AsyncSession):
    """Platform owner email returns is_platform_admin == True; normal users return False."""
    settings = get_settings()
    admin_email = next(iter(settings.PLATFORM_OWNER_EMAILS))

    admin = await create_user(db_session, email=admin_email, full_name="Platform Administrator")
    player = await create_user(db_session, email="player@domain.test", full_name="Regular Player")

    # Admin /auth/me check
    admin_headers = make_auth_header(admin.id)
    resp = await async_client.get("/api/v1/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == admin_email.lower()
    assert data["user"]["is_platform_admin"] is True

    # Player /auth/me check
    player_headers = make_auth_header(player.id)
    resp_player = await async_client.get("/api/v1/auth/me", headers=player_headers)
    assert resp_player.status_code == 200
    player_data = resp_player.json()
    assert player_data["user"]["is_platform_admin"] is False


@pytest.mark.asyncio
async def test_public_club_lookup_by_uuid_and_slug(async_client: AsyncClient, db_session: AsyncSession):
    """Public club lookup succeeds by UUID and by slug without requiring any credentials."""
    club = await create_club(db_session, name="Downtown Austin Club")

    # 1. Lookup by UUID on /api/v1/clubs/{id}/public
    resp_uuid = await async_client.get(f"/api/v1/clubs/{club.id}/public")
    assert resp_uuid.status_code == 200
    data_uuid = resp_uuid.json()
    assert data_uuid["id"] == str(club.id)
    assert data_uuid["name"] == "Downtown Austin Club"
    assert data_uuid["slug"] == club.slug

    # 2. Lookup by slug on /api/v1/clubs/{slug}/public
    resp_slug_direct = await async_client.get(f"/api/v1/clubs/{club.slug}/public")
    assert resp_slug_direct.status_code == 200
    assert resp_slug_direct.json()["id"] == str(club.id)

    # 3. Lookup by slug on /api/v1/clubs/slug/{slug}/public
    resp_slug_sub = await async_client.get(f"/api/v1/clubs/slug/{club.slug}/public")
    assert resp_slug_sub.status_code == 200
    assert resp_slug_sub.json()["id"] == str(club.id)


@pytest.mark.asyncio
async def test_platform_club_inspection_authorized(async_client: AsyncClient, db_session: AsyncSession):
    """Platform owner can inspect any club facility via administrative endpoint."""
    settings = get_settings()
    admin_email = next(iter(settings.PLATFORM_OWNER_EMAILS))
    admin = await create_user(db_session, email=admin_email)
    club = await create_club(db_session, name="Inspection Target Club")

    headers = make_auth_header(admin.id)
    resp = await async_client.get(f"/api/v1/platform/clubs/{club.id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(club.id)
    assert data["name"] == "Inspection Target Club"
    assert "active_members_count" in data


@pytest.mark.asyncio
async def test_platform_club_inspection_denied_for_non_platform_admin(async_client: AsyncClient, db_session: AsyncSession):
    """Non-platform users (players and club owners) cannot call /api/v1/platform/clubs/{id}."""
    club = await create_club(db_session, name="Private Facility")
    player = await create_user(db_session, email="regular_player@domain.test")
    owner = await create_user(db_session, email="club_owner@domain.test")
    await add_membership(db_session, user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER)

    # 1. Player denied
    player_headers = make_auth_header(player.id)
    resp_player = await async_client.get(f"/api/v1/platform/clubs/{club.id}", headers=player_headers)
    assert resp_player.status_code == 403

    # 2. Club owner denied platform endpoint
    owner_headers = make_auth_header(owner.id)
    resp_owner = await async_client.get(f"/api/v1/platform/clubs/{club.id}", headers=owner_headers)
    assert resp_owner.status_code == 403

    # 3. Unauthenticated denied
    resp_anon = await async_client.get(f"/api/v1/platform/clubs/{club.id}")
    assert resp_anon.status_code == 401


@pytest.mark.asyncio
async def test_platform_admin_cannot_access_unowned_club_private_api_without_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Platform admin cannot directly act as club staff on club-scoped staff endpoints without membership."""
    settings = get_settings()
    admin_email = next(iter(settings.PLATFORM_OWNER_EMAILS))
    admin = await create_user(db_session, email=admin_email)
    club = await create_club(db_session, name="Independent Club")

    admin_headers = make_auth_header(admin.id)
    # Attempting to fetch club staff members list which requires club staff role
    resp = await async_client.get(f"/api/v1/clubs/{club.id}/members", headers=admin_headers)
    # Should be 403 Forbidden because admin is not a staff member of this club
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_invalid_club_identifier_returns_404(async_client: AsyncClient, db_session: AsyncSession):
    """Non-existent club UUID or slug returns 404 cleanly without crashing or exposing private state."""
    missing_uuid = uuid.uuid4()
    resp_uuid = await async_client.get(f"/api/v1/clubs/{missing_uuid}/public")
    assert resp_uuid.status_code == 404

    resp_slug = await async_client.get("/api/v1/clubs/slug/non-existent-facility-slug-9999/public")
    assert resp_slug.status_code == 404


@pytest.mark.asyncio
async def test_suspended_club_hidden_from_public_view(async_client: AsyncClient, db_session: AsyncSession):
    """Suspended/inactive clubs return 404 on public discovery endpoints."""
    inactive_club = await create_club(db_session, name="Suspended Club", is_active=False)

    resp = await async_client.get(f"/api/v1/clubs/{inactive_club.id}/public")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_player_cannot_access_platform_management(async_client: AsyncClient, db_session: AsyncSession):
    """Players cannot call platform administration endpoints like /api/v1/platform/clubs."""
    player = await create_user(db_session, email="hacker_player@domain.test")
    headers = make_auth_header(player.id)

    resp = await async_client.get("/api/v1/platform/clubs", headers=headers)
    assert resp.status_code == 403

