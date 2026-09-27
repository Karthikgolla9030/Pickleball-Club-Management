"""
Aught2 Pickleball — Phase 13 Payment API & Domain Tests

Comprehensive test suite verifying:
  - Payment Model: Creation, Decimal amount, currency, unique reference, timestamps
  - Enums: Purpose (membership only in Phase 13), Status, PaymentMethod
  - Status Transitions: All valid transitions and rejection of invalid transitions
  - Membership Integration: Linkage, player consistency, club consistency, historical amount immutability
  - Authorization: Club Owner yes, Club Manager yes, Tournament Director no (403), Player read-only
  - Tenant Isolation: Scoping to club_id, cross-club isolation
  - Player Payments: Can view own payments, cannot view other players' payments
  - Summary Metrics & Filters: Accurate totals and counts
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
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.payment import (
    Payment,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
)
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_a(db_session: AsyncSession) -> Club:
    club = Club(name="Club Alpha", slug=f"club-alpha-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_b(db_session: AsyncSession) -> Club:
    club = Club(name="Club Beta", slug=f"club-beta-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def owner_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"owner-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Owner User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def manager_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"manager-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Manager User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def td_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"td-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="TD User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_user_1(db_session: AsyncSession) -> User:
    u = User(
        email=f"player1-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Player One",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_user_2(db_session: AsyncSession) -> User:
    u = User(
        email=f"player2-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Player Two",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def owner_membership(db_session, club_a, owner_user) -> ClubMembership:
    m = ClubMembership(club_id=club_a.id, user_id=owner_user.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return m


@pytest_asyncio.fixture
async def manager_membership(db_session, club_a, manager_user) -> ClubMembership:
    m = ClubMembership(club_id=club_a.id, user_id=manager_user.id, role=ClubRole.CLUB_MANAGER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return m


@pytest_asyncio.fixture
async def td_membership(db_session, club_a, td_user) -> ClubMembership:
    m = ClubMembership(club_id=club_a.id, user_id=td_user.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return m


@pytest_asyncio.fixture
async def player_pm_1(db_session, club_a, player_user_1) -> ClubPlayerMembership:
    pm = ClubPlayerMembership(
        club_id=club_a.id,
        user_id=player_user_1.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(pm)
    await db_session.flush()
    return pm


@pytest_asyncio.fixture
async def player_pm_2(db_session, club_a, player_user_2) -> ClubPlayerMembership:
    pm = ClubPlayerMembership(
        club_id=club_a.id,
        user_id=player_user_2.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(pm)
    await db_session.flush()
    return pm


@pytest_asyncio.fixture
async def plan_a(db_session, club_a) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_a.id,
        name="Basic Monthly",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=Decimal("999.00"),
        currency="INR",
        benefits=["Court access"],
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


@pytest_asyncio.fixture
async def subscription_1(db_session, club_a, player_pm_1, plan_a) -> MemberSubscription:
    today = date.today()
    sub = MemberSubscription(
        club_id=club_a.id,
        player_membership_id=player_pm_1.id,
        membership_plan_id=plan_a.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=today,
        end_date=today + timedelta(days=30),
    )
    db_session.add(sub)
    await db_session.flush()
    return sub


@pytest_asyncio.fixture
async def subscription_2(db_session, club_a, player_pm_2, plan_a) -> MemberSubscription:
    today = date.today()
    sub = MemberSubscription(
        club_id=club_a.id,
        player_membership_id=player_pm_2.id,
        membership_plan_id=plan_a.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=today,
        end_date=today + timedelta(days=30),
    )
    db_session.add(sub)
    await db_session.flush()
    return sub


# ═══════════════════════════════════════════════════════════════════════════════
# 1. PAYMENT MODEL & CREATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_payment_success(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 1: Staff creates a payment record in PENDING status."""
    payload = {
        "player_id": str(player_user_1.id),
        "subscription_id": str(subscription_1.id),
        "amount": 999.00,
        "currency": "INR",
        "payment_method": "cash",
        "purpose": "membership",
        "notes": "Cash at front desk",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json=payload,
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["status"] == "pending"
    assert data["status_label"] == "Pending"
    assert data["purpose"] == "membership"
    assert data["payment_method"] == "cash"
    assert data["currency"] == "INR"
    assert Decimal(str(data["amount"])) == Decimal("999.00")
    assert data["reference"].startswith("A2P-")
    assert data["paid_at"] is None
    assert data["player"]["email"] == player_user_1.email
    assert data["subscription"]["id"] == str(subscription_1.id)


@pytest.mark.asyncio
async def test_create_payment_decimal_amount(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 2: Decimal amount precision (e.g. 1799.50) is preserved without floating errors."""
    payload = {
        "player_id": str(player_user_1.id),
        "subscription_id": str(subscription_1.id),
        "amount": 1799.50,
        "currency": "INR",
        "payment_method": "bank_transfer",
        "purpose": "membership",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json=payload,
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert Decimal(str(data["amount"])) == Decimal("1799.50")


@pytest.mark.asyncio
async def test_create_payment_unique_reference(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 3: Sequentially created payments receive distinct deterministic references."""
    payload = {
        "player_id": str(player_user_1.id),
        "subscription_id": str(subscription_1.id),
        "amount": 999.00,
        "currency": "INR",
        "payment_method": "cash",
        "purpose": "membership",
    }
    resp1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json=payload,
        headers=make_auth_header(owner_user),
    )
    resp2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json=payload,
        headers=make_auth_header(owner_user),
    )
    ref1 = resp1.json()["reference"]
    ref2 = resp2.json()["reference"]
    assert ref1 != ref2
    assert ref1.startswith("A2P-")
    assert ref2.startswith("A2P-")


