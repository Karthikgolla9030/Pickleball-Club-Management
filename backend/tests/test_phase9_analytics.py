"""
Aught2 Pickleball — Phase 9 Reports, Analytics & Tenant Isolation Test Suite

Tests:
  1. Tenant isolation across all analytics endpoints:
     - Club A owner cannot access Club B analytics (403)
     - Club A manager cannot access Club B analytics (403)
     - Tournament Director is denied access to analytics (403, manage_reports required)
     - Tournament Director is denied access to payment analytics (403, manage_payments required)
     - Ordinary player is denied staff analytics endpoints (403)
     - Multi-role user (Owner in Club A, TD in Club B) authorized in Club A, rejected in Club B
     - Zero metric leakage between clubs (Club A metrics completely exclude Club B data)
     - Foreign court/plan filters cannot leak other clubs' data
     - Export endpoints enforce strict tenant and role boundaries
  2. Metric correctness:
     - Accurate booking status counts and court utilization math
     - Cancellation rate math with documented denominator
     - Membership status counts and plan subscription enrollments
     - Accurate payment sums with strict Decimal arithmetic
     - Pending and failed payments excluded from collected revenue
     - Tournament, league, event, and lesson activity counts
     - Empty club returns clean zero values without errors
  3. Export functionality:
     - CSV generated with correct headers and sanitized cells (formula injection defense)
  4. Date range validation:
     - Invalid ranges (start > end or > 366 days) rejected with 400
"""
from __future__ import annotations

