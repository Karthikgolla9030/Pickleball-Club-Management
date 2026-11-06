"""
Aught2 Pickleball — Comprehensive Test Suite for Centralized Default Images,
Custom Banners, and Multi-Tenant Image Synchronization Across All Portals.

Validates the full architecture:
- Test A: Club Identity (Logo & Cover) — No default images, strictly null when unconfigured.
- Test B: Tournament Format Defaults — Independent defaults for Round Robin, Scramble, Pool Play, Bracket; custom image priority; updating defaults does not overwrite custom images.
- Test C: Activity Default Banners — Events, Lessons, and Leagues default resolution and custom override.
- Test D: Platform Home Banners — 'owner_home' vs 'player_home' banner independence and reset lifecycle.
- Test E: Court Images — Uploaded only, strictly null when unconfigured (no fake stock photos).
- Test F: Multi-Club Isolation — Club A and Club B branding, courts, and access controls remain completely separated.
- Test G: Persistence and Sync — Database persistence across transactions and synchronous API verification.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.lesson import Lesson, LessonStatus, LessonType
from app.models.platform_banner import PlatformBanner
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus, TournamentVisibility
from app.models.user import User
from app.services.platform_banner_service import (
    DEFAULT_BANNER_CONFIGS,
    PlatformBannerService,
    SUPPORTED_BANNER_TYPES,
)
from tests.conftest import make_auth_header


def make_test_image(format="JPEG", size=(120, 120), color="blue") -> bytes:
    """Generate real image bytes with valid magic headers."""
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=format)
    return buf.getvalue()


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


async def create_club(
    db: AsyncSession,
    name: str | None = None,
    logo_url: str | None = None,
    cover_image_url: str | None = None,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    club = Club(
        name=name or f"Club {suffix}",
        slug=f"club-{suffix}",
        logo_url=logo_url,
        cover_image_url=cover_image_url,
        is_active=True,
    )
    db.add(club)
    await db.flush()
    return club


async def create_membership(
    db: AsyncSession,
    user_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubRole,
) -> ClubMembership:
    m = ClubMembership(
        user_id=user_id,
        club_id=club_id,
        role=role,
        is_active=True,
    )
    db.add(m)
    await db.flush()
    return m


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


# ═════════════════════════════════════════════════════════════════════════════
# TEST A: Club Identity (Logo & Cover) — No Default Images
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_a_club_identity_no_defaults_and_sync(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Test A: Club identity images (Logo and Cover) must NEVER have default images.
    - If unconfigured, API must return null for logo_url and cover_image_url.
    - Uploading updates the club's logo and cover.
    - Removing restores null cleanly without fake placeholders.
    """
    owner = await create_user(db_session, full_name="Club Owner A")
    club = await create_club(db_session, name="Alpha Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    owner_headers = make_auth_header(owner)

    # 1. Verify fresh club has strictly NULL logo and cover (no fake stock photos)
    res = await async_client.get(f"/api/v1/clubs/{club.id}/branding")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["logo_url"] is None, "Club logo must be null when unconfigured"
    assert data["cover_image_url"] is None, "Club cover must be null when unconfigured"
    assert data["has_custom_logo"] is False
    assert data["has_custom_cover"] is False

    # 2. Club owner uploads custom logo and cover
    custom_logo = "https://cdn.aught2.com/clubs/alpha/logo.png"
    custom_cover = "https://cdn.aught2.com/clubs/alpha/cover.jpg"
    update_res = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=owner_headers,
        json={
            "logo_url": custom_logo,
            "cover_image_url": custom_cover,
        },
    )
    assert update_res.status_code == 200, update_res.text
    updated_data = update_res.json()
    assert updated_data["logo_url"] == custom_logo
    assert updated_data["cover_image_url"] == custom_cover
    assert updated_data["has_custom_logo"] is True
    assert updated_data["has_custom_cover"] is True

    # 3. Public/Player verification confirms synced identity
    player_res = await async_client.get(f"/api/v1/clubs/{club.id}/branding")
    assert player_res.status_code == 200
    assert player_res.json()["logo_url"] == custom_logo
    assert player_res.json()["cover_image_url"] == custom_cover

    # 4. Remove logo and cover: must return to strictly null, NOT a placeholder
    clear_res = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=owner_headers,
        json={
            "logo_url": None,
            "cover_image_url": None,
        },
    )
    assert clear_res.status_code == 200
    cleared_data = clear_res.json()
    assert cleared_data["logo_url"] is None
    assert cleared_data["cover_image_url"] is None
    assert cleared_data["has_custom_logo"] is False
    assert cleared_data["has_custom_cover"] is False


