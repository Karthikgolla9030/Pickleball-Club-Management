"""
Aught2 Pickleball — Phase 7: Scramble Competition Engine Tests

Comprehensive automated test suite covering:
  1. Pure Computation Unit Tests (no DB):
     - Participant count validation (minimum 4, multiple of 4, rounds >= 1)
     - Matches per player matches rounds validation
     - Deterministic sorting of players (seed -> registration -> UUID)
     - Matchup generation: 4 players, 8 players, 16 players
     - Zero partner repeats across rounds
     - Opponent repeat minimization
     - Strict determinism (identical input produces identical schedule)
     - Individual standings calculation
     - Standings tiebreaker rules (Wins -> Differential -> Points -> Name -> ID)
     - Pending/unplayed matches excluded from standings
  2. Integration & API Tests (with DB):
     - Staff authorization & permissions (Owner, Manager, Director allowed; Player forbidden)
     - Unauthenticated access rejected
     - Format guards (round_robin, pool_play, bracket rejected)
     - Lifecycle status guards (draft, completed, cancelled rejected)
     - Insufficient player count & non-multiple of 4 rejected
     - Excludes waitlisted and cancelled registrations
     - Generates matches and MatchParticipant records
     - Transitions tournament status to in_progress
     - Idempotency guard (duplicate generate rejected)
     - Regeneration before scores recorded (cleans old matches & participants)
     - Regeneration blocked after completed scores
     - Staff match listing and single match detail
     - Player read-only endpoints (matches and standings)
     - Score recording and server-derived winner validation
     - Score correction with completed status guard
     - Auto-complete tournament when all scramble matches are completed
     - Tenant isolation across clubs
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
from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.competition import Match, MatchParticipant, MatchStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import (
    RegistrationStatus,
    TournamentRegistration,
)
from app.models.user import User
from app.services.competition.scramble_engine import (
    ScrambleConfigurationError,
    ScrambleEngine,
    ScrambleStanding,
)
from tests.conftest import make_auth_header


# ==============================================================================
# 1. Pure Computation Unit Tests (No Database)
# ==============================================================================

class TestScrambleEngineUnit:
    @pytest.fixture(autouse=True)
    def setup_engine(self):
        self.engine = ScrambleEngine()

    def test_validate_config_valid_4_players(self):
        self.engine.validate_scramble_configuration(4, 3)

    def test_validate_config_valid_8_players(self):
        self.engine.validate_scramble_configuration(8, 3)

    def test_validate_config_valid_12_players(self):
        self.engine.validate_scramble_configuration(12, 4)

    def test_validate_config_valid_16_players(self):
        self.engine.validate_scramble_configuration(16, 5)

    def test_validate_config_fewer_than_4_players_raises(self):
        with pytest.raises(ScrambleConfigurationError, match="at least 4 confirmed players"):
            self.engine.validate_scramble_configuration(3, 3)

    def test_validate_config_0_players_raises(self):
        with pytest.raises(ScrambleConfigurationError, match="at least 4 confirmed players"):
            self.engine.validate_scramble_configuration(0, 3)

    def test_validate_config_5_players_raises_not_divisible_by_4(self):
        with pytest.raises(ScrambleConfigurationError, match="multiple of 4"):
            self.engine.validate_scramble_configuration(5, 3)

    def test_validate_config_6_players_raises_not_divisible_by_4(self):
        with pytest.raises(ScrambleConfigurationError, match="multiple of 4"):
            self.engine.validate_scramble_configuration(6, 3)

    def test_validate_config_7_players_raises_not_divisible_by_4(self):
        with pytest.raises(ScrambleConfigurationError, match="multiple of 4"):
            self.engine.validate_scramble_configuration(7, 3)

    def test_validate_config_9_players_raises_not_divisible_by_4(self):
        with pytest.raises(ScrambleConfigurationError, match="multiple of 4"):
            self.engine.validate_scramble_configuration(9, 3)

    def test_validate_config_0_rounds_raises(self):
        with pytest.raises(ScrambleConfigurationError, match="at least 1"):
            self.engine.validate_scramble_configuration(8, 0)

    def test_validate_config_mismatched_matches_per_player_raises(self):
        with pytest.raises(ScrambleConfigurationError, match="must equal the number of rounds"):
            self.engine.validate_scramble_configuration(8, 3, matches_per_player=2)

    def test_validate_config_matching_matches_per_player_passes(self):
        self.engine.validate_scramble_configuration(8, 3, matches_per_player=3)

    def test_sort_players_deterministically_by_seed(self):
        players = [
            {"id": "p3", "seed": 3, "registered_at": "2026-01-01"},
            {"id": "p1", "seed": 1, "registered_at": "2026-01-02"},
            {"id": "p2", "seed": 2, "registered_at": "2026-01-03"},
        ]
        sorted_p = self.engine.sort_players_deterministically(players)
        assert [p["id"] for p in sorted_p] == ["p1", "p2", "p3"]

    def test_sort_players_deterministically_unseeded_last(self):
        players = [
            {"id": "p_none", "seed": None, "registered_at": "2026-01-01"},
            {"id": "p1", "seed": 1, "registered_at": "2026-01-02"},
            {"id": "p_zero", "seed": 0, "registered_at": "2026-01-03"},
        ]
        sorted_p = self.engine.sort_players_deterministically(players)
        assert sorted_p[0]["id"] == "p1"

    def test_sort_players_deterministically_registration_time_fallback(self):
        players = [
            {"id": "late", "seed": 1, "registered_at": "2026-01-05"},
            {"id": "early", "seed": 1, "registered_at": "2026-01-01"},
        ]
        sorted_p = self.engine.sort_players_deterministically(players)
        assert [p["id"] for p in sorted_p] == ["early", "late"]

    def test_generate_matchups_4_players_1_round(self):
        players = [{"id": f"p{i}", "seed": i, "name": f"P{i}"} for i in range(1, 5)]
        matchups = self.engine.generate_matchups(players, num_rounds=1)
        assert len(matchups) == 1
        m = matchups[0]
        assert m["round_number"] == 1
        assert m["match_number"] == 1
        assert len(m["side_a"]) == 2
        assert len(m["side_b"]) == 2
        all_ids = {p["id"] for p in m["side_a"]} | {p["id"] for p in m["side_b"]}
        assert all_ids == {"p1", "p2", "p3", "p4"}

    def test_generate_matchups_4_players_3_rounds_rotates_partners(self):
        players = [{"id": f"p{i}", "seed": i, "name": f"P{i}"} for i in range(1, 5)]
        matchups = self.engine.generate_matchups(players, num_rounds=3)
        assert len(matchups) == 3

        # For 4 players, there are exactly 3 unique pairings for p1: (p1, p2), (p1, p3), (p1, p4)
        p1_partners = []
        for m in matchups:
            side_a_ids = [p["id"] for p in m["side_a"]]
            side_b_ids = [p["id"] for p in m["side_b"]]
            if "p1" in side_a_ids:
                partner = [x for x in side_a_ids if x != "p1"][0]
            else:
                partner = [x for x in side_b_ids if x != "p1"][0]
            p1_partners.append(partner)

        assert len(set(p1_partners)) == 3, f"Expected 3 distinct partners for p1, got {p1_partners}"

    def test_generate_matchups_8_players_3_rounds_match_count(self):
        players = [{"id": f"p{i}", "seed": i, "name": f"P{i}"} for i in range(1, 9)]
        matchups = self.engine.generate_matchups(players, num_rounds=3)
        # 8 players = 2 matches per round * 3 rounds = 6 matches total
        assert len(matchups) == 6
        assert [m["round_number"] for m in matchups] == [1, 1, 2, 2, 3, 3]
        assert [m["match_number"] for m in matchups] == [1, 2, 3, 4, 5, 6]

    def test_generate_matchups_8_players_every_player_plays_once_per_round(self):
        players = [{"id": f"p{i}", "seed": i, "name": f"P{i}"} for i in range(1, 9)]
        matchups = self.engine.generate_matchups(players, num_rounds=3)
        for r in range(1, 4):
            r_matches = [m for m in matchups if m["round_number"] == r]
            r_players = []
            for m in r_matches:
                r_players.extend([p["id"] for p in m["side_a"]])
                r_players.extend([p["id"] for p in m["side_b"]])
            assert len(r_players) == 8
            assert len(set(r_players)) == 8

    def test_generate_matchups_8_players_zero_partner_repeats_in_3_rounds(self):
        players = [{"id": f"p{i}", "seed": i, "name": f"P{i}"} for i in range(1, 9)]
        matchups = self.engine.generate_matchups(players, num_rounds=3)
        partnerships: list[tuple[str, str]] = []
        for m in matchups:
            a1, a2 = sorted([m["side_a"][0]["id"], m["side_a"][1]["id"]])
            b1, b2 = sorted([m["side_b"][0]["id"], m["side_b"][1]["id"]])
            partnerships.append((a1, a2))
            partnerships.append((b1, b2))
        # 6 matches * 2 pairs = 12 pairs
        assert len(partnerships) == 12
        assert len(set(partnerships)) == 12, "Expected 0 partner repeats across 3 rounds for 8 players"

    def test_generate_matchups_16_players_5_rounds_zero_partner_repeats(self):
        players = [{"id": f"p{i}", "seed": i, "name": f"P{i}"} for i in range(1, 17)]
        matchups = self.engine.generate_matchups(players, num_rounds=5)
        # 16 players = 4 matches per round * 5 rounds = 20 matches total
        assert len(matchups) == 20
        partnerships: list[tuple[str, str]] = []
        for m in matchups:
            a1, a2 = sorted([m["side_a"][0]["id"], m["side_a"][1]["id"]])
            b1, b2 = sorted([m["side_b"][0]["id"], m["side_b"][1]["id"]])
            partnerships.append((a1, a2))
            partnerships.append((b1, b2))
        assert len(partnerships) == 40
        assert len(set(partnerships)) == 40, "Expected 0 partner repeats across 5 rounds for 16 players"

    def test_generate_matchups_strictly_deterministic(self):
        players = [{"id": f"p{i}", "seed": i, "name": f"P{i}"} for i in range(1, 9)]
        m1 = self.engine.generate_matchups(players, num_rounds=3)
        m2 = self.engine.generate_matchups(players, num_rounds=3)
        for a, b in zip(m1, m2):
            assert a["match_number"] == b["match_number"]
            assert [p["id"] for p in a["side_a"]] == [p["id"] for p in b["side_a"]]
            assert [p["id"] for p in a["side_b"]] == [p["id"] for p in b["side_b"]]

    def test_calculate_standings_empty_matches(self):
        players = [
            {"id": uuid.uuid4(), "user_id": uuid.uuid4(), "display_name": "Alice"},
            {"id": uuid.uuid4(), "user_id": uuid.uuid4(), "display_name": "Bob"},
        ]
        standings = self.engine.calculate_scramble_standings(players, [])
        assert len(standings) == 2
        for s in standings:
            assert s.wins == 0
            assert s.losses == 0
            assert s.matches_played == 0
            assert s.points_differential == 0

    def test_calculate_standings_single_match(self):
        p1 = {"id": uuid.uuid4(), "user_id": uuid.uuid4(), "display_name": "P1"}
        p2 = {"id": uuid.uuid4(), "user_id": uuid.uuid4(), "display_name": "P2"}
        p3 = {"id": uuid.uuid4(), "user_id": uuid.uuid4(), "display_name": "P3"}
        p4 = {"id": uuid.uuid4(), "user_id": uuid.uuid4(), "display_name": "P4"}
        players = [p1, p2, p3, p4]

        matches = [
            {
                "status": "completed",
                "score_a": 11,
                "score_b": 5,
                "side_a": [p1, p2],
                "side_b": [p3, p4],
            }
        ]
        standings = self.engine.calculate_scramble_standings(players, matches)
        by_id = {s.player_membership_id: s for s in standings}

        assert by_id[p1["id"]].wins == 1
        assert by_id[p1["id"]].losses == 0
        assert by_id[p1["id"]].points_scored == 11
        assert by_id[p1["id"]].points_allowed == 5
        assert by_id[p1["id"]].points_differential == 6

        assert by_id[p3["id"]].wins == 0
        assert by_id[p3["id"]].losses == 1
        assert by_id[p3["id"]].points_scored == 5
        assert by_id[p3["id"]].points_allowed == 11
        assert by_id[p3["id"]].points_differential == -6

    def test_calculate_standings_tiebreaker_priority_wins(self):
        p1 = {"id": uuid.uuid4(), "display_name": "P1"}
        p2 = {"id": uuid.uuid4(), "display_name": "P2"}
        p3 = {"id": uuid.uuid4(), "display_name": "P3"}
        p4 = {"id": uuid.uuid4(), "display_name": "P4"}
        players = [p1, p2, p3, p4]

        # Match 1: P1 & P2 beat P3 & P4 (11-9) -> diff +2
        # Match 2: P1 & P3 beat P2 & P4 (11-0) -> P1 has 2 wins; P2 has 1 win (+2 -11 = -9); P3 has 1 win (-2 +11 = +9)
        matches = [
            {"status": "completed", "score_a": 11, "score_b": 9, "side_a": [p1, p2], "side_b": [p3, p4]},
            {"status": "completed", "score_a": 11, "score_b": 0, "side_a": [p1, p3], "side_b": [p2, p4]},
        ]
        standings = self.engine.calculate_scramble_standings(players, matches)
        assert standings[0].player_membership_id == p1["id"]
        assert standings[0].wins == 2
        # Between P3 and P2: both have 1 win, but P3 has diff +9 vs P2 diff -9
        assert standings[1].player_membership_id == p3["id"]
        assert standings[2].player_membership_id == p2["id"]
        assert standings[3].player_membership_id == p4["id"]

    def test_calculate_standings_tiebreaker_differential_over_points(self):
        p1 = {"id": uuid.uuid4(), "display_name": "P1"}
        p2 = {"id": uuid.uuid4(), "display_name": "P2"}
        players = [p1, p2]
        # P1: 1 win, scored 11, allowed 9 -> diff +2
        # P2: 1 win, scored 15, allowed 14 -> diff +1
        matches = [
            {"status": "completed", "score_a": 11, "score_b": 9, "side_a": [p1], "side_b": []},
            {"status": "completed", "score_a": 15, "score_b": 14, "side_a": [p2], "side_b": []},
        ]
        standings = self.engine.calculate_scramble_standings(players, matches)
        assert standings[0].player_membership_id == p1["id"]
        assert standings[1].player_membership_id == p2["id"]

    def test_calculate_standings_tiebreaker_points_scored(self):
        p1 = {"id": uuid.uuid4(), "display_name": "P1"}
        p2 = {"id": uuid.uuid4(), "display_name": "P2"}
        players = [p1, p2]
        # P1: 1 win, scored 13, allowed 11 -> diff +2
        # P2: 1 win, scored 11, allowed 9 -> diff +2
        matches = [
            {"status": "completed", "score_a": 13, "score_b": 11, "side_a": [p1], "side_b": []},
            {"status": "completed", "score_a": 11, "score_b": 9, "side_a": [p2], "side_b": []},
        ]
        standings = self.engine.calculate_scramble_standings(players, matches)
        assert standings[0].player_membership_id == p1["id"]
        assert standings[1].player_membership_id == p2["id"]

    def test_calculate_standings_tiebreaker_case_insensitive_name(self):
        p_b = {"id": uuid.uuid4(), "display_name": "bob"}
        p_a = {"id": uuid.uuid4(), "display_name": "Alice"}
        players = [p_b, p_a]
        # Equal stats -> Alice precedes bob
        standings = self.engine.calculate_scramble_standings(players, [])
        assert standings[0].display_name == "Alice"
        assert standings[1].display_name == "bob"

    def test_calculate_standings_ignores_pending_and_cancelled(self):
        p1 = {"id": uuid.uuid4(), "display_name": "P1"}
        p2 = {"id": uuid.uuid4(), "display_name": "P2"}
        players = [p1, p2]
        matches = [
            {"status": "pending", "score_a": 11, "score_b": 0, "side_a": [p1], "side_b": [p2]},
            {"status": "cancelled", "score_a": 11, "score_b": 0, "side_a": [p1], "side_b": [p2]},
        ]
        standings = self.engine.calculate_scramble_standings(players, matches)
        assert standings[0].matches_played == 0
        assert standings[1].matches_played == 0


# ==============================================================================
# 2. Database & API Integration Tests
# ==============================================================================

@pytest_asyncio.fixture
async def scramble_setup(db_session: AsyncSession):
    """
    Creates:
      - Club
      - Club Owner, Club Manager, Tournament Director, Regular Player
      - 8 Active Club Player Memberships
      - Scramble Tournament (status: REGISTRATION_CLOSED, format: scramble)
      - 8 Confirmed Tournament Registrations (seeds 1 to 8)
    """
    club = Club(
        name="Scramble Club",
        slug="scramble-club",
        description="Testing scramble",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    # Staff
    owner = User(
        email="owner_scramble@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Owner Dave",
        is_active=True,
        is_verified=True,
    )
    manager = User(
        email="manager_scramble@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Manager Mary",
        is_active=True,
        is_verified=True,
    )
    director = User(
        email="director_scramble@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Director Dan",
        is_active=True,
        is_verified=True,
    )
    regular = User(
        email="regular_scramble@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Regular Player",
        is_active=True,
        is_verified=True,
    )
    for u in [owner, manager, director, regular]:
        db_session.add(u)
    await db_session.flush()

    for u in [owner, manager, director, regular]:
        db_session.add(PlayerProfile(user_id=u.id, display_name=u.full_name))
    await db_session.flush()

    db_session.add(ClubMembership(user_id=owner.id, club_id=club.id, role=ClubRole.CLUB_OWNER, is_active=True))
    db_session.add(ClubMembership(user_id=manager.id, club_id=club.id, role=ClubRole.CLUB_MANAGER, is_active=True))
    db_session.add(ClubMembership(user_id=director.id, club_id=club.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    await db_session.flush()

    # 8 Player Users and Memberships
    player_users = []
    player_memberships = []
    for i in range(1, 9):
        pu = User(
            email=f"scramble_player{i}@test.local",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Player {chr(64 + i)}",
            is_active=True,
            is_verified=True,
        )
        db_session.add(pu)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=pu.id, display_name=f"Player {chr(64 + i)}"))
        player_users.append(pu)

        pm = ClubPlayerMembership(
            user_id=pu.id,
            club_id=club.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"SC-{i:03d}",
        )
        db_session.add(pm)
        await db_session.flush()
        player_memberships.append(pm)

    # Scramble Tournament
    now = datetime.now(timezone.utc)
    tournament = Tournament(
        club_id=club.id,
        created_by_user_id=director.id,
        name="Weekend Scramble Open",
        description="Rotating partner doubles tournament",
        status=TournamentStatus.REGISTRATION_CLOSED,
        format=TournamentFormat.SCRAMBLE,
        visibility=TournamentVisibility.PUBLIC,
        registration_open_at=now - timedelta(days=7),
        registration_close_at=now - timedelta(days=1),
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=2),
        min_participants=4,
        max_participants=16,
    )
    db_session.add(tournament)
    await db_session.flush()

    # 8 Confirmed Registrations
    registrations = []
    for seed_num, pm in enumerate(player_memberships, start=1):
        reg = TournamentRegistration(
            tournament_id=tournament.id,
            player_membership_id=pm.id,
            status=RegistrationStatus.CONFIRMED,
            seed=seed_num,
            registered_at=now - timedelta(days=5 - seed_num),
        )
        db_session.add(reg)
        registrations.append(reg)
    await db_session.flush()
    await db_session.commit()

    return {
        "club": club,
        "owner": owner,
        "manager": manager,
        "director": director,
        "regular": regular,
        "player_users": player_users,
        "player_memberships": player_memberships,
        "tournament": tournament,
        "registrations": registrations,
    }


class TestScrambleGenerationAPI:
    @pytest.mark.asyncio
    async def test_generate_scramble_tournament_director_allowed(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 201
        body = res.json()
        assert body["tournament_id"] == str(t.id)
        assert body["participants_count"] == 8
        assert body["rounds_count"] == 3
        assert body["matches_generated"] == 6

    @pytest.mark.asyncio
    async def test_generate_scramble_club_owner_allowed(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["owner"])

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 201

    @pytest.mark.asyncio
    async def test_generate_scramble_club_manager_allowed(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["manager"])

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 201

    @pytest.mark.asyncio
    async def test_generate_scramble_regular_player_forbidden(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["regular"])

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 403

    @pytest.mark.asyncio
    async def test_generate_scramble_unauthenticated_forbidden(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            json={"rounds": 3},
        )
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_generate_scramble_format_guard(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        t.format = TournamentFormat.ROUND_ROBIN
        await db_session.commit()

        headers = make_auth_header(data["director"])
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400
        assert "only available for Scramble" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_scramble_status_guard_draft(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        t.status = TournamentStatus.DRAFT
        await db_session.commit()

        headers = make_auth_header(data["director"])
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400
        assert "registration_closed" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_scramble_status_guard_completed(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        t.status = TournamentStatus.COMPLETED
        await db_session.commit()

        headers = make_auth_header(data["director"])
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400
        assert "no further modifications allowed" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_scramble_insufficient_players(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        # Cancel 6 registrations so only 2 confirmed remain
        regs = data["registrations"]
        for r in regs[:6]:
            r.status = RegistrationStatus.CANCELLED
        await db_session.commit()

        headers = make_auth_header(data["director"])
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400
        assert "at least 4 confirmed players" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_scramble_non_multiple_of_4_players(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        # Cancel 2 registrations so 6 remain (not divisible by 4)
        regs = data["registrations"]
        regs[0].status = RegistrationStatus.CANCELLED
        regs[1].status = RegistrationStatus.CANCELLED
        await db_session.commit()

        headers = make_auth_header(data["director"])
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400
        assert "multiple of 4" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_scramble_ignores_waitlisted_and_cancelled(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        regs = data["registrations"]
        # 8 players total: mark 1 as waitlist, 1 as cancelled -> 6 confirmed -> should fail with 6 players
        regs[0].status = RegistrationStatus.WAITLISTED
        regs[1].status = RegistrationStatus.CANCELLED
        await db_session.commit()

        headers = make_auth_header(data["director"])
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400
        assert "Received 6 players" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_generate_scramble_duplicate_call_rejected(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        res1 = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res1.status_code == 201

        # Second call should be rejected
        res2 = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res2.status_code == 400
        assert "Use regenerate-scramble" in res2.json()["detail"]

    @pytest.mark.asyncio
    async def test_regenerate_scramble_success_before_results(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        # Generate 3 rounds
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )

        # Regenerate with 2 rounds
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/regenerate-scramble",
            headers=headers,
            json={"rounds": 2},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["rounds_count"] == 2
        assert body["matches_generated"] == 4

    @pytest.mark.asyncio
    async def test_regenerate_scramble_blocked_after_match_completed(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        # Generate
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )

        # Get matches
        m_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = m_res.json()[0]["id"]

        # Record a score
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )

        # Regenerate should now fail
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/regenerate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400
        assert "already been recorded" in res.json()["detail"]


class TestScrambleMatchAndScoreAPI:
    @pytest.mark.asyncio
    async def test_list_scramble_matches_staff_and_structure(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )

        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        assert res.status_code == 200
        matches = res.json()
        assert len(matches) == 6
        for m in matches:
            assert len(m["side_a_participants"]) == 2
            assert len(m["side_b_participants"]) == 2
            assert m["status"] == "pending"
            assert m["team_a_id"] is None
            assert m["team_b_id"] is None

    @pytest.mark.asyncio
    async def test_get_single_scramble_match(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = list_res.json()[0]["id"]

        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches/{match_id}",
            headers=headers,
        )
        assert res.status_code == 200
        m = res.json()
        assert m["id"] == match_id
        assert len(m["side_a_participants"]) == 2
        assert len(m["side_b_participants"]) == 2

    @pytest.mark.asyncio
    async def test_player_list_scramble_matches_public(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers_dir = make_auth_header(data["director"])
        headers_player = make_auth_header(data["regular"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers_dir,
            json={"rounds": 3},
        )

        res = await async_client.get(
            f"/api/v1/tournaments/{t.id}/scramble/matches",
            headers=headers_player,
        )
        assert res.status_code == 200
        assert len(res.json()) == 6

    @pytest.mark.asyncio
    async def test_record_scramble_match_result_success(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = list_res.json()[0]["id"]

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 8},
        )
        assert res.status_code == 200
        m = res.json()
        assert m["status"] == "completed"
        assert m["score_a"] == 11
        assert m["score_b"] == 8
        assert m["winner_side"] == "side_a"

    @pytest.mark.asyncio
    async def test_record_scramble_match_result_side_b_wins(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = list_res.json()[0]["id"]

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 9, "score_b": 11},
        )
        assert res.status_code == 200
        assert res.json()["winner_side"] == "side_b"

    @pytest.mark.asyncio
    async def test_record_scramble_score_invalid_scores(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = list_res.json()[0]["id"]

        # Tie score rejected
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 11},
        )
        assert res.status_code == 422

        # Not winning by 2 rejected
        res2 = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 10},
        )
        assert res2.status_code == 422

    @pytest.mark.asyncio
    async def test_record_score_already_completed_match_rejected(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = list_res.json()[0]["id"]

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 8},
        )

        # Second record call should fail
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 9},
        )
        assert res.status_code == 400
        assert "already recorded" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_correct_scramble_match_result(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = list_res.json()[0]["id"]

        # Record initial
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 8},
        )

        # Correct
        res = await async_client.patch(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 9, "score_b": 11},
        )
        assert res.status_code == 200
        m = res.json()
        assert m["score_a"] == 9
        assert m["score_b"] == 11
        assert m["winner_side"] == "side_b"

    @pytest.mark.asyncio
    async def test_correct_scramble_score_on_pending_match_rejected(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        match_id = list_res.json()[0]["id"]

        # Patch before record
        res = await async_client.patch(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 8},
        )
        assert res.status_code == 400
        assert "not completed" in res.json()["detail"]

    @pytest.mark.asyncio
    async def test_auto_complete_tournament_when_all_matches_finished(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        # Generate 1 round (2 matches)
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 1},
        )
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        matches = list_res.json()
        assert len(matches) == 2

        # Complete match 1
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{matches[0]['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )

        # Tournament should still be in_progress
        await db_session.refresh(t)
        assert t.status == TournamentStatus.IN_PROGRESS

        # Complete match 2
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{matches[1]['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 9},
        )

        # Tournament should now be COMPLETED
        await db_session.refresh(t)
        assert t.status == TournamentStatus.COMPLETED


class TestScrambleStandingsAPI:
    @pytest.mark.asyncio
    async def test_get_scramble_standings_staff(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["director"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers,
            json={"rounds": 3},
        )

        # Complete 1 match
        list_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        m1 = list_res.json()[0]
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{m1['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 5},
        )

        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/standings",
            headers=headers,
        )
        assert res.status_code == 200
        standings = res.json()["standings"]
        assert len(standings) == 8
        # Top 2 should have 1 win, +6 differential
        assert standings[0]["wins"] == 1
        assert standings[0]["points_differential"] == 6
        assert standings[1]["wins"] == 1
        assert standings[1]["points_differential"] == 6
        # Bottom 2 should have 0 wins, -6 differential
        assert standings[6]["wins"] == 0
        assert standings[6]["points_differential"] == -6
        assert standings[7]["wins"] == 0
        assert standings[7]["points_differential"] == -6

    @pytest.mark.asyncio
    async def test_get_scramble_standings_player_public(
        self, async_client: AsyncClient, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        t = data["tournament"]
        headers_dir = make_auth_header(data["director"])
        headers_player = make_auth_header(data["regular"])

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/generate-scramble",
            headers=headers_dir,
            json={"rounds": 3},
        )

        res = await async_client.get(
            f"/api/v1/tournaments/{t.id}/scramble/standings",
            headers=headers_player,
        )
        assert res.status_code == 200
        assert len(res.json()["standings"]) == 8

    @pytest.mark.asyncio
    async def test_tenant_isolation_other_club_cannot_access_scramble(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        t = data["tournament"]

        other_club = Club(name="Other Club", slug="other-club", is_active=True)
        db_session.add(other_club)
        await db_session.flush()

        other_director = User(
            email="other_dir@test.local",
            hashed_password=hash_password("Pass123!"),
            full_name="Other Dir",
            is_active=True,
            is_verified=True,
        )
        db_session.add(other_director)
        await db_session.flush()
        db_session.add(ClubMembership(user_id=other_director.id, club_id=other_club.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
        await db_session.commit()

        other_headers = make_auth_header(other_director)
        # Attempt to access tournament t under other_club
        res = await async_client.post(
            f"/api/v1/clubs/{other_club.id}/tournaments/{t.id}/generate-scramble",
            headers=other_headers,
            json={"rounds": 3},
        )
        assert res.status_code == 404


# ==============================================================================
# 5. Scramble Workspace & Partition Engine Tests
# ==============================================================================

class TestScrambleEnginePartitionAndRotations:
    @pytest.fixture(autouse=True)
    def setup_engine(self):
        self.engine = ScrambleEngine()

    def test_partition_players_valid_cases(self):
        # 4 -> 1 court of 4
        assert self.engine.partition_players_into_courts(4) == (1, 0)
        # 5 -> 1 court of 5
        assert self.engine.partition_players_into_courts(5) == (0, 1)
        # 8 -> 2 courts of 4
        assert self.engine.partition_players_into_courts(8) == (2, 0)
        # 9 -> 1 court of 4, 1 court of 5
        assert self.engine.partition_players_into_courts(9) == (1, 1)
        # 10 -> 2 courts of 5
        assert self.engine.partition_players_into_courts(10) == (0, 2)
        # 12 -> 3 courts of 4
        assert self.engine.partition_players_into_courts(12) == (3, 0)
        # 13 -> 2 courts of 4, 1 court of 5
        assert self.engine.partition_players_into_courts(13) == (2, 1)
        # 14 -> 1 court of 4, 2 courts of 5
        assert self.engine.partition_players_into_courts(14) == (1, 2)
        # 15 -> 3 courts of 5
        assert self.engine.partition_players_into_courts(15) == (0, 3)
        # 16 -> 4 courts of 4
        assert self.engine.partition_players_into_courts(16) == (4, 0)

    def test_partition_players_invalid_cases(self):
        assert self.engine.partition_players_into_courts(0) is None
        assert self.engine.partition_players_into_courts(1) is None
        assert self.engine.partition_players_into_courts(2) is None
        assert self.engine.partition_players_into_courts(3) is None
        assert self.engine.partition_players_into_courts(6) is None
        assert self.engine.partition_players_into_courts(7) is None
        assert self.engine.partition_players_into_courts(11) is None

    def test_generate_round_matchups_4_player_court(self):
        players = [
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": f"P{i}", "seed": i}
            for i in range(1, 5)
        ]
        res = self.engine.generate_round_matchups(players, round_number=1, start_match_number=1)
        assert res["c4_courts"] == 1
        assert res["c5_courts"] == 0
        assert len(res["matches"]) == 3
        # In a 4-player court, every match has 0 sit-outs
        for m in res["matches"]:
            assert m["sit_out_player"] is None
            assert len(m["side_a"]) == 2
            assert len(m["side_b"]) == 2

        # Every player plays exactly 3 games
        play_counts = {p["id"]: 0 for p in players}
        for m in res["matches"]:
            for p in m["side_a"] + m["side_b"]:
                play_counts[p["id"]] += 1
        for count in play_counts.values():
            assert count == 3

    def test_generate_round_matchups_5_player_court(self):
        players = [
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": f"P{i}", "seed": i}
            for i in range(1, 6)
        ]
        res = self.engine.generate_round_matchups(players, round_number=1, start_match_number=1)
        assert res["c4_courts"] == 0
        assert res["c5_courts"] == 1
        assert len(res["matches"]) == 5

        # Every player sits out exactly once and plays 4 games
        sit_out_counts = {p["id"]: 0 for p in players}
        play_counts = {p["id"]: 0 for p in players}
        for m in res["matches"]:
            assert m["sit_out_player"] is not None
            sit_out_counts[m["sit_out_player"]["id"]] += 1
            for p in m["side_a"] + m["side_b"]:
                play_counts[p["id"]] += 1

        for p in players:
            assert sit_out_counts[p["id"]] == 1
            assert play_counts[p["id"]] == 4

    def test_generate_round_matchups_mixed_scramble_4_player_court(self):
        players = [
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": "Male 1", "seed": 1, "gender": "Male"},
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": "Male 2", "seed": 2, "gender": "Male"},
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": "Female 1", "seed": 3, "gender": "Female"},
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": "Female 2", "seed": 4, "gender": "Female"},
        ]
        res = self.engine.generate_round_matchups(players, round_number=1, start_match_number=1, division="Mixed Scramble")
        assert res["c4_courts"] == 1
        assert len(res["matches"]) == 2

        # In Mixed Scramble, ALL matches must be strictly 100% mixed doubles (1 male and 1 female per team)
        # Every male partners every female on the court once, and no male ever partners with a male
        assert len(res["matches"]) == 2
        for m in res["matches"]:
            a1, a2 = m["side_a"]
            b1, b2 = m["side_b"]
            a_genders = {a1["gender"], a2["gender"]}
            b_genders = {b1["gender"], b2["gender"]}
            assert a_genders == {"Male", "Female"}, f"Side A must be mixed: {a_genders}"
            assert b_genders == {"Male", "Female"}, f"Side B must be mixed: {b_genders}"

    def test_generate_round_matchups_mixed_scramble_8_players_balanced_courts(self):
        players = [
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": f"M{i}", "seed": i, "gender": "Male"}
            for i in range(1, 5)
        ] + [
            {"id": uuid.uuid4(), "player_membership_id": uuid.uuid4(), "display_name": f"F{i}", "seed": i + 4, "gender": "Female"}
            for i in range(1, 5)
        ]
        res = self.engine.generate_round_matchups(players, round_number=1, start_match_number=1, division="Mixed Scramble")
        assert res["c4_courts"] == 2
        assert len(res["courts"]) == 2

        # Each court must have exactly 2 males and 2 females
        for court in res["courts"]:
            c_players = court["players"]
            assert len(c_players) == 4
            males = [p for p in c_players if p["gender"] == "Male"]
            females = [p for p in c_players if p["gender"] == "Female"]
            assert len(males) == 2
            assert len(females) == 2


class TestScrambleWorkspaceAPI:
    @pytest.mark.asyncio
    async def test_scramble_workspace_full_lifecycle(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        director = data["director"]
        t = data["tournament"]
        headers = make_auth_header(director)

        # 1. Check initial scramble state
        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=headers,
        )
        assert res.status_code == 200
        state = res.json()
        assert state["tournament_id"] == str(t.id)
        assert state["current_round"] == 1
        assert state["round_status"] == "setup"
        assert state["registered_players_count"] == 8
        assert state["available_players_count"] == 8
        assert "create_matchups" in state["valid_actions"]

        # 2. Player public state endpoint
        headers_player = make_auth_header(data["regular"])
        pub_res = await async_client.get(
            f"/api/v1/tournaments/{t.id}/scramble/state",
            headers=headers_player,
        )
        assert pub_res.status_code == 200
        assert pub_res.json()["round_status"] == "setup"

        # 3. Test player availability invalid partition error (e.g. only 3 players available)
        confirmed_ids = state["available_player_ids"]
        invalid_avail = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/availability",
            headers=headers,
            json={"player_membership_ids": confirmed_ids[:3]},
        )
        assert invalid_avail.status_code == 400
        assert "cannot be divided into valid courts" in invalid_avail.json()["detail"]

        # 3b. Test valid player availability update (4 players = 1 court of 4)
        valid_avail = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/availability",
            headers=headers,
            json={"player_membership_ids": confirmed_ids[:4]},
        )
        assert valid_avail.status_code == 200
        assert valid_avail.json()["available_players_count"] == 4

        # 4. Create round matchups
        matchup_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matchups",
            headers=headers,
            json={},
        )
        assert matchup_res.status_code == 200
        matchup_state = matchup_res.json()
        assert matchup_state["round_status"] == "matchups_created"
        assert matchup_state["total_games"] == 3
        assert "start_round" in matchup_state["valid_actions"]

        # 5. Start round
        start_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/start-round",
            headers=headers,
        )
        assert start_res.status_code == 200
        assert start_res.json()["round_status"] == "in_progress"

        # 6. List matches to record scores
        matches_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches",
            headers=headers,
        )
        assert matches_res.status_code == 200
        matches = matches_res.json()
        assert len(matches) == 3

        # Cannot finish round while matches are pending
        early_finish = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/finish-round",
            headers=headers,
        )
        assert early_finish.status_code == 400
        assert "still pending results" in early_finish.json()["detail"]

        # Record scores for all 3 matches
        scores = [(11, 7), (11, 9), (12, 10)]
        for m, (sa, sb) in zip(matches, scores):
            rec = await async_client.post(
                f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{m['id']}/result",
                headers=headers,
                json={"score_a": sa, "score_b": sb},
            )
            assert rec.status_code == 200

        # 7. Finish round
        finish_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/finish-round",
            headers=headers,
        )
        assert finish_res.status_code == 200
        finished_state = finish_res.json()
        assert finished_state["round_status"] == "completed"
        assert "start_next_round" in finished_state["valid_actions"]
        assert "end_tournament" in finished_state["valid_actions"]

        # 8. Start next round
        next_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/next-round",
            headers=headers,
        )
        assert next_res.status_code == 200
        next_state = next_res.json()
        assert next_state["current_round"] == 2
        assert next_state["round_status"] == "setup"

        # 9. End tournament
        end_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/end-tournament",
            headers=headers,
        )
        assert end_res.status_code == 200
        final_state = end_res.json()
        assert final_state["tournament_status"] == "completed"
        assert final_state["champion_player_name"] is not None


class TestScrambleDivisionsAndEligibility:
    @pytest.mark.asyncio
    async def test_scramble_divisions_creation(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        director = data["director"]
        headers = make_auth_header(director)

        now = datetime.now(timezone.utc)
        valid_divisions = ["Open Scramble", "Men's Scramble", "Women's Scramble", "Mixed Scramble"]
        for div in valid_divisions:
            payload = {
                "name": f"Test {div}",
                "format": "scramble",
                "format_configuration": {
                    "category": div,
                    "rounds": 3,
                    "matches_per_player": 3,
                },
                "start_date": (now + timedelta(days=2)).isoformat(),
                "end_date": (now + timedelta(days=3)).isoformat(),
                "registration_open_at": (now - timedelta(days=1)).isoformat(),
                "registration_close_at": (now + timedelta(days=1)).isoformat(),
                "min_participants": 4,
                "max_participants": 16,
            }
            res = await async_client.post(
                f"/api/v1/clubs/{club.id}/tournaments",
                headers=headers,
                json=payload,
            )
            assert res.status_code == 201, f"Failed for {div}: {res.text}"
            t_data = res.json()
            assert t_data["format_configuration"]["category"] == div
            if div == "Men's Scramble":
                assert t_data["format_configuration"]["gender_eligibility"] == "Male"
            elif div == "Women's Scramble":
                assert t_data["format_configuration"]["gender_eligibility"] == "Female"
            else:
                assert t_data["format_configuration"]["gender_eligibility"] == "Any"

    @pytest.mark.asyncio
    async def test_scramble_rejects_standard_category(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        director = data["director"]
        headers = make_auth_header(director)

        now = datetime.now(timezone.utc)
        payload = {
            "name": "Invalid Scramble",
            "format": "scramble",
            "format_configuration": {
                "category": "Men's Doubles",
            },
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "min_participants": 4,
            "max_participants": 16,
        }
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=headers,
            json=payload,
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_round_robin_rejects_scramble_division(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        director = data["director"]
        headers = make_auth_header(director)

        now = datetime.now(timezone.utc)
        payload = {
            "name": "Invalid Round Robin",
            "format": "round_robin",
            "format_configuration": {
                "category": "Open Scramble",
            },
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "min_participants": 4,
            "max_participants": 16,
        }
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=headers,
            json=payload,
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_scramble_division_player_gender_enforcement(
        self, async_client: AsyncClient, db_session: AsyncSession, scramble_setup: dict
    ):
        data = scramble_setup
        club = data["club"]
        director = data["director"]
        headers = make_auth_header(director)

        now = datetime.now(timezone.utc)
        # Create Men's Scramble tournament
        payload = {
            "name": "Men Only Scramble",
            "format": "scramble",
            "format_configuration": {
                "category": "Men's Scramble",
                "rounds": 3,
            },
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "min_participants": 4,
            "max_participants": 16,
        }
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=headers,
            json=payload,
        )
        assert res.status_code == 201
        t_id = res.json()["id"]

        # Open registration
        open_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t_id}/open-registration",
            headers=headers,
        )
        assert open_res.status_code == 200

        # Create female player with profile gender = Female
        from app.models.player_profile import PlayerProfile
        from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
        female_user = User(
            email="female_player@local.test",
            hashed_password=hash_password("Pass123!"),
            full_name="Alice Female",
            is_active=True,
            is_verified=True,
        )
        db_session.add(female_user)
        await db_session.flush()
        profile = PlayerProfile(user_id=female_user.id, display_name="Alice Female", gender="Female")
        db_session.add(profile)
        cpm = ClubPlayerMembership(
            club_id=club.id,
            user_id=female_user.id,
            membership_number="F001",
            status=PlayerMembershipStatus.ACTIVE,
        )
        db_session.add(cpm)
        await db_session.commit()

        female_headers = make_auth_header(female_user)
        reg_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=female_headers,
            json={},
        )
        assert reg_res.status_code == 400
        assert "restricted to male players" in reg_res.json()["detail"]

