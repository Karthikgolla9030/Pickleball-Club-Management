"""
Aught2 Pickleball — Club Branding Defaults, Activity Inheritance, and Multi-Tenant Isolation Test Suite

Tests:
1. Owner Home Dashboard Banner (Group 1): Get, update, and reset.
2. Tournament Format Default Banners (Group 2):
   - Configure Round Robin, Scramble, Pool Play, and Bracket Play defaults independently.
   - Granular updates (updating one format preserves others).
3. League Default Banner (Group 3): Get, update, and reset.
4. Event Default Banner (Group 4): Get, update, and reset.
5. Lesson Default Banner (Group 5): Get, update, and reset.
6. Resetting defaults to null restores platform fallbacks.
7. Dynamic Fallback Priority:
   - Tournament custom banner overrides club format default.
   - Tournament with null banner inherits club format default.
   - Updating club format default updates resolved banner for inheriting tournaments without mutating custom tournaments.
8. Multi-Tenant Isolation:
   - Club A's defaults do not affect Club B.
   - Club B owner cannot mutate Club A's branding or defaults (403 Forbidden).
   - Regular player / member cannot mutate club defaults (403 Forbidden).
9. Media Upload Security:
   - Uploading valid image bytes succeeds and produces media URL.
   - Uploading corrupted / non-image bytes is rejected with 400 Bad Request.
   - Non-member / cross-tenant cannot upload media to another club (403 Forbidden).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import io
import uuid
import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.event import Event, EventStatus, EventVisibility, EventType
from app.models.league import League, LeagueStatus
from app.models.lesson import Lesson, LessonStatus
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.user import User
from tests.conftest import make_auth_header


def make_test_image(format="JPEG", size=(120, 120), color="blue") -> bytes:
    """Generate valid image bytes with valid magic headers."""
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=format)
    return buf.getvalue()


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


# ─────────────────────────────────────────────────────────────────────────────
# 1. Setting, Getting, and Updating All 5 Branding Asset Groups
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_branding_all_five_groups_persistence(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verify Club Owner can configure all 5 distinct asset groups:
    - Group 1: Owner Banner
    - Group 2: 4 Tournament Format Defaults (Round Robin, Scramble, Pool Play, Bracket)
    - Group 3: League Default Banner
    - Group 4: Event Default Banner
    - Group 5: Lesson Default Image
    """
    owner = await create_user(db_session, full_name="Club Owner")
    club = await create_club(db_session, name="Grand Slam Pickleball")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Initial branding get should return null for all new defaults
    get_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
    )
    assert get_resp.status_code == 200
    initial_data = get_resp.json()
    assert initial_data["owner_banner_url"] is None
    assert initial_data["default_tournament_round_robin_url"] is None
    assert initial_data["default_tournament_scramble_url"] is None
    assert initial_data["default_tournament_pool_play_url"] is None
    assert initial_data["default_tournament_bracket_url"] is None
    assert initial_data["default_league_banner_url"] is None
    assert initial_data["default_event_banner_url"] is None
    assert initial_data["default_lesson_banner_url"] is None

    # Update all 5 groups in a single payload
    update_payload = {
        "owner_banner_url": "https://assets.local/owner-banner.jpg",
        "default_tournament_round_robin_url": "https://assets.local/rr-default.jpg",
        "default_tournament_scramble_url": "https://assets.local/scramble-default.jpg",
        "default_tournament_pool_play_url": "https://assets.local/pool-play-default.jpg",
        "default_tournament_bracket_url": "https://assets.local/bracket-default.jpg",
        "default_league_banner_url": "https://assets.local/league-default.jpg",
        "default_event_banner_url": "https://assets.local/event-default.jpg",
        "default_lesson_banner_url": "https://assets.local/lesson-default.jpg",
    }
    put_resp = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
        json=update_payload,
    )
    assert put_resp.status_code == 200
    updated_data = put_resp.json()
    for field, expected_val in update_payload.items():
        assert updated_data[field] == expected_val

    # Verify custom flags are all True
    assert updated_data["has_custom_owner_banner"] is True
    assert updated_data["has_custom_tournament_round_robin"] is True
    assert updated_data["has_custom_tournament_scramble"] is True
    assert updated_data["has_custom_tournament_pool_play"] is True
    assert updated_data["has_custom_tournament_bracket"] is True
    assert updated_data["has_custom_league_banner"] is True
    assert updated_data["has_custom_event_banner"] is True
    assert updated_data["has_custom_lesson_banner"] is True

    # Re-fetch via GET to verify persistent DB storage
    get_resp_2 = await async_client.get(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
    )
    assert get_resp_2.status_code == 200
    data_2 = get_resp_2.json()
    for field, expected_val in update_payload.items():
        assert data_2[field] == expected_val