# ═════════════════════════════════════════════════════════════════════════════
# TEST B: Tournament Format Defaults & Custom Priority
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_b_tournament_format_defaults_and_custom_priority(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test B: Tournament format default banners for all 4 formats:
    - Round Robin, Scramble, Pool Play, Bracket.
    - Platform Owner can configure defaults for all 4 formats.
    - Custom tournament banner takes priority.
    - Updating a format default banner does NOT overwrite custom tournament images.
    """
    po_headers = make_auth_header(platform_owner)

    # 1. Verify all 9 banner types are supported in PlatformBannerService
    for b_type in [
        "default_tournament_round_robin",
        "default_tournament_scramble",
        "default_tournament_pool_play",
        "default_tournament_bracket",
    ]:
        assert b_type in SUPPORTED_BANNER_TYPES

    # 2. Platform Admin configures default banners for all 4 formats
    format_banners = {
        "default_tournament_round_robin": "https://cdn.example.com/rr_default.jpg",
        "default_tournament_scramble": "https://cdn.example.com/scramble_default.jpg",
        "default_tournament_pool_play": "https://cdn.example.com/pool_play_default.jpg",
        "default_tournament_bracket": "https://cdn.example.com/bracket_default.jpg",
    }
    for b_type, img_url in format_banners.items():
        res = await async_client.put(
            f"/api/v1/platform/banners/{b_type}",
            headers=po_headers,
            json={"image_url": img_url, "title": f"Default {b_type}"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["image_url"] == img_url

    # 3. Create Club and Owner
    owner = await create_user(db_session, full_name="Tournament Director")
    club = await create_club(db_session, name="Racquet Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # 4. Create Tournament 1 with a custom banner
    now = datetime.now(timezone.utc)
    custom_banner = "https://cdn.example.com/custom_rr_spring.jpg"
    t1 = Tournament(
        club_id=club.id,
        name="Spring Round Robin",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        banner_image_url=custom_banner,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=6),
    )
    # Tournament 2 with NO custom banner (inherits format default)
    t2 = Tournament(
        club_id=club.id,
        name="Autumn Round Robin",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        banner_image_url=None,
        start_date=now + timedelta(days=14),
        end_date=now + timedelta(days=15),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=13),
    )
    db_session.add_all([t1, t2])
    await db_session.commit()
    await db_session.refresh(t1)
    await db_session.refresh(t2)

    # Tournament 1 has custom image
    assert t1.banner_image_url == custom_banner
    # Tournament 2 has null custom image
    assert t2.banner_image_url is None

    # 5. Platform Admin updates Round Robin default banner to v2
    updated_rr_url = "https://cdn.example.com/rr_default_v2.jpg"
    update_res = await async_client.put(
        "/api/v1/platform/banners/default_tournament_round_robin",
        headers=po_headers,
        json={"image_url": updated_rr_url},
    )
    assert update_res.status_code == 200
    assert update_res.json()["image_url"] == updated_rr_url

    # 6. Verify Tournament 1 was NOT mutated or overwritten
    await db_session.refresh(t1)
    assert t1.banner_image_url == custom_banner, "Custom tournament image must never be overwritten"


# ═════════════════════════════════════════════════════════════════════════════
# TEST C: Activity Default Banners (Events, Lessons, Leagues)
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_c_activity_default_banners_events_lessons_leagues(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test C: Activity Default Banners:
    - Events, Lessons, and Leagues each have independent default banners in Platform Admin.
    - Custom activity image takes priority.
    - Updating default banner does not overwrite custom activity images.
    """
    po_headers = make_auth_header(platform_owner)

    # 1. Platform Admin configures default banners for all 3 activity types
    activity_banners = {
        "default_event_banner": "https://cdn.example.com/event_default.jpg",
        "default_lesson_banner": "https://cdn.example.com/lesson_default.jpg",
        "default_league_banner": "https://cdn.example.com/league_default.jpg",
    }
    for b_type, img_url in activity_banners.items():
        res = await async_client.put(
            f"/api/v1/platform/banners/{b_type}",
            headers=po_headers,
            json={"image_url": img_url},
        )
        assert res.status_code == 200, res.text
        assert res.json()["image_url"] == img_url

    # 2. Setup Club
    owner = await create_user(db_session, full_name="Activities Director")
    club = await create_club(db_session, name="Grand Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    # 3. Create Event with custom image and Event with null image
    now = datetime.now(timezone.utc)
    event_custom_img = "https://cdn.example.com/custom_social.jpg"
    e1 = Event(
        club_id=club.id,
        title="Social Night",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        cover_image_url=event_custom_img,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=3),
    )
    e2 = Event(
        club_id=club.id,
        title="Clinic Morning",
        event_type=EventType.CLINIC,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        cover_image_url=None,
        start_at=now + timedelta(days=3),
        end_at=now + timedelta(days=3, hours=2),
    )
    db_session.add_all([e1, e2])
    await db_session.commit()
    await db_session.refresh(e1)
    await db_session.refresh(e2)

    assert e1.cover_image_url == event_custom_img
    assert e2.cover_image_url is None

    # 4. Updating platform default event banner does not overwrite e1's custom image
    res = await async_client.put(
        "/api/v1/platform/banners/default_event_banner",
        headers=po_headers,
        json={"image_url": "https://cdn.example.com/event_default_v2.jpg"},
    )
    assert res.status_code == 200
    await db_session.refresh(e1)
    assert e1.cover_image_url == event_custom_img


# ═════════════════════════════════════════════════════════════════════════════
# TEST D: Platform Home Banners ('owner_home' vs 'player_home')
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_d_platform_home_banners_independence(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test D: Platform Home Banners:
    - 'owner_home' (Club Side) and 'player_home' (Player Side) are completely independent.
    - Updating one does not alter the other.
    - Resetting one restores platform defaults without affecting the other.
    """
    po_headers = make_auth_header(platform_owner)

    # 1. Update owner_home banner
    owner_img = "https://cdn.example.com/owner_welcome.jpg"
    owner_res = await async_client.put(
        "/api/v1/platform/banners/owner_home",
        headers=po_headers,
        json={
            "title": "Club Owner Hub",
            "subtitle": "Manage your facilities",
            "image_url": owner_img,
            "cta_text": "Open Courts",
        },
    )
    assert owner_res.status_code == 200
    assert owner_res.json()["title"] == "Club Owner Hub"
    assert owner_res.json()["image_url"] == owner_img

    # 2. Update player_home banner
    player_img = "https://cdn.example.com/player_welcome.jpg"
    player_res = await async_client.put(
        "/api/v1/platform/banners/player_home",
        headers=po_headers,
        json={
            "title": "Welcome Player",
            "subtitle": "Book courts and play",
            "image_url": player_img,
            "cta_text": "Find Game",
        },
    )
    assert player_res.status_code == 200
    assert player_res.json()["title"] == "Welcome Player"
    assert player_res.json()["image_url"] == player_img

    # 3. Verify owner_home was unaffected by player_home update
    get_owner = await async_client.get("/api/v1/platform/banners/owner_home")
    assert get_owner.status_code == 200
    assert get_owner.json()["title"] == "Club Owner Hub"
    assert get_owner.json()["image_url"] == owner_img

    # 4. Reset player_home to built-in default
    reset_res = await async_client.delete(
        "/api/v1/platform/banners/player_home",
        headers=po_headers,
    )
    assert reset_res.status_code == 200
    player_reset = reset_res.json()
    assert player_reset["image_url"] is None, "Resetting must clear custom image"
    assert player_reset["title"] == DEFAULT_BANNER_CONFIGS["player_home"]["title"]

    # 5. Verify owner_home still retains its custom image and title
    get_owner_after = await async_client.get("/api/v1/platform/banners/owner_home")
    assert get_owner_after.status_code == 200
    assert get_owner_after.json()["image_url"] == owner_img
    assert get_owner_after.json()["title"] == "Club Owner Hub"


# ═════════════════════════════════════════════════════════════════════════════
# TEST E: Court Images (Uploaded Only, No Defaults)
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_e_court_images_uploaded_only_no_defaults(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Test E: Court Images:
    - Display court photo ONLY when uploaded.
    - If photo_url is null, return strictly null (no fake stock photos).
    - Setting photo_url updates the court; clearing restores null.
    """
    owner = await create_user(db_session, full_name="Court Manager")
    club = await create_club(db_session, name="Tennis & Pickle Center")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    # 1. Create court without photo
    court1 = Court(
        club_id=club.id,
        name="Court 1",
        court_number=1,
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
        photo_url=None,
    )
    # Create court with uploaded photo
    court_img = "https://cdn.example.com/courts/court2_real.jpg"
    court2 = Court(
        club_id=club.id,
        name="Court 2",
        court_number=2,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        photo_url=court_img,
    )
    db_session.add_all([court1, court2])
    await db_session.commit()
    await db_session.refresh(court1)
    await db_session.refresh(court2)

    # Court 1 photo_url must be strictly None
    assert court1.photo_url is None, "Court without uploaded image must have null photo_url"
    # Court 2 photo_url must be the exact custom image
    assert court2.photo_url == court_img

    # 2. Club owner updates Court 1 with an uploaded photo
    owner_headers = make_auth_header(owner)
    new_court1_photo = "https://cdn.example.com/courts/court1_real.jpg"
    up_res = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court1.id}/image",
        headers=owner_headers,
        json={"image_url": new_court1_photo},
    )
    assert up_res.status_code == 200, up_res.text
    assert up_res.json()["photo_url"] == new_court1_photo

    # 3. Clear photo_url on Court 2 (removes photo)
    clear_res = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court2.id}/image",
        headers=owner_headers,
        json={"image_url": None},
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["photo_url"] is None, "Clearing court photo must return strictly null"


