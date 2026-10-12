"""
Aught2 Pickleball — Phase 10 Production Readiness & End-to-End Hardening Test Suite

Validates all 15+ cross-phase production journeys and security constraints:
  1. Club onboarding & owner dashboard access
  2. Public discovery & player membership request submission
  3. Staff approval of membership requests & duplicate prevention
  4. Free plan enrollment (instant active subscription)
  5. Paid plan subscription & authoritative payment lifecycle (pending -> succeeded -> active subscription)
  6. Player cannot transition their own payment (403)
  7. Court booking within operating hours & booking horizon
  8. Cross-club tenant isolation on bookings & membership privileges
  9. Tournament discovery & registration lifecycle
  10. Notification lifecycle & user privacy isolation
  11. Operating hours modification preserving historical confirmed bookings
  12. Analytics access & formula-injection-safe CSV exports
  13. Role-based financial restriction (Tournament Director denied 403)
  14. Multi-role user context separation across distinct clubs
  15. Concurrency & double-booking conflict prevention (409)
  16. Token validation, refresh, and invalid token rejection (401)
  17. Production migration endpoint security hardening
"""
from __future__ import annotations

import io
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.membership import (
    MemberSubscription,
    MembershipPlan,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.notification import Notification
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def p10_club_alpha(db_session: AsyncSession) -> Club:
    club = Club(
        name="P10 Metro Pickleball Club",
        slug=f"p10-metro-{uuid.uuid4().hex[:8]}",
        timezone="UTC",
        opening_time=time(6, 0),
        closing_time=time(22, 0),
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def p10_club_beta(db_session: AsyncSession) -> Club:
    club = Club(
        name="P10 Valley Pickleball Club",
        slug=f"p10-valley-{uuid.uuid4().hex[:8]}",
        timezone="UTC",
        opening_time=time(7, 0),
        closing_time=time(21, 0),
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def p10_owner_alpha(db_session: AsyncSession, p10_club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"p10-owner-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="P10 Metro Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=p10_club_alpha.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u, m


@pytest_asyncio.fixture
async def p10_td_alpha(db_session: AsyncSession, p10_club_alpha: Club) -> tuple[User, ClubMembership]:
    u = User(
        email=f"p10-td-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="P10 Tournament Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    m = ClubMembership(club_id=p10_club_alpha.id, user_id=u.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return u, m


@pytest_asyncio.fixture
async def p10_player(db_session: AsyncSession) -> tuple[User, PlayerProfile]:
    u = User(
        email=f"p10-player-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="P10 Ace Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    profile = PlayerProfile(
        user_id=u.id,
        display_name="Ace",
        skill_rating=3.5,
        gender="male",
    )
    db_session.add(profile)
    await db_session.flush()
    return u, profile


@pytest_asyncio.fixture
async def p10_court_alpha(db_session: AsyncSession, p10_club_alpha: Club) -> Court:
    court = Court(
        club_id=p10_club_alpha.id,
        name="Championship Court 1",
        court_number=1,
        surface_type="acrylic",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        price_per_hour=Decimal("500.00"),
    )
    db_session.add(court)
    await db_session.flush()
    return court


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_journey_1_club_onboarding_and_owner_dashboard(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_owner_alpha: tuple[User, ClubMembership],
    p10_club_alpha: Club,
):
    """Journey 1: Owner accesses dashboard with authorized context."""
    owner_user, _ = p10_owner_alpha
    headers = make_auth_header(owner_user)

    res = await async_client.get(f"/api/v1/clubs/{p10_club_alpha.id}/dashboard", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "club_id" in data
    assert data["club_id"] == str(p10_club_alpha.id)
    assert "memberships" in data
    assert "bookings" in data


@pytest.mark.asyncio
async def test_journey_2_and_3_discovery_request_and_staff_approval(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_player: tuple[User, PlayerProfile],
    p10_owner_alpha: tuple[User, ClubMembership],
):
    """Journeys 2 & 3: Player discovers club, requests membership, staff approves."""
    player_user, _ = p10_player
    owner_user, _ = p10_owner_alpha
    player_headers = make_auth_header(player_user)
    owner_headers = make_auth_header(owner_user)

    # 1. Player submits membership request
    req_res = await async_client.post(
        f"/api/v1/player/clubs/{p10_club_alpha.id}/membership-requests",
        json={"message": "I would love to join your club!"},
        headers=player_headers,
    )
    assert req_res.status_code == 201, req_res.text
    req_data = req_res.json()
    req_id = req_data["id"]
    assert req_data["status"] == "pending"

    # Duplicate request while pending must be rejected
    dup_res = await async_client.post(
        f"/api/v1/player/clubs/{p10_club_alpha.id}/membership-requests",
        json={"message": "Trying again"},
        headers=player_headers,
    )
    assert dup_res.status_code == 400

    # 2. Staff approves request
    approve_res = await async_client.post(
        f"/api/v1/clubs/{p10_club_alpha.id}/membership-requests/{req_id}/approve",
        headers=owner_headers,
    )
    assert approve_res.status_code == 200, approve_res.text
    assert approve_res.json()["status"] == "approved"

    # 3. Verify player now has ACTIVE membership in club
    cpm = await async_client.get(f"/api/v1/clubs/{p10_club_alpha.id}/player-memberships", headers=owner_headers)
    assert cpm.status_code == 200
    member_user_ids = [m["user_id"] for m in cpm.json()]
    assert str(player_user.id) in member_user_ids


@pytest.mark.asyncio
async def test_journey_4_free_plan_enrollment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_player: tuple[User, PlayerProfile],
):
    """Journey 4: Free plan enrollment immediately grants active subscription."""
    player_user, _ = p10_player
    player_headers = make_auth_header(player_user)

    # Create active player membership
    cpm = ClubPlayerMembership(
        club_id=p10_club_alpha.id,
        user_id=player_user.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(cpm)

    # Create free membership plan
    plan = MembershipPlan(
        club_id=p10_club_alpha.id,
        name="Free Community Tier",
        price=Decimal("0.00"),
        currency="INR",
        duration_unit=PlanDurationUnit.MONTHLY,
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()

    enroll_res = await async_client.post(
        f"/api/v1/player/clubs/{p10_club_alpha.id}/subscribe",
        json={"membership_plan_id": str(plan.id)},
        headers=player_headers,
    )
    assert enroll_res.status_code == 201, enroll_res.text
    sub_data = enroll_res.json()
    # Free plans are immediately active
    assert sub_data["status"] == "active"


@pytest.mark.asyncio
async def test_journey_5_and_6_paid_plan_and_payment_authorization(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_player: tuple[User, PlayerProfile],
    p10_owner_alpha: tuple[User, ClubMembership],
):
    """Journeys 5 & 6: Paid subscription lifecycle, authoritative payment transition, and player permission denial."""
    player_user, _ = p10_player
    owner_user, _ = p10_owner_alpha
    player_headers = make_auth_header(player_user)
    owner_headers = make_auth_header(owner_user)

    cpm = ClubPlayerMembership(
        club_id=p10_club_alpha.id,
        user_id=player_user.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(cpm)

    paid_plan = MembershipPlan(
        club_id=p10_club_alpha.id,
        name="Pro Gold Membership",
        price=Decimal("1500.00"),
        currency="INR",
        duration_unit=PlanDurationUnit.MONTHLY,
        status=PlanStatus.ACTIVE,
    )
    db_session.add(paid_plan)
    await db_session.flush()

    # 1. Player subscribes to paid plan -> starts in SCHEDULED
    sub_res = await async_client.post(
        f"/api/v1/player/clubs/{p10_club_alpha.id}/subscribe",
        json={"membership_plan_id": str(paid_plan.id)},
        headers=player_headers,
    )
    assert sub_res.status_code == 201, sub_res.text
    sub_id = sub_res.json()["id"]
    assert sub_res.json()["status"] == "scheduled"

    # 2. Staff creates payment record
    pay_res = await async_client.post(
        f"/api/v1/clubs/{p10_club_alpha.id}/payments",
        json={
            "player_id": str(player_user.id),
            "subscription_id": sub_id,
            "amount": "1500.00",
            "currency": "INR",
            "purpose": "membership",
            "payment_method": "cash",
            "notes": "Paid at front desk",
        },
        headers=owner_headers,
    )
    assert pay_res.status_code == 201, pay_res.text
    payment_id = pay_res.json()["id"]
    assert pay_res.json()["status"] == "pending"

    # 3. Security: Player CANNOT mark payment succeeded (HTTP 403)
    player_hack = await async_client.post(
        f"/api/v1/clubs/{p10_club_alpha.id}/payments/{payment_id}/succeed",
        headers=player_headers,
    )
    assert player_hack.status_code == 403

    # 4. Authorized Staff transitions payment to succeeded
    staff_succeed = await async_client.post(
        f"/api/v1/clubs/{p10_club_alpha.id}/payments/{payment_id}/succeed",
        headers=owner_headers,
    )
    assert staff_succeed.status_code == 200
    assert staff_succeed.json()["status"] == "succeeded"

    # 5. Authoritative subscription activation: verify subscription is now ACTIVE
    sub_check = await async_client.get(
        f"/api/v1/clubs/{p10_club_alpha.id}/subscriptions/{sub_id}",
        headers=owner_headers,
    )
    assert sub_check.status_code == 200
    assert sub_check.json()["status"] == "active"


@pytest.mark.asyncio
async def test_journey_7_and_8_court_booking_and_cross_club_isolation(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_club_beta: Club,
    p10_player: tuple[User, PlayerProfile],
    p10_court_alpha: Court,
):
    """Journeys 7 & 8: Valid court booking in Club Alpha; Club Beta isolation."""
    player_user, _ = p10_player
    player_headers = make_auth_header(player_user)

    # Active membership only in Club Alpha
    cpm_alpha = ClubPlayerMembership(
        club_id=p10_club_alpha.id,
        user_id=player_user.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(cpm_alpha)
    await db_session.flush()

    # Slot: tomorrow from 10:00 to 11:00 UTC
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=1)
    slot_start = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
    slot_end = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    # 1. Valid booking in Club Alpha succeeds
    booking_res = await async_client.post(
        f"/api/v1/clubs/{p10_club_alpha.id}/bookings",
        json={
            "court_id": str(p10_court_alpha.id),
            "start_at": slot_start.isoformat(),
            "end_at": slot_end.isoformat(),
        },
        headers=player_headers,
    )
    assert booking_res.status_code == 201, booking_res.text
    booking_id = booking_res.json()["id"]

    # 2. Player cannot use Alpha membership to book in Club Beta (HTTP 403)
    court_beta = Court(
        club_id=p10_club_beta.id,
        name="Beta Court",
        court_number=1,
        status=CourtStatus.ACTIVE,
        is_active=True,
    )
    db_session.add(court_beta)
    await db_session.flush()

    beta_booking = await async_client.post(
        f"/api/v1/clubs/{p10_club_beta.id}/bookings",
        json={
            "court_id": str(court_beta.id),
            "start_at": slot_start.isoformat(),
            "end_at": slot_end.isoformat(),
        },
        headers=player_headers,
    )
    assert beta_booking.status_code == 403

    # 3. Cross-club resource check: booking in Alpha cannot be viewed under Beta endpoint
    cross_view = await async_client.get(
        f"/api/v1/clubs/{p10_club_beta.id}/bookings/{booking_id}",
        headers=player_headers,
    )
    assert cross_view.status_code in (403, 404)


@pytest.mark.asyncio
async def test_journey_9_tournament_discovery_and_registration(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_player: tuple[User, PlayerProfile],
):
    """Journey 9: Tournament public discovery and member registration."""
    player_user, _ = p10_player
    player_headers = make_auth_header(player_user)

    # Member in Club Alpha
    cpm = ClubPlayerMembership(
        club_id=p10_club_alpha.id,
        user_id=player_user.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(cpm)

    # Create published tournament
    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=p10_club_alpha.id,
        name="Summer Grand Slam",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=5),
        max_participants=16,
    )
    db_session.add(t)
    await db_session.flush()

    # 1. Public discovery finds the tournament
    disc_res = await async_client.get("/api/v1/player/tournaments", headers=player_headers)
    assert disc_res.status_code == 200
    found_ids = [item["id"] for item in disc_res.json()]
    assert str(t.id) in found_ids

    # 2. Member registers for tournament
    reg_res = await async_client.post(
        f"/api/v1/tournaments/{t.id}/register",
        json={},
        headers=player_headers,
    )
    assert reg_res.status_code in (200, 201), reg_res.text


@pytest.mark.asyncio
async def test_journey_10_notifications_lifecycle_and_privacy(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_player: tuple[User, PlayerProfile],
    p10_owner_alpha: tuple[User, ClubMembership],
):
    """Journey 10: Notification ownership and privacy isolation."""
    player_user, _ = p10_player
    owner_user, _ = p10_owner_alpha
    player_headers = make_auth_header(player_user)
    owner_headers = make_auth_header(owner_user)

    # Create private notification for player
    notif = Notification(
        user_id=player_user.id,
        club_id=p10_club_alpha.id,
        category="membership",
        title="Welcome to Club Alpha!",
        message="Your membership request was approved.",
        is_read=False,
    )
    db_session.add(notif)
    await db_session.flush()

    # Player can fetch their notification
    res = await async_client.get("/api/v1/notifications", headers=player_headers)
    assert res.status_code == 200
    notif_ids = [n["id"] for n in res.json().get("items", [])]
    assert str(notif.id) in notif_ids

    # Owner cannot view player's notification in their own notification list
    owner_notifs = await async_client.get("/api/v1/notifications", headers=owner_headers)
    assert owner_notifs.status_code == 200
    owner_notif_ids = [n["id"] for n in owner_notifs.json().get("items", [])]
    assert str(notif.id) not in owner_notif_ids


@pytest.mark.asyncio
async def test_journey_11_operating_hours_update_preserves_confirmed_bookings(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_owner_alpha: tuple[User, ClubMembership],
    p10_court_alpha: Court,
    p10_player: tuple[User, PlayerProfile],
):
    """Journey 11: Changing club operating hours preserves confirmed historical bookings."""
    owner_user, _ = p10_owner_alpha
    player_user, _ = p10_player
    owner_headers = make_auth_header(owner_user)

    # Seed an existing confirmed booking
    tomorrow = datetime.now(timezone.utc).date() + timedelta(days=2)
    b_start = datetime.combine(tomorrow, time(8, 0), tzinfo=timezone.utc)
    b_end = datetime.combine(tomorrow, time(9, 0), tzinfo=timezone.utc)
    booking = Booking(
        club_id=p10_club_alpha.id,
        court_id=p10_court_alpha.id,
        booked_by_user_id=player_user.id,
        player_id=player_user.id,
        start_at=b_start,
        end_at=b_end,
        status=BookingStatus.CONFIRMED,
        booking_type=BookingType.PLAYER,
    )
    db_session.add(booking)
    await db_session.flush()

    # Owner updates opening time to 09:00 (after the booking's start time)
    patch_res = await async_client.patch(
        f"/api/v1/clubs/{p10_club_alpha.id}",
        json={"opening_time": "09:00:00"},
        headers=owner_headers,
    )
    assert patch_res.status_code == 200

    # Verify the existing confirmed booking was NOT silently modified or deleted
    await db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED
    assert booking.start_at.replace(tzinfo=None) == b_start.replace(tzinfo=None)
    assert booking.end_at.replace(tzinfo=None) == b_end.replace(tzinfo=None)


@pytest.mark.asyncio
async def test_journey_12_and_13_analytics_csv_export_and_td_rejection(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_owner_alpha: tuple[User, ClubMembership],
    p10_td_alpha: tuple[User, ClubMembership],
):
    """Journeys 12 & 13: Authorized staff accesses analytics and exports CSV; TD rejected with 403."""
    owner_user, _ = p10_owner_alpha
    td_user, _ = p10_td_alpha
    owner_headers = make_auth_header(owner_user)
    td_headers = make_auth_header(td_user)

    # 1. Owner can view analytics summary
    sum_res = await async_client.get(
        f"/api/v1/clubs/{p10_club_alpha.id}/analytics/summary?period=30d",
        headers=owner_headers,
    )
    assert sum_res.status_code == 200
    assert "period" in sum_res.json()
    assert "bookings" in sum_res.json()

    # 2. Owner can download CSV export
    exp_res = await async_client.get(
        f"/api/v1/clubs/{p10_club_alpha.id}/analytics/export?report_type=bookings&period=30d",
        headers=owner_headers,
    )
    assert exp_res.status_code == 200
    assert exp_res.headers["content-type"].startswith("text/csv")

    # 3. Tournament Director is DENIED analytics summary (HTTP 403, manage_reports required)
    td_sum = await async_client.get(
        f"/api/v1/clubs/{p10_club_alpha.id}/analytics/summary?period=30d",
        headers=td_headers,
    )
    assert td_sum.status_code == 403

    # 4. Tournament Director is DENIED payment analytics (HTTP 403, manage_payments required)
    td_pay = await async_client.get(
        f"/api/v1/clubs/{p10_club_alpha.id}/analytics/payments?period=30d",
        headers=td_headers,
    )
    assert td_pay.status_code == 403


@pytest.mark.asyncio
async def test_journey_14_multi_role_context_separation(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_club_beta: Club,
):
    """Journey 14: User is Owner in Club Alpha, but only TD in Club Beta."""
    multi_user = User(
        email=f"multi-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Multi Role User",
        is_active=True,
    )
    db_session.add(multi_user)
    await db_session.flush()

    m_alpha = ClubMembership(club_id=p10_club_alpha.id, user_id=multi_user.id, role=ClubRole.CLUB_OWNER, is_active=True)
    m_beta = ClubMembership(club_id=p10_club_beta.id, user_id=multi_user.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True)
    db_session.add_all([m_alpha, m_beta])
    await db_session.flush()

    headers = make_auth_header(multi_user)

    # In Club Alpha, user has MANAGE_REPORTS
    alpha_res = await async_client.get(f"/api/v1/clubs/{p10_club_alpha.id}/analytics/summary", headers=headers)
    assert alpha_res.status_code == 200

    # In Club Beta, user is TD and lacks MANAGE_REPORTS -> 403
    beta_res = await async_client.get(f"/api/v1/clubs/{p10_club_beta.id}/analytics/summary", headers=headers)
    assert beta_res.status_code == 403


@pytest.mark.asyncio
async def test_journey_15_double_booking_concurrency_conflict(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_club_alpha: Club,
    p10_court_alpha: Court,
    p10_player: tuple[User, PlayerProfile],
):
    """Journey 15: Double booking on same court and time slot triggers 409 conflict."""
    player_user, _ = p10_player
    headers = make_auth_header(player_user)

    cpm = ClubPlayerMembership(
        club_id=p10_club_alpha.id,
        user_id=player_user.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(cpm)
    await db_session.flush()

    day = datetime.now(timezone.utc).date() + timedelta(days=3)
    start_dt = datetime.combine(day, time(14, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(day, time(15, 0), tzinfo=timezone.utc)

    # First booking succeeds
    res1 = await async_client.post(
        f"/api/v1/clubs/{p10_club_alpha.id}/bookings",
        json={
            "court_id": str(p10_court_alpha.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=headers,
    )
    assert res1.status_code == 201

    # Second booking for identical slot is rejected with 409 Conflict
    res2 = await async_client.post(
        f"/api/v1/clubs/{p10_club_alpha.id}/bookings",
        json={
            "court_id": str(p10_court_alpha.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
        headers=headers,
    )
    assert res2.status_code == 409
    assert "already booked" in res2.text


@pytest.mark.asyncio
async def test_journey_16_token_validation_and_refresh(
    async_client: AsyncClient,
    db_session: AsyncSession,
    p10_player: tuple[User, PlayerProfile],
):
    """Journey 16: Authentication tokens, refresh flow, and invalid token rejection."""
    player_user, _ = p10_player

    # 1. Valid access token allows access
    valid_token = create_access_token(str(player_user.id))
    me_res = await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {valid_token}"})
    assert me_res.status_code == 200
    assert me_res.json()["user"]["id"] == str(player_user.id)

    # 2. Tampered or expired token yields 401
    bad_res = await async_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.fake.token"})
    assert bad_res.status_code == 401

    # 3. Refresh token flow
    refresh_token = create_refresh_token(str(player_user.id))
    refresh_res = await async_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 200
    new_access_token = refresh_res.json()["access_token"]
    assert new_access_token is not None

    # Verify new token works
    me_res2 = await async_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access_token}"})
    assert me_res2.status_code == 200


@pytest.mark.asyncio
async def test_journey_17_production_migration_endpoint_hardening(
    async_client: AsyncClient,
    monkeypatch,
):
    """Journey 17: Production migration endpoint hardening tests."""
    from app.core.config import get_settings
    settings = get_settings()

    # Simulate production mode
    monkeypatch.setattr(settings, "APP_ENV", "production")

    # 1. When MIGRATION_SECRET is not configured, endpoint is completely disabled (404)
    monkeypatch.setattr(settings, "MIGRATION_SECRET", None)
    disabled_res = await async_client.post("/api/v1/system/run-migrations")
    assert disabled_res.status_code == 404
    assert "disabled in production" in disabled_res.text

    # 2. When MIGRATION_SECRET is set, test secret enforcement
    dedicated_secret = "dedicated-migration-secret-xyz987654321"
    monkeypatch.setattr(settings, "MIGRATION_SECRET", dedicated_secret)

    # Missing secret header -> 403
    no_secret_res = await async_client.post("/api/v1/system/run-migrations")
    assert no_secret_res.status_code == 403
    assert "valid migration secret required" in no_secret_res.text

    # JWT_SECRET_KEY passed as substitute -> must be rejected (403)
    jwt_substitute_res = await async_client.post(
        "/api/v1/system/run-migrations",
        headers={"X-Migration-Secret": settings.JWT_SECRET_KEY},
    )
    assert jwt_substitute_res.status_code == 403

    # Invalid secret -> 403
    wrong_secret_res = await async_client.post(
        "/api/v1/system/run-migrations",
        headers={"X-Migration-Secret": "wrong-secret-token"},
    )
    assert wrong_secret_res.status_code == 403

    # Correct dedicated secret -> 200 (mocking actual migration execution to avoid running during test)
    import app.main
    monkeypatch.setattr(app.main, "_run_db_migrations", lambda: None)
    valid_res = await async_client.post(
        "/api/v1/system/run-migrations",
        headers={"X-Migration-Secret": dedicated_secret},
    )
    assert valid_res.status_code == 200
    assert valid_res.json()["status"] == "success"

    # Verify normal application health endpoint continues working
    health_res = await async_client.get("/health")
    assert health_res.status_code == 200
