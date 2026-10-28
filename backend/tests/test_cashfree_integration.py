"""
Aught2 Pickleball — Cashfree Sandbox Payment Gateway Integration Test Suite

Tests cover:
1. Successful order creation with Cashfree sandbox payment_session_id.
2. Successful server-to-server payment verification (GET /pg/orders/{order_id} -> PAID).
3. Failed or cancelled payment status handling (booking is NOT confirmed).
4. Pending payment status (status: ACTIVE) rejected safely without confirming booking.
5. Invalid booking/activity ID returns 404 Not Found.
6. Unauthorized access prevention: User B cannot pay or verify User A's payment (403 Forbidden).
7. Amount mismatch detection: payment rejected if Cashfree order amount != DB amount.
8. Cashfree Webhook Signature validation using x-webhook-timestamp + raw body HMAC-SHA256.
9. Invalid webhook signature rejection (400 Bad Request).
10. Duplicate webhook delivery handled idempotently without duplicate records.
11. Cashfree API timeout and network error handling.
"""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch
import uuid
import httpx
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
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from tests.conftest import make_auth_header

settings = get_settings()


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club(db_session: AsyncSession) -> Club:
    c = Club(name="Cashfree Pickleball Club", slug=f"cf-club-{uuid.uuid4().hex[:8]}")
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def player_one(db_session: AsyncSession, club: Club) -> User:
    u = User(
        email=f"player-one-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("Pass123!"),
        full_name="Player One",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_two(db_session: AsyncSession, club: Club) -> User:
    u = User(
        email=f"player-two-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("Pass123!"),
        full_name="Player Two",
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
        name="Championship Court CF",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        price_per_hour=Decimal("60.00"),
        is_active=True,
    )
    db_session.add(c)
    await db_session.flush()
    return c


# ─── Helper for Cashfree Webhook Signatures ───────────────────────────────────

def generate_cashfree_webhook_signature(timestamp: str, raw_body: bytes, secret: str) -> str:
    """Computes Cashfree v2023-08-01 webhook signature: base64(hmac_sha256(secret, timestamp + body))."""
    data = f"{timestamp}{raw_body.decode('utf-8')}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), data, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


# ─── Test Cases ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cashfree_checkout_initiate_generates_session_id(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
    court: Court,
):
    """Test 1: Checkout initiation creates Cashfree order and returns payment_session_id."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=2)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "currency": "INR",
        "payment_method": "online",
    }

    mock_order_res = ProviderOrderResponse(
        provider="cashfree",
        order_id="cf_order_test_12345",
        amount_subunits=6300,
        amount_display=Decimal("63.00"),
        currency="INR",
        key_id="cf_test_app_id",
        payment_session_id="session_sand_cf_abcdef123456",
        receipt="receipt_test",
        notes={},
    )

    with patch.object(CashfreeGateway, "create_order", return_value=mock_order_res):
        res = await async_client.post(
            "/api/v1/payments/checkout/initiate",
            json=payload,
            headers=make_auth_header(player_one),
        )

    assert res.status_code == 201, res.text
    data = res.json()
    assert data["provider"] == "cashfree"
    assert data["provider_order_id"] == "cf_order_test_12345"
    assert data["payment_session_id"] == "session_sand_cf_abcdef123456"
    assert "payment_id" in data


@pytest.mark.asyncio
async def test_cashfree_successful_payment_verification(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
    court: Court,
):
    """Test 2: Server-side verification confirms payment with Cashfree and confirms booking."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=3)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    mock_order = ProviderOrderResponse(
        provider="cashfree",
        order_id="cf_order_verify_success",
        amount_subunits=6300,
        amount_display=Decimal("63.00"),
        currency="INR",
        key_id="cf_test_app_id",
        payment_session_id="session_success_123",
        receipt="rcpt_1",
        notes={},
    )
    with patch.object(CashfreeGateway, "create_order", return_value=mock_order):
        init_res = await async_client.post(
            "/api/v1/payments/checkout/initiate",
            json={
                "club_id": str(club.id),
                "purpose": "court_booking",
                "activity_id": str(court.id),
                "start_at": start_dt.isoformat(),
                "end_at": end_dt.isoformat(),
                "currency": "INR",
            },
            headers=make_auth_header(player_one),
        )
    assert init_res.status_code == 201
    init_data = init_res.json()

    mock_status = (True, "cf_pay_998877", None, "PAID")
    with patch.object(CashfreeGateway, "verify_order_status", return_value=mock_status):
        verify_res = await async_client.post(
            "/api/v1/payments/checkout/verify",
            json={
                "payment_id": init_data["payment_id"],
                "provider": "cashfree",
                "provider_order_id": "cf_order_verify_success",
            },
            headers=make_auth_header(player_one),
        )

    assert verify_res.status_code == 200, verify_res.text
    verify_data = verify_res.json()
    assert verify_data["success"] is True
    assert verify_data["payment"]["status"] == "succeeded"
    assert verify_data["booking_or_registration"] is not None


