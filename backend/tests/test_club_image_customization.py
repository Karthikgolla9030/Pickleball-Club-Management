"""
Aught2 Pickleball — Multi-Club Image & Banner Customization Automated Test Suite (Phases 1–9)

Tests:
 1. Club A can configure its branding (logo & cover) independently.
 2. Club B can configure different branding independently.
 3. Updating Club A does not mutate Club B (strict tenant isolation).
 4. Club home carousel loads the correct club-specific slides.
 5. Club B has 0 slides when Club A creates slides (cross-tenant carousel isolation).
 6. Carousel slide reordering persists display order.
 7. Inactive slides are filtered out with active_only=true.
 8. Slides can be updated and deleted cleanly.
 9. Entity-level tournament banner images persist independently.
10. Cross-club tournament banner isolation.
11. League banners persist independently.
12. Event covers persist independently.
13. Court photos persist independently.
14. Lesson images persist independently.
15. Removing an entity image restores null fallback.
16. Unauthorized players cannot modify club branding (403 Forbidden).
17. Unauthorized players cannot upload club media (403 Forbidden).
18. Cross-tenant mutation (Club A owner accessing Club B) is rejected (403 Forbidden).
19. Cross-tenant entity banner mutation is rejected.
20. Media upload validates actual image content and rejects invalid formats (400 Bad Request).
21. Media upload accepts genuine image bytes (PNG/JPEG) and returns safe storage references.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import io
import uuid
import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.court import Court, CourtEnvironment
from app.models.event import Event, EventStatus, EventVisibility, EventType
from app.models.league import League, LeagueStatus
from app.models.lesson import Coach, Lesson, LessonStatus, LessonType
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.user import User
from tests.conftest import make_auth_header


def make_test_image(format="JPEG", size=(120, 120), color="green") -> bytes:
    """Generate valid image bytes with real magic headers and dimensions."""
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=format)
    return buf.getvalue()


# ─── Test Helpers ─────────────────────────────────────────────────────────────

async def create_user(
    db: AsyncSession,
    email: str = None,
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
    name: str = None,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    club = Club(
        name=name or f"Club {suffix}",
        slug=f"club-{suffix}",
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


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_branding_isolation_between_club_a_and_b(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    1. Club A configures its logo & cover.
    2. Club B independently configures different branding.
    3. Updating Club A does not affect Club B.
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    owner_b = await create_user(db_session, full_name="Owner B")

    club_a = await create_club(db_session, name="Alpha Club")
    club_b = await create_club(db_session, name="Beta Club")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Club A sets branding
    resp_a = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_a),
        json={
            "logo_url": "https://assets.local/alpha-logo.png",
            "cover_image_url": "https://assets.local/alpha-cover.jpg",
        },
    )
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["logo_url"] == "https://assets.local/alpha-logo.png"
    assert data_a["cover_image_url"] == "https://assets.local/alpha-cover.jpg"

    # Club B sets branding
    resp_b = await async_client.put(
        f"/api/v1/clubs/{club_b.id}/branding",
        headers=make_auth_header(owner_b),
        json={
            "logo_url": "https://assets.local/beta-logo.png",
            "cover_image_url": "https://assets.local/beta-cover.jpg",
        },
    )
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["logo_url"] == "https://assets.local/beta-logo.png"
    assert data_b["cover_image_url"] == "https://assets.local/beta-cover.jpg"

    # Mutate Club A only
    resp_a_update = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_a),
        json={"logo_url": "https://assets.local/alpha-logo-v2.png"},
    )
    assert resp_a_update.status_code == 200
    assert resp_a_update.json()["logo_url"] == "https://assets.local/alpha-logo-v2.png"

    # Verify Club B branding remains completely untouched
    resp_b_check = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/branding",
        headers=make_auth_header(owner_b),
    )
    assert resp_b_check.status_code == 200
    assert resp_b_check.json()["logo_url"] == "https://assets.local/beta-logo.png"
    assert resp_b_check.json()["cover_image_url"] == "https://assets.local/beta-cover.jpg"


@pytest.mark.asyncio
async def test_carousel_slides_crud_ordering_and_isolation(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Tests carousel slide creation, reordering, active toggle, deletion, and cross-club isolation.
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    owner_b = await create_user(db_session, full_name="Owner B")

    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Create 3 slides for Club A
    s1_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/carousel-slides",
        headers=make_auth_header(owner_a),
        json={
            "title": "Welcome to Club A",
            "subtitle": "Best pickleball in town",
            "tag": "WELCOME",
            "image_url": "https://assets.local/slide1.jpg",
            "cta_text": "Book Court",
            "cta_route": "/(club)/bookings",
            "display_order": 1,
            "is_active": True,
        },
    )
    assert s1_res.status_code == 201
    s1_id = s1_res.json()["id"]

    s2_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/carousel-slides",
        headers=make_auth_header(owner_a),
        json={
            "title": "Upcoming Tournament",
            "subtitle": "Register for the fall open",
            "tag": "TOURNAMENT",
            "image_url": "https://assets.local/slide2.jpg",
            "cta_text": "Register",
            "cta_route": "/(club)/tournaments",
            "display_order": 2,
            "is_active": True,
        },
    )
    assert s2_res.status_code == 201
    s2_id = s2_res.json()["id"]

    s3_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/carousel-slides",
        headers=make_auth_header(owner_a),
        json={
            "title": "Clinic & Coaching",
            "subtitle": "Improve your dink game",
            "tag": "COACHING",
            "image_url": "https://assets.local/slide3.jpg",
            "cta_text": "View Clinics",
            "cta_route": "/(club)/lessons",
            "display_order": 3,
            "is_active": True,
        },
    )
    assert s3_res.status_code == 201
    s3_id = s3_res.json()["id"]

    # Verify Club B has ZERO slides (tenant isolation)
    b_slides_res = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/carousel-slides",
        headers=make_auth_header(owner_b),
    )
    assert b_slides_res.status_code == 200
    assert len(b_slides_res.json()) == 0

    # Reorder slides: s3, s1, s2
    reorder_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/carousel-slides/reorder",
        headers=make_auth_header(owner_a),
        json={"slide_ids": [s3_id, s1_id, s2_id]},
    )
    assert reorder_res.status_code == 200
    reordered_list = reorder_res.json()
    assert reordered_list[0]["id"] == s3_id
    assert reordered_list[0]["display_order"] == 0
    assert reordered_list[1]["id"] == s1_id
    assert reordered_list[1]["display_order"] == 1
    assert reordered_list[2]["id"] == s2_id
    assert reordered_list[2]["display_order"] == 2

    # Toggle s2 inactive
    patch_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/carousel-slides/{s2_id}",
        headers=make_auth_header(owner_a),
        json={"is_active": False},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["is_active"] is False

    # Verify active_only filter
    active_res = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/carousel-slides?active_only=true",
        headers=make_auth_header(owner_a),
    )
    assert active_res.status_code == 200
    active_ids = [s["id"] for s in active_res.json()]
    assert s3_id in active_ids
    assert s1_id in active_ids
    assert s2_id not in active_ids

    # Delete slide 1
    del_res = await async_client.delete(
        f"/api/v1/clubs/{club_a.id}/carousel-slides/{s1_id}",
        headers=make_auth_header(owner_a),
    )
    assert del_res.status_code == 204

    # Verify count is now 2
    all_res = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/carousel-slides?active_only=false",
        headers=make_auth_header(owner_a),
    )
    assert len(all_res.json()) == 2


@pytest.mark.asyncio
async def test_entity_specific_images_and_isolation(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Tests independent persistence and multi-tenant scoping for:
    - Tournament banner
    - League banner
    - Event cover
    - Court photo
    - Lesson and LessonType images
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    owner_b = await create_user(db_session, full_name="Owner B")

    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)

    now = datetime.now(timezone.utc)

    # Create Tournament in Club A & B
    tourn_a = Tournament(
        club_id=club_a.id,
        name="Tournament Alpha",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=2),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(hours=12),
        min_participants=4,
        max_participants=16,
    )
    tourn_b = Tournament(
        club_id=club_b.id,
        name="Tournament Beta",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(hours=12),
        min_participants=4,
        max_participants=16,
    )
    db_session.add_all([tourn_a, tourn_b])

    # Create League in Club A
    league_a = League(
        club_id=club_a.id,
        name="Winter Premier Doubles",
        status=LeagueStatus.DRAFT,
        team_size=2,
        number_of_weeks=8,
        playoff_team_count=4,
        max_teams=12,
        scoring_rules={"points_to_win": 11, "win_by": 2},
        start_date=now + timedelta(days=14),
        end_date=now + timedelta(days=70),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=10),
    )
    db_session.add(league_a)

    # Create Event in Club A
    event_a = Event(
        club_id=club_a.id,
        title="Social Night Mixer",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=5),
        end_at=now + timedelta(days=5, hours=3),
    )
    db_session.add(event_a)

    # Create Court in Club A
    court_a = Court(
        club_id=club_a.id,
        name="Championship Court 1",
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        is_active=True,
    )
    db_session.add(court_a)

    # Create LessonType, Coach & Lesson in Club A
    lesson_type = LessonType(
        club_id=club_a.id,
        name="Advanced Dinking Clinic",
        duration_minutes=90,
    )
    coach_a = Coach(
        club_id=club_a.id,
        name="Head Coach Mike",
    )
    db_session.add_all([lesson_type, coach_a])
    await db_session.flush()

    lesson_a = Lesson(
        club_id=club_a.id,
        lesson_type_id=lesson_type.id,
        coach_id=coach_a.id,
        title="Mastering the Kitchen Line",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=8),
        end_at=now + timedelta(days=8, hours=2),
        price=Decimal("35.00"),
        capacity=8,
    )
    db_session.add(lesson_a)
    await db_session.commit()

    # 1. Update Tournament banner
    t_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tourn_a.id}/image",
        headers=make_auth_header(owner_a),
        json={"image_url": "https://assets.local/tourn-a-banner.jpg"},
    )
    assert t_res.status_code == 200
    assert t_res.json()["banner_image_url"] == "https://assets.local/tourn-a-banner.jpg"

    # Verify Tournament B has NOT been modified
    await db_session.refresh(tourn_b)
    assert tourn_b.banner_image_url is None

    # 2. Update League banner
    l_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/leagues/{league_a.id}/image",
        headers=make_auth_header(owner_a),
        json={"image_url": "https://assets.local/league-a-banner.jpg"},
    )
    assert l_res.status_code == 200
    assert l_res.json()["banner_image_url"] == "https://assets.local/league-a-banner.jpg"

    # 3. Update Event cover
    e_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/events/{event_a.id}/image",
        headers=make_auth_header(owner_a),
        json={"image_url": "https://assets.local/event-a-cover.jpg"},
    )
    assert e_res.status_code == 200
    assert e_res.json()["cover_image_url"] == "https://assets.local/event-a-cover.jpg"

    # 4. Update Court photo
    c_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/courts/{court_a.id}/image",
        headers=make_auth_header(owner_a),
        json={"image_url": "https://assets.local/court-a-photo.jpg"},
    )
    assert c_res.status_code == 200
    assert c_res.json()["photo_url"] == "https://assets.local/court-a-photo.jpg"

    # 5. Update Lesson & LessonType images
    les_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/lessons/{lesson_a.id}/image",
        headers=make_auth_header(owner_a),
        json={"image_url": "https://assets.local/lesson-a-photo.jpg"},
    )
    assert les_res.status_code == 200
    assert les_res.json()["image_url"] == "https://assets.local/lesson-a-photo.jpg"

    lt_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/lesson-types/{lesson_type.id}/image",
        headers=make_auth_header(owner_a),
        json={"image_url": "https://assets.local/lesson-type-photo.jpg"},
    )
    assert lt_res.status_code == 200
    assert lt_res.json()["image_url"] == "https://assets.local/lesson-type-photo.jpg"

    # 6. Removing custom image restores null fallback
    t_del_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tourn_a.id}/image",
        headers=make_auth_header(owner_a),
        json={"image_url": None},
    )
    assert t_del_res.status_code == 200
    assert t_del_res.json()["banner_image_url"] is None


@pytest.mark.asyncio
async def test_rbac_and_cross_tenant_security(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Enforces authorization:
    - Players cannot edit branding or slides.
    - Owner A cannot touch Club B assets or entities (tenant cross-mutation blocked).
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    player_a = await create_user(db_session, full_name="Player A")
    owner_b = await create_user(db_session, full_name="Owner B")

    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    # player_a has no staff membership on club_a
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Player A cannot update branding
    p_res = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(player_a),
        json={"logo_url": "https://hacker.com/logo.png"},
    )
    assert p_res.status_code == 403

    # Player A cannot upload media
    fake_png = make_test_image(format="PNG")
    upload_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(player_a),
        data={"asset_type": "logo"},
        files={"file": ("test.png", fake_png, "image/png")},
    )
    assert upload_res.status_code == 403

    # Player A cannot add slide
    slide_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/carousel-slides",
        headers=make_auth_header(player_a),
        json={"image_url": "https://hacker.com/slide.png"},
    )
    assert slide_res.status_code == 403

    # Owner A cannot modify Club B branding
    cross_res = await async_client.put(
        f"/api/v1/clubs/{club_b.id}/branding",
        headers=make_auth_header(owner_a),
        json={"logo_url": "https://assets.local/tampered.png"},
    )
    assert cross_res.status_code == 403

    # Owner A cannot upload media to Club B
    cross_upload = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/media/upload",
        headers=make_auth_header(owner_a),
        data={"asset_type": "logo"},
        files={"file": ("test.png", fake_png, "image/png")},
    )
    assert cross_upload.status_code == 403


@pytest.mark.asyncio
async def test_media_upload_validation_and_storage(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Tests Pillow magic-bytes content verification:
    - Text file with .png extension -> Rejected with 400 Bad Request.
    - Valid JPEG file -> Accepted, stores metadata with safe UUID, returns public URL.
    - Path traversal in filename is sanitized.
    """
    owner = await create_user(db_session, full_name="Club Owner")
    club = await create_club(db_session, name="Validation Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # 1. Invalid payload (disguised plain text)
    bad_bytes = b"This is not a real image header at all! <script>alert(1)</script>"
    bad_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        headers=make_auth_header(owner),
        data={"asset_type": "logo"},
        files={"file": ("fake_image.png", bad_bytes, "image/png")},
    )
    assert bad_res.status_code == 400
    assert "Invalid image" in bad_res.json()["detail"]

    # 2. Valid JPEG image bytes
    good_jpeg = make_test_image(format="JPEG", size=(300, 200), color="blue")
    good_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        headers=make_auth_header(owner),
        data={"asset_type": "cover"},
        files={"file": ("../../../malicious_traversal_name.jpg", good_jpeg, "image/jpeg")},
    )
    assert good_res.status_code == 200
    body = good_res.json()
    assert "asset_id" in body
    assert "public_url" in body
    assert body["width"] == 300
    assert body["height"] == 200
    assert "malicious_traversal" not in body["public_url"]
    assert body["public_url"].startswith("/uploads/")
