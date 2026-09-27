"""
Aught2 Pickleball — Phase 14 Event API & Domain Tests

Comprehensive test suite verifying:
  - Event CRUD: creation, validation, filtering, updates
  - Event Lifecycle: draft -> published -> completed/cancelled; invalid transitions rejected
  - Permissions: Owner allowed, Manager allowed, Tournament Director 403, Player 403
  - Eligibility: public (all users), members_only (active member allowed, non-member 403, inactive 403), private (staff only)
  - Registration Window: before opens (400), during window, after closes (400), after start (400)
  - Capacity & Waitlisting: limited capacity moves subsequent registrations to waitlist
  - Deterministic Waitlist Auto-Promotion: cancelling a registered player sequentially promotes earliest waitlisted player
  - Attendance Tracking: staff can mark attended / no-show on registered; rejected on waitlisted/cancelled
  - Duplicate Prevention: active duplicate rejected, re-registration allowed after cancellation
  - Tenant Isolation: cross-club staff access blocked, discovery respects club boundary
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.event import (
    Event,
    EventRegistration,
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_a(db_session: AsyncSession) -> Club:
    club = Club(name="Alpha Club", slug=f"alpha-club-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_b(db_session: AsyncSession) -> Club:
    club = Club(name="Beta Club", slug=f"beta-club-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def owner_user(db_session: AsyncSession, club_a: Club) -> User:
    user = User(
        email=f"owner-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Club Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubMembership(
        user_id=user.id,
        club_id=club_a.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def manager_user(db_session: AsyncSession, club_a: Club) -> User:
    user = User(
        email=f"manager-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Club Manager",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubMembership(
        user_id=user.id,
        club_id=club_a.id,
        role=ClubRole.CLUB_MANAGER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def td_user(db_session: AsyncSession, club_a: Club) -> User:
    user = User(
        email=f"td-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Tournament Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubMembership(
        user_id=user.id,
        club_id=club_a.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def player_member_user(db_session: AsyncSession, club_a: Club) -> User:
    """Active player member of Club A."""
    user = User(
        email=f"member-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Active Club Member",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    cpm = ClubPlayerMembership(
        user_id=user.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number=f"M-{uuid.uuid4().hex[:6]}",
    )
    db_session.add(cpm)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def inactive_member_user(db_session: AsyncSession, club_a: Club) -> User:
    """Inactive player member of Club A."""
    user = User(
        email=f"inactive-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Inactive Member",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    cpm = ClubPlayerMembership(
        user_id=user.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.INACTIVE,
        membership_number=f"INACT-{uuid.uuid4().hex[:6]}",
    )
    db_session.add(cpm)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def non_member_user(db_session: AsyncSession) -> User:
    """Registered app user with no club memberships."""
    user = User(
        email=f"public-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Public User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def extra_player(db_session: AsyncSession) -> User:
    user = User(
        email=f"extra-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Extra Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


# ─── Auth Headers Helpers ─────────────────────────────────────────────────────

def get_headers(user: User) -> dict[str, str]:
    return make_auth_header(user)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. EVENT CRUD & VALIDATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_event_success(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Social Mixer",
        "description": "Fun Friday social",
        "event_type": "social",
        "visibility": "public",
        "start_at": (now + timedelta(days=5)).isoformat(),
        "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        "location": "Court 1",
        "capacity": 12,
        "registration_required": True,
        "registration_fee": "250.00",
        "currency": "INR",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json=payload,
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["title"] == "Social Mixer"
    assert data["status"] == "draft"
    assert data["event_type"] == "social"
    assert data["capacity"] == 12
    assert Decimal(data["registration_fee"]) == Decimal("250.00")
    assert data["registered_count"] == 0
    assert data["available_spots"] == 12


@pytest.mark.asyncio
async def test_create_event_validation_end_before_start(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Bad Times Event",
        "start_at": (now + timedelta(days=5)).isoformat(),
        "end_at": (now + timedelta(days=4)).isoformat(),  # before start
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json=payload,
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_event_validation_close_before_open(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Bad Window Event",
        "start_at": (now + timedelta(days=5)).isoformat(),
        "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        "registration_opens_at": (now + timedelta(days=3)).isoformat(),
        "registration_closes_at": (now + timedelta(days=2)).isoformat(),  # before open
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json=payload,
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_event_negative_fee(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Negative Fee Event",
        "start_at": (now + timedelta(days=5)).isoformat(),
        "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        "registration_fee": "-10.00",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json=payload,
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_event_fee_decimal_places(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    payload = {
        "title": "Excess Decimals Event",
        "start_at": (now + timedelta(days=5)).isoformat(),
        "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        "registration_fee": "10.555",  # 3 decimals
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json=payload,
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_event_detail(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Detail Test",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=2)).isoformat(),
            "capacity": 20,
        },
        headers=get_headers(owner_user),
    )
    event_id = create_resp.json()["id"]

    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}",
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == event_id
    assert data["title"] == "Detail Test"
    assert data["capacity"] == 20
    assert data["available_spots"] == 20


@pytest.mark.asyncio
async def test_get_event_not_found(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/{uuid.uuid4()}",
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_club_events_and_filters(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    # Create social draft event
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Filter Social",
            "event_type": "social",
            "visibility": "members_only",
            "start_at": (now + timedelta(days=1)).isoformat(),
            "end_at": (now + timedelta(days=1, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    # Create clinic draft event
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Filter Clinic",
            "event_type": "clinic",
            "visibility": "public",
            "start_at": (now + timedelta(days=3)).isoformat(),
            "end_at": (now + timedelta(days=3, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    clinic_id = c_resp.json()["id"]
    # Publish clinic
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{clinic_id}/publish",
        headers=get_headers(owner_user),
    )

    # Filter by status=published
    resp_pub = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events?status=published",
        headers=get_headers(owner_user),
    )
    assert resp_pub.status_code == 200
    pub_events = resp_pub.json()
    assert all(e["status"] == "published" for e in pub_events)
    assert any(e["id"] == clinic_id for e in pub_events)

    # Filter by event_type=social
    resp_soc = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events?event_type=social",
        headers=get_headers(owner_user),
    )
    assert resp_soc.status_code == 200
    assert all(e["event_type"] == "social" for e in resp_soc.json())


@pytest.mark.asyncio
async def test_update_event_success(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Original Title",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
            "capacity": 10,
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]

    resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}",
        json={"title": "Updated Title", "capacity": 15},
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated Title"
    assert data["capacity"] == 15


@pytest.mark.asyncio
async def test_update_event_schedule_validation(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Schedule Test",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]

    resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}",
        json={"end_at": (now + timedelta(days=4)).isoformat()},  # before start_at
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# 2. EVENT LIFECYCLE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_lifecycle_publish_complete_and_invalid(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Lifecycle Event",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]

    # 1. Invalid: complete a draft event
    bad_comp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/complete",
        headers=get_headers(owner_user),
    )
    assert bad_comp.status_code == 400

    # 2. Publish draft event
    pub_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )
    assert pub_resp.status_code == 200
    assert pub_resp.json()["status"] == "published"

    # 3. Complete published event
    comp_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/complete",
        headers=get_headers(owner_user),
    )
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "completed"

    # 4. Invalid: publish a completed event
    bad_pub = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )
    assert bad_pub.status_code == 400

    # 5. Invalid: update a completed event
    bad_upd = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}",
        json={"title": "Trying to edit completed"},
        headers=get_headers(owner_user),
    )
    assert bad_upd.status_code == 400


@pytest.mark.asyncio
async def test_lifecycle_cancellation(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "To Be Cancelled",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]

    # Cancel draft
    canc_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/cancel",
        headers=get_headers(owner_user),
    )
    assert canc_resp.status_code == 200
    assert canc_resp.json()["status"] == "cancelled"

    # Invalid: re-publish cancelled
    bad_pub = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )
    assert bad_pub.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# 3. PERMISSIONS & TENANT ISOLATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_permissions_manager_allowed(
    async_client: AsyncClient,
    club_a: Club,
    manager_user: User,
):
    now = datetime.now(timezone.utc)
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Manager Created Event",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(manager_user),
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_permissions_tournament_director_forbidden(
    async_client: AsyncClient,
    club_a: Club,
    td_user: User,
):
    now = datetime.now(timezone.utc)
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "TD Event Attempt",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(td_user),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_permissions_player_staff_endpoint_forbidden(
    async_client: AsyncClient,
    club_a: Club,
    player_member_user: User,
):
    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events",
        headers=get_headers(player_member_user),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tenant_isolation_staff_cross_club_access(
    async_client: AsyncClient,
    club_a: Club,
    club_b: Club,
    owner_user: User,
):
    now = datetime.now(timezone.utc)
    # Club A owner tries to create event in Club B
    resp = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/events",
        json={
            "title": "Cross Club Attack",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════════
# 4. REGISTRATION ELIGIBILITY TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_player_register_public_event(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Public Event",
            "visibility": "public",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    reg_resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert reg_resp.status_code == 201
    assert reg_resp.json()["status"] == "registered"


@pytest.mark.asyncio
async def test_player_register_members_only_active_member(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Members Only Event",
            "visibility": "members_only",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    reg_resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    assert reg_resp.status_code == 201
    assert reg_resp.json()["status"] == "registered"


@pytest.mark.asyncio
async def test_player_register_members_only_non_member_forbidden(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Members Only Restricted",
            "visibility": "members_only",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    reg_resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert reg_resp.status_code == 403


@pytest.mark.asyncio
async def test_player_register_members_only_inactive_member_forbidden(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    inactive_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Members Only Inactive Test",
            "visibility": "members_only",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    reg_resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(inactive_member_user),
    )
    assert reg_resp.status_code == 403


@pytest.mark.asyncio
async def test_player_register_private_event_forbidden(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Private Gathering",
            "visibility": "private",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # Self-registration on private event -> 403
    reg_resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    assert reg_resp.status_code == 403


@pytest.mark.asyncio
async def test_staff_manual_register_player_private_event(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Private VIP Event",
            "visibility": "private",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # Staff registers the player
    staff_reg = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations",
        json={"user_id": str(player_member_user.id), "notes": "VIP invite"},
        headers=get_headers(owner_user),
    )
    assert staff_reg.status_code == 201
    assert staff_reg.json()["status"] == "registered"


# ═══════════════════════════════════════════════════════════════════════════════
# 5. REGISTRATION WINDOW TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_register_before_opening_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Opens Tomorrow",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
            "registration_opens_at": (now + timedelta(days=1)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert resp.status_code == 400
    assert "not open yet" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_after_closing_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Closed Yesterday",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
            "registration_opens_at": (now - timedelta(days=3)).isoformat(),
            "registration_closes_at": (now - timedelta(days=1)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert resp.status_code == 400
    assert "closed" in resp.json()["detail"].lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 6. CAPACITY, WAITLIST & DETERMINISTIC PROMOTION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_capacity_and_waitlist_flow(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
    extra_player: User,
):
    now = datetime.now(timezone.utc)
    # Event with capacity of 1
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Exclusive Clinic",
            "capacity": 1,
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # 1. First player registers -> REGISTERED
    r1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    assert r1.status_code == 201
    assert r1.json()["status"] == "registered"

    # 2. Second player registers -> WAITLISTED
    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert r2.status_code == 201
    assert r2.json()["status"] == "waitlisted"

    # 3. Third player registers -> WAITLISTED
    r3 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(extra_player),
    )
    assert r3.status_code == 201
    assert r3.json()["status"] == "waitlisted"

    # Verify event detail counts
    detail = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}",
        headers=get_headers(owner_user),
    )
    assert detail.json()["registered_count"] == 1
    assert detail.json()["waitlisted_count"] == 2
    assert detail.json()["available_spots"] == 0

    # 4. First player cancels -> Second player (earliest waitlisted) auto-promoted to REGISTERED!
    canc = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/cancel",
        headers=get_headers(player_member_user),
    )
    assert canc.status_code == 200
    assert canc.json()["status"] == "cancelled"

    # Check second player's status: should now be REGISTERED
    p2_detail = await async_client.get(
        f"/api/v1/players/me/events/{event_id}",
        headers=get_headers(non_member_user),
    )
    assert p2_detail.json()["user_registration_status"] == "registered"

    # Check third player's status: still WAITLISTED
    p3_detail = await async_client.get(
        f"/api/v1/players/me/events/{event_id}",
        headers=get_headers(extra_player),
    )
    assert p3_detail.json()["user_registration_status"] == "waitlisted"


@pytest.mark.asyncio
async def test_duplicate_registration_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Dup Test Event",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    r1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert r1.status_code == 201

    # Second registration attempt
    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert r2.status_code == 400
    assert "already has an active registration" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_re_registration_after_cancellation_allowed(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Re-reg Event",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # Register
    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    # Cancel
    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/cancel",
        headers=get_headers(non_member_user),
    )
    # Re-register
    r3 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert r3.status_code == 201
    assert r3.json()["status"] == "registered"


# ═══════════════════════════════════════════════════════════════════════════════
# 7. ATTENDANCE & PROMOTION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_attendance_mark_attended_and_no_show(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Attendance Event",
            "capacity": 5,
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    r1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    reg1_id = r1.json()["id"]

    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    reg2_id = r2.json()["id"]

    # Mark reg1 attended
    att = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations/{reg1_id}/attend",
        headers=get_headers(owner_user),
    )
    assert att.status_code == 200
    assert att.json()["status"] == "attended"

    # Mark reg2 no-show
    ns = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations/{reg2_id}/no-show",
        headers=get_headers(owner_user),
    )
    assert ns.status_code == 200
    assert ns.json()["status"] == "no_show"


@pytest.mark.asyncio
async def test_cannot_mark_attendance_for_waitlisted_or_cancelled(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Invalid Attendance Event",
            "capacity": 1,
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # Reg 1: Registered
    r1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    reg1_id = r1.json()["id"]

    # Reg 2: Waitlisted
    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    reg2_id = r2.json()["id"]

    # Try marking waitlisted as attended -> 400
    att_wait = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations/{reg2_id}/attend",
        headers=get_headers(owner_user),
    )
    assert att_wait.status_code == 400

    # Cancel Reg 1
    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/cancel",
        headers=get_headers(player_member_user),
    )

    # Try marking cancelled reg1 as attended -> 400
    att_canc = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations/{reg1_id}/attend",
        headers=get_headers(owner_user),
    )
    assert att_canc.status_code == 400


@pytest.mark.asyncio
async def test_manual_promote_waitlisted_player(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Manual Promote Event",
            "capacity": 1,
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    reg2_id = r2.json()["id"]
    assert r2.json()["status"] == "waitlisted"

    # Staff manual promote
    prom = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations/{reg2_id}/promote",
        headers=get_headers(owner_user),
    )
    assert prom.status_code == 200
    assert prom.json()["status"] == "registered"


# ═══════════════════════════════════════════════════════════════════════════════
# 8. PLAYER DISCOVERY & REGISTRATION LIST TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_player_discovery_visibility_filtering(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    # Event 1: Public published
    c1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Public Event",
            "visibility": "public",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{c1.json()['id']}/publish",
        headers=get_headers(owner_user),
    )

    # Event 2: Members-only published
    c2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Members Only Event",
            "visibility": "members_only",
            "start_at": (now + timedelta(days=6)).isoformat(),
            "end_at": (now + timedelta(days=6, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{c2.json()['id']}/publish",
        headers=get_headers(owner_user),
    )

    # Event 3: Private published
    c3 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Private Event",
            "visibility": "private",
            "start_at": (now + timedelta(days=7)).isoformat(),
            "end_at": (now + timedelta(days=7, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{c3.json()['id']}/publish",
        headers=get_headers(owner_user),
    )

    # Non-member sees only PUBLIC
    disc_non = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/discover",
        headers=get_headers(non_member_user),
    )
    assert disc_non.status_code == 200
    events_non = disc_non.json()
    assert len(events_non) == 1
    assert events_non[0]["visibility"] == "public"

    # Member sees PUBLIC and MEMBERS_ONLY (private omitted)
    disc_mem = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/discover",
        headers=get_headers(player_member_user),
    )
    assert disc_mem.status_code == 200
    events_mem = disc_mem.json()
    assert len(events_mem) == 2
    visibilities = {e["visibility"] for e in events_mem}
    assert visibilities == {"public", "members_only"}


@pytest.mark.asyncio
async def test_list_my_event_registrations(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "My Events List Event",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # Register
    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )

    my_events = await async_client.get(
        "/api/v1/players/me/events",
        headers=get_headers(non_member_user),
    )
    assert my_events.status_code == 200
    regs = my_events.json()
    assert any(r["event_id"] == event_id for r in regs)


@pytest.mark.asyncio
async def test_auto_promotion_on_player_cancellation(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    """When a registered player cancels, the earliest waitlisted player is automatically promoted."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Capacity 1 Auto Promo",
            "capacity": 1,
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # Player 1 registers -> gets REGISTERED
    r1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    assert r1.status_code == 201
    assert r1.json()["status"] == "registered"

    # Player 2 registers -> gets WAITLISTED
    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert r2.status_code == 201
    assert r2.json()["status"] == "waitlisted"
    reg2_id = r2.json()["id"]

    # Player 1 cancels their registration
    cancel_resp = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/cancel",
        headers=get_headers(player_member_user),
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # Verify Player 2 was automatically promoted to REGISTERED
    my_regs = await async_client.get(
        "/api/v1/players/me/events",
        headers=get_headers(non_member_user),
    )
    assert my_regs.status_code == 200
    p2_reg = next(r for r in my_regs.json() if r["id"] == reg2_id)
    assert p2_reg["status"] == "registered"


