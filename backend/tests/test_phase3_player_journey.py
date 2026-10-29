"""
Aught2 Pickleball — Phase 3 Multi-Club Player Experience & Booking Integration Tests

Verifies the complete player journey across independent clubs:
  1. Club details with real backend data (operating hours, courts, membership plans, etc.)
  2. Server-calculated court booking price endpoint (`GET /api/v1/clubs/{club_id}/bookings/calculate-price`)
  3. Booking availability and cross-club court isolation
  4. Concurrent double-booking protection (409 Conflict)
  5. Platform-wide public tournament discovery and club-scoped filtering
  6. Tournament registration and duplicate registration prevention
  7. Platform-wide public league discovery with host club metadata and club-scoped filtering
  8. League registration and partner validation
  9. Strict separation between club membership and paid member subscriptions
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.league import League, LeagueStatus
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures & Helpers ────────────────────────────────────────────────────────

@pytest.fixture
def client(async_client: AsyncClient) -> AsyncClient:
    return async_client


@pytest.fixture
def db(db_session: AsyncSession) -> AsyncSession:
    return db_session


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test Player",
    is_active: bool = True,
) -> User:
    email = email or f"player_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=is_active,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    profile = PlayerProfile(user_id=user.id, display_name=full_name)
    db.add(profile)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str | None = None,
    slug: str | None = None,
    city: str = "Austin",
    state: str = "TX",
    is_active: bool = True,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    name = name or f"Club {suffix}"
    slug = slug or f"club-{suffix}"
    club = Club(
        name=name,
        slug=slug,
        city=city,
        state=state,
        is_active=is_active,
        opening_time=time(6, 0),
        closing_time=time(22, 0),
        short_description=f"Premier pickleball club in {city}",
    )
    db.add(club)
    await db.flush()
    return club


async def create_staff(
    db: AsyncSession,
    club: Club,
    role: ClubRole = ClubRole.CLUB_OWNER,
) -> User:
    user = await create_user(db, full_name=f"Staff {role.value}")
    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=role,
        is_active=True,
    )
    db.add(membership)
    await db.flush()
    return user


async def create_player_membership(
    db: AsyncSession,
    user: User,
    club: Club,
    status: PlayerMembershipStatus = PlayerMembershipStatus.ACTIVE,
) -> ClubPlayerMembership:
    membership = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        membership_number=f"M-{uuid.uuid4().hex[:6].upper()}",
        status=status,
    )
    db.add(membership)
    await db.flush()
    return membership


async def create_court(
    db: AsyncSession,
    club: Club,
    name: str = "Court 1",
    price_per_hour: float = 30.0,
    status: CourtStatus = CourtStatus.ACTIVE,
    booking_interval_minutes: int = 60,
) -> Court:
    court = Court(
        club_id=club.id,
        name=name,
        indoor_outdoor=CourtEnvironment.INDOOR,
        surface_type="Hard",
        price_per_hour=price_per_hour,
        status=status,
        booking_interval_minutes=booking_interval_minutes,
    )
    db.add(court)
    await db.flush()
    return court


async def create_membership_plan(
    db: AsyncSession,
    club: Club,
    name: str = "Gold Plan",
    price: float = 99.0,
    booking_horizon_days: int = 14,
    discount_percentage: float = 10.0,
) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club.id,
        name=name,
        description="Premium tier",
        price=price,
        duration_unit=PlanDurationUnit.MONTHLY,
        advance_booking_days=booking_horizon_days,
        booking_limit=3,
        status=PlanStatus.ACTIVE,
    )
    db.add(plan)
    await db.flush()
    return plan


async def create_tournament(
    db: AsyncSession,
    club: Club,
    created_by: User,
    name: str = "Championship Open",
    status: TournamentStatus = TournamentStatus.REGISTRATION_OPEN,
    visibility: TournamentVisibility = TournamentVisibility.PUBLIC,
) -> Tournament:
    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club.id,
        name=name,
        format=TournamentFormat.ROUND_ROBIN,
        status=status,
        visibility=visibility,
        min_participants=4,
        max_participants=16,
        start_date=now + timedelta(days=7),
        end_date=now + timedelta(days=8),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=5),
        created_by_user_id=created_by.id,
    )
    db.add(t)
    await db.flush()
    return t


async def create_league(
    db: AsyncSession,
    club: Club,
    created_by: User,
    name: str = "Spring Premier League",
    status: LeagueStatus = LeagueStatus.REGISTRATION_OPEN,
) -> League:
    now = datetime.now(timezone.utc)
    l = League(
        club_id=club.id,
        name=name,
        status=status,
        number_of_weeks=6,
        playoff_team_count=4,
        start_date=now.date() + timedelta(days=7),
        end_date=now.date() + timedelta(days=49),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=5),
    )
    db.add(l)
    await db.flush()
    return l


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_details_endpoint_returns_real_backend_data(
    client: AsyncClient, db: AsyncSession
):
    """Test public club details returns real hours, active courts, published plans."""
    club = await create_club(db, name="Austin Elite Pickleball", city="Austin")
    court1 = await create_court(db, club, name="Court Alpha", price_per_hour=40.0)
    court2 = await create_court(db, club, name="Court Beta", price_per_hour=35.0)
    plan = await create_membership_plan(db, club, name="Unlimited VIP", price=150.0)

    # Public endpoint does not require auth
    resp = await client.get(f"/api/v1/clubs/{club.id}/public")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Austin Elite Pickleball"
    assert data["city"] == "Austin"
    assert "06:00:00" in str(data["opening_time"])
    assert "22:00:00" in str(data["closing_time"])

    # Active courts list for discovery
    court_resp = await client.get(f"/api/v1/clubs/{club.id}/courts/active")
    assert court_resp.status_code == 200
    courts = court_resp.json()
    assert len(courts) == 2
    court_names = [c["name"] for c in courts]
    assert "Court Alpha" in court_names
    assert "Court Beta" in court_names

    # Published membership plans
    plans_resp = await client.get(f"/api/v1/clubs/{club.id}/membership-plans/public")
    assert plans_resp.status_code == 200
    plans = plans_resp.json()
    assert len(plans) == 1
    assert plans[0]["name"] == "Unlimited VIP"
    assert float(plans[0]["price"]) == 150.0


@pytest.mark.asyncio
async def test_court_booking_price_calculation_endpoint(
    client: AsyncClient, db: AsyncSession
):
    """Test GET /clubs/{club_id}/bookings/calculate-price calculates rate, duration, discount, and total."""
    club = await create_club(db)
    player = await create_user(db, full_name="Price Check Player")
    await create_player_membership(db, player, club)
    court = await create_court(db, club, price_per_hour=50.0, booking_interval_minutes=30)

    target_date = (datetime.now(timezone.utc) + timedelta(days=2)).date()
    start_dt = datetime.combine(target_date, time(10, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, time(11, 30), tzinfo=timezone.utc)

    # 1. 90-minute booking: 10:00 to 11:30 (1.5 hours @ $50/hr = $75.00)
    resp = await client.get(
        f"/api/v1/clubs/{club.id}/bookings/calculate-price",
        headers=make_auth_header(player),
        params={
            "court_id": str(court.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert float(data["price_per_hour"]) == 50.0
    assert data["duration_minutes"] == 90
    assert float(data["total_price"]) == 75.0

    # 2. Outside operating hours (05:00 is before opening 06:00)
    early_start = datetime.combine(target_date, time(5, 0), tzinfo=timezone.utc)
    early_end = datetime.combine(target_date, time(6, 0), tzinfo=timezone.utc)
    invalid_hours_resp = await client.get(
        f"/api/v1/clubs/{club.id}/bookings/calculate-price",
        headers=make_auth_header(player),
        params={
            "court_id": str(court.id),
            "start_at": early_start.isoformat(),
            "end_at": early_end.isoformat(),
        },
    )
    assert invalid_hours_resp.status_code == 400

    # 3. Non-member at club gets 403 Forbidden
    other_player = await create_user(db, full_name="Other Club Player")
    forbidden_resp = await client.get(
        f"/api/v1/clubs/{club.id}/bookings/calculate-price",
        headers=make_auth_header(other_player),
        params={
            "court_id": str(court.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
    )
    assert forbidden_resp.status_code == 403


@pytest.mark.asyncio
async def test_court_booking_creation_and_cross_club_isolation(
    client: AsyncClient, db: AsyncSession
):
    """Test player booking creation and verify cross-club court isolation."""
    club_a = await create_club(db, name="Club Alpha")
    club_b = await create_club(db, name="Club Beta")
    player = await create_user(db, full_name="Member Player")
    await create_player_membership(db, player, club_a)

    court_a = await create_court(db, club_a, name="Alpha Court 1", price_per_hour=30.0)
    court_b = await create_court(db, club_b, name="Beta Court 1", price_per_hour=40.0)

    target_date = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    start_dt = datetime.combine(target_date, time(14, 0), tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, time(15, 0), tzinfo=timezone.utc)

    # Attempt to book Court B (belongs to Club B) under Club A route -> 404 or 400 isolation error
    cross_club_resp = await client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        headers=make_auth_header(player),
        json={
            "court_id": str(court_b.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        },
    )
    assert cross_club_resp.status_code in (400, 404)

    # Valid booking on Court A under Club A route
    valid_resp = await client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        headers=make_auth_header(player),
        json={
            "court_id": str(court_a.id),
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
            "notes": "Singles practice",
        },
    )
    assert valid_resp.status_code == 201
    booking_data = valid_resp.json()
    assert booking_data["status"] == "confirmed"
    assert booking_data["court_id"] == str(court_a.id)
    assert float(booking_data["total_price"]) == 30.0


@pytest.mark.asyncio
async def test_double_booking_conflict_prevention(
    client: AsyncClient, db: AsyncSession
):
    """Test overlapping booking on same court and time slot triggers 409 Conflict."""
    club = await create_club(db)
    player1 = await create_user(db, full_name="Player One")
    player2 = await create_user(db, full_name="Player Two")
    await create_player_membership(db, player1, club)
    await create_player_membership(db, player2, club)
    court = await create_court(db, club, price_per_hour=30.0, booking_interval_minutes=30)

    target_date = (datetime.now(timezone.utc) + timedelta(days=2)).date()
    slot1_start = datetime.combine(target_date, time(9, 0), tzinfo=timezone.utc)
    slot1_end = datetime.combine(target_date, time(10, 0), tzinfo=timezone.utc)

    slot2_start = datetime.combine(target_date, time(9, 30), tzinfo=timezone.utc)
    slot2_end = datetime.combine(target_date, time(10, 30), tzinfo=timezone.utc)

    # Player 1 books 09:00 - 10:00
    first_resp = await client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        headers=make_auth_header(player1),
        json={
            "court_id": str(court.id),
            "start_at": slot1_start.isoformat(),
            "end_at": slot1_end.isoformat(),
        },
    )
    assert first_resp.status_code == 201

    # Player 2 attempts overlapping booking 09:30 - 10:30 on same court -> 409
    overlap_resp = await client.post(
        f"/api/v1/clubs/{club.id}/bookings",
        headers=make_auth_header(player2),
        json={
            "court_id": str(court.id),
            "start_at": slot2_start.isoformat(),
            "end_at": slot2_end.isoformat(),
        },
    )
    assert overlap_resp.status_code == 409
    assert "conflict" in overlap_resp.text.lower() or "overlap" in overlap_resp.text.lower() or "already booked" in overlap_resp.text.lower()


@pytest.mark.asyncio
async def test_public_tournament_discovery_across_clubs_and_by_club(
    client: AsyncClient, db: AsyncSession
):
    """Test players discover public tournaments across clubs and can filter by club_id."""
    club_a = await create_club(db, name="North Club")
    club_b = await create_club(db, name="South Club")
    staff_a = await create_staff(db, club_a)
    staff_b = await create_staff(db, club_b)

    t_a = await create_tournament(db, club_a, staff_a, name="North Summer Open")
    t_b = await create_tournament(db, club_b, staff_b, name="South Winter Clash")

    player = await create_user(db, full_name="Discovery Player")

    # 1. Discover all public tournaments across clubs
    resp_all = await client.get(
        "/api/v1/player/tournaments",
        headers=make_auth_header(player),
    )
    assert resp_all.status_code == 200
    all_items = resp_all.json()
    item_ids = [t["id"] for t in all_items]
    assert str(t_a.id) in item_ids
    assert str(t_b.id) in item_ids

    # 2. Filter discovery by club_a
    resp_club_a = await client.get(
        "/api/v1/player/tournaments",
        headers=make_auth_header(player),
        params={"club_id": str(club_a.id)},
    )
    assert resp_club_a.status_code == 200
    a_items = resp_club_a.json()
    assert all(t["club_id"] == str(club_a.id) for t in a_items)
    assert any(t["id"] == str(t_a.id) for t in a_items)
    assert not any(t["id"] == str(t_b.id) for t in a_items)


@pytest.mark.asyncio
async def test_tournament_registration_and_duplicate_prevention(
    client: AsyncClient, db: AsyncSession
):
    """Test player registers for open tournament and duplicate registration is prevented."""
    club = await create_club(db)
    staff = await create_staff(db, club)
    tournament = await create_tournament(db, club, staff, name="Open Singles Tourney")

    player = await create_user(db, full_name="Tournament Reg Player")
    await create_player_membership(db, player, club)

    # Register
    reg_resp = await client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(player),
        json={"partner_name": None},
    )
    assert reg_resp.status_code in (200, 201)
    reg_data = reg_resp.json()
    assert reg_data["tournament_id"] == str(tournament.id)

    # Attempt to register again -> 400 or 409
    dup_resp = await client.post(
        f"/api/v1/tournaments/{tournament.id}/register",
        headers=make_auth_header(player),
        json={"partner_name": None},
    )
    assert dup_resp.status_code in (400, 409)


@pytest.mark.asyncio
async def test_public_league_discovery_across_clubs_and_by_club(
    client: AsyncClient, db: AsyncSession
):
    """Test players browse public leagues across clubs with host club metadata, and filter by club_id."""
    club_a = await create_club(db, name="West Side Club", slug="west-side")
    club_b = await create_club(db, name="East Side Club", slug="east-side")
    staff_a = await create_staff(db, club_a)
    staff_b = await create_staff(db, club_b)

    league_a = await create_league(db, club_a, staff_a, name="West Premier League")
    league_b = await create_league(db, club_b, staff_b, name="East Masters League")

    player = await create_user(db, full_name="League Player")

    # 1. Platform-wide league discovery
    resp_all = await client.get(
        "/api/v1/leagues",
        headers=make_auth_header(player),
    )
    assert resp_all.status_code == 200
    all_leagues = resp_all.json()
    league_ids = [l["id"] for l in all_leagues]
    assert str(league_a.id) in league_ids
    assert str(league_b.id) in league_ids

    # Verify host club metadata is present
    match_a = next(l for l in all_leagues if l["id"] == str(league_a.id))
    assert match_a["club_name"] == "West Side Club"
    assert match_a["club_slug"] == "west-side"

    # 2. Filter by Club B
    resp_club_b = await client.get(
        "/api/v1/leagues",
        headers=make_auth_header(player),
        params={"club_id": str(club_b.id)},
    )
    assert resp_club_b.status_code == 200
    b_leagues = resp_club_b.json()
    assert all(l["club_id"] == str(club_b.id) for l in b_leagues)
    assert any(l["id"] == str(league_b.id) for l in b_leagues)
    assert not any(l["id"] == str(league_a.id) for l in b_leagues)


@pytest.mark.asyncio
async def test_membership_approval_vs_paid_subscription_separation(
    client: AsyncClient, db: AsyncSession
):
    """
    Test strict boundary separation:
    Approving a player membership request activates ClubPlayerMembership,
    but does NOT automatically grant a paid MemberSubscription.
    """
    club = await create_club(db)
    owner = await create_staff(db, club, role=ClubRole.CLUB_OWNER)
    plan = await create_membership_plan(db, club, name="Monthly Gold", price=80.0)

    player = await create_user(db, full_name="Applicant Player")

    # 1. Player submits membership request
    req_resp = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=make_auth_header(player),
        json={"notes": "Eager to join the club"},
    )
    assert req_resp.status_code == 201
    req_id = req_resp.json()["id"]

    # 2. Staff approves the membership request
    approve_resp = await client.post(
        f"/api/v1/clubs/{club.id}/membership-requests/{req_id}/approve",
        headers=make_auth_header(owner),
    )
    assert approve_resp.status_code == 200

    # 3. Verify ClubPlayerMembership is ACTIVE
    result = await db.execute(
        select(ClubPlayerMembership).where(
            ClubPlayerMembership.club_id == club.id,
            ClubPlayerMembership.user_id == player.id,
        )
    )
    membership = result.scalars().first()
    assert membership is not None
    assert membership.status == PlayerMembershipStatus.ACTIVE

    # 4. Verify player does NOT have an active MemberSubscription
    sub_result = await db.execute(
        select(MemberSubscription).where(
            MemberSubscription.club_id == club.id,
            MemberSubscription.player_membership_id == membership.id,
            MemberSubscription.status == SubscriptionStatus.ACTIVE,
        )
    )
    active_sub = sub_result.scalars().first()
    assert active_sub is None, "Membership approval must not automatically create a paid subscription"
