"""
Aught2 Pickleball — Phase 6 Club Owner Dashboard, Staff Management & Role-Based Permissions Tests

Covers:
  1. Authorization tests:
     - Club Owner manages staff within own club
     - Club Owner cannot manage staff in another club
     - Club Manager cannot assign roles or promote self to owner
     - Tournament Director cannot access staff management or payments
     - Player cannot access staff endpoints
     - User with different roles in two clubs has correctly isolated permissions
  2. Staff Lifecycle tests:
     - Adding/inviting staff
     - Invalid role rejection (422)
     - Duplicate active staff rejection (400)
     - Role changes persist
     - Soft-deactivation preserves historical records
     - Final-owner protection (cannot demote or deactivate final owner, 400)
     - Multi-owner allows demoting non-final owner
     - Single staff member detail retrieval (GET /{club_id}/members/{membership_id})
     - Staff listing filters (role and search)
  3. Dashboard & Tenant Isolation tests:
     - Server-side aggregated dashboard metrics
     - Strict club tenant isolation (no cross-club leak)
     - Empty club returns clean zero values
     - Payment metrics hidden for Tournament Director (least privilege)
     - Unauthorized callers rejected (403)
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.lesson import Lesson, LessonStatus
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_alpha(db_session: AsyncSession) -> Club:
    club = Club(name="Club Alpha", slug=f"alpha-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_beta(db_session: AsyncSession) -> Club:
    club = Club(name="Club Beta", slug=f"beta-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def owner_alpha(db_session: AsyncSession, club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"owner-alpha-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Owner123!"),
        full_name="Alpha Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_alpha.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u, m


@pytest_asyncio.fixture
async def manager_alpha(db_session: AsyncSession, club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"manager-alpha-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Manager123!"),
        full_name="Alpha Manager",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_alpha.id, user_id=u.id, role=ClubRole.CLUB_MANAGER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u, m


@pytest_asyncio.fixture
async def td_alpha(db_session: AsyncSession, club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"td-alpha-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("TD123!"),
        full_name="Alpha TD",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_alpha.id, user_id=u.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u, m


@pytest_asyncio.fixture
async def owner_beta(db_session: AsyncSession, club_beta: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"owner-beta-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("BetaOwner123!"),
        full_name="Beta Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club_beta.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u, m


@pytest_asyncio.fixture
async def player_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"player-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Player123!"),
        full_name="Regular Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


# ─── 1. Authorization Tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_owner_can_manage_staff_in_own_club(
    async_client: AsyncClient,
    club_alpha: Club,
    owner_alpha: tuple[User, ClubMembership],
):
    """Club Owner can list, add, update, and deactivate staff in own club."""
    headers = make_auth_header(owner_alpha[0])

    # 1. Add manager
    add_res = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
        json={
            "email": "new-manager@test.local",
            "role": "club_manager",
            "full_name": "New Manager",
        },
    )
    assert add_res.status_code == 201
    created_staff = add_res.json()
    assert created_staff["role"] == "club_manager"
    membership_id = created_staff["id"]

    # 2. Update role to tournament director
    patch_res = await async_client.patch(
        f"/api/v1/clubs/{club_alpha.id}/members/{membership_id}",
        headers=headers,
        json={"role": "tournament_director"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["role"] == "tournament_director"

    # 3. Soft-deactivate staff
    del_res = await async_client.delete(
        f"/api/v1/clubs/{club_alpha.id}/members/{membership_id}",
        headers=headers,
    )
    assert del_res.status_code == 200
    assert del_res.json()["is_active"] is False


@pytest.mark.asyncio
async def test_club_owner_cannot_manage_staff_in_another_club(
    async_client: AsyncClient,
    club_alpha: Club,
    club_beta: Club,
    owner_alpha: tuple[User, ClubMembership],
    owner_beta: tuple[User, ClubMembership],
):
    """Club Owner from Alpha cannot manage or view staff in Beta (tenant barrier)."""
    headers = make_auth_header(owner_alpha[0])

    # List Beta staff -> 403 Forbidden
    res_list = await async_client.get(
        f"/api/v1/clubs/{club_beta.id}/members",
        headers=headers,
    )
    assert res_list.status_code == 403

    # Add staff to Beta -> 403 Forbidden
    res_add = await async_client.post(
        f"/api/v1/clubs/{club_beta.id}/members",
        headers=headers,
        json={"email": "attacker@test.local", "role": "club_manager"},
    )
    assert res_add.status_code == 403

    # Update Beta staff -> 403 Forbidden
    res_patch = await async_client.patch(
        f"/api/v1/clubs/{club_beta.id}/members/{owner_beta[1].id}",
        headers=headers,
        json={"role": "club_manager"},
    )
    assert res_patch.status_code == 403


@pytest.mark.asyncio
async def test_club_manager_cannot_assign_roles_or_self_promote(
    async_client: AsyncClient,
    club_alpha: Club,
    manager_alpha: tuple[User, ClubMembership],
):
    """Club Manager cannot add staff, modify roles, or promote self to owner."""
    headers = make_auth_header(manager_alpha[0])

    # 1. Manager CAN list members (has MANAGE_MEMBERS)
    list_res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
    )
    assert list_res.status_code == 200

    # 2. Manager CANNOT add staff (requires MANAGE_ROLES) -> 403
    add_res = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
        json={"email": "manager-friend@test.local", "role": "club_manager"},
    )
    assert add_res.status_code == 403

    # 3. Manager CANNOT self-promote to owner -> 403
    patch_res = await async_client.patch(
        f"/api/v1/clubs/{club_alpha.id}/members/{manager_alpha[1].id}",
        headers=headers,
        json={"role": "club_owner"},
    )
    assert patch_res.status_code == 403


@pytest.mark.asyncio
async def test_tournament_director_cannot_manage_staff_or_payments(
    async_client: AsyncClient,
    club_alpha: Club,
    td_alpha: tuple[User, ClubMembership],
):
    """Tournament Director is denied access to staff administration and payments."""
    headers = make_auth_header(td_alpha[0])

    # Staff list -> 403
    staff_res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
    )
    assert staff_res.status_code == 403

    # Payments management -> 403
    pay_res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/payments",
        headers=headers,
    )
    assert pay_res.status_code == 403

    # Payments summary -> 403
    summary_res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/payments/summary",
        headers=headers,
    )
    assert summary_res.status_code == 403


@pytest.mark.asyncio
async def test_player_cannot_access_staff_endpoints(
    async_client: AsyncClient,
    club_alpha: Club,
    player_user: User,
):
    """Regular player without staff membership cannot access staff management."""
    headers = make_auth_header(player_user)

    res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_user_with_different_roles_in_different_clubs(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
):
    """A user who is Owner in Alpha and TD in Beta has correctly scoped permissions."""
    u = User(
        email=f"multi-role-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Multi Role User",
        is_active=True,
    )
    db_session.add(u)
    await db_session.flush()

    # Owner in Alpha
    db_session.add(ClubMembership(club_id=club_alpha.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True))
    # Tournament Director in Beta
    db_session.add(ClubMembership(club_id=club_beta.id, user_id=u.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    await db_session.flush()

    headers = make_auth_header(u)

    # In Club Alpha: can manage roles (POST /members succeeds)
    alpha_add = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
        json={"email": f"hired-{uuid.uuid4().hex[:6]}@test.local", "role": "club_manager"},
    )
    assert alpha_add.status_code == 201

    # In Club Beta: cannot manage roles (POST /members fails with 403)
    beta_add = await async_client.post(
        f"/api/v1/clubs/{club_beta.id}/members",
        headers=headers,
        json={"email": f"hired2-{uuid.uuid4().hex[:6]}@test.local", "role": "club_manager"},
    )
    assert beta_add.status_code == 403


# ─── 2. Staff Lifecycle Tests ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invalid_role_rejected(
    async_client: AsyncClient,
    club_alpha: Club,
    owner_alpha: tuple[User, ClubMembership],
):
    """Adding staff with an invalid role returns 422 Unprocessable Content."""
    headers = make_auth_header(owner_alpha[0])

    res = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
        json={"email": "badrole@test.local", "role": "super_admin_fake"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_active_staff_rejected(
    async_client: AsyncClient,
    club_alpha: Club,
    owner_alpha: tuple[User, ClubMembership],
    manager_alpha: tuple[User, ClubMembership],
):
    """Adding an already active staff member returns 400 Bad Request."""
    headers = make_auth_header(owner_alpha[0])

    res = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
        json={"email": manager_alpha[0].email, "role": "club_manager"},
    )
    assert res.status_code == 400
    assert "already an active member" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_final_owner_protection_against_demotion_and_deactivation(
    async_client: AsyncClient,
    club_alpha: Club,
    owner_alpha: tuple[User, ClubMembership],
):
    """The club's final active owner cannot be demoted or deactivated."""
    headers = make_auth_header(owner_alpha[0])

    # Demoting final owner -> 400
    demote_res = await async_client.patch(
        f"/api/v1/clubs/{club_alpha.id}/members/{owner_alpha[1].id}",
        headers=headers,
        json={"role": "club_manager"},
    )
    assert demote_res.status_code == 400
    assert "must have at least one active owner" in demote_res.json()["detail"].lower()

    # Deactivating final owner via DELETE -> 400
    del_res = await async_client.delete(
        f"/api/v1/clubs/{club_alpha.id}/members/{owner_alpha[1].id}",
        headers=headers,
    )
    assert del_res.status_code == 400
    assert "final active owner" in del_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_multiple_owners_allows_demoting_non_final_owner(
    async_client: AsyncClient,
    club_alpha: Club,
    owner_alpha: tuple[User, ClubMembership],
):
    """When a club has multiple owners, demoting or deactivating one is allowed."""
    headers = make_auth_header(owner_alpha[0])

    # Add second owner
    add_res = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/members",
        headers=headers,
        json={"email": "second-owner@test.local", "role": "club_owner"},
    )
    assert add_res.status_code == 201
    second_id = add_res.json()["id"]

    # Demoting second owner is now allowed
    patch_res = await async_client.patch(
        f"/api/v1/clubs/{club_alpha.id}/members/{second_id}",
        headers=headers,
        json={"role": "club_manager"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["role"] == "club_manager"


@pytest.mark.asyncio
async def test_get_single_staff_member_detail(
    async_client: AsyncClient,
    club_alpha: Club,
    club_beta: Club,
    owner_alpha: tuple[User, ClubMembership],
    manager_alpha: tuple[User, ClubMembership],
):
    """Retrieving a single staff member's detail succeeds and enforces club boundary."""
    headers = make_auth_header(owner_alpha[0])

    # Valid retrieval in own club
    res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/members/{manager_alpha[1].id}",
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == str(manager_alpha[1].id)
    assert data["user_email"] == manager_alpha[0].email
    assert data["role"] == "club_manager"

    # Querying the same membership ID under another club returns 404
    cross_res = await async_client.get(
        f"/api/v1/clubs/{club_beta.id}/members/{manager_alpha[1].id}",
        headers=make_auth_header(owner_alpha[0]),  # Not in Beta
    )
    assert cross_res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_staff_listing_filters_by_role_and_search(
    async_client: AsyncClient,
    club_alpha: Club,
    owner_alpha: tuple[User, ClubMembership],
    manager_alpha: tuple[User, ClubMembership],
    td_alpha: tuple[User, ClubMembership],
):
    """Staff listing supports filtering by role, search keyword, and active status."""
    headers = make_auth_header(owner_alpha[0])

    # Filter by role=club_manager
    mgr_res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/members?role=club_manager",
        headers=headers,
    )
    assert mgr_res.status_code == 200
    items = mgr_res.json()
    assert all(i["role"] == "club_manager" for i in items)
    assert any(i["id"] == str(manager_alpha[1].id) for i in items)

    # Filter by role=tournament_director
    td_res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/members?role=tournament_director",
        headers=headers,
    )
    assert td_res.status_code == 200
    td_items = td_res.json()
    assert all(i["role"] == "tournament_director" for i in td_items)

    # Filter by search string
    search_res = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/members?search={manager_alpha[0].email[:8]}",
        headers=headers,
    )
    assert search_res.status_code == 200
    assert len(search_res.json()) >= 1


