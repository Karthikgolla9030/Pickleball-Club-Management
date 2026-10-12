"""
Aught2 Pickleball — Phase 5 Multi-Club Membership, Subscription & Payment Integration Tests

Covers:
  1. Multi-club player membership lifecycle (belong to multiple clubs, request, approve, reject, isolate)
  2. Plan ownership validation and historical price snapshot immutability
  3. Subscription enrollment lifecycle (free immediate activation vs paid pending payment)
  4. Duplicate active subscription prevention
  5. Payment status transitions and automatic subscription activation on payment success
  6. Player renewal preserving historical records
  7. Access control & tenant isolation (staff permissions, player own payments only)
  8. Booking & competition eligibility integration
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
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_alpha(db_session: AsyncSession) -> Club:
    club = Club(name="Club Alpha", slug=f"club-alpha-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_beta(db_session: AsyncSession) -> Club:
    club = Club(name="Club Beta", slug=f"club-beta-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def staff_alpha(db_session: AsyncSession, club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"alpha-staff-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Alpha Staff",
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
async def staff_beta(db_session: AsyncSession, club_beta: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"beta-staff-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Beta Staff",
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
async def td_alpha(db_session: AsyncSession, club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"td-alpha-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="TD Alpha",
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
async def player_one(db_session: AsyncSession) -> User:
    u = User(
        email=f"player-one-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Player One",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_two(db_session: AsyncSession) -> User:
    u = User(
        email=f"player-two-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Player Two",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def paid_plan_alpha(db_session: AsyncSession, club_alpha: Club) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_alpha.id,
        name="Alpha Pro Monthly",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=Decimal("1200.00"),
        currency="INR",
        booking_limit=4,
        advance_booking_days=14,
        benefits=["Unlimited court booking", "Free tournament entry"],
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


@pytest_asyncio.fixture
async def free_plan_alpha(db_session: AsyncSession, club_alpha: Club) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_alpha.id,
        name="Alpha Community Free",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=Decimal("0.00"),
        currency="INR",
        booking_limit=2,
        advance_booking_days=7,
        benefits=["Community play"],
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


@pytest_asyncio.fixture
async def plan_beta(db_session: AsyncSession, club_beta: Club) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_beta.id,
        name="Beta Premium Annual",
        duration_unit=PlanDurationUnit.ANNUAL,
        price=Decimal("9999.00"),
        currency="INR",
        booking_limit=5,
        advance_booking_days=30,
        benefits=["VIP Lounge", "Peak booking"],
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


# ─── 1. Multi-Club Player Membership Lifecycle ────────────────────────────────

@pytest.mark.asyncio
async def test_player_can_belong_to_multiple_clubs_independently(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
    player_one: User,
):
    """Player can hold separate, active memberships at Club Alpha and Club Beta simultaneously."""
    mem_alpha = ClubPlayerMembership(
        club_id=club_alpha.id,
        user_id=player_one.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    mem_beta = ClubPlayerMembership(
        club_id=club_beta.id,
        user_id=player_one.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add_all([mem_alpha, mem_beta])
    await db_session.flush()

    headers = make_auth_header(player_one)
    resp = await async_client.get("/api/v1/player/clubs", headers=headers)
    assert resp.status_code == 200
    clubs = resp.json()
    assert len(clubs) == 2
    club_ids = {c["club_id"] for c in clubs}
    assert str(club_alpha.id) in club_ids
    assert str(club_beta.id) in club_ids

    # Changing status in Alpha to suspended does NOT affect Beta
    mem_alpha.status = PlayerMembershipStatus.SUSPENDED
    await db_session.flush()

    resp2 = await async_client.get("/api/v1/player/clubs", headers=headers)
    assert resp2.status_code == 200
    clubs2 = {c["club_id"]: c["status"] for c in resp2.json()}
    assert clubs2[str(club_alpha.id)] == "suspended"
    assert clubs2[str(club_beta.id)] == "active"


@pytest.mark.asyncio
async def test_membership_request_approval_and_rejection_lifecycle(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
    staff_alpha: tuple[User, ClubMembership],
    staff_beta: tuple[User, ClubMembership],
    player_one: User,
):
    """Player requests membership: approval creates active player-club membership; rejection does not."""
    player_headers = make_auth_header(player_one)
    alpha_headers = make_auth_header(staff_alpha[0])
    beta_headers = make_auth_header(staff_beta[0])

    # 1. Request Alpha
    r_alpha = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/membership-requests",
        headers=player_headers,
        json={"message": "I want to join Alpha"},
    )
    assert r_alpha.status_code == 201
    req_alpha_id = r_alpha.json()["id"]

    # Prevent duplicate pending request
    dup = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/membership-requests",
        headers=player_headers,
        json={"message": "Duplicate request"},
    )
    assert dup.status_code in (400, 409)

    # 2. Staff Alpha approves request
    appr = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/membership-requests/{req_alpha_id}/approve",
        headers=alpha_headers,
        json={"notes": "Welcome to Alpha!"},
    )
    assert appr.status_code == 200
    assert appr.json()["status"] == "approved"

    # Verify player now has active membership at Alpha
    clubs_res = await async_client.get("/api/v1/player/clubs", headers=player_headers)
    assert clubs_res.status_code == 200
    assert any(c["club_id"] == str(club_alpha.id) and c["status"] == "active" for c in clubs_res.json())

    # 3. Request Beta and Staff Beta rejects
    r_beta = await async_client.post(
        f"/api/v1/player/clubs/{club_beta.id}/membership-requests",
        headers=player_headers,
        json={"message": "Can I join Beta?"},
    )
    assert r_beta.status_code == 201
    req_beta_id = r_beta.json()["id"]

    rej = await async_client.post(
        f"/api/v1/clubs/{club_beta.id}/membership-requests/{req_beta_id}/reject",
        headers=beta_headers,
        json={"reason": "Capacity full"},
    )
    assert rej.status_code == 200
    assert rej.json()["status"] == "rejected"

    # Verify Beta does NOT have an active membership for player
    clubs_res2 = await async_client.get("/api/v1/player/clubs", headers=player_headers)
    assert clubs_res2.status_code == 200
    assert not any(c["club_id"] == str(club_beta.id) and c["status"] == "active" for c in clubs_res2.json())


# ─── 2. Membership Plan Ownership & Historical Price Immutability ────────────

@pytest.mark.asyncio
async def test_plan_ownership_and_cross_club_isolation(
    async_client: AsyncClient,
    club_alpha: Club,
    club_beta: Club,
    staff_alpha: tuple[User, ClubMembership],
    paid_plan_alpha: MembershipPlan,
    player_one: User,
    db_session: AsyncSession,
):
    """Plan belonging to Club Alpha cannot be enrolled under Club Beta."""
    # Enroll player as active in both clubs
    db_session.add_all([
        ClubPlayerMembership(club_id=club_alpha.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE),
        ClubPlayerMembership(club_id=club_beta.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE),
    ])
    await db_session.flush()

    headers = make_auth_header(player_one)
    # Attempt to enroll in Club Beta using Club Alpha's plan_id
    resp = await async_client.post(
        f"/api/v1/player/clubs/{club_beta.id}/subscribe",
        headers=headers,
        json={"plan_id": str(paid_plan_alpha.id), "payment_method": "upi"},
    )
    assert resp.status_code in (400, 404)


@pytest.mark.asyncio
async def test_plan_price_edit_does_not_alter_historical_subscription_amount(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    staff_alpha: tuple[User, ClubMembership],
    paid_plan_alpha: MembershipPlan,
    player_one: User,
):
    """Editing plan price preserves historical subscription snapshots."""
    # Active membership
    db_session.add(ClubPlayerMembership(club_id=club_alpha.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE))
    await db_session.flush()

    headers = make_auth_header(player_one)
    sub_res = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/subscribe",
        headers=headers,
        json={"plan_id": str(paid_plan_alpha.id), "payment_method": "card"},
    )
    assert sub_res.status_code == 201
    sub_data = sub_res.json()
    assert Decimal(str(sub_data["plan_price"])) == Decimal("1200.00")
    sub_id = sub_data["id"]

    # Staff updates plan price to 1800.00
    staff_headers = make_auth_header(staff_alpha[0])
    upd_res = await async_client.patch(
        f"/api/v1/clubs/{club_alpha.id}/membership-plans/{paid_plan_alpha.id}",
        headers=staff_headers,
        json={"price": 1800.00},
    )
    assert upd_res.status_code == 200

    # Historical subscription must still retain 1200.00
    check_sub = await async_client.get("/api/v1/player/memberships", headers=headers)
    assert check_sub.status_code == 200
    user_subs = check_sub.json()
    historical = next(s for s in user_subs if s["id"] == sub_id)
    assert Decimal(str(historical["price"])) == Decimal("1200.00")


# ─── 3. Subscription Enrollment & Lifecycle (Free vs Paid) ───────────────────

@pytest.mark.asyncio
async def test_free_plan_immediate_activation(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    free_plan_alpha: MembershipPlan,
    player_one: User,
):
    """Free plan (price=0) is immediately activated upon enrollment."""
    db_session.add(ClubPlayerMembership(club_id=club_alpha.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE))
    await db_session.flush()

    headers = make_auth_header(player_one)
    res = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/subscribe",
        headers=headers,
        json={"plan_id": str(free_plan_alpha.id)},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "active"
    assert data["effective_status"] == "active"
    assert Decimal(str(data["plan_price"])) == Decimal("0.00")
    assert data["payment_status"] == "succeeded"


@pytest.mark.asyncio
async def test_paid_plan_scheduled_until_payment_succeeds(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    paid_plan_alpha: MembershipPlan,
    staff_alpha: tuple[User, ClubMembership],
    player_one: User,
):
    """Paid plan creates SCHEDULED subscription with PENDING payment; activates when payment succeeds."""
    db_session.add(ClubPlayerMembership(club_id=club_alpha.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE))
    await db_session.flush()

    player_headers = make_auth_header(player_one)
    res = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/subscribe",
        headers=player_headers,
        json={"plan_id": str(paid_plan_alpha.id), "payment_method": "upi"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "scheduled"
    assert data["effective_status"] == "scheduled"
    assert data["payment_status"] == "pending"
    assert data["payment_id"] is not None
    payment_id = data["payment_id"]
    sub_id = data["id"]

    # Staff marks payment as succeeded
    staff_headers = make_auth_header(staff_alpha[0])
    succeed_res = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/payments/{payment_id}/succeed",
        headers=staff_headers,
        json={"payment_method": "upi", "notes": "UPI transaction verified"},
    )
    assert succeed_res.status_code == 200
    assert succeed_res.json()["status"] == "succeeded"

    # Subscription must now be ACTIVE
    subs_res = await async_client.get("/api/v1/player/memberships", headers=player_headers)
    assert subs_res.status_code == 200
    active_sub = next(s for s in subs_res.json() if s["id"] == sub_id)
    assert active_sub["status"] == "active"
    assert active_sub["effective_status"] == "active"
    assert active_sub["payment_status"] == "succeeded"


@pytest.mark.asyncio
async def test_duplicate_active_subscription_prevention(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    free_plan_alpha: MembershipPlan,
    paid_plan_alpha: MembershipPlan,
    player_one: User,
):
    """Player cannot enroll in another active subscription while one is active for the same club."""
    db_session.add(ClubPlayerMembership(club_id=club_alpha.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE))
    await db_session.flush()

    headers = make_auth_header(player_one)
    # First enrollment (free -> active)
    r1 = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/subscribe",
        headers=headers,
        json={"plan_id": str(free_plan_alpha.id)},
    )
    assert r1.status_code == 201

    # Second enrollment attempt for the same club while active
    r2 = await async_client.post(
        f"/api/v1/player/clubs/{club_alpha.id}/subscribe",
        headers=headers,
        json={"plan_id": str(paid_plan_alpha.id)},
    )
    assert r2.status_code == 409


# ─── 4. Player Self-Renewal & Historical Record Preservation ──────────────────

@pytest.mark.asyncio
async def test_player_renewal_preserves_history_and_sets_consecutive_dates(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    paid_plan_alpha: MembershipPlan,
    staff_alpha: tuple[User, ClubMembership],
    player_one: User,
):
    """Renewal preserves old subscription and creates a consecutive cycle."""
    pm = ClubPlayerMembership(club_id=club_alpha.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE)
    db_session.add(pm)
    await db_session.flush()

    # Create active subscription expiring soon
    today = date.today()
    old_sub = MemberSubscription(
        club_id=club_alpha.id,
        player_membership_id=pm.id,
        membership_plan_id=paid_plan_alpha.id,
        start_date=today - timedelta(days=25),
        end_date=today + timedelta(days=5),
        status=SubscriptionStatus.ACTIVE,
        auto_renew=False,
    )
    db_session.add(old_sub)
    await db_session.flush()

    headers = make_auth_header(player_one)
    renew_res = await async_client.post(
        f"/api/v1/player/memberships/{old_sub.id}/renew",
        headers=headers,
    )
    assert renew_res.status_code in (200, 201)
    new_sub_data = renew_res.json()
    assert new_sub_data["id"] != str(old_sub.id)
    assert new_sub_data["start_date"] == (today + timedelta(days=6)).isoformat()

    # Verify both records exist in player's memberships
    all_subs = await async_client.get("/api/v1/player/memberships", headers=headers)
    assert all_subs.status_code == 200
    sub_ids = {s["id"] for s in all_subs.json()}
    assert str(old_sub.id) in sub_ids
    assert new_sub_data["id"] in sub_ids


# ─── 5. Security, Permissions & Tenant Isolation ─────────────────────────────

@pytest.mark.asyncio
async def test_player_can_only_view_own_payments(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    player_one: User,
    player_two: User,
):
    """Player A cannot see Player B's payments."""
    pay1 = Payment(
        club_id=club_alpha.id,
        player_id=player_one.id,
        amount=Decimal("500.00"),
        currency="INR",
        reference=f"PAY-{uuid.uuid4().hex[:10]}",
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.CASH,
        status=PaymentStatus.SUCCEEDED,
    )
    pay2 = Payment(
        club_id=club_alpha.id,
        player_id=player_two.id,
        amount=Decimal("1500.00"),
        currency="INR",
        reference=f"PAY-{uuid.uuid4().hex[:10]}",
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.CASH,
        status=PaymentStatus.SUCCEEDED,
    )
    db_session.add_all([pay1, pay2])
    await db_session.flush()

    headers = make_auth_header(player_one)
    resp = await async_client.get("/api/v1/player/payments", headers=headers)
    assert resp.status_code == 200
    items = resp.json()
    references = {p["reference"] for p in items}
    assert pay1.reference in references
    assert pay2.reference not in references