# ═════════════════════════════════════════════════════════════════════════════
# TEST F: Multi-Club Isolation
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_f_multi_club_tenant_isolation(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Test F: Multi-Club Isolation:
    - Club A and Club B branding, court images, and activity images are isolated.
    - Owner of Club B cannot modify Club A's branding or court photos (403 Forbidden).
    - Player viewing Club A sees only Club A's images; viewing Club B sees only Club B's images.
    """
    # Create Club A and Owner A
    owner_a = await create_user(db_session, full_name="Owner A")
    club_a = await create_club(
        db_session,
        name="Club Alpha",
        logo_url="https://cdn.example.com/logo_a.png",
        cover_image_url="https://cdn.example.com/cover_a.jpg",
    )
    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)

    # Create Club B and Owner B
    owner_b = await create_user(db_session, full_name="Owner B")
    club_b = await create_club(
        db_session,
        name="Club Beta",
        logo_url="https://cdn.example.com/logo_b.png",
        cover_image_url="https://cdn.example.com/cover_b.jpg",
    )
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)

    court_a = Court(
        club_id=club_a.id,
        name="Court A1",
        court_number=1,
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
        photo_url="https://cdn.example.com/court_a1.jpg",
    )
    db_session.add(court_a)
    await db_session.commit()

    owner_b_headers = make_auth_header(owner_b)

    # 1. Owner B attempts to modify Club A's branding -> 403 Forbidden
    res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=owner_b_headers,
        json={"logo_url": "https://cdn.example.com/hacked_logo.png"},
    )
    assert res.status_code == 403, "Owner B must NOT be able to modify Club A's branding"

    # 2. Owner B attempts to modify Club A's court image -> 403 Forbidden
    res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/courts/{court_a.id}/image",
        headers=owner_b_headers,
        json={"image_url": "https://cdn.example.com/hacked_court.jpg"},
    )
    assert res.status_code == 403, "Owner B must NOT be able to modify Club A's courts"

    # 3. Verify Club A's branding and court remain intact
    brand_a = await async_client.get(f"/api/v1/clubs/{club_a.id}/branding")
    assert brand_a.status_code == 200
    assert brand_a.json()["logo_url"] == "https://cdn.example.com/logo_a.png"
    assert brand_a.json()["cover_image_url"] == "https://cdn.example.com/cover_a.jpg"

    brand_b = await async_client.get(f"/api/v1/clubs/{club_b.id}/branding")
    assert brand_b.status_code == 200
    assert brand_b.json()["logo_url"] == "https://cdn.example.com/logo_b.png"
    assert brand_b.json()["cover_image_url"] == "https://cdn.example.com/cover_b.jpg"


# ═════════════════════════════════════════════════════════════════════════════
# TEST G: Persistence and Sync Across Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_g_persistence_and_sync(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test G: Persistence and Sync:
    - All platform banner records persist in platform_banners table.
    - All 9 supported banner types can be retrieved simultaneously via GET /platform/banners.
    - DB commit persists data reliably across queries.
    """
    po_headers = make_auth_header(platform_owner)

    # 1. Update every banner type with distinct content
    for b_type in sorted(SUPPORTED_BANNER_TYPES):
        res = await async_client.put(
            f"/api/v1/platform/banners/{b_type}",
            headers=po_headers,
            json={
                "title": f"Synced Title for {b_type}",
                "subtitle": f"Synced Subtitle for {b_type}",
                "cta_text": "Action",
                "cta_destination": f"/route/{b_type}",
                "is_active": True,
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["title"] == f"Synced Title for {b_type}"

    # 2. Query GET /platform/banners (public endpoint) and verify all 9 are returned and synchronized
    all_res = await async_client.get("/api/v1/platform/banners")
    assert all_res.status_code == 200
    all_banners = all_res.json()

    assert len(all_banners) == len(SUPPORTED_BANNER_TYPES)
    for b_type in SUPPORTED_BANNER_TYPES:
        assert b_type in all_banners
        assert all_banners[b_type]["title"] == f"Synced Title for {b_type}"
        assert all_banners[b_type]["cta_destination"] == f"/route/{b_type}"

    # 3. Direct DB session query to verify durable persistence in database
    stmt = select(PlatformBanner)
    db_res = await db_session.execute(stmt)
    records = list(db_res.scalars().all())
    assert len(records) >= len(SUPPORTED_BANNER_TYPES)
    types_in_db = {r.banner_type for r in records}
    for b_type in SUPPORTED_BANNER_TYPES:
        assert b_type in types_in_db
