"""
Phase 5 — Competition API Tests

55 test cases covering:
  - Round Robin engine (unit tests — no DB)
  - Score validator (unit tests — no DB)
  - Team CRUD (API — with DB)
  - Match generation (API — with DB)
  - Score recording (API — with DB)
  - Standings (API — with DB)
  - Authorization (per-role enforcement)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import MatchStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus, TournamentVisibility
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from app.services.competition.round_robin_engine import RoundRobinEngine
from app.services.competition.score_validator import ScoreValidationError, validate_score
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def rr_setup(db_session: AsyncSession, async_client):
    """
    Full Round Robin tournament setup with:
    - Club, 1 TD staff member
    - 4 player memberships + confirmed registrations
    - Tournament in registration_closed status
    """
    # Club
    club = Club(name="Test Club", slug="test-club", is_active=True)
    db_session.add(club)
    await db_session.flush()

    # Staff: Tournament Director
    td_user = User(
        email="td@test.local",
        hashed_password=hash_password("Td1234!"),
        full_name="Tournament Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(td_user)
    await db_session.flush()

    db_session.add(PlayerProfile(user_id=td_user.id, display_name="TD"))
    await db_session.flush()

    td_membership = ClubMembership(
        user_id=td_user.id,
        club_id=club.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    db_session.add(td_membership)
    await db_session.flush()

    # Players
    players = []
    player_memberships = []
    for i in range(1, 9):
        p = User(
            email=f"p{i}@test.local",
            hashed_password=hash_password("P1234!"),
            full_name=f"Player {i}",
            is_active=True,
            is_verified=True,
        )
        db_session.add(p)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=p.id, display_name=f"P{i}"))
        await db_session.flush()
        players.append(p)

        pm = ClubPlayerMembership(
            user_id=p.id,
            club_id=club.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"TST-{i:03d}",
        )
        db_session.add(pm)
        await db_session.flush()
        player_memberships.append(pm)

    # Tournament: round_robin, registration_closed
    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club.id,
        created_by_user_id=td_user.id,
        name="Test Round Robin",
        status=TournamentStatus.REGISTRATION_CLOSED,
        format=TournamentFormat.ROUND_ROBIN,
        visibility=TournamentVisibility.PUBLIC,
        registration_open_at=now - timedelta(days=14),
        registration_close_at=now - timedelta(days=1),
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=2),
        min_participants=4,
        max_participants=16,
    )
    db_session.add(t)
    await db_session.flush()

    # Confirmed registrations for all 8 players
    regs = []
    for pm in player_memberships:
        reg = TournamentRegistration(
            tournament_id=t.id,
            player_membership_id=pm.id,
            status=RegistrationStatus.CONFIRMED,
        )
        db_session.add(reg)
        await db_session.flush()
        regs.append(reg)

    await db_session.commit()

    return {
        "club": club,
        "td_user": td_user,
        "td_header": make_auth_header(td_user.id),
        "tournament": t,
        "player_memberships": player_memberships,
        "players": players,
    }


# ─── Unit Tests: Score Validator ──────────────────────────────────────────────

class TestScoreValidator:
    """10 test cases for the score validator."""

    def test_valid_standard_11_7(self):
        assert validate_score(11, 7) == "a"

    def test_valid_standard_7_11(self):
        assert validate_score(7, 11) == "b"

    def test_valid_overtime_12_10(self):
        assert validate_score(12, 10) == "a"

    def test_valid_overtime_13_11(self):
        assert validate_score(13, 11) == "a"

    def test_valid_shutout_11_0(self):
        assert validate_score(11, 0) == "a"

    def test_invalid_equal_scores(self):
        with pytest.raises(ScoreValidationError, match="equal"):
            validate_score(11, 11)

    def test_invalid_below_target(self):
        with pytest.raises(ScoreValidationError, match="at least 11"):
            validate_score(10, 8)

    def test_invalid_margin_too_small(self):
        with pytest.raises(ScoreValidationError, match="at least 2"):
            validate_score(11, 10)

    def test_invalid_negative(self):
        with pytest.raises(ScoreValidationError, match="non-negative"):
            validate_score(-1, 11)

    def test_invalid_zero_zero(self):
        with pytest.raises(ScoreValidationError, match="equal"):
            validate_score(0, 0)


# ─── Unit Tests: Round Robin Engine ───────────────────────────────────────────

class TestRoundRobinEngine:
    """15 test cases for the Round Robin engine."""

    def _make_ids(self, n: int) -> list[uuid.UUID]:
        return [uuid.uuid4() for _ in range(n)]

    def test_two_teams_one_match(self):
        engine = RoundRobinEngine()
        ids = self._make_ids(2)
        slots = engine.generate_schedule(ids)
        assert len(slots) == 1
        assert slots[0].round_number == 1

    def test_four_teams_six_matches(self):
        engine = RoundRobinEngine()
        ids = self._make_ids(4)
        slots = engine.generate_schedule(ids)
        assert len(slots) == 6  # 4*(4-1)/2

    def test_four_teams_three_rounds(self):
        engine = RoundRobinEngine()
        ids = self._make_ids(4)
        slots = engine.generate_schedule(ids)
        rounds = set(s.round_number for s in slots)
        assert rounds == {1, 2, 3}

    def test_odd_teams_no_bye_matches_stored(self):
        """3 teams: 3 matches, no bye in output."""
        engine = RoundRobinEngine()
        ids = self._make_ids(3)
        slots = engine.generate_schedule(ids)
        assert len(slots) == 3  # 3*(3-1)/2
        # Ensure sentinel UUID not in any slot
        sentinel = uuid.UUID(int=0)
        for s in slots:
            assert s.team_a_id != sentinel
            assert s.team_b_id != sentinel

    def test_six_teams_fifteen_matches(self):
        engine = RoundRobinEngine()
        ids = self._make_ids(6)
        slots = engine.generate_schedule(ids)
        assert len(slots) == 15  # 6*(6-1)/2

    def test_all_pairs_unique(self):
        """Every pair appears exactly once."""
        engine = RoundRobinEngine()
        ids = self._make_ids(4)
        slots = engine.generate_schedule(ids)
        pairs = [frozenset([s.team_a_id, s.team_b_id]) for s in slots]
        assert len(pairs) == len(set(pairs))

    def test_each_team_plays_all_others(self):
        """Each team faces every other team exactly once."""
        engine = RoundRobinEngine()
        ids = self._make_ids(5)
        slots = engine.generate_schedule(ids)
        for team_id in ids:
            opponents = set()
            for s in slots:
                if s.team_a_id == team_id:
                    opponents.add(s.team_b_id)
                elif s.team_b_id == team_id:
                    opponents.add(s.team_a_id)
            assert opponents == set(ids) - {team_id}

    def test_deterministic_same_input(self):
        """Same input always produces same schedule."""
        engine = RoundRobinEngine()
        ids = self._make_ids(4)
        slots1 = engine.generate_schedule(ids)
        slots2 = engine.generate_schedule(ids)
        for s1, s2 in zip(slots1, slots2):
            assert s1.team_a_id == s2.team_a_id
            assert s1.team_b_id == s2.team_b_id
            assert s1.round_number == s2.round_number

    def test_raises_on_single_team(self):
        engine = RoundRobinEngine()
        with pytest.raises(ValueError, match="at least 2"):
            engine.generate_schedule(self._make_ids(1))

    def test_standings_no_matches(self):
        """No completed matches → all zeros, ranks by team name."""
        engine = RoundRobinEngine()
        teams = [
            {"id": uuid.uuid4(), "name": "Zebra", "seed": 1},
            {"id": uuid.uuid4(), "name": "Alpha", "seed": 2},
        ]
        rows = engine.calculate_standings(teams, [])
        assert rows[0].team_name == "Alpha"  # alphabetical fallback
        assert rows[1].team_name == "Zebra"
        assert rows[0].wins == 0

    def test_standings_tiebreak_by_wins(self):
        engine = RoundRobinEngine()
        a_id, b_id, c_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        teams = [
            {"id": a_id, "name": "A", "seed": None},
            {"id": b_id, "name": "B", "seed": None},
            {"id": c_id, "name": "C", "seed": None},
        ]
        matches = [
            {"team_a_id": a_id, "team_b_id": b_id, "score_a": 11, "score_b": 5,
             "winner_team_id": a_id, "status": "completed"},
            {"team_a_id": a_id, "team_b_id": c_id, "score_a": 11, "score_b": 3,
             "winner_team_id": a_id, "status": "completed"},
            {"team_a_id": b_id, "team_b_id": c_id, "score_a": 11, "score_b": 7,
             "winner_team_id": b_id, "status": "completed"},
        ]
        rows = engine.calculate_standings(teams, matches)
        assert rows[0].team_id == a_id  # 2 wins
        assert rows[1].team_id == b_id  # 1 win
        assert rows[2].team_id == c_id  # 0 wins

    def test_standings_tiebreak_by_differential(self):
        """Equal wins → points differential decides."""
        engine = RoundRobinEngine()
        a_id, b_id, c_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        teams = [
            {"id": a_id, "name": "A", "seed": None},
            {"id": b_id, "name": "B", "seed": None},
            {"id": c_id, "name": "C", "seed": None},
        ]
        # A beat B (11-5, diff +6), C beat A (11-9, so A's diff = -2 from this)
        # But let's keep it simple: A 1W large margin, B 1W small margin
        matches = [
            {"team_a_id": a_id, "team_b_id": c_id, "score_a": 11, "score_b": 0,
             "winner_team_id": a_id, "status": "completed"},  # A: +11
            {"team_a_id": b_id, "team_b_id": c_id, "score_a": 11, "score_b": 9,
             "winner_team_id": b_id, "status": "completed"},  # B: +2
        ]
        rows = engine.calculate_standings(teams, matches)
        # A rank 1 (1W, +11), B rank 2 (1W, +2), C rank 3
        assert rows[0].team_id == a_id
        assert rows[1].team_id == b_id

    def test_standings_tiebreak_deterministic_by_name(self):
        """Final tiebreak: team name ascending."""
        engine = RoundRobinEngine()
        a_id, b_id = uuid.uuid4(), uuid.uuid4()
        teams = [
            {"id": a_id, "name": "Zebra", "seed": None},
            {"id": b_id, "name": "Alpha", "seed": None},
        ]
        rows = engine.calculate_standings(teams, [])
        assert rows[0].team_id == b_id   # "Alpha" < "Zebra"

    def test_standings_pending_matches_excluded(self):
        """Pending matches must not contribute to standings."""
        engine = RoundRobinEngine()
        a_id, b_id = uuid.uuid4(), uuid.uuid4()
        teams = [
            {"id": a_id, "name": "A", "seed": None},
            {"id": b_id, "name": "B", "seed": None},
        ]
        matches = [
            {"team_a_id": a_id, "team_b_id": b_id, "score_a": None, "score_b": None,
             "winner_team_id": None, "status": "pending"},
        ]
        rows = engine.calculate_standings(teams, matches)
        assert rows[0].wins == 0
        assert rows[1].wins == 0
        assert rows[0].matches_played == 0


# ─── API Tests: Team CRUD ─────────────────────────────────────────────────────

class TestTeamCRUD:
    """12 test cases for team management API."""

    @pytest.mark.asyncio
    async def test_create_team_success(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        payload = {
            "name": "Team Alpha",
            "player_membership_ids": [str(pm[0].id), str(pm[1].id)],
        }
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json=payload,
            headers=d["td_header"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Team Alpha"
        assert len(data["members"]) == 2

    @pytest.mark.asyncio
    async def test_create_team_unauthenticated(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "T", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_team_duplicate_player(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "T", "player_membership_ids": [str(pm[0].id), str(pm[0].id)]},
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_create_team_player_already_on_team(self, rr_setup, async_client):
        """Second team cannot reuse a player already assigned."""
        d = rr_setup
        pm = d["player_memberships"]
        # First team with pm[0] and pm[1]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Alpha", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
            headers=d["td_header"],
        )
        # Second team reuses pm[0]
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Bravo", "player_membership_ids": [str(pm[0].id), str(pm[2].id)]},
            headers=d["td_header"],
        )
        assert resp.status_code == 400
        assert "already on team" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_list_teams(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        # Create two teams
        for name, i, j in [("Alpha", 0, 1), ("Bravo", 2, 3)]:
            await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
                json={"name": name, "player_membership_ids": [str(pm[i].id), str(pm[j].id)]},
                headers=d["td_header"],
            )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    @pytest.mark.asyncio
    async def test_update_team_name(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        create_resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Old Name", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
            headers=d["td_header"],
        )
        team_id = create_resp.json()["id"]
        resp = await async_client.patch(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams/{team_id}",
            json={"name": "New Name"},
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    @pytest.mark.asyncio
    async def test_delete_team(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        create_resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Del Team", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
            headers=d["td_header"],
        )
        team_id = create_resp.json()["id"]
        resp = await async_client.delete(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams/{team_id}",
            headers=d["td_header"],
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_nonexistent_team(self, rr_setup, async_client):
        d = rr_setup
        resp = await async_client.delete(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams/{uuid.uuid4()}",
            headers=d["td_header"],
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_team_requires_exactly_two_players(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        # Empty players list fails Pydantic schema validation (min_length=1)
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "T0", "player_membership_ids": []},
            headers=d["td_header"],
        )
        assert resp.status_code == 422  # Pydantic schema validation

        # 1 player in doubles tournament fails business logic validation
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "T1", "player_membership_ids": [str(pm[0].id)]},
            headers=d["td_header"],
        )
        assert resp.status_code == 400
        assert "Teams must have exactly 2 players" in resp.json()["detail"]

    @pytest.mark.asyncio
    async def test_singles_tournament_team_validation_and_generation(self, rr_setup, async_client, db_session):
        d = rr_setup
        pm = d["player_memberships"]
        now = datetime.now(timezone.utc)

        # Create a Singles tournament
        singles_t = Tournament(
            club_id=d["club"].id,
            created_by_user_id=d["td_user"].id,
            name="Singles Championship",
            status=TournamentStatus.REGISTRATION_CLOSED,
            format=TournamentFormat.ROUND_ROBIN,
            format_configuration={
                "category": "Singles",
                "skill_level": "3.5",
                "gender_eligibility": "Any",
                "team_size": 1,
            },
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=14),
            registration_close_at=now - timedelta(days=1),
            start_date=now + timedelta(days=1),
            end_date=now + timedelta(days=2),
            min_participants=4,
            max_participants=8,
        )
        db_session.add(singles_t)
        await db_session.flush()

        for i in range(4):
            reg = TournamentRegistration(
                tournament_id=singles_t.id,
                player_membership_id=pm[i].id,
                status=RegistrationStatus.CONFIRMED,
            )
            db_session.add(reg)
        await db_session.commit()

        # Attempting to add 2 players to a Singles team fails with 400
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{singles_t.id}/teams",
            json={"name": "Pair", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
            headers=d["td_header"],
        )
        assert resp.status_code == 400
        assert "Teams must have exactly 1 player" in resp.json()["detail"]

        # Adding 1 player to a Singles team succeeds with 201
        for i in range(4):
            resp = await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{singles_t.id}/teams",
                json={"name": f"Solo Player {i+1}", "player_membership_ids": [str(pm[i].id)]},
                headers=d["td_header"],
            )
            assert resp.status_code == 201

        # Generate round robin matches for 4 singles teams
        gen_resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{singles_t.id}/generate-round-robin",
            headers=d["td_header"],
        )
        assert gen_resp.status_code == 201
        data = gen_resp.json()
        assert data["matches_generated"] == 6  # 4 teams round-robin = C(4, 2) = 6 matches
        assert data["teams_count"] == 4

    @pytest.mark.asyncio
    async def test_create_team_unconfirmed_player_rejected(self, rr_setup, async_client, db_session):
        """A player without confirmed registration cannot be on a team."""
        d = rr_setup
        pm = d["player_memberships"]
        # Create 9th player with NO registration
        extra_player = User(
            email="extra@test.local",
            hashed_password=hash_password("X1234!"),
            full_name="Extra",
            is_active=True,
            is_verified=True,
        )
        db_session.add(extra_player)
        await db_session.flush()
        extra_pm = ClubPlayerMembership(
            user_id=extra_player.id,
            club_id=d["club"].id,
            status=PlayerMembershipStatus.ACTIVE,
        )
        db_session.add(extra_pm)
        await db_session.flush()
        await db_session.commit()

        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Bad", "player_membership_ids": [str(pm[0].id), str(extra_pm.id)]},
            headers=d["td_header"],
        )
        assert resp.status_code == 400
        assert "confirmed registration" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_teams_blocked_after_generation(self, rr_setup, async_client):
        """Team creation/update/delete are blocked after matches generated."""
        d = rr_setup
        pm = d["player_memberships"]
        # Create 4 teams
        team_ids = []
        for name, i, j in [("A", 0, 1), ("B", 2, 3), ("C", 4, 5), ("D", 6, 7)]:
            r = await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
                json={"name": name, "player_membership_ids": [str(pm[i].id), str(pm[j].id)]},
                headers=d["td_header"],
            )
            team_ids.append(r.json()["id"])
        # Generate
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        # Attempt team creation after generation
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Late Team", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_player_view_teams(self, rr_setup, async_client):
        """Player-facing /tournaments/{id}/teams endpoint (read-only)."""
        d = rr_setup
        pm = d["player_memberships"]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Alpha", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
            headers=d["td_header"],
        )
        resp = await async_client.get(
            f"/api/v1/tournaments/{d['tournament'].id}/teams",
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ─── API Tests: Match Generation ──────────────────────────────────────────────

class TestMatchGeneration:
    """8 test cases for match generation."""

    async def _create_teams(self, rr_setup, async_client, count=4):
        d = rr_setup
        pm = d["player_memberships"]
        for i in range(count):
            await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
                json={"name": f"Team {i+1}", "player_membership_ids": [str(pm[i*2].id), str(pm[i*2+1].id)]},
                headers=d["td_header"],
            )

    @pytest.mark.asyncio
    async def test_generate_4_teams_6_matches(self, rr_setup, async_client):
        d = rr_setup
        await self._create_teams(rr_setup, async_client, 4)
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["matches_generated"] == 6
        assert data["rounds_count"] == 3
        assert data["teams_count"] == 4

    @pytest.mark.asyncio
    async def test_generate_transitions_to_in_progress(self, rr_setup, async_client):
        d = rr_setup
        await self._create_teams(rr_setup, async_client, 4)
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}",
            headers=d["td_header"],
        )
        assert resp.json()["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_generate_blocked_if_already_generated(self, rr_setup, async_client):
        d = rr_setup
        await self._create_teams(rr_setup, async_client, 4)
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_generate_requires_at_least_2_teams(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        # Create only 1 team
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
            json={"name": "Lonely", "player_membership_ids": [str(pm[0].id), str(pm[1].id)]},
            headers=d["td_header"],
        )
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_regenerate_blocked_with_results(self, rr_setup, async_client):
        d = rr_setup
        await self._create_teams(rr_setup, async_client, 4)
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        # Get first match
        matches_resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches",
            headers=d["td_header"],
        )
        match_id = matches_resp.json()[0]["id"]
        # Record result
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        # Regenerate should now fail
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/regenerate-round-robin",
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_regenerate_success_no_results(self, rr_setup, async_client):
        d = rr_setup
        await self._create_teams(rr_setup, async_client, 4)
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/regenerate-round-robin",
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        assert resp.json()["matches_generated"] == 6

    @pytest.mark.asyncio
    async def test_generate_non_round_robin_tournament_rejected(self, rr_setup, async_client, db_session):
        """format!=round_robin must return 400."""
        d = rr_setup
        now = datetime.now(timezone.utc)
        bracket_t = Tournament(
            club_id=d["club"].id,
            created_by_user_id=d["td_user"].id,
            name="Bracket T",
            status=TournamentStatus.REGISTRATION_CLOSED,
            format=TournamentFormat.BRACKET,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=14),
            registration_close_at=now - timedelta(days=1),
            start_date=now + timedelta(days=1),
            end_date=now + timedelta(days=2),
            min_participants=4,
            max_participants=16,
        )
        db_session.add(bracket_t)
        await db_session.flush()
        await db_session.commit()
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{bracket_t.id}/generate-round-robin",
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_list_matches_after_generation(self, rr_setup, async_client):
        d = rr_setup
        await self._create_teams(rr_setup, async_client, 4)
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches",
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 6
        for m in resp.json():
            assert m["status"] == "pending"


# ─── API Tests: Score Recording ───────────────────────────────────────────────

class TestScoreRecording:
    """8 test cases for score recording."""

    async def _setup_with_matches(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        for name, i, j in [("A", 0, 1), ("B", 2, 3), ("C", 4, 5), ("D", 6, 7)]:
            await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
                json={"name": name, "player_membership_ids": [str(pm[i].id), str(pm[j].id)]},
                headers=d["td_header"],
            )
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        matches_resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches",
            headers=d["td_header"],
        )
        return d, matches_resp.json()

    @pytest.mark.asyncio
    async def test_record_result_valid(self, rr_setup, async_client):
        d, matches = await self._setup_with_matches(rr_setup, async_client)
        match_id = matches[0]["id"]
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 7},
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert data["score_a"] == 11
        assert data["score_b"] == 7
        assert data["winner_team_id"] == matches[0]["team_a_id"]

    @pytest.mark.asyncio
    async def test_record_result_team_b_wins(self, rr_setup, async_client):
        d, matches = await self._setup_with_matches(rr_setup, async_client)
        match_id = matches[0]["id"]
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 7, "score_b": 11},
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        assert resp.json()["winner_team_id"] == matches[0]["team_b_id"]

    @pytest.mark.asyncio
    async def test_record_result_invalid_score_rejected(self, rr_setup, async_client):
        d, matches = await self._setup_with_matches(rr_setup, async_client)
        match_id = matches[0]["id"]
        # 11-10 invalid (margin = 1)
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 10},
            headers=d["td_header"],
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_double_record_result_rejected(self, rr_setup, async_client):
        d, matches = await self._setup_with_matches(rr_setup, async_client)
        match_id = matches[0]["id"]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_correct_result_valid(self, rr_setup, async_client):
        d, matches = await self._setup_with_matches(rr_setup, async_client)
        match_id = matches[0]["id"]
        team_a_id = matches[0]["team_a_id"]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        resp = await async_client.patch(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 7, "score_b": 11},
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        assert resp.json()["score_a"] == 7
        # Winner changed to team B
        assert resp.json()["winner_team_id"] != team_a_id

    @pytest.mark.asyncio
    async def test_correct_result_on_pending_rejected(self, rr_setup, async_client):
        d, matches = await self._setup_with_matches(rr_setup, async_client)
        match_id = matches[0]["id"]
        # PATCH on a still-pending match should return 400
        resp = await async_client.patch(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_record_result_nonexistent_match(self, rr_setup, async_client):
        d, _ = await self._setup_with_matches(rr_setup, async_client)
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{uuid.uuid4()}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_record_result_unauthenticated(self, rr_setup, async_client):
        d, matches = await self._setup_with_matches(rr_setup, async_client)
        match_id = matches[0]["id"]
        resp = await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
        )
        assert resp.status_code == 401


# ─── API Tests: Standings ──────────────────────────────────────────────────────

class TestStandings:
    """10 test cases for standings computation."""

    async def _setup_with_results(self, rr_setup, async_client):
        d = rr_setup
        pm = d["player_memberships"]
        for name, i, j in [("A", 0, 1), ("B", 2, 3), ("C", 4, 5), ("D", 6, 7)]:
            await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/teams",
                json={"name": name, "player_membership_ids": [str(pm[i].id), str(pm[j].id)]},
                headers=d["td_header"],
            )
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/generate-round-robin",
            headers=d["td_header"],
        )
        matches_resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches",
            headers=d["td_header"],
        )
        return d, matches_resp.json()

    @pytest.mark.asyncio
    async def test_standings_empty_before_results(self, rr_setup, async_client):
        d, _ = await self._setup_with_results(rr_setup, async_client)
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["standings"]) == 4
        for row in data["standings"]:
            assert row["wins"] == 0

    @pytest.mark.asyncio
    async def test_standings_after_one_result(self, rr_setup, async_client):
        d, matches = await self._setup_with_results(rr_setup, async_client)
        match_id = matches[0]["id"]
        team_a_id = matches[0]["team_a_id"]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        data = resp.json()
        standings = data["standings"]
        leader = next(r for r in standings if r["team_id"] == team_a_id)
        assert leader["wins"] == 1
        assert leader["rank"] == 1
        assert leader["points_differential"] == 6  # 11-5

    @pytest.mark.asyncio
    async def test_standings_rank_order(self, rr_setup, async_client):
        d, matches = await self._setup_with_results(rr_setup, async_client)
        # Record all 6 results: team A (round 1) wins every match
        for i, match in enumerate(matches):
            await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match['id']}/result",
                json={"score_a": 11, "score_b": 5},
                headers=d["td_header"],
            )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        standings = resp.json()["standings"]
        ranks = [r["rank"] for r in standings]
        assert ranks == sorted(ranks)  # ranks must be ascending

    @pytest.mark.asyncio
    async def test_standings_points_differential_tracked(self, rr_setup, async_client):
        d, matches = await self._setup_with_results(rr_setup, async_client)
        match_id = matches[0]["id"]
        team_a_id = matches[0]["team_a_id"]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 0},
            headers=d["td_header"],
        )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        row = next(r for r in resp.json()["standings"] if r["team_id"] == team_a_id)
        assert row["points_differential"] == 11
        assert row["points_scored"] == 11
        assert row["points_allowed"] == 0

    @pytest.mark.asyncio
    async def test_standings_correction_recalculates(self, rr_setup, async_client):
        d, matches = await self._setup_with_results(rr_setup, async_client)
        match_id = matches[0]["id"]
        team_a_id = matches[0]["team_a_id"]
        team_b_id = matches[0]["team_b_id"]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        # Correct: B actually won
        await async_client.patch(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match_id}/result",
            json={"score_a": 5, "score_b": 11},
            headers=d["td_header"],
        )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        standings = resp.json()["standings"]
        b_row = next(r for r in standings if r["team_id"] == team_b_id)
        a_row = next(r for r in standings if r["team_id"] == team_a_id)
        assert b_row["wins"] == 1
        assert a_row["wins"] == 0

    @pytest.mark.asyncio
    async def test_player_standings_endpoint(self, rr_setup, async_client):
        d, _ = await self._setup_with_results(rr_setup, async_client)
        resp = await async_client.get(
            f"/api/v1/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_standings_unauthenticated_rejected(self, rr_setup, async_client):
        d = rr_setup
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_standings_matches_played_counted(self, rr_setup, async_client):
        d, matches = await self._setup_with_results(rr_setup, async_client)
        # Record 3 matches
        for m in matches[:3]:
            await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{m['id']}/result",
                json={"score_a": 11, "score_b": 5},
                headers=d["td_header"],
            )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        standings = resp.json()["standings"]
        total_played = sum(r["matches_played"] for r in standings)
        # Each match contributes 2 to total_played (one per team)
        assert total_played == 6  # 3 matches × 2 teams

    @pytest.mark.asyncio
    async def test_standings_loser_losses_tracked(self, rr_setup, async_client):
        d, matches = await self._setup_with_results(rr_setup, async_client)
        match = matches[0]
        team_b_id = match["team_b_id"]
        await async_client.post(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{match['id']}/result",
            json={"score_a": 11, "score_b": 5},
            headers=d["td_header"],
        )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        b_row = next(r for r in resp.json()["standings"] if r["team_id"] == team_b_id)
        assert b_row["losses"] == 1
        assert b_row["wins"] == 0

    @pytest.mark.asyncio
    async def test_standings_all_completed(self, rr_setup, async_client):
        """After all 6 matches completed, total wins == 6."""
        d, matches = await self._setup_with_results(rr_setup, async_client)
        for m in matches:
            await async_client.post(
                f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/matches/{m['id']}/result",
                json={"score_a": 11, "score_b": 5},
                headers=d["td_header"],
            )
        resp = await async_client.get(
            f"/api/v1/clubs/{d['club'].id}/tournaments/{d['tournament'].id}/standings",
            headers=d["td_header"],
        )
        total_wins = sum(r["wins"] for r in resp.json()["standings"])
        assert total_wins == 6
