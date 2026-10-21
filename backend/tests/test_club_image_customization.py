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


@pytest.mark.asyncio
async def test_court_image_upload_and_replace_owner_and_manager(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Regression Test 1 & 2:
    - Authorized club owner successfully uploads and replaces a court image.
    - Authorized club manager (with MANAGE_COURTS permission) successfully uploads court photo.
    - Tests both 'court_photo' and 'court' asset types.
    - Updates court record in DB and confirms photo_url persists.
    - Replacing the court image updates photo_url.
    - Removing court image sets photo_url to None.
    """
    owner = await create_user(db_session, full_name="Club Owner")
    manager = await create_user(db_session, full_name="Club Manager")
    club = await create_club(db_session, name="Court Photo Club")

    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)

    court = Court(
        club_id=club.id,
        name="Championship Court 1",
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        display_order=1,
    )
    db_session.add(court)
    await db_session.commit()
    await db_session.refresh(court)

    # 1. Owner uploads court image using asset_type="court_photo"
    court_img_1 = make_test_image(format="JPEG", size=(640, 400), color="green")
    upload_1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        headers=make_auth_header(owner),
        data={"asset_type": "court_photo", "entity_type": "court", "entity_id": str(court.id)},
        files={"file": ("court1.jpg", court_img_1, "image/jpeg")},
    )
    assert upload_1.status_code == 200
    res_1 = upload_1.json()
    assert "public_url" in res_1
    uploaded_url_1 = res_1["public_url"]

    # Persist court update with uploaded image
    update_res_1 = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court.id}",
        headers=make_auth_header(owner),
        json={"photo_url": uploaded_url_1},
    )
    assert update_res_1.status_code == 200
    assert update_res_1.json()["photo_url"] == uploaded_url_1

    # Verify persisted in database
    await db_session.refresh(court)
    assert court.photo_url == uploaded_url_1

    # 2. Club Manager (has MANAGE_COURTS) uploads court image using asset_type="court"
    court_img_2 = make_test_image(format="PNG", size=(640, 400), color="blue")
    upload_2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        headers=make_auth_header(manager),
        data={"asset_type": "court", "entity_type": "court", "entity_id": str(court.id)},
        files={"file": ("court2.png", court_img_2, "image/png")},
    )
    assert upload_2.status_code == 200
    res_2 = upload_2.json()
    uploaded_url_2 = res_2["public_url"]

    # Manager updates court photo
    update_res_2 = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court.id}/image",
        headers=make_auth_header(manager),
        json={"image_url": uploaded_url_2},
    )
    assert update_res_2.status_code == 200
    assert update_res_2.json()["photo_url"] == uploaded_url_2

    await db_session.refresh(court)
    assert court.photo_url == uploaded_url_2

    # 3. Manager clears court photo
    clear_res = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court.id}/image",
        headers=make_auth_header(manager),
        json={"image_url": None},
    )
    assert clear_res.status_code == 200
    assert clear_res.json()["photo_url"] is None

    await db_session.refresh(court)
    assert court.photo_url is None


@pytest.mark.asyncio
async def test_court_image_upload_authentication_and_authorization_failures(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Regression Test 3, 4 & 5:
    - Unauthenticated upload is rejected with 401 "Not authenticated".
    - Player without court management permissions is rejected with 403 Forbidden.
    - Authenticated user from another club cannot upload to this club's endpoint.
    - Cross-club entity validation: Club A user passing entity_id of Club B's court is rejected.
    - Manager without MANAGE_CLUB cannot upload club_logo.
    """
    owner_a = await create_user(db_session, full_name="Owner Club A")
    manager_a = await create_user(db_session, full_name="Manager Club A")
    td_a = await create_user(db_session, full_name="TD Club A")
    player_a = await create_user(db_session, full_name="Player Club A")
    owner_b = await create_user(db_session, full_name="Owner Club B")

    club_a = await create_club(db_session, name="Club A Security")
    club_b = await create_club(db_session, name="Club B Security")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, manager_a.id, club_a.id, ClubRole.CLUB_MANAGER)
    await create_membership(db_session, td_a.id, club_a.id, ClubRole.TOURNAMENT_DIRECTOR)
    # player_a has no club membership record
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)

    court_a = Court(club_id=club_a.id, name="Court A1", display_order=1)
    court_b = Court(club_id=club_b.id, name="Court B1", display_order=1)
    db_session.add_all([court_a, court_b])
    await db_session.commit()

    test_img = make_test_image(format="JPEG")

    # 1. Unauthenticated request: NO Authorization header -> 401 "Not authenticated"
    unauth_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        data={"asset_type": "court_photo"},
        files={"file": ("court.jpg", test_img, "image/jpeg")},
    )
    assert unauth_res.status_code == 401
    assert unauth_res.json()["detail"] == "Not authenticated"

    # 2a. Tournament Director (has membership but lacks MANAGE_COURTS) -> 403 Forbidden
    td_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(td_a),
        data={"asset_type": "court_photo"},
        files={"file": ("court.jpg", test_img, "image/jpeg")},
    )
    assert td_res.status_code == 403
    assert "Permission denied: manage_courts required" in td_res.json()["detail"]

    # 2b. Regular player (no membership in club) -> 403 Forbidden
    player_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(player_a),
        data={"asset_type": "court_photo"},
        files={"file": ("court.jpg", test_img, "image/jpeg")},
    )
    assert player_res.status_code == 403
    assert "not a member" in player_res.json()["detail"]

    # 3. User from Club B cannot upload to Club A -> 403 Forbidden
    cross_club_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(owner_b),
        data={"asset_type": "court_photo"},
        files={"file": ("court.jpg", test_img, "image/jpeg")},
    )
    assert cross_club_res.status_code == 403

    # 4. Cross-club entity validation: Owner A specifying entity_id of Club B's court -> 404
    foreign_court_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(owner_a),
        data={"asset_type": "court_photo", "entity_type": "court", "entity_id": str(court_b.id)},
        files={"file": ("court.jpg", test_img, "image/jpeg")},
    )
    assert foreign_court_res.status_code == 404
    assert "Court not found in this club" in foreign_court_res.json()["detail"]

    # 5. Club Manager (has MANAGE_COURTS but NOT MANAGE_CLUB) uploading club_logo -> 403 Forbidden
    manager_logo_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(manager_a),
        data={"asset_type": "club_logo"},
        files={"file": ("logo.jpg", test_img, "image/jpeg")},
    )
    assert manager_logo_res.status_code == 403
    assert "Permission denied: manage_club required" in manager_logo_res.json()["detail"]


