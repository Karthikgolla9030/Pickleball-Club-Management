"""
Aught2 Pickleball — Phase 3A Platform Audit Log Test Suite

Validates:
1. Platform owner authorization enforcement (401/403 for unauthorized users).
2. Transactional event creation on club application approval.
3. Transactional event creation on club application rejection.
4. Transactional event creation on club suspension and reactivation.
5. Search, action filtering, entity filtering, and pagination.
6. Exclusion of sensitive fields (passwords, tokens, secrets).
7. Immutability — no mutation or deletion routes exist for audit records.
8. Individual audit log detail lookup.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_application import ClubApplication, ClubApplicationStatus
from app.models.club_membership import ClubMembership, ClubRole
from app.models.platform_audit_log import PlatformAuditLog
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
async def regular_club_owner(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"club.owner.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Secret123!"),
        full_name="Regular Club Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def sample_club(db_session: AsyncSession, regular_club_owner: User) -> Club:
    club = Club(
        id=uuid.uuid4(),
        name="Sunset Hills Pickleball Club",
        slug=f"sunset-hills-{uuid.uuid4().hex[:6]}",
        is_active=True,
        city="Austin",
        state="TX",
        country="United States",
    )
    db_session.add(club)
    await db_session.flush()

    membership = ClubMembership(
        id=uuid.uuid4(),
        club_id=club.id,
        user_id=regular_club_owner.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.commit()
    await db_session.refresh(club)
    return club


@pytest.fixture
async def pending_application(db_session: AsyncSession) -> ClubApplication:
    app = ClubApplication(
        id=uuid.uuid4(),
        reference_number=f"APP-{uuid.uuid4().hex[:8].upper()}",
        applicant_name="Alice Tennis",
        applicant_email=f"alice.{uuid.uuid4().hex[:6]}@example.com",
        applicant_phone="555-0199",
        club_name="Capital City Pickleball Center",
        slug=f"capital-city-{uuid.uuid4().hex[:6]}",
        short_description="Premier 12-court indoor facility",
        city="Austin",
        state="TX",
        status=ClubApplicationStatus.PENDING,
    )
    db_session.add(app)
    await db_session.commit()
    await db_session.refresh(app)
    return app


@pytest.mark.asyncio
async def test_audit_log_authorization(
    async_client: AsyncClient,
    platform_owner: User,
    regular_club_owner: User,
):
    """Only platform owners can query the audit log; unauthorized requests receive 401 or 403."""
    # 1. Unauthenticated request
    res = await async_client.get("/api/v1/platform/audit-logs")
    assert res.status_code == 401

    # 2. Club owner request (forbidden)
    res = await async_client.get(
        "/api/v1/platform/audit-logs",
        headers=make_auth_header(regular_club_owner),
    )
    assert res.status_code == 403

    # 3. Platform owner request (allowed)
    res = await async_client.get(
        "/api/v1/platform/audit-logs",
        headers=make_auth_header(platform_owner),
    )
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert "action_counts" in data


@pytest.mark.asyncio
async def test_audit_log_created_on_application_approval(
    async_client: AsyncClient,
    platform_owner: User,
    pending_application: ClubApplication,
):
    """Approving an application creates an immutable audit record atomically in the same transaction."""
    approve_res = await async_client.post(
        f"/api/v1/platform/club-applications/{pending_application.id}/approve",
        headers=make_auth_header(platform_owner),
    )
    assert approve_res.status_code == 200

    # Query audit logs
    audit_res = await async_client.get(
        "/api/v1/platform/audit-logs",
        headers=make_auth_header(platform_owner),
    )
    assert audit_res.status_code == 200
    data = audit_res.json()
    assert data["total"] >= 1

    entry = next(
        (item for item in data["items"] if item["entity_id"] == str(pending_application.id)),
        None,
    )
    assert entry is not None
    assert entry["action"] == "club_application.approved"
    assert entry["action_label"] == "Application Approved"
    assert entry["entity_type"] == "club_application"
    assert entry["entity_name"] == pending_application.club_name
    assert entry["actor_id"] == str(platform_owner.id)
    assert entry["actor_email"] == platform_owner.email
    assert entry["outcome"] == "success"
    assert entry["details"]["reference_number"] == pending_application.reference_number


@pytest.mark.asyncio
async def test_audit_log_created_on_application_rejection(
    async_client: AsyncClient,
    platform_owner: User,
    pending_application: ClubApplication,
):
    """Rejecting an application creates an audit entry with the rejection reason."""
    rejection_reason = "Operating schedule violates noise ordinance policies"
    reject_res = await async_client.post(
        f"/api/v1/platform/club-applications/{pending_application.id}/reject",
        json={"rejection_reason": rejection_reason},
        headers=make_auth_header(platform_owner),
    )
    assert reject_res.status_code == 200

    # Query audit logs
    audit_res = await async_client.get(
        f"/api/v1/platform/audit-logs?entity_id={pending_application.id}",
        headers=make_auth_header(platform_owner),
    )
    assert audit_res.status_code == 200
    data = audit_res.json()
    assert data["total"] == 1
    entry = data["items"][0]
    assert entry["action"] == "club_application.rejected"
    assert entry["reason"] == rejection_reason
    assert entry["actor_email"] == platform_owner.email


@pytest.mark.asyncio
async def test_audit_log_created_on_club_suspension_and_reactivation(
    async_client: AsyncClient,
    platform_owner: User,
    sample_club: Club,
):
    """Suspending and reactivating a club facility creates sequential audit records with administrative reasons."""
    # 1. Suspend club
    suspend_reason = "Unresolved safety inspection notice #8821"
    suspend_res = await async_client.patch(
        f"/api/v1/platform/clubs/{sample_club.id}/status",
        json={"is_active": False, "reason": suspend_reason},
        headers=make_auth_header(platform_owner),
    )
    assert suspend_res.status_code == 200

    # 2. Reactivate club
    reactivate_reason = "Safety inspection passed with verified fire marshal signoff"
    reactivate_res = await async_client.patch(
        f"/api/v1/platform/clubs/{sample_club.id}/status",
        json={"is_active": True, "reason": reactivate_reason},
        headers=make_auth_header(platform_owner),
    )
    assert reactivate_res.status_code == 200

    # 3. Query audit logs for this club
    audit_res = await async_client.get(
        f"/api/v1/platform/audit-logs?entity_id={sample_club.id}",
        headers=make_auth_header(platform_owner),
    )
    assert audit_res.status_code == 200
    data = audit_res.json()
    assert data["total"] == 2

    # Most recent first
    reactivate_log = data["items"][0]
    assert reactivate_log["action"] == "club.reactivated"
    assert reactivate_log["reason"] == reactivate_reason
    assert reactivate_log["details"]["is_active_after"] is True

    suspend_log = data["items"][1]
    assert suspend_log["action"] == "club.suspended"
    assert suspend_log["reason"] == suspend_reason
    assert suspend_log["details"]["is_active_after"] is False


@pytest.mark.asyncio
async def test_audit_log_filtering_and_search(
    async_client: AsyncClient,
    platform_owner: User,
    sample_club: Club,
    pending_application: ClubApplication,
):
    """Search and filter parameters isolate relevant records."""
    # Create actions
    await async_client.patch(
        f"/api/v1/platform/clubs/{sample_club.id}/status",
        json={"is_active": False, "reason": "Administrative suspension alpha"},
        headers=make_auth_header(platform_owner),
    )
    await async_client.post(
        f"/api/v1/platform/club-applications/{pending_application.id}/reject",
        json={"rejection_reason": "Incomplete submission beta"},
        headers=make_auth_header(platform_owner),
    )

    # Filter by action
    action_res = await async_client.get(
        "/api/v1/platform/audit-logs?action=club.suspended",
        headers=make_auth_header(platform_owner),
    )
    assert action_res.status_code == 200
    for item in action_res.json()["items"]:
        assert item["action"] == "club.suspended"

    # Filter by entity_type
    entity_res = await async_client.get(
        "/api/v1/platform/audit-logs?entity_type=club_application",
        headers=make_auth_header(platform_owner),
    )
    assert entity_res.status_code == 200
    for item in entity_res.json()["items"]:
        assert item["entity_type"] == "club_application"

    # Search by reason keyword
    search_res = await async_client.get(
        "/api/v1/platform/audit-logs?search=alpha",
        headers=make_auth_header(platform_owner),
    )
    assert search_res.status_code == 200
    assert any("alpha" in (item["reason"] or "") for item in search_res.json()["items"])


@pytest.mark.asyncio
async def test_audit_log_sensitive_credential_exclusion(
    async_client: AsyncClient,
    platform_owner: User,
    pending_application: ClubApplication,
):
    """Audit logs must never expose password hashes, tokens, or credentials."""
    await async_client.post(
        f"/api/v1/platform/club-applications/{pending_application.id}/approve",
        headers=make_auth_header(platform_owner),
    )

    audit_res = await async_client.get(
        "/api/v1/platform/audit-logs",
        headers=make_auth_header(platform_owner),
    )
    text = audit_res.text
    assert "hashed_password" not in text
    assert "password_hash" not in text
    assert "SuperSecret123!" not in text
    assert "TemporaryPass123!" not in text


@pytest.mark.asyncio
async def test_audit_log_immutability(
    async_client: AsyncClient,
    platform_owner: User,
):
    """Audit log records are append-only. Modification and deletion endpoints must not exist (405)."""
    random_id = uuid.uuid4()
    put_res = await async_client.put(
        f"/api/v1/platform/audit-logs/{random_id}",
        json={"reason": "Tampering attempt"},
        headers=make_auth_header(platform_owner),
    )
    assert put_res.status_code in (404, 405)

    delete_res = await async_client.delete(
        f"/api/v1/platform/audit-logs/{random_id}",
        headers=make_auth_header(platform_owner),
    )
    assert delete_res.status_code in (404, 405)


@pytest.mark.asyncio
async def test_audit_log_detail_lookup(
    async_client: AsyncClient,
    platform_owner: User,
    sample_club: Club,
):
    """Platform owner can retrieve full details for a specific audit log entry."""
    await async_client.patch(
        f"/api/v1/platform/clubs/{sample_club.id}/status",
        json={"is_active": False, "reason": "Operational pause for renovation"},
        headers=make_auth_header(platform_owner),
    )

    list_res = await async_client.get(
        f"/api/v1/platform/audit-logs?entity_id={sample_club.id}",
        headers=make_auth_header(platform_owner),
    )
    entry_id = list_res.json()["items"][0]["id"]

    detail_res = await async_client.get(
        f"/api/v1/platform/audit-logs/{entry_id}",
        headers=make_auth_header(platform_owner),
    )
    assert detail_res.status_code == 200
    data = detail_res.json()
    assert data["id"] == entry_id
    assert data["entity_id"] == str(sample_club.id)
    assert data["reason"] == "Operational pause for renovation"

    # Non-existent ID returns 404
    missing_res = await async_client.get(
        f"/api/v1/platform/audit-logs/{uuid.uuid4()}",
        headers=make_auth_header(platform_owner),
    )
    assert missing_res.status_code == 404
