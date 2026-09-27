"""
Aught2 Pickleball — Phase 17 Competition Scheduling & Court Assignment Tests

Comprehensive test suite verifying:
  - Basic Scheduling: schedule, reschedule, unschedule tournament and league matches
  - Court Validation: inactive court, wrong-club court, non-existent court
  - Conflict Prevention:
      - Court Overlap: Overlapping match on same court rejected (HTTP 409)
      - Adjacent Matches: Adjacent intervals (10:00-11:00 and 11:00-12:00) allowed
      - Team Conflict: Same team playing overlapping matches rejected (HTTP 409)
      - Scramble Player Conflict: Same player in overlapping scramble matches rejected (HTTP 409)
  - Booking Integration:
      - Existing player booking blocks competition match (HTTP 409)
      - Scheduled competition match blocks new player booking (HTTP 409)
  - Bracket & Competitor Integrity:
      - Incomplete / BYE bracket matches cannot be scheduled (HTTP 400)
      - Completed matches retain historical schedule and cannot be rescheduled/unscheduled (HTTP 400)
  - Permissions & RBAC:
      - Owner, Manager, Tournament Director allowed
      - Players receive 403 Forbidden
  - Tenant Isolation:
      - Club A staff cannot schedule Club B matches
  - Daily Club Schedule & Availability:
      - Sorted daily schedule and slot availability breakdown
  - Player Personal Schedule:
      - Authenticated player sees their scheduled matches
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import uuid

from httpx import AsyncClient
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import (
    Match,
    MatchParticipant,
    MatchStage,
    MatchStatus,
    Team,
    TeamMember,
)
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.league import League, LeagueStatus, LeagueWeek, LeagueWeekStatus, LeagueWeekType
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_a(db_session: AsyncSession) -> Club:
    club = Club(name="Metro Pickle Club", slug=f"metro-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_b(db_session: AsyncSession) -> Club:
    club = Club(name="Coastal Pickle Club", slug=f"coastal-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def court_1(db_session: AsyncSession, club_a: Club) -> Court:
    court = Court(
        club_id=club_a.id,
        name="Court 1",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=1,
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest_asyncio.fixture
async def court_2(db_session: AsyncSession, club_a: Club) -> Court:
    court = Court(
        club_id=club_a.id,
        name="Court 2",
        court_number=2,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=2,
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest_asyncio.fixture
async def court_inactive(db_session: AsyncSession, club_a: Club) -> Court:
    court = Court(
        club_id=club_a.id,
        name="Court Inactive",
        court_number=99,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.INACTIVE,
        is_active=False,
        display_order=99,
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest_asyncio.fixture
async def court_b(db_session: AsyncSession, club_b: Club) -> Court:
    court = Court(
        club_id=club_b.id,
        name="Court B1",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=1,
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest_asyncio.fixture
async def staff_users(db_session: AsyncSession, club_a: Club):
    owner = User(email=f"owner-{uuid.uuid4().hex[:6]}@demo.local", hashed_password=hash_password("pw"), full_name="Owner Dave")
    manager = User(email=f"manager-{uuid.uuid4().hex[:6]}@demo.local", hashed_password=hash_password("pw"), full_name="Manager Mary")
    director = User(email=f"director-{uuid.uuid4().hex[:6]}@demo.local", hashed_password=hash_password("pw"), full_name="Director Dan")
    db_session.add_all([owner, manager, director])
    await db_session.flush()

    m_owner = ClubMembership(club_id=club_a.id, user_id=owner.id, role=ClubRole.CLUB_OWNER)
    m_mgr = ClubMembership(club_id=club_a.id, user_id=manager.id, role=ClubRole.CLUB_MANAGER)
    m_dir = ClubMembership(club_id=club_a.id, user_id=director.id, role=ClubRole.TOURNAMENT_DIRECTOR)
    db_session.add_all([m_owner, m_mgr, m_dir])
    await db_session.flush()

    return {"owner": owner, "manager": manager, "director": director}


@pytest_asyncio.fixture
async def players(db_session: AsyncSession, club_a: Club):
    p_users = []
    p_mems = []
    for i in range(1, 9):
        u = User(
            email=f"player{i}-{uuid.uuid4().hex[:6]}@demo.local",
            hashed_password=hash_password("pw"),
            full_name=f"Player {i}",
        )
        db_session.add(u)
        await db_session.flush()
        prof = PlayerProfile(user_id=u.id, display_name=f"P{i}")
        db_session.add(prof)
        pm = ClubPlayerMembership(
            user_id=u.id,
            club_id=club_a.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"MTR-{i:03d}",
        )
        db_session.add(pm)
        p_users.append(u)
        p_mems.append(pm)
    await db_session.flush()
    return {"users": p_users, "memberships": p_mems}


@pytest_asyncio.fixture
async def tournament_round_robin(db_session: AsyncSession, club_a: Club, staff_users, players) -> tuple[Tournament, list[Team], list[Match]]:
    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club_a.id,
        created_by_user_id=staff_users["director"].id,
        name="Winter Round Robin",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.IN_PROGRESS,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now,
        end_date=now + timedelta(days=2),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=1),
    )
    db_session.add(t)
    await db_session.flush()

    # Create 4 teams
    t_a = Team(tournament_id=t.id, name="Red Aces")
    t_b = Team(tournament_id=t.id, name="Blue Bombers")
    t_c = Team(tournament_id=t.id, name="Green Giants")
    t_d = Team(tournament_id=t.id, name="Yellow Jackets")
    db_session.add_all([t_a, t_b, t_c, t_d])
    await db_session.flush()

    mems = players["memberships"]
    # Team members
    db_session.add_all([
        TeamMember(team_id=t_a.id, player_membership_id=mems[0].id),
        TeamMember(team_id=t_a.id, player_membership_id=mems[1].id),
        TeamMember(team_id=t_b.id, player_membership_id=mems[2].id),
        TeamMember(team_id=t_b.id, player_membership_id=mems[3].id),
        TeamMember(team_id=t_c.id, player_membership_id=mems[4].id),
        TeamMember(team_id=t_c.id, player_membership_id=mems[5].id),
        TeamMember(team_id=t_d.id, player_membership_id=mems[6].id),
        TeamMember(team_id=t_d.id, player_membership_id=mems[7].id),
    ])
    await db_session.flush()

    # Matches
    m1 = Match(tournament_id=t.id, round_number=1, match_number=1, team_a_id=t_a.id, team_b_id=t_b.id, status=MatchStatus.PENDING)
    m2 = Match(tournament_id=t.id, round_number=1, match_number=2, team_a_id=t_c.id, team_b_id=t_d.id, status=MatchStatus.PENDING)
    m3 = Match(tournament_id=t.id, round_number=2, match_number=3, team_a_id=t_a.id, team_b_id=t_c.id, status=MatchStatus.PENDING)
    db_session.add_all([m1, m2, m3])
    await db_session.flush()

    return t, [t_a, t_b, t_c, t_d], [m1, m2, m3]


@pytest_asyncio.fixture
async def league_with_matches(db_session: AsyncSession, club_a: Club, staff_users, players) -> tuple[League, list[Team], list[Match]]:
    lg = League(
        club_id=club_a.id,
        name="Metro Winter League",
        number_of_weeks=4,
        current_week=1,
        team_size=2,
        status=LeagueStatus.IN_PROGRESS,
    )
    db_session.add(lg)
    await db_session.flush()

    lw1 = LeagueWeek(league_id=lg.id, week_number=1, week_type=LeagueWeekType.REGULAR_SEASON, status=LeagueWeekStatus.IN_PROGRESS)
    db_session.add(lw1)
    await db_session.flush()

    t_1 = Team(league_id=lg.id, name="Thunder")
    t_2 = Team(league_id=lg.id, name="Lightning")
    db_session.add_all([t_1, t_2])
    await db_session.flush()

    mems = players["memberships"]
    db_session.add_all([
        TeamMember(team_id=t_1.id, player_membership_id=mems[0].id),
        TeamMember(team_id=t_1.id, player_membership_id=mems[1].id),
        TeamMember(team_id=t_2.id, player_membership_id=mems[2].id),
        TeamMember(team_id=t_2.id, player_membership_id=mems[3].id),
    ])
    await db_session.flush()

    lm = Match(
        league_id=lg.id,
        league_week_id=lw1.id,
        stage=MatchStage.REGULAR_SEASON,
        match_number=1,
        round_number=1,
        team_a_id=t_1.id,
        team_b_id=t_2.id,
        status=MatchStatus.PENDING,
    )
    db_session.add(lm)
    await db_session.flush()

    return lg, [t_1, t_2], [lm]


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_schedule_reschedule_unschedule_tournament_match(
    async_client: AsyncClient,
    club_a: Club,
    court_1: Court,
    court_2: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, teams, matches = tournament_round_robin
    match_1 = matches[0]
    headers = make_auth_header(staff_users["director"])

    start_time = datetime.now(timezone.utc) + timedelta(days=1, hours=2)

    # 1. Schedule match
    res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={
            "court_id": str(court_1.id),
            "start_at": start_time.isoformat(),
            "duration_minutes": 60,
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["court_id"] == str(court_1.id)
    assert data["court_name"] == "Court 1"
    assert data["duration_minutes"] == 60
    assert data["team_a_name"] == "Red Aces"
    assert data["team_b_name"] == "Blue Bombers"

    # 2. Get tournament schedule
    res_sched = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/schedule",
        headers=headers,
    )
    assert res_sched.status_code == 200
    sched_list = res_sched.json()
    assert len(sched_list) == 1
    assert sched_list[0]["match_id"] == str(match_1.id)

    # 3. Get unscheduled matches (match 2 and 3 should be there)
    res_unsched = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/unscheduled",
        headers=headers,
    )
    assert res_unsched.status_code == 200
    unsched_list = res_unsched.json()
    assert len(unsched_list) == 2

    # 4. Reschedule match to court 2
    new_start = start_time + timedelta(hours=1)
    res_re = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={
            "court_id": str(court_2.id),
            "start_at": new_start.isoformat(),
            "duration_minutes": 90,
        },
        headers=headers,
    )
    assert res_re.status_code == 200
    re_data = res_re.json()
    assert re_data["court_id"] == str(court_2.id)
    assert re_data["duration_minutes"] == 90

    # 5. Unschedule match
    res_un = await async_client.delete(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        headers=headers,
    )
    assert res_un.status_code == 200
    un_data = res_un.json()
    assert un_data["court_id"] is None
    assert un_data["scheduled_start_at"] is None
    assert un_data["status"] == "pending"


@pytest.mark.asyncio
async def test_schedule_league_match(
    async_client: AsyncClient,
    club_a: Club,
    court_1: Court,
    staff_users: dict,
    league_with_matches: tuple,
):
    league, teams, matches = league_with_matches
    league_match = matches[0]
    headers = make_auth_header(staff_users["manager"])

    start_time = datetime.now(timezone.utc) + timedelta(days=2, hours=4)

    # Schedule
    res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/leagues/{league.id}/matches/{league_match.id}/schedule",
        json={
            "court_id": str(court_1.id),
            "start_at": start_time.isoformat(),
            "duration_minutes": 60,
        },
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["court_id"] == str(court_1.id)
    assert data["competition_type"] == "league"
    assert data["league_week_number"] == 1

    # Unschedule
    res_del = await async_client.delete(
        f"/api/v1/clubs/{club_a.id}/leagues/{league.id}/matches/{league_match.id}/schedule",
        headers=headers,
    )
    assert res_del.status_code == 200
    assert res_del.json()["court_id"] is None


@pytest.mark.asyncio
async def test_court_validations(
    async_client: AsyncClient,
    club_a: Club,
    court_inactive: Court,
    court_b: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, _, matches = tournament_round_robin
    match_1 = matches[0]
    headers = make_auth_header(staff_users["owner"])
    start_time = datetime.now(timezone.utc) + timedelta(days=1)

    # Inactive court rejection (400)
    res_inact = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={"court_id": str(court_inactive.id), "start_at": start_time.isoformat()},
        headers=headers,
    )
    assert res_inact.status_code == 400
    assert "inactive" in res_inact.json()["detail"].lower()

    # Wrong-club court rejection (400)
    res_wrong = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={"court_id": str(court_b.id), "start_at": start_time.isoformat()},
        headers=headers,
    )
    assert res_wrong.status_code == 400
    assert "club" in res_wrong.json()["detail"].lower()

    # Invalid non-existent court (404)
    res_non = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={"court_id": str(uuid.uuid4()), "start_at": start_time.isoformat()},
        headers=headers,
    )
    assert res_non.status_code == 404


@pytest.mark.asyncio
async def test_court_conflict_and_adjacent_match_allowed(
    async_client: AsyncClient,
    club_a: Club,
    court_1: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, _, matches = tournament_round_robin
    m1, m2, m3 = matches
    headers = make_auth_header(staff_users["director"])

    start_1 = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=1, hours=1)

    # Schedule match 1 on Court 1 from start_1 to start_1 + 60min
    res1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m1.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_1.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res1.status_code == 200

    # Overlapping Match 2 on Court 1 (start_1 + 30m to start_1 + 90m) must fail with 409
    overlap_start = start_1 + timedelta(minutes=30)
    res2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m2.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": overlap_start.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res2.status_code == 409
    assert "court is already scheduled" in res2.json()["detail"].lower()

    # Adjacent Match 2 on Court 1 (start_1 + 60m to start_1 + 120m) is allowed (200)
    adjacent_start = start_1 + timedelta(minutes=60)
    res_adj = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m2.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": adjacent_start.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res_adj.status_code == 200


@pytest.mark.asyncio
async def test_team_conflict_rejected(
    async_client: AsyncClient,
    club_a: Club,
    court_1: Court,
    court_2: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, teams, matches = tournament_round_robin
    # m1 has Team Alpha vs Team Bravo
    # m3 has Team Alpha vs Team Charlie
    m1, _, m3 = matches
    headers = make_auth_header(staff_users["director"])

    start_time = datetime.now(timezone.utc) + timedelta(days=1, hours=3)

    # Schedule m1 on Court 1 from 10:00 to 11:00
    res1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m1.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res1.status_code == 200

    # Attempt to schedule m3 (also featuring Team Alpha) on Court 2 at 10:30 (overlapping) -> 409
    overlap_start = start_time + timedelta(minutes=30)
    res3 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m3.id}/schedule",
        json={"court_id": str(court_2.id), "start_at": overlap_start.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res3.status_code == 409
    assert "Red Aces" in res3.json()["detail"] or "has another match" in res3.json()["detail"]


@pytest.mark.asyncio
async def test_scramble_player_conflict_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_a: Club,
    court_1: Court,
    court_2: Court,
    staff_users: dict,
    players: dict,
):
    director = staff_users["director"]
    headers = make_auth_header(director)

    # Create Scramble Tournament
    now = datetime.now(timezone.utc)
    tourn = Tournament(
        club_id=club_a.id,
        created_by_user_id=director.id,
        name="Saturday Scramble",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.IN_PROGRESS,
        start_date=now,
        end_date=now + timedelta(days=2),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=1),
    )
    db_session.add(tourn)
    await db_session.flush()

    mems = players["memberships"]

    # Scramble Match 1 (players 0, 1 vs 2, 3)
    sm1 = Match(tournament_id=tourn.id, round_number=1, match_number=1, status=MatchStatus.PENDING)
    db_session.add(sm1)
    await db_session.flush()
    db_session.add_all([
        MatchParticipant(match_id=sm1.id, player_membership_id=mems[0].id, side="side_a", partner_slot=1),
        MatchParticipant(match_id=sm1.id, player_membership_id=mems[1].id, side="side_a", partner_slot=2),
        MatchParticipant(match_id=sm1.id, player_membership_id=mems[2].id, side="side_b", partner_slot=1),
        MatchParticipant(match_id=sm1.id, player_membership_id=mems[3].id, side="side_b", partner_slot=2),
    ])

    # Scramble Match 2 (players 0, 4 vs 5, 6) — player 0 is also in this match!
    sm2 = Match(tournament_id=tourn.id, round_number=1, match_number=2, status=MatchStatus.PENDING)
    db_session.add(sm2)
    await db_session.flush()
    db_session.add_all([
        MatchParticipant(match_id=sm2.id, player_membership_id=mems[0].id, side="side_a", partner_slot=1),
        MatchParticipant(match_id=sm2.id, player_membership_id=mems[4].id, side="side_a", partner_slot=2),
        MatchParticipant(match_id=sm2.id, player_membership_id=mems[5].id, side="side_b", partner_slot=1),
        MatchParticipant(match_id=sm2.id, player_membership_id=mems[6].id, side="side_b", partner_slot=2),
    ])
    await db_session.flush()

    start_time = datetime.now(timezone.utc) + timedelta(days=1, hours=2)

    # Schedule Match 1 on Court 1
    res1 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tourn.id}/matches/{sm1.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res1.status_code == 200

    # Overlapping schedule for Match 2 on Court 2 must be rejected because player 0 is in Match 1
    overlap_start = start_time + timedelta(minutes=30)
    res2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tourn.id}/matches/{sm2.id}/schedule",
        json={"court_id": str(court_2.id), "start_at": overlap_start.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res2.status_code == 409
    assert "participant" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_booking_conflict_bidirectional(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_a: Club,
    court_1: Court,
    court_2: Court,
    staff_users: dict,
    players: dict,
    tournament_round_robin: tuple,
):
    tournament, _, matches = tournament_round_robin
    match_1, match_2, _ = matches
    headers_staff = make_auth_header(staff_users["director"])
    player_1 = players["users"][0]
    headers_player = make_auth_header(player_1)

    target_day = (datetime.now(timezone.utc) + timedelta(days=2)).date()
    start_time = datetime.combine(target_day, time(14, 0), tzinfo=timezone.utc)
    end_time = datetime.combine(target_day, time(15, 0), tzinfo=timezone.utc)

    # 1. Existing player booking on Court 1 from start_time to end_time
    b1 = Booking(
        club_id=club_a.id,
        court_id=court_1.id,
        player_id=player_1.id,
        booked_by_user_id=player_1.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=start_time,
        end_at=end_time,
    )
    db_session.add(b1)
    await db_session.flush()

    # Attempt to schedule Match 1 on Court 1 overlapping booking -> 409 Conflict
    res_match_overlap = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={
            "court_id": str(court_1.id),
            "start_at": (start_time + timedelta(minutes=15)).isoformat(),
            "duration_minutes": 60,
        },
        headers=headers_staff,
    )
    assert res_match_overlap.status_code == 409
    assert "booking" in res_match_overlap.json()["detail"].lower()

    # 2. Schedule Match 2 on Court 2 from start_time to end_time
    res_sched_court2 = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_2.id}/schedule",
        json={
            "court_id": str(court_2.id),
            "start_at": start_time.isoformat(),
            "duration_minutes": 60,
        },
        headers=headers_staff,
    )
    assert res_sched_court2.status_code == 200

    # Attempt player booking on Court 2 overlapping competition match -> 409 Conflict
    res_booking_overlap = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/bookings",
        json={
            "court_id": str(court_2.id),
            "start_at": (start_time + timedelta(minutes=30)).isoformat(),
            "end_at": (end_time + timedelta(minutes=30)).isoformat(),
        },
        headers=headers_player,
    )
    assert res_booking_overlap.status_code == 409
    assert "competition match" in res_booking_overlap.json()["detail"].lower()


@pytest.mark.asyncio
async def test_bye_or_incomplete_bracket_match_rejected(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_a: Club,
    court_1: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, teams, _ = tournament_round_robin
    headers = make_auth_header(staff_users["director"])
    start_time = datetime.now(timezone.utc) + timedelta(days=1)

    # Create unprogressed bracket match with team_b_id = None
    bracket_match = Match(
        tournament_id=tournament.id,
        bracket_round=2,
        bracket_position=1,
        team_a_id=teams[0].id,
        team_b_id=None,
        status=MatchStatus.PENDING,
    )
    db_session.add(bracket_match)
    await db_session.flush()

    # Attempt to schedule incomplete match -> 400 Bad Request
    res_incomp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{bracket_match.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat()},
        headers=headers,
    )
    assert res_incomp.status_code == 400
    assert "without two valid competitors" in res_incomp.json()["detail"].lower()

    # Once competitor is populated, scheduling succeeds
    bracket_match.team_b_id = teams[1].id
    await db_session.flush()

    res_comp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{bracket_match.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat()},
        headers=headers,
    )
    assert res_comp.status_code == 200
    assert res_comp.json()["court_id"] == str(court_1.id)


@pytest.mark.asyncio
async def test_historical_completed_match_immutability(
    async_client: AsyncClient,
    db_session: AsyncSession,
    club_a: Club,
    court_1: Court,
    court_2: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, teams, matches = tournament_round_robin
    match_1 = matches[0]
    headers = make_auth_header(staff_users["owner"])

    past_start = datetime.now(timezone.utc) - timedelta(hours=4)
    past_end = past_start + timedelta(hours=1)

    # Set match as scheduled and completed
    match_1.court_id = court_1.id
    match_1.scheduled_start_at = past_start
    match_1.scheduled_end_at = past_end
    match_1.status = MatchStatus.COMPLETED
    match_1.score_a = 11
    match_1.score_b = 8
    match_1.winner_team_id = teams[0].id
    await db_session.flush()

    # Attempt to reschedule completed match -> 400
    res_re = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={"court_id": str(court_2.id)},
        headers=headers,
    )
    assert res_re.status_code == 400
    assert "completed" in res_re.json()["detail"].lower()

    # Attempt to unschedule completed match -> 400
    res_un = await async_client.delete(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        headers=headers,
    )
    assert res_un.status_code == 400
    assert "completed" in res_un.json()["detail"].lower()

    # Historical schedule remains intact
    await db_session.refresh(match_1)
    assert match_1.court_id == court_1.id
    assert match_1.scheduled_start_at.replace(tzinfo=timezone.utc) == past_start


@pytest.mark.asyncio
async def test_permissions_and_roles(
    async_client: AsyncClient,
    club_a: Club,
    court_1: Court,
    staff_users: dict,
    players: dict,
    tournament_round_robin: tuple,
):
    tournament, _, matches = tournament_round_robin
    m1, m2, m3 = matches
    start_time = datetime.now(timezone.utc) + timedelta(days=3)

    # Owner can schedule (200)
    res_owner = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m1.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat()},
        headers=make_auth_header(staff_users["owner"]),
    )
    assert res_owner.status_code == 200

    # Manager can unschedule (200)
    res_mgr = await async_client.delete(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m1.id}/schedule",
        headers=make_auth_header(staff_users["manager"]),
    )
    assert res_mgr.status_code == 200

    # Tournament Director can schedule (200)
    res_dir = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m1.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat()},
        headers=make_auth_header(staff_users["director"]),
    )
    assert res_dir.status_code == 200

    # Player is forbidden (403)
    res_player = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m2.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": (start_time + timedelta(hours=2)).isoformat()},
        headers=make_auth_header(players["users"][0]),
    )
    assert res_player.status_code == 403


@pytest.mark.asyncio
async def test_tenant_isolation(
    async_client: AsyncClient,
    club_a: Club,
    club_b: Club,
    court_1: Court,
    court_b: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, _, matches = tournament_round_robin
    match_1 = matches[0]
    headers = make_auth_header(staff_users["director"])
    start_time = datetime.now(timezone.utc) + timedelta(days=1)

    # Attempting to access tournament through club_b endpoint returns 403/404
    res = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/tournaments/{tournament.id}/matches/{match_1.id}/schedule",
        json={"court_id": str(court_b.id), "start_at": start_time.isoformat()},
        headers=headers,
    )
    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_daily_club_schedule_and_court_availability(
    async_client: AsyncClient,
    club_a: Club,
    court_1: Court,
    court_2: Court,
    staff_users: dict,
    tournament_round_robin: tuple,
):
    tournament, _, matches = tournament_round_robin
    m1 = matches[0]
    headers = make_auth_header(staff_users["manager"])

    target_day = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    start_time = datetime.combine(target_day, time(10, 0), tzinfo=timezone.utc)

    # Schedule match on court 1
    res_s = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m1.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat(), "duration_minutes": 60},
        headers=headers,
    )
    assert res_s.status_code == 200

    # 1. Daily schedule query
    res_daily = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/competition-schedule?date={target_day.isoformat()}",
        headers=headers,
    )
    assert res_daily.status_code == 200
    court_schedules = res_daily.json()
    assert len(court_schedules) >= 2
    c1_sched = next(cs for cs in court_schedules if cs["court_id"] == str(court_1.id))
    assert len(c1_sched["scheduled_matches"]) == 1

    # 2. Court availability query
    res_avail = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/competition-court-availability?date={target_day.isoformat()}",
        headers=headers,
    )
    assert res_avail.status_code == 200
    avail_courts = res_avail.json()
    c1_avail = next(ca for ca in avail_courts if ca["court_id"] == str(court_1.id))
    slot_10 = next(s for s in c1_avail["slots"] if "10:00:00" in s["start_at"])
    assert slot_10["is_available"] is False
    assert slot_10["conflict_reason"] == "competition_match"


@pytest.mark.asyncio
async def test_player_competition_schedule(
    async_client: AsyncClient,
    club_a: Club,
    court_1: Court,
    staff_users: dict,
    players: dict,
    tournament_round_robin: tuple,
):
    tournament, teams, matches = tournament_round_robin
    # m1 has Team Red Aces (players[0] and players[1]) vs Team Blue Bombers (players[2] and players[3])
    m1 = matches[0]
    headers_staff = make_auth_header(staff_users["director"])

    start_time = datetime.now(timezone.utc) + timedelta(days=2, hours=1)

    # Schedule m1
    res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments/{tournament.id}/matches/{m1.id}/schedule",
        json={"court_id": str(court_1.id), "start_at": start_time.isoformat(), "duration_minutes": 60},
        headers=headers_staff,
    )
    assert res.status_code == 200

    # Player 1 queries personal schedule
    p1 = players["users"][0]
    res_p1 = await async_client.get(
        "/api/v1/players/me/competition-schedule",
        headers=make_auth_header(p1),
    )
    assert res_p1.status_code == 200
    p1_matches = res_p1.json()
    assert len(p1_matches) == 1
    assert p1_matches[0]["opponent_name"] == "Blue Bombers"
    assert p1_matches[0]["court_name"] == "Court 1"

    # Player 5 (Team Charlie) does not play in m1
    p5 = players["users"][4]
    res_p5 = await async_client.get(
        "/api/v1/players/me/competition-schedule",
        headers=make_auth_header(p5),
    )
    assert res_p5.status_code == 200
    assert len(res_p5.json()) == 0