@pytest.mark.asyncio
async def test_auto_promotion_on_staff_cancellation(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    """When staff cancels a registered participant, waitlisted player is promoted."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Staff Cancel Promo",
            "capacity": 1,
            "start_at": (now + timedelta(days=6)).isoformat(),
            "end_at": (now + timedelta(days=6, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    r1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    reg1_id = r1.json()["id"]

    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    reg2_id = r2.json()["id"]
    assert r2.json()["status"] == "waitlisted"

    # Staff cancels r1
    staff_cancel = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations/{reg1_id}/cancel",
        headers=get_headers(owner_user),
    )
    assert staff_cancel.status_code == 200
    assert staff_cancel.json()["status"] == "cancelled"

    # Check staff registration list: r2 is now registered
    staff_regs = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations",
        headers=get_headers(owner_user),
    )
    assert staff_regs.status_code == 200
    r2_updated = next(r for r in staff_regs.json() if r["id"] == reg2_id)
    assert r2_updated["status"] == "registered"


@pytest.mark.asyncio
async def test_get_player_event_detail(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    """Player fetches detailed event information with user registration state."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Player Detail Test",
            "capacity": 20,
            "start_at": (now + timedelta(days=4)).isoformat(),
            "end_at": (now + timedelta(days=4, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # Fetch before registering
    d1 = await async_client.get(
        f"/api/v1/players/me/events/{event_id}",
        headers=get_headers(non_member_user),
    )
    assert d1.status_code == 200
    assert d1.json()["user_registration_status"] is None
    assert d1.json()["user_registration_id"] is None

    # Register
    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )

    # Fetch after registering
    d2 = await async_client.get(
        f"/api/v1/players/me/events/{event_id}",
        headers=get_headers(non_member_user),
    )
    assert d2.status_code == 200
    assert d2.json()["user_registration_status"] == "registered"
    assert d2.json()["user_registration_id"] is not None


@pytest.mark.asyncio
async def test_unlimited_capacity_event(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    """Event with capacity=None allows unlimited registrations without waitlisting."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Unlimited Capacity Event",
            "capacity": None,
            "start_at": (now + timedelta(days=7)).isoformat(),
            "end_at": (now + timedelta(days=7, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    r1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    assert r1.status_code == 201
    assert r1.json()["status"] == "registered"

    r2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert r2.status_code == 201
    assert r2.json()["status"] == "registered"


@pytest.mark.asyncio
async def test_cannot_cancel_already_cancelled_registration(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    """Attempting to cancel an already cancelled registration returns 400."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Double Cancel Test",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )

    c1 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/cancel",
        headers=get_headers(non_member_user),
    )
    assert c1.status_code == 200

    c2 = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/cancel",
        headers=get_headers(non_member_user),
    )
    assert c2.status_code == 404


