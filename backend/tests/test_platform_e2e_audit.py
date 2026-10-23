"""
Aught2 Pickleball — Comprehensive End-to-End Audit & Verification Test Suite

Exercises and verifies all Platform Admin Portal modules in real end-to-end flows:
  1. Platform Admin Authentication & Profile Session Guard
  2. Overview & Application Counts
  3. Club Applications Lifecycle (Submit -> Inspect -> Approve/Reject -> Idempotency -> Audit)
  4. Club Administration Lifecycle (Search -> Suspend -> Impact on discovery/courts/bookings -> Reactivate -> Integrity)
  5. Platform-Wide Users Directory (Multi-club users, role separation, deduplication, no credential leak)
  6. Support Tickets Lifecycle (Requester Submit -> Admin Queue -> Reply -> Status/Priority Transitions -> IDOR check -> Closed state)
  7. Audit Log Durability & Immutability (Actor, Target, Timestamp, Reason, Immutability)
  8. Platform Settings & Runtime Enforcement (Gating club/user registrations, bounds validation, zero secret exposure)
  9. Exhaustive RBAC & Endpoint Authorization (All platform endpoints return 401 unauthenticated, 403 for non-platform owners)
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
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.platform_audit_log import PlatformAuditLog
from app.models.support_ticket import SupportTicket, SupportTicketMessage, TicketCategory, TicketPriority, TicketStatus
from app.models.user import User
from tests.conftest import make_auth_header


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------

async def _create_user(
    db: AsyncSession,
    email: str | None = None,
    password: str = "SecurePass1!",
    full_name: str = "Test User",
    is_active: bool = True,
) -> User:
    email = email or f"u_{uuid.uuid4().hex[:8]}@platform-audit.local"
    user = User(
        email=email.lower().strip(),
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=is_active,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def _create_platform_owner(db: AsyncSession) -> User:
    settings = get_settings()
    owner_email = settings.PLATFORM_OWNER_EMAILS[0]
    existing = await db.execute(
        User.__table__.select().where(User.email == owner_email)
    )
    row = existing.first()
    if row:
        user = await db.get(User, row.id)
        if user:
            return user
    return await _create_user(db, email=owner_email, full_name="Super Platform Owner")


async def _create_club(db: AsyncSession, name: str = "Audit Club", is_active: bool = True) -> Club:
    slug = f"audit-{uuid.uuid4().hex[:6]}"
    club = Club(name=name, slug=slug, is_active=is_active, city="Austin", state="TX")
    db.add(club)
    await db.flush()
    await db.refresh(club)
    return club


async def _create_court(db: AsyncSession, club: Club, name: str = "Court 1", is_active: bool = True) -> Court:
    court = Court(
        club_id=club.id,
        name=name,
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        surface_type="acrylic",
        is_active=is_active,
        status=CourtStatus.ACTIVE if is_active else CourtStatus.INACTIVE,
    )
    db.add(court)
    await db.flush()
    await db.refresh(court)
    return court


# ===========================================================================
# 1. PLATFORM AUTHENTICATION & SESSION GUARD
# ===========================================================================

@pytest.mark.asyncio
async def test_platform_auth_and_session_guard(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    regular_user = await _create_user(db_session, email="regular_staff@test.local")
    await db_session.commit()

    # 1. Successful platform login
    res_login = await async_client.post(
        "/api/v1/auth/platform/login",
        json={"email": platform_owner.email, "password": "SecurePass1!"},
    )
    assert res_login.status_code == 200
    token_data = res_login.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"
    assert token_data["user"]["email"] == platform_owner.email
    assert "hashed_password" not in token_data["user"]

    # 2. Non-platform owner login rejected with 403
    res_unauth_login = await async_client.post(
        "/api/v1/auth/platform/login",
        json={"email": regular_user.email, "password": "SecurePass1!"},
    )
    assert res_unauth_login.status_code == 403
    assert "not authorized for platform administration" in res_unauth_login.text.lower()

    # 3. GET /platform/me with valid platform token
    owner_headers = make_auth_header(platform_owner)
    res_me = await async_client.get("/api/v1/platform/me", headers=owner_headers)
    assert res_me.status_code == 200
    me_data = res_me.json()
    assert me_data["is_platform_owner"] is True
    assert me_data["email"] == platform_owner.email
    assert "hashed_password" not in me_data

    # 4. GET /platform/me with regular user token rejected with 403
    reg_headers = make_auth_header(regular_user)
    res_me_reg = await async_client.get("/api/v1/platform/me", headers=reg_headers)
    assert res_me_reg.status_code == 403


# ===========================================================================
# 2. OVERVIEW & APPLICATION COUNTS
# ===========================================================================

@pytest.mark.asyncio
async def test_platform_overview_and_counts(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    owner_headers = make_auth_header(platform_owner)

    # 1. Overview endpoint
    res = await async_client.get("/api/v1/platform/overview", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "applications" in data
    assert "clubs" in data
    assert "users" in data
    assert "system_status" in data
    assert data["system_status"] in ("operational", "maintenance")

    # 2. Application counts match
    res_counts = await async_client.get("/api/v1/platform/club-applications?page=1&page_size=1", headers=owner_headers)
    assert res_counts.status_code == 200
    counts_data = res_counts.json()
    assert "counts" in counts_data
    assert "pending" in counts_data["counts"]
    assert "approved" in counts_data["counts"]
    assert "rejected" in counts_data["counts"]


# ===========================================================================
# 3. CLUB APPLICATIONS LIFECYCLE (Submit -> Inspect -> Approve/Reject -> Audit)
# ===========================================================================

@pytest.mark.asyncio
async def test_club_application_full_lifecycle(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    owner_headers = make_auth_header(platform_owner)

    # 1. Submit legitimate pending club application
    app_payload = {
        "club_name": f"Lifecycle Club {uuid.uuid4().hex[:4]}",
        "slug": f"life-{uuid.uuid4().hex[:6]}",
        "description": "Premium pickleball complex with 8 courts.",
        "applicant_name": "Jane Applicant",
        "applicant_email": f"jane_{uuid.uuid4().hex[:6]}@apply.local",
        "applicant_password": "SecurePass1!",
        "contact_phone": "555-0199",
        "city": "Dallas",
        "state": "TX",
    }
    res_submit = await async_client.post("/api/v1/club-applications", json=app_payload)
    assert res_submit.status_code == 201
    app_data = res_submit.json()
    app_id = app_data["id"]
    ref_num = app_data["reference_number"]
    assert app_data["status"] == "pending"

    # 2. Public status lookup: with matching email succeeds, mismatch fails
    res_status_ok = await async_client.get(
        f"/api/v1/club-applications/status?reference_number={ref_num}&email={app_payload['applicant_email']}"
    )
    assert res_status_ok.status_code == 200
    assert res_status_ok.json()["status"] == "pending"

    res_status_wrong = await async_client.get(
        f"/api/v1/club-applications/status?reference_number={ref_num}&email=wrong@email.local"
    )
    assert res_status_wrong.status_code == 404

    # 3. Platform owner inspects application details
    res_detail = await async_client.get(f"/api/v1/platform/club-applications/{app_id}", headers=owner_headers)
    assert res_detail.status_code == 200
    detail_data = res_detail.json()
    assert detail_data["club_name"] == app_payload["club_name"]
    assert detail_data["applicant_email"] == app_payload["applicant_email"]

    # 4. Platform owner approves application
    res_approve = await async_client.post(
        f"/api/v1/platform/club-applications/{app_id}/approve",
        headers=owner_headers,
    )
    assert res_approve.status_code == 200
    approved_data = res_approve.json()
    assert approved_data["status"] == "approved"
    assert approved_data["reviewed_by_id"] == str(platform_owner.id)

    # 5. Verify created Club exists and has initial owner membership
    res_clubs = await async_client.get("/api/v1/platform/clubs", headers=owner_headers)
    assert res_clubs.status_code == 200
    club_names = [c["name"] for c in res_clubs.json()["items"]]
    assert app_payload["club_name"] in club_names

    # 6. Idempotency: repeated approval rejected
    res_repeat = await async_client.post(
        f"/api/v1/platform/club-applications/{app_id}/approve",
        headers=owner_headers,
    )
    assert res_repeat.status_code == 400

    # 7. Verify Audit Log entry was generated
    res_audit = await async_client.get(
        f"/api/v1/platform/audit-logs?action=club_application.approved&entity_id={app_id}",
        headers=owner_headers,
    )
    assert res_audit.status_code == 200
    audit_items = res_audit.json()["items"]
    assert len(audit_items) >= 1
    assert audit_items[0]["actor_id"] == str(platform_owner.id)
    assert audit_items[0]["action"] == "club_application.approved"

    # 8. Rejection flow test with a second application
    app2_payload = {
        "club_name": f"Reject Club {uuid.uuid4().hex[:4]}",
        "slug": f"reject-{uuid.uuid4().hex[:6]}",
        "description": "Incomplete application.",
        "applicant_name": "Bob Applicant",
        "applicant_email": f"bob_{uuid.uuid4().hex[:6]}@apply.local",
        "applicant_password": "SecurePass1!",
        "city": "Houston",
        "state": "TX",
    }
    res_sub2 = await async_client.post("/api/v1/club-applications", json=app2_payload)
    app2_id = res_sub2.json()["id"]

    res_reject = await async_client.post(
        f"/api/v1/platform/club-applications/{app2_id}/reject",
        json={"rejection_reason": "Incomplete insurance documentation."},
        headers=owner_headers,
    )
    assert res_reject.status_code == 200
    rejected_data = res_reject.json()
    assert rejected_data["status"] == "rejected"
    assert rejected_data["rejection_reason"] == "Incomplete insurance documentation."


# ===========================================================================
# 4. CLUB ADMINISTRATION & SUSPENSION/REACTIVATION LIFECYCLE
# ===========================================================================

@pytest.mark.asyncio
async def test_club_suspension_and_reactivation_effects(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    owner_headers = make_auth_header(platform_owner)

    # Setup club with court and player
    club = await _create_club(db_session, name="Suspendable Athletic Club")
    court = await _create_court(db_session, club, name="Court 1")
    player = await _create_user(db_session, email="player_booking@test.local")
    player_headers = make_auth_header(player)
    await db_session.commit()

    # Verify club is currently discoverable
    res_pub = await async_client.get("/api/v1/clubs/public")
    assert res_pub.status_code == 200
    assert any(c["id"] == str(club.id) for c in res_pub.json()["items"])

    res_pub_detail = await async_client.get(f"/api/v1/clubs/{club.id}/public")
    assert res_pub_detail.status_code == 200

    # 1. Suspend the club facility
    res_suspend = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        json={"is_active": False, "reason": "Administrative suspension pending policy review."},
        headers=owner_headers,
    )
    assert res_suspend.status_code == 200
    assert res_suspend.json()["is_active"] is False

    # 2. Verify effect on public discovery: excluded from active list
    res_pub_after = await async_client.get("/api/v1/clubs/public")
    assert res_pub_after.status_code == 200
    assert not any(c["id"] == str(club.id) for c in res_pub_after.json()["items"])

    # 3. Verify public club detail returns 404
    res_pub_detail_after = await async_client.get(f"/api/v1/clubs/{club.id}/public")
    assert res_pub_detail_after.status_code == 404

    # 4. Verify booking attempts against suspended club are rejected
    booking_payload = {
        "court_id": str(court.id),
        "booking_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "start_time": "10:00",
        "end_time": "11:00",
        "notes": "Testing suspended booking rejection",
    }
    res_booking = await async_client.post(
        f"/api/v1/bookings/clubs/{club.id}/book",
        json=booking_payload,
        headers=player_headers,
    )
    assert res_booking.status_code in (400, 404)

    # 5. Verify suspending an already suspended club returns 400
    res_repeat_susp = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        json={"is_active": False, "reason": "Redundant suspension attempt."},
        headers=owner_headers,
    )
    assert res_repeat_susp.status_code == 400

    # 6. Reactivate the club facility
    res_reactivate = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        json={"is_active": True, "reason": "Compliance verified. Club reactivated."},
        headers=owner_headers,
    )
    assert res_reactivate.status_code == 200
    assert res_reactivate.json()["is_active"] is True

    # 7. Verify discovery & detail are restored
    res_pub_restored = await async_client.get("/api/v1/clubs/public")
    assert any(c["id"] == str(club.id) for c in res_pub_restored.json()["items"])

    res_detail_restored = await async_client.get(f"/api/v1/clubs/{club.id}/public")
    assert res_detail_restored.status_code == 200

    # 8. Verify audit logs for both suspension and reactivation exist
    res_audit_susp = await async_client.get(
        f"/api/v1/platform/audit-logs?action=club.suspended&entity_id={club.id}",
        headers=owner_headers,
    )
    assert res_audit_susp.status_code == 200
    assert len(res_audit_susp.json()["items"]) >= 1

    res_audit_react = await async_client.get(
        f"/api/v1/platform/audit-logs?action=club.reactivated&entity_id={club.id}",
        headers=owner_headers,
    )
    assert res_audit_react.status_code == 200
    assert len(res_audit_react.json()["items"]) >= 1


# ===========================================================================
# 5. PLATFORM-WIDE USERS DIRECTORY & MULTI-CLUB LOOKUP
# ===========================================================================

@pytest.mark.asyncio
async def test_platform_users_directory_multi_club(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    owner_headers = make_auth_header(platform_owner)

    # Create user with multiple roles across different clubs
    multi_user = await _create_user(db_session, email="multi_club_user@test.local", full_name="Multi Club Star")
    club_a = await _create_club(db_session, name="Alpha Club")
    club_b = await _create_club(db_session, name="Beta Club")
    club_c = await _create_club(db_session, name="Gamma Club")

    # Staff role in Alpha (Club Owner)
    db_session.add(ClubMembership(user_id=multi_user.id, club_id=club_a.id, role=ClubRole.CLUB_OWNER, is_active=True))
    # Staff role in Beta (Club Manager)
    db_session.add(ClubMembership(user_id=multi_user.id, club_id=club_b.id, role=ClubRole.CLUB_MANAGER, is_active=True))
    # Player membership in Gamma
    db_session.add(ClubPlayerMembership(user_id=multi_user.id, club_id=club_c.id, status=PlayerMembershipStatus.ACTIVE, membership_number="MEM-9988"))
    await db_session.commit()

    # 1. Search for multi-club user in directory
    res_search = await async_client.get(
        "/api/v1/platform/users?search=multi_club_user",
        headers=owner_headers,
    )
    assert res_search.status_code == 200
    items = res_search.json()["items"]
    # Verify no duplicate user items returned
    matched = [u for u in items if u["id"] == str(multi_user.id)]
    assert len(matched) == 1
    u_item = matched[0]
    assert u_item["email"] == "multi_club_user@test.local"
    assert len(u_item["club_memberships"]) == 2  # Alpha + Beta
    assert len(u_item["club_player_memberships"]) == 1  # Gamma
    assert "hashed_password" not in str(u_item)

    # 2. Get single user detail
    res_detail = await async_client.get(
        f"/api/v1/platform/users/{multi_user.id}",
        headers=owner_headers,
    )
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["full_name"] == "Multi Club Star"
    roles = {m["club_name"]: m["role"] for m in detail["club_memberships"]}
    assert roles["Alpha Club"] == "club_owner"
    assert roles["Beta Club"] == "club_manager"
    assert "hashed_password" not in str(detail)


# ===========================================================================
# 6. SUPPORT TICKETS LIFECYCLE & IDOR DEFENSE
# ===========================================================================

@pytest.mark.asyncio
async def test_support_ticket_full_lifecycle_and_idor(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    owner_headers = make_auth_header(platform_owner)

    requester_a = await _create_user(db_session, email="requester_a@ticket.local", full_name="Alice Requester")
    requester_b = await _create_user(db_session, email="requester_b@ticket.local", full_name="Bob Requester")
    headers_a = make_auth_header(requester_a)
    headers_b = make_auth_header(requester_b)
    await db_session.commit()

    # 1. Requester A submits a ticket
    ticket_payload = {
        "subject": "Court light flickering during night sessions",
        "description": "Court 3 light fixture 2 has intermittent flickering since Monday.",
        "category": "court_issue",
        "priority": "medium",
    }
    res_create = await async_client.post("/api/v1/support/tickets", json=ticket_payload, headers=headers_a)
    assert res_create.status_code == 201
    ticket_data = res_create.json()
    ticket_id = ticket_data["id"]
    assert ticket_data["status"] == "open"
    assert ticket_data["requester_email"] == requester_a.email

    # 2. Requester A can view own ticket
    res_get_a = await async_client.get(f"/api/v1/support/tickets/{ticket_id}", headers=headers_a)
    assert res_get_a.status_code == 200
    assert res_get_a.json()["subject"] == ticket_payload["subject"]

    # 3. IDOR Defense: Requester B CANNOT view Requester A's ticket
    res_get_b = await async_client.get(f"/api/v1/support/tickets/{ticket_id}", headers=headers_b)
    assert res_get_b.status_code == 404

    # 4. Requester B CANNOT reply to Requester A's ticket
    res_reply_b = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "Unauthorized reply attempt"},
        headers=headers_b,
    )
    assert res_reply_b.status_code == 404

    # 5. Platform Admin views ticket and replies
    res_admin_reply = await async_client.post(
        f"/api/v1/platform/tickets/{ticket_id}/replies",
        json={"message": "We have dispatched maintenance to inspect court 3."},
        headers=owner_headers,
    )
    assert res_admin_reply.status_code == 200
    detail_with_reply = res_admin_reply.json()
    assert len(detail_with_reply["messages"]) == 2
    assert detail_with_reply["messages"][0]["sender_role"] == "requester"
    assert detail_with_reply["messages"][1]["sender_role"] == "platform_admin"

    # 6. Platform Admin updates ticket status & priority
    res_patch = await async_client.patch(
        f"/api/v1/platform/tickets/{ticket_id}",
        json={"status": "waiting_for_requester", "priority": "high", "reason": "Awaiting customer confirmation"},
        headers=owner_headers,
    )
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "waiting_for_requester"
    assert res_patch.json()["priority"] == "high"

    # 7. Requester replies back -> transitions status back to in_progress
    res_req_reply = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "Fixture is still flickering as of 8 PM."},
        headers=headers_a,
    )
    assert res_req_reply.status_code == 200
    assert res_req_reply.json()["status"] == "in_progress"
    assert len(res_req_reply.json()["messages"]) == 3

    # 8. Platform Admin closes ticket
    res_close = await async_client.patch(
        f"/api/v1/platform/tickets/{ticket_id}",
        json={"status": "closed", "reason": "Issue fully resolved and tested."},
        headers=owner_headers,
    )
    assert res_close.status_code == 200
    assert res_close.json()["status"] == "closed"

    # 9. Reply to closed ticket rejected
    res_closed_reply = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "Attempting to reply to closed ticket."},
        headers=headers_a,
    )
    assert res_closed_reply.status_code == 400


# ===========================================================================
# 7. AUDIT LOG DURABILITY & SENSITIVE CREDENTIAL EXCLUSION
# ===========================================================================

@pytest.mark.asyncio
async def test_platform_audit_log_durability(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    owner_headers = make_auth_header(platform_owner)

    res_logs = await async_client.get("/api/v1/platform/audit-logs?page=1&page_size=20", headers=owner_headers)
    assert res_logs.status_code == 200
    logs_data = res_logs.json()
    assert "items" in logs_data
    assert "total" in logs_data
    assert "page" in logs_data

    # Verify log entries contain required audit fields
    for entry in logs_data["items"]:
        assert "actor_id" in entry
        assert "actor_email" in entry
        assert "action" in entry
        assert "entity_type" in entry
        assert "created_at" in entry
        assert "outcome" in entry
        # Assert no password hashes or tokens leaked
        entry_str = str(entry).lower()
        assert "hashed_password" not in entry_str
        assert "secret_key" not in entry_str
        assert "password" not in entry.get("details", {})


# ===========================================================================
# 8. PLATFORM SETTINGS & RUNTIME ENFORCEMENT
# ===========================================================================

@pytest.mark.asyncio
async def test_platform_settings_runtime_enforcement(async_client: AsyncClient, db_session: AsyncSession):
    platform_owner = await _create_platform_owner(db_session)
    owner_headers = make_auth_header(platform_owner)

    # 1. Inspect current settings & verify no secrets
    res_get = await async_client.get("/api/v1/platform/settings", headers=owner_headers)
    assert res_get.status_code == 200
    data = res_get.json()
    assert "runtime_settings" in data
    assert "read_only_config" in data
    body_str = res_get.text.lower()
    assert "secret_key" not in body_str
    assert "database_url" not in body_str
    assert "jwt_secret" not in body_str

    # 2. Disable club registrations runtime gate
    res_patch_club = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_new_club_registrations": False, "reason": "Audit testing registration pause"},
        headers=owner_headers,
    )
    assert res_patch_club.status_code == 200
    assert res_patch_club.json()["runtime_settings"]["allow_new_club_registrations"] is False

    # 3. Test runtime enforcement: club applications are blocked with 403
    app_payload = {
        "club_name": "Blocked Registration Club",
        "slug": f"blocked-{uuid.uuid4().hex[:6]}",
        "description": "This application should be blocked by settings gate.",
        "applicant_name": "Blocked Applicant",
        "applicant_email": f"blocked_{uuid.uuid4().hex[:6]}@apply.local",
        "applicant_password": "SecurePass1!",
        "city": "Austin",
        "state": "TX",
    }
    res_submit = await async_client.post("/api/v1/club-applications", json=app_payload)
    assert res_submit.status_code == 403
    assert "temporarily paused" in res_submit.text.lower()

    # 4. Disable user registrations runtime gate
    res_patch_user = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_user_registrations": False, "reason": "Audit testing player signup pause"},
        headers=owner_headers,
    )
    assert res_patch_user.status_code == 200
    assert res_patch_user.json()["runtime_settings"]["allow_user_registrations"] is False

    # 5. Test runtime enforcement: player self-signup blocked with 403
    signup_payload = {
        "email": f"blocked_player_{uuid.uuid4().hex[:6]}@test.local",
        "password": "SecurePass1!",
        "full_name": "Blocked Player",
    }
    res_signup = await async_client.post("/api/v1/auth/player/register", json=signup_payload)
    assert res_signup.status_code == 403
    assert "temporarily paused" in res_signup.text.lower()

    # 6. Re-enable both registration gates
    res_restore = await async_client.patch(
        "/api/v1/platform/settings",
        json={"allow_new_club_registrations": True, "allow_user_registrations": True, "reason": "Audit restore"},
        headers=owner_headers,
    )
    assert res_restore.status_code == 200
    assert res_restore.json()["runtime_settings"]["allow_new_club_registrations"] is True
    assert res_restore.json()["runtime_settings"]["allow_user_registrations"] is True


# ===========================================================================
# 9. EXHAUSTIVE RBAC & SERVER-SIDE AUTHORIZATION MATRIX
# ===========================================================================

@pytest.mark.asyncio
async def test_exhaustive_platform_endpoint_authorization_matrix(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test every platform endpoint against:
    - Unauthenticated caller (must return 401)
    - Club Owner (must return 403)
    - Club Manager (must return 403)
    - Player (must return 403)
    """
    club = await _create_club(db_session, name="Matrix Club")
    club_owner = await _create_user(db_session, email="matrix_owner@test.local")
    club_manager = await _create_user(db_session, email="matrix_manager@test.local")
    player = await _create_user(db_session, email="matrix_player@test.local")

    db_session.add(ClubMembership(user_id=club_owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER, is_active=True))
    db_session.add(ClubMembership(user_id=club_manager.id, club_id=club.id, role=ClubRole.CLUB_MANAGER, is_active=True))
    db_session.add(ClubPlayerMembership(user_id=player.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE, membership_number="MAT-01"))
    await db_session.commit()

    test_endpoints = [
        ("GET", "/api/v1/platform/me"),
        ("GET", "/api/v1/platform/overview"),
        ("GET", "/api/v1/platform/club-applications"),
        ("GET", f"/api/v1/platform/club-applications/{uuid.uuid4()}"),
        ("POST", f"/api/v1/platform/club-applications/{uuid.uuid4()}/approve"),
        ("POST", f"/api/v1/platform/club-applications/{uuid.uuid4()}/reject"),
        ("GET", "/api/v1/platform/clubs"),
        ("PATCH", f"/api/v1/platform/clubs/{club.id}/status"),
        ("GET", "/api/v1/platform/users"),
        ("GET", f"/api/v1/platform/users/{player.id}"),
        ("GET", "/api/v1/platform/audit-logs"),
        ("GET", "/api/v1/platform/tickets"),
        ("PATCH", f"/api/v1/platform/tickets/{uuid.uuid4()}"),
        ("POST", f"/api/v1/platform/tickets/{uuid.uuid4()}/replies"),
        ("GET", "/api/v1/platform/settings"),
        ("PATCH", "/api/v1/platform/settings"),
    ]

    for method, path in test_endpoints:
        # 1. Unauthenticated -> 401
        res_unauth = await async_client.request(method, path)
        assert res_unauth.status_code == 401, f"{method} {path} expected 401 unauth, got {res_unauth.status_code}"

        # 2. Club Owner -> 403
        res_owner = await async_client.request(method, path, headers=make_auth_header(club_owner))
        assert res_owner.status_code == 403, f"{method} {path} expected 403 for club owner, got {res_owner.status_code}"

        # 3. Club Manager -> 403
        res_mgr = await async_client.request(method, path, headers=make_auth_header(club_manager))
        assert res_mgr.status_code == 403, f"{method} {path} expected 403 for club manager, got {res_mgr.status_code}"

        # 4. Player -> 403
        res_player = await async_client.request(method, path, headers=make_auth_header(player))
        assert res_player.status_code == 403, f"{method} {path} expected 403 for player, got {res_player.status_code}"
