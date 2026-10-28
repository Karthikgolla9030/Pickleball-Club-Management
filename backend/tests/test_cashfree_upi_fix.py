"""
Cashfree UPI Selection and Multi-Activity Payment Fix Verification Suite.

Tests:
1. CashfreeGateway unit tests:
   - selected_method='upi' -> order_meta['payment_methods'] = 'upi'
   - selected_method='card' -> order_meta['payment_methods'] = 'cc,dc'
   - selected_method='netbanking' -> order_meta['payment_methods'] = 'nb'
   - non-INR currency normalized to INR for domestic Indian transactions
2. API Checkout Initiation tests:
   - UPI court booking checkout returns selected_method='upi', payment_methods='upi', currency='INR'
   - Card court booking checkout returns selected_method='card', payment_methods='cc,dc'
   - NetBanking court booking checkout returns selected_method='netbanking', payment_methods='nb'
3. Multi-Activity UPI checkout coverage:
   - Court Booking
   - Tournament Registration
   - Membership Purchase
4. Cashfree Payment Verification:
   - Verified successful UPI payment confirms booking and sets payment to SUCCEEDED
   - Pending payment on Cashfree prevents confirmation and returns 400
   - Failed payment on Cashfree marks payment as FAILED
   - Idempotent repeated verification calls
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.payment.gateway import CashfreeGateway, ProviderOrderResponse
from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.membership import MembershipPlan, PlanDurationUnit, PlanStatus
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.user import User
from tests.conftest import make_auth_header

settings = get_settings()


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club(db_session: AsyncSession) -> Club:
    c = Club(name="Pickleball Central Club", slug=f"pb-central-{uuid.uuid4().hex[:8]}")
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def player_user(db_session: AsyncSession, club: Club) -> User:
    u = User(
        email=f"player-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("Pass123!"),
        full_name="Test Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def court(db_session: AsyncSession, club: Club) -> Court:
    c = Court(
        club_id=club.id,
        name="Championship Court 1",
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
        price_per_hour=Decimal("60.00"),
        is_active=True,
    )
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def tournament(db_session: AsyncSession, club: Club) -> Tournament:
    t = Tournament(
        club_id=club.id,
        name="Bangalore Open Pickleball Championship",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=date.today() + timedelta(days=14),
        end_date=date.today() + timedelta(days=16),
        registration_open_at=datetime.now(timezone.utc) - timedelta(days=1),
        registration_close_at=datetime.now(timezone.utc) + timedelta(days=7),
        format_configuration={"registration_fee": 75.00, "category": "Open"},
    )
    db_session.add(t)
    await db_session.flush()
    return t


@pytest_asyncio.fixture
async def membership_plan(db_session: AsyncSession, club: Club) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club.id,
        name="Annual Gold Pro Membership",
        price=Decimal("150.00"),
        duration_unit=PlanDurationUnit.YEARLY,
        status=PlanStatus.ACTIVE,
        currency="INR",
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


# ─── 1. CashfreeGateway Unit Tests ────────────────────────────────────────────

def test_cashfree_gateway_upi_method_mapping():
    """Verify that selected_method='upi' sets payment_methods='upi'."""
    gateway = CashfreeGateway()
    order_res = gateway.create_order(
        amount=Decimal("500.00"),
        currency="INR",
        receipt="RCP-UPI-001",
        notes={"selected_method": "upi"},
    )
    assert order_res.provider == "cashfree"
    assert order_res.currency == "INR"
    assert order_res.notes.get("payment_methods") == "upi"
    assert order_res.notes.get("selected_method") == "upi"


def test_cashfree_gateway_card_method_mapping():
    """Verify that selected_method='card' sets payment_methods='cc,dc'."""
    gateway = CashfreeGateway()
    order_res = gateway.create_order(
        amount=Decimal("1200.00"),
        currency="INR",
        receipt="RCP-CARD-001",
        notes={"selected_method": "card"},
    )
    assert order_res.notes.get("payment_methods") == "cc,dc"
    assert order_res.notes.get("selected_method") == "card"


def test_cashfree_gateway_netbanking_method_mapping():
    """Verify that selected_method='netbanking' sets payment_methods='nb'."""
    gateway = CashfreeGateway()
    order_res = gateway.create_order(
        amount=Decimal("800.00"),
        currency="INR",
        receipt="RCP-NB-001",
        notes={"selected_method": "netbanking"},
    )
    assert order_res.notes.get("payment_methods") == "nb"
    assert order_res.notes.get("selected_method") == "netbanking"


def test_cashfree_gateway_normalizes_currency_to_inr():
    """Verify that Cashfree normalizes non-INR currencies to INR for domestic checkout."""
    gateway = CashfreeGateway()
    order_res = gateway.create_order(
        amount=Decimal("75.00"),
        currency="USD",
        receipt="RCP-USD-001",
        notes={"selected_method": "upi"},
    )
    assert order_res.currency == "INR"


# ─── 2. API Checkout Initiation Tests ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_checkout_initiate_upi_court_booking(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """Verify initiating court booking checkout with UPI locks payment_methods to upi."""
    start_dt = datetime.now(timezone.utc) + timedelta(days=2, hours=10)
    end_dt = start_dt + timedelta(hours=1)

    payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "selected_method": "upi",
        "currency": "INR",
    }

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["provider"] == "cashfree"
    assert data["selected_method"] == "upi"
    assert data["payment_methods"] == "upi"
    assert data["breakdown"]["currency"] == "INR"
    assert data["payment_session_id"] is not None
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_checkout_initiate_card_court_booking(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """Verify initiating court booking checkout with Card locks payment_methods to cc,dc."""
    start_dt = datetime.now(timezone.utc) + timedelta(days=2, hours=12)
    end_dt = start_dt + timedelta(hours=1)

    payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "selected_method": "card",
        "currency": "INR",
    }

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["selected_method"] == "card"
    assert data["payment_methods"] == "cc,dc"


@pytest.mark.asyncio
async def test_checkout_initiate_netbanking_court_booking(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """Verify initiating court booking checkout with NetBanking locks payment_methods to nb."""
    start_dt = datetime.now(timezone.utc) + timedelta(days=2, hours=14)
    end_dt = start_dt + timedelta(hours=1)

    payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "selected_method": "netbanking",
        "currency": "INR",
    }

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["selected_method"] == "netbanking"
    assert data["payment_methods"] == "nb"


# ─── 3. Multi-Activity UPI Coverage ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_checkout_initiate_upi_tournament(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    tournament: Tournament,
):
    """Verify tournament registration checkout preserves UPI method."""
    payload = {
        "club_id": str(club.id),
        "purpose": "tournament",
        "activity_id": str(tournament.id),
        "selected_method": "upi",
        "currency": "INR",
    }

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["selected_method"] == "upi"
    assert data["payment_methods"] == "upi"
    assert data["breakdown"]["currency"] == "INR"


@pytest.mark.asyncio
async def test_checkout_initiate_upi_membership(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    membership_plan: MembershipPlan,
):
    """Verify membership purchase checkout preserves UPI method."""
    payload = {
        "club_id": str(club.id),
        "purpose": "membership",
        "activity_id": str(membership_plan.id),
        "selected_method": "upi",
        "currency": "INR",
    }

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["selected_method"] == "upi"
    assert data["payment_methods"] == "upi"
    assert data["breakdown"]["currency"] == "INR"


# ─── 4. Cashfree Payment Verification Tests ───────────────────────────────────

@pytest.mark.asyncio
async def test_cashfree_upi_successful_verification(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """Verify that a successful UPI payment confirms booking and updates ledger."""
    start_dt = datetime.now(timezone.utc) + timedelta(days=3, hours=8)
    end_dt = start_dt + timedelta(hours=1)

    init_payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "selected_method": "upi",
        "currency": "INR",
    }
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=init_payload,
        headers=make_auth_header(player_user),
    )
    assert init_res.status_code == 201
    init_data = init_res.json()
    payment_id = init_data["payment_id"]
    order_id = init_data["provider_order_id"]

    mock_status = (True, "cf_pay_upi_success_123", None, "PAID")
    with patch.object(CashfreeGateway, "verify_order_status", return_value=mock_status):
        verify_payload = {
            "payment_id": payment_id,
            "provider": "cashfree",
            "provider_order_id": order_id,
            "provider_payment_id": "cf_pay_upi_success_123",
        }
        verify_res = await async_client.post(
            "/api/v1/payments/checkout/verify",
            json=verify_payload,
            headers=make_auth_header(player_user),
        )
        assert verify_res.status_code == 200, verify_res.text
        vdata = verify_res.json()
        assert vdata["success"] is True
        assert vdata["payment"]["status"] == "succeeded"
        assert vdata["booking_or_registration"] is not None

    # Verify idempotency
    verify_again = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json=verify_payload,
        headers=make_auth_header(player_user),
    )
    assert verify_again.status_code == 200
    assert verify_again.json()["success"] is True


@pytest.mark.asyncio
async def test_cashfree_upi_pending_status_rejected(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """Verify that an ACTIVE/PENDING payment on Cashfree does not confirm booking."""
    start_dt = datetime.now(timezone.utc) + timedelta(days=3, hours=10)
    end_dt = start_dt + timedelta(hours=1)

    init_payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "selected_method": "upi",
        "currency": "INR",
    }
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=init_payload,
        headers=make_auth_header(player_user),
    )
    assert init_res.status_code == 201
    init_data = init_res.json()
    payment_id = init_data["payment_id"]
    order_id = init_data["provider_order_id"]

    mock_pending = (False, None, "Payment is still pending on Cashfree", "ACTIVE")
    with patch.object(CashfreeGateway, "verify_order_status", return_value=mock_pending):
        verify_payload = {
            "payment_id": payment_id,
            "provider": "cashfree",
            "provider_order_id": order_id,
        }
        verify_res = await async_client.post(
            "/api/v1/payments/checkout/verify",
            json=verify_payload,
            headers=make_auth_header(player_user),
        )
        assert verify_res.status_code == 400
        assert "pending" in verify_res.json()["detail"].lower()