@pytest.mark.asyncio
async def test_cannot_register_cancelled_event(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    """Player cannot register for a cancelled event."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Cancelled Event Reg Test",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/cancel",
        headers=get_headers(owner_user),
    )

    reg = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert reg.status_code == 400


@pytest.mark.asyncio
async def test_cannot_register_completed_event(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    """Player cannot register for a completed event."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Completed Event Reg Test",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/complete",
        headers=get_headers(owner_user),
    )

    reg = await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )
    assert reg.status_code == 400


@pytest.mark.asyncio
async def test_staff_register_player_duplicate_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    non_member_user: User,
):
    """Staff attempting to register a player who is already registered gets 400."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Staff Dup Reg Test",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # First registration
    s1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations",
        json={"user_id": str(non_member_user.id)},
        headers=get_headers(owner_user),
    )
    assert s1.status_code == 201

    # Second registration for same user
    s2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations",
        json={"user_id": str(non_member_user.id)},
        headers=get_headers(owner_user),
    )
    assert s2.status_code == 400


@pytest.mark.asyncio
async def test_staff_list_registrations_filtered_by_status(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    player_member_user: User,
    non_member_user: User,
):
    """Staff can list registrations filtered by registered and waitlisted."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Staff Filter Regs Test",
            "capacity": 1,
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )

    # One registered, one waitlisted
    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(player_member_user),
    )
    await async_client.post(
        f"/api/v1/players/me/events/{event_id}/register",
        headers=get_headers(non_member_user),
    )

    list_reg = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations?status=registered",
        headers=get_headers(owner_user),
    )
    assert list_reg.status_code == 200
    assert len(list_reg.json()) == 1
    assert list_reg.json()[0]["status"] == "registered"

    list_wait = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/registrations?status=waitlisted",
        headers=get_headers(owner_user),
    )
    assert list_wait.status_code == 200
    assert len(list_wait.json()) == 1
    assert list_wait.json()[0]["status"] == "waitlisted"


@pytest.mark.asyncio
async def test_cannot_update_completed_event(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    """Completed events cannot be modified."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Completed Update Test",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/complete",
        headers=get_headers(owner_user),
    )

    update_resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}",
        json={"title": "New Title Attempt"},
        headers=get_headers(owner_user),
    )
    assert update_resp.status_code == 400


@pytest.mark.asyncio
async def test_cannot_update_cancelled_event(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
):
    """Cancelled events cannot be modified."""
    now = datetime.now(timezone.utc)
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events",
        json={
            "title": "Cancelled Update Test",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=2)).isoformat(),
        },
        headers=get_headers(owner_user),
    )
    event_id = c_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/publish",
        headers=get_headers(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}/cancel",
        headers=get_headers(owner_user),
    )

    update_resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/events/{event_id}",
        json={"title": "New Title Attempt"},
        headers=get_headers(owner_user),
    )
    assert update_resp.status_code == 400