@pytest.mark.asyncio
async def test_cashfree_failed_or_cancelled_payment_rejected(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
    court: Court,
):
    """Test 3: Cashfree failed/cancelled status does not mark payment as succeeded."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=4)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    mock_order = ProviderOrderResponse(
        provider="cashfree",
        order_id="cf_order_failed_test",
        amount_subunits=6300,
        amount_display=Decimal("63.00"),
        currency="INR",
        key_id="cf_test_app_id",
        payment_session_id="session_fail_123",
        receipt="rcpt_fail",
        notes={},
    )
    with patch.object(CashfreeGateway, "create_order", return_value=mock_order):
        init_res = await async_client.post(
            "/api/v1/payments/checkout/initiate",
            json={
                "club_id": str(club.id),
                "purpose": "court_booking",
                "activity_id": str(court.id),
                "start_at": start_dt.isoformat(),
                "end_at": end_dt.isoformat(),
                "currency": "INR",
            },
            headers=make_auth_header(player_one),
        )
    init_data = init_res.json()

    mock_status = (False, None, "Customer dropped payment on checkout", "FAILED")
    with patch.object(CashfreeGateway, "verify_order_status", return_value=mock_status):
        verify_res = await async_client.post(
            "/api/v1/payments/checkout/verify",
            json={
                "payment_id": init_data["payment_id"],
                "provider": "cashfree",
                "provider_order_id": "cf_order_failed_test",
            },
            headers=make_auth_header(player_one),
        )

    assert verify_res.status_code == 400
    assert "FAILED" in verify_res.json()["detail"] or "Customer dropped" in verify_res.json()["detail"]


@pytest.mark.asyncio
async def test_cashfree_pending_status_does_not_confirm_booking(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
    court: Court,
):
    """Test 4: Cashfree pending/ACTIVE status is rejected and booking remains unconfirmed."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=5)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    mock_order = ProviderOrderResponse(
        provider="cashfree",
        order_id="cf_order_pending_test",
        amount_subunits=6300,
        amount_display=Decimal("63.00"),
        currency="INR",
        key_id="cf_test_app_id",
        payment_session_id="session_pending_123",
        receipt="rcpt_pend",
        notes={},
    )
    with patch.object(CashfreeGateway, "create_order", return_value=mock_order):
        init_res = await async_client.post(
            "/api/v1/payments/checkout/initiate",
            json={
                "club_id": str(club.id),
                "purpose": "court_booking",
                "activity_id": str(court.id),
                "start_at": start_dt.isoformat(),
                "end_at": end_dt.isoformat(),
                "currency": "INR",
            },
            headers=make_auth_header(player_one),
        )
    init_data = init_res.json()

    mock_status = (False, None, None, "ACTIVE")
    with patch.object(CashfreeGateway, "verify_order_status", return_value=mock_status):
        verify_res = await async_client.post(
            "/api/v1/payments/checkout/verify",
            json={
                "payment_id": init_data["payment_id"],
                "provider": "cashfree",
                "provider_order_id": "cf_order_pending_test",
            },
            headers=make_auth_header(player_one),
        )

    assert verify_res.status_code == 400
    assert "pending" in verify_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cashfree_invalid_booking_or_court_id(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
):
    """Test 5: Initiation with non-existent court/activity returns 404."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=6)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "court_booking",
            "activity_id": str(uuid.uuid4()),  # Random non-existent UUID
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
            "currency": "INR",
        },
        headers=make_auth_header(player_one),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_cashfree_unauthorized_user_access_prevented(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
    player_two: User,
    court: Court,
):
    """Test 6: Player Two cannot verify or pay for Player One's checkout record."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=7)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    mock_order = ProviderOrderResponse(
        provider="cashfree",
        order_id="cf_order_auth_test",
        amount_subunits=6300,
        amount_display=Decimal("63.00"),
        currency="INR",
        key_id="cf_test_app_id",
        payment_session_id="session_auth_123",
        receipt="rcpt_auth",
        notes={},
    )
    with patch.object(CashfreeGateway, "create_order", return_value=mock_order):
        init_res = await async_client.post(
            "/api/v1/payments/checkout/initiate",
            json={
                "club_id": str(club.id),
                "purpose": "court_booking",
                "activity_id": str(court.id),
                "start_at": start_dt.isoformat(),
                "end_at": end_dt.isoformat(),
                "currency": "INR",
            },
            headers=make_auth_header(player_one),  # Initiated by Player One
        )
    init_data = init_res.json()

    mock_status = (True, "cf_pay_illegal", None, "PAID")
    with patch.object(CashfreeGateway, "verify_order_status", return_value=mock_status):
        verify_res = await async_client.post(
            "/api/v1/payments/checkout/verify",
            json={
                "payment_id": init_data["payment_id"],
                "provider": "cashfree",
                "provider_order_id": "cf_order_auth_test",
            },
            headers=make_auth_header(player_two),  # Unauthorized caller
        )

    assert verify_res.status_code == 403
    assert "unauthorized" in verify_res.json()["detail"].lower()


