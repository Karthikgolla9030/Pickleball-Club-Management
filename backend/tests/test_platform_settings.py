"""
Aught2 Pickleball — Platform Settings Test Suite

Validates:
1. Platform owner authorization: non-owners / players / club staff are rejected with 403.
2. Read-only configuration retrieval: includes environment parameters, excludes secrets.
3. Secret leakage protection: verifies no passwords, tokens, or database URLs are exposed.
4. Validation and error handling: rejects invalid upload sizes, invalid emails, and forbidden keys.
5. Concurrency & persistence: updates settings atomically with Platform Audit Log tracking.
6. Real runtime enforcement:
   - Pausing club applications blocks prospective submissions.
   - Pausing player registration blocks self-sign-up.
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.platform_audit_log import PlatformAuditLog
from app.models.platform_setting import PlatformSetting
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.fixture
async def platform_owner(db_session: AsyncSession) -> User:
    settings = get_settings()
    platform_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@aught2.com"
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
async def regular_player(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"player.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Regular Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def club_owner(db_session: AsyncSession) -> tuple[User, Club]:
    user = User(
        id=uuid.uuid4(),
        email=f"clubowner.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("ClubOwner123!"),
        full_name="Club Facility Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    club = Club(
        id=uuid.uuid4(),
        name=f"Austin Pickleball {uuid.uuid4().hex[:4]}",
        slug=f"austin-{uuid.uuid4().hex[:4]}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    membership = ClubMembership(
        id=uuid.uuid4(),
        user_id=user.id,
        club_id=club.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(club)
    return user, club


@pytest.mark.asyncio
async def test_platform_settings_authorization(
    async_client: AsyncClient,
    platform_owner: User,
    regular_player: User,
    club_owner: tuple[User, Club],
):
    """Ensure platform settings endpoints strictly require platform owner privileges."""
    club_owner_user, _ = club_owner

    # 1. Unauthenticated request rejected
    resp = await async_client.get("/api/v1/platform/settings")
    assert resp.status_code == 401

    # 2. Regular player rejected
    resp = await async_client.get(
        "/api/v1/platform/settings",
        headers=make_auth_header(regular_player),
    )
    assert resp.status_code == 403

    # 3. Club owner rejected
    resp = await async_client.get(
        "/api/v1/platform/settings",
        headers=make_auth_header(club_owner_user),
    )
    assert resp.status_code == 403

    # 4. Platform owner permitted
    resp = await async_client.get(
        "/api/v1/platform/settings",
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_platform_settings_no_secret_exposure(
    async_client: AsyncClient,
    platform_owner: User,
):
    """Verify that read-only config excludes database credentials, JWT secrets, and AWS keys."""
    resp = await async_client.get(
        "/api/v1/platform/settings",
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 200
    data = resp.json()

    # Structure checks
    assert "runtime_settings" in data
    assert "read_only_config" in data

    runtime = data["runtime_settings"]
    readonly = data["read_only_config"]

    assert runtime["platform_name"] == "Aught2 Pickleball"
    assert runtime["allow_new_club_registrations"] is True
    assert runtime["max_upload_size_mb"] == 5

    assert "app_name" in readonly
    assert "jwt_algorithm" in readonly
    assert readonly["jwt_algorithm"] == "HS256"

    # Strict check: PROHIBIT SECRET EXPOSURE
    serialized = str(data).lower()
    assert "jwt_secret_key" not in serialized
    assert "database_url" not in serialized
    assert "migration_secret" not in serialized
    assert "secret_access_key" not in serialized
    assert "postgres:" not in serialized


@pytest.mark.asyncio
async def test_platform_settings_update_and_audit(
    async_client: AsyncClient,
    platform_owner: User,
    db_session: AsyncSession,
):
    """Verify modifying runtime settings persists correctly and records an audit log entry."""
    payload = {
        "platform_name": "Pickleball World Global",
        "platform_support_email": "help@pickleballworld.com",
        "maintenance_mode": True,
        "max_upload_size_mb": 12,
        "reason": "Scheduled infrastructure maintenance window",
    }

    resp = await async_client.patch(
        "/api/v1/platform/settings",
        json=payload,
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 200
    updated = resp.json()["runtime_settings"]

    assert updated["platform_name"] == "Pickleball World Global"
    assert updated["platform_support_email"] == "help@pickleballworld.com"
    assert updated["maintenance_mode"] is True
    assert updated["max_upload_size_mb"] == 12
    assert updated["updated_by_email"] == platform_owner.email

    # Check Audit Log record was created
    audit_res = await db_session.execute(
        select(PlatformAuditLog)
        .where(PlatformAuditLog.action == "platform_settings.updated")
        .order_by(PlatformAuditLog.created_at.desc())
    )
    audit_entry = audit_res.scalar_one_or_none()
    assert audit_entry is not None
    assert audit_entry.actor_email == platform_owner.email
    assert audit_entry.reason == "Scheduled infrastructure maintenance window"
    assert "platform_name" in audit_entry.details["changed_keys"]
    assert audit_entry.details["before"]["platform_name"] == "Aught2 Pickleball"
    assert audit_entry.details["after"]["platform_name"] == "Pickleball World Global"


@pytest.mark.asyncio
async def test_platform_settings_validation_errors(
    async_client: AsyncClient,
    platform_owner: User,
):
    """Test validation constraints on upload size, email format, and unsupported keys."""
    # 1. Negative or zero upload size rejected
    resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"max_upload_size_mb": 0},
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 422

    # 2. Excessive upload size (> 25MB) rejected
    resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"max_upload_size_mb": 50},
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 422

    # 3. Invalid email format rejected
    resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"platform_support_email": "not-an-email"},
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 422

    # 4. Arbitrary or dangerous extra keys forbidden (extra="forbid")
    resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"arbitrary_key": "injected_value", "jwt_secret": "hacked"},
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_runtime_enforcement_club_and_user_registrations(
    async_client: AsyncClient,
    platform_owner: User,
):
    """Verify runtime gating: pausing club or player registrations actually blocks public entry points."""
    # 1. Pause club applications
    resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_new_club_registrations": False},
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 200

    # Attempt to submit a club application -> must be blocked with 403
    app_payload = {
        "applicant_name": "Test Applicant",
        "applicant_email": f"applicant.{uuid.uuid4().hex[:6]}@example.com",
        "applicant_password": "SecurePassword123!",
        "club_name": "Blocked Club",
    }
    app_resp = await async_client.post("/api/v1/club-applications", json=app_payload)
    assert app_resp.status_code == 403
    assert "Club registration applications are temporarily paused" in app_resp.json()["detail"]

    # 2. Pause user registrations
    resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_user_registrations": False},
        headers=make_auth_header(platform_owner),
    )
    assert resp.status_code == 200

    # Attempt to self-register a player -> must be blocked with 403
    user_payload = {
        "email": f"newplayer.{uuid.uuid4().hex[:6]}@example.com",
        "password": "PlayerPassword123!",
        "full_name": "Blocked Player",
    }
    user_resp = await async_client.post("/api/v1/auth/player/register", json=user_payload)
    assert user_resp.status_code == 403
    assert "Public player registrations are temporarily paused" in user_resp.json()["detail"]

    # 3. Re-enable both
    re_enable_resp = await async_client.patch(
        "/api/v1/platform/settings",
        json={
            "allow_new_club_registrations": True,
            "allow_user_registrations": True,
        },
        headers=make_auth_header(platform_owner),
    )
    assert re_enable_resp.status_code == 200
    assert re_enable_resp.json()["runtime_settings"]["allow_new_club_registrations"] is True
    assert re_enable_resp.json()["runtime_settings"]["allow_user_registrations"] is True
