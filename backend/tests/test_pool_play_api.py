"""
Aught2 Pickleball — Phase 6: Pool Play Competition Engine Tests

Comprehensive automated test suite covering:
  1. Pure Computation Unit Tests (no DB):
     - Pool configuration validation (balanced pools, min size, qualifiers rule)
     - Serpentine / snake distribution (deterministic, no shuffle, balanced)
     - Pool match generation (isolated Round Robin per pool, sequential numbering)
     - Independent pool standings (tiebreaker order: wins -> diff -> PF -> name)
     - Qualifier determination & deterministic championship seeding
     - Standard single-elimination bracket pairings (1v8, 4v5, 2v7, 3v6, etc.)
     - Championship bracket generation (power of 2, BYE auto-advancement, next_match links)
  2. Integration & API Tests (with DB):
     - Pool configuration (staff permissions, validations, format guards)
     - Serpentine & manual team assignment (balance checks, duplicate checks)
     - Pool match generation & regeneration (status guards, idempotency)
     - Score recording & server-derived winner
     - Pool standings derivation & qualified flag
     - Championship bracket generation from completed pool results
     - Winner auto-advancement into next match / final match completion
     - Score correction with subsequent match guard
     - Player read-only endpoints (pools, pool standings, pool matches, championship matches)
     - Cross-club tenant isolation
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Match, MatchStage, MatchStatus, Pool, PoolTeam, Team, TeamMember
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from app.services.competition.pool_play_engine import (
    ChampionshipError,
    PoolConfigurationError,
    PoolPlayEngine,
)
from tests.conftest import make_auth_header


# ==============================================================================
# 1. Pure Computation Unit Tests (No Database)
# ==============================================================================

class TestPoolPlayEngineUnit:
    @pytest.fixture(autouse=True)
    def setup_engine(self):
        self.engine = PoolPlayEngine()

    # ─── Configuration Validation ─────────────────────────────────────────────

    def test_config_validation_valid_even(self):
        # 8 teams, 2 pools, 2 qualifiers (4 per pool) -> valid
        self.engine.validate_pool_configuration(8, 2, 2)
        # 8 teams, 4 pools, 1 qualifier (2 per pool) -> valid
        self.engine.validate_pool_configuration(8, 4, 1)

    def test_config_validation_valid_uneven_diff_one(self):
        # 7 teams, 2 pools (4 and 3) -> valid, diff = 1
        self.engine.validate_pool_configuration(7, 2, 2)
        # 9 teams, 4 pools (3, 2, 2, 2) -> valid, diff = 1
        self.engine.validate_pool_configuration(9, 4, 2)

    def test_config_validation_pools_less_than_two_rejected(self):
        with pytest.raises(PoolConfigurationError, match="at least 2 pools"):
            self.engine.validate_pool_configuration(8, 1, 2)
        with pytest.raises(PoolConfigurationError, match="at least 2 pools"):
            self.engine.validate_pool_configuration(8, 0, 2)

    def test_config_validation_min_pool_less_than_two_rejected(self):
        # 3 teams, 2 pools -> pool sizes 2 and 1 (min size 1 < 2)
        with pytest.raises(PoolConfigurationError, match="at least 2 teams"):
            self.engine.validate_pool_configuration(3, 2, 1)

    def test_config_validation_qualifiers_less_than_one_rejected(self):
        with pytest.raises(PoolConfigurationError, match="at least 1"):
            self.engine.validate_pool_configuration(8, 2, 0)

    def test_config_validation_qualifiers_exceed_min_pool_rejected(self):
        # 7 teams, 2 pools -> pool sizes 4 and 3. min size = 3. qualifiers = 4 > 3
        with pytest.raises(PoolConfigurationError, match="exceeds minimum pool size"):
            self.engine.validate_pool_configuration(7, 2, 4)

    def test_config_validation_unbalanced_pools_rejected(self):
        # Explicit test helper check
        with pytest.raises(PoolConfigurationError):
            self.engine.validate_pool_configuration(5, 4, 1)  # 5 teams, 4 pools -> min 1

    # ─── Serpentine Distribution ──────────────────────────────────────────────

    def test_serpentine_distribution_8_teams_2_pools(self):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 9)]
        pools = ["Pool A", "Pool B"]
        res = self.engine.distribute_teams_serpentine(teams, pools)
        assert len(res["Pool A"]) == 4
        assert len(res["Pool B"]) == 4
        # Serpentine order:
        # Row 0: Pool A <- Team 1, Pool B <- Team 2
        # Row 1: Pool B <- Team 3, Pool A <- Team 4
        # Row 2: Pool A <- Team 5, Pool B <- Team 6
        # Row 3: Pool B <- Team 7, Pool A <- Team 8
        assert [t["name"] for t in res["Pool A"]] == ["Team 1", "Team 4", "Team 5", "Team 8"]
        assert [t["name"] for t in res["Pool B"]] == ["Team 2", "Team 3", "Team 6", "Team 7"]

    def test_serpentine_distribution_8_teams_4_pools(self):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 9)]
        pools = ["Pool A", "Pool B", "Pool C", "Pool D"]
        res = self.engine.distribute_teams_serpentine(teams, pools)
        # Row 0 (L->R): A:1, B:2, C:3, D:4
        # Row 1 (R->L): D:5, C:6, B:7, A:8
        assert [t["name"] for t in res["Pool A"]] == ["Team 1", "Team 8"]
        assert [t["name"] for t in res["Pool B"]] == ["Team 2", "Team 7"]
        assert [t["name"] for t in res["Pool C"]] == ["Team 3", "Team 6"]
        assert [t["name"] for t in res["Pool D"]] == ["Team 4", "Team 5"]

    def test_serpentine_distribution_7_teams_2_pools_uneven(self):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 8)]
        pools = ["Pool A", "Pool B"]
        res = self.engine.distribute_teams_serpentine(teams, pools)
        assert len(res["Pool A"]) == 3
        assert len(res["Pool B"]) == 4
        assert [t["name"] for t in res["Pool A"]] == ["Team 1", "Team 4", "Team 5"]
        assert [t["name"] for t in res["Pool B"]] == ["Team 2", "Team 3", "Team 6", "Team 7"]

    def test_serpentine_distribution_deterministic(self):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 9)]
        pools = ["Pool A", "Pool B"]
        res1 = self.engine.distribute_teams_serpentine(teams, pools)
        res2 = self.engine.distribute_teams_serpentine(teams, pools)
        assert [t["id"] for t in res1["Pool A"]] == [t["id"] for t in res2["Pool A"]]
        assert [t["id"] for t in res1["Pool B"]] == [t["id"] for t in res2["Pool B"]]

    def test_serpentine_distribution_no_shuffle_used(self):
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 9)]
        pools = ["Pool A", "Pool B"]
        res = self.engine.distribute_teams_serpentine(teams, pools)
        # Verify first pick in Pool A is strictly Seed 1
        assert res["Pool A"][0]["seed"] == 1
        assert res["Pool B"][0]["seed"] == 2

    # ─── Pool Match Generation ────────────────────────────────────────────────

    def test_pool_matches_generation_isolated_per_pool(self):
        pool_a_id = uuid.uuid4()
        pool_b_id = uuid.uuid4()
        teams_a = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        teams_b = [uuid.uuid4(), uuid.uuid4()]
        slots = self.engine.generate_pool_matches({
            pool_a_id: teams_a,
            pool_b_id: teams_b,
        })
        # 3 teams -> 3 matches; 2 teams -> 1 match -> Total 4 matches
        assert len(slots) == 4
        slots_a = [s for s in slots if s.pool_id == pool_a_id]
        slots_b = [s for s in slots if s.pool_id == pool_b_id]
        assert len(slots_a) == 3
        assert len(slots_b) == 1
        # Check no cross-pool matches
        for s in slots_a:
            assert s.team_a_id in teams_a and s.team_b_id in teams_a
        for s in slots_b:
            assert s.team_a_id in teams_b and s.team_b_id in teams_b

    def test_pool_matches_sequential_numbering(self):
        p1, p2 = uuid.uuid4(), uuid.uuid4()
        slots = self.engine.generate_pool_matches({
            p1: [uuid.uuid4(), uuid.uuid4()],
            p2: [uuid.uuid4(), uuid.uuid4()],
        })
        assert [s.match_number for s in slots] == [1, 2]

    def test_pool_matches_round_numbers_within_pool(self):
        p1 = uuid.uuid4()
        t1, t2, t3, t4 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        slots = self.engine.generate_pool_matches({p1: [t1, t2, t3, t4]})
        # 4 teams -> 3 rounds (2 matches per round)
        assert len(slots) == 6
        rounds = [s.round_number for s in slots]
        assert rounds == [1, 1, 2, 2, 3, 3]

    def test_pool_matches_odd_teams_bye_handled(self):
        p1 = uuid.uuid4()
        t1, t2, t3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        slots = self.engine.generate_pool_matches({p1: [t1, t2, t3]})
        # 3 teams -> 3 matches (each team plays 2 matches, 1 bye each)
        assert len(slots) == 3

    # ─── Pool Standings Calculation ───────────────────────────────────────────

    def test_pool_standings_tiebreaker_order(self):
        t1, t2, t3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        teams = [
            {"id": t1, "name": "Team Beta", "seed": 2},
            {"id": t2, "name": "Team Alpha", "seed": 1},
            {"id": t3, "name": "Team Gamma", "seed": 3},
        ]
        # t1 wins 11-5 against t3 (+6), t2 wins 11-9 against t3 (+2)
        # t1 and t2 both have 1 win, but t1 has better differential (+6 vs +2)
        matches = [
            {"team_a_id": t1, "team_b_id": t3, "score_a": 11, "score_b": 5, "winner_team_id": t1, "status": "completed"},
            {"team_a_id": t2, "team_b_id": t3, "score_a": 11, "score_b": 9, "winner_team_id": t2, "status": "completed"},
        ]
        rows = self.engine.calculate_pool_standings(teams, matches)
        assert rows[0].team_id == t1
        assert rows[0].rank == 1
        assert rows[1].team_id == t2
        assert rows[1].rank == 2
        assert rows[2].team_id == t3
        assert rows[2].rank == 3

    def test_pool_standings_name_fallback_deterministic(self):
        t1, t2 = uuid.uuid4(), uuid.uuid4()
        teams = [
            {"id": t1, "name": "Zeta", "seed": None},
            {"id": t2, "name": "Alpha", "seed": None},
        ]
        # No matches played yet
        rows = self.engine.calculate_pool_standings(teams, [])
        # Tiebreak 4 is alphabetical team name ascending
        assert rows[0].team_name == "Alpha"
        assert rows[1].team_name == "Zeta"

    def test_pool_standings_excludes_pending_matches(self):
        t1, t2 = uuid.uuid4(), uuid.uuid4()
        teams = [{"id": t1, "name": "T1", "seed": 1}, {"id": t2, "name": "T2", "seed": 2}]
        matches = [
            {"team_a_id": t1, "team_b_id": t2, "score_a": None, "score_b": None, "winner_team_id": None, "status": "pending"}
        ]
        rows = self.engine.calculate_pool_standings(teams, matches)
        assert rows[0].matches_played == 0
        assert rows[1].matches_played == 0

    # ─── Qualifier Determination & Seeding ───────────────────────────────────

    def test_determine_qualifiers_top_1_per_pool(self):
        p1, p2, p3, p4 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        t = [uuid.uuid4() for _ in range(8)]
        from app.services.competition.round_robin_engine import StandingRow
        standings = {
            p1: [StandingRow(team_id=t[0], team_name="T0", team_seed=1, rank=1), StandingRow(team_id=t[1], team_name="T1", team_seed=2, rank=2)],
            p2: [StandingRow(team_id=t[2], team_name="T2", team_seed=1, rank=1), StandingRow(team_id=t[3], team_name="T3", team_seed=2, rank=2)],
            p3: [StandingRow(team_id=t[4], team_name="T4", team_seed=1, rank=1), StandingRow(team_id=t[5], team_name="T5", team_seed=2, rank=2)],
            p4: [StandingRow(team_id=t[6], team_name="T6", team_seed=1, rank=1), StandingRow(team_id=t[7], team_name="T7", team_seed=2, rank=2)],
        }
        qualifiers = self.engine.determine_qualifiers(standings, qualifiers_per_pool=1)
        assert len(qualifiers) == 4
        assert [q["seed"] for q in qualifiers] == [1, 2, 3, 4]
        assert [q["team_id"] for q in qualifiers] == [t[0], t[2], t[4], t[6]]

    def test_determine_qualifiers_top_2_per_pool(self):
        p1, p2 = uuid.uuid4(), uuid.uuid4()
        t = [uuid.uuid4() for _ in range(4)]
        from app.services.competition.round_robin_engine import StandingRow
        standings = {
            p1: [StandingRow(team_id=t[0], team_name="T0", team_seed=1, rank=1), StandingRow(team_id=t[1], team_name="T1", team_seed=2, rank=2)],
            p2: [StandingRow(team_id=t[2], team_name="T2", team_seed=1, rank=1), StandingRow(team_id=t[3], team_name="T3", team_seed=2, rank=2)],
        }
        qualifiers = self.engine.determine_qualifiers(standings, qualifiers_per_pool=2)
        assert len(qualifiers) == 4
        assert [q["seed"] for q in qualifiers] == [1, 2, 3, 4]
        assert [q["team_id"] for q in qualifiers] == [t[0], t[2], t[1], t[3]]

    # ─── Standard Bracket Pairings & Generation ───────────────────────────────

    def test_standard_bracket_pairings_4_teams(self):
        pairings = self.engine.get_standard_bracket_pairings(4)
        assert pairings == [(1, 4), (2, 3)]

    def test_standard_bracket_pairings_8_teams(self):
        pairings = self.engine.get_standard_bracket_pairings(8)
        assert pairings == [(1, 8), (4, 5), (2, 7), (3, 6)]

    def test_standard_bracket_pairings_16_teams(self):
        pairings = self.engine.get_standard_bracket_pairings(16)
        assert len(pairings) == 8
        assert pairings[0] == (1, 16)
        assert pairings[1] == (8, 9)

    def test_championship_bracket_generation_power_of_2(self):
        t_id = uuid.uuid4()
        qualifiers = [{"seed": i, "team_id": uuid.uuid4()} for i in range(1, 5)]
        matches = self.engine.generate_championship_bracket(t_id, qualifiers, match_number_offset=10)
        # 4 teams -> 2 rounds: 2 semifinals + 1 final = 3 matches
        assert len(matches) == 3
        r1 = [m for m in matches if m["bracket_round"] == 1]
        r2 = [m for m in matches if m["bracket_round"] == 2]
        assert len(r1) == 2
        assert len(r2) == 1
        # Verify next match links
        assert r1[0]["next_match_id"] == r2[0]["id"]
        assert r1[0]["next_match_slot"] == "team_a"
        assert r1[1]["next_match_id"] == r2[0]["id"]
        assert r1[1]["next_match_slot"] == "team_b"

    def test_championship_bracket_non_power_of_2_byes(self):
        t_id = uuid.uuid4()
        # 3 qualifiers -> next power of 2 is 4. Top seed 1 gets BYE vs virtual 4
        qualifiers = [{"seed": i, "team_id": uuid.uuid4()} for i in range(1, 4)]
        matches = self.engine.generate_championship_bracket(t_id, qualifiers)
        assert len(matches) == 3
        # Match 1 is Seed 1 vs Seed 4 (BYE) -> completed automatically
        m1 = matches[0]
        assert m1["status"] == "completed"
        assert m1["winner_team_id"] == qualifiers[0]["team_id"]
        # Seed 1 advanced into Final immediately
        final = matches[2]
        assert final["team_a_id"] == qualifiers[0]["team_id"]

    def test_championship_bracket_requires_at_least_2_teams(self):
        with pytest.raises(ChampionshipError, match="at least 2"):
            self.engine.generate_championship_bracket(uuid.uuid4(), [{"seed": 1, "team_id": uuid.uuid4()}])

    def test_serpentine_distribution_uneven_3_pools(self):
        # 10 teams into 3 pools -> Pool 1: 3 teams, Pool 2: 3 teams, Pool 3: 4 teams
        pool_ids = [uuid.uuid4() for _ in range(3)]
        teams = [{"id": uuid.uuid4(), "name": f"Team {i}", "seed": i} for i in range(1, 11)]
        dist = self.engine.distribute_teams_serpentine(teams, pool_ids)
        assert len(dist[pool_ids[0]]) == 3
        assert len(dist[pool_ids[1]]) == 3
        assert len(dist[pool_ids[2]]) == 4
        # Round 1: 1 -> P0, 2 -> P1, 3 -> P2
        # Round 2: 4 -> P2, 5 -> P1, 6 -> P0
        # Round 3: 7 -> P0, 8 -> P1, 9 -> P2
        # Round 4: 10 -> P2
        assert [t["seed"] for t in dist[pool_ids[0]]] == [1, 6, 7]  # wait, let's check snake order!
        # Wait:
        # i=0 (team 1): forward -> pool 0
        # i=1 (team 2): forward -> pool 1
        # i=2 (team 3): forward -> pool 2
        # i=3 (team 4): reverse -> pool 2
        # i=4 (team 5): reverse -> pool 1
        # i=5 (team 6): reverse -> pool 0
        # i=6 (team 7): forward -> pool 0
        # i=7 (team 8): forward -> pool 1
        # i=8 (team 9): forward -> pool 2
        # i=9 (team 10): reverse -> pool 2
        p0_seeds = [t["seed"] for t in dist[pool_ids[0]]]
        p1_seeds = [t["seed"] for t in dist[pool_ids[1]]]
        p2_seeds = [t["seed"] for t in dist[pool_ids[2]]]
        assert p0_seeds == [1, 6, 7]
        assert p1_seeds == [2, 5, 8]
        assert p2_seeds == [3, 4, 9, 10]

    def test_championship_bracket_byes_auto_advance_into_round_2(self):
        t_id = uuid.uuid4()
        # 6 qualifiers -> 8-bracket. Seeds 1 & 2 get BYEs (Seeds 7 & 8 are BYEs)
        qualifiers = [{"seed": i, "team_id": uuid.uuid4()} for i in range(1, 7)]
        matches = self.engine.generate_championship_bracket(t_id, qualifiers)
        # Total matches in 8-bracket: 4 quarter + 2 semi + 1 final = 7
        assert len(matches) == 7
        # First round has 4 matches: (1v8 BYE), (4v5), (2v7 BYE), (3v6)
        r1 = [m for m in matches if m["bracket_round"] == 1]
        r2 = [m for m in matches if m["bracket_round"] == 2]
        # Match 1 (1v8) is BYE completed with winner seed 1
        assert r1[0]["status"] == "completed"
        assert r1[0]["winner_team_id"] == qualifiers[0]["team_id"]
        # Match 3 (2v7) is BYE completed with winner seed 2
        assert r1[2]["status"] == "completed"
        assert r1[2]["winner_team_id"] == qualifiers[1]["team_id"]
        # R2 Match 1 (Semifinal 1) team_a should be Seed 1
        assert r2[0]["team_a_id"] == qualifiers[0]["team_id"]
        # R2 Match 2 (Semifinal 2) team_a should be Seed 2
        assert r2[1]["team_a_id"] == qualifiers[1]["team_id"]



# ==============================================================================
# 2. Database & API Integration Tests
# ==============================================================================

@pytest_asyncio.fixture
async def pp_setup(db_session: AsyncSession, async_client):
    """
    Sets up a full club, staff members, 16 registered players,
    and a Pool Play tournament in registration_closed status.
    """
    club = Club(name="Pool Club", slug="pool-club", is_active=True)
    other_club = Club(name="Other Club", slug="other-club", is_active=True)
    db_session.add(club)
    db_session.add(other_club)
    await db_session.flush()

    # Staff users
    owner = User(email="pp_owner@test.local", hashed_password=hash_password("Pass1!"), full_name="Owner", is_active=True, is_verified=True)
    manager = User(email="pp_mgr@test.local", hashed_password=hash_password("Pass1!"), full_name="Manager", is_active=True, is_verified=True)
    td = User(email="pp_td@test.local", hashed_password=hash_password("Pass1!"), full_name="TD", is_active=True, is_verified=True)
    other_td = User(email="other_td@test.local", hashed_password=hash_password("Pass1!"), full_name="Other TD", is_active=True, is_verified=True)
    regular_player = User(email="pp_reg_player@test.local", hashed_password=hash_password("Pass1!"), full_name="Regular Player", is_active=True, is_verified=True)

    for u in [owner, manager, td, other_td, regular_player]:
        db_session.add(u)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=u.id, display_name=u.full_name))

    db_session.add(ClubMembership(user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER, is_active=True))
    db_session.add(ClubMembership(user_id=manager.id, club_id=club.id, role=ClubRole.CLUB_MANAGER, is_active=True))
    db_session.add(ClubMembership(user_id=td.id, club_id=club.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    db_session.add(ClubMembership(user_id=other_td.id, club_id=other_club.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    await db_session.flush()

    # 16 Players & Memberships
    players = []
    player_memberships = []
    for i in range(1, 17):
        p = User(email=f"pool_p{i}@test.local", hashed_password=hash_password("Pass1!"), full_name=f"Player {i}", is_active=True, is_verified=True)
        db_session.add(p)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=p.id, display_name=f"P{i}"))
        pm = ClubPlayerMembership(user_id=p.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE, membership_number=f"PPL-{i:03d}")
        db_session.add(pm)
        await db_session.flush()
        players.append(p)
        player_memberships.append(pm)

    # Tournament: pool_play, registration_closed
    now = datetime.now(timezone.utc)
    tournament = Tournament(
        club_id=club.id,
        created_by_user_id=td.id,
        name="Summer Pool Play Showcase",
        status=TournamentStatus.REGISTRATION_CLOSED,
        format=TournamentFormat.POOL_PLAY,
        visibility=TournamentVisibility.PUBLIC,
        registration_open_at=now - timedelta(days=10),
        registration_close_at=now - timedelta(days=1),
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=3),
        min_participants=8,
        max_participants=24,
    )
    db_session.add(tournament)
    await db_session.flush()

    # Confirmed Registrations for all 16 players
    for i, pm in enumerate(player_memberships, start=1):
        db_session.add(TournamentRegistration(tournament_id=tournament.id, player_membership_id=pm.id, status=RegistrationStatus.CONFIRMED, seed=i))
    await db_session.flush()

    # 8 Teams created (2 players each)
    teams = []
    for i in range(8):
        t = Team(tournament_id=tournament.id, name=f"Team {i + 1}", seed=i + 1)
        db_session.add(t)
        await db_session.flush()
        teams.append(t)
        db_session.add(TeamMember(team_id=t.id, player_membership_id=player_memberships[i * 2].id))
        db_session.add(TeamMember(team_id=t.id, player_membership_id=player_memberships[i * 2 + 1].id))
    await db_session.commit()

    return {
        "club": club,
        "other_club": other_club,
        "owner": owner,
        "manager": manager,
        "td": td,
        "other_td": other_td,
        "regular_player": regular_player,
        "tournament": tournament,
        "teams": teams,
        "client": async_client,
    }


class TestPoolConfigurationAPI:
    @pytest.mark.asyncio
    async def test_configure_pools_success_td(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        assert res.status_code == 200
        pools = res.json()
        assert len(pools) == 4
        assert [p["name"] for p in pools] == ["Pool A", "Pool B", "Pool C", "Pool D"]
        # Teams automatically distributed serpentine when teams exist
        for p in pools:
            assert p["teams_count"] == 2

    @pytest.mark.asyncio
    async def test_configure_pools_manager_success(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["manager"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

    @pytest.mark.asyncio
    async def test_configure_pools_owner_success(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["owner"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )
        assert res.status_code == 200

    @pytest.mark.asyncio
    async def test_configure_pools_unauthenticated_returns_401(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_configure_pools_player_forbidden_403(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["regular_player"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_configure_pools_invalid_pool_count_rejected(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 1, "qualifiers_per_pool": 1},
        )
        assert res.status_code == 422  # pydantic ge=2

    @pytest.mark.asyncio
    async def test_configure_pools_custom_names_success(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={
                "number_of_pools": 2,
                "qualifiers_per_pool": 2,
                "pool_names": ["Red Pool", "Blue Pool"],
            },
        )
        assert res.status_code == 200
        pools = res.json()
        assert [p["name"] for p in pools] == ["Red Pool", "Blue Pool"]

    @pytest.mark.asyncio
    async def test_configure_pools_mismatched_custom_names_count_rejected(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={
                "number_of_pools": 2,
                "qualifiers_per_pool": 2,
                "pool_names": ["Red Pool"],
            },
        )
        assert res.status_code == 400
        assert "Expected 2 pool names" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_pools_staff(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        # Configure first
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )

        res = await client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools",
            headers=headers,
        )
        assert res.status_code == 200
        assert len(res.json()) == 2

    @pytest.mark.asyncio
    async def test_list_pools_player_read_only(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        td_headers = make_auth_header(pp_setup["td"].id)
        player_headers = make_auth_header(pp_setup["regular_player"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=td_headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )

        res = await client.get(
            f"/api/v1/tournaments/{t_id}/pools",
            headers=player_headers,
        )
        assert res.status_code == 200
        assert len(res.json()) == 2


class TestPoolTeamAssignmentAPI:
    @pytest.mark.asyncio
    async def test_assign_teams_serpentine_success(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        # Configure 4 pools
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/assign-serpentine",
            headers=headers,
        )
        assert res.status_code == 200
        pools = res.json()
        assert len(pools) == 4
        # Seed 1 should be in Pool A, Seed 2 in Pool B, Seed 3 in Pool C, Seed 4 in Pool D
        # Seed 5 in Pool D, Seed 6 in Pool C, Seed 7 in Pool B, Seed 8 in Pool A
        pool_a_teams = pools[0]["pool_teams"]
        assert len(pool_a_teams) == 2
        assert pool_a_teams[0]["seed"] == 1
        assert pool_a_teams[1]["seed"] == 2

    @pytest.mark.asyncio
    async def test_assign_teams_manual_success(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)
        teams = pp_setup["teams"]

        # Configure 2 pools
        config_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )
        pools = config_res.json()
        p1_id = pools[0]["id"]
        p2_id = pools[1]["id"]

        # Assign 4 teams to pool 1, 4 teams to pool 2
        assignments = [
            {"team_id": str(teams[0].id), "pool_id": p1_id},
            {"team_id": str(teams[1].id), "pool_id": p1_id},
            {"team_id": str(teams[2].id), "pool_id": p1_id},
            {"team_id": str(teams[3].id), "pool_id": p1_id},
            {"team_id": str(teams[4].id), "pool_id": p2_id},
            {"team_id": str(teams[5].id), "pool_id": p2_id},
            {"team_id": str(teams[6].id), "pool_id": p2_id},
            {"team_id": str(teams[7].id), "pool_id": p2_id},
        ]
        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/assign-manual",
            headers=headers,
            json={"assignments": assignments},
        )
        assert res.status_code == 200
        pools_res = res.json()
        assert pools_res[0]["teams_count"] == 4
        assert pools_res[1]["teams_count"] == 4

    @pytest.mark.asyncio
    async def test_assign_teams_manual_unbalanced_rejected(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)
        teams = pp_setup["teams"]

        config_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )
        pools = config_res.json()
        p1_id = pools[0]["id"]
        p2_id = pools[1]["id"]

        # 6 teams in pool 1, 2 teams in pool 2 -> diff = 4 > 1 -> rejected
        assignments = [
            {"team_id": str(teams[i].id), "pool_id": p1_id} for i in range(6)
        ] + [
            {"team_id": str(teams[i].id), "pool_id": p2_id} for i in range(6, 8)
        ]
        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/assign-manual",
            headers=headers,
            json={"assignments": assignments},
        )
        assert res.status_code == 400
        assert "unbalanced" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_assign_teams_manual_duplicate_team_rejected(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)
        teams = pp_setup["teams"]

        config_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )
        pools = config_res.json()
        p1_id = pools[0]["id"]

        assignments = [
            {"team_id": str(teams[0].id), "pool_id": p1_id},
            {"team_id": str(teams[0].id), "pool_id": p1_id},
        ]
        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/assign-manual",
            headers=headers,
            json={"assignments": assignments},
        )
        assert res.status_code == 400
        assert "multiple pools" in res.json()["detail"]


class TestPoolPlayGenerationAPI:
    @pytest.mark.asyncio
    async def test_generate_pool_play_success(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        # Configure 4 pools of 2 teams
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )
        assert res.status_code == 201
        data = res.json()
        assert data["pools_count"] == 4
        assert data["teams_count"] == 8
        assert data["matches_generated"] == 4

    @pytest.mark.asyncio
    async def test_generate_pool_play_transitions_to_in_progress(self, pp_setup, db_session):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        t_db = await db_session.get(Tournament, t_id)
        assert t_db.status == TournamentStatus.IN_PROGRESS

    @pytest.mark.asyncio
    async def test_generate_pool_play_already_generated_blocked(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        res2 = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )
        assert res2.status_code == 400
        assert "Matches already generated" in res2.json()["detail"]

    @pytest.mark.asyncio
    async def test_regenerate_pool_play_success_no_results(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        regen_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/regenerate-pool-play",
            headers=headers,
        )
        assert regen_res.status_code == 200
        assert regen_res.json()["matches_generated"] == 4

    @pytest.mark.asyncio
    async def test_regenerate_pool_play_blocked_with_results(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        matches_res = await client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches",
            headers=headers,
        )
        first_match = matches_res.json()[0]

        # Record result
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{first_match['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 5},
        )

        # Now regeneration must be blocked
        regen_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/regenerate-pool-play",
            headers=headers,
        )
        assert regen_res.status_code == 400
        assert "Cannot regenerate" in regen_res.json()["detail"]

    @pytest.mark.asyncio
    async def test_list_pool_matches_filtered_by_pool(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        cfg = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        pools = cfg.json()
        target_pool = pools[0]

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        res = await client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches?pool_id={target_pool['id']}",
            headers=headers,
        )
        assert res.status_code == 200
        matches = res.json()
        assert len(matches) == 1
        assert matches[0]["pool_id"] == target_pool["id"]


class TestPoolStandingsAPI:
    @pytest.mark.asyncio
    async def test_pool_standings_empty_and_after_result(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        # Before results
        res = await client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["pools"]) == 4

        # Record match 1 result (11-7)
        matches = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches", headers=headers)).json()
        m1 = matches[0]
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m1['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )

        res_after = await client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
            headers=headers,
        )
        pool_1 = res_after.json()["pools"][0]
        winner = pool_1["standings"][0]
        loser = pool_1["standings"][1]
        assert winner["wins"] == 1
        assert winner["losses"] == 0
        assert winner["points_differential"] == 4
        assert winner["qualified"] is True
        assert loser["wins"] == 0
        assert loser["losses"] == 1
        assert loser["points_differential"] == -4
        assert loser["qualified"] is False

    @pytest.mark.asyncio
    async def test_player_get_pool_standings(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        td_headers = make_auth_header(pp_setup["td"].id)
        player_headers = make_auth_header(pp_setup["regular_player"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=td_headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=td_headers,
        )

        res = await client.get(
            f"/api/v1/tournaments/{t_id}/pools/standings",
            headers=player_headers,
        )
        assert res.status_code == 200
        assert len(res.json()["pools"]) == 4

    @pytest.mark.asyncio
    async def test_player_list_pool_matches(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        td_headers = make_auth_header(pp_setup["td"].id)
        player_headers = make_auth_header(pp_setup["regular_player"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=td_headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=td_headers,
        )

        res = await client.get(
            f"/api/v1/tournaments/{t_id}/pools/matches",
            headers=player_headers,
        )
        assert res.status_code == 200
        matches = res.json()
        assert len(matches) == 4


class TestChampionshipBracketAPI:
    @pytest_asyncio.fixture
    async def pool_play_completed_setup(self, pp_setup):
        """Sets up 4 pools of 2 teams with all 4 pool matches completed."""
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        # 1. Configure 4 pools, top 1 qualifies -> 4 qualifiers for championship
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )

        # 2. Generate pool play
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        # 3. Complete all 4 pool matches
        matches = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches", headers=headers)).json()
        scores = [(11, 7), (11, 8), (11, 6), (11, 9)]
        for m, (sa, sb) in zip(matches, scores):
            await client.post(
                f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m['id']}/result",
                headers=headers,
                json={"score_a": sa, "score_b": sb},
            )

        return pp_setup

    @pytest.mark.asyncio
    async def test_generate_championship_blocked_before_pool_matches_complete(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        headers = make_auth_header(pp_setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=headers,
        )

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=headers,
        )
        assert res.status_code == 400
        assert "All pool stage matches must be completed" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_championship_success_after_pool_stage(self, pool_play_completed_setup):
        setup = pool_play_completed_setup
        client = setup["client"]
        club_id = setup["club"].id
        t_id = setup["tournament"].id
        headers = make_auth_header(setup["td"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=headers,
        )
        assert res.status_code == 201
        data = res.json()
        assert data["qualifiers_count"] == 4
        assert data["rounds_count"] == 2  # Semifinals (R1) and Final (R2)
        assert data["matches_generated"] == 3

    @pytest.mark.asyncio
    async def test_championship_auto_advance_winner_to_final(self, pool_play_completed_setup):
        setup = pool_play_completed_setup
        client = setup["client"]
        club_id = setup["club"].id
        t_id = setup["tournament"].id
        headers = make_auth_header(setup["td"].id)

        # Generate championship bracket
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=headers,
        )

        champ_matches = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/championship/matches", headers=headers)).json()
        assert len(champ_matches) == 3
        semi_1 = [m for m in champ_matches if m["bracket_round"] == 1 and m["bracket_position"] == 1][0]
        semi_2 = [m for m in champ_matches if m["bracket_round"] == 1 and m["bracket_position"] == 2][0]
        final = [m for m in champ_matches if m["bracket_round"] == 2][0]

        # Final initially has no teams populated
        assert final["team_a_id"] is None
        assert final["team_b_id"] is None

        # Play Semifinal 1 -> team A wins (11-7)
        res_semi1 = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{semi_1['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )
        winner_semi1 = res_semi1.json()["winner_team_id"]

        # Check Final: team_a_id should now equal winner_semi1
        refreshed_final = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{final['id']}", headers=headers)).json()
        assert refreshed_final["team_a_id"] == winner_semi1
        assert refreshed_final["team_b_id"] is None

        # Play Semifinal 2 -> team B wins (9-11)
        res_semi2 = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{semi_2['id']}/result",
            headers=headers,
            json={"score_a": 9, "score_b": 11},
        )
        winner_semi2 = res_semi2.json()["winner_team_id"]

        # Check Final: team_b_id should now equal winner_semi2
        refreshed_final2 = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{final['id']}", headers=headers)).json()
        assert refreshed_final2["team_a_id"] == winner_semi1
        assert refreshed_final2["team_b_id"] == winner_semi2

    @pytest.mark.asyncio
    async def test_championship_final_completion_completes_tournament(self, pool_play_completed_setup, db_session):
        setup = pool_play_completed_setup
        client = setup["client"]
        club_id = setup["club"].id
        t_id = setup["tournament"].id
        headers = make_auth_header(setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=headers,
        )
        champ_matches = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/championship/matches", headers=headers)).json()
        semi_1 = [m for m in champ_matches if m["bracket_round"] == 1 and m["bracket_position"] == 1][0]
        semi_2 = [m for m in champ_matches if m["bracket_round"] == 1 and m["bracket_position"] == 2][0]
        final = [m for m in champ_matches if m["bracket_round"] == 2][0]

        # Record semi 1 & semi 2
        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{semi_1['id']}/result", headers=headers, json={"score_a": 11, "score_b": 5})
        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{semi_2['id']}/result", headers=headers, json={"score_a": 11, "score_b": 8})

        # Record Final score
        res_final = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{final['id']}/result",
            headers=headers,
            json={"score_a": 15, "score_b": 13},
        )
        assert res_final.status_code == 200
        assert res_final.json()["status"] == "completed"

        # Verify tournament status transitioned to completed
        t_db = await db_session.get(Tournament, t_id)
        assert t_db.status == TournamentStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_championship_score_correction_blocked_if_subsequent_match_completed(self, pool_play_completed_setup):
        setup = pool_play_completed_setup
        client = setup["client"]
        club_id = setup["club"].id
        t_id = setup["tournament"].id
        headers = make_auth_header(setup["td"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=headers,
        )
        champ_matches = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/championship/matches", headers=headers)).json()
        semi_1 = [m for m in champ_matches if m["bracket_round"] == 1 and m["bracket_position"] == 1][0]
        semi_2 = [m for m in champ_matches if m["bracket_round"] == 1 and m["bracket_position"] == 2][0]
        final = [m for m in champ_matches if m["bracket_round"] == 2][0]

        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{semi_1['id']}/result", headers=headers, json={"score_a": 11, "score_b": 5})
        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{semi_2['id']}/result", headers=headers, json={"score_a": 11, "score_b": 8})
        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{final['id']}/result", headers=headers, json={"score_a": 11, "score_b": 9})

        # Trying to correct semi_1 now that Final is already played must be blocked
        corr_res = await client.patch(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{semi_1['id']}/result",
            headers=headers,
            json={"score_a": 8, "score_b": 11},
        )
        assert corr_res.status_code == 400
        assert "subsequent championship match has already been completed" in corr_res.json()["detail"]

    @pytest.mark.asyncio
    async def test_player_list_championship_matches(self, pool_play_completed_setup):
        setup = pool_play_completed_setup
        client = setup["client"]
        club_id = setup["club"].id
        t_id = setup["tournament"].id
        td_headers = make_auth_header(setup["td"].id)
        player_headers = make_auth_header(setup["regular_player"].id)

        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=td_headers,
        )

        res = await client.get(
            f"/api/v1/tournaments/{t_id}/championship/matches",
            headers=player_headers,
        )
        assert res.status_code == 200
        assert len(res.json()) == 3

    @pytest.mark.asyncio
    async def test_generate_championship_twice_blocked(self, pool_play_completed_setup):
        setup = pool_play_completed_setup
        client = setup["client"]
        club_id = setup["club"].id
        t_id = setup["tournament"].id
        td_headers = make_auth_header(setup["td"].id)

        res1 = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=td_headers,
        )
        assert res1.status_code == 201

        res2 = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=td_headers,
        )
        assert res2.status_code == 400
        assert "already been generated" in res2.json()["detail"]

    @pytest.mark.asyncio
    async def test_manager_can_generate_championship(self, pool_play_completed_setup):
        setup = pool_play_completed_setup
        client = setup["client"]
        club_id = setup["club"].id
        t_id = setup["tournament"].id
        mgr_headers = make_auth_header(setup["manager"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
            headers=mgr_headers,
        )
        assert res.status_code == 201
        assert res.json()["matches_generated"] == 3


class TestPoolPlayPermissionsAndIsolation:
    @pytest.mark.asyncio
    async def test_cross_club_isolation_on_pool_configure(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        other_td_headers = make_auth_header(pp_setup["other_td"].id)

        # Other club TD cannot configure pools in club
        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=other_td_headers,
            json={"number_of_pools": 4, "qualifiers_per_pool": 1},
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_cross_club_isolation_on_generate_pool_play(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        other_td_headers = make_auth_header(pp_setup["other_td"].id)

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
            headers=other_td_headers,
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_player_cannot_record_match_result(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        td_headers = make_auth_header(pp_setup["td"].id)
        player_headers = make_auth_header(pp_setup["regular_player"].id)

        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure", headers=td_headers, json={"number_of_pools": 4, "qualifiers_per_pool": 1})
        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play", headers=td_headers)

        matches = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches", headers=td_headers)).json()
        m1 = matches[0]

        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m1['id']}/result",
            headers=player_headers,
            json={"score_a": 11, "score_b": 5},
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_reconfigure_blocked_after_match_results(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        td_headers = make_auth_header(pp_setup["td"].id)

        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure", headers=td_headers, json={"number_of_pools": 4, "qualifiers_per_pool": 1})
        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play", headers=td_headers)

        matches = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches", headers=td_headers)).json()
        m1 = matches[0]

        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m1['id']}/result", headers=td_headers, json={"score_a": 11, "score_b": 7})

        reconfig_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
            headers=td_headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 2},
        )
        assert reconfig_res.status_code == 400
        assert "Cannot configure pools" in reconfig_res.json()["detail"]

    @pytest.mark.asyncio
    async def test_owner_can_generate_pool_play(self, pp_setup):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t_id = pp_setup["tournament"].id
        owner_headers = make_auth_header(pp_setup["owner"].id)

        await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure", headers=owner_headers, json={"number_of_pools": 4, "qualifiers_per_pool": 1})
        res = await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play", headers=owner_headers)
        assert res.status_code == 201
        assert res.json()["matches_generated"] == 4

    @pytest.mark.asyncio
    async def test_pool_play_generation_blocked_if_status_is_draft(self, pp_setup, db_session):
        client = pp_setup["client"]
        club_id = pp_setup["club"].id
        t = pp_setup["tournament"]
        t_db = await db_session.get(Tournament, t.id)
        t_db.status = TournamentStatus.DRAFT
        await db_session.commit()

        td_headers = make_auth_header(pp_setup["td"].id)
        res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t.id}/generate-pool-play",
            headers=td_headers,
        )
        assert res.status_code == 400
        assert "registration_closed" in res.json()["detail"]

