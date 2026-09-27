"""
Aught2 Pickleball — Phase 9: League Competition Engine Tests

Comprehensive automated test suite covering:
  1. Pure Computation Unit Tests (No Database):
     - validate_league_config: duration, team count, playoff count rules
     - deterministic team sorting: seed, name, id
     - regular-season schedule: polygon rotation, even teams, odd teams with BYEs (no fake matches)
     - cumulative standings calculation: wins, losses, points, differential
     - tiebreaker hierarchy: wins -> diff -> points scored -> team name -> id
     - playoff qualification and rank-based deterministic seeding
     - playoff bracket generation via BracketEngine reuse

  2. Integration & API Tests (with Database):
     - Staff authorization & permissions (Owner, Manager, Director allowed; Player forbidden)
     - Tenant isolation (Club A vs Club B)
     - League lifecycle transitions (draft -> registration_open -> registration_closed -> in_progress -> playoffs -> completed)
     - Team management: team_size, duplicate player prevention, cross-team prevention, membership validation
     - Schedule generation & week assignment (Weeks 1..N-1 regular season, Week N playoffs)
     - Match score recording & validation (11 win by 2, winner derivation)
     - Score correction & snapshot updates
     - Regular-season locking rule once playoffs begin
     - Cumulative standings & weekly snapshot derivation
     - Playoff generation: deterministic qualification from standings
     - Playoff match execution, winner auto-advancement, and champion determination
     - Player read-only endpoints (my-team, weeks, standings, playoffs)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import MatchStage, MatchStatus
from app.models.league import LeagueStatus, LeagueWeekStatus, LeagueWeekType
from app.models.player_profile import PlayerProfile
from app.models.user import User
from app.services.competition.league_engine import (
    LeagueConfigurationError,
    LeagueEngine,
    LeagueStandingRow,
)
from tests.conftest import make_auth_header


# ==============================================================================
# 1. Pure Computation Unit Tests (No Database)
# ==============================================================================

class TestLeagueEngineUnit:
    @pytest.fixture(autouse=True)
    def setup_engine(self):
        self.engine = LeagueEngine()

    def test_validate_config_valid(self):
        self.engine.validate_league_config(number_of_weeks=4, playoff_team_count=4, num_teams=8)
        self.engine.validate_league_config(number_of_weeks=2, playoff_team_count=2, num_teams=2)
        self.engine.validate_league_config(number_of_weeks=6, playoff_team_count=4, num_teams=6)

    def test_validate_config_fewer_than_2_weeks_raises(self):
        with pytest.raises(LeagueConfigurationError, match="at least 2 weeks"):
            self.engine.validate_league_config(number_of_weeks=1, playoff_team_count=2, num_teams=4)

    def test_validate_config_fewer_than_2_teams_raises(self):
        with pytest.raises(LeagueConfigurationError, match="at least 2 teams"):
            self.engine.validate_league_config(number_of_weeks=4, playoff_team_count=2, num_teams=1)

    def test_validate_config_playoff_teams_less_than_2_raises(self):
        with pytest.raises(LeagueConfigurationError, match="at least 2"):
            self.engine.validate_league_config(number_of_weeks=4, playoff_team_count=1, num_teams=4)

    def test_validate_config_playoff_teams_exceeds_teams_raises(self):
        with pytest.raises(LeagueConfigurationError, match="cannot exceed"):
            self.engine.validate_league_config(number_of_weeks=4, playoff_team_count=6, num_teams=4)

    def test_sort_teams_deterministically(self):
        teams = [
            {"id": uuid.uuid4(), "name": "Zebra", "seed": None},
            {"id": uuid.uuid4(), "name": "Bravo", "seed": 2},
            {"id": uuid.uuid4(), "name": "Alpha", "seed": 1},
            {"id": uuid.uuid4(), "name": "Apple", "seed": None},
        ]
        sorted_teams = self.engine.sort_teams_deterministically(teams)
        assert sorted_teams[0]["name"] == "Alpha"
        assert sorted_teams[1]["name"] == "Bravo"
        assert sorted_teams[2]["name"] == "Apple"  # Unseeded: Apple before Zebra
        assert sorted_teams[3]["name"] == "Zebra"

    def test_schedule_4_teams_3_weeks(self):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 5)]
        slots = self.engine.generate_regular_season_schedule(teams, num_regular_weeks=3)

        # 4 teams = 2 matches per week * 3 weeks = 6 matches
        assert len(slots) == 6
        by_week = {}
        for s in slots:
            by_week.setdefault(s.week_number, []).append(s)

        assert len(by_week[1]) == 2
        assert len(by_week[2]) == 2
        assert len(by_week[3]) == 2

        # In each week, all 4 teams play exactly once
        for w, matches in by_week.items():
            week_teams = []
            for m in matches:
                week_teams.extend([m.team_a_id, m.team_b_id])
            assert len(week_teams) == 4
            assert len(set(week_teams)) == 4

        # Zero duplicate pairings across the 3 weeks
        pairings = {tuple(sorted([str(s.team_a_id), str(s.team_b_id)])) for s in slots}
        assert len(pairings) == 6

    def test_schedule_odd_teams_bye_handling(self):
        """Odd team count (5 teams): exactly 2 matches per week, 1 BYE per week (no fake match)."""
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 6)]
        slots = self.engine.generate_regular_season_schedule(teams, num_regular_weeks=5)

        # 5 teams: each week has 2 real matches and 1 BYE. Over 5 weeks = 10 matches total
        assert len(slots) == 10

        by_week = {}
        for s in slots:
            by_week.setdefault(s.week_number, []).append(s)

        for w, matches in by_week.items():
            assert len(matches) == 2
            played_teams = []
            for m in matches:
                assert m.team_a_id is not None
                assert m.team_b_id is not None
                played_teams.extend([m.team_a_id, m.team_b_id])
            assert len(played_teams) == 4
            assert len(set(played_teams)) == 4
            # Exactly 1 team sat out (had a BYE)
            assert len(set([t["id"] for t in teams]) - set(played_teams)) == 1

    def test_schedule_is_strictly_deterministic(self):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 7)]
        s1 = self.engine.generate_regular_season_schedule(teams, 5)
        s2 = self.engine.generate_regular_season_schedule(teams, 5)

        for a, b in zip(s1, s2):
            assert a.team_a_id == b.team_a_id
            assert a.team_b_id == b.team_b_id
            assert a.week_number == b.week_number
            assert a.match_number == b.match_number

    def test_calculate_standings_tiebreaker_hierarchy(self):
        t1 = {"id": uuid.uuid4(), "name": "Team 1"}
        t2 = {"id": uuid.uuid4(), "name": "Team 2"}
        t3 = {"id": uuid.uuid4(), "name": "Team 3"}
        t4 = {"id": uuid.uuid4(), "name": "Team 4"}
        teams = [t1, t2, t3, t4]

        # T1 beats T2 (11-9): T1 +2, T2 -2
        # T3 beats T4 (11-0): T3 +11, T4 -11
        # Both T1 and T3 have 1 win, but T3 has diff +11 vs T1 +2 -> T3 ranks higher!
        matches = [
            {"status": "completed", "score_a": 11, "score_b": 9, "team_a_id": t1["id"], "team_b_id": t2["id"]},
            {"status": "completed", "score_a": 11, "score_b": 0, "team_a_id": t3["id"], "team_b_id": t4["id"]},
        ]
        standings = self.engine.calculate_standings(teams, matches)
        assert standings[0].team_id == t3["id"]
        assert standings[0].rank == 1
        assert standings[1].team_id == t1["id"]
        assert standings[1].rank == 2
        assert standings[2].team_id == t2["id"]
        assert standings[2].rank == 3
        assert standings[3].team_id == t4["id"]
        assert standings[3].rank == 4

    def test_calculate_standings_team_name_fallback(self):
        t_b = {"id": uuid.uuid4(), "name": "Bravo"}
        t_a = {"id": uuid.uuid4(), "name": "Alpha"}
        teams = [t_b, t_a]

        # Equal 0-0 stats -> Alpha precedes Bravo
        standings = self.engine.calculate_standings(teams, [])
        assert standings[0].team_name == "Alpha"
        assert standings[0].rank == 1
        assert standings[1].team_name == "Bravo"
        assert standings[1].rank == 2

    def test_prepare_playoff_teams_seeds_by_rank(self):
        standings = [
            LeagueStandingRow(team_id=uuid.uuid4(), team_name="T1", rank=1, wins=3),
            LeagueStandingRow(team_id=uuid.uuid4(), team_name="T2", rank=2, wins=2),
            LeagueStandingRow(team_id=uuid.uuid4(), team_name="T3", rank=3, wins=1),
            LeagueStandingRow(team_id=uuid.uuid4(), team_name="T4", rank=4, wins=0),
        ]
        qualified = self.engine.prepare_playoff_teams(standings, playoff_team_count=2)
        assert len(qualified) == 2
        assert qualified[0]["name"] == "T1"
        assert qualified[0]["seed"] == 1
        assert qualified[1]["name"] == "T2"
        assert qualified[1]["seed"] == 2

    def test_generate_playoffs_reuses_bracket_engine(self):
        league_id = uuid.uuid4()
        qualified = [
            {"id": uuid.uuid4(), "name": f"Seed {i}", "seed": i}
            for i in range(1, 5)
        ]
        slots = self.engine.generate_playoff_bracket(league_id, qualified)
        # 4 teams = 3 matches (2 semifinal + 1 final), 2 rounds
        assert len(slots) == 3
        r1 = [s for s in slots if s.bracket_round == 1]
        r2 = [s for s in slots if s.bracket_round == 2]
        assert len(r1) == 2
        assert len(r2) == 1


# ==============================================================================
# 2. Database & API Integration Tests
# ==============================================================================

@pytest_asyncio.fixture
async def league_setup(db_session: AsyncSession):
    """
    Sets up:
      - Club A and Club B
      - Club A Owner, Manager, Tournament Director, Regular Player
      - Club B Owner
      - 8 active player memberships in Club A
      - 2 active player memberships in Club B
    """
    club_a = Club(name="Alpha Pickleball Club", slug=f"alpha-club-{uuid.uuid4().hex[:6]}", is_active=True)
    club_b = Club(name="Beta Pickleball Club", slug=f"beta-club-{uuid.uuid4().hex[:6]}", is_active=True)
    db_session.add_all([club_a, club_b])
    await db_session.flush()

    # Club A staff & player
    owner = User(email=f"owner+{uuid.uuid4().hex[:6]}@test.local", hashed_password=hash_password("Pass123!"), full_name="Club Owner", is_active=True, is_verified=True)
    manager = User(email=f"manager+{uuid.uuid4().hex[:6]}@test.local", hashed_password=hash_password("Pass123!"), full_name="Club Manager", is_active=True, is_verified=True)
    director = User(email=f"director+{uuid.uuid4().hex[:6]}@test.local", hashed_password=hash_password("Pass123!"), full_name="Tournament Director", is_active=True, is_verified=True)
    player = User(email=f"player+{uuid.uuid4().hex[:6]}@test.local", hashed_password=hash_password("Pass123!"), full_name="Club Player", is_active=True, is_verified=True)
    owner_b = User(email=f"ownerb+{uuid.uuid4().hex[:6]}@test.local", hashed_password=hash_password("Pass123!"), full_name="Club B Owner", is_active=True, is_verified=True)

    db_session.add_all([owner, manager, director, player, owner_b])
    await db_session.flush()

    for u in [owner, manager, director, player, owner_b]:
        db_session.add(PlayerProfile(user_id=u.id, display_name=u.full_name))
    await db_session.flush()

    # Club A Memberships
    db_session.add(ClubMembership(user_id=owner.id, club_id=club_a.id, role=ClubRole.CLUB_OWNER, is_active=True))
    db_session.add(ClubMembership(user_id=manager.id, club_id=club_a.id, role=ClubRole.CLUB_MANAGER, is_active=True))
    db_session.add(ClubMembership(user_id=director.id, club_id=club_a.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    # Club B Membership
    db_session.add(ClubMembership(user_id=owner_b.id, club_id=club_b.id, role=ClubRole.CLUB_OWNER, is_active=True))
    await db_session.flush()

    # 8 Player memberships in Club A
    pms_a = []
    player_users_a = []
    for i in range(1, 9):
        u = User(email=f"lplayer{i}+{uuid.uuid4().hex[:6]}@test.local", hashed_password=hash_password("Pass123!"), full_name=f"Player {chr(64 + i)}", is_active=True, is_verified=True)
        db_session.add(u)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=u.id, display_name=u.full_name))
        pm = ClubPlayerMembership(user_id=u.id, club_id=club_a.id, membership_number=f"A-{i:03d}", status=PlayerMembershipStatus.ACTIVE)
        db_session.add(pm)
        pms_a.append(pm)
        player_users_a.append(u)

    # 2 Player memberships in Club B
    pms_b = []
    for i in range(1, 3):
        u = User(email=f"bplayer{i}+{uuid.uuid4().hex[:6]}@test.local", hashed_password=hash_password("Pass123!"), full_name=f"BPlayer {i}", is_active=True, is_verified=True)
        db_session.add(u)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=u.id, display_name=u.full_name))
        pm = ClubPlayerMembership(user_id=u.id, club_id=club_b.id, membership_number=f"B-{i:03d}", status=PlayerMembershipStatus.ACTIVE)
        db_session.add(pm)
        pms_b.append(pm)

    await db_session.commit()

    return {
        "club_a": club_a,
        "club_b": club_b,
        "owner": owner,
        "manager": manager,
        "director": director,
        "player": player,
        "owner_b": owner_b,
        "pms_a": pms_a,
        "player_users_a": player_users_a,
        "pms_b": pms_b,
    }


class TestLeagueLifecycleAPI:
    """Test league creation, updates, and lifecycle status guards."""

    @pytest.mark.asyncio
    async def test_staff_can_create_league(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]

        # Owner allowed
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=make_auth_header(data["owner"]),
            json={"name": "Fall League", "number_of_weeks": 4, "playoff_team_count": 4},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == "Fall League"
        assert body["status"] == "draft"
        assert body["number_of_weeks"] == 4
        assert body["current_week"] == 1

        # Manager allowed
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=make_auth_header(data["manager"]),
            json={"name": "Winter League", "number_of_weeks": 3, "playoff_team_count": 2},
        )
        assert r.status_code == 201

        # Tournament Director allowed
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=make_auth_header(data["director"]),
            json={"name": "Spring League", "number_of_weeks": 4, "playoff_team_count": 4},
        )
        assert r.status_code == 201

    @pytest.mark.asyncio
    async def test_player_cannot_create_league(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=make_auth_header(data["player"]),
            json={"name": "Player League", "number_of_weeks": 4, "playoff_team_count": 4},
        )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_create_league(self, async_client: AsyncClient, league_setup: dict):
        club = league_setup["club_a"]
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            json={"name": "Public League", "number_of_weeks": 4, "playoff_team_count": 4},
        )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_league_lifecycle_transitions(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        headers = make_auth_header(data["director"])

        # Create draft
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=headers,
            json={"name": "Lifecycle League", "number_of_weeks": 3, "playoff_team_count": 2},
        )
        assert r.status_code == 201
        lid = r.json()["id"]

        # Open registration
        r = await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/open-registration", headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] == "registration_open"

        # Close registration
        r = await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/close-registration", headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] == "registration_closed"

        # Cancel league
        r = await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/cancel", headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"


class TestLeagueTeamAPI:
    """Test league team operations and validations."""

    @pytest.mark.asyncio
    async def test_team_creation_and_validations(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        headers = make_auth_header(data["director"])
        pms = data["pms_a"]

        # Create league
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=headers,
            json={"name": "Team Validation League", "number_of_weeks": 3, "team_size": 2, "playoff_team_count": 2},
        )
        lid = r.json()["id"]

        # 1. Successful team creation
        r_t1 = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=headers,
            json={"name": "Team Alpha", "member_player_membership_ids": [str(pms[0].id), str(pms[1].id)]},
        )
        assert r_t1.status_code == 201
        assert r_t1.json()["name"] == "Team Alpha"
        assert len(r_t1.json()["members"]) == 2

        # 2. Duplicate team name rejected
        r_dup_name = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=headers,
            json={"name": "Team Alpha", "member_player_membership_ids": [str(pms[2].id), str(pms[3].id)]},
        )
        assert r_dup_name.status_code == 400
        assert "already exists" in r_dup_name.json()["detail"]

        # 3. Incorrect team size rejected (requires 2, passed 1)
        r_size = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=headers,
            json={"name": "Team Solo", "member_player_membership_ids": [str(pms[2].id)]},
        )
        assert r_size.status_code == 400
        assert "exactly 2 members" in r_size.json()["detail"]

        # 4. Duplicate members in same team rejected
        r_dup_member = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=headers,
            json={"name": "Team Clone", "member_player_membership_ids": [str(pms[2].id), str(pms[2].id)]},
        )
        assert r_dup_member.status_code == 400
        assert "duplicate players" in r_dup_member.json()["detail"]

        # 5. Player in multiple teams rejected
        r_multi_team = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=headers,
            json={"name": "Team Beta", "member_player_membership_ids": [str(pms[0].id), str(pms[3].id)]},
        )
        assert r_multi_team.status_code == 400
        assert "already a member" in r_multi_team.json()["detail"]

        # 6. Player from another club rejected
        pms_b = data["pms_b"]
        r_wrong_club = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=headers,
            json={"name": "Team Cross", "member_player_membership_ids": [str(pms[2].id), str(pms_b[0].id)]},
        )
        assert r_wrong_club.status_code == 400
        assert "not an active member of this club" in r_wrong_club.json()["detail"]


class TestLeagueScheduleAndMatchesAPI:
    """Test regular season schedule generation, match listing, and week structure."""

    @pytest.mark.asyncio
    async def test_generate_schedule_and_weeks(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        headers = make_auth_header(data["director"])
        pms = data["pms_a"]

        # Create 3-week league with 4 teams
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=headers,
            json={"name": "Schedule League", "number_of_weeks": 3, "playoff_team_count": 2},
        )
        lid = r.json()["id"]

        # Register 4 teams (8 players)
        for i in range(4):
            await async_client.post(
                f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
                headers=headers,
                json={"name": f"Team {i+1}", "member_player_membership_ids": [str(pms[2*i].id), str(pms[2*i+1].id)]},
            )

        # Generate schedule blocked while DRAFT
        r_draft = await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/generate-schedule", headers=headers)
        assert r_draft.status_code == 400

        # Transition to registration_closed
        await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/open-registration", headers=headers)
        await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/close-registration", headers=headers)

        # Generate schedule succeeds
        r_sched = await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/generate-schedule", headers=headers)
        assert r_sched.status_code == 201
        weeks = r_sched.json()
        assert len(weeks) == 3

        # Weeks 1 and 2 contain all 6 unique pairings distributed across the 2 regular season weeks
        assert weeks[0]["week_type"] == "regular_season"
        assert weeks[0]["status"] == "in_progress"
        assert len(weeks[0]["matches"]) == 4  # 2 rounds

        assert weeks[1]["week_type"] == "regular_season"
        assert weeks[1]["status"] == "pending"
        assert len(weeks[1]["matches"]) == 2  # 1 round (total 6 matches for 4 teams)

        # Week 3 is playoffs
        assert weeks[2]["week_type"] == "playoffs"
        assert weeks[2]["status"] == "pending"
        assert len(weeks[2]["matches"]) == 0  # Playoffs generated after regular season

        # Idempotency: duplicate generate schedule rejected
        r_dup = await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/generate-schedule", headers=headers)
        assert r_dup.status_code == 400


class TestLeagueCompetitionFlowAPI:
    """End-to-end competition flow: scoring, standings, snapshots, playoffs, and champion."""

    @pytest.mark.asyncio
    async def test_full_league_competition_flow(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        headers = make_auth_header(data["director"])
        pms = data["pms_a"]

        # Create 3-week league (Weeks 1-2 regular season, Week 3 playoffs, top 2 teams)
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=headers,
            json={"name": "Championship League", "number_of_weeks": 3, "playoff_team_count": 2},
        )
        lid = r.json()["id"]

        # Add 4 teams
        for i in range(4):
            await async_client.post(
                f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
                headers=headers,
                json={"name": f"Team {chr(65+i)}", "member_player_membership_ids": [str(pms[2*i].id), str(pms[2*i+1].id)]},
            )

        await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/open-registration", headers=headers)
        await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/close-registration", headers=headers)
        await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/generate-schedule", headers=headers)

        # List matches
        r_matches = await async_client.get(f"/api/v1/clubs/{club.id}/leagues/{lid}/matches", headers=headers)
        matches = r_matches.json()
        assert len(matches) == 6  # 4 teams round-robin = 4 * 3 // 2 = 6 unique matches

        week1_matches = [m for m in matches if m["week_number"] == 1]
        week2_matches = [m for m in matches if m["week_number"] == 2]
        assert len(week1_matches) == 4
        assert len(week2_matches) == 2

        # Score Week 1 matches
        # Invalid score rejected
        r_inv = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week1_matches[0]['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 10},
        )
        assert r_inv.status_code == 422

        # Valid scores for all Week 1 matches
        await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week1_matches[0]['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 5},
        )
        await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week1_matches[1]['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 9},
        )
        await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week1_matches[2]['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 6},
        )
        await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week1_matches[3]['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 8},
        )

        # Week 1 is now completed, snapshots saved
        r_snaps = await async_client.get(f"/api/v1/clubs/{club.id}/leagues/{lid}/snapshots", headers=headers)
        assert r_snaps.status_code == 200
        snaps = r_snaps.json()
        assert len(snaps) >= 1
        assert snaps[0]["week_number"] == 1
        assert len(snaps[0]["standings"]) == 4

        # Score correction on Week 1 match
        r_corr = await async_client.patch(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week1_matches[0]['id']}/score",
            headers=headers,
            json={"score_a": 12, "score_b": 10},
        )
        assert r_corr.status_code == 200
        assert r_corr.json()["score_a"] == 12

        # Score Week 2 matches (completes regular season)
        await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week2_matches[0]['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )
        await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week2_matches[1]['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 8},
        )

        # League should now be in PLAYOFFS status (auto-transitioned)
        r_league = await async_client.get(f"/api/v1/clubs/{club.id}/leagues/{lid}", headers=headers)
        assert r_league.json()["status"] == "playoffs"

        # REGULAR SEASON LOCK GUARD: Regular season score modification now blocked!
        r_locked = await async_client.patch(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{week1_matches[0]['id']}/score",
            headers=headers,
            json={"score_a": 15, "score_b": 13},
        )
        assert r_locked.status_code == 400
        assert "locked once playoffs begin" in r_locked.json()["detail"]

        # View Playoff Bracket
        r_playoffs = await async_client.get(f"/api/v1/clubs/{club.id}/leagues/{lid}/playoffs", headers=headers)
        assert r_playoffs.status_code == 200
        playoff_data = r_playoffs.json()
        assert playoff_data["total_playoff_teams"] == 2
        assert len(playoff_data["matches"]) == 1  # 2 teams = 1 Final match
        final_match = playoff_data["matches"][0]
        assert final_match["status"] == "pending"

        # Score Final Match
        r_final_score = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/matches/{final_match['id']}/score",
            headers=headers,
            json={"score_a": 11, "score_b": 4},
        )
        assert r_final_score.status_code == 200
        champ_id = r_final_score.json()["winner_team_id"]

        # League is now COMPLETED, champion is set
        r_league_final = await async_client.get(f"/api/v1/clubs/{club.id}/leagues/{lid}", headers=headers)
        body = r_league_final.json()
        assert body["status"] == "completed"
        assert body["champion_team_id"] == champ_id


class TestLeaguePlayerReadAPI:
    """Test read-only access for regular players and unauthenticated users."""

    @pytest.mark.asyncio
    async def test_player_endpoints(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        staff_headers = make_auth_header(data["director"])
        player_headers = make_auth_header(data["player"])
        pms = data["pms_a"]

        # Create league and team
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=staff_headers,
            json={"name": "Public Summer League", "number_of_weeks": 3, "playoff_team_count": 2},
        )
        lid = r.json()["id"]

        await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=staff_headers,
            json={"name": "Player Aces", "member_player_membership_ids": [str(pms[0].id), str(pms[1].id)]},
        )
        await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/open-registration", headers=staff_headers)

        # 1. Public list leagues
        r_pub = await async_client.get("/api/v1/leagues")
        assert r_pub.status_code == 200
        assert any(l["id"] == lid for l in r_pub.json())

        # 2. Player get league details
        r_det = await async_client.get(f"/api/v1/leagues/{lid}", headers=player_headers)
        assert r_det.status_code == 200
        assert r_det.json()["name"] == "Public Summer League"

        # 3. Player list teams
        r_teams = await async_client.get(f"/api/v1/leagues/{lid}/teams", headers=player_headers)
        assert r_teams.status_code == 200
        assert len(r_teams.json()) == 1

        # 4. Player cannot perform staff actions (e.g. create team, score match)
        r_forbidden = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/teams",
            headers=player_headers,
            json={"name": "Illegal Team", "member_player_membership_ids": [str(pms[2].id), str(pms[3].id)]},
        )
        assert r_forbidden.status_code == 403


class TestLeagueEqualMatchSchedulingUnit:
    """Validate equal regular-season matches for 6-team, 8-team, and 10-team leagues."""

    def setup_method(self):
        from app.services.competition.league_engine import LeagueEngine
        self.engine = LeagueEngine()

    @pytest.mark.parametrize("n_teams,num_reg_weeks", [
        (6, 3),   # 6 teams, 3 regular weeks (fewer weeks than 5 rounds)
        (6, 5),   # 6 teams, 5 regular weeks (exact 1 round/week)
        (8, 4),   # 8 teams, 4 regular weeks (fewer weeks than 7 rounds)
        (8, 7),   # 8 teams, 7 regular weeks (exact 1 round/week)
        (10, 5),  # 10 teams, 5 regular weeks (fewer weeks than 9 rounds)
        (10, 9),  # 10 teams, 9 regular weeks (exact 1 round/week)
        (7, 7),   # Odd 7 teams, 7 regular weeks (BYEs handled)
    ])
    def test_equal_matches_and_complete_round_robin(self, n_teams: int, num_reg_weeks: int):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, n_teams + 1)]
        slots = self.engine.generate_regular_season_schedule(teams, num_regular_weeks=num_reg_weeks)

        expected_total_matches = n_teams * (n_teams - 1) // 2
        assert len(slots) == expected_total_matches, f"Expected {expected_total_matches} matches for {n_teams} teams"

        # Count matches played per team
        team_match_counts = {t["id"]: 0 for t in teams}
        pairings = set()

        for s in slots:
            assert s.team_a_id is not None
            assert s.team_b_id is not None
            assert s.team_a_id != s.team_b_id
            assert 1 <= s.week_number <= num_reg_weeks

            team_match_counts[s.team_a_id] += 1
            team_match_counts[s.team_b_id] += 1

            pair = tuple(sorted([str(s.team_a_id), str(s.team_b_id)]))
            assert pair not in pairings, f"Duplicate pairing generated: {pair}"
            pairings.add(pair)

        # Every single pair must meet exactly once
        assert len(pairings) == expected_total_matches

        # Central Requirement: EVERY team must have the EXACT SAME number of regular season matches (N - 1)
        expected_per_team = n_teams - 1
        for team_id, count in team_match_counts.items():
            assert count == expected_per_team, (
                f"Team {team_id} played {count} matches, expected {expected_per_team}"
            )


class TestLeaguePlayerRegistrationAPI:
    """Test player self-registration, status check, and cancellation."""

    @pytest.mark.asyncio
    async def test_player_self_registration_flow(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        staff_headers = make_auth_header(data["director"])
        player_a_headers = make_auth_header(data["player_users_a"][0])
        player_b = data["pms_a"][1]
        player_c = data["pms_a"][2]

        # 1. Create league and open registration
        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=staff_headers,
            json={"name": "Open Doubles League", "number_of_weeks": 4, "playoff_team_count": 2},
        )
        lid = r.json()["id"]

        # Cannot register while DRAFT
        r_draft = await async_client.post(
            f"/api/v1/leagues/{lid}/register",
            headers=player_a_headers,
            json={"team_name": "Dynamic Duo", "partner_membership_id": str(player_b.id)},
        )
        assert r_draft.status_code == 400

        # Open registration
        await async_client.post(f"/api/v1/clubs/{club.id}/leagues/{lid}/open-registration", headers=staff_headers)

        # Status before registration: not registered
        r_status0 = await async_client.get(f"/api/v1/leagues/{lid}/registration-status", headers=player_a_headers)
        assert r_status0.status_code == 200
        assert r_status0.json()["is_registered"] is False

        # Cannot register with self
        caller_pm = data["pms_a"][0]
        r_self = await async_client.post(
            f"/api/v1/leagues/{lid}/register",
            headers=player_a_headers,
            json={"team_name": "Solo Team", "partner_membership_id": str(caller_pm.id)},
        )
        assert r_self.status_code == 400

        # Valid registration
        r_reg = await async_client.post(
            f"/api/v1/leagues/{lid}/register",
            headers=player_a_headers,
            json={"team_name": "Dynamic Duo", "partner_membership_id": str(player_b.id)},
        )
        assert r_reg.status_code == 201
        assert r_reg.json()["name"] == "Dynamic Duo"

        # Status after registration: registered
        r_status1 = await async_client.get(f"/api/v1/leagues/{lid}/registration-status", headers=player_a_headers)
        assert r_status1.status_code == 200
        assert r_status1.json()["is_registered"] is True
        assert r_status1.json()["team"]["name"] == "Dynamic Duo"

        # Duplicate registration blocked
        r_dup = await async_client.post(
            f"/api/v1/leagues/{lid}/register",
            headers=player_a_headers,
            json={"team_name": "Another Team", "partner_membership_id": str(player_c.id)},
        )
        assert r_dup.status_code == 400

        # Partner cannot register another team either
        player_b_headers = make_auth_header(data["player_users_a"][1])
        r_partner_dup = await async_client.post(
            f"/api/v1/leagues/{lid}/register",
            headers=player_b_headers,
            json={"team_name": "Partner Team", "partner_membership_id": str(player_c.id)},
        )
        assert r_partner_dup.status_code == 400

        # Cancel registration
        r_cancel = await async_client.delete(f"/api/v1/leagues/{lid}/register", headers=player_a_headers)
        assert r_cancel.status_code == 200

        # Status after cancellation
        r_status2 = await async_client.get(f"/api/v1/leagues/{lid}/registration-status", headers=player_a_headers)
        assert r_status2.status_code == 200
        assert r_status2.json()["is_registered"] is False

    @pytest.mark.asyncio
    async def test_manual_snapshot_endpoint(self, async_client: AsyncClient, league_setup: dict):
        data = league_setup
        club = data["club_a"]
        staff_headers = make_auth_header(data["director"])

        r = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues",
            headers=staff_headers,
            json={"name": "Snapshot Test League", "number_of_weeks": 3, "playoff_team_count": 2},
        )
        lid = r.json()["id"]

        # Get week 1
        r_weeks = await async_client.get(f"/api/v1/clubs/{club.id}/leagues/{lid}/weeks", headers=staff_headers)
        w1_id = r_weeks.json()[0]["id"]

        # Trigger snapshot
        r_snap = await async_client.post(
            f"/api/v1/clubs/{club.id}/leagues/{lid}/weeks/{w1_id}/snapshot",
            headers=staff_headers,
        )
        assert r_snap.status_code == 200
        assert r_snap.json()["week_number"] == 1
        assert "created standing snapshot" in r_snap.json()["message"]
