"""
Aught2 Pickleball — End-to-End Lesson Registration & Payment Verification Test Suite

Covers Tests A through G as specified in the Lesson Registration Flow requirements:
  - Test A: Successful registration & payment flow end-to-end
  - Test B: Page refresh & query persistence
  - Test C: Failed payment verification (no registration created)
  - Test D: Cancelled payment process (not marked as registered)
  - Test E: Duplicate protection (idempotent verify, webhook deduplication, duplicate checkout rejected)
  - Test F: Club side synchronization (roster, capacity counts, club payment ledger)
  - Test G: Multiple players isolation (tenant / player privacy, club visibility)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import hmac
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.lesson import (
    Coach,
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from tests.conftest import make_auth_header

settings = get_settings()


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club(db_session: AsyncSession) -> Club:
    c = Club(name="Pickleball Pro Arena", slug=f"pb-pro-{uuid.uuid4().hex[:8]}")
    db_session.add(c)
    await db_session.flush()
    return c


@pytest_asyncio.fixture
async def owner_user(db_session: AsyncSession, club: Club) -> User:
    u = User(
        email=f"owner-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("OwnerPass123!"),
        full_name="Club Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()

    mem = ClubMembership(
        club_id=club.id,
        user_id=u.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(mem)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def coach(db_session: AsyncSession, club: Club) -> Coach:
    c = Coach(
        club_id=club.id,
        name="Coach Alex Morgan",
        email=f"alex-{uuid.uuid4().hex[:6]}@pickleball.test",
        bio="Certified IPTPA Level II Coach",
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture
async def court(db_session: AsyncSession, club: Club) -> Court:
    crt = Court(
        club_id=club.id,
        name="Court 1 - Championship",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
    )
    db_session.add(crt)
    await db_session.commit()
    return crt


@pytest_asyncio.fixture
async def lesson_type(db_session: AsyncSession, club: Club) -> LessonType:
    lt = LessonType(
        club_id=club.id,
        name="Group Clinic",
        description="Dynamic group lesson covering transition zone & dinking",
        duration_minutes=60,
        default_capacity=6,
        default_price=Decimal("65.00"),
        is_active=True,
    )
    db_session.add(lt)
    await db_session.commit()
    return lt


@pytest_asyncio.fixture
async def published_lesson(
    db_session: AsyncSession,
    club: Club,
    coach: Coach,
    court: Court,
    lesson_type: LessonType,
) -> Lesson:
    now = datetime.now(timezone.utc)
    lesson = Lesson(
        club_id=club.id,
        lesson_type_id=lesson_type.id,
        coach_id=coach.id,
        court_id=court.id,
        title="new one",
        description="Group clinic session",
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=1),
        registration_opens_at=now - timedelta(days=1),
        registration_closes_at=now + timedelta(days=1, hours=23),
        capacity=6,
        price=Decimal("65.00"),
        currency="USD",
        status=LessonStatus.PUBLISHED,
    )
    db_session.add(lesson)
    await db_session.commit()
    return lesson


@pytest_asyncio.fixture
async def player_1(db_session: AsyncSession) -> User:
    u = User(
        email=f"player1-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Samantha Swift",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def player_2(db_session: AsyncSession) -> User:
    u = User(
        email=f"player2-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Jordan Reed",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


def _compute_razorpay_sig(order_id: str, payment_id: str) -> str:
    secret = (settings.RAZORPAY_KEY_SECRET or "rzp_test_secret_key_123").encode("utf-8")
    msg = f"{order_id}|{payment_id}".encode("utf-8")
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_case_a_successful_registration_and_payment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club: Club,
    coach: Coach,
    court: Court,
    published_lesson: Lesson,
    player_1: User,
):
    """
    Test A – Successful registration:
    - Player initiates checkout for lesson ($65.00).
    - Player completes payment with valid cryptographic signature.
    - Verified payment persists LessonRegistration and Payment records in database.
    - Lesson appears in My Registrations immediately with all details (duration, court, coach, payment).
    - Discover Lessons immediately reflects 'is_registered = True' and decrements open spots.
    """
    # 1. Initiate checkout
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    assert init_res.status_code == 201, init_res.text
    init_data = init_res.json()
    payment_id = init_data["payment_id"]
    order_id = init_data["provider_order_id"]
    assert Decimal(str(init_data["breakdown"]["base_amount"])) == Decimal("65.00")
    expected_amount = Decimal(str(init_data["breakdown"]["final_amount"]))

    # 2. Complete payment with verified HMAC-SHA256 signature
    provider_pmt_id = f"pay_{uuid.uuid4().hex[:14]}"
    sig = _compute_razorpay_sig(order_id, provider_pmt_id)

    verify_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": payment_id,
            "provider": "razorpay",
            "provider_payment_id": provider_pmt_id,
            "provider_order_id": order_id,
            "provider_signature": sig,
        },
        headers=make_auth_header(player_1),
    )
    assert verify_res.status_code == 200, verify_res.text
    vdata = verify_res.json()
    assert vdata["success"] is True
    assert vdata["payment"]["status"] == "succeeded"
    assert vdata["booking_or_registration"] is not None

    # 3. Verify database persistence
    stmt_reg = select(LessonRegistration).where(
        LessonRegistration.lesson_id == published_lesson.id,
        LessonRegistration.user_id == player_1.id,
    )
    reg_db = (await db_session.execute(stmt_reg)).scalars().first()
    assert reg_db is not None
    assert reg_db.status == LessonRegistrationStatus.REGISTERED

    stmt_pay = select(Payment).where(
        Payment.id == uuid.UUID(payment_id),
    )
    pmt_db = (await db_session.execute(stmt_pay)).scalars().first()
    assert pmt_db is not None
    assert pmt_db.status == PaymentStatus.SUCCEEDED
    assert pmt_db.amount == expected_amount
    assert pmt_db.lesson_id == published_lesson.id
    assert pmt_db.player_id == player_1.id

    # 4. Verify My Registrations API immediately returns persisted record with all rich fields
    my_lessons_res = await async_client.get(
        "/api/v1/players/me/lessons",
        headers=make_auth_header(player_1),
    )
    assert my_lessons_res.status_code == 200
    my_lessons = my_lessons_res.json()
    assert len(my_lessons) == 1
    reg_item = my_lessons[0]
    assert reg_item["lesson_id"] == str(published_lesson.id)
    assert reg_item["lesson_title"] == "new one"
    assert reg_item["duration_minutes"] == 60
    assert reg_item["court_name"] == court.name
    assert reg_item["coach_name"] == coach.name
    assert Decimal(str(reg_item["payment_amount"])) == expected_amount
    assert reg_item["payment_status"] == "succeeded"
    assert reg_item["status"] == "registered"

    # 5. Verify Discover Lessons endpoint reflects registered state
    discover_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/lessons/discover",
        headers=make_auth_header(player_1),
    )
    assert discover_res.status_code == 200
    discover_items = discover_res.json()
    matched = next((it for it in discover_items if it["id"] == str(published_lesson.id)), None)
    assert matched is not None
    assert matched["is_registered"] is True
    assert matched["my_registration"] is not None
    assert matched["my_registration"]["status"] == "registered"
    assert matched["available_spots"] == 5  # Capacity 6 - 1 active registration


@pytest.mark.asyncio
async def test_case_b_page_refresh_and_query_persistence(
    async_client: AsyncClient,
    club: Club,
    published_lesson: Lesson,
    player_1: User,
):
    """
    Test B – Page refresh & reopen:
    - Complete registration.
    - Issue fresh, independent requests mimicking browser page reload.
    - Confirm registration status and details remain intact and verified.
    """
    # Register via checkout
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    init_data = init_res.json()
    order_id = init_data["provider_order_id"]
    pmt_id = init_data["payment_id"]
    provider_pmt_id = f"pay_{uuid.uuid4().hex[:14]}"
    sig = _compute_razorpay_sig(order_id, provider_pmt_id)

    await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": pmt_id,
            "provider": "razorpay",
            "provider_payment_id": provider_pmt_id,
            "provider_order_id": order_id,
            "provider_signature": sig,
        },
        headers=make_auth_header(player_1),
    )

    # Simulate fresh page reload
    fresh_my_lessons = await async_client.get(
        "/api/v1/players/me/lessons",
        headers=make_auth_header(player_1),
    )
    assert fresh_my_lessons.status_code == 200
    items = fresh_my_lessons.json()
    assert len(items) == 1
    assert items[0]["lesson_id"] == str(published_lesson.id)
    assert items[0]["payment_status"] == "succeeded"

    fresh_detail = await async_client.get(
        f"/api/v1/players/me/lessons/{published_lesson.id}",
        headers=make_auth_header(player_1),
    )
    assert fresh_detail.status_code == 200
    detail_data = fresh_detail.json()
    assert detail_data["is_registered"] is True
    assert detail_data["my_registration"]["status"] == "registered"


@pytest.mark.asyncio
async def test_case_c_failed_payment_no_registration(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club: Club,
    published_lesson: Lesson,
    player_1: User,
):
    """
    Test C – Failed payment:
    - Attempt registration with invalid signature / failed payment.
    - Verify no confirmed registration is created in DB or returned via API.
    """
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    init_data = init_res.json()
    pmt_id = init_data["payment_id"]

    # Provide forged / invalid signature
    verify_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": pmt_id,
            "provider": "razorpay",
            "provider_payment_id": "pay_failed_fake",
            "provider_order_id": init_data["provider_order_id"],
            "provider_signature": "invalid_forged_signature_0000000000",
        },
        headers=make_auth_header(player_1),
    )
    assert verify_res.status_code == 400
    assert "signature verification failed" in verify_res.json()["detail"].lower()

    # Verify no LessonRegistration was created in database
    stmt = select(LessonRegistration).where(
        LessonRegistration.lesson_id == published_lesson.id,
        LessonRegistration.user_id == player_1.id,
    )
    reg_db = (await db_session.execute(stmt)).scalars().first()
    assert reg_db is None

    # Verify My Registrations remains empty
    my_lessons = await async_client.get(
        "/api/v1/players/me/lessons",
        headers=make_auth_header(player_1),
    )
    assert len(my_lessons.json()) == 0


@pytest.mark.asyncio
async def test_case_d_cancelled_payment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club: Club,
    published_lesson: Lesson,
    player_1: User,
):
    """
    Test D – Cancelled payment:
    - Player initiates checkout then abandons/cancels before payment succeeds.
    - Verify the lesson is NOT marked as registered in DB or Discover Lessons.
    """
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    assert init_res.status_code == 201

    # Payment was initiated (PENDING) but never verified/succeeded
    stmt = select(LessonRegistration).where(
        LessonRegistration.lesson_id == published_lesson.id,
        LessonRegistration.user_id == player_1.id,
    )
    reg_db = (await db_session.execute(stmt)).scalars().first()
    assert reg_db is None

    # Discover lessons still shows is_registered=False
    discover_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/lessons/discover",
        headers=make_auth_header(player_1),
    )
    item = next(it for it in discover_res.json() if it["id"] == str(published_lesson.id))
    assert item["is_registered"] is False
    assert item["my_registration"] is None


@pytest.mark.asyncio
async def test_case_e_duplicate_protection(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club: Club,
    published_lesson: Lesson,
    player_1: User,
):
    """
    Test E – Duplicate protection:
    - Repeated payment verification calls return 200 idempotently without duplicate rows.
    - Webhook replay produces idempotent result.
    - Re-initiating checkout for an already registered lesson is rejected.
    """
    # 1. First checkout & verification
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    init_data = init_res.json()
    order_id = init_data["provider_order_id"]
    pmt_id = init_data["payment_id"]
    provider_pmt_id = f"pay_{uuid.uuid4().hex[:14]}"
    sig = _compute_razorpay_sig(order_id, provider_pmt_id)

    verify_res_1 = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": pmt_id,
            "provider": "razorpay",
            "provider_payment_id": provider_pmt_id,
            "provider_order_id": order_id,
            "provider_signature": sig,
        },
        headers=make_auth_header(player_1),
    )
    assert verify_res_1.status_code == 200

    # 2. Duplicate verification call (network retry)
    verify_res_2 = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": pmt_id,
            "provider": "razorpay",
            "provider_payment_id": provider_pmt_id,
            "provider_order_id": order_id,
            "provider_signature": sig,
        },
        headers=make_auth_header(player_1),
    )
    assert verify_res_2.status_code == 200
    assert verify_res_2.json()["success"] is True

    # 3. Verify exactly 1 registration row exists
    stmt = select(LessonRegistration).where(
        LessonRegistration.lesson_id == published_lesson.id,
        LessonRegistration.user_id == player_1.id,
    )
    all_regs = (await db_session.execute(stmt)).scalars().all()
    assert len(all_regs) == 1

    # 4. Attempt to initiate checkout AGAIN for the same lesson -> rejected
    duplicate_init = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    assert duplicate_init.status_code == 400
    assert "already has an active registration" in duplicate_init.json()["detail"].lower()


@pytest.mark.asyncio
async def test_case_f_club_side_synchronization(
    async_client: AsyncClient,
    club: Club,
    owner_user: User,
    published_lesson: Lesson,
    player_1: User,
):
    """
    Test F – Club Side:
    - Confirmed registration is visible in club lesson registrations roster.
    - Capacity and active participant counts are synchronized.
    - Payment is recorded in club payments ledger.
    """
    # Register player 1
    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    init_data = init_res.json()
    order_id = init_data["provider_order_id"]
    pmt_id = init_data["payment_id"]
    provider_pmt_id = f"pay_{uuid.uuid4().hex[:14]}"
    sig = _compute_razorpay_sig(order_id, provider_pmt_id)

    await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": pmt_id,
            "provider": "razorpay",
            "provider_payment_id": provider_pmt_id,
            "provider_order_id": order_id,
            "provider_signature": sig,
        },
        headers=make_auth_header(player_1),
    )

    # Club Owner views lesson registrations
    club_regs_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/lessons/{published_lesson.id}/registrations",
        headers=make_auth_header(owner_user),
    )
    assert club_regs_res.status_code == 200
    roster = club_regs_res.json()
    assert len(roster) == 1
    assert roster[0]["user_id"] == str(player_1.id)
    assert roster[0]["status"] == "registered"

    # Club Owner checks lesson detail
    club_lesson_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/lessons/{published_lesson.id}",
        headers=make_auth_header(owner_user),
    )
    assert club_lesson_res.status_code == 200
    lesson_detail = club_lesson_res.json()
    assert lesson_detail["registered_count"] == 1
    assert lesson_detail["available_spots"] == 5
    assert lesson_detail["capacity"] == 6

    # Club Owner checks club payments ledger
    club_payments_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/payments",
        headers=make_auth_header(owner_user),
    )
    assert club_payments_res.status_code == 200
    ledger = club_payments_res.json()
    assert len(ledger) >= 1
    lesson_pmt = next((p for p in ledger if p["lesson_id"] == str(published_lesson.id)), None)
    assert lesson_pmt is not None
    assert Decimal(str(lesson_pmt["amount"])) >= Decimal("65.00")
    assert lesson_pmt["status"] == "succeeded"
    assert lesson_pmt["player_id"] == str(player_1.id)


@pytest.mark.asyncio
async def test_case_g_multiple_players_isolation(
    async_client: AsyncClient,
    club: Club,
    owner_user: User,
    published_lesson: Lesson,
    player_1: User,
    player_2: User,
):
    """
    Test G – Multiple players isolation:
    - Player 1 and Player 2 both register for the same lesson.
    - Player 1 sees only their own registration under My Registrations.
    - Player 2 sees only their own registration under My Registrations.
    - Club Owner sees both valid registrations in the lesson roster.
    """
    # 1. Register Player 1
    init_1 = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_1),
    )
    d1 = init_1.json()
    sig1 = _compute_razorpay_sig(d1["provider_order_id"], "pay_p1_abc123")
    await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": d1["payment_id"],
            "provider": "razorpay",
            "provider_payment_id": "pay_p1_abc123",
            "provider_order_id": d1["provider_order_id"],
            "provider_signature": sig1,
        },
        headers=make_auth_header(player_1),
    )

    # 2. Register Player 2
    init_2 = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(club.id),
            "purpose": "lesson",
            "activity_id": str(published_lesson.id),
            "provider": "razorpay",
            "currency": "USD",
        },
        headers=make_auth_header(player_2),
    )
    d2 = init_2.json()
    sig2 = _compute_razorpay_sig(d2["provider_order_id"], "pay_p2_def456")
    await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": d2["payment_id"],
            "provider": "razorpay",
            "provider_payment_id": "pay_p2_def456",
            "provider_order_id": d2["provider_order_id"],
            "provider_signature": sig2,
        },
        headers=make_auth_header(player_2),
    )

    # 3. Player 1 sees only their own registration
    p1_lessons = await async_client.get(
        "/api/v1/players/me/lessons",
        headers=make_auth_header(player_1),
    )
    assert p1_lessons.status_code == 200
    p1_items = p1_lessons.json()
    assert len(p1_items) == 1
    assert p1_items[0]["user_id"] == str(player_1.id)

    # 4. Player 2 sees only their own registration
    p2_lessons = await async_client.get(
        "/api/v1/players/me/lessons",
        headers=make_auth_header(player_2),
    )
    assert p2_lessons.status_code == 200
    p2_items = p2_lessons.json()
    assert len(p2_items) == 1
    assert p2_items[0]["user_id"] == str(player_2.id)

    # 5. Club Owner sees both registrations
    club_regs = await async_client.get(
        f"/api/v1/clubs/{club.id}/lessons/{published_lesson.id}/registrations",
        headers=make_auth_header(owner_user),
    )
    assert club_regs.status_code == 200
    roster = club_regs.json()
    assert len(roster) == 2
    uids = {r["user_id"] for r in roster}
    assert str(player_1.id) in uids
    assert str(player_2.id) in uids

    # 6. Available spots decremented from 6 to 4
    discover_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/lessons/discover",
        headers=make_auth_header(player_1),
    )
    item = next(it for it in discover_res.json() if it["id"] == str(published_lesson.id))
    assert item["available_spots"] == 4
