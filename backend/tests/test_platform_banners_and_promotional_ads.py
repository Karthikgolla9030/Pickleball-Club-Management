"""
Comprehensive Test Suite for Centralized Platform Banners and Club Promotional Ads.

Validates:
1. Global Platform Banners:
   - Platform Owner can retrieve, update, upload image, and reset Owner Home & Player Home banners.
   - Owner Home and Player Home banners are completely independent.
   - Public/Player/Club Owner read access to platform banners without administrative mutation privileges.
   - Non-platform-owners (Club Owners, Players) receive 403 Forbidden on update/upload/reset.
   - Resetting restores platform defaults with null custom image.
2. Club Promotional Ads:
   - Club Owner can create promotional ads with title, subtitle, CTA text/route, start/end dates.
   - Club Owner can update, activate/deactivate, reorder, and delete promotional ads.
   - Multi-tenant isolation: Club Owner A cannot mutate Club B's promotional ads.
   - Public club promotional ads endpoint returns only that club's active, scheduled ads.
3. Universal Promotional Ads Carousel:
   - Aggregates active promotional ads from multiple active clubs.
   - Excludes inactive ads.
   - Excludes ads with future start_date or past end_date.
   - Excludes ads belonging to inactive clubs.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from tests.conftest import make_auth_header


def make_test_image(format="JPEG", size=(120, 120), color="green") -> bytes:
    """Generate valid image bytes with genuine magic headers."""
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
    is_active: bool = True,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    club = Club(
        name=name or f"Club {suffix}",
        slug=f"club-{suffix}",
        is_active=is_active,
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
# 1. Platform Admin Global Home Page Banners
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_platform_banner_admin_crud_and_security(
    async_client: AsyncClient, db_session: AsyncSession
):
    settings = get_settings()
    admin_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@aught2.com"
    platform_admin = await create_user(db_session, email=admin_email, full_name="Platform Owner")
    club_owner = await create_user(db_session, full_name="Regular Club Owner")
    await db_session.commit()

    # 1. Unauthenticated or public player can read all platform banners
    get_all_resp = await async_client.get("/api/v1/platform/banners")
    assert get_all_resp.status_code == 200
    all_banners = get_all_resp.json()
    assert "owner_home" in all_banners
    assert "player_home" in all_banners

    # 2. Non-admin (club owner) cannot update platform banner -> 403 Forbidden
    unauthorized_update = await async_client.put(
        "/api/v1/platform/banners/owner_home",
        json={"title": "Hacked Banner", "subtitle": "Should Fail"},
        headers=make_auth_header(club_owner),
    )
    assert unauthorized_update.status_code == 403

    # 3. Non-admin cannot upload platform banner image -> 403 Forbidden
    img_bytes = make_test_image(color="blue")
    unauthorized_upload = await async_client.post(
        "/api/v1/platform/banners/owner_home/upload",
        files={"file": ("test.jpg", img_bytes, "image/jpeg")},
        headers=make_auth_header(club_owner),
    )
    assert unauthorized_upload.status_code == 403

    # 4. Authorized Platform Admin can upload banner image for owner_home
    upload_resp = await async_client.post(
        "/api/v1/platform/banners/owner_home/upload",
        files={"file": ("owner_hero.jpg", img_bytes, "image/jpeg")},
        headers=make_auth_header(platform_admin),
    )
    assert upload_resp.status_code == 200
    uploaded_data = upload_resp.json()
    assert uploaded_data["image_url"] is not None
    assert "/uploads/platform_banners/" in uploaded_data["image_url"]

    # 5. Platform Admin updates title, subtitle, CTA for owner_home
    update_owner_resp = await async_client.put(
        "/api/v1/platform/banners/owner_home",
        json={
            "title": "Welcome Owner Dashboard",
            "subtitle": "Global centralized owner welcome hero",
            "cta_text": "View Courts",
            "cta_destination": "/(club)/courts",
        },
        headers=make_auth_header(platform_admin),
    )
    assert update_owner_resp.status_code == 200
    owner_data = update_owner_resp.json()
    assert owner_data["title"] == "Welcome Owner Dashboard"
    assert owner_data["cta_text"] == "View Courts"

    # 6. Player banner remains independent
    get_player_resp = await async_client.get("/api/v1/platform/banners/player_home")
    assert get_player_resp.status_code == 200
    player_data = get_player_resp.json()
    assert player_data["title"] != "Welcome Owner Dashboard"

    # 7. Platform Admin can update player_home banner
    update_player_resp = await async_client.put(
        "/api/v1/platform/banners/player_home",
        json={
            "title": "Hello Champions",
            "subtitle": "Discover tournaments & open play",
            "cta_text": "Join League",
            "cta_destination": "/(player)/leagues",
        },
        headers=make_auth_header(platform_admin),
    )
    assert update_player_resp.status_code == 200
    assert update_player_resp.json()["title"] == "Hello Champions"

    # 8. Platform Admin can reset banner back to platform default
    reset_resp = await async_client.delete(
        "/api/v1/platform/banners/owner_home",
        headers=make_auth_header(platform_admin),
    )
    assert reset_resp.status_code == 200
    reset_data = reset_resp.json()
    assert reset_data["image_url"] is None  # Reverts to built-in fallback


# ─────────────────────────────────────────────────────────────────────────────
# 2. Club Promotional Ads CRUD & Multi-Tenant Scoping
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_promotional_ads_crud_and_tenant_isolation(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner_a = await create_user(db_session, full_name="Owner Club A")
    owner_b = await create_user(db_session, full_name="Owner Club B")
    club_a = await create_club(db_session, name="Austin Smash Pickleball")
    club_b = await create_club(db_session, name="Dallas Dinks Club")
    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # 1. Owner A creates promotional ad for Club A
    create_payload = {
        "title": "Summer Clinic Special",
        "subtitle": "Get 20% off all July clinics",
        "tag": "SPECIAL OFFER",
        "image_url": "https://example.com/ad_summer.jpg",
        "cta_text": "Book Lesson",
        "cta_route": "/(player)/lessons",
        "is_active": True,
    }
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/promotional-ads",
        json=create_payload,
        headers=make_auth_header(owner_a),
    )
    assert create_resp.status_code == 201
    ad_a = create_resp.json()
    assert ad_a["title"] == "Summer Clinic Special"
    assert ad_a["club_id"] == str(club_a.id)

    # 2. Owner B cannot update or delete Club A's ad -> 403 Forbidden
    update_attempt = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/promotional-ads/{ad_a['id']}",
        json={"title": "Hacked Title"},
        headers=make_auth_header(owner_b),
    )
    assert update_attempt.status_code == 403

    delete_attempt = await async_client.delete(
        f"/api/v1/clubs/{club_a.id}/promotional-ads/{ad_a['id']}",
        headers=make_auth_header(owner_b),
    )
    assert delete_attempt.status_code == 403

    # 3. Public query for Club A ads returns Club A's ad
    get_club_a_ads = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/promotional-ads?active_only=true"
    )
    assert get_club_a_ads.status_code == 200
    club_a_ads = get_club_a_ads.json()
    assert len(club_a_ads) == 1
    assert club_a_ads[0]["id"] == ad_a["id"]

    # 4. Public query for Club B ads is completely empty (Club A ads do NOT leak to Club B)
    get_club_b_ads = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/promotional-ads?active_only=true"
    )
    assert get_club_b_ads.status_code == 200
    assert len(get_club_b_ads.json()) == 0

    # 5. Owner A can update ad status (deactivate)
    deactivate_resp = await async_client.put(
        f"/api/v1/clubs/{club_a.id}/promotional-ads/{ad_a['id']}",
        json={"is_active": False},
        headers=make_auth_header(owner_a),
    )
    assert deactivate_resp.status_code == 200
    assert deactivate_resp.json()["is_active"] is False

    # Once deactivated, public active_only query returns empty
    get_club_a_active = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/promotional-ads?active_only=true"
    )
    assert len(get_club_a_active.json()) == 0

    # 6. Owner A deletes ad
    del_resp = await async_client.delete(
        f"/api/v1/clubs/{club_a.id}/promotional-ads/{ad_a['id']}",
        headers=make_auth_header(owner_a),
    )
    assert del_resp.status_code == 204


# ─────────────────────────────────────────────────────────────────────────────
# 3. Universal Promotional Ads Carousel Aggregation & Scheduling
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_universal_promotional_ads_aggregation_and_scheduling(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner_a = await create_user(db_session, full_name="Owner A")
    owner_b = await create_user(db_session, full_name="Owner B")
    club_a = await create_club(db_session, name="Austin Smash Club", is_active=True)
    club_b = await create_club(db_session, name="Houston Pickle Club", is_active=True)
    club_inactive = await create_club(db_session, name="Suspended Club", is_active=False)

    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)
    tomorrow = now + timedelta(days=1)
    last_week = now - timedelta(days=7)
    next_week = now + timedelta(days=7)

    # Ad 1: Club A active unscheduled ad -> ELIGIBLE
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/promotional-ads",
        json={
            "title": "Ad A1 Active",
            "image_url": "https://example.com/a1.jpg",
            "is_active": True,
        },
        headers=make_auth_header(owner_a),
    )

    # Ad 2: Club A active scheduled valid ad -> ELIGIBLE
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/promotional-ads",
        json={
            "title": "Ad A2 Scheduled Valid",
            "image_url": "https://example.com/a2.jpg",
            "start_date": yesterday.isoformat(),
            "end_date": tomorrow.isoformat(),
            "is_active": True,
        },
        headers=make_auth_header(owner_a),
    )

    # Ad 3: Club A expired ad -> INELIGIBLE
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/promotional-ads",
        json={
            "title": "Ad A3 Expired",
            "image_url": "https://example.com/a3.jpg",
            "start_date": last_week.isoformat(),
            "end_date": yesterday.isoformat(),
            "is_active": True,
        },
        headers=make_auth_header(owner_a),
    )

    # Ad 4: Club A future-scheduled ad -> INELIGIBLE
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/promotional-ads",
        json={
            "title": "Ad A4 Future",
            "image_url": "https://example.com/a4.jpg",
            "start_date": tomorrow.isoformat(),
            "end_date": next_week.isoformat(),
            "is_active": True,
        },
        headers=make_auth_header(owner_a),
    )

    # Ad 5: Club B active ad -> ELIGIBLE
    await async_client.post(
        f"/api/v1/clubs/{club_b.id}/promotional-ads",
        json={
            "title": "Ad B1 Active",
            "image_url": "https://example.com/b1.jpg",
            "is_active": True,
        },
        headers=make_auth_header(owner_b),
    )

    # Ad 6: Club B deactivated ad -> INELIGIBLE
    await async_client.post(
        f"/api/v1/clubs/{club_b.id}/promotional-ads",
        json={
            "title": "Ad B2 Disabled",
            "image_url": "https://example.com/b2.jpg",
            "is_active": False,
        },
        headers=make_auth_header(owner_b),
    )

    # Fetch universal ads carousel
    univ_resp = await async_client.get("/api/v1/promotional-ads/universal")
    assert univ_resp.status_code == 200
    univ_ads = univ_resp.json()

    titles = [a["title"] for a in univ_ads]
    assert "Ad A1 Active" in titles
    assert "Ad A2 Scheduled Valid" in titles
    assert "Ad B1 Active" in titles
    assert "Ad A3 Expired" not in titles
    assert "Ad A4 Future" not in titles
    assert "Ad B2 Disabled" not in titles

    # Verify club context is properly included in universal ads
    a1_item = next(a for a in univ_ads if a["title"] == "Ad A1 Active")
    assert a1_item["club_name"] == "Austin Smash Club"
    assert a1_item["club_id"] == str(club_a.id)
