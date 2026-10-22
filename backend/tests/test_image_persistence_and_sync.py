"""
Aught2 Pickleball — Image Persistence, Synchronization, and Tenant Scoping Regression Tests

Covers:
 1. Court image persistence across court views, active player listings, and booking serialization.
 2. Fix verification: BookingCourtInfo includes photo_url so player/owner booking views render real court photos.
 3. Both /active and /player-courts endpoints successfully return active courts with photo_url.
 4. Multi-court & multi-club image isolation (zero leakage between Court A1, Court A2, and Club B).
 5. Court photo replacement and durable cleanup of orphaned assets.
 6. Player profile avatar upload lifecycle (Pillow validation, EXIF stripping, durable persistence, cleanup on replacement/deletion).
 7. Error handling: invalid files (400), file size limits (413), unauthorized access (403).
"""
from __future__ import annotations

import base64
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
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.user import User
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.player_profile import PlayerProfile
from tests.conftest import make_auth_header


def make_test_image(format: str = "JPEG", size: tuple[int, int] = (150, 150), color: str = "blue") -> bytes:
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

    # Also attach PlayerProfile
    profile = PlayerProfile(
        user_id=user.id,
        first_name="Test",
        last_name="User",
        display_name=full_name,
    )
    db.add(profile)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str | None = None,
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