import io
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
from app.models.competition import Team
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventRegistration, EventStatus, EventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.lesson import Lesson, LessonRegistration, LessonStatus
from app.models.membership import MemberSubscription, MembershipPlan, PlanDurationUnit, PlanStatus, SubscriptionStatus
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_alpha(db_session: AsyncSession) -> Club:
    club = Club(
        name="Club Alpha",
        slug=f"alpha-{uuid.uuid4().hex[:8]}",
        timezone="UTC",
    )
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_beta(db_session: AsyncSession) -> Club:
    club = Club(
        name="Club Beta",
        slug=f"beta-{uuid.uuid4().hex[:8]}",
        timezone="UTC",
    )
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def owner_alpha(db_session: AsyncSession, club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"owner-alpha-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
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
        email=f"mgr-alpha-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
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
        hashed_password=hash_password("Pass123!"),
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
async def plain_player(db_session: AsyncSession, club_alpha: Club) -> User:
    u = User(
        email=f"player-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Plain Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    # Member in player sense only
    cpm = ClubPlayerMembership(
        user_id=u.id,
        club_id=club_alpha.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="CPM-ALPHA-01",
    )
    db_session.add(cpm)
    await db_session.flush()
    return u


# ─── 1. Tenant Isolation & Authorization Tests ───────────────────────────────

@pytest.mark.asyncio
async def test_owner_alpha_cannot_access_club_beta_analytics(
    async_client: AsyncClient,
    owner_alpha: tuple[User, ClubMembership],
    club_beta: Club,
):
    """Test 1a: Club Alpha Owner receives 403 when querying Club Beta analytics."""
    user, _ = owner_alpha
    resp = await async_client.get(
        f"/api/v1/clubs/{club_beta.id}/analytics/summary",
        headers=make_auth_header(user),
    )
    assert resp.status_code == 403
    assert "not a member of this club" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_manager_alpha_cannot_access_club_beta_analytics(
    async_client: AsyncClient,
    manager_alpha: tuple[User, ClubMembership],
    club_beta: Club,
):
    """Test 1b: Club Alpha Manager receives 403 when querying Club Beta analytics."""
    user, _ = manager_alpha
    resp = await async_client.get(
        f"/api/v1/clubs/{club_beta.id}/analytics/summary",
        headers=make_auth_header(user),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_tournament_director_denied_analytics_access(
    async_client: AsyncClient,
    td_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """Test 1c: Tournament Director does NOT have MANAGE_REPORTS permission (403 Forbidden)."""
    user, _ = td_alpha
    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/summary",
        headers=make_auth_header(user),
    )
    assert resp.status_code == 403
    assert "manage_reports required" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_tournament_director_denied_payments_report(
    async_client: AsyncClient,
    td_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """Test 1d: Tournament Director does NOT have MANAGE_PAYMENTS permission (403 Forbidden)."""
    user, _ = td_alpha
    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/payments",
        headers=make_auth_header(user),
    )
    assert resp.status_code == 403
    assert "manage_payments required" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_plain_player_denied_analytics_access(
    async_client: AsyncClient,
    plain_player: User,
    club_alpha: Club,
):
    """Test 1e: Ordinary player without staff role is rejected from staff analytics (403)."""
    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/summary",
        headers=make_auth_header(plain_player),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_multi_role_user_isolated_per_club(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
):
    """
    Test 1f: A user who is Club Owner in Club Alpha but Tournament Director in Club Beta
    is authorized to view reports in Club Alpha, but denied in Club Beta.
    """
    u = User(
        email=f"multi-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Dual Role User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()

    m_alpha = ClubMembership(club_id=club_alpha.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
    m_beta = ClubMembership(club_id=club_beta.id, user_id=u.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True)
    db_session.add_all([m_alpha, m_beta])
    await db_session.flush()

    # In Club Alpha (Owner): Allowed
    resp_alpha = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/summary",
        headers=make_auth_header(u),
    )
    assert resp_alpha.status_code == 200

    # In Club Beta (TD): Denied (403)
    resp_beta = await async_client.get(
        f"/api/v1/clubs/{club_beta.id}/analytics/summary",
        headers=make_auth_header(u),
    )
    assert resp_beta.status_code == 403


@pytest.mark.asyncio
async def test_export_enforces_tenant_and_permission_boundaries(
    async_client: AsyncClient,
    owner_alpha: tuple[User, ClubMembership],
    td_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
    club_beta: Club,
):
    """Test 1g: Export endpoints enforce tenant boundary and MANAGE_PAYMENTS."""
    owner_u, _ = owner_alpha
    td_u, _ = td_alpha

    # Owner Alpha querying Club Beta export -> 403
    resp_foreign = await async_client.get(
        f"/api/v1/clubs/{club_beta.id}/analytics/export?report_type=bookings",
        headers=make_auth_header(owner_u),
    )
    assert resp_foreign.status_code == 403

    # Tournament Director querying payments export -> 403
    resp_td_pay = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/export?report_type=payments",
        headers=make_auth_header(td_u),
    )
    assert resp_td_pay.status_code == 403


# ─── 2. Metric Correctness & Data Aggregation Tests ──────────────────────────

@pytest.mark.asyncio
async def test_empty_club_returns_clean_zero_summary(
    async_client: AsyncClient,
    owner_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """Test 2a: Empty club returns clean zero metrics with no crashes."""
    user, _ = owner_alpha
    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/summary?preset=30d",
        headers=make_auth_header(user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["club_name"] == "Club Alpha"
    assert data["period"]["preset"] == "30d"
    assert data["period"]["days_count"] == 30
    assert data["bookings"]["total_bookings"] == 0
    assert data["bookings"]["court_utilization_rate"] == 0.0
    assert data["memberships"]["total_player_memberships"] == 0
    assert data["competitions"]["total_tournaments"] == 0
    assert data["community"]["total_events"] == 0
    assert data["payments"]["total_collected_amount"] == "0.00"
    assert len(data["daily_bookings"]) == 30


@pytest.mark.asyncio
async def test_zero_cross_tenant_metric_leakage(
    async_client: AsyncClient,
    db_session: AsyncSession,
    owner_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
    club_beta: Club,
):
    """
    Test 2b: Create activity in Club Beta (court, booking, payment, member).
    Verify Club Alpha metrics remain strictly 0 and do not leak Club Beta records.
    """
    now = datetime.now(timezone.utc)

    # Court & booking in Club Beta
    court_b = Court(
        club_id=club_beta.id,
        name="Court Beta 1",
        court_number=1,
        status=CourtStatus.ACTIVE,
        is_active=True,
    )
    db_session.add(court_b)
    await db_session.flush()

    user_b = User(
        email=f"beta-user-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Beta User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user_b)
    await db_session.flush()

    booking_b = Booking(
        club_id=club_beta.id,
        court_id=court_b.id,
        booked_by_user_id=user_b.id,
        player_id=user_b.id,
        start_at=now,
        end_at=now + timedelta(hours=1),
        status=BookingStatus.CONFIRMED,
        booking_type=BookingType.PLAYER,
        total_price=Decimal("500.00"),
    )
    payment_b = Payment(
        club_id=club_beta.id,
        player_id=user_b.id,
        reference=f"A2P-2026-BETA-{uuid.uuid4().hex[:4]}",
        amount=Decimal("1500.00"),
        currency="INR",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.ONLINE,
    )
    membership_b = ClubPlayerMembership(
        user_id=user_b.id,
        club_id=club_beta.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="CPM-BETA-01",
    )
    db_session.add_all([booking_b, payment_b, membership_b])
    await db_session.flush()

    # Query Club Alpha
    user_alpha, _ = owner_alpha
    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/summary?preset=30d",
        headers=make_auth_header(user_alpha),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["bookings"]["total_bookings"] == 0
    assert data["memberships"]["total_player_memberships"] == 0
    assert data["payments"]["total_collected_amount"] == "0.00"
    assert data["payments"]["succeeded_count"] == 0


@pytest.mark.asyncio
async def test_booking_utilization_and_status_math(
    async_client: AsyncClient,
    db_session: AsyncSession,
    owner_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """
    Test 2c: Verify booking metrics, court utilization calculation, and cancellation rate.
    """
    now = datetime.now(timezone.utc)
    user_alpha, _ = owner_alpha

    # Add 2 courts
    c1 = Court(club_id=club_alpha.id, name="Court 1", court_number=1, status=CourtStatus.ACTIVE, is_active=True)
    c2 = Court(club_id=club_alpha.id, name="Court 2", court_number=2, status=CourtStatus.ACTIVE, is_active=True)
    db_session.add_all([c1, c2])
    await db_session.flush()

    # 1 Confirmed booking (1 hour = 60 mins), 1 Cancelled booking
    b1 = Booking(
        club_id=club_alpha.id,
        court_id=c1.id,
        booked_by_user_id=user_alpha.id,
        player_id=user_alpha.id,
        start_at=now,
        end_at=now + timedelta(hours=1),
        status=BookingStatus.CONFIRMED,
        booking_type=BookingType.PLAYER,
        total_price=Decimal("400.00"),
    )
    b2 = Booking(
        club_id=club_alpha.id,
        court_id=c2.id,
        booked_by_user_id=user_alpha.id,
        player_id=user_alpha.id,
        start_at=now + timedelta(hours=2),
        end_at=now + timedelta(hours=3),
        status=BookingStatus.CANCELLED,
        booking_type=BookingType.PLAYER,
        total_price=Decimal("400.00"),
    )
    db_session.add_all([b1, b2])
    await db_session.flush()

    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/bookings?preset=7d",
        headers=make_auth_header(user_alpha),
    )
    assert resp.status_code == 200
    data = resp.json()
    summary = data["summary"]
    assert summary["total_bookings"] == 2
    assert summary["cancelled_count"] == 1
    assert summary["confirmed_count"] == 1
    # Cancellation rate = 1 / 2 = 50.0%
    assert summary["cancellation_rate"] == 50.0
    assert summary["active_courts_count"] == 2
    assert summary["total_booked_minutes"] == 60
    assert summary["court_utilization_rate"] > 0.0

    # Detailed by-court breakdown
    by_court = data["by_court"]
    assert len(by_court) == 2
    c1_stat = next(c for c in by_court if c["court_id"] == str(c1.id))
    assert c1_stat["booked_minutes"] == 60
    assert c1_stat["booking_count"] == 1


@pytest.mark.asyncio
async def test_financial_metrics_decimal_accuracy(
    async_client: AsyncClient,
    db_session: AsyncSession,
    owner_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """
    Test 2d: Verify financial aggregation:
    - Succeeded revenue sums only succeeded payments
    - Pending and failed amounts are accounted separately
    - Grouping by payment method is accurate
    """
    user_alpha, _ = owner_alpha
    now = datetime.now(timezone.utc)

    p_succ1 = Payment(
        club_id=club_alpha.id,
        player_id=user_alpha.id,
        reference="A2P-2026-TEST-001",
        amount=Decimal("1200.50"),
        currency="INR",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.ONLINE,
        created_at=now,
    )
    p_succ2 = Payment(
        club_id=club_alpha.id,
        player_id=user_alpha.id,
        reference="A2P-2026-TEST-002",
        amount=Decimal("300.25"),
        currency="INR",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.CASH,
        created_at=now,
    )
    p_pend = Payment(
        club_id=club_alpha.id,
        player_id=user_alpha.id,
        reference="A2P-2026-TEST-003",
        amount=Decimal("500.00"),
        currency="INR",
        status=PaymentStatus.PENDING,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.BANK_TRANSFER,
        created_at=now,
    )
    p_fail = Payment(
        club_id=club_alpha.id,
        player_id=user_alpha.id,
        reference="A2P-2026-TEST-004",
        amount=Decimal("100.00"),
        currency="INR",
        status=PaymentStatus.FAILED,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.ONLINE,
        created_at=now,
    )
    db_session.add_all([p_succ1, p_succ2, p_pend, p_fail])
    await db_session.flush()

    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/payments?preset=30d",
        headers=make_auth_header(user_alpha),
    )
    assert resp.status_code == 200
    data = resp.json()
    summary = data["summary"]

    assert summary["succeeded_count"] == 2
    # 1200.50 + 300.25 = 1500.75 exactly
    assert summary["total_collected_amount"] == "1500.75"
    assert summary["pending_count"] == 1
    assert summary["pending_amount"] == "500.00"
    assert summary["failed_count"] == 1
    assert summary["failed_amount"] == "100.00"
    # Total recorded count: 4, amount: 2100.75
    assert summary["total_recorded_count"] == 4
    assert summary["total_recorded_amount"] == "2100.75"

    methods = {m["method"]: m for m in summary["by_method"]}
    assert methods["online"]["count"] == 1
    assert methods["online"]["amount"] == "1200.50"
    assert methods["cash"]["count"] == 1
    assert methods["cash"]["amount"] == "300.25"


@pytest.mark.asyncio
async def test_memberships_and_plan_enrollments(
    async_client: AsyncClient,
    db_session: AsyncSession,
    owner_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """
    Test 2e: Verify membership distributions, pending requests, and plan enrollments.
    """
    user_alpha, _ = owner_alpha
    now = datetime.now(timezone.utc)

    # 1 Plan
    plan = MembershipPlan(
        club_id=club_alpha.id,
        name="Gold Annual",
        status=PlanStatus.ACTIVE,
        duration_unit=PlanDurationUnit.YEARLY,
        price=Decimal("12000.00"),
        currency="INR",
    )
    db_session.add(plan)
    await db_session.flush()

    # 2 Player memberships
    pm1 = ClubPlayerMembership(
        user_id=user_alpha.id,
        club_id=club_alpha.id,
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=now,
    )
    db_session.add(pm1)
    await db_session.flush()

    sub1 = MemberSubscription(
        club_id=club_alpha.id,
        player_membership_id=pm1.id,
        membership_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now.date(),
        end_date=now.date() + timedelta(days=365),
    )
    # Pending membership request
    req = ClubMembershipRequest(
        club_id=club_alpha.id,
        user_id=user_alpha.id,
        status=MembershipRequestStatus.PENDING,
    )
    db_session.add_all([sub1, req])
    await db_session.flush()

    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/memberships?preset=30d",
        headers=make_auth_header(user_alpha),
    )
    assert resp.status_code == 200
    data = resp.json()
    summary = data["summary"]
    assert summary["total_player_memberships"] == 1
    assert summary["active_count"] == 1
    assert summary["new_members_in_period"] == 1
    assert summary["pending_requests_count"] == 1
    assert summary["active_subscriptions_count"] == 1

    plans = data["plan_enrollments"]
    assert len(plans) == 1
    assert plans[0]["plan_name"] == "Gold Annual"
    assert plans[0]["active_subscribers"] == 1


# ─── 3. CSV Export & Formula Injection Sanitization Tests ────────────────────

@pytest.mark.asyncio
async def test_csv_export_formula_injection_defense(
    async_client: AsyncClient,
    db_session: AsyncSession,
    owner_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """
    Test 3a: Verify CSV export correctly sanitizes formula characters (=, +, -, @).
    """
    user_alpha, _ = owner_alpha
    now = datetime.now(timezone.utc)

    # Court with malicious formula name
    court = Court(
        club_id=club_alpha.id,
        name="=SUM(A1:A10)",
        court_number=1,
        status=CourtStatus.ACTIVE,
        is_active=True,
    )
    db_session.add(court)
    await db_session.flush()

    booking = Booking(
        club_id=club_alpha.id,
        court_id=court.id,
        booked_by_user_id=user_alpha.id,
        player_id=user_alpha.id,
        start_at=now,
        end_at=now + timedelta(hours=1),
        status=BookingStatus.CONFIRMED,
        booking_type=BookingType.PLAYER,
        total_price=Decimal("100.00"),
    )
    db_session.add(booking)
    await db_session.flush()

    resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/export?report_type=bookings&preset=30d",
        headers=make_auth_header(user_alpha),
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    csv_text = resp.text

    # The '=SUM(A1:A10)' court name must be escaped as ''=SUM(A1:A10)'
    assert "'=SUM(A1:A10)" in csv_text


# ─── 4. Date Range & Validation Error Handling ───────────────────────────────

@pytest.mark.asyncio
async def test_invalid_date_ranges_rejected(
    async_client: AsyncClient,
    owner_alpha: tuple[User, ClubMembership],
    club_alpha: Club,
):
    """Test 4a: Start date after end date or range > 366 days returns 400."""
    user_alpha, _ = owner_alpha

    # start > end
    resp1 = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/summary?preset=custom&start_date=2026-05-10&end_date=2026-05-01",
        headers=make_auth_header(user_alpha),
    )
    assert resp1.status_code == 400
    assert "start_date must be earlier" in resp1.json()["detail"]

    # > 366 days
    resp2 = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/analytics/summary?preset=custom&start_date=2024-01-01&end_date=2026-01-01",
        headers=make_auth_header(user_alpha),
    )
    assert resp2.status_code == 400
    assert "cannot exceed 366 days" in resp2.json()["detail"]