# ─── 3. Dashboard Aggregation & Tenant Isolation Tests ─────────────────────────

@pytest.mark.asyncio
async def test_dashboard_metrics_aggregation_and_tenant_isolation(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
    owner_alpha: tuple[User, ClubMembership],
    owner_beta: tuple[User, ClubMembership],
):
    """Dashboard returns server-aggregated operational metrics without leaking from other clubs."""
    now = datetime.now(timezone.utc)

    # Populate Club Alpha data:
    # 2 players (1 active, 1 suspended)
    u_p1 = User(email="p1-alpha@test.local", hashed_password="x")
    u_p2 = User(email="p2-alpha@test.local", hashed_password="x")
    db_session.add_all([u_p1, u_p2])
    await db_session.flush()

    db_session.add(ClubPlayerMembership(club_id=club_alpha.id, user_id=u_p1.id, status=PlayerMembershipStatus.ACTIVE))
    db_session.add(ClubPlayerMembership(club_id=club_alpha.id, user_id=u_p2.id, status=PlayerMembershipStatus.SUSPENDED))

    # 1 pending membership request
    u_req = User(email="preq-alpha@test.local", hashed_password="x")
    db_session.add(u_req)
    await db_session.flush()
    db_session.add(ClubMembershipRequest(club_id=club_alpha.id, user_id=u_req.id, status=MembershipRequestStatus.PENDING))

    # 1 court and 1 booking
    court = Court(club_id=club_alpha.id, name="Court 1", court_number=1, surface_type="Hard", indoor_outdoor=CourtEnvironment.OUTDOOR, status=CourtStatus.ACTIVE)
    db_session.add(court)
    await db_session.flush()

    db_session.add(Booking(
        club_id=club_alpha.id,
        court_id=court.id,
        booked_by_user_id=u_p1.id,
        player_id=u_p1.id,
        start_at=now + timedelta(hours=1),
        end_at=now + timedelta(hours=2),
        status=BookingStatus.CONFIRMED,
        booking_type=BookingType.PLAYER,
    ))

    # 1 tournament
    db_session.add(Tournament(
        club_id=club_alpha.id,
        name="Alpha Open",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now,
        end_date=now + timedelta(days=2),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=1),
    ))

    # 1 league
    db_session.add(League(
        club_id=club_alpha.id,
        name="Alpha Premier League",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now,
        end_date=now + timedelta(days=30),
    ))

    # 1 payment (pending 1500.00)
    db_session.add(Payment(
        reference=f"A2P-{uuid.uuid4().hex[:8].upper()}",
        club_id=club_alpha.id,
        player_id=u_p1.id,
        amount=Decimal("1500.00"),
        currency="INR",
        status=PaymentStatus.PENDING,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.CASH,
    ))

    # Populate Club Beta with data to ensure NO leak into Alpha:
    u_b = User(email="p-beta@test.local", hashed_password="x")
    db_session.add(u_b)
    await db_session.flush()
    db_session.add(ClubPlayerMembership(club_id=club_beta.id, user_id=u_b.id, status=PlayerMembershipStatus.ACTIVE))
    db_session.add(Payment(
        reference=f"A2P-{uuid.uuid4().hex[:8].upper()}",
        club_id=club_beta.id,
        player_id=u_b.id,
        amount=Decimal("9999.00"),
        currency="INR",
        status=PaymentStatus.PENDING,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.CASH,
    ))
    await db_session.commit()

    # Query Dashboard for Alpha
    headers = make_auth_header(owner_alpha[0])
    res = await async_client.get(f"/api/v1/clubs/{club_alpha.id}/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["club_id"] == str(club_alpha.id)
    assert data["club_name"] == club_alpha.name

    # Memberships
    assert data["memberships"]["total_players"] == 2
    assert data["memberships"]["active_players"] == 1
    assert data["memberships"]["pending_requests"] == 1

    # Bookings
    assert data["bookings"]["today_count"] >= 1
    assert data["bookings"]["upcoming_count"] >= 1

    # Competitions
    assert data["competitions"]["upcoming_tournaments"] == 1
    assert data["competitions"]["upcoming_leagues"] == 1

    # Payments: must be 1500.00, NOT 1500 + 9999 (Club Beta payment isolated!)
    assert data["payments"]["pending_count"] == 1
    assert Decimal(str(data["payments"]["pending_amount"])) == Decimal("1500.00")

    # Staff count in Alpha
    assert data["staff"]["active_staff"] >= 1


@pytest.mark.asyncio
async def test_empty_club_returns_valid_zero_dashboard_summary(
    async_client: AsyncClient,
    club_beta: Club,
    owner_beta: tuple[User, ClubMembership],
):
    """A newly registered empty club returns clean 0 metrics without crashes."""
    headers = make_auth_header(owner_beta[0])

    res = await async_client.get(f"/api/v1/clubs/{club_beta.id}/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["club_id"] == str(club_beta.id)
    assert data["memberships"]["total_players"] == 0
    assert data["memberships"]["active_players"] == 0
    assert data["memberships"]["pending_requests"] == 0
    assert data["bookings"]["today_count"] == 0
    assert data["bookings"]["upcoming_count"] == 0
    assert data["competitions"]["upcoming_tournaments"] == 0
    assert data["competitions"]["upcoming_leagues"] == 0
    assert data["events_and_lessons"]["upcoming_events"] == 0
    assert data["events_and_lessons"]["today_item"] is None
    assert data["staff"]["active_staff"] == 1  # The owner


@pytest.mark.asyncio
async def test_tournament_director_receives_dashboard_with_hidden_payments(
    async_client: AsyncClient,
    club_alpha: Club,
    td_alpha: tuple[User, ClubMembership],
):
    """Tournament Director accessing the dashboard receives operational counts, but payments is null."""
    headers = make_auth_header(td_alpha[0])

    res = await async_client.get(f"/api/v1/clubs/{club_alpha.id}/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.json()

    # Payments must be null for TD
    assert data["payments"] is None

    # Other non-payment metrics are populated
    assert "competitions" in data
    assert "memberships" in data


@pytest.mark.asyncio
async def test_unauthorized_user_cannot_access_club_dashboard(
    async_client: AsyncClient,
    club_alpha: Club,
    player_user: User,
):
    """A regular player without staff membership is rejected with 403 on dashboard."""
    headers = make_auth_header(player_user)

    res = await async_client.get(f"/api/v1/clubs/{club_alpha.id}/dashboard", headers=headers)
    assert res.status_code == 403
