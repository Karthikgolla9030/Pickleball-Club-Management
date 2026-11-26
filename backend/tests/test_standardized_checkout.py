"""
Aught2 Pickleball — Standardized Checkout & Payment Verification Tests

Covers:
1. `preview_only=True` returns server-verified price breakdown + gateway_ready flag
   without creating Payment or Booking/Registration rows.
2. `$0.00` tournaments and events preserve `is_free=True` and `final_amount == 0.00`
   (regression check for Python `or` falsy fallback bug).
3. `collect_payment=False` during `/payments/checkout/verify` fulfills the booking
   while keeping `Payment.status == PaymentStatus.PENDING` and `paid_at is None`.
   Player booking cancellation cancels the pending payment cleanly.
4. `payment_collected=False` on league registration preserves `PaymentStatus.PENDING`
   and leaves `paid_at` unset.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.payment import Payment, PaymentPurpose, PaymentStatus
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.user import User
from tests.conftest import make_auth_header


@pytest_asyncio.fixture
async def std_club(db_session: AsyncSession) -> Club:
    club = Club(name="Standard Checkout Club", slug=f"std-club-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def std_player(db_session: AsyncSession, std_club: Club) -> User:
    user = User(
        email=f"std-player-{uuid.uuid4().hex[:6]}@pickleball.test",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Jordan Standardized",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubPlayerMembership(
        club_id=std_club.id,
        user_id=user.id,
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add(membership)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def std_court(db_session: AsyncSession, std_club: Club) -> Court:
    court = Court(
        club_id=std_club.id,
        name="Court Alpha",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        price_per_hour=Decimal("60.00"),
        is_active=True,
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest.mark.asyncio
async def test_preview_only_returns_breakdown_without_persisting_records(
    async_client: AsyncClient,
    db_session: AsyncSession,
    std_club: Club,
    std_player: User,
    std_court: Court,
):
    start_at = (datetime.now(timezone.utc) + timedelta(days=2)).replace(minute=0, second=0, microsecond=0)
    end_at = start_at + timedelta(hours=1)

    res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(std_club.id),
            "purpose": "court_booking",
            "activity_id": str(std_court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
            "currency": "USD",
            "preview_only": True,
        },
        headers=make_auth_header(std_player),
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["reference"] == "PREVIEW"
    assert data["is_free"] is False
    assert data["gateway_ready"] is False
    # 60 base - 10% member discount (6) + 5% tax (2.70) = 56.70
    assert float(data["breakdown"]["base_amount"]) == 60.00
    assert float(data["breakdown"]["discount_amount"]) == 6.00
    assert float(data["breakdown"]["tax_amount"]) == 2.70
    assert float(data["breakdown"]["final_amount"]) == 56.70

    pay_rows = (
        await db_session.execute(select(Payment).where(Payment.player_id == std_player.id))
    ).scalars().all()
    assert len(pay_rows) == 0


@pytest.mark.asyncio
async def test_zero_dollar_tournament_and_event_stay_free(
    async_client: AsyncClient,
    db_session: AsyncSession,
    std_club: Club,
    std_player: User,
):
    now = datetime.now(timezone.utc)
    free_tournament = Tournament(
        club_id=std_club.id,
        name="Community Free Open",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=date.today() + timedelta(days=10),
        end_date=date.today() + timedelta(days=11),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=5),
        format_configuration={"registration_fee": 0, "category": "Singles"},
    )
    free_event = Event(
        club_id=std_club.id,
        title="Sunday Social Open Play",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=4),
        end_at=now + timedelta(days=4, hours=2),
        registration_fee=Decimal("0.00"),
        capacity=24,
        registration_required=True,
    )
    db_session.add_all([free_tournament, free_event])
    await db_session.flush()

    headers = make_auth_header(std_player)

    t_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(std_club.id),
            "purpose": "tournament",
            "activity_id": str(free_tournament.id),
            "currency": "INR",
            "preview_only": True,
        },
        headers=headers,
    )
    assert t_res.status_code == 201, t_res.text
    assert t_res.json()["is_free"] is True
    assert float(t_res.json()["breakdown"]["final_amount"]) == 0.00

    e_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(std_club.id),
            "purpose": "event",
            "activity_id": str(free_event.id),
            "currency": "INR",
            "preview_only": True,
        },
        headers=headers,
    )
    assert e_res.status_code == 201, e_res.text
    assert e_res.json()["is_free"] is True
    assert float(e_res.json()["breakdown"]["final_amount"]) == 0.00


@pytest.mark.asyncio
async def test_collect_payment_false_preserves_pending_and_cancels_cleanly(
    async_client: AsyncClient,
    db_session: AsyncSession,
    std_club: Club,
    std_player: User,
    std_court: Court,
):
    start_at = (datetime.now(timezone.utc) + timedelta(days=3)).replace(minute=0, second=0, microsecond=0)
    end_at = start_at + timedelta(hours=1)
    headers = make_auth_header(std_player)

    init_res = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json={
            "club_id": str(std_club.id),
            "purpose": "court_booking",
            "activity_id": str(std_court.id),
            "start_at": start_at.isoformat(),
            "end_at": end_at.isoformat(),
            "currency": "USD",
        },
        headers=headers,
    )
    assert init_res.status_code == 201, init_res.text
    init_data = init_res.json()

    verify_res = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": init_data["payment_id"],
            "provider": "direct",
            "provider_order_id": init_data["provider_order_id"],
            "collect_payment": False,
        },
        headers=headers,
    )
    assert verify_res.status_code == 200, verify_res.text
    verify_data = verify_res.json()
    assert verify_data["success"] is True
    assert verify_data["payment"]["status"] == "pending"
    assert verify_data["payment"]["paid_at"] is None
    assert verify_data["booking_or_registration"]["status"] == "confirmed"

    booking_id = verify_data["booking_or_registration"]["booking_id"]
    booking_row = (
        await db_session.execute(select(Booking).where(Booking.id == uuid.UUID(booking_id)))
    ).scalar_one()
    assert booking_row.status == BookingStatus.CONFIRMED

    # Player cancels booking -> pending payment becomes cancelled (not refunded)
    cancel_res = await async_client.post(
        f"/api/v1/bookings/{booking_id}/cancel",
        headers=headers,
    )
    assert cancel_res.status_code == 200, cancel_res.text

    pay_row = (
        await db_session.execute(select(Payment).where(Payment.id == uuid.UUID(init_data["payment_id"])))
    ).scalar_one()
    await db_session.refresh(pay_row)
    assert pay_row.status == PaymentStatus.CANCELLED


@pytest.mark.asyncio
async def test_league_register_with_payment_collected_false_keeps_pending_payment(
    async_client: AsyncClient,
    db_session: AsyncSession,
    std_club: Club,
    std_player: User,
):
    now = datetime.now(timezone.utc)
    league = League(
        club_id=std_club.id,
        name="Fall Singles Ladder",
        status=LeagueStatus.REGISTRATION_OPEN,
        number_of_weeks=6,
        current_week=1,
        team_size=1,
        playoff_team_count=4,
        max_teams=12,
        registration_fee=Decimal("45.00"),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=5),
    )
    db_session.add(league)
    await db_session.flush()

    headers = make_auth_header(std_player)
    res = await async_client.post(
        f"/api/v1/leagues/{league.id}/register",
        json={
            "team_name": "Jordan Singles",
            "skill_rating": 3.5,
            "payment_collected": False,
        },
        headers=headers,
    )
    assert res.status_code == 201, res.text

    pay_row = (
        await db_session.execute(
            select(Payment).where(
                Payment.league_id == league.id,
                Payment.player_id == std_player.id,
            )
        )
    ).scalar_one_or_none()
    assert pay_row is not None
    assert pay_row.purpose == PaymentPurpose.LEAGUE
    assert pay_row.status == PaymentStatus.PENDING
    assert pay_row.paid_at is None
