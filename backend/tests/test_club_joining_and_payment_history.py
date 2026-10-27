"""
Aught2 Pickleball — Club Joining, Membership Upgrade, and Multi-Service Payment Ledger Tests

Validates:
  1. Option A: Free club join creates active ClubPlayerMembership without any payment record.
  2. Club allows_free_join=False prevents free join.
  3. Option B: Choosing a membership plan directly creates subscription and payment record.
  4. Free member upgrading to paid membership later links to existing ClubPlayerMembership without duplicate error.
  5. Court booking creates COURT_BOOKING payment; cancellation refunds payment.
  6. Tournament registration creates TOURNAMENT payment.
  7. Event registration creates EVENT payment; cancellation refunds payment.
  8. Lesson registration creates LESSON payment; cancellation refunds payment.
  9. League team registration creates LEAGUE payment; league cancellation refunds payment.
  10. Club Owner payments summary metrics (net collected, refunds) and staff refund endpoint.
  11. Tenant isolation: Staff can only access their club's payments; Player can only access their own payments.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.lesson import Coach, Lesson, LessonStatus, LessonType
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
)
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_alpha(db_session: AsyncSession) -> Club:
    c = Club(
        name="Pickle Club Alpha",
        slug=f"club-alpha-{uuid.uuid4().hex[:6]}",
        allows_free_join=True,
        is_active=True,
        opening_time=time(6, 0),
        closing_time=time(22, 0),
        timezone="UTC",
    )
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def club_beta(db_session: AsyncSession) -> Club:
    c = Club(
        name="Pickle Club Beta",
        slug=f"club-beta-{uuid.uuid4().hex[:6]}",
        allows_free_join=False,
        is_active=True,
        opening_time=time(6, 0),
        closing_time=time(22, 0),
        timezone="UTC",
    )
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def owner_alpha(db_session: AsyncSession, club_alpha: Club) -> User:
    u = User(
        email=f"alpha-owner-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass1234!"),
        full_name="Alpha Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(
        club_id=club_alpha.id,
        user_id=u.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def owner_beta(db_session: AsyncSession, club_beta: Club) -> User:
    u = User(
        email=f"beta-owner-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass1234!"),
        full_name="Beta Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(
        club_id=club_beta.id,
        user_id=u.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_one(db_session: AsyncSession) -> User:
    u = User(
        email=f"player-one-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass1234!"),
        full_name="Player One",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    prof = PlayerProfile(user_id=u.id, display_name="Player One")
    db_session.add(prof)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_two(db_session: AsyncSession) -> User:
    u = User(
        email=f"player-two-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass1234!"),
        full_name="Player Two",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    prof = PlayerProfile(user_id=u.id, display_name="Player Two")
    db_session.add(prof)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def alpha_court(db_session: AsyncSession, club_alpha: Club) -> Court:
    court = Court(
        club_id=club_alpha.id,
        name="Court 1",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        surface_type="Acrylic",
        is_active=True,
        status=CourtStatus.ACTIVE,
        price_per_hour=Decimal("500.00"),
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest_asyncio.fixture
async def alpha_paid_plan(db_session: AsyncSession, club_alpha: Club) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_alpha.id,
        name="Alpha Gold VIP",
        description="Premium access to all club courts and perks",
        price=Decimal("1500.00"),
        duration_unit=PlanDurationUnit.MONTHLY,
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


# ─── Tests ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_option_a_free_join_creates_membership_no_payment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    player_one: User,
):
    """
    Option A: When player joins club for free:
    - Active ClubPlayerMembership is created.
    - Club member count updates.
    - Zero payment records are created.
    """
    headers = make_auth_header(player_one)
    resp = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/join",
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["club_id"] == str(club_alpha.id)
    assert data["status"] == "active"

    # Verify ClubPlayerMembership in DB
    stmt = select(ClubPlayerMembership).where(
        ClubPlayerMembership.user_id == player_one.id,
        ClubPlayerMembership.club_id == club_alpha.id,
    )
    cpm = (await db_session.execute(stmt)).scalar_one_or_none()
    assert cpm is not None
    assert cpm.status == PlayerMembershipStatus.ACTIVE

    # Verify no payment record was created
    pay_stmt = select(Payment).where(Payment.player_id == player_one.id)
    payments = (await db_session.execute(pay_stmt)).scalars().all()
    assert len(payments) == 0

    # Verify player's payments API returns empty list
    my_payments_resp = await async_client.get("/api/v1/payments", headers=headers)
    assert my_payments_resp.status_code == 200
    assert len(my_payments_resp.json()) == 0


@pytest.mark.asyncio
async def test_free_join_fails_when_club_disallows(
    async_client: AsyncClient,
    club_beta: Club,
    player_one: User,
):
    """
    When a club has allows_free_join = False, player free join returns 400.
    """
    headers = make_auth_header(player_one)
    resp = await async_client.post(
        f"/api/v1/player/clubs/{club_beta.id}/join",
        headers=headers,
    )
    assert resp.status_code == 400
    assert "does not permit free joining" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_option_b_choose_membership_creates_subscription_and_payment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    player_one: User,
    alpha_paid_plan: MembershipPlan,
):
    """
    Option B: When player selects a paid plan:
    - MemberSubscription created and payment record created with purpose=MEMBERSHIP.
    """
    headers = make_auth_header(player_one)
    resp = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/subscribe",
        headers=headers,
        json={
            "plan_id": str(alpha_paid_plan.id),
            "payment_method": "online",
        },
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["membership_plan_id"] == str(alpha_paid_plan.id)
    assert data["status"] in ("scheduled", "active", "pending_payment")

    # Verify payment record was created
    pay_stmt = select(Payment).where(
        Payment.player_id == player_one.id,
        Payment.club_id == club_alpha.id,
    )
    payment = (await db_session.execute(pay_stmt)).scalar_one_or_none()
    assert payment is not None
    assert payment.purpose == PaymentPurpose.MEMBERSHIP
    assert payment.amount == Decimal("1500.00")
    assert payment.subscription_id is not None


@pytest.mark.asyncio
async def test_free_member_upgrade_later_avoids_duplicate_membership(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    player_one: User,
    alpha_paid_plan: MembershipPlan,
):
    """
    A player who first joined for free can later purchase a paid membership plan.
    This must associate the new subscription with the existing ClubPlayerMembership
    without triggering a duplicate key error on (user_id, club_id).
    """
    headers = make_auth_header(player_one)

    # 1. Join for free first
    free_join = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/join",
        headers=headers,
    )
    assert free_join.status_code == 201

    # 2. Purchase membership plan later
    sub_resp = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/subscribe",
        headers=headers,
        json={
            "plan_id": str(alpha_paid_plan.id),
            "payment_method": "online",
        },
    )
    assert sub_resp.status_code == 201, sub_resp.text

    # Verify exactly one ClubPlayerMembership exists
    cpm_stmt = select(ClubPlayerMembership).where(
        ClubPlayerMembership.user_id == player_one.id,
        ClubPlayerMembership.club_id == club_alpha.id,
    )
    cpms = (await db_session.execute(cpm_stmt)).scalars().all()
    assert len(cpms) == 1


@pytest.mark.asyncio
async def test_court_booking_payment_and_cancellation_refund(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    player_one: User,
    alpha_court: Court,
):
    """
    Creating a paid booking records a COURT_BOOKING payment.
    Cancelling the booking marks the payment as REFUNDED.
    """
    headers = make_auth_header(player_one)

    # 1. Player joins club first
    await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/join",
        headers=headers,
    )

    # Target slot: 2 days in the future, 10:00 to 11:00 UTC (within club hours 06:00-22:00)
    target_dt = (datetime.now(timezone.utc) + timedelta(days=2)).replace(
        hour=10, minute=0, second=0, microsecond=0
    )
    end_dt = target_dt + timedelta(hours=1)

    # Create paid court booking
    resp = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/bookings",
        headers=headers,
        json={
            "court_id": str(alpha_court.id),
            "start_at": target_dt.isoformat(),
            "end_at": end_dt.isoformat(),
            "notes": "Morning Singles",
        },
    )
    assert resp.status_code == 201, resp.text
    booking_data = resp.json()
    booking_id = booking_data["id"]

    # Verify payment record in DB
    pay_stmt = select(Payment).where(Payment.booking_id == uuid.UUID(booking_id))
    payment = (await db_session.execute(pay_stmt)).scalar_one_or_none()
    assert payment is not None
    assert payment.purpose == PaymentPurpose.COURT_BOOKING
    assert payment.amount == Decimal("500.00")
    assert payment.status == PaymentStatus.SUCCEEDED

    # Cancel booking
    cancel_resp = await async_client.post(
        f"/api/v1/bookings/{booking_id}/cancel",
        headers=headers,
    )
    assert cancel_resp.status_code == 200

    # Verify payment is refunded
    await db_session.refresh(payment)
    assert payment.status == PaymentStatus.REFUNDED
    assert payment.refunded_amount == Decimal("500.00")
    assert payment.refunded_at is not None


@pytest.mark.asyncio
async def test_tournament_registration_payment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    player_one: User,
):
    """
    Paid tournament registration creates a TOURNAMENT payment record.
    """
    headers = make_auth_header(player_one)
    await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/join",
        headers=headers,
    )

    now = datetime.now(timezone.utc)
    tourn = Tournament(
        club_id=club_alpha.id,
        name="Alpha Open Championship",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=5),
        format_configuration={"category": "Singles", "registration_fee": 800.0, "team_size": 1},
        min_participants=2,
        max_participants=16,
    )
    db_session.add(tourn)
    await db_session.flush()

    resp = await async_client.post(
        f"/api/v1/tournaments/{tourn.id}/register",
        headers=headers,
        json={"partner_id": None},
    )
    assert resp.status_code in (200, 201), resp.text

    # Verify TOURNAMENT payment record
    pay_stmt = select(Payment).where(
        Payment.tournament_id == tourn.id,
        Payment.player_id == player_one.id,
    )
    payment = (await db_session.execute(pay_stmt)).scalar_one_or_none()
    assert payment is not None
    assert payment.purpose == PaymentPurpose.TOURNAMENT
    assert payment.amount == Decimal("800.00")
    assert payment.status == PaymentStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_event_registration_payment_and_cancellation_refund(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    player_one: User,
):
    """
    Paid event registration creates an EVENT payment.
    Cancelling the registration marks the payment as REFUNDED.
    """
    now = datetime.now(timezone.utc)
    event = Event(
        club_id=club_alpha.id,
        title="Pickle Clinic & Social",
        event_type=EventType.CLINIC,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=5),
        end_at=now + timedelta(days=5, hours=2),
        registration_fee=Decimal("600.00"),
        capacity=20,
        registration_required=True,
    )
    db_session.add(event)
    await db_session.flush()

    headers = make_auth_header(player_one)
    reg_resp = await async_client.post(
        f"/api/v1/players/me/events/{event.id}/register",
        headers=headers,
    )
    assert reg_resp.status_code in (200, 201), reg_resp.text

    # Verify EVENT payment
    pay_stmt = select(Payment).where(
        Payment.event_id == event.id,
        Payment.player_id == player_one.id,
    )
    payment = (await db_session.execute(pay_stmt)).scalar_one_or_none()
    assert payment is not None
    assert payment.purpose == PaymentPurpose.EVENT
    assert payment.amount == Decimal("600.00")
    assert payment.status == PaymentStatus.SUCCEEDED

    # Cancel event registration
    cancel_resp = await async_client.post(
        f"/api/v1/players/me/events/{event.id}/cancel",
        headers=headers,
    )
    assert cancel_resp.status_code in (200, 204), cancel_resp.text

    # Verify refunded
    await db_session.refresh(payment)
    assert payment.status == PaymentStatus.REFUNDED
    assert payment.refunded_amount == Decimal("600.00")


@pytest.mark.asyncio
async def test_lesson_registration_payment_and_refund(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    owner_alpha: User,
    player_one: User,
):
    """
    Paid lesson registration creates a LESSON payment.
    Cancelling registration marks the payment as REFUNDED.
    """
    headers = make_auth_header(player_one)
    await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/join",
        headers=headers,
    )

    # Create coach & lesson type
    coach = Coach(
        club_id=club_alpha.id,
        user_id=owner_alpha.id,
        name="Alpha Coach",
    )
    db_session.add(coach)
    await db_session.flush()

    lt = LessonType(
        club_id=club_alpha.id,
        name="Clinic Masterclass",
        default_price=Decimal("450.00"),
        duration_minutes=60,
        default_capacity=8,
    )
    db_session.add(lt)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    lesson = Lesson(
        club_id=club_alpha.id,
        coach_id=coach.id,
        lesson_type_id=lt.id,
        title="Backhand Clinic",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=4),
        end_at=now + timedelta(days=4, hours=1),
        capacity=8,
        price=Decimal("450.00"),
    )
    db_session.add(lesson)
    await db_session.flush()

    reg_resp = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson.id}/register",
        headers=headers,
    )
    assert reg_resp.status_code in (200, 201), reg_resp.text

    # Verify LESSON payment
    pay_stmt = select(Payment).where(
        Payment.lesson_id == lesson.id,
        Payment.player_id == player_one.id,
    )
    payment = (await db_session.execute(pay_stmt)).scalar_one_or_none()
    assert payment is not None
    assert payment.purpose == PaymentPurpose.LESSON
    assert payment.amount == Decimal("450.00")
    assert payment.status == PaymentStatus.SUCCEEDED

    # Cancel lesson registration
    cancel_resp = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson.id}/cancel",
        headers=headers,
    )
    assert cancel_resp.status_code == 200

    # Verify refunded
    await db_session.refresh(payment)
    assert payment.status == PaymentStatus.REFUNDED
    assert payment.refunded_amount == Decimal("450.00")


@pytest.mark.asyncio
async def test_league_team_registration_payment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    owner_alpha: User,
    player_one: User,
):
    """
    Paid league team registration creates a LEAGUE payment.
    Cancelling the league by staff refunds the payment.
    """
    # 1. Join club first so player is a member
    headers = make_auth_header(player_one)
    await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/join",
        headers=headers,
    )

    now = datetime.now(timezone.utc)
    league = League(
        club_id=club_alpha.id,
        name="Winter Premier League",
        status=LeagueStatus.REGISTRATION_OPEN,
        registration_open_at=now - timedelta(days=1),
        number_of_weeks=4,
        registration_fee=Decimal("1200.00"),
        max_teams=12,
    )
    db_session.add(league)
    await db_session.flush()

    reg_resp = await async_client.post(
        f"/api/v1/leagues/{league.id}/register",
        headers=headers,
        json={"team_name": "Thunder Smashers", "partner_name": "Partner Player"},
    )
    assert reg_resp.status_code in (200, 201), reg_resp.text

    # Verify LEAGUE payment
    pay_stmt = select(Payment).where(
        Payment.league_id == league.id,
        Payment.player_id == player_one.id,
    )
    payment = (await db_session.execute(pay_stmt)).scalar_one_or_none()
    assert payment is not None
    assert payment.purpose == PaymentPurpose.LEAGUE
    assert payment.amount == Decimal("1200.00")
    assert payment.status == PaymentStatus.SUCCEEDED

    # Staff cancels league
    staff_headers = make_auth_header(owner_alpha)
    cancel_resp = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/leagues/{league.id}/cancel",
        headers=staff_headers,
    )
    assert cancel_resp.status_code == 200

    # Verify refunded
    await db_session.refresh(payment)
    assert payment.status == PaymentStatus.REFUNDED
    assert payment.refunded_amount == Decimal("1200.00")


@pytest.mark.asyncio
async def test_club_payments_summary_and_staff_refund(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    owner_alpha: User,
    player_one: User,
):
    """
    Test Club Owner summary calculations (accounting for refunds) and staff refund endpoint:
    - Net collected = gross collected - total refunded
    - Staff refund transitions payment to REFUNDED and recalculates summary
    """
    # Create two succeeded payments
    p1 = Payment(
        club_id=club_alpha.id,
        player_id=player_one.id,
        amount=Decimal("1000.00"),
        currency="INR",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.ONLINE,
        reference="REF-001",
    )
    p2 = Payment(
        club_id=club_alpha.id,
        player_id=player_one.id,
        amount=Decimal("500.00"),
        currency="INR",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.COURT_BOOKING,
        payment_method=PaymentMethod.ONLINE,
        reference="REF-002",
    )
    db_session.add_all([p1, p2])
    await db_session.flush()

    staff_headers = make_auth_header(owner_alpha)

    # 1. Check summary before refund
    sum_resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/payments/summary",
        headers=staff_headers,
    )
    assert sum_resp.status_code == 200, sum_resp.text
    sum_data = sum_resp.json()
    assert float(sum_data["total_amount_collected"]) == 1500.0
    assert float(sum_data["net_collected"]) == 1500.0
    assert sum_data["refunded_count"] == 0
    assert float(sum_data["total_refunded_amount"]) == 0.0

    # 2. Staff refunds p2
    ref_resp = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/payments/{p2.id}/refund",
        headers=staff_headers,
        json={
            "amount": 500.0,
            "refund_reason": "Customer requested cancellation per club policy",
        },
    )
    assert ref_resp.status_code == 200, ref_resp.text
    ref_data = ref_resp.json()
    assert ref_data["status"] == "refunded"
    assert float(ref_data["refunded_amount"]) == 500.0
    assert ref_data["refund_reason"] == "Customer requested cancellation per club policy"

    # 3. Check summary after refund
    sum_resp2 = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/payments/summary",
        headers=staff_headers,
    )
    assert sum_resp2.status_code == 200
    sum_data2 = sum_resp2.json()
    assert float(sum_data2["total_amount_collected"]) == 1500.0  # Gross settled amount
    assert float(sum_data2["net_collected"]) == 1000.0  # Net collected after $500 refund
    assert sum_data2["refunded_count"] == 1
    assert float(sum_data2["total_refunded_amount"]) == 500.0


@pytest.mark.asyncio
async def test_tenant_isolation_payments(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
    owner_alpha: User,
    owner_beta: User,
    player_one: User,
    player_two: User,
):
    """
    Test strict tenant isolation:
    - Club Alpha staff cannot see Club Beta's payments.
    - Player One only sees their own payments, never Player Two's payments.
    """
    # Payment in Club Alpha for Player One
    p_alpha = Payment(
        club_id=club_alpha.id,
        player_id=player_one.id,
        amount=Decimal("500.00"),
        currency="INR",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.COURT_BOOKING,
        payment_method=PaymentMethod.ONLINE,
        reference="REF-ALPHA",
    )
    # Payment in Club Beta for Player Two
    p_beta = Payment(
        club_id=club_beta.id,
        player_id=player_two.id,
        amount=Decimal("700.00"),
        currency="INR",
        status=PaymentStatus.SUCCEEDED,
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.ONLINE,
        reference="REF-BETA",
    )
    db_session.add_all([p_alpha, p_beta])
    await db_session.flush()

    # 1. Alpha staff list payments: only sees p_alpha
    alpha_resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/payments",
        headers=make_auth_header(owner_alpha),
    )
    assert alpha_resp.status_code == 200
    alpha_refs = [p["reference"] for p in alpha_resp.json()]
    assert "REF-ALPHA" in alpha_refs
    assert "REF-BETA" not in alpha_refs

    # 2. Beta staff cannot access Alpha club payments (403 forbidden)
    forbidden_resp = await async_client.get(
        f"/api/v1/clubs/{club_alpha.id}/payments",
        headers=make_auth_header(owner_beta),
    )
    assert forbidden_resp.status_code == 403

    # 3. Player One only sees REF-ALPHA
    p1_resp = await async_client.get(
        "/api/v1/payments",
        headers=make_auth_header(player_one),
    )
    assert p1_resp.status_code == 200
    p1_refs = [p["reference"] for p in p1_resp.json()]
    assert "REF-ALPHA" in p1_refs
    assert "REF-BETA" not in p1_refs

    # 4. Player Two only sees REF-BETA
    p2_resp = await async_client.get(
        "/api/v1/payments",
        headers=make_auth_header(player_two),
    )
    assert p2_resp.status_code == 200
    p2_refs = [p["reference"] for p in p2_resp.json()]
    assert "REF-BETA" in p2_refs
    assert "REF-ALPHA" not in p2_refs