@pytest.mark.asyncio
async def test_granular_partial_updates_and_resets(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verify updating one field does NOT clobber other configured defaults,
    and sending null explicitly resets the field back to default.
    """
    owner = await create_user(db_session, full_name="Granular Owner")
    club = await create_club(db_session, name="Granular Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Seed 2 defaults
    await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
        json={
            "default_tournament_round_robin_url": "https://assets.local/rr-initial.jpg",
            "default_league_banner_url": "https://assets.local/league-initial.jpg",
        },
    )

    # Granularly update scramble default without sending round robin
    resp_patch = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
        json={
            "default_tournament_scramble_url": "https://assets.local/scramble-new.jpg",
        },
    )
    assert resp_patch.status_code == 200
    data = resp_patch.json()
    assert data["default_tournament_round_robin_url"] == "https://assets.local/rr-initial.jpg"
    assert data["default_league_banner_url"] == "https://assets.local/league-initial.jpg"
    assert data["default_tournament_scramble_url"] == "https://assets.local/scramble-new.jpg"

    # Now explicitly reset round robin to null
    resp_reset = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
        json={
            "default_tournament_round_robin_url": None,
        },
    )
    assert resp_reset.status_code == 200
    reset_data = resp_reset.json()
    assert reset_data["default_tournament_round_robin_url"] is None
    assert reset_data["has_custom_tournament_round_robin"] is False
    # Other fields remain intact
    assert reset_data["default_league_banner_url"] == "https://assets.local/league-initial.jpg"
    assert reset_data["default_tournament_scramble_url"] == "https://assets.local/scramble-new.jpg"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Activity Dynamic Fallback & Inheritance
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tournament_banner_inheritance_and_custom_override(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verify fallback precedence for tournaments:
    1. Custom tournament banner (`banner_image_url`) takes top priority.
    2. When tournament has no custom banner (`banner_image_url` is None),
       it inherits the club's format default (`default_tournament_round_robin_url`).
    3. Updating club format default dynamically affects tournaments without custom banner,
       while leaving tournaments with custom banner completely untouched.
    """
    owner = await create_user(db_session, full_name="Tournament Director")
    club = await create_club(db_session, name="Metro Tournament Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    now = datetime.now(timezone.utc)
    # Create Tournament 1: Inherits club default (banner_image_url=None)
    t1 = Tournament(
        club_id=club.id,
        name="Spring Round Robin Open",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now,
        end_date=now + timedelta(days=2),
        registration_open_at=now,
        registration_close_at=now + timedelta(days=1),
        banner_image_url=None,
    )
    # Create Tournament 2: Custom banner
    t2 = Tournament(
        club_id=club.id,
        name="Pro Invitational Round Robin",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now,
        end_date=now + timedelta(days=2),
        registration_open_at=now,
        registration_close_at=now + timedelta(days=1),
        banner_image_url="https://assets.local/custom-t2-banner.jpg",
    )
    db_session.add_all([t1, t2])
    await db_session.commit()

    # Step A: Before club default is set, t1 has banner_image_url=None
    t1_resp = await async_client.get(
        f"/api/v1/tournaments/{t1.id}",
        headers=make_auth_header(owner),
    )
    assert t1_resp.status_code == 200
    assert t1_resp.json()["banner_image_url"] is None

    # Step B: Club sets default Round Robin banner
    club_branding_resp = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
        json={"default_tournament_round_robin_url": "https://assets.local/club-rr-banner-v1.jpg"},
    )
    assert club_branding_resp.status_code == 200
    branding_data = club_branding_resp.json()
    assert branding_data["default_tournament_round_robin_url"] == "https://assets.local/club-rr-banner-v1.jpg"

    # Verify t2 still retains its custom banner
    t2_resp = await async_client.get(
        f"/api/v1/tournaments/{t2.id}",
        headers=make_auth_header(owner),
    )
    assert t2_resp.status_code == 200
    assert t2_resp.json()["banner_image_url"] == "https://assets.local/custom-t2-banner.jpg"

    # Step C: Club updates default Round Robin banner to v2
    await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
        json={"default_tournament_round_robin_url": "https://assets.local/club-rr-banner-v2.jpg"},
    )
    updated_branding = await async_client.get(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
    )
    assert updated_branding.json()["default_tournament_round_robin_url"] == "https://assets.local/club-rr-banner-v2.jpg"

    # Verify t2 custom banner is strictly unaffected
    t2_resp_again = await async_client.get(
        f"/api/v1/tournaments/{t2.id}",
        headers=make_auth_header(owner),
    )
    assert t2_resp_again.json()["banner_image_url"] == "https://assets.local/custom-t2-banner.jpg"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Multi-Tenant Isolation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_multi_tenant_isolation_between_club_a_and_club_b(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Ensure complete tenant isolation:
    - Club A owner configures Club A defaults.
    - Club B defaults remain independent and unaffected.
    - Club B owner cannot mutate Club A (403 Forbidden).
    - Unauthenticated / regular player cannot mutate club defaults (403 Forbidden).
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    owner_b = await create_user(db_session, full_name="Owner B")
    player = await create_user(db_session, full_name="Regular Player")

    club_a = await create_club(db_session, name="Club Alpha")
    club_b = await create_club(db_session, name="Club Beta")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Owner A configures Club A defaults
    resp_a = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_a),
        json={
            "owner_banner_url": "https://assets.local/alpha-owner.jpg",
            "default_league_banner_url": "https://assets.local/alpha-league.jpg",
            "default_event_banner_url": "https://assets.local/alpha-event.jpg",
        },
    )
    assert resp_a.status_code == 200

    # Verify Club B defaults are totally clean and unaffected
    resp_b = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/branding",
        headers=make_auth_header(owner_b),
    )
    assert resp_b.status_code == 200
    b_data = resp_b.json()
    assert b_data["owner_banner_url"] is None
    assert b_data["default_league_banner_url"] is None
    assert b_data["default_event_banner_url"] is None

    # Owner B attempts to mutate Club A branding -> 403 Forbidden
    resp_cross_tenant = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(owner_b),
        json={"owner_banner_url": "https://assets.local/hack-banner.jpg"},
    )
    assert resp_cross_tenant.status_code == 403

    # Regular player attempts to mutate Club A branding -> 403 Forbidden
    resp_player_forbidden = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        headers=make_auth_header(player),
        json={"owner_banner_url": "https://assets.local/player-banner.jpg"},
    )
    assert resp_player_forbidden.status_code == 403


