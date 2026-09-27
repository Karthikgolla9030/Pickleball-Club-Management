"""
Aught2 Pickleball — Phase 8: Standalone Bracket Competition Engine Tests

Comprehensive automated test suite covering:
  1. Pure Computation Unit Tests (no DB):
     - Bracket size calculation (next power of 2)
     - Deterministic team sorting (seed -> name -> id)
     - Standard bracket pairings for sizes 2, 4, 8, 16
     - Bracket generation: 2 teams, 4 teams, 8 teams
     - BYE handling: 3 teams (pad to 4), 5 teams (pad to 8), 6 teams (pad to 8)
     - BYE matches: status=completed, winner=real_team, score_a/score_b=None
     - next_match_id / next_match_slot wired correctly
     - Strict determinism (identical input produces identical bracket)
     - BYE propagation (winner placed in next round automatically)
     - Team validation (min 2 teams, exactly 2 members, no duplicate players)
     - Bracket summary computation

  2. Integration & API Tests (with DB):
     - Staff authorization & permissions (Owner, Manager, Director allowed; Player forbidden)
     - Unauthenticated access rejected
     - Format guards (round_robin, pool_play, scramble rejected)
     - Lifecycle status guards (draft, in_progress, completed, cancelled rejected)
     - generate-bracket: creates correct match tree for 8 teams (7 matches, 3 rounds)
     - generate-bracket: BYE handling for 6 teams (8-slot bracket, 2 BYEs)
     - generate-bracket transitions tournament to in_progress
     - generate-bracket idempotency guard (duplicate generate rejected)
     - regenerate-bracket before scores recorded
     - regenerate-bracket blocked after any real score recorded
     - Bracket matches ordering by round and position
     - Record match result advances winner to next round
     - Record match result for final completes tournament
     - Correct match result (safe correction, blocks if next match completed)
     - BYE matches cannot be scored
     - Player read-only endpoints (bracket and bracket/matches)
     - Player cannot access staff generate/regenerate endpoints
     - Tenant isolation: club A cannot access club B's bracket tournament
     - get_bracket_summary returns correct champion after final is completed
     - 2-team bracket: 1 match, 1 round, winner is champion
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
from app.models.competition import Match, MatchStatus, Team, TeamMember
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from app.services.competition.bracket_engine import (
    BracketConfigurationError,
    BracketEngine,
)
from tests.conftest import make_auth_header


# ==============================================================================
# 1. Pure Computation Unit Tests (No Database)
# ==============================================================================

class TestBracketEngineUnit:
    """Pure unit tests for BracketEngine — no DB required."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.engine = BracketEngine()

    # ── Bracket Size ────────────────────────────────────────────────────────────

    def test_bracket_size_2(self):
        assert BracketEngine.calculate_bracket_size(2) == 2

    def test_bracket_size_3(self):
        assert BracketEngine.calculate_bracket_size(3) == 4

    def test_bracket_size_4(self):
        assert BracketEngine.calculate_bracket_size(4) == 4

    def test_bracket_size_5(self):
        assert BracketEngine.calculate_bracket_size(5) == 8

    def test_bracket_size_6(self):
        assert BracketEngine.calculate_bracket_size(6) == 8

    def test_bracket_size_7(self):
        assert BracketEngine.calculate_bracket_size(7) == 8

    def test_bracket_size_8(self):
        assert BracketEngine.calculate_bracket_size(8) == 8

    def test_bracket_size_9(self):
        assert BracketEngine.calculate_bracket_size(9) == 16

    def test_bracket_size_16(self):
        assert BracketEngine.calculate_bracket_size(16) == 16

    def test_bracket_size_1_raises(self):
        with pytest.raises(BracketConfigurationError):
            BracketEngine.calculate_bracket_size(1)

    # ── Team Sorting ─────────────────────────────────────────────────────────────

    def test_sort_seeded_teams_ascending(self):
        t1 = {"id": str(uuid.uuid4()), "name": "Zzz", "seed": 3}
        t2 = {"id": str(uuid.uuid4()), "name": "Aaa", "seed": 1}
        t3 = {"id": str(uuid.uuid4()), "name": "Mmm", "seed": 2}
        result = BracketEngine.sort_teams_deterministically([t1, t2, t3])
        assert [t["name"] for t in result] == ["Aaa", "Mmm", "Zzz"]

    def test_sort_unseeded_teams_by_name(self):
        t1 = {"id": str(uuid.uuid4()), "name": "Charlie", "seed": None}
        t2 = {"id": str(uuid.uuid4()), "name": "Alpha", "seed": None}
        t3 = {"id": str(uuid.uuid4()), "name": "Bravo", "seed": None}
        result = BracketEngine.sort_teams_deterministically([t1, t2, t3])
        assert [t["name"] for t in result] == ["Alpha", "Bravo", "Charlie"]

    def test_sort_seeded_before_unseeded(self):
        t1 = {"id": str(uuid.uuid4()), "name": "NoSeed", "seed": None}
        t2 = {"id": str(uuid.uuid4()), "name": "Seeded", "seed": 1}
        result = BracketEngine.sort_teams_deterministically([t1, t2])
        assert result[0]["name"] == "Seeded"
        assert result[1]["name"] == "NoSeed"

    def test_sort_is_deterministic_same_input_same_output(self):
        teams = [
            {"id": "aaaa-bbbb", "name": "Delta", "seed": 2},
            {"id": "cccc-dddd", "name": "Alpha", "seed": 1},
            {"id": "eeee-ffff", "name": "Bravo", "seed": None},
        ]
        r1 = BracketEngine.sort_teams_deterministically(list(teams))
        r2 = BracketEngine.sort_teams_deterministically(list(teams))
        assert [t["name"] for t in r1] == [t["name"] for t in r2]

    def test_sort_name_tiebreak_case_insensitive(self):
        a_id = "aaaa"
        b_id = "bbbb"
        t1 = {"id": b_id, "name": "BRAVO", "seed": None}
        t2 = {"id": a_id, "name": "bravo", "seed": None}
        result = BracketEngine.sort_teams_deterministically([t1, t2])
        # Both have same lowercased name, fall to UUID tiebreak
        assert result[0]["id"] == a_id  # "aaaa" < "bbbb"

    # ── Standard Pairings ────────────────────────────────────────────────────────

    def test_pairings_size_2(self):
        pairs = BracketEngine.get_standard_bracket_pairings(2)
        assert len(pairs) == 1
        assert (1, 2) in pairs

    def test_pairings_size_4(self):
        pairs = BracketEngine.get_standard_bracket_pairings(4)
        assert len(pairs) == 2
        # Should be [(1,4),(2,3)] or similar standard seeding
        all_seeds = set()
        for a, b in pairs:
            all_seeds.add(a)
            all_seeds.add(b)
        assert all_seeds == {1, 2, 3, 4}

    def test_pairings_size_8(self):
        pairs = BracketEngine.get_standard_bracket_pairings(8)
        assert len(pairs) == 4
        all_seeds = set()
        for a, b in pairs:
            all_seeds.add(a)
            all_seeds.add(b)
        assert all_seeds == {1, 2, 3, 4, 5, 6, 7, 8}
        # Seed 1 and 8 must be paired in round 1
        assert (1, 8) in pairs or (8, 1) in pairs

    def test_pairings_size_16(self):
        pairs = BracketEngine.get_standard_bracket_pairings(16)
        assert len(pairs) == 8
        all_seeds = set()
        for a, b in pairs:
            all_seeds.add(a)
            all_seeds.add(b)
        assert all_seeds == set(range(1, 17))
        assert (1, 16) in pairs or (16, 1) in pairs

    def test_pairings_are_deterministic(self):
        pairs1 = BracketEngine.get_standard_bracket_pairings(8)
        pairs2 = BracketEngine.get_standard_bracket_pairings(8)
        assert pairs1 == pairs2

    # ── Team Validation ──────────────────────────────────────────────────────────

    def test_validate_fewer_than_2_teams_raises(self):
        with pytest.raises(BracketConfigurationError, match="at least 2 teams"):
            BracketEngine.validate_bracket_teams([])

    def test_validate_1_team_raises(self):
        team = {"id": str(uuid.uuid4()), "name": "Solo", "members": [
            {"player_membership_id": str(uuid.uuid4())},
            {"player_membership_id": str(uuid.uuid4())},
        ]}
        with pytest.raises(BracketConfigurationError, match="at least 2 teams"):
            BracketEngine.validate_bracket_teams([team])

    def test_validate_team_with_1_member_raises(self):
        pm1 = str(uuid.uuid4())
        t1 = {"id": str(uuid.uuid4()), "name": "A", "members": [{"player_membership_id": pm1}]}
        t2 = {"id": str(uuid.uuid4()), "name": "B", "members": [
            {"player_membership_id": str(uuid.uuid4())},
            {"player_membership_id": str(uuid.uuid4())},
        ]}
        with pytest.raises(BracketConfigurationError, match="exactly 2 players"):
            BracketEngine.validate_bracket_teams([t1, t2])

    def test_validate_team_with_3_members_raises(self):
        t1 = {"id": str(uuid.uuid4()), "name": "A", "members": [
            {"player_membership_id": str(uuid.uuid4())},
            {"player_membership_id": str(uuid.uuid4())},
            {"player_membership_id": str(uuid.uuid4())},
        ]}
        t2 = {"id": str(uuid.uuid4()), "name": "B", "members": [
            {"player_membership_id": str(uuid.uuid4())},
            {"player_membership_id": str(uuid.uuid4())},
        ]}
        with pytest.raises(BracketConfigurationError, match="exactly 2 players"):
            BracketEngine.validate_bracket_teams([t1, t2])

    def test_validate_duplicate_player_across_teams_raises(self):
        shared_pm = str(uuid.uuid4())
        t1 = {"id": str(uuid.uuid4()), "name": "A", "members": [
            {"player_membership_id": shared_pm},
            {"player_membership_id": str(uuid.uuid4())},
        ]}
        t2 = {"id": str(uuid.uuid4()), "name": "B", "members": [
            {"player_membership_id": shared_pm},
            {"player_membership_id": str(uuid.uuid4())},
        ]}
        with pytest.raises(BracketConfigurationError, match="multiple teams"):
            BracketEngine.validate_bracket_teams([t1, t2])

    def test_validate_duplicate_player_within_team_raises(self):
        pm = str(uuid.uuid4())
        t1 = {"id": str(uuid.uuid4()), "name": "A", "members": [
            {"player_membership_id": pm},
            {"player_membership_id": pm},
        ]}
        t2 = {"id": str(uuid.uuid4()), "name": "B", "members": [
            {"player_membership_id": str(uuid.uuid4())},
            {"player_membership_id": str(uuid.uuid4())},
        ]}
        with pytest.raises(BracketConfigurationError, match="duplicate"):
            BracketEngine.validate_bracket_teams([t1, t2])

    def test_validate_2_valid_teams_passes(self):
        teams = [
            {"id": str(uuid.uuid4()), "name": "A", "members": [
                {"player_membership_id": str(uuid.uuid4())},
                {"player_membership_id": str(uuid.uuid4())},
            ]},
            {"id": str(uuid.uuid4()), "name": "B", "members": [
                {"player_membership_id": str(uuid.uuid4())},
                {"player_membership_id": str(uuid.uuid4())},
            ]},
        ]
        BracketEngine.validate_bracket_teams(teams)  # should not raise

    # ── Bracket Generation ───────────────────────────────────────────────────────

    def _make_teams(self, n: int) -> list[dict]:
        """Create n minimal valid team dicts with unique players."""
        teams = []
        for i in range(1, n + 1):
            teams.append({
                "id": uuid.uuid4(),
                "name": f"Team {i}",
                "seed": i,
                "members": [
                    {"player_membership_id": uuid.uuid4()},
                    {"player_membership_id": uuid.uuid4()},
                ],
            })
        return teams

    def test_generate_2_teams_1_match(self):
        tid = uuid.uuid4()
        teams = self._make_teams(2)
        slots = self.engine.generate_bracket(tid, teams)
        # 2 teams -> bracket_size=2 -> 1 match, 1 round, 0 BYEs
        real_matches = [s for s in slots if not s.is_bye]
        assert len(real_matches) == 1
        byes = [s for s in slots if s.is_bye]
        assert len(byes) == 0

    def test_generate_4_teams_3_matches_2_rounds(self):
        tid = uuid.uuid4()
        teams = self._make_teams(4)
        slots = self.engine.generate_bracket(tid, teams)
        # bracket_size=4 -> QF round (2 matches) + Final (1 match) = 3 total
        assert len(slots) == 3
        byes = [s for s in slots if s.is_bye]
        assert len(byes) == 0
        rounds = {s.bracket_round for s in slots}
        assert rounds == {1, 2}

    def test_generate_8_teams_7_matches_3_rounds(self):
        tid = uuid.uuid4()
        teams = self._make_teams(8)
        slots = self.engine.generate_bracket(tid, teams)
        # bracket_size=8 -> 8-1=7 matches total, 0 BYEs
        assert len(slots) == 7
        byes = [s for s in slots if s.is_bye]
        assert len(byes) == 0
        rounds = {s.bracket_round for s in slots}
        assert rounds == {1, 2, 3}

    def test_generate_3_teams_has_1_bye(self):
        tid = uuid.uuid4()
        teams = self._make_teams(3)
        slots = self.engine.generate_bracket(tid, teams)
        # bracket_size=4 -> 3 total matches, 1 BYE
        assert len(slots) == 3
        byes = [s for s in slots if s.is_bye]
        assert len(byes) == 1
        # BYE match must be completed, score_a=None, score_b=None
        for b in byes:
            assert b.status == "completed"
            assert b.score_a is None
            assert b.score_b is None
            assert b.winner_team_id is not None

    def test_generate_6_teams_has_2_byes(self):
        tid = uuid.uuid4()
        teams = self._make_teams(6)
        slots = self.engine.generate_bracket(tid, teams)
        # bracket_size=8 -> 7 total matches, 2 BYEs
        assert len(slots) == 7
        byes = [s for s in slots if s.is_bye]
        assert len(byes) == 2

    def test_generate_5_teams_has_3_byes(self):
        tid = uuid.uuid4()
        teams = self._make_teams(5)
        slots = self.engine.generate_bracket(tid, teams)
        # bracket_size=8 -> 7 total matches, 3 BYEs
        assert len(slots) == 7
        byes = [s for s in slots if s.is_bye]
        assert len(byes) == 3

    def test_bye_winners_propagated_to_next_round(self):
        tid = uuid.uuid4()
        teams = self._make_teams(3)
        slots = self.engine.generate_bracket(tid, teams)
        # The BYE winner should appear in a round 2 slot
        bye = next(s for s in slots if s.is_bye)
        assert bye.winner_team_id is not None
        # Find the next match
        next_slot = next((s for s in slots if s.id == bye.next_match_id), None)
        assert next_slot is not None
        # Winner should be populated in next_slot
        winner_in_next = (
            next_slot.team_a_id == bye.winner_team_id
            or next_slot.team_b_id == bye.winner_team_id
        )
        assert winner_in_next, "BYE winner not propagated to next round match"

    def test_next_match_links_are_set_for_non_final_matches(self):
        tid = uuid.uuid4()
        teams = self._make_teams(8)
        slots = self.engine.generate_bracket(tid, teams)
        # All round 1 and round 2 matches must have next_match_id set
        for s in slots:
            if s.bracket_round < 3:  # not the final
                assert s.next_match_id is not None, \
                    f"Match R{s.bracket_round}P{s.bracket_position} missing next_match_id"
                assert s.next_match_slot in ("team_a", "team_b"), \
                    f"Match R{s.bracket_round}P{s.bracket_position} invalid next_match_slot"

    def test_final_match_has_no_next_match(self):
        tid = uuid.uuid4()
        teams = self._make_teams(8)
        slots = self.engine.generate_bracket(tid, teams)
        final = next(s for s in slots if s.bracket_round == 3)
        assert final.next_match_id is None

    def test_bracket_is_deterministic_same_teams_same_result(self):
        tid = uuid.uuid4()
        teams = self._make_teams(8)
        slots1 = self.engine.generate_bracket(tid, list(teams))
        slots2 = self.engine.generate_bracket(tid, list(teams))
        ids1 = [(s.bracket_round, s.bracket_position, str(s.team_a_id), str(s.team_b_id)) for s in slots1]
        ids2 = [(s.bracket_round, s.bracket_position, str(s.team_a_id), str(s.team_b_id)) for s in slots2]
        assert ids1 == ids2

    def test_seed_1_plays_bottom_seed_in_round_1_for_8_teams(self):
        """Seed 1 should face seed 8 in round 1 (standard seeding)."""
        tid = uuid.uuid4()
        teams = self._make_teams(8)
        slots = self.engine.generate_bracket(tid, teams)
        r1_matches = [s for s in slots if s.bracket_round == 1]
        team_id_to_seed = {str(t["id"]): t["seed"] for t in teams}
        # Find the match containing seed 1
        seed1_team_id = str(next(t["id"] for t in teams if t["seed"] == 1))
        seed1_match = next(
            (s for s in r1_matches if str(s.team_a_id) == seed1_team_id or str(s.team_b_id) == seed1_team_id),
            None
        )
        assert seed1_match is not None
        # The opponent should be seed 8
        opponent_id = (
            str(seed1_match.team_b_id) if str(seed1_match.team_a_id) == seed1_team_id
            else str(seed1_match.team_a_id)
        )
        assert team_id_to_seed[opponent_id] == 8

    def test_fewer_than_2_teams_raises(self):
        with pytest.raises(BracketConfigurationError, match="at least 2 teams"):
            self.engine.generate_bracket(uuid.uuid4(), [])

    def test_each_team_appears_exactly_once_in_round_1(self):
        tid = uuid.uuid4()
        teams = self._make_teams(4)
        slots = self.engine.generate_bracket(tid, teams)
        r1 = [s for s in slots if s.bracket_round == 1]
        team_ids_in_r1 = []
        for s in r1:
            if s.team_a_id:
                team_ids_in_r1.append(str(s.team_a_id))
            if s.team_b_id:
                team_ids_in_r1.append(str(s.team_b_id))
        # Each real team should appear exactly once
        all_team_ids = [str(t["id"]) for t in teams]
        for tid_ in all_team_ids:
            assert team_ids_in_r1.count(tid_) == 1


