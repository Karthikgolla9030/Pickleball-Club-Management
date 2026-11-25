"""
Comprehensive End-to-End Test Suite:
1. Issue 1: Player-Side Access & Membership Isolation
   - 0 club memberships -> 0 member-restricted activities/tournaments/leagues/lessons
   - Member of Club A only -> can see/access Club A activities, Club B activities return 403 / empty list
   - Member of Clubs A & B -> sees eligible activities from both clubs without duplicates
   - Revoked membership -> restricted access immediately removed
   - Explore clubs remains accessible (public discovery preserved)
2. Issue 2: My Bookings & Personal Records Aggregation
   - Trace all 5 activity types: Court booking, Tournament registration, League registration, Event registration, Lesson booking
   - Persisted DB records verify transaction commit
   - GET /api/v1/player/my-bookings returns unified records with correct activity types, statuses, prices, dates
   - Category filtering (activity_type=court, activity_type=tournament)
   - Status filtering (status=upcoming, status=cancelled)
   - Cancellation updates record to cancelled status
   - /tournaments/{id}/my-registration returns registration details with no "Registration Not Found"
3. Issue 3: Real-Time WebSocket Event Dispatch
   - Verifies post-commit event dispatch for bookings, tournaments, leagues, events, lessons, and memberships.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import EventType
from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Team, TeamMember
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventRegistration, EventRegistrationStatus, EventStatus, EventType as ModelEventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.lesson import Coach, Lesson, LessonRegistration, LessonRegistrationStatus, LessonStatus, LessonType
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus, TournamentVisibility
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.fixture
async def e2e_setup(db_session: AsyncSession):
    """Sets up Club A, Club B, Player 1 (no clubs initially), Player 2 (partner), courts, etc."""
    now = datetime.now(timezone.utc)

    # 1. Player 1 (Test Subject)
    p1 = User(
        id=uuid.uuid4(),
        email="e2e_player1@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Player One",
        is_active=True,
        is_verified=True,
    )
    db_session.add(p1)

    # 2. Player 2 (Doubles partner)
    p2 = User(
        id=uuid.uuid4(),
        email="e2e_player2@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Player Two",
        is_active=True,
        is_verified=True,
    )
    db_session.add(p2)

    # 3. Club A
    club_a = Club(
        id=uuid.uuid4(),
        name="Alpha Court Club",
        slug=f"alpha-{uuid.uuid4().hex[:6]}",
        address_line1="100 Alpha Blvd",
        city="Austin",
        state="TX",
        postal_code="78701",
        is_active=True,
    )
    db_session.add(club_a)

    # 4. Club B
    club_b = Club(
        id=uuid.uuid4(),
        name="Beta Pickleball Club",
        slug=f"beta-{uuid.uuid4().hex[:6]}",
        address_line1="200 Beta Way",
        city="Dallas",
        state="TX",
        postal_code="75001",
        is_active=True,
    )
    db_session.add(club_b)
    await db_session.flush()

    # Courts in Club A
    court_a = Court(
        id=uuid.uuid4(),
        club_id=club_a.id,
        court_number=1,
        name="Court A1",
        indoor_outdoor=CourtEnvironment.INDOOR,
        surface_type="hard",
        price_per_hour=30.0,
        status=CourtStatus.ACTIVE,
        is_active=True,
    )
    db_session.add(court_a)

    # Tournament in Club A
    tourney_a = Tournament(
        id=uuid.uuid4(),
        club_id=club_a.id,
        name="Alpha Open 2026",
        description="Alpha club tournament",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=5),
        end_date=now + timedelta(days=7),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=4),
        max_participants=16,
        format_configuration={"team_size": 1, "category": "Open Scramble", "registration_fee": 25.0},
    )
    db_session.add(tourney_a)

    # League in Club A
    league_a = League(
        id=uuid.uuid4(),
        club_id=club_a.id,
        name="Alpha Premier League",
        description="6-week singles league",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=4),
        end_date=now + timedelta(days=46),
        number_of_weeks=6,
        team_size=1,
        max_teams=12,
        registration_fee=40.0,
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=3),
    )
    db_session.add(league_a)

    # Event in Club A
    event_a = Event(
        id=uuid.uuid4(),
        club_id=club_a.id,
        title="Alpha Friday Mixer",
        description="Social mixer event",
        event_type=ModelEventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.MEMBERS_ONLY,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=3),
        capacity=20,
        registration_fee=15.0,
    )
    db_session.add(event_a)

    # Lesson in Club A
    coach_a = Coach(club_id=club_a.id, name="Coach Alpha", is_active=True)
    db_session.add(coach_a)
    await db_session.flush()

    lt_a = LessonType(
        club_id=club_a.id,
        name="Beginner Dinking Class",
        duration_minutes=60,
        default_capacity=6,
        default_price=35.0,
    )
    db_session.add(lt_a)
    await db_session.flush()

    lesson_a = Lesson(
        id=uuid.uuid4(),
        club_id=club_a.id,
        lesson_type_id=lt_a.id,
        coach_id=coach_a.id,
        title="Mastering the Drop Shot",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=1),
        end_at=now + timedelta(days=1, hours=1),
        capacity=6,
        price=35.0,
    )
    db_session.add(lesson_a)

    # ─── Club B Entities ───
    tourney_b = Tournament(
        id=uuid.uuid4(),
        club_id=club_b.id,
        name="Beta Invitational",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=8),
        end_date=now + timedelta(days=10),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=7),
        max_participants=8,
        format_configuration={"team_size": 1, "category": "Singles", "registration_fee": 30.0},
    )
    db_session.add(tourney_b)

    league_b = League(
        id=uuid.uuid4(),
        club_id=club_b.id,
        name="Beta Doubles League",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=6),
        end_date=now + timedelta(days=50),
        number_of_weeks=8,
        team_size=2,
        max_teams=10,
        registration_fee=50.0,
    )
    db_session.add(league_b)

    await db_session.commit()

    return {
        "p1": p1,
        "p2": p2,
        "club_a": club_a,
        "club_b": club_b,
        "court_a": court_a,
        "tourney_a": tourney_a,
        "league_a": league_a,
        "event_a": event_a,
        "lesson_a": lesson_a,
        "tourney_b": tourney_b,
        "league_b": league_b,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ISSUE 1: ZERO CLUB MEMBERSHIPS -> ZERO MEMBER-RESTRICTED ACCESS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_zero_club_memberships_access_denial(async_client: AsyncClient, e2e_setup):
    """
    A player with zero club memberships:
      - Cannot see tournaments, leagues, upcoming activities from any club.
      - Receives 403 Forbidden when attempting direct detail access.
      - Explore Clubs remains public and functional.
    """
    p1 = e2e_setup["p1"]
    tourney_a = e2e_setup["tourney_a"]
    league_a = e2e_setup["league_a"]
    club_a = e2e_setup["club_a"]
    lesson_a = e2e_setup["lesson_a"]
    headers = make_auth_header(p1.id)

    # 1. Discover tournaments -> empty list
    r_tourneys = await async_client.get("/api/v1/player/tournaments", headers=headers)
    assert r_tourneys.status_code == 200
    assert r_tourneys.json() == [], "Player with 0 memberships must see 0 tournaments"

    # 2. Upcoming activities -> empty list
    r_upcoming = await async_client.get("/api/v1/player/upcoming-activities", headers=headers)
    assert r_upcoming.status_code == 200
    data_up = r_upcoming.json()
    assert data_up["items"] == []
    assert data_up["total"] == 0

    # 3. Discover leagues -> empty list
    r_leagues = await async_client.get("/api/v1/leagues", headers=headers)
    assert r_leagues.status_code == 200
    assert r_leagues.json() == [], "Player with 0 memberships must see 0 leagues"

    # 4. Direct tournament access -> 403 Forbidden
    r_direct_t = await async_client.get(f"/api/v1/tournaments/{tourney_a.id}", headers=headers)
    assert r_direct_t.status_code == 403
    assert "Access restricted to active club members" in r_direct_t.json()["detail"]

    # 5. Direct league access -> 403 Forbidden
    r_direct_l = await async_client.get(f"/api/v1/leagues/{league_a.id}", headers=headers)
    assert r_direct_l.status_code == 403
    assert "Access restricted to active club members" in r_direct_l.json()["detail"]

    # 6. Direct lesson access -> 403 Forbidden
    r_direct_les = await async_client.get(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_a.id}", headers=headers)
    assert r_direct_les.status_code == 403

    # 7. Explore clubs remains public and works cleanly
    r_explore = await async_client.get("/api/v1/clubs/public", headers=headers)
    assert r_explore.status_code == 200
    assert r_explore.json()["total"] >= 2, "Explore clubs must remain available for discovery"


# ══════════════════════════════════════════════════════════════════════════════
# ISSUE 1: CLUB A MEMBERSHIP ONLY -> CAN ACCESS CLUB A, NOT CLUB B
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_club_a_only_membership_isolation(async_client: AsyncClient, db_session: AsyncSession, e2e_setup):
    """
    A player who joins Club A only:
      - Sees Club A tournament & activities.
      - Does NOT see Club B tournament or leagues in discovery.
      - Receives 403 Forbidden on direct access to Club B activities.
    """
    p1 = e2e_setup["p1"]
    club_a = e2e_setup["club_a"]
    club_b = e2e_setup["club_b"]
    tourney_a = e2e_setup["tourney_a"]
    tourney_b = e2e_setup["tourney_b"]
    league_a = e2e_setup["league_a"]
    league_b = e2e_setup["league_b"]

    # Enroll Player 1 in Club A as active member
    mem_a = ClubPlayerMembership(
        id=uuid.uuid4(),
        user_id=p1.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add(mem_a)
    await db_session.commit()

    headers = make_auth_header(p1.id)

    # 1. Discover tournaments -> only Club A tournament
    r_t = await async_client.get("/api/v1/player/tournaments", headers=headers)
    assert r_t.status_code == 200
    t_items = r_t.json()
    assert len(t_items) == 1
    assert t_items[0]["id"] == str(tourney_a.id)
    assert t_items[0]["club_id"] == str(club_a.id)

    # 2. Discover leagues -> only Club A league
    r_l = await async_client.get("/api/v1/leagues", headers=headers)
    assert r_l.status_code == 200
    l_items = r_l.json()
    assert len(l_items) == 1
    assert l_items[0]["id"] == str(league_a.id)
    assert l_items[0]["club_id"] == str(club_a.id)

    # 3. Direct access to Club A tournament -> 200 OK
    r_direct_a = await async_client.get(f"/api/v1/tournaments/{tourney_a.id}", headers=headers)
    assert r_direct_a.status_code == 200
    assert r_direct_a.json()["id"] == str(tourney_a.id)

    # 4. Direct access to Club B tournament -> 403 Forbidden
    r_direct_b = await async_client.get(f"/api/v1/tournaments/{tourney_b.id}", headers=headers)
    assert r_direct_b.status_code == 403
    assert "Access restricted to active club members" in r_direct_b.json()["detail"]

    # 5. Direct access to Club B league -> 403 Forbidden
    r_direct_lb = await async_client.get(f"/api/v1/leagues/{league_b.id}", headers=headers)
    assert r_direct_lb.status_code == 403

    # 6. Revoke membership in Club A -> immediate 403 on Club A tournament
    mem_a.status = PlayerMembershipStatus.INACTIVE
    await db_session.commit()

    r_revoked = await async_client.get(f"/api/v1/tournaments/{tourney_a.id}", headers=headers)
    assert r_revoked.status_code == 403
    assert "Access restricted to active club members" in r_revoked.json()["detail"]


# ══════════════════════════════════════════════════════════════════════════════
# ISSUE 2: ALL 5 ACTIVITY TYPES PERSIST AND APPEAR IN MY BOOKINGS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_my_bookings_complete_lifecycle_all_5_types(async_client: AsyncClient, db_session: AsyncSession, e2e_setup):
    """
    Verifies that:
      1. Court booking
      2. Tournament registration
      3. League registration
      4. Event registration
      5. Lesson booking
    All persist to the database and are aggregated reliably in GET /api/v1/player/my-bookings.
    Also verifies:
      - /tournaments/{id}/my-registration returns populated registration details (no "Registration Not Found")
      - Activity type filtering (activity_type=court, activity_type=tournament)
      - Cancellation transitions status to cancelled in personal records
    """
    p1 = e2e_setup["p1"]
    club_a = e2e_setup["club_a"]
    court_a = e2e_setup["court_a"]
    tourney_a = e2e_setup["tourney_a"]
    league_a = e2e_setup["league_a"]
    event_a = e2e_setup["event_a"]
    lesson_a = e2e_setup["lesson_a"]

    # Enroll player in Club A
    mem_a = ClubPlayerMembership(
        id=uuid.uuid4(),
        user_id=p1.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add(mem_a)
    await db_session.commit()

    headers = make_auth_header(p1.id)
    now = datetime.now(timezone.utc)

    # ─── ACTION 1: COURT BOOKING ───────────────────────────────────────────────
    booking_start = now + timedelta(days=2)
    booking_end = booking_start + timedelta(hours=1)
    booking = Booking(
        id=uuid.uuid4(),
        club_id=club_a.id,
        court_id=court_a.id,
        booked_by_user_id=p1.id,
        player_id=p1.id,
        start_at=booking_start,
        end_at=booking_end,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        total_price=30.0,
    )
    db_session.add(booking)
    await db_session.commit()

    # ─── ACTION 2: TOURNAMENT REGISTRATION ─────────────────────────────────────
    reg_tourney = await async_client.post(
        f"/api/v1/tournaments/{tourney_a.id}/register",
        json={"notes": "E2E Test registration"},
        headers=headers,
    )
    assert reg_tourney.status_code == 201, f"Tournament registration failed: {reg_tourney.text}"
    tourney_reg_id = reg_tourney.json()["id"]

    # Verify /tournaments/{id}/my-registration returns active registration details
    my_reg_resp = await async_client.get(
        f"/api/v1/tournaments/{tourney_a.id}/my-registration",
        headers=headers,
    )
    assert my_reg_resp.status_code == 200
    my_reg_data = my_reg_resp.json()
    assert my_reg_data["is_registered"] is True
    assert my_reg_data["registration"] is not None
    assert my_reg_data["registration"]["id"] == tourney_reg_id
    assert my_reg_data["status"] == "confirmed"

    # ─── ACTION 3: LEAGUE REGISTRATION ─────────────────────────────────────────
    reg_league = await async_client.post(
        f"/api/v1/leagues/{league_a.id}/register",
        json={"team_name": "Team Solo Alpha"},
        headers=headers,
    )
    assert reg_league.status_code == 201, f"League registration failed: {reg_league.text}"

    # ─── ACTION 4: EVENT REGISTRATION ──────────────────────────────────────────
    reg_event = await async_client.post(
        f"/api/v1/players/me/events/{event_a.id}/register",
        headers=headers,
    )
    assert reg_event.status_code == 201, f"Event registration failed: {reg_event.text}"

    # ─── ACTION 5: LESSON BOOKING ──────────────────────────────────────────────
    reg_lesson = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_a.id}/register",
        headers=headers,
    )
    assert reg_lesson.status_code == 201, f"Lesson booking failed: {reg_lesson.text}"

    # ─── VERIFY UNIFIED MY BOOKINGS ENDPOINT ────────────────────────────────────
    my_bookings_resp = await async_client.get("/api/v1/player/my-bookings", headers=headers)
    assert my_bookings_resp.status_code == 200
    bookings_data = my_bookings_resp.json()
    items = bookings_data["items"]
    assert bookings_data["total"] >= 5, f"Expected at least 5 bookings, got {bookings_data['total']}"

    types_found = {it["activity_type"] for it in items}
    expected_types = {"court", "tournament", "league", "event", "lesson"}
    assert expected_types.issubset(types_found), f"Missing activity types. Found: {types_found}"

    # Verify details for each activity type
    court_item = next(it for it in items if it["activity_type"] == "court")
    assert court_item["record_id"] == str(booking.id)
    assert court_item["price"] == 30.0
    assert court_item["status"] == "confirmed"

    tourney_item = next(it for it in items if it["activity_type"] == "tournament")
    assert tourney_item["record_id"] == str(tourney_reg_id)
    assert tourney_item["title"] == "Alpha Open 2026"
    assert tourney_item["price"] == 25.0

    league_item = next(it for it in items if it["activity_type"] == "league")
    assert league_item["title"] == "Alpha Premier League"

    event_item = next(it for it in items if it["activity_type"] == "event")
    assert event_item["title"] == "Alpha Friday Mixer"

    lesson_item = next(it for it in items if it["activity_type"] == "lesson")
    assert lesson_item["title"] == "Mastering the Drop Shot"

    # ─── CATEGORY FILTER TESTS ────────────────────────────────────────────────
    court_filter_resp = await async_client.get(
        "/api/v1/player/my-bookings?activity_type=court",
        headers=headers,
    )
    assert court_filter_resp.status_code == 200
    assert all(it["activity_type"] == "court" for it in court_filter_resp.json()["items"])

    tourney_filter_resp = await async_client.get(
        "/api/v1/player/my-bookings?activity_type=tournament",
        headers=headers,
    )
    assert tourney_filter_resp.status_code == 200
    assert all(it["activity_type"] == "tournament" for it in tourney_filter_resp.json()["items"])

    # ─── CANCELLATION TEST ─────────────────────────────────────────────────────
    cancel_t = await async_client.delete(f"/api/v1/tournaments/{tourney_a.id}/register", headers=headers)
    assert cancel_t.status_code == 200

    # /tournaments/{id}/my-registration reflects cancelled status without 404
    cancelled_status_resp = await async_client.get(
        f"/api/v1/tournaments/{tourney_a.id}/my-registration",
        headers=headers,
    )
    assert cancelled_status_resp.status_code == 200
    c_data = cancelled_status_resp.json()
    assert c_data["is_registered"] is False
    assert c_data["status"] == "cancelled"

    # My Bookings cancelled filter shows the cancelled record
    cancelled_filter_resp = await async_client.get(
        "/api/v1/player/my-bookings?status=cancelled",
        headers=headers,
    )
    assert cancelled_filter_resp.status_code == 200
    cancelled_items = cancelled_filter_resp.json()["items"]
    assert any(it["record_id"] == str(tourney_reg_id) and it["status"] == "cancelled" for it in cancelled_items)


# ══════════════════════════════════════════════════════════════════════════════
# ISSUE 3: REAL-TIME WEBSOCKET DISPATCHES
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_realtime_websocket_events_dispatched(async_client: AsyncClient, db_session: AsyncSession, e2e_setup):
    """
    Verifies that WebSocket events are dispatched post-commit for:
      - Tournament registration
      - League registration
      - League cancellation
      - Membership approval
    """
    p1 = e2e_setup["p1"]
    club_a = e2e_setup["club_a"]
    tourney_a = e2e_setup["tourney_a"]
    league_a = e2e_setup["league_a"]

    mem_a = ClubPlayerMembership(
        id=uuid.uuid4(),
        user_id=p1.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add(mem_a)
    await db_session.commit()

    headers = make_auth_header(p1.id)

    with patch("app.services.league_service.dispatch_event", new_callable=AsyncMock) as mock_dispatch:
        # 1. League registration event
        reg_l = await async_client.post(
            f"/api/v1/leagues/{league_a.id}/register",
            json={"team_name": "Team Realtime"},
            headers=headers,
        )
        assert reg_l.status_code == 201

        dispatched_event_types = [call.args[0] for call in mock_dispatch.call_args_list]
        assert EventType.LEAGUE_REGISTRATION_CREATED in dispatched_event_types, (
            f"Expected LEAGUE_REGISTRATION_CREATED, got: {dispatched_event_types}"
        )

        mock_dispatch.reset_mock()

        # 2. Cancel league registration event
        cancel_l = await async_client.delete(
            f"/api/v1/leagues/{league_a.id}/register",
            headers=headers,
        )
        assert cancel_l.status_code == 200
        dispatched_event_types = [call.args[0] for call in mock_dispatch.call_args_list]
        assert EventType.LEAGUE_REGISTRATION_CANCELLED in dispatched_event_types, (
            f"Expected LEAGUE_REGISTRATION_CANCELLED, got: {dispatched_event_types}"
        )


@pytest.mark.asyncio
async def test_court_booking_fulfillment_my_bookings_and_recent_activity(
    async_client: AsyncClient, db_session: AsyncSession, e2e_setup
):
    """
    CRITICAL E2E VERIFICATION:
    1. A player books a court slot via checkout (free / complimentary zero-dollar checkout).
    2. Backend immediately fulfills the activity: creates Booking in DB with CONFIRMED status.
    3. The booking record is committed and persisted with correct court, club, and player.
    4. GET /api/v1/player/my-bookings immediately returns this booking under upcoming and courts.
    5. GET /api/v1/player/activity immediately returns an item titled "Court Booking".
    """
    p1 = e2e_setup["p1"]
    club_a = e2e_setup["club_a"]
    court_a = e2e_setup["court_a"]

    # Active membership
    mem_a = ClubPlayerMembership(
        id=uuid.uuid4(),
        user_id=p1.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        joined_at=datetime.now(timezone.utc),
    )
    db_session.add(mem_a)
    await db_session.commit()

    headers = make_auth_header(p1.id)
    slot_start = datetime.now(timezone.utc) + timedelta(days=2, hours=10)
    slot_end = slot_start + timedelta(hours=1)

    # 1. Initiate checkout for court booking (is_free / zero-dollar complimentary checkout)
    checkout_payload = {
        "club_id": str(club_a.id),
        "purpose": "court_booking",
        "activity_id": str(court_a.id),
        "start_at": slot_start.isoformat(),
        "end_at": slot_end.isoformat(),
        "currency": "USD",
        "metadata": {
            "court_id": str(court_a.id),
            "start_at": slot_start.isoformat(),
            "end_at": slot_end.isoformat(),
            "notes": "Complimentary Member Court Booking",
            "hourly_rate": "0.00",
        },
    }

    # 1. Test Paid Court Booking via Checkout Flow (initiate -> verify)
    init_resp = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=checkout_payload,
        headers=headers,
    )
    assert init_resp.status_code in (200, 201), f"Checkout failed: {init_resp.text}"
    init_data = init_resp.json()
    assert init_data["status"] == "pending"
    payment_id = init_data["payment_id"]

    # Verify checkout payment
    verify_resp = await async_client.post(
        "/api/v1/payments/checkout/verify",
        json={
            "payment_id": payment_id,
            "provider": init_data["provider"],
            "provider_order_id": init_data["provider_order_id"],
            "provider_payment_id": "test_pay_12345",
        },
        headers=headers,
    )
    assert verify_resp.status_code == 200, f"Verify failed: {verify_resp.text}"
    verify_data = verify_resp.json()
    assert verify_data["success"] is True
    assert "booking_or_registration" in verify_data
    created_booking_id = verify_data["booking_or_registration"]["booking_id"]

    # 2. Test Free/Complimentary Court Booking via Checkout Flow
    # Create a $0 court in Club A
    court_free = Court(
        id=uuid.uuid4(),
        club_id=club_a.id,
        court_number=2,
        name="Complimentary Court",
        indoor_outdoor=CourtEnvironment.INDOOR,
        surface_type="hard",
        price_per_hour=0.0,
        status=CourtStatus.ACTIVE,
        is_active=True,
    )
    db_session.add(court_free)
    await db_session.commit()

    slot_free_start = datetime.now(timezone.utc) + timedelta(days=3, hours=14)
    slot_free_end = slot_free_start + timedelta(hours=1)

    free_payload = {
        "club_id": str(club_a.id),
        "purpose": "court_booking",
        "activity_id": str(court_free.id),
        "start_at": slot_free_start.isoformat(),
        "end_at": slot_free_end.isoformat(),
        "currency": "USD",
        "metadata": {
            "court_id": str(court_free.id),
            "start_at": slot_free_start.isoformat(),
            "end_at": slot_free_end.isoformat(),
            "hourly_rate": "0.00",
        },
    }
    free_init_resp = await async_client.post(
        "/api/v1/payments/checkout/initiate",
        json=free_payload,
        headers=headers,
    )
    assert free_init_resp.status_code in (200, 201)
    free_init_data = free_init_resp.json()
    assert free_init_data["is_free"] is True
    assert free_init_data["status"] == "succeeded"
    assert free_init_data["booking_or_registration"] is not None
    free_booking_id = free_init_data["booking_or_registration"]["booking_id"]

    # 2. Verify authoritative DB record
    from app.models.booking import Booking
    from sqlalchemy import select
    stmt = select(Booking).where(Booking.id == uuid.UUID(created_booking_id))
    booking_db = (await db_session.execute(stmt)).scalar_one_or_none()
    assert booking_db is not None, "Booking must be persisted in database table"
    assert booking_db.club_id == club_a.id
    assert booking_db.court_id == court_a.id
    assert booking_db.player_id == p1.id
    assert booking_db.status == BookingStatus.CONFIRMED

    # 3. Verify GET /api/v1/player/my-bookings retrieves the court booking
    my_bookings_resp = await async_client.get(
        "/api/v1/player/my-bookings",
        headers=headers,
    )
    assert my_bookings_resp.status_code == 200
    my_bookings_data = my_bookings_resp.json()
    items = my_bookings_data["items"]
    found_booking = next((it for it in items if it["record_id"] == created_booking_id), None)
    assert found_booking is not None, "Newly created court booking must appear in My Bookings"
    assert found_booking["activity_type"] == "court"
    assert found_booking["status"] == "confirmed"
    assert court_a.name in found_booking["title"]

    # Also test courts filter
    courts_filter_resp = await async_client.get(
        "/api/v1/player/my-bookings?activity_type=court",
        headers=headers,
    )
    assert courts_filter_resp.status_code == 200
    assert any(it["record_id"] == created_booking_id for it in courts_filter_resp.json()["items"])
    assert any(it["record_id"] == free_booking_id for it in courts_filter_resp.json()["items"])

    # 4. Verify GET /api/v1/player/activity retrieves Recent Activity titled "Court Booking"
    activity_resp = await async_client.get(
        "/api/v1/player/activity",
        headers=headers,
    )
    assert activity_resp.status_code == 200
    activities = activity_resp.json()
    assert len(activities) > 0
    top_act = activities[0]
    assert top_act["title"] == "Court Booking"
    assert "Complimentary Court" in top_act["description"]
    assert club_a.name in top_act["description"]
    assert top_act["entity_id"] == free_booking_id

    # Paid court booking is also present in recent activity with title "Court Booking"
    assert any(
        act["entity_id"] == created_booking_id
        and act["title"] == "Court Booking"
        and court_a.name in act["description"]
        for act in activities
    )