@pytest.mark.asyncio
async def test_staff_cannot_manage_payments_of_another_club(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
    staff_alpha: tuple[User, ClubMembership],
    player_one: User,
):
    """Staff of Alpha cannot succeed or view payments belonging to Beta."""
    pay_beta = Payment(
        club_id=club_beta.id,
        player_id=player_one.id,
        amount=Decimal("2000.00"),
        currency="INR",
        reference=f"PAY-{uuid.uuid4().hex[:10]}",
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.CASH,
        status=PaymentStatus.PENDING,
    )
    db_session.add(pay_beta)
    await db_session.flush()

    staff_alpha_headers = make_auth_header(staff_alpha[0])
    # Alpha staff calls Beta payment
    resp = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/payments/{pay_beta.id}/succeed",
        headers=staff_alpha_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tournament_director_cannot_manage_payments(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    td_alpha: tuple[User, ClubMembership],
    player_one: User,
):
    """Role TOURNAMENT_DIRECTOR does not have payment management privileges (403)."""
    pay = Payment(
        club_id=club_alpha.id,
        player_id=player_one.id,
        amount=Decimal("500.00"),
        currency="INR",
        reference=f"PAY-{uuid.uuid4().hex[:10]}",
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.CASH,
        status=PaymentStatus.PENDING,
    )
    db_session.add(pay)
    await db_session.flush()

    td_headers = make_auth_header(td_alpha[0])
    resp = await async_client.post(
        f"/api/v1/clubs/{club_alpha.id}/payments/{pay.id}/succeed",
        headers=td_headers,
    )
    assert resp.status_code == 403


# ─── 6. Booking & Eligibility Integration ─────────────────────────────────────

@pytest.mark.asyncio
async def test_club_player_membership_required_for_booking_and_cross_club_isolation(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_alpha: Club,
    club_beta: Club,
    player_one: User,
):
    """Player with active membership in Alpha cannot book a court in Beta without Beta membership."""
    # Add court in Beta
    court_beta = Court(
        club_id=club_beta.id,
        name="Beta Court 1",
        court_number=1,
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
    )
    db_session.add(court_beta)
    # Active membership only in Alpha
    db_session.add(ClubPlayerMembership(club_id=club_alpha.id, user_id=player_one.id, status=PlayerMembershipStatus.ACTIVE))
    await db_session.flush()

    headers = make_auth_header(player_one)
    tomorrow = date.today() + timedelta(days=1)
    book_resp = await async_client.post(
        f"/api/v1/clubs/{club_beta.id}/bookings",
        headers=headers,
        json={
            "court_id": str(court_beta.id),
            "booking_date": tomorrow.isoformat(),
            "start_time": "10:00:00",
            "end_time": "11:00:00",
        },
    )
    assert book_resp.status_code in (400, 403, 422)