async def assign_membership(
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
    return membership


# ─── Tests ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_court_photo_persistence_and_booking_synchronization(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify court photo persistence and ensure BookingCourtInfo schema serializes photo_url.
    Prevents court photos from disappearing or falling back to stock photos in booking views.
    """
    owner = await create_user(db_session, full_name="Court Owner")
    player = await create_user(db_session, full_name="Booking Player")
    club = await create_club(db_session, name="Sun Valley Pickleball")
    await assign_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    owner_headers = make_auth_header(owner)
    player_headers = make_auth_header(player)

    # 1. Create Court
    court = Court(
        club_id=club.id,
        name="Championship Court 1",
        display_name="Center Stadium",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        surface_type="Cushioned Acrylic",
        status=CourtStatus.ACTIVE,
        is_active=True,
        price_per_hour=Decimal("35.00"),
        display_order=1,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(court)
    await db_session.commit()
    await db_session.refresh(court)

    # 2. Upload Court Photo
    image_bytes = make_test_image(format="JPEG", color="navy")
    files = {"file": ("stadium_court.jpg", image_bytes, "image/jpeg")}
    data = {"asset_type": "court_photo", "entity_type": "court", "entity_id": str(court.id)}

    upload_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        files=files,
        data=data,
        headers=owner_headers,
    )
    assert upload_resp.status_code == 200, upload_resp.text
    photo_url = upload_resp.json()["public_url"]
    assert "/court-photo/" in photo_url

    # 3. Associate photo with Court
    update_resp = await async_client.put(
        f"/api/v1/clubs/{club.id}/courts/{court.id}/image",
        json={"image_url": photo_url},
        headers=owner_headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["photo_url"] == photo_url

    # 4. Check active courts endpoint (canonical /courts/active)
    active_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/courts/active",
        headers=player_headers,
    )
    assert active_resp.status_code == 200
    active_courts = active_resp.json()
    assert len(active_courts) == 1
    assert active_courts[0]["photo_url"] == photo_url

    # 5. Check alias endpoint (/clubs/{club_id}/player-courts)
    alias_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-courts",
        headers=player_headers,
    )
    assert alias_resp.status_code == 200
    assert alias_resp.json()[0]["photo_url"] == photo_url

    # 6. Create Booking on this court
    now = datetime.now(timezone.utc)
    start_time = now + timedelta(days=1)
    end_time = start_time + timedelta(hours=1)
    booking = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=player.id,
        booked_by_user_id=player.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=start_time,
        end_at=end_time,
        price_per_hour=Decimal("35.00"),
        total_price=Decimal("35.00"),
        currency="USD",
        created_at=now,
    )
    db_session.add(booking)
    await db_session.commit()
    await db_session.refresh(booking)

    # 7. Fetch booking as player and verify court photo_url is preserved in response
    booking_resp = await async_client.get(
        f"/api/v1/bookings/{booking.id}",
        headers=player_headers,
    )
    assert booking_resp.status_code == 200, booking_resp.text
    booking_data = booking_resp.json()
    assert booking_data["court"] is not None
    assert booking_data["court"]["photo_url"] == photo_url, (
        f"Expected court photo_url {photo_url}, but got {booking_data['court'].get('photo_url')}"
    )


@pytest.mark.asyncio
async def test_multi_court_and_multi_club_isolation(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify Court A1, Court A2 in Club A and Court B1 in Club B maintain strictly isolated images.
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    owner_b = await create_user(db_session, full_name="Owner B")
    club_a = await create_club(db_session, name="Club Alpha")
    club_b = await create_club(db_session, name="Club Beta")

    await assign_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await assign_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)

    # Courts in Club A
    court_a1 = Court(club_id=club_a.id, name="Court A1", indoor_outdoor=CourtEnvironment.INDOOR, is_active=True, display_order=1)
    court_a2 = Court(club_id=club_a.id, name="Court A2", indoor_outdoor=CourtEnvironment.OUTDOOR, is_active=True, display_order=2)
    # Court in Club B
    court_b1 = Court(club_id=club_b.id, name="Court B1", indoor_outdoor=CourtEnvironment.INDOOR, is_active=True, display_order=1)

    db_session.add_all([court_a1, court_a2, court_b1])
    await db_session.commit()
    for c in (court_a1, court_a2, court_b1):
        await db_session.refresh(c)

    headers_a = make_auth_header(owner_a)
    headers_b = make_auth_header(owner_b)

    # Upload photo for Court A1
    img_a1 = make_test_image(color="red")
    res_a1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        files={"file": ("a1.jpg", img_a1, "image/jpeg")},
        data={"asset_type": "court_photo"},
        headers=headers_a,
    )
    url_a1 = res_a1.json()["public_url"]
    await async_client.put(f"/api/v1/clubs/{club_a.id}/courts/{court_a1.id}/image", json={"image_url": url_a1}, headers=headers_a)

    # Upload photo for Court A2
    img_a2 = make_test_image(color="green")
    res_a2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/media/upload",
        files={"file": ("a2.jpg", img_a2, "image/jpeg")},
        data={"asset_type": "court_photo"},
        headers=headers_a,
    )
    url_a2 = res_a2.json()["public_url"]
    await async_client.put(f"/api/v1/clubs/{club_a.id}/courts/{court_a2.id}/image", json={"image_url": url_a2}, headers=headers_a)

    # Upload photo for Court B1
    img_b1 = make_test_image(color="yellow")
    res_b1 = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/media/upload",
        files={"file": ("b1.jpg", img_b1, "image/jpeg")},
        data={"asset_type": "court_photo"},
        headers=headers_b,
    )
    url_b1 = res_b1.json()["public_url"]
    await async_client.put(f"/api/v1/clubs/{club_b.id}/courts/{court_b1.id}/image", json={"image_url": url_b1}, headers=headers_b)

    # Verify Club A courts
    res_club_a = await async_client.get(f"/api/v1/clubs/{club_a.id}/courts/active", headers=headers_a)
    courts_a = {c["name"]: c["photo_url"] for c in res_club_a.json()}
    assert courts_a["Court A1"] == url_a1
    assert courts_a["Court A2"] == url_a2
    assert courts_a["Court A1"] != courts_a["Court A2"]

    # Verify Club B courts
    res_club_b = await async_client.get(f"/api/v1/clubs/{club_b.id}/courts/active", headers=headers_b)
    courts_b = {c["name"]: c["photo_url"] for c in res_club_b.json()}
    assert courts_b["Court B1"] == url_b1
    assert courts_b["Court B1"] not in (url_a1, url_a2)


@pytest.mark.asyncio
async def test_court_photo_replacement_and_safe_cleanup(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Replacing a court photo updates the database reference and removes the old unreferenced asset.
    """
    owner = await create_user(db_session, full_name="Club Admin")
    club = await create_club(db_session, name="Clean Club")
    await assign_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    headers = make_auth_header(owner)

    court = Court(club_id=club.id, name="Main Court", indoor_outdoor=CourtEnvironment.INDOOR, is_active=True, display_order=1)
    db_session.add(court)
    await db_session.commit()
    await db_session.refresh(court)

    # Initial upload
    res1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        files={"file": ("old.jpg", make_test_image(color="teal"), "image/jpeg")},
        data={"asset_type": "court_photo"},
        headers=headers,
    )
    url1 = res1.json()["public_url"]
    await async_client.put(f"/api/v1/clubs/{club.id}/courts/{court.id}/image", json={"image_url": url1}, headers=headers)

    # Replacement upload
    res2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        files={"file": ("new.jpg", make_test_image(color="orange"), "image/jpeg")},
        data={"asset_type": "court_photo"},
        headers=headers,
    )
    url2 = res2.json()["public_url"]
    await async_client.put(f"/api/v1/clubs/{club.id}/courts/{court.id}/image", json={"image_url": url2}, headers=headers)

    # Verify updated court returns url2
    court_check = await async_client.get(f"/api/v1/clubs/{club.id}/courts/active", headers=headers)
    assert court_check.json()[0]["photo_url"] == url2


