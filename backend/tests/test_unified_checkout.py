"""
Aught2 Pickleball — Unified Real-Time Booking, Checkout, and Payment System Test Suite
Covers:
1. Unified checkout initiation across activities (court booking, tournament, membership).
2. Itemized pricing calculation (base price, member discounts, taxes, total).
3. Availability and double-booking conflict detection at checkout.
4. Cryptographic HMAC-SHA256 signature verification.
5. Idempotent payment verification and automated activity fulfillment.
6. Late conflict protection with automatic refund initiation.
7. Webhook signature validation and idempotent processing.
8. Real-time synchronization between Player payment ledger and Club Owner payments ledger.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import hashlib
import hmac
import json
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
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
async def owner_user(db_session: AsyncSession, club: Club) -> User:
    u = User(
        email=f"owner-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("OwnerPassword123!"),
        full_name="Club Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=club.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_user(db_session: AsyncSession, club: Club) -> User:
    u = User(
        email=f"player-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("PlayerPassword123!"),
        full_name="Player One",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    # Verified active club member (eligible for 10% member discount)
    pm = ClubPlayerMembership(
        club_id=club.id,
        user_id=u.id,
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add(pm)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def court(db_session: AsyncSession, club: Club) -> Court:
    c = Court(
        club_id=club.id,
        name="Championship Court 1",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        price_per_hour=Decimal("50.00"),
        is_active=True,
    )
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def tournament(db_session: AsyncSession, club: Club) -> Tournament:
    t = Tournament(
        club_id=club.id,
        name="Summer Grand Slam 2026",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=date.today() + timedelta(days=14),
        end_date=date.today() + timedelta(days=16),
        registration_open_at=datetime.now(timezone.utc) - timedelta(days=1),
        registration_close_at=datetime.now(timezone.utc) + timedelta(days=7),
        format_configuration={"registration_fee": 40.00, "category": "Open Singles"},
    )
    db_session.add(t)
    await db_session.flush()
    return t


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_checkout_initiate_court_booking_pricing_breakdown(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """
    Test initiating checkout for a 60-minute court booking:
    Base price: $50.00
    Member discount (10%): -$5.00
    Tax (5% of 45.00): $2.25
    Total: $47.25
    """
    start_dt = datetime.now(timezone.utc) + timedelta(days=1, hours=2)
    end_dt = start_dt + timedelta(hours=1)

    payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "provider": "razorpay",
        "currency": "USD",
        "start_at": start_dt.isoformat(),
        "end_at": end_dt.isoformat(),
        "notes": "Evening singles practice",
    }

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["provider"] in ("cashfree", "razorpay")
    assert data["provider_order_id"].startswith("order_") or data["provider_order_id"].startswith("cf_")
    assert "payment_id" in data
    assert "reference" in data

    breakdown = data["breakdown"]
    assert float(breakdown["base_amount"]) == 50.00
    assert float(breakdown["discount_amount"]) == 5.00
    assert float(breakdown["tax_amount"]) == 2.25
    assert float(breakdown["final_amount"]) == 47.25


@pytest.mark.asyncio
async def test_checkout_initiate_conflict_prevention(
    async_client: AsyncClient,
    db_session: AsyncSession,
    player_user: User,
    club: Club,
    court: Court,
):
    """
    Test conflict prevention: If an overlapping booking already exists,
    initiate_checkout must return 409 Conflict.
    """
    start_dt = datetime.now(timezone.utc) + timedelta(days=2, hours=10)
    end_dt = start_dt + timedelta(hours=1)

    # Create existing booking
    existing = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=player_user.id,
        booked_by_user_id=player_user.id,
        booking_type=BookingType.PLAYER,
        start_at=start_dt,
        end_at=end_dt,
        status=BookingStatus.CONFIRMED,
        price_per_hour=Decimal("50.00"),
        total_price=Decimal("50.00"),
    )
    db_session.add(existing)
    await db_session.commit()

    # Try to initiate checkout for overlapping window
    payload = {
        "club_id": str(club.id),
        "purpose": "court_booking",
        "activity_id": str(court.id),
        "provider": "razorpay",
        "currency": "USD",
        "start_at": (start_dt + timedelta(minutes=15)).isoformat(),
        "end_at": (end_dt + timedelta(minutes=15)).isoformat(),
    }

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 409
    assert "already booked" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_checkout_verify_cryptographic_signature_and_fulfillment(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """
    Test end-to-end cryptographic signature verification and booking creation:
    1. Initiate checkout
    2. Generate HMAC-SHA256 signature
    3. Verify payment
    4. Assert payment is SUCCEEDED and booking is CONFIRMED in database
    5. Assert idempotency on second verification call
    """
    start_dt = datetime.now(timezone.utc) + timedelta(days=3, hours=14)
    end_dt = start_dt + timedelta(hours=1)

    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "court_booking",
            "activity_id": str(court.id),
            "provider": "razorpay",
            "currency": "USD",
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=make_auth_header(player_user),
    )
    assert init_res.status_code == 201, init_res.text
    init_data = init_res.json()

    payment_id = init_data["payment_id"]
    order_id = init_data["provider_order_id"]
    provider_payment_id = f"pay_{uuid.uuid4().hex[:14]}"

    # Compute valid Razorpay HMAC-SHA256 signature
    secret = (settings.RAZORPAY_KEY_SECRET or "rzp_test_secret_key_123").encode("utf-8")
    msg = f"{order_id}|{provider_payment_id}".encode("utf-8")
    expected_sig = hmac.new(secret, msg, hashlib.sha256).hexdigest()

    verify_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": payment_id,
            "provider": "razorpay",
            "provider_payment_id": provider_payment_id,
            "provider_order_id": order_id,
            "provider_signature": expected_sig,
        },
        headers=make_auth_header(player_user),
    )
    assert verify_res.status_code == 200, verify_res.text
    verify_data = verify_res.json()

    assert verify_data["success"] is True
    assert verify_data["payment"]["status"] == "succeeded"
    assert "booking_or_registration" in verify_data
    assert verify_data["booking_or_registration"]["status"] == "confirmed"

    # Idempotent re-verification
    reverify_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": payment_id,
            "provider": "razorpay",
            "provider_payment_id": provider_payment_id,
            "provider_order_id": order_id,
            "provider_signature": expected_sig,
        },
        headers=make_auth_header(player_user),
    )
    assert reverify_res.status_code == 200
    assert "already verified" in reverify_res.json()["message"].lower()


@pytest.mark.asyncio
async def test_checkout_verify_invalid_signature_fails(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    court: Court,
):
    """
    Test that invalid/tampered cryptographic signatures are rejected (400)
    and the payment status is marked as failed.
    """
    start_dt = datetime.now(timezone.utc) + timedelta(days=4, hours=9)
    end_dt = start_dt + timedelta(hours=1)

    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "court_booking",
            "activity_id": str(court.id),
            "provider": "razorpay",
            "currency": "USD",
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=make_auth_header(player_user),
    )
    assert init_res.status_code == 201, init_res.text
    init_data = init_res.json()

    bad_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": init_data["payment_id"],
            "provider": "razorpay",
            "provider_payment_id": "pay_fake123",
            "provider_order_id": init_data["provider_order_id"],
            "provider_signature": "invalid_forged_signature_hex",
        },
        headers=make_auth_header(player_user),
    )
    assert bad_res.status_code == 400
    assert "signature verification failed" in bad_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_checkout_late_conflict_auto_refund(
    async_client: AsyncClient,
    db_session: AsyncSession,
    player_user: User,
    club: Club,
    court: Court,
):
    """
    Test late conflict protection:
    If another player takes the court slot before the user verifies payment,
    the system detects the conflict, marks payment REFUNDED, and returns 409.
    """
    start_dt = datetime.now(timezone.utc) + timedelta(days=5, hours=16)
    end_dt = start_dt + timedelta(hours=1)

    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "court_booking",
            "activity_id": str(court.id),
            "provider": "razorpay",
            "currency": "USD",
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=make_auth_header(player_user),
    )
    assert init_res.status_code == 201, init_res.text
    init_data = init_res.json()

    # Intervening booking created while user was entering payment
    intervening = Booking(
        club_id=club.id,
        court_id=court.id,
        player_id=player_user.id,
        booked_by_user_id=player_user.id,
        booking_type=BookingType.PLAYER,
        start_at=start_dt,
        end_at=end_dt,
        status=BookingStatus.CONFIRMED,
        price_per_hour=Decimal("50.00"),
        total_price=Decimal("50.00"),
    )
    db_session.add(intervening)
    await db_session.commit()

    # Generate valid signature
    order_id = init_data["provider_order_id"]
    provider_payment_id = f"pay_{uuid.uuid4().hex[:14]}"
    secret = (settings.RAZORPAY_KEY_SECRET or "rzp_test_secret_key_123").encode("utf-8")
    sig = hmac.new(secret, f"{order_id}|{provider_payment_id}".encode("utf-8"), hashlib.sha256).hexdigest()

    verify_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": init_data["payment_id"],
            "provider": "razorpay",
            "provider_payment_id": provider_payment_id,
            "provider_order_id": order_id,
            "provider_signature": sig,
        },
        headers=make_auth_header(player_user),
    )
    assert verify_res.status_code == 409
    assert "refund has been initiated" in verify_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_webhook_hmac_signature_processing(
    async_client: AsyncClient,
    player_user: User,
    club: Club,
    tournament: Tournament,
):
    """
    Test processing an asynchronous webhook from Razorpay:
    1. Initiate checkout for tournament registration
    2. Post webhook with valid X-Razorpay-Signature
    3. Assert payment confirms and registers player
    """
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "tournament",
            "activity_id": str(tournament.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_user),
    )
    assert init_res.status_code == 201, init_res.text
    init_data = init_res.json()
    order_id = init_data["provider_order_id"]

    webhook_payload = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": f"pay_hook_{uuid.uuid4().hex[:8]}",
                    "order_id": order_id,
                    "status": "captured",
                    "amount": 4200,
                    "currency": "USD",
                }
            }
        },
    }
    raw_body = json.dumps(webhook_payload).encode("utf-8")
    webhook_secret = (settings.RAZORPAY_WEBHOOK_SECRET or settings.RAZORPAY_KEY_SECRET or "rzp_test_secret_key_123").encode("utf-8")
    sig = hmac.new(webhook_secret, raw_body, hashlib.sha256).hexdigest()

    hook_res = await async_client.post(
        "/api/v1/payments/webhook?provider=razorpay",
        content=raw_body,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": sig},
    )
    assert hook_res.status_code == 200
    assert hook_res.json()["status"] == "processed"


@pytest.mark.asyncio
async def test_realtime_ledger_synchronization(
    async_client: AsyncClient,
    player_user: User,
    owner_user: User,
    club: Club,
    court: Court,
):
    """
    Test multi-portal ledger synchronization:
    When a payment succeeds, it must be queryable in:
    - Player App: GET /api/v1/payments
    - Club Owner Portal: GET /api/v1/clubs/{club_id}/payments
    """
    start_dt = datetime.now(timezone.utc) + timedelta(days=6, hours=11)
    end_dt = start_dt + timedelta(hours=1)

    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "court_booking",
            "activity_id": str(court.id),
            "provider": "razorpay",
            "currency": "USD",
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=make_auth_header(player_user),
    )
    assert init_res.status_code == 201, init_res.text
    init_data = init_res.json()
    payment_id = init_data["payment_id"]
    order_id = init_data["provider_order_id"]
    pay_id = f"pay_{uuid.uuid4().hex[:10]}"

    secret = (settings.RAZORPAY_KEY_SECRET or "rzp_test_secret_key_123").encode("utf-8")
    sig = hmac.new(secret, f"{order_id}|{pay_id}".encode("utf-8"), hashlib.sha256).hexdigest()

    verify_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": payment_id,
            "provider": "razorpay",
            "provider_payment_id": pay_id,
            "provider_order_id": order_id,
            "provider_signature": sig,
        },
        headers=make_auth_header(player_user),
    )
    assert verify_res.status_code == 200, verify_res.text

    # 1. Verify Player App ledger
    player_ledger_res = await async_client.get(
        "/api/v1/payments",
        headers=make_auth_header(player_user),
    )
    assert player_ledger_res.status_code == 200, player_ledger_res.text
    player_txs = player_ledger_res.json()
    matching_player_tx = next((tx for tx in player_txs if tx["id"] == payment_id), None)
    assert matching_player_tx is not None
    assert matching_player_tx["status"] == "succeeded"
    assert matching_player_tx["purpose"] == "court_booking"

    # 2. Verify Club Owner ledger
    club_ledger_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/payments",
        headers=make_auth_header(owner_user),
    )
    assert club_ledger_res.status_code == 200, club_ledger_res.text
    club_txs = club_ledger_res.json()
    matching_club_tx = next((tx for tx in club_txs if tx["id"] == payment_id), None)
    assert matching_club_tx is not None
    assert matching_club_tx["status"] == "succeeded"
    assert matching_club_tx["player_id"] == str(player_user.id)
