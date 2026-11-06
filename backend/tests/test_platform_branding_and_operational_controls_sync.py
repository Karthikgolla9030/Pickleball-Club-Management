"""
test_platform_branding_and_operational_controls_sync.py

End-to-end automated tests verifying:
1. Platform Display Name persistence, validation, and real-time synchronization to public branding & home banners
2. Public registration gates enforcement (Club Registration Applications & Player Account Registration)
3. Maximum media upload limit runtime enforcement via MediaStorageService
4. Platform Maintenance Notice toggle and public propagation
5. Global Support Contact Email update and propagation
6. Multi-tenant club name independence and isolation (Club A vs Club B)
7. System Infrastructure & Security read-only safety (no secrets exposed)
"""

import io
import uuid
import pytest
from httpx import AsyncClient
from PIL import Image as PILImage
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from app.services.media_storage_service import MediaStorageService
from tests.conftest import make_auth_header


def _create_test_image_bytes(width: int = 200, height: int = 200, size_target_bytes: int = 1000) -> bytes:
    img = PILImage.new("RGB", (width, height), color=(34, 197, 94))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    data = buf.getvalue()
    if len(data) < size_target_bytes:
        data = data + b"0" * (size_target_bytes - len(data))
    return data


@pytest.fixture
async def platform_owner(db_session: AsyncSession) -> User:
    settings = get_settings()
    platform_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@pickleball.com"
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


@pytest.mark.asyncio
async def test_platform_display_name_persistence_and_sync(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test 1: Verify Platform Display Name update, persistence, and synchronization
    to public branding endpoint and home banners.
    """
    headers = make_auth_header(platform_owner)

    # 1. Update platform name to "Pickleball World"
    patch_res = await async_client.patch(
        "/api/v1/platform/settings",
        json={
            "platform_name": "Pickleball World",
            "reason": "Test branding synchronization",
        },
        headers=headers,
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["runtime_settings"]["platform_name"] == "Pickleball World"

    # 2. Check public branding API
    pub_res = await async_client.get("/api/v1/platform/branding")
    assert pub_res.status_code == 200
    pub_data = pub_res.json()
    assert pub_data["platform_name"] == "Pickleball World"

    # 3. Check platform home banners: owner_home & player_home
    banners_res = await async_client.get("/api/v1/platform/banners")
    assert banners_res.status_code == 200
    b_data = banners_res.json()
    assert b_data["owner_home"]["title"] == "Welcome to Pickleball World"
    assert b_data["player_home"]["title"] == "Welcome to Pickleball World"

    # Reset back to "Pickleball"
    reset_res = await async_client.patch(
        "/api/v1/platform/settings",
        json={"platform_name": "Pickleball", "reason": "Reset to default"},
        headers=headers,
    )
    assert reset_res.status_code == 200
    assert reset_res.json()["runtime_settings"]["platform_name"] == "Pickleball"


@pytest.mark.asyncio
async def test_club_registration_gate_enforcement(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test 2: When allow_new_club_registrations is disabled,
    public club registration applications are blocked with HTTP 403.
    """
    headers = make_auth_header(platform_owner)

    # Pause club registrations
    p_res = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_new_club_registrations": False, "reason": "Pause registrations for maintenance"},
        headers=headers,
    )
    assert p_res.status_code == 200
    assert p_res.json()["runtime_settings"]["allow_new_club_registrations"] is False

    # Attempt public club application submission
    app_payload = {
        "applicant_name": "John Doe",
        "applicant_email": f"john.doe.{uuid.uuid4().hex[:6]}@example.com",
        "applicant_password": "SecurePassword123!",
        "club_name": "Blocked Club Facility",
        "city": "Austin",
        "state": "TX",
        "postal_code": "78701",
        "country": "United States",
    }
    submit_res = await async_client.post("/api/v1/club-applications", json=app_payload)
    assert submit_res.status_code == 403
    assert "temporarily paused" in submit_res.json()["detail"].lower()

    # Re-enable club registrations
    p_restore = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_new_club_registrations": True, "reason": "Resume registrations"},
        headers=headers,
    )
    assert p_restore.status_code == 200
    assert p_restore.json()["runtime_settings"]["allow_new_club_registrations"] is True


