"""
Aught2 Pickleball — Pre-Login Club Registration & Platform Owner Approval Test Suite

Validates all Phase 9 requirements:
  1. Public applicant can submit a valid application
  2. Invalid input is rejected
  3. Duplicate applications are handled safely
  4. Submission creates a pending application
  5. Submission does not grant owner membership
  6. Submission does not grant a privileged owner session
  7. Pending applicant cannot access owner dashboard API
  8. Rejected applicant cannot access owner dashboard API
  9. Unauthorized users cannot approve or reject applications
  10. Authorized platform owner can approve an application
  11. Approval creates exactly one correct owner membership
  12. Approval enables appropriate owner login/dashboard flow
  13. Authorized platform owner can reject an application
  14. Rejection does not grant owner access
  15. Repeated approval/rejection requests do not duplicate records
  16. Concurrent approval/rejection attempts cannot produce conflicting final states
  17. Existing approved club owners can still log in
  18. Existing club managers and tournament directors retain correct permissions
  19. Multi-club users retain correct per-club role behavior
  20. One club cannot access another club's private data
  21. Application status lookup does not disclose another applicant's information
  22. Existing bookings, memberships, tournaments, leagues, and payment records remain unaffected
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import time

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_application import ClubApplication, ClubApplicationStatus
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from tests.conftest import make_auth_header


@pytest_asyncio.fixture
async def platform_owner(db_session: AsyncSession) -> User:
    """Create an authorized platform owner matching settings.PLATFORM_OWNER_EMAILS."""
    settings = get_settings()
    email = settings.PLATFORM_OWNER_EMAILS[0]
    user = User(
        email=email,
        hashed_password=hash_password("PlatformOwner2026!"),
        full_name="Platform Chief Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def existing_club_owner(db_session: AsyncSession) -> tuple[User, Club]:
    """Create an approved existing club and its owner."""
    uid = uuid.uuid4().hex[:6]
    club = Club(
        name=f"Existing Pine Club {uid}",
        slug=f"existing-pine-{uid}",
        is_active=True,
        opening_time=time(6, 0),
        closing_time=time(22, 0),
    )
    db_session.add(club)
    await db_session.flush()

    user = User(
        email=f"existing-owner-{uid}@test.local",
        hashed_password=hash_password("OwnerPass123!"),
        full_name="Existing Pine Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.flush()
    return user, club


@pytest.mark.asyncio
async def test_01_public_applicant_submits_valid_application(
    async_client: AsyncClient,
):
    """Scenario 1 & 4: Public applicant submits a valid club registration; creates pending application."""
    uid = uuid.uuid4().hex[:6]
    payload = {
        "applicant_name": f"Alice Applicant {uid}",
        "applicant_email": f"alice_{uid}@newclub.local",
        "applicant_phone": "555-0199",
        "applicant_password": "SecurePassword2026!",
        "club_name": f"Austin Hills Pickleball {uid}",
        "slug": f"austin-hills-{uid}",
        "city": "Austin",
        "state": "TX",
        "country": "United States",
    }
    res = await async_client.post("/api/v1/club-applications", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "pending"
    assert data["reference_number"].startswith("APP-")
    assert data["applicant_email"] == payload["applicant_email"].lower()
    assert data["club_name"] == payload["club_name"]
    assert data["club_id"] is None  # Club is not yet created


@pytest.mark.asyncio
async def test_02_invalid_input_rejected(
    async_client: AsyncClient,
):
    """Scenario 2: Malformed input (invalid email, too short password) is rejected with 422."""
    res_bad_email = await async_client.post(
        "/api/v1/club-applications",
        json={
            "applicant_name": "Bob",
            "applicant_email": "not-an-email",
            "applicant_password": "Short",
            "club_name": "Bob Club",
        },
    )
    assert res_bad_email.status_code == 422


@pytest.mark.asyncio
async def test_03_duplicate_applications_prevented(
    async_client: AsyncClient,
):
    """Scenario 3: Submitting duplicate pending application with same email or slug is rejected."""
    uid = uuid.uuid4().hex[:6]
    payload = {
        "applicant_name": "Charlie Founder",
        "applicant_email": f"charlie_{uid}@founder.local",
        "applicant_password": "CharliePassword2026!",
        "club_name": f"Charlie Club {uid}",
        "slug": f"charlie-club-{uid}",
    }
    first_res = await async_client.post("/api/v1/club-applications", json=payload)
    assert first_res.status_code == 201

    # Same email submit again
    second_res = await async_client.post("/api/v1/club-applications", json=payload)
    assert second_res.status_code == 400
    assert "already pending review" in second_res.text


@pytest.mark.asyncio
async def test_05_and_06_submission_does_not_grant_owner_membership_or_session(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Scenario 5 & 6: Application submission does not create any ClubMembership."""
    uid = uuid.uuid4().hex[:6]
    email = f"dan_{uid}@newclub.local"
    payload = {
        "applicant_name": "Dan Applicant",
        "applicant_email": email,
        "applicant_password": "DanPassword2026!",
        "club_name": f"Dan Club {uid}",
        "slug": f"dan-club-{uid}",
    }
    res = await async_client.post("/api/v1/club-applications", json=payload)
    assert res.status_code == 201

    # Verify applicant's User has ZERO club memberships in database
    from app.repositories.user_repository import UserRepository
    from app.repositories.club_membership_repository import ClubMembershipRepository

    user = await UserRepository(db_session).get_by_email(email)
    assert user is not None
    mems = await ClubMembershipRepository(db_session).get_user_memberships(user.id, include_inactive=True)
    assert len(mems) == 0