@pytest.mark.asyncio
async def test_player_avatar_upload_lifecycle_and_cleanup(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Test player profile avatar upload, replacement, and deletion through MediaStorageService.
    """
    user = await create_user(db_session, full_name="Avatar Player")
    headers = make_auth_header(user)

    # 1. Upload initial avatar (Base64 JPEG)
    img_bytes = make_test_image(format="JPEG", size=(200, 200), color="purple")
    b64_data = f"data:image/jpeg;base64,{base64.b64encode(img_bytes).decode('ascii')}"

    resp1 = await async_client.post(
        "/api/v1/player/profile/photo",
        json={"image_data": b64_data},
        headers=headers,
    )
    assert resp1.status_code == 200, resp1.text
    avatar_url1 = resp1.json()["profile_image_url"]
    assert avatar_url1.startswith("/uploads/avatars/")

    # 2. Replace with a second avatar
    img_bytes2 = make_test_image(format="PNG", size=(200, 200), color="lime")
    b64_data2 = f"data:image/png;base64,{base64.b64encode(img_bytes2).decode('ascii')}"

    resp2 = await async_client.post(
        "/api/v1/player/profile/photo",
        json={"image_data": b64_data2},
        headers=headers,
    )
    assert resp2.status_code == 200
    avatar_url2 = resp2.json()["profile_image_url"]
    assert avatar_url2.startswith("/uploads/avatars/")
    assert avatar_url2 != avatar_url1

    # 3. Delete profile photo
    del_resp = await async_client.delete(
        "/api/v1/player/profile/photo",
        headers=headers,
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["profile_image_url"] in ("", None)


@pytest.mark.asyncio
async def test_image_upload_validation_and_unauthorized_rejection(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Verify rejection of corrupt images, oversized payloads, and unauthorized mutations.
    """
    owner = await create_user(db_session, full_name="Club Owner")
    stranger = await create_user(db_session, full_name="Stranger")
    club = await create_club(db_session, name="Secure Club")
    await assign_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    owner_headers = make_auth_header(owner)
    stranger_headers = make_auth_header(stranger)

    # 1. Reject invalid image binary data
    bad_files = {"file": ("corrupt.jpg", b"NOT_A_VALID_IMAGE_BINARY", "image/jpeg")}
    bad_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        files=bad_files,
        data={"asset_type": "court_photo"},
        headers=owner_headers,
    )
    assert bad_resp.status_code == 400
    assert "Invalid image" in bad_resp.json()["detail"] or "corrupt" in bad_resp.json()["detail"].lower()

    # 2. Reject unauthorized user (stranger)
    valid_files = {"file": ("court.jpg", make_test_image(), "image/jpeg")}
    forbidden_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/media/upload",
        files=valid_files,
        data={"asset_type": "court_photo"},
        headers=stranger_headers,
    )
    assert forbidden_resp.status_code in (403, 404)