@pytest.mark.asyncio
async def test_player_account_registration_gate_enforcement(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test 3: When allow_user_registrations is disabled,
    public player self-registration is blocked with HTTP 403.
    """
    headers = make_auth_header(platform_owner)

    # Pause player registrations
    p_res = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_user_registrations": False, "reason": "Pause user signups for maintenance"},
        headers=headers,
    )
    assert p_res.status_code == 200
    assert p_res.json()["runtime_settings"]["allow_user_registrations"] is False

    # Attempt player registration
    reg_payload = {
        "email": f"new.player.{uuid.uuid4().hex[:6]}@example.com",
        "password": "SecurePassword123!",
        "full_name": "Blocked Player",
    }
    reg_res = await async_client.post("/api/v1/auth/player/register", json=reg_payload)
    assert reg_res.status_code == 403
    assert "temporarily paused" in reg_res.json()["detail"].lower()

    # Re-enable player registrations
    p_restore = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_user_registrations": True, "reason": "Resume user registrations"},
        headers=headers,
    )
    assert p_restore.status_code == 200
    assert p_restore.json()["runtime_settings"]["allow_user_registrations"] is True


@pytest.mark.asyncio
async def test_max_upload_size_runtime_enforcement(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test 4: Maximum media upload limit is enforced dynamically by MediaStorageService.
    """
    headers = make_auth_header(platform_owner)

    # Set limit to 2 MB
    p_res = await async_client.patch(
        "/api/v1/platform/settings",
        json={"max_upload_size_mb": 2, "reason": "Set 2MB upload limit"},
        headers=headers,
    )
    assert p_res.status_code == 200
    assert p_res.json()["runtime_settings"]["max_upload_size_mb"] == 2

    # Verify MediaStorageService fetches runtime limit
    service = MediaStorageService(db_session)
    runtime_limit = await service.get_max_upload_size_bytes()
    assert runtime_limit == 2 * 1024 * 1024

    # Test rejection of file exceeding 2MB
    oversized_bytes = _create_test_image_bytes(size_target_bytes=3 * 1024 * 1024)
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await service.store_image(oversized_bytes, category="general")
    assert exc_info.value.status_code == 413

    # Reset limit to 5 MB
    await async_client.patch(
        "/api/v1/platform/settings",
        json={"max_upload_size_mb": 5, "reason": "Restore 5MB limit"},
        headers=headers,
    )


@pytest.mark.asyncio
async def test_maintenance_mode_and_support_email_sync(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test 5: Platform Maintenance Notice and Global Support Contact Email update and propagate.
    """
    headers = make_auth_header(platform_owner)

    # Enable maintenance mode and update support email
    patch_res = await async_client.patch(
        "/api/v1/platform/settings",
        json={
            "maintenance_mode": True,
            "platform_support_email": "ops-support@pickleball.com",
            "reason": "Scheduled maintenance window",
        },
        headers=headers,
    )
    assert patch_res.status_code == 200
    r = patch_res.json()["runtime_settings"]
    assert r["maintenance_mode"] is True
    assert r["platform_support_email"] == "ops-support@pickleball.com"

    # Public branding reflects new values
    pub_res = await async_client.get("/api/v1/platform/branding")
    assert pub_res.status_code == 200
    pub = pub_res.json()
    assert pub["maintenance_mode"] is True
    assert pub["platform_support_email"] == "ops-support@pickleball.com"

    # Restore
    await async_client.patch(
        "/api/v1/platform/settings",
        json={
            "maintenance_mode": False,
            "platform_support_email": "support@pickleball.com",
            "reason": "Maintenance complete",
        },
        headers=headers,
    )


@pytest.mark.asyncio
async def test_multi_tenant_club_name_isolation(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Test 6: Multi-tenant club name updates remain strictly isolated between clubs.
    """
    owner_a = User(
        id=uuid.uuid4(),
        email=f"owner.a.{uuid.uuid4().hex[:6]}@example.com",
        full_name="Owner A",
        hashed_password=hash_password("ClubOwner123!"),
        is_active=True,
        is_verified=True,
    )
    owner_b = User(
        id=uuid.uuid4(),
        email=f"owner.b.{uuid.uuid4().hex[:6]}@example.com",
        full_name="Owner B",
        hashed_password=hash_password("ClubOwner123!"),
        is_active=True,
        is_verified=True,
    )
    db_session.add_all([owner_a, owner_b])
    await db_session.flush()

    club_a = Club(
        id=uuid.uuid4(),
        name=f"Club Alpha {uuid.uuid4().hex[:4]}",
        slug=f"club-alpha-{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    club_b = Club(
        id=uuid.uuid4(),
        name=f"Club Beta {uuid.uuid4().hex[:4]}",
        slug=f"club-beta-{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db_session.add_all([club_a, club_b])
    await db_session.flush()

    mem_a = ClubMembership(
        id=uuid.uuid4(),
        user_id=owner_a.id,
        club_id=club_a.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    mem_b = ClubMembership(
        id=uuid.uuid4(),
        user_id=owner_b.id,
        club_id=club_b.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add_all([mem_a, mem_b])
    await db_session.commit()
    await db_session.refresh(club_a)
    await db_session.refresh(club_b)

    headers_a = make_auth_header(owner_a)

    # Update Club A name
    new_name_a = f"Austin Premier Pickleball {uuid.uuid4().hex[:4]}"
    update_res = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}",
        json={"name": new_name_a},
        headers=headers_a,
    )
    assert update_res.status_code == 200
    assert update_res.json()["name"] == new_name_a

    # Verify Club B name is unaffected
    await db_session.refresh(club_b)
    assert club_b.name.startswith("Club Beta")

    # Verify public club detail of Club A reflects updated name
    get_a = await async_client.get(f"/api/v1/clubs/{club_a.id}/public")
    assert get_a.status_code == 200
    assert get_a.json()["name"] == new_name_a


@pytest.mark.asyncio
async def test_read_only_system_config_security(
    async_client: AsyncClient,
    db_session: AsyncSession,
    platform_owner: User,
):
    """
    Test 7: Operational Controls read-only parameters expose only non-sensitive config.
    Database passwords, JWT signing secrets, and cloud storage keys must NEVER be exposed.
    """
    headers = make_auth_header(platform_owner)

    res = await async_client.get("/api/v1/platform/settings", headers=headers)
    assert res.status_code == 200
    cfg = res.json()["read_only_config"]

    # Allowed non-sensitive fields
    assert "app_name" in cfg
    assert "app_version" in cfg
    assert "storage_backend" in cfg

    # Strictly verify secrets are NOT in response
    forbidden_keys = [
        "DATABASE_URL",
        "database_url",
        "JWT_SECRET",
        "jwt_secret",
        "SECRET_KEY",
        "secret_key",
        "AWS_SECRET_ACCESS_KEY",
        "aws_secret_access_key",
        "password",
        "hashed_password",
    ]
    for key in forbidden_keys:
        assert key not in cfg, f"Security violation: {key} found in read_only_config!"