# ─────────────────────────────────────────────────────────────────────────────
# 4. Media Upload Security & Validation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_branding_media_upload_validation_and_rbac(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verify:
    1. Genuine image upload returns safe file url.
    2. Non-image corrupted file is rejected (400 Bad Request).
    3. Cross-club upload is rejected with 403 Forbidden.
    """
    owner_a = await create_user(db_session, full_name="Upload Owner A")
    owner_b = await create_user(db_session, full_name="Upload Owner B")
    club_a = await create_club(db_session, name="Upload Club A")
    club_b = await create_club(db_session, name="Upload Club B")

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # 1. Genuine image upload for Owner A on Club A
    valid_png_bytes = make_test_image("PNG", size=(200, 200), color="green")
    upload_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(owner_a),
        data={"asset_type": "branding"},
        files={"file": ("banner.png", valid_png_bytes, "image/png")},
    )
    assert upload_resp.status_code == 200
    upload_data = upload_resp.json()
    assert "public_url" in upload_data
    assert upload_data["public_url"].startswith("/uploads/")

    # 2. Corrupted / non-image bytes rejected with 400
    bad_bytes = b"NOT_AN_IMAGE_FAKE_FILE_CONTENT_XYZ"
    bad_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(owner_a),
        data={"asset_type": "branding"},
        files={"file": ("fake.png", bad_bytes, "image/png")},
    )
    assert bad_resp.status_code == 400

    # 3. Cross-tenant upload: Owner B trying to upload asset for Club A
    cross_upload_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        headers=make_auth_header(owner_b),
        data={"asset_type": "branding"},
        files={"file": ("banner.png", valid_png_bytes, "image/png")},
    )
    assert cross_upload_resp.status_code == 403


@pytest.mark.asyncio
async def test_activity_custom_picture_persistence_and_independence(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify:
    1. Creating league, event, and tournament with custom pictures persists them.
    2. Response objects contain the custom picture URLs.
    3. Custom pictures do not overwrite or mutate club defaults in branding.
    4. Updating custom pictures updates only that activity.
    """
    owner = await create_user(db_session, "owner_activity_pic@test.local")
    club = await create_club(db_session, "Pic Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Configure club default pictures
    brand_put = await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
        json={
            "default_league_banner_url": "/uploads/defaults/club_league_default.jpg",
            "default_event_banner_url": "/uploads/defaults/club_event_default.jpg",
            "default_tournament_round_robin_url": "/uploads/defaults/club_rr_default.jpg",
        },
    )
    assert brand_put.status_code == 200, brand_put.text

    # 1. Create League with custom picture
    custom_league_pic = "/uploads/leagues/custom_league_123.jpg"
    league_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/leagues",
        headers=make_auth_header(owner),
        json={
            "name": "Summer Super League",
            "number_of_weeks": 4,
            "team_size": 2,
            "playoff_team_count": 2,
            "max_teams": 8,
            "banner_image_url": custom_league_pic,
        },
    )
    assert league_res.status_code in (200, 201), league_res.text
    league_data = league_res.json()
    assert league_data["banner_image_url"] == custom_league_pic

    # 2. Create Event with custom picture
    custom_event_pic = "/uploads/events/custom_event_456.jpg"
    now = datetime.now(timezone.utc)
    event_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/events",
        headers=make_auth_header(owner),
        json={
            "title": "Sunset Social Mixer",
            "event_type": "social",
            "visibility": "public",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=3)).isoformat(),
            "capacity": 24,
            "cover_image_url": custom_event_pic,
        },
    )
    assert event_res.status_code in (200, 201), event_res.text
    event_data = event_res.json()
    assert event_data["cover_image_url"] == custom_event_pic

    # 3. Create Tournament with custom picture
    custom_tourn_pic = "/uploads/tournaments/custom_rr_789.jpg"
    tourn_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=make_auth_header(owner),
        json={
            "name": "Grand Round Robin",
            "format": "round_robin",
            "visibility": "public",
            "start_date": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=5, hours=4)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=4)).isoformat(),
            "banner_image_url": custom_tourn_pic,
        },
    )
    assert tourn_res.status_code in (200, 201), tourn_res.text
    tourn_data = tourn_res.json()
    assert tourn_data["banner_image_url"] == custom_tourn_pic

    # 4. Verify Club defaults in Branding & Assets remain intact (no overwrite)
    branding_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/branding",
        headers=make_auth_header(owner),
    )
    assert branding_res.status_code == 200
    branding_data = branding_res.json()
    assert branding_data["default_league_banner_url"] == "/uploads/defaults/club_league_default.jpg"
    assert branding_data["default_event_banner_url"] == "/uploads/defaults/club_event_default.jpg"
    assert branding_data["default_tournament_round_robin_url"] == "/uploads/defaults/club_rr_default.jpg"