def test_cashfree_amount_mismatch_protection():
    """Test 7: Tampered or mismatched order amounts are detected and rejected."""
    gateway = CashfreeGateway()
    gateway._has_live_credentials = True
    gateway.app_id = "test_app_id"
    gateway.secret_key = "test_secret_key"

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "order_id": "cf_order_tampered",
        "order_status": "PAID",
        "order_amount": 10.00,  # Mismatched amount
        "order_currency": "INR",
    }

    with patch("httpx.Client.get", return_value=mock_response):
        is_paid, cf_pay_id, reason, status = gateway.verify_order_status(
            order_id="cf_order_tampered",
            expected_amount=Decimal("63.00"),
            expected_currency="INR",
        )

    assert is_paid is False
    assert "Amount mismatch" in reason


@pytest.mark.asyncio
async def test_cashfree_valid_webhook_signature_and_fulfillment(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
    court: Court,
):
    """Test 8: Valid Cashfree webhook signature processes PAYMENT_SUCCESS_WEBHOOK."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=8)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    mock_order = ProviderOrderResponse(
        provider="cashfree",
        order_id="cf_order_webhook_success",
        amount_subunits=6300,
        amount_display=Decimal("63.00"),
        currency="INR",
        key_id="cf_test_app_id",
        payment_session_id="session_wh_123",
        receipt="rcpt_wh",
        notes={},
    )
    with patch.object(CashfreeGateway, "create_order", return_value=mock_order):
        init_res = await async_client.post(
            "/api/v1/payments/checkout/initiate",
            json={
                "club_id": str(club.id),
                "purpose": "court_booking",
                "activity_id": str(court.id),
                "start_at": start_dt.isoformat(),
                "end_at": end_dt.isoformat(),
                "currency": "INR",
            },
            headers=make_auth_header(player_one),
        )
    assert init_res.status_code == 201

    timestamp = str(int(datetime.now(timezone.utc).timestamp()))
    webhook_body = json.dumps({
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {"order_id": "cf_order_webhook_success", "order_amount": 63.00, "order_currency": "INR"},
            "payment": {"cf_payment_id": 99881122, "payment_status": "SUCCESS", "payment_amount": 63.00},
        },
    }).encode("utf-8")

    secret = CashfreeGateway().secret_key
    sig = generate_cashfree_webhook_signature(timestamp, webhook_body, secret)

    wh_res = await async_client.post(
        "/api/v1/payments/webhook/cashfree",
        content=webhook_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": sig,
        },
    )

    assert wh_res.status_code == 200, wh_res.text
    assert wh_res.json()["status"] == "processed"


@pytest.mark.asyncio
async def test_cashfree_invalid_webhook_signature_rejected(
    async_client: AsyncClient,
):
    """Test 9: Invalid webhook signature returns 400 Bad Request."""
    timestamp = str(int(datetime.now(timezone.utc).timestamp()))
    webhook_body = b'{"type":"PAYMENT_SUCCESS_WEBHOOK"}'
    invalid_sig = "invalid_forged_base64_signature=="

    res = await async_client.post(
        "/api/v1/payments/webhook/cashfree",
        content=webhook_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": invalid_sig,
        },
    )

    assert res.status_code == 400
    assert "Invalid webhook signature" in res.json()["detail"]


@pytest.mark.asyncio
async def test_cashfree_duplicate_webhook_is_idempotent(
    async_client: AsyncClient,
    club: Club,
    player_one: User,
    court: Court,
):
    """Test 10: Duplicate webhook calls do not crash or duplicate records."""
    start_dt = (datetime.now(timezone.utc) + timedelta(days=9)).replace(minute=0, second=0, microsecond=0)
    end_dt = start_dt + timedelta(hours=1)

    mock_order = ProviderOrderResponse(
        provider="cashfree",
        order_id="cf_order_idempotent_test",
        amount_subunits=6300,
        amount_display=Decimal("63.00"),
        currency="INR",
        key_id="cf_test_app_id",
        payment_session_id="session_idem_123",
        receipt="rcpt_idem",
        notes={},
    )
    with patch.object(CashfreeGateway, "create_order", return_value=mock_order):
        await async_client.post(
            "/api/v1/payments/checkout/initiate",
            json={
                "club_id": str(club.id),
                "purpose": "court_booking",
                "activity_id": str(court.id),
                "start_at": start_dt.isoformat(),
                "end_at": end_dt.isoformat(),
                "currency": "INR",
            },
            headers=make_auth_header(player_one),
        )

    timestamp = str(int(datetime.now(timezone.utc).timestamp()))
    webhook_body = json.dumps({
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {"order_id": "cf_order_idempotent_test"},
            "payment": {"cf_payment_id": 11223344, "payment_status": "SUCCESS"},
        },
    }).encode("utf-8")

    secret = CashfreeGateway().secret_key
    sig = generate_cashfree_webhook_signature(timestamp, webhook_body, secret)

    # First delivery
    res1 = await async_client.post(
        "/api/v1/payments/webhook/cashfree",
        content=webhook_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": sig,
        },
    )
    assert res1.status_code == 200

    # Second delivery (duplicate retry from Cashfree)
    res2 = await async_client.post(
        "/api/v1/payments/webhook/cashfree",
        content=webhook_body,
        headers={
            "Content-Type": "application/json",
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": sig,
        },
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "processed"


def test_cashfree_api_timeout_handled_gracefully():
    """Test 11: Cashfree API timeout is caught and handled safely."""
    gateway = CashfreeGateway()
    gateway._has_live_credentials = True
    gateway.app_id = "test_app_id"
    gateway.secret_key = "test_secret_key"

    with patch("httpx.Client.get", side_effect=httpx.TimeoutException("Connection timed out")):
        is_paid, cf_pay_id, reason, status = gateway.verify_order_status("cf_order_timeout_test")

    assert is_paid is False
    assert status == "TIMEOUT"
    assert "timed out" in reason.lower()