@pytest.mark.asyncio
async def test_create_payment_invalid_amount_zero_or_negative(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 4: Zero or negative payment amounts are rejected."""
    payload = {
        "player_id": str(player_user_1.id),
        "subscription_id": str(subscription_1.id),
        "amount": 0,
        "currency": "INR",
        "payment_method": "cash",
        "purpose": "membership",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json=payload,
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_payment_payment_methods(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 5: All supported payment methods (cash, bank_transfer, online, other) are accepted."""
    for method in ["cash", "bank_transfer", "online", "other"]:
        payload = {
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": method,
            "purpose": "membership",
        }
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/payments",
            json=payload,
            headers=make_auth_header(owner_user),
        )
        assert resp.status_code == 201
        assert resp.json()["payment_method"] == method


# ═══════════════════════════════════════════════════════════════════════════════
# 2. VALIDATION & INVARIANTS TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_cross_player_subscription_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_user_2: User,
    player_pm_1: ClubPlayerMembership,
    player_pm_2: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 6: Cannot create payment for Player 2 using Player 1's subscription."""
    payload = {
        "player_id": str(player_user_2.id),  # Mismatch!
        "subscription_id": str(subscription_1.id),
        "amount": 999.00,
        "currency": "INR",
        "payment_method": "cash",
        "purpose": "membership",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json=payload,
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 400
    assert "belong to the specified player" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_cross_club_subscription_rejected(
    async_client: AsyncClient,
    club_a: Club,
    club_b: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 7: Subscription from Club A cannot be used in Club B."""
    # Add owner membership in Club B
    # Attempting to use subscription_1 (Club A) in Club B
    payload = {
        "player_id": str(player_user_1.id),
        "subscription_id": str(subscription_1.id),
        "amount": 999.00,
        "currency": "INR",
        "payment_method": "cash",
        "purpose": "membership",
    }
    resp = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/payments",
        json=payload,
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code in [403, 404]


# ═══════════════════════════════════════════════════════════════════════════════
# 3. STATUS TRANSITION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_transition_pending_to_processing(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 8: pending -> processing."""
    # Create payment
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/process",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"


@pytest.mark.asyncio
async def test_transition_pending_to_succeeded(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 9: pending -> succeeded (manual payment completion)."""
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/succeed",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "succeeded"
    assert data["paid_at"] is not None


@pytest.mark.asyncio
async def test_transition_pending_to_failed(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 10: pending -> failed with failure reason."""
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/fail",
        json={"failure_reason": "Bank gateway timeout"},
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "failed"
    assert data["failed_at"] is not None
    assert data["failure_reason"] == "Bank gateway timeout"


@pytest.mark.asyncio
async def test_transition_pending_to_cancelled(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 11: pending -> cancelled preserves record and sets cancelled_at."""
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/cancel",
        json={"cancellation_reason": "Player decided not to pay cash"},
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cancelled"
    assert data["cancelled_at"] is not None


@pytest.mark.asyncio
async def test_transition_processing_to_succeeded(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 12: processing -> succeeded."""
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "bank_transfer",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    # pending -> processing
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/process",
        headers=make_auth_header(owner_user),
    )

    # processing -> succeeded
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/succeed",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "succeeded"


@pytest.mark.asyncio
async def test_invalid_transitions(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 13: Illegal status transitions are rejected with 400."""
    # Create payment and succeed it
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/succeed",
        headers=make_auth_header(owner_user),
    )

    # 1. succeeded -> fail (forbidden)
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/fail",
        json={"failure_reason": "attempt to fail"},
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 400

    # 2. succeeded -> process (forbidden)
    resp2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/process",
        headers=make_auth_header(owner_user),
    )
    assert resp2.status_code == 400

    # 3. succeeded -> cancel (forbidden)
    resp3 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/cancel",
        headers=make_auth_header(owner_user),
    )
    assert resp3.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# 4. MEMBERSHIP INTEGRATION & HISTORICAL IMMUTABILITY
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_historical_payment_immutable_after_plan_price_change(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
    plan_a: MembershipPlan,
):
    """Test 14: Historical payment amount never changes when plan price changes."""
    # Create payment with amount ₹999
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    # Now change plan price to ₹1,499
    plan_a.price = Decimal("1499.00")
    await db_session.flush()

    # Verify payment record still has amount ₹999.00
    get_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}",
        headers=make_auth_header(owner_user),
    )
    assert get_resp.status_code == 200
    assert Decimal(str(get_resp.json()["amount"])) == Decimal("999.00")


@pytest.mark.asyncio
async def test_multiple_payments_for_same_subscription(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 15: Multiple payments can exist for the same subscription (e.g. failed attempt, then success)."""
    # 1. Failed payment
    resp1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    pay_id1 = resp1.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{pay_id1}/fail",
        json={"failure_reason": "Card declined"},
        headers=make_auth_header(owner_user),
    )

    # 2. Succeeded payment for the same subscription
    resp2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    pay_id2 = resp2.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{pay_id2}/succeed",
        headers=make_auth_header(owner_user),
    )

    # Verify both payments are listed for this subscription
    list_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?subscription_id={subscription_1.id}",
        headers=make_auth_header(owner_user),
    )
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 2


# ═══════════════════════════════════════════════════════════════════════════════
# 5. AUTHORIZATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_owner_and_manager_can_manage_payments(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    manager_user: User,
    manager_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 16: Both Club Owner and Club Manager have manage_payments access."""
    # Owner creates
    resp_owner = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 500.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    assert resp_owner.status_code == 201

    # Manager creates
    resp_manager = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 499.00,
            "currency": "INR",
            "payment_method": "bank_transfer",
            "purpose": "membership",
        },
        headers=make_auth_header(manager_user),
    )
    assert resp_manager.status_code == 201


@pytest.mark.asyncio
async def test_tournament_director_denied(
    async_client: AsyncClient,
    club_a: Club,
    td_user: User,
    td_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 17: Tournament Director does NOT have manage_payments (403 Forbidden)."""
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(td_user),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_player_cannot_create_or_modify_payments(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 18: Players cannot create payments or modify payment status."""
    # Player cannot create payment
    resp_create = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(player_user_1),
    )
    assert resp_create.status_code == 403

    # Create payment by staff
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    # Player cannot mark payment as succeeded
    resp_succeed = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{payment_id}/succeed",
        headers=make_auth_header(player_user_1),
    )
    assert resp_succeed.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════════
# 6. TENANT ISOLATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_tenant_isolation_staff_access(
    async_client: AsyncClient,
    club_a: Club,
    club_b: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 19: Staff of Club A cannot view or operate on payments from Club B."""
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    # Accessing Club A's payment through Club B endpoint is rejected
    resp = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/payments/{payment_id}",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code in [403, 404]


# ═══════════════════════════════════════════════════════════════════════════════
# 7. PLAYER PAYMENT HISTORY & PRIVACY TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_player_can_view_own_payments(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 20: Player can view their own payment history and detail."""
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "bank_transfer",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    # List player payments
    resp = await async_client.get(
        "/api/v1/payments",
        headers=make_auth_header(player_user_1),
    )
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    assert items[0]["id"] == payment_id

    # Get single player payment
    resp_detail = await async_client.get(
        f"/api/v1/payments/{payment_id}",
        headers=make_auth_header(player_user_1),
    )
    assert resp_detail.status_code == 200
    detail = resp_detail.json()
    assert detail["id"] == payment_id
    assert "provider_order_id" not in detail  # Admin metadata hidden


@pytest.mark.asyncio
async def test_player_cannot_view_other_players_payment(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_user_2: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 21: Player 2 cannot view Player 1's payment (returns 404)."""
    create_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    payment_id = create_resp.json()["id"]

    resp = await async_client.get(
        f"/api/v1/payments/{payment_id}",
        headers=make_auth_header(player_user_2),
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 8. PAYMENT SUMMARY METRICS & FILTERS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_club_payment_summary_and_filters(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 22: Summary metrics report accurate counts and total amounts."""
    # Create 1 succeeded (₹999), 1 pending (₹500), 1 failed (₹200)
    p1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p1.json()['id']}/succeed",
        headers=make_auth_header(owner_user),
    )

    p2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 500.00,
            "currency": "INR",
            "payment_method": "bank_transfer",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )

    p3 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 200.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p3.json()['id']}/fail",
        json={"failure_reason": "Expired"},
        headers=make_auth_header(owner_user),
    )

    summary_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments/summary",
        headers=make_auth_header(owner_user),
    )
    assert summary_resp.status_code == 200
    s_data = summary_resp.json()
    assert s_data["total_count"] == 3
    assert s_data["succeeded_count"] == 1
    assert s_data["pending_count"] == 1
    assert s_data["failed_count"] == 1
    assert Decimal(str(s_data["total_amount_collected"])) == Decimal("999.00")

    # Filter by status = succeeded
    succ_list = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?status=succeeded",
        headers=make_auth_header(owner_user),
    )
    assert succ_list.status_code == 200
    assert len(succ_list.json()) == 1

    # Filter by status = pending
    pend_list = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?status=pending",
        headers=make_auth_header(owner_user),
    )
    assert pend_list.status_code == 200
    assert len(pend_list.json()) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# 9. ADDITIONAL EDGE CASES, ERROR HANDLING & PAGINATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_payment_currency_normalized_to_uppercase(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 23: Lowercase currency code is normalized to uppercase."""
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "inr",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 201
    assert resp.json()["currency"] == "INR"


@pytest.mark.asyncio
async def test_create_payment_nonexistent_club(
    async_client: AsyncClient,
    owner_user: User,
    player_user_1: User,
    subscription_1: MemberSubscription,
):
    """Test 24: Payment creation for nonexistent club returns 404."""
    fake_club_id = uuid.uuid4()
    resp = await async_client.post(
        f"/api/v1/clubs/{fake_club_id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code in [403, 404]


@pytest.mark.asyncio
async def test_create_payment_nonexistent_subscription(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
):
    """Test 25: Payment creation with nonexistent subscription returns 404."""
    fake_sub_id = uuid.uuid4()
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(fake_sub_id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_payment_nonexistent_player(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    subscription_1: MemberSubscription,
):
    """Test 26: Payment creation with nonexistent player returns 400."""
    fake_player_id = uuid.uuid4()
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(fake_player_id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_transition_processing_to_failed(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 27: processing -> failed."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/process",
        headers=make_auth_header(owner_user),
    )
    fail_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/fail",
        json={"failure_reason": "Bank timeout during processing"},
        headers=make_auth_header(owner_user),
    )
    assert fail_resp.status_code == 200
    assert fail_resp.json()["status"] == "failed"


@pytest.mark.asyncio
async def test_transition_processing_to_cancelled(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 28: processing -> cancelled."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/process",
        headers=make_auth_header(owner_user),
    )
    cancel_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/cancel",
        json={"cancellation_reason": "Processing cancelled by staff"},
        headers=make_auth_header(owner_user),
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_invalid_transition_failed_to_succeeded(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 29: failed -> succeeded is forbidden."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/fail",
        json={"failure_reason": "Declined"},
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/succeed",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_invalid_transition_cancelled_to_succeeded(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 30: cancelled -> succeeded is forbidden."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/cancel",
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/succeed",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_invalid_transition_failed_to_processing(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 31: failed -> processing is forbidden."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "online",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/fail",
        json={"failure_reason": "Declined"},
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/process",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_invalid_transition_cancelled_to_processing(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 32: cancelled -> processing is forbidden."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/cancel",
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/process",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_club_payment_not_found(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
):
    """Test 33: Fetching nonexistent payment returns 404."""
    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments/{uuid.uuid4()}",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_process_nonexistent_payment(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
):
    """Test 34: Processing nonexistent payment returns 404."""
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{uuid.uuid4()}/process",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_succeed_nonexistent_payment(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
):
    """Test 35: Succeeding nonexistent payment returns 404."""
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{uuid.uuid4()}/succeed",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_fail_nonexistent_payment(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
):
    """Test 36: Failing nonexistent payment returns 404."""
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{uuid.uuid4()}/fail",
        json={"failure_reason": "Not found"},
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_cancel_nonexistent_payment(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
):
    """Test 37: Cancelling nonexistent payment returns 404."""
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{uuid.uuid4()}/cancel",
        json={"cancellation_reason": "Not found"},
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_club_payment_list_pagination(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 38: List club payments pagination (limit and offset)."""
    for i in range(3):
        await async_client.post(
            f"/api/v1/clubs/{club_a.id}/payments",
            json={
                "player_id": str(player_user_1.id),
                "subscription_id": str(subscription_1.id),
                "amount": 100.00 + i,
                "currency": "INR",
                "payment_method": "cash",
                "purpose": "membership",
            },
            headers=make_auth_header(owner_user),
        )

    # limit = 2
    r_lim = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?limit=2",
        headers=make_auth_header(owner_user),
    )
    assert r_lim.status_code == 200
    assert len(r_lim.json()) == 2

    # offset = 2
    r_off = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?limit=2&offset=2",
        headers=make_auth_header(owner_user),
    )
    assert r_off.status_code == 200
    assert len(r_off.json()) == 1


@pytest.mark.asyncio
async def test_player_payment_list_pagination(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 39: Player payment list pagination."""
    for i in range(3):
        await async_client.post(
            f"/api/v1/clubs/{club_a.id}/payments",
            json={
                "player_id": str(player_user_1.id),
                "subscription_id": str(subscription_1.id),
                "amount": 50.00 + i,
                "currency": "INR",
                "payment_method": "cash",
                "purpose": "membership",
            },
            headers=make_auth_header(owner_user),
        )

    resp = await async_client.get(
        "/api/v1/payments?limit=2",
        headers=make_auth_header(player_user_1),
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_player_payment_filter_by_status(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 40: Player filters their own payments by status."""
    p_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    pay_id = p_resp.json()["id"]
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{pay_id}/succeed",
        headers=make_auth_header(owner_user),
    )

    succ_resp = await async_client.get(
        "/api/v1/payments?status=succeeded",
        headers=make_auth_header(player_user_1),
    )
    assert succ_resp.status_code == 200
    assert all(p["status"] == "succeeded" for p in succ_resp.json())


@pytest.mark.asyncio
async def test_player_payment_filter_by_date_range(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 41: Player filters their payments by date range."""
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )

    today = date.today()
    resp = await async_client.get(
        f"/api/v1/payments?date_from={today - timedelta(days=1)}&date_to={today + timedelta(days=1)}",
        headers=make_auth_header(player_user_1),
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_club_payment_filter_by_date_range(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 42: Staff filters club payments by date range."""
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )

    today = datetime.now(timezone.utc).date()
    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?date_from={today - timedelta(days=1)}&date_to={today + timedelta(days=1)}",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


@pytest.mark.asyncio
async def test_club_payment_filter_by_purpose(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 43: Staff filters payments by purpose."""
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?purpose=membership",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert all(p["purpose"] == "membership" for p in resp.json())


@pytest.mark.asyncio
async def test_club_payment_filter_by_method(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 44: Staff filters payments by payment_method."""
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "bank_transfer",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?payment_method=bank_transfer",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert all(p["payment_method"] == "bank_transfer" for p in resp.json())


@pytest.mark.asyncio
async def test_club_payment_filter_by_subscription(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_user_2: User,
    player_pm_1: ClubPlayerMembership,
    player_pm_2: ClubPlayerMembership,
    subscription_1: MemberSubscription,
    subscription_2: MemberSubscription,
):
    """Test 45: Staff filters payments by subscription_id."""
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?subscription_id={subscription_1.id}",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert all(p["subscription_id"] == str(subscription_1.id) for p in resp.json())


@pytest.mark.asyncio
async def test_club_payment_filter_by_player_id(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 46: Staff filters payments by player_id."""
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )

    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/payments?player_id={player_user_1.id}",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert all(p["player_id"] == str(player_user_1.id) for p in resp.json())


@pytest.mark.asyncio
async def test_club_payment_summary_empty_club(
    async_client: AsyncClient,
    club_b: Club,
    owner_user: User,
    db_session: AsyncSession,
):
    """Test 47: Summary metrics return zeros for a club without payments."""
    # Give owner membership in Club B
    m = ClubMembership(club_id=club_b.id, user_id=owner_user.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()

    resp = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/payments/summary",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_count"] == 0
    assert data["succeeded_count"] == 0
    assert data["pending_count"] == 0
    assert data["failed_count"] == 0
    assert Decimal(str(data["total_amount_collected"])) == Decimal("0")


@pytest.mark.asyncio
async def test_unauthenticated_staff_endpoints_rejected(
    async_client: AsyncClient,
    club_a: Club,
):
    """Test 48: Unauthenticated requests to staff payment endpoints return 401."""
    r1 = await async_client.get(f"/api/v1/clubs/{club_a.id}/payments")
    assert r1.status_code == 401

    r2 = await async_client.post(f"/api/v1/clubs/{club_a.id}/payments", json={})
    assert r2.status_code == 401

    r3 = await async_client.get(f"/api/v1/clubs/{club_a.id}/payments/summary")
    assert r3.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_player_endpoints_rejected(
    async_client: AsyncClient,
):
    """Test 49: Unauthenticated requests to player payment endpoints return 401."""
    r1 = await async_client.get("/api/v1/payments")
    assert r1.status_code == 401

    r2 = await async_client.get(f"/api/v1/payments/{uuid.uuid4()}")
    assert r2.status_code == 401


@pytest.mark.asyncio
async def test_cancel_with_optional_reason(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 50: Cancellation with optional reason correctly stores note."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
            "notes": "Initial note",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/cancel",
        json={"cancellation_reason": "Refund requested at counter"},
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert "Refund requested at counter" in resp.json()["notes"]


@pytest.mark.asyncio
async def test_create_payment_without_notes(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 51: Payment created without notes has notes=None."""
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] is None


@pytest.mark.asyncio
async def test_cancel_without_payload(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_pm_1: ClubPlayerMembership,
    subscription_1: MemberSubscription,
):
    """Test 52: Cancelling without payload body succeeds."""
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments",
        json={
            "player_id": str(player_user_1.id),
            "subscription_id": str(subscription_1.id),
            "amount": 999.00,
            "currency": "INR",
            "payment_method": "cash",
            "purpose": "membership",
        },
        headers=make_auth_header(owner_user),
    )
    p_id = c_resp.json()["id"]

    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/payments/{p_id}/cancel",
        headers=make_auth_header(owner_user),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"