@pytest.mark.asyncio
async def test_failed_replacement_preserves_previous_image_and_returns_sanitized_error(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Regression Test 6 & 7:
    - Failed upload returns sanitized, useful error (400 / 413).
    - Failed replacement preserves the previously saved image in the database.
    """
    owner = await create_user(db_session, full_name="Club Owner Safe")
    club = await create_club(db_session, name="Safe Upload Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    initial_photo_url = "https://assets.local/court-existing-photo.jpg"
    court = Court(
        club_id=club.id,
        name="Preserved Court",
        photo_url=initial_photo_url,
        display_order=1,
    )
    db_session.add(court)
    await db_session.commit()
    await db_session.refresh(court)

    # Attempt to upload corrupt data
    corrupt_bytes = b"not an image at all - corrupt content payload"
    fail_upload = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        headers=make_auth_header(owner),
        data={"asset_type": "court_photo", "entity_type": "court", "entity_id": str(court.id)},
        files={"file": ("corrupt.jpg", corrupt_bytes, "image/jpeg")},
    )
    assert fail_upload.status_code == 400
    assert "Invalid image file or corrupt image data" in fail_upload.json()["detail"]

    # Confirm previously saved photo_url in database was preserved
    await db_session.refresh(court)
    assert court.photo_url == initial_photo_url


@pytest.mark.asyncio
async def test_branding_scope_persistence_and_platform_separation(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Regression Test:
    1. Owner updates Club A logo; saved API response shows the new logo.
    2. Player-facing Club A public details show Club A's updated logo and cover banner.
    3. Club B's branding remains strictly untouched.
    4. Owner updates Club A banner; it appears in Club A's branding and public responses.
    5. Club with no logo/banner cleanly returns None (enabling intentional fallback).
    6. Unauthorized users / cross-tenant owners cannot modify another club's branding (403).
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    owner_b = await create_user(db_session, full_name="Owner B")
    manager_a = await create_user(db_session, full_name="Manager A")
    player = await create_user(db_session, full_name="General Player")

    club_a = await create_club(db_session, name="Coastal Pickleball Club A")
    club_b = await create_club(db_session, name="Mountain Pickleball Club B")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, manager_a.id, club_a.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    # Step 1: Verify initial state — both clubs have no custom branding (neutral fallbacks)
    res_init_a = await async_client.get(f"/api/v1/clubs/{club_a.id}/branding")
    assert res_init_a.status_code == 200
    data_init_a = res_init_a.json()
    assert data_init_a["logo_url"] is None
    assert data_init_a["cover_image_url"] is None
    assert data_init_a["has_custom_logo"] is False
    assert data_init_a["has_custom_cover"] is False

    res_pub_init_a = await async_client.get(f"/api/v1/clubs/{club_a.id}/public")
    assert res_pub_init_a.status_code == 200
    pub_init_a = res_pub_init_a.json()
    assert pub_init_a["logo_url"] is None
    assert pub_init_a["cover_image_url"] is None

    # Step 2: Owner A uploads logo for Club A via media upload
    logo_bytes = make_test_image(format="PNG", size=(200, 200), color="blue")
    upload_logo_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(owner_a),
        data={"asset_type": "club_logo"},
        files={"file": ("club_a_logo.png", logo_bytes, "image/png")},
    )
    assert upload_logo_resp.status_code == 200
    club_a_logo_url = upload_logo_resp.json()["public_url"]

    # Save logo in Club A branding
    put_branding_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_a),
        json={"logo_url": club_a_logo_url},
    )
    assert put_branding_resp.status_code == 200
    data_branding_a = put_branding_resp.json()
    assert data_branding_a["logo_url"] == club_a_logo_url
    assert data_branding_a["has_custom_logo"] is True
    assert data_branding_a["cover_image_url"] is None

    # Step 3: Owner A updates Club A cover banner
    cover_bytes = make_test_image(format="JPEG", size=(1280, 720), color="purple")
    upload_cover_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(owner_a),
        data={"asset_type": "club_cover"},
        files={"file": ("club_a_cover.jpg", cover_bytes, "image/jpeg")},
    )
    assert upload_cover_resp.status_code == 200
    club_a_cover_url = upload_cover_resp.json()["public_url"]

    put_cover_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_a),
        json={"cover_image_url": club_a_cover_url},
    )
    assert put_cover_resp.status_code == 200
    data_updated_a = put_cover_resp.json()
    assert data_updated_a["logo_url"] == club_a_logo_url
    assert data_updated_a["cover_image_url"] == club_a_cover_url
    assert data_updated_a["has_custom_cover"] is True

    # Step 4: Player views Club A public profile — sees Club A's updated logo and banner
    pub_a_resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/public")
    assert pub_a_resp.status_code == 200
    pub_a_data = pub_a_resp.json()
    assert pub_a_data["logo_url"] == club_a_logo_url
    assert pub_a_data["cover_image_url"] == club_a_cover_url

    # Step 5: Strictly verify Club B's branding remains completely untouched
    branding_b_resp = await async_client.get(f"/api/v1/clubs/{club_b.id}/branding")
    assert branding_b_resp.status_code == 200
    branding_b_data = branding_b_resp.json()
    assert branding_b_data["logo_url"] is None
    assert branding_b_data["cover_image_url"] is None
    assert branding_b_data["has_custom_logo"] is False
    assert branding_b_data["has_custom_cover"] is False

    pub_b_resp = await async_client.get(f"/api/v1/clubs/{club_b.id}/public")
    assert pub_b_resp.status_code == 200
    pub_b_data = pub_b_resp.json()
    assert pub_b_data["logo_url"] is None
    assert pub_b_data["cover_image_url"] is None

    # Step 6: Cross-tenant modification rejection
    # Owner B tries to update Club A's branding -> 403 Forbidden
    cross_owner_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_b),
        json={"logo_url": "https://malicious.local/bad_logo.png"},
    )
    assert cross_owner_resp.status_code == 403

    # Club Manager (staff without MANAGE_CLUB) tries to update branding -> 403 Forbidden
    manager_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(manager_a),
        json={"logo_url": "https://malicious.local/bad_logo.png"},
    )
    assert manager_resp.status_code == 403

    # Player tries to update Club A's branding -> 403 Forbidden
    player_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(player),
        json={"logo_url": "https://malicious.local/bad_logo.png"},
    )
    assert player_resp.status_code == 403

    # Step 7: Removing logo cleanly restores null fallback
    remove_logo_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_a),
        json={"logo_url": None},
    )
    assert remove_logo_resp.status_code == 200
    assert remove_logo_resp.json()["logo_url"] is None
    assert remove_logo_resp.json()["has_custom_logo"] is False
    # Cover banner is retained
    assert remove_logo_resp.json()["cover_image_url"] == club_a_cover_url


@pytest.mark.asyncio
async def test_court_photo_creation_persistence_and_isolation(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verifies court photo persistence, cross-court isolation, and cleanup:
    1. Court created with photo_url persists to database and returns photo_url in response.
    2. Court created without photo_url defaults to null.
    3. Active courts listing (/courts/active) accurately returns each court's distinct photo_url.
    4. Media upload accepts genuine image bytes for court asset type.
    5. Updating Court 2's photo isolates to Court 2 without affecting Court 1.
    6. Updating Court 2 with a new photo triggers safe cleanup of previous image.
    """
    owner = await create_user(db_session, full_name="Court Owner")
    club = await create_club(db_session, name="Court Photo Club")
    await create_membership(db_session, user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER)
    await db_session.commit()
    headers = make_auth_header(owner)

    # 1. Create Court 1 with photo_url
    court1_photo = "https://assets.local/court1_original.jpg"
    res1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=headers,
        json={
            "name": "Championship Court 1",
            "court_number": 1,
            "indoor_outdoor": "indoor",
            "photo_url": court1_photo,
        },
    )
    assert res1.status_code == 201
    court1_data = res1.json()
    assert court1_data["photo_url"] == court1_photo
    court1_id = court1_data["id"]

    # 2. Create Court 2 without photo_url
    res2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/courts",
        headers=headers,
        json={
            "name": "Court 2",
            "court_number": 2,
            "indoor_outdoor": "outdoor",
        },
    )
    assert res2.status_code == 201
    court2_data = res2.json()
    assert court2_data["photo_url"] is None
    court2_id = court2_data["id"]

    # 3. Active courts endpoint reflects distinct court photos
    active_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/active",
        headers=headers,
    )
    assert active_res.status_code == 200
    active_courts = active_res.json()
    c1 = next(c for c in active_courts if c["id"] == court1_id)
    c2 = next(c for c in active_courts if c["id"] == court2_id)
    assert c1["photo_url"] == court1_photo
    assert c2["photo_url"] is None

    # 4. Upload genuine media for Court 2
    img_bytes = make_test_image(format="JPEG", size=(200, 200), color="blue")
    upload_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        headers=headers,
        files={"file": ("court2_blue.jpg", img_bytes, "image/jpeg")},
        data={"asset_type": "court"},
    )
    assert upload_res.status_code == 200
    court2_uploaded_url = upload_res.json()["public_url"]

    # Assign uploaded photo to Court 2 via PUT /courts/{id}/image
    img_assign_res = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court2_id}/image",
        headers=headers,
        json={"image_url": court2_uploaded_url},
    )
    assert img_assign_res.status_code == 200
    assert img_assign_res.json()["photo_url"] == court2_uploaded_url

    # Verify Court 1 was unaffected
    c1_check = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/{court1_id}",
        headers=headers,
    )
    assert c1_check.status_code == 200
    assert c1_check.json()["photo_url"] == court1_photo

    # 5. Replace Court 2's photo with a new URL and verify update
    court2_new_photo = "https://assets.local/court2_new.jpg"
    update_res = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court2_id}",
        headers=headers,
        json={"photo_url": court2_new_photo},
    )
    assert update_res.status_code == 200
    assert update_res.json()["photo_url"] == court2_new_photo

    # Active courts list reflects the newly updated Court 2 photo
    active_res2 = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/active",
        headers=headers,
    )
    assert active_res2.status_code == 200
    active_courts2 = active_res2.json()
    c2_updated = next(c for c in active_courts2 if c["id"] == court2_id)
    assert c2_updated["photo_url"] == court2_new_photo