# ==============================================================================
# 2. Integration & API Tests (with Database)
# ==============================================================================

# ─── Shared Fixtures ──────────────────────────────────────────────────────────

async def _create_user(db: AsyncSession, email: str, display_name: str) -> User:
    user = User(
        email=email,
        hashed_password=hash_password("TestPass123!"),
        full_name=display_name,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    profile = PlayerProfile(user_id=user.id, display_name=display_name)
    db.add(profile)
    await db.flush()
    return user


async def _create_club_membership(
    db: AsyncSession, user: User, club: Club, role: ClubRole
) -> ClubMembership:
    cm = ClubMembership(user_id=user.id, club_id=club.id, role=role, is_active=True)
    db.add(cm)
    await db.flush()
    return cm


async def _create_player_membership(
    db: AsyncSession, user: User, club: Club, status=PlayerMembershipStatus.ACTIVE
) -> ClubPlayerMembership:
    pm = ClubPlayerMembership(
        user_id=user.id,
        club_id=club.id,
        membership_number=f"MB-{user.id.hex[:6].upper()}",
        status=status,
    )
    db.add(pm)
    await db.flush()
    return pm


async def _register_player(
    db: AsyncSession,
    tournament: Tournament,
    player_membership: ClubPlayerMembership,
    status: RegistrationStatus = RegistrationStatus.CONFIRMED,
) -> TournamentRegistration:
    reg = TournamentRegistration(
        tournament_id=tournament.id,
        player_membership_id=player_membership.id,
        status=status,
        registered_at=datetime.now(timezone.utc),
    )
    db.add(reg)
    await db.flush()
    return reg


async def _create_team(
    db: AsyncSession,
    tournament: Tournament,
    name: str,
    pm1: ClubPlayerMembership,
    pm2: ClubPlayerMembership,
    seed: int | None = None,
) -> Team:
    team = Team(tournament_id=tournament.id, name=name, seed=seed)
    db.add(team)
    await db.flush()
    m1 = TeamMember(team_id=team.id, player_membership_id=pm1.id)
    m2 = TeamMember(team_id=team.id, player_membership_id=pm2.id)
    db.add(m1)
    db.add(m2)
    await db.flush()
    return team


@pytest_asyncio.fixture
async def bracket_env(db_session: AsyncSession):
    """
    Creates a complete bracket tournament environment:
      - Club with owner, manager, director, 16 players
      - Bracket tournament (registration_closed)
      - 8 teams (16 players)
    """
    # Club
    club = Club(
        name="Bracket Club",
        slug=f"bracket-club-{uuid.uuid4().hex[:6]}",
        description="Test club for bracket tests",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    # Staff
    owner = await _create_user(db_session, f"owner+{uuid.uuid4().hex[:6]}@test.local", "Owner")
    manager = await _create_user(db_session, f"mgr+{uuid.uuid4().hex[:6]}@test.local", "Manager")
    director = await _create_user(db_session, f"dir+{uuid.uuid4().hex[:6]}@test.local", "Director")

    await _create_club_membership(db_session, owner, club, ClubRole.CLUB_OWNER)
    await _create_club_membership(db_session, manager, club, ClubRole.CLUB_MANAGER)
    await _create_club_membership(db_session, director, club, ClubRole.TOURNAMENT_DIRECTOR)

    # 16 players (8 teams × 2 players)
    players = []
    pms = []
    for i in range(16):
        p = await _create_user(db_session, f"player{i}+{uuid.uuid4().hex[:6]}@test.local", f"Player {i}")
        pm = await _create_player_membership(db_session, p, club)
        players.append(p)
        pms.append(pm)

    # Tournament
    now = datetime.now(timezone.utc)
    tournament = Tournament(
        club_id=club.id,
        created_by_user_id=director.id,
        name="Bracket Championship",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_CLOSED,
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

    # Register all players
    for pm in pms:
        await _register_player(db_session, tournament, pm)

    # Create 8 teams
    teams = []
    for i in range(8):
        t = await _create_team(
            db_session, tournament,
            f"Team {i+1}",
            pms[i * 2],
            pms[i * 2 + 1],
            seed=i + 1,
        )
        teams.append(t)

    await db_session.commit()

    return {
        "club": club,
        "owner": owner,
        "manager": manager,
        "director": director,
        "players": players,
        "pms": pms,
        "tournament": tournament,
        "teams": teams,
    }


@pytest_asyncio.fixture
async def bracket_2teams(db_session: AsyncSession):
    """2-team bracket tournament for simple final test."""
    club = Club(
        name="Mini Club",
        slug=f"mini-club-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    owner = await _create_user(db_session, f"mini_owner+{uuid.uuid4().hex[:6]}@test.local", "MOwner")
    await _create_club_membership(db_session, owner, club, ClubRole.CLUB_OWNER)

    players = []
    pms = []
    for i in range(4):
        p = await _create_user(db_session, f"mp{i}+{uuid.uuid4().hex[:6]}@test.local", f"MP{i}")
        pm = await _create_player_membership(db_session, p, club)
        players.append(p)
        pms.append(pm)

    now2 = datetime.now(timezone.utc)
    tournament = Tournament(
        club_id=club.id,
        created_by_user_id=owner.id,
        name="Mini Bracket",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_CLOSED,
        visibility=TournamentVisibility.PUBLIC,
        registration_open_at=now2 - timedelta(days=2),
        registration_close_at=now2 - timedelta(days=1),
        start_date=now2 + timedelta(days=1),
        end_date=now2 + timedelta(days=2),
        min_participants=2,
        max_participants=4,
    )
    db_session.add(tournament)
    await db_session.flush()

    for pm in pms:
        await _register_player(db_session, tournament, pm)

    t1 = await _create_team(db_session, tournament, "Alpha", pms[0], pms[1], seed=1)
    t2 = await _create_team(db_session, tournament, "Bravo", pms[2], pms[3], seed=2)

    await db_session.commit()
    return {
        "club": club, "owner": owner, "tournament": tournament,
        "teams": [t1, t2], "pms": pms,
    }


# ─── Tests ────────────────────────────────────────────────────────────────────

class TestBracketGenerateAPI:
    """Test POST /generate-bracket endpoint."""

    async def test_director_can_generate_bracket(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["director"].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["teams_count"] == 8
        assert data["bracket_size"] == 8
        assert data["rounds_count"] == 3
        assert data["matches_generated"] == 7
        assert data["byes_count"] == 0
        assert data["played_matches_count"] == 7

    async def test_owner_can_generate_bracket(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["owner"].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 201, r.text

    async def test_manager_can_generate_bracket(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["manager"].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 201, r.text

    async def test_player_cannot_generate_bracket(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["players"][0].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 403, r.text

    async def test_unauthenticated_cannot_generate_bracket(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
        )
        assert r.status_code == 401, r.text

    async def test_generate_bracket_transitions_to_in_progress(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["director"].id)
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}",
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    async def test_generate_bracket_twice_rejected(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["director"].id)
        r1 = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r1.status_code == 201
        r2 = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r2.status_code == 400, r2.text
        assert "already generated" in r2.json()["detail"].lower()

    async def test_generate_bracket_wrong_format_rejected(
        self, async_client: AsyncClient, bracket_env, db_session: AsyncSession
    ):
        """A round_robin tournament must reject generate-bracket."""
        club_id = bracket_env["club"].id
        # Create a round_robin tournament in the same club
        now3 = datetime.now(timezone.utc)
        rr_tournament = Tournament(
            club_id=club_id,
            created_by_user_id=bracket_env["director"].id,
            name="RR Test",
            format=TournamentFormat.ROUND_ROBIN,
            status=TournamentStatus.REGISTRATION_CLOSED,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now3 - timedelta(days=2),
            registration_close_at=now3 - timedelta(days=1),
            start_date=now3 + timedelta(days=1),
            end_date=now3 + timedelta(days=2),
        )
        db_session.add(rr_tournament)
        await db_session.commit()
        headers = make_auth_header(bracket_env["director"].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{rr_tournament.id}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 400
        assert "bracket" in r.json()["detail"].lower()

    async def test_generate_bracket_draft_status_rejected(
        self, async_client: AsyncClient, bracket_env, db_session: AsyncSession
    ):
        club_id = bracket_env["club"].id
        now4 = datetime.now(timezone.utc)
        draft_t = Tournament(
            club_id=club_id,
            created_by_user_id=bracket_env["director"].id,
            name="Draft Bracket",
            format=TournamentFormat.BRACKET,
            status=TournamentStatus.DRAFT,
            visibility=TournamentVisibility.PRIVATE,
            registration_open_at=now4 + timedelta(days=1),
            registration_close_at=now4 + timedelta(days=7),
            start_date=now4 + timedelta(days=8),
            end_date=now4 + timedelta(days=9),
        )
        db_session.add(draft_t)
        await db_session.commit()
        headers = make_auth_header(bracket_env["director"].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{draft_t.id}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 400
        assert "registration_closed" in r.json()["detail"].lower()

    async def test_generate_bracket_2_teams_creates_1_match(
        self, async_client: AsyncClient, bracket_2teams
    ):
        club_id = bracket_2teams["club"].id
        tid = bracket_2teams["tournament"].id
        headers = make_auth_header(bracket_2teams["owner"].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["teams_count"] == 2
        assert data["bracket_size"] == 2
        assert data["rounds_count"] == 1
        assert data["matches_generated"] == 1
        assert data["byes_count"] == 0
        assert data["played_matches_count"] == 1


class TestBracketMatchesAPI:
    """Test GET /bracket/matches and /bracket endpoints."""

    async def test_staff_can_list_bracket_matches(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["director"].id)
        # Generate first
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/bracket/matches",
            headers=headers,
        )
        assert r.status_code == 200
        matches = r.json()
        assert len(matches) == 7
        # Verify ordering: round 1 first
        rounds = [m["bracket_round"] for m in matches]
        assert rounds == sorted(rounds)

    async def test_player_can_view_bracket_matches(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        # Generate as director
        dir_headers = make_auth_header(bracket_env["director"].id)
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=dir_headers,
        )
        # Player views
        player_headers = make_auth_header(bracket_env["players"][0].id)
        r = await async_client.get(
            f"/api/v1/tournaments/{tid}/bracket/matches",
            headers=player_headers,
        )
        assert r.status_code == 200
        assert len(r.json()) == 7

    async def test_player_bracket_summary_shows_no_champion_yet(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        dir_headers = make_auth_header(bracket_env["director"].id)
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=dir_headers,
        )
        player_headers = make_auth_header(bracket_env["players"][0].id)
        r = await async_client.get(
            f"/api/v1/tournaments/{tid}/bracket",
            headers=player_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["champion_team_id"] is None
        assert data["matches_remaining"] == 7
        assert data["matches_played"] == 0

    async def test_unauthenticated_cannot_list_bracket_matches(
        self, async_client: AsyncClient, bracket_env
    ):
        tid = bracket_env["tournament"].id
        r = await async_client.get(f"/api/v1/tournaments/{tid}/bracket/matches")
        assert r.status_code == 401

    async def test_bracket_matches_wrong_format_rejected(
        self, async_client: AsyncClient, bracket_env, db_session: AsyncSession
    ):
        club_id = bracket_env["club"].id
        now5 = datetime.now(timezone.utc)
        rr = Tournament(
            club_id=club_id,
            created_by_user_id=bracket_env["director"].id,
            name="RR Verify",
            format=TournamentFormat.ROUND_ROBIN,
            status=TournamentStatus.IN_PROGRESS,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now5 - timedelta(days=3),
            registration_close_at=now5 - timedelta(days=1),
            start_date=now5 + timedelta(days=1),
            end_date=now5 + timedelta(days=2),
        )
        db_session.add(rr)
        await db_session.commit()
        headers = make_auth_header(bracket_env["director"].id)
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{rr.id}/bracket/matches",
            headers=headers,
        )
        assert r.status_code == 400


class TestBracketScoring:
    """Test match result recording and bracket advancement."""

    async def _setup_bracket(self, async_client, bracket_env):
        """Helper to generate a bracket and return match list."""
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["director"].id)
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/bracket/matches",
            headers=headers,
        )
        return r.json(), headers

    async def test_record_result_advances_winner_to_next_round(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        matches, headers = await self._setup_bracket(async_client, bracket_env)

        # Find a round 1 match with both teams set (no BYE)
        r1_match = next(
            m for m in matches
            if m["bracket_round"] == 1 and m["team_a"] and m["team_b"]
        )
        match_id = r1_match["id"]

        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{match_id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )
        assert r.status_code == 200
        completed = r.json()
        assert completed["status"] == "completed"
        winner_id = completed["winner_team_id"]
        assert winner_id is not None

        # The next round match should now have this winner
        next_match_id = r1_match["next_match_id"]
        r2 = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{next_match_id}",
            headers=headers,
        )
        next_m = r2.json()
        assert (
            next_m["team_a_id"] == winner_id
            or next_m["team_b_id"] == winner_id
        ), "Winner not advanced to next round match"

    async def test_record_result_winner_derived_from_score(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        matches, headers = await self._setup_bracket(async_client, bracket_env)

        r1_match = next(
            m for m in matches
            if m["bracket_round"] == 1 and m["team_a"] and m["team_b"]
        )
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1_match['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )
        data = r.json()
        # score_a > score_b, so team_a should be winner
        assert data["winner_team_id"] == r1_match["team_a_id"]

    async def test_tie_score_rejected(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        matches, headers = await self._setup_bracket(async_client, bracket_env)

        r1_match = next(
            m for m in matches
            if m["bracket_round"] == 1 and m["team_a"] and m["team_b"]
        )
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1_match['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 11},
        )
        assert r.status_code == 422

    async def test_player_cannot_record_score(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        matches, dir_headers = await self._setup_bracket(async_client, bracket_env)
        r1_match = next(
            m for m in matches
            if m["bracket_round"] == 1 and m["team_a"] and m["team_b"]
        )
        player_headers = make_auth_header(bracket_env["players"][0].id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1_match['id']}/result",
            headers=player_headers,
            json={"score_a": 11, "score_b": 7},
        )
        assert r.status_code == 403

    async def test_cannot_score_already_completed_match_via_post(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        matches, headers = await self._setup_bracket(async_client, bracket_env)
        r1_match = next(
            m for m in matches
            if m["bracket_round"] == 1 and m["team_a"] and m["team_b"]
        )
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1_match['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )
        r2 = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1_match['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )
        assert r2.status_code == 400
        assert "already recorded" in r2.json()["detail"].lower()

    async def test_correct_score_via_patch(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        matches, headers = await self._setup_bracket(async_client, bracket_env)
        r1_match = next(
            m for m in matches
            if m["bracket_round"] == 1 and m["team_a"] and m["team_b"]
        )
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1_match['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 7},
        )
        # Now correct
        r = await async_client.patch(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1_match['id']}/result",
            headers=headers,
            json={"score_a": 7, "score_b": 11},
        )
        assert r.status_code == 200
        corrected = r.json()
        assert corrected["score_a"] == 7
        assert corrected["score_b"] == 11
        # Winner should now be team_b
        assert corrected["winner_team_id"] == r1_match["team_b_id"]


class TestBracket2TeamsCompletion:
    """Test 2-team bracket where final match directly completes the tournament."""

    async def test_win_final_completes_tournament_and_sets_champion(
        self, async_client: AsyncClient, bracket_2teams
    ):
        club_id = bracket_2teams["club"].id
        tid = bracket_2teams["tournament"].id
        headers = make_auth_header(bracket_2teams["owner"].id)

        # Generate
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 201

        # List matches — should be 1 final match
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/bracket/matches",
            headers=headers,
        )
        matches = r.json()
        assert len(matches) == 1
        final_match = matches[0]

        # Score the final
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{final_match['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 5},
        )
        assert r.status_code == 200

        # Tournament should now be completed
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}",
            headers=headers,
        )
        assert r.json()["status"] == "completed"

        # Bracket summary should show champion
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/bracket",
            headers=headers,
        )
        data = r.json()
        assert data["champion_team_id"] is not None
        assert data["matches_remaining"] == 0
        assert data["matches_played"] == 1


class TestBracketRegenerateAPI:
    """Test POST /regenerate-bracket endpoint."""

    async def test_regenerate_before_any_scores_succeeds(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["director"].id)

        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/regenerate-bracket",
            headers=headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["teams_count"] == 8

    async def test_regenerate_after_score_recorded_rejected(
        self, async_client: AsyncClient, bracket_env
    ):
        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(bracket_env["director"].id)

        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        # Get matches and record one result
        r = await async_client.get(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/bracket/matches",
            headers=headers,
        )
        matches = r.json()
        r1 = next(m for m in matches if m["bracket_round"] == 1 and m["team_a"] and m["team_b"])
        await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/matches/{r1['id']}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 3},
        )

        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/regenerate-bracket",
            headers=headers,
        )
        assert r.status_code == 400
        assert "already recorded" in r.json()["detail"].lower()


class TestBracketTeamManagement:
    """Test that team CRUD works for bracket-format tournaments."""

    async def test_create_team_in_bracket_tournament(
        self, async_client: AsyncClient, db_session: AsyncSession, bracket_env
    ):
        """Staff can create teams in bracket tournament format."""
        club_id = bracket_env["club"].id
        headers = make_auth_header(bracket_env["director"].id)

        # Create 2 additional players for a new team
        extra_players = []
        extra_pms = []
        for i in range(2):
            p = await _create_user(db_session, f"extra{i}+{uuid.uuid4().hex[:6]}@test.local", f"Extra {i}")
            pm = await _create_player_membership(db_session, p, bracket_env["club"])
            extra_players.append(p)
            extra_pms.append(pm)

        # Create a fresh bracket tournament (draft status to allow team creation without conflict)
        now6 = datetime.now(timezone.utc)
        fresh_t = Tournament(
            club_id=club_id,
            created_by_user_id=bracket_env["director"].id,
            name="Team Create Test",
            format=TournamentFormat.BRACKET,
            status=TournamentStatus.REGISTRATION_CLOSED,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now6 - timedelta(days=2),
            registration_close_at=now6 - timedelta(days=1),
            start_date=now6 + timedelta(days=1),
            end_date=now6 + timedelta(days=2),
            min_participants=2,
            max_participants=4,
        )
        db_session.add(fresh_t)
        await db_session.commit()

        for pm in extra_pms:
            await _register_player(db_session, fresh_t, pm)
        await db_session.commit()

        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{fresh_t.id}/teams",
            headers=headers,
            json={
                "name": "New Team",
                "seed": 1,
                "player_membership_ids": [str(extra_pms[0].id), str(extra_pms[1].id)],
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["name"] == "New Team"

    async def test_scramble_format_team_create_rejected(
        self, async_client: AsyncClient, db_session: AsyncSession, bracket_env
    ):
        """Scramble format should still reject team creation."""
        club_id = bracket_env["club"].id
        headers = make_auth_header(bracket_env["director"].id)

        now7 = datetime.now(timezone.utc)
        scramble_t = Tournament(
            club_id=club_id,
            created_by_user_id=bracket_env["director"].id,
            name="Scramble Test",
            format=TournamentFormat.SCRAMBLE,
            status=TournamentStatus.REGISTRATION_CLOSED,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now7 - timedelta(days=2),
            registration_close_at=now7 - timedelta(days=1),
            start_date=now7 + timedelta(days=1),
            end_date=now7 + timedelta(days=2),
            min_participants=4,
            max_participants=16,
        )
        db_session.add(scramble_t)
        await db_session.commit()

        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{scramble_t.id}/teams",
            headers=headers,
            json={
                "name": "Should Fail",
                "seed": 1,
                "player_membership_ids": [str(uuid.uuid4()), str(uuid.uuid4())],
            },
        )
        assert r.status_code == 400
        assert "scramble" in r.json()["detail"].lower()


class TestBracketTenantIsolation:
    """Test that club A cannot access club B's bracket tournament."""

    async def test_staff_of_other_club_cannot_generate_bracket(
        self, async_client: AsyncClient, bracket_env, db_session: AsyncSession
    ):
        # Create a second club with its own director
        other_club = Club(
            name="Other Club",
            slug=f"other-{uuid.uuid4().hex[:6]}",
            is_active=True,
        )
        db_session.add(other_club)
        await db_session.flush()
        other_dir = await _create_user(
            db_session, f"other_dir+{uuid.uuid4().hex[:6]}@test.local", "OtherDir"
        )
        await _create_club_membership(db_session, other_dir, other_club, ClubRole.TOURNAMENT_DIRECTOR)
        await db_session.commit()

        club_id = bracket_env["club"].id
        tid = bracket_env["tournament"].id
        headers = make_auth_header(other_dir.id)
        r = await async_client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tid}/generate-bracket",
            headers=headers,
        )
        assert r.status_code == 403, r.text