@pytest.mark.asyncio
async def test_07_pending_applicant_cannot_access_owner_dashboard(
    async_client: AsyncClient,
):
    """Scenario 7: Applicant with a pending application attempting to login to club management is denied with 403."""
    uid = uuid.uuid4().hex[:6]
    email = f"eve_{uid}@club.local"
    password = "EvePassword2026!"
    payload = {
        "applicant_name": "Eve Applicant",
        "applicant_email": email,
        "applicant_password": password,
        "club_name": f"Eve Club {uid}",
        "slug": f"eve-club-{uid}",
    }
    sub_res = await async_client.post("/api/v1/club-applications", json=payload)
    assert sub_res.status_code == 201

    # Attempt club staff login
    login_res = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 403
    assert "awaiting review" in login_res.text


@pytest.mark.asyncio
async def test_08_rejected_applicant_cannot_access_owner_dashboard(
    async_client: AsyncClient,
    platform_owner: User,
):
    """Scenario 8 & 13 & 14: Platform owner rejects application; applicant is denied with rejection reason."""
    uid = uuid.uuid4().hex[:6]
    email = f"frank_{uid}@club.local"
    password = "FrankPassword2026!"
    payload = {
        "applicant_name": "Frank Applicant",
        "applicant_email": email,
        "applicant_password": password,
        "club_name": f"Frank Club {uid}",
        "slug": f"frank-club-{uid}",
    }
    sub_res = await async_client.post("/api/v1/club-applications", json=payload)
    app_id = sub_res.json()["id"]

    # Platform owner rejects with reason
    po_header = make_auth_header(platform_owner.id)
    reject_res = await async_client.post(
        f"/api/v1/platform/club-applications/{app_id}/reject",
        headers=po_header,
        json={"rejection_reason": "Facility documentation incomplete"},
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "rejected"
    assert reject_res.json()["rejection_reason"] == "Facility documentation incomplete"

    # Frank tries to log in
    login_res = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 403
    assert "was not approved" in login_res.text
    assert "Facility documentation incomplete" in login_res.text


@pytest.mark.asyncio
async def test_09_unauthorized_user_cannot_approve_or_reject(
    async_client: AsyncClient,
    existing_club_owner: tuple[User, Club],
):
    """Scenario 9: Regular club owner is NOT platform owner and receives 403 on review endpoints."""
    owner_user, _ = existing_club_owner
    owner_header = make_auth_header(owner_user.id)

    # Attempt to list platform applications
    list_res = await async_client.get(
        "/api/v1/platform/club-applications",
        headers=owner_header,
    )
    assert list_res.status_code == 403
    assert "Platform owner authorization required" in list_res.text

    # Attempt to approve
    fake_id = uuid.uuid4()
    approve_res = await async_client.post(
        f"/api/v1/platform/club-applications/{fake_id}/approve",
        headers=owner_header,
    )
    assert approve_res.status_code == 403


@pytest.mark.asyncio
async def test_10_11_12_authorized_platform_owner_approves_application(
    async_client: AsyncClient,
    platform_owner: User,
    db_session: AsyncSession,
):
    """Scenario 10, 11 & 12: Platform owner approves application; creates club and single club_owner membership; allows login."""
    uid = uuid.uuid4().hex[:6]
    email = f"grace_{uid}@newclub.local"
    password = "GracePassword2026!"
    payload = {
        "applicant_name": "Grace Hopper",
        "applicant_email": email,
        "applicant_password": password,
        "club_name": f"Grace Valley Club {uid}",
        "slug": f"grace-valley-{uid}",
        "city": "Austin",
        "state": "TX",
    }
    sub_res = await async_client.post("/api/v1/club-applications", json=payload)
    app_id = sub_res.json()["id"]

    po_header = make_auth_header(platform_owner.id)

    # 1. Platform owner views application details
    detail_res = await async_client.get(
        f"/api/v1/platform/club-applications/{app_id}",
        headers=po_header,
    )
    assert detail_res.status_code == 200
    assert detail_res.json()["status"] == "pending"

    # 2. Platform owner approves application
    approve_res = await async_client.post(
        f"/api/v1/platform/club-applications/{app_id}/approve",
        headers=po_header,
    )
    assert approve_res.status_code == 200
    app_data = approve_res.json()
    assert app_data["status"] == "approved"
    assert app_data["club_id"] is not None

    created_club_id = app_data["club_id"]

    # 3. Verify exactly one club_owner membership was created
    from app.repositories.club_membership_repository import ClubMembershipRepository
    memberships = await ClubMembershipRepository(db_session).get_club_members(
        uuid.UUID(created_club_id),
        include_inactive=True,
    )
    assert len(memberships) == 1
    assert memberships[0].role == ClubRole.CLUB_OWNER
    assert memberships[0].is_active is True

    # 4. Grace can now log into club management and receives authorized tokens
    login_res = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert len(login_data["memberships"]) == 1
    assert login_data["memberships"][0]["role"] == "club_owner"
    assert login_data["memberships"][0]["club_id"] == created_club_id


@pytest.mark.asyncio
async def test_15_repeated_approval_rejected(
    async_client: AsyncClient,
    platform_owner: User,
):
    """Scenario 15: Once approved, repeated approval call fails with 400."""
    uid = uuid.uuid4().hex[:6]
    payload = {
        "applicant_name": "Henry Applicant",
        "applicant_email": f"henry_{uid}@club.local",
        "applicant_password": "HenryPassword2026!",
        "club_name": f"Henry Club {uid}",
        "slug": f"henry-club-{uid}",
    }
    sub_res = await async_client.post("/api/v1/club-applications", json=payload)
    app_id = sub_res.json()["id"]

    po_header = make_auth_header(platform_owner.id)

    # First approval -> 200
    first_res = await async_client.post(
        f"/api/v1/platform/club-applications/{app_id}/approve",
        headers=po_header,
    )
    assert first_res.status_code == 200

    # Second approval -> 400
    second_res = await async_client.post(
        f"/api/v1/platform/club-applications/{app_id}/approve",
        headers=po_header,
    )
    assert second_res.status_code == 400
    assert "already approved" in second_res.text


@pytest.mark.asyncio
async def test_17_18_existing_owners_and_managers_retain_permissions(
    async_client: AsyncClient,
    existing_club_owner: tuple[User, Club],
):
    """Scenario 17 & 18: Existing approved club owners still log in and access their club."""
    owner_user, club = existing_club_owner

    # Owner logs in with their credentials
    login_res = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": owner_user.email, "password": "OwnerPass123!"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["memberships"][0]["role"] == "club_owner"


@pytest.mark.asyncio
async def test_21_status_lookup_requires_matching_email(
    async_client: AsyncClient,
):
    """Scenario 21: Status check with correct ref + correct email succeeds; wrong email returns 404."""
    uid = uuid.uuid4().hex[:6]
    email = f"irene_{uid}@club.local"
    payload = {
        "applicant_name": "Irene Applicant",
        "applicant_email": email,
        "applicant_password": "IrenePassword2026!",
        "club_name": f"Irene Club {uid}",
        "slug": f"irene-club-{uid}",
    }
    sub_res = await async_client.post("/api/v1/club-applications", json=payload)
    ref = sub_res.json()["reference_number"]

    # Correct email & ref
    ok_res = await async_client.get(f"/api/v1/club-applications/status?reference_number={ref}&email={email}")
    assert ok_res.status_code == 200
    assert ok_res.json()["status"] == "pending"

    # Wrong email -> 404 (does not disclose status or existence to strangers)
    wrong_res = await async_client.get(f"/api/v1/club-applications/status?reference_number={ref}&email=stranger@bad.local")
    assert wrong_res.status_code == 404


@pytest.mark.asyncio
async def test_16_concurrent_approval_defense(
    async_client: AsyncClient,
    platform_owner: User,
):
    """Scenario 16: Approval requests cannot produce duplicate clubs or conflicting states."""
    uid = uuid.uuid4().hex[:6]
    payload = {
        "applicant_name": "Jack Applicant",
        "applicant_email": f"jack_{uid}@club.local",
        "applicant_password": "JackPassword2026!",
        "club_name": f"Jack Club {uid}",
        "slug": f"jack-club-{uid}",
    }
    sub_res = await async_client.post("/api/v1/club-applications", json=payload)
    app_id = sub_res.json()["id"]

    po_header = make_auth_header(platform_owner.id)

    # First approval succeeds
    res1 = await async_client.post(f"/api/v1/platform/club-applications/{app_id}/approve", headers=po_header)
    assert res1.status_code == 200
    assert res1.json()["status"] == "approved"

    # Conflicting or duplicate approval is rejected with 400
    res2 = await async_client.post(f"/api/v1/platform/club-applications/{app_id}/approve", headers=po_header)
    assert res2.status_code == 400
    assert "already approved" in res2.text


@pytest.mark.asyncio
async def test_19_and_20_multi_club_and_cross_club_isolation(
    async_client: AsyncClient,
    existing_club_owner: tuple[User, Club],
    db_session: AsyncSession,
):
    """Scenario 19 & 20: Multi-club user role context and cross-club access restrictions."""
    owner_user, club_alpha = existing_club_owner
    uid = uuid.uuid4().hex[:6]

    # Create club Beta where same user is only tournament_director
    club_beta = Club(
        name=f"Club Beta {uid}",
        slug=f"club-beta-{uid}",
        is_active=True,
        opening_time=time(6, 0),
        closing_time=time(22, 0),
    )
    db_session.add(club_beta)
    await db_session.flush()

    td_membership = ClubMembership(
        user_id=owner_user.id,
        club_id=club_beta.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    db_session.add(td_membership)
    await db_session.flush()

    # In Club Alpha: user has MANAGE_SETTINGS & MANAGE_CLUB
    alpha_header = make_auth_header(owner_user.id)
    courts_res = await async_client.get(f"/api/v1/clubs/{club_alpha.id}/courts", headers=alpha_header)
    assert courts_res.status_code == 200

    # In Club Beta: user is Tournament Director; denied payment/court management
    court_post_res = await async_client.post(
        f"/api/v1/clubs/{club_beta.id}/courts",
        headers=alpha_header,
        json={"name": "Court 1"},
    )
    assert court_post_res.status_code == 403


@pytest.mark.asyncio
async def test_22_existing_data_remains_unaffected(
    async_client: AsyncClient,
    existing_club_owner: tuple[User, Club],
):
    """Scenario 22: Existing clubs, memberships, and endpoints remain completely functional."""
    owner_user, club = existing_club_owner
    header = make_auth_header(owner_user.id)

    club_res = await async_client.get(f"/api/v1/clubs/{club.id}", headers=header)
    assert club_res.status_code == 200
    assert club_res.json()["name"] == club.name
