"""
Comprehensive Test Suite for:
1. Dynamic Product Branding (Platform Admin setting -> Public Branding API -> All Portals)
2. Club Name Dynamic Synchronization (Club Details -> Club & Event APIs -> Player & Club Portals)
3. Multi-Club Data and Name Isolation
4. Portal Access and Public Branding Unauthenticated Access
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.fixture
async def platform_owner(db_session: AsyncSession) -> User:
    settings = get_settings()
    platform_email = (
        settings.PLATFORM_OWNER_EMAILS[0]
        if settings.PLATFORM_OWNER_EMAILS
        else "platform@aught2.com"
    )
    owner = User(
        id=uuid.uuid4(),
        email=platform_email,
        hashed_password=hash_password("SuperSecret123!"),
        full_name="Platform Administrator",
        is_active=True,
        is_verified=True,
    )
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)
    return owner


@pytest.fixture
async def player_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"player.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("PlayerSecret123!"),
        full_name="Player Seven",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def club_setup(db_session: AsyncSession) -> tuple[User, Club]:
    suffix = uuid.uuid4().hex[:6]
    owner = User(
        id=uuid.uuid4(),
        email=f"owner.{suffix}@example.com",
        hashed_password=hash_password("OwnerSecret123!"),
        full_name="Club Owner User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(owner)
    await db_session.flush()

    club = Club(
        id=uuid.uuid4(),
        name=f"Metro Pickleball Club {suffix}",
        slug=f"metro-club-{suffix}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    membership = ClubMembership(
        id=uuid.uuid4(),
        user_id=owner.id,
        club_id=club.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.commit()
    await db_session.refresh(owner)
    await db_session.refresh(club)
    return owner, club


# ─────────────────────────────────────────────────────────────────────────────
# Test Suite
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_public_branding_endpoint_unauthenticated(async_client: AsyncClient):
    """
    Test E: Public branding endpoint access without auth tokens.
    Verified: GET /api/v1/platform/branding is accessible anonymously and returns branding.
    """
    resp = await async_client.get("/api/v1/platform/branding")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "platform_name" in data
    assert "platform_support_email" in data
    assert "maintenance_mode" in data
    assert isinstance(data["platform_name"], str)
    assert len(data["platform_name"]) > 0


@pytest.mark.asyncio
async def test_platform_admin_changes_product_name_sync(
    async_client: AsyncClient,
    platform_owner: User,
    player_user: User,
):
    """
    Test C: Platform Admin changes platform_name via PATCH /api/v1/platform/settings,
    verified dynamically in GET /api/v1/platform/branding and GET /api/v1/platform/banners.
    """
    new_product_name = f"Aught2 Pickle Pro {uuid.uuid4().hex[:4]}"

    # Update platform settings as Platform Owner
    patch_resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"platform_name": new_product_name, "reason": "Branding refresh"},
        headers=make_auth_header(platform_owner),
    )
    assert patch_resp.status_code == 200, patch_resp.text
    assert patch_resp.json()["runtime_settings"]["platform_name"] == new_product_name

    # Check unauthenticated public branding endpoint immediately reflects new name
    branding_resp = await async_client.get("/api/v1/platform/branding")
    assert branding_resp.status_code == 200
    assert branding_resp.json()["platform_name"] == new_product_name

    # Check platform banners endpoint reflects new platform_name
    banner_resp = await async_client.get("/api/v1/platform/banners/player_home")
    assert banner_resp.status_code == 200
    banner_data = banner_resp.json()
    assert banner_data["platform_name"] == new_product_name


@pytest.mark.asyncio
async def test_club_name_update_and_sync(
    async_client: AsyncClient,
    club_setup: tuple[User, Club],
    db_session: AsyncSession,
):
    """
    Test B: Club dashboard and event APIs display updated club name when modified via Club Details.
    """
    owner, club = club_setup
    updated_name = f"Austin Central Courts {uuid.uuid4().hex[:4]}"

    # Club owner updates club name via PATCH /api/v1/clubs/{club_id}
    update_resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        json={"name": updated_name},
        headers=make_auth_header(owner),
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["name"] == updated_name

    # Verify GET /api/v1/clubs/{club_id} returns updated name
    get_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}",
        headers=make_auth_header(owner),
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == updated_name

    # Create an event under this club
    now = datetime.now(timezone.utc)
    event = Event(
        id=uuid.uuid4(),
        club_id=club.id,
        title="Weekly Social Play",
        description="Friendly social games",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=2),
        registration_required=True,
        registration_fee=0.0,
        currency="USD",
    )
    db_session.add(event)
    await db_session.commit()

    # Verify event detail API returns the club's updated name dynamically
    event_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/events/{event.id}",
        headers=make_auth_header(owner),
    )
    assert event_resp.status_code == 200
    event_data = event_resp.json()
    assert event_data["club_name"] == updated_name


@pytest.mark.asyncio
async def test_multiple_clubs_isolation(
    async_client: AsyncClient,
    player_user: User,
    db_session: AsyncSession,
):
    """
    Test D: Multiple clubs isolation (Club A vs Club B).
    Events and club details preserve each club's distinct saved name with zero cross-leakage.
    """
    # Create Club A and Club B
    club_a_name = f"Alpha Club {uuid.uuid4().hex[:4]}"
    club_b_name = f"Beta Club {uuid.uuid4().hex[:4]}"

    club_a = Club(id=uuid.uuid4(), name=club_a_name, slug=f"alpha-{uuid.uuid4().hex[:4]}", is_active=True)
    club_b = Club(id=uuid.uuid4(), name=club_b_name, slug=f"beta-{uuid.uuid4().hex[:4]}", is_active=True)
    db_session.add_all([club_a, club_b])
    await db_session.flush()

    now = datetime.now(timezone.utc)
    event_a = Event(
        id=uuid.uuid4(),
        club_id=club_a.id,
        title="Alpha Tournament",
        event_type=EventType.COMMUNITY,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=3),
        end_at=now + timedelta(days=3, hours=3),
        registration_required=True,
        registration_fee=25.0,
        currency="USD",
    )
    event_b = Event(
        id=uuid.uuid4(),
        club_id=club_b.id,
        title="Beta Clinic",
        event_type=EventType.CLINIC,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=4),
        end_at=now + timedelta(days=4, hours=2),
        registration_required=True,
        registration_fee=30.0,
        currency="USD",
    )
    db_session.add_all([event_a, event_b])
    await db_session.commit()

    # Query events for Club A via player discovery endpoint
    resp_a = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/discover",
        headers=make_auth_header(player_user),
    )
    assert resp_a.status_code == 200
    events_a = resp_a.json()
    assert len(events_a) == 1
    assert events_a[0]["club_name"] == club_a_name

    # Query events for Club B via player discovery endpoint
    resp_b = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/events/discover",
        headers=make_auth_header(player_user),
    )
    assert resp_b.status_code == 200
    events_b = resp_b.json()
    assert len(events_b) == 1
    assert events_b[0]["club_name"] == club_b_name

    # Confirm complete multi-club isolation
    assert events_a[0]["club_name"] != club_b_name
    assert events_b[0]["club_name"] != club_a_name


@pytest.mark.asyncio
async def test_portal_authorization_boundaries(
    async_client: AsyncClient,
    player_user: User,
    club_setup: tuple[User, Club],
):
    """
    Test: Portal authorization boundaries.
    Players and Club Owners cannot mutate platform administration settings.
    """
    club_owner, _ = club_setup

    # Player cannot change platform settings -> 403
    player_resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"platform_name": "Hacked Platform Name"},
        headers=make_auth_header(player_user),
    )
    assert player_resp.status_code == 403

    # Club owner cannot change platform settings -> 403
    owner_resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"platform_name": "Hacked By Club Owner"},
        headers=make_auth_header(club_owner),
    )
    assert owner_resp.status_code == 403
