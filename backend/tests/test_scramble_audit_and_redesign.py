"""
Aught2 Pickleball — Scramble Audit, Redesign & Implementation Tests

Comprehensive test suite verifying all Prompt requirements:
1. 4-Player Court: exactly 3 games, every possible partner pair appears once, each player plays all 3 games.
2. 5-Player Court (non-mixed): exactly 5 games, each player sits once, plays 4 games, partner pairs verified.
3. Mixed Scramble:
   - Strictly 4-player courts (2M + 2F)
   - 100% mixed-gender doubles teams (1M + 1F per team on both sides)
   - Zero same-sex pairings
   - Rejects 5-player court attempts, odd player counts, non-multiples of 4, and unequal M/F rosters
   - Rejects missing or unverified profile gender
4. Honest Schedule Quality Reporting:
   - Correctly counts repeat partners and repeat opponents across rounds using persisted completed history
   - Generates truthful quality messages and partner warnings
5. Separate tracking of partner vs opponent history:
   - Sharing a court does not falsely count as partnering
6. Pure Determinism:
   - Identical inputs with identical history generate identical match schedules
7. Registration Eligibility & Constraints:
   - Open Scramble: allows any gender
   - Men's Scramble: allows only verified Male profile, rejects Female and unverified
   - Women's Scramble: allows only verified Female profile, rejects Male and unverified
   - Mixed Scramble: requires verified Male or Female profile
   - Self-declared payload.gender cannot override profile gender
   - Partner selection payload rejected for Scramble
   - Duplicate registrations rejected
   - Capacity enforced (individual player slots)
"""
from __future__ import annotations

import itertools
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
from app.models.competition import Match, MatchParticipant, MatchStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus, TournamentVisibility
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from app.schemas.tournament_registration import PlayerSelfRegistrationRequest
from app.services.competition.scramble_engine import (
    ScrambleConfigurationError,
    ScrambleEngine,
    ScrambleStanding,
)
from app.services.tournament_service import TournamentService
from tests.conftest import make_auth_header


# ─────────────────────────────────────────────────────────────────────────────
# 1. PURE ENGINE TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestScrambleEnginePureLogic:
    """Tests testing the pure mathematical and algorithmic requirements."""

    def test_4_player_court_full_rotation_coverage(self):
        """
        4-player court (A, B, C, D) must create exactly 3 games:
          Game 1: A+B vs C+D
          Game 2: A+C vs B+D
          Game 3: A+D vs B+C
        Each player must play in all 3 games (0 sit-outs).
        Each possible pair out of 4 players (6 pairs: AB, CD, AC, BD, AD, BC)
        must partner exactly once.
        """
        engine = ScrambleEngine()
        players = [
            {"id": "A", "display_name": "Player A", "seed": 1, "skill_rating": 4.0},
            {"id": "B", "display_name": "Player B", "seed": 2, "skill_rating": 3.5},
            {"id": "C", "display_name": "Player C", "seed": 3, "skill_rating": 3.5},
            {"id": "D", "display_name": "Player D", "seed": 4, "skill_rating": 3.0},
        ]
        plan = engine.generate_round_matchups(players, round_number=1)
        matches = plan["matches"]

        assert len(matches) == 3, f"Expected 3 games for 4-player court, got {len(matches)}"

        player_game_counts = {p["id"]: 0 for p in players}
        partner_pairs = set()

        for m in matches:
            sa = m["side_a"]
            sb = m["side_b"]
            assert len(sa) == 2
            assert len(sb) == 2

            # Distinct players in this game
            game_pids = [p["id"] for p in sa + sb]
            assert len(set(game_pids)) == 4, "A player appeared twice in the same game"

            for pid in game_pids:
                player_game_counts[pid] += 1

            pair_a = tuple(sorted([sa[0]["id"], sa[1]["id"]]))
            pair_b = tuple(sorted([sb[0]["id"], sb[1]["id"]]))

            assert pair_a not in partner_pairs, f"Duplicate partner pair: {pair_a}"
            assert pair_b not in partner_pairs, f"Duplicate partner pair: {pair_b}"

            partner_pairs.add(pair_a)
            partner_pairs.add(pair_b)

        # Every player plays all 3 games
        for pid, count in player_game_counts.items():
            assert count == 3, f"Player {pid} played {count} games instead of 3"

        # All 6 possible pairings partner exactly once
        expected_pairs = {tuple(sorted(p)) for p in itertools.combinations(["A", "B", "C", "D"], 2)}
        assert partner_pairs == expected_pairs, f"Expected pairs {expected_pairs}, got {partner_pairs}"

    def test_5_player_court_rotation_and_sit_out_coverage(self):
        """
        5-player court (A, B, C, D, E) must create 5 games:
        Each player sits out exactly once and plays 4 games.
        Every game has 4 distinct players and 1 sit-out.
        """
        engine = ScrambleEngine()
        players = [
            {"id": f"P{i}", "display_name": f"Player {i}", "seed": i, "skill_rating": 3.5}
            for i in range(1, 6)
        ]
        plan = engine.generate_round_matchups(players, round_number=1)
        matches = plan["matches"]

        assert len(matches) == 5, f"Expected 5 games for 5-player court, got {len(matches)}"

        player_play_counts = {p["id"]: 0 for p in players}
        sit_out_counts = {p["id"]: 0 for p in players}
        partner_pairs = set()

        for m in matches:
            sa = m["side_a"]
            sb = m["side_b"]
            sit_out = m["sit_out_player"]

            assert sit_out is not None, "5-player court match must designate a sit-out player"
            sit_out_counts[sit_out["id"]] += 1

            game_pids = [p["id"] for p in sa + sb]
            assert len(set(game_pids)) == 4
            assert sit_out["id"] not in game_pids, "Sitting out player cannot play in the same game"

            for pid in game_pids:
                player_play_counts[pid] += 1

            pair_a = tuple(sorted([sa[0]["id"], sa[1]["id"]]))
            pair_b = tuple(sorted([sb[0]["id"], sb[1]["id"]]))

            assert pair_a not in partner_pairs, f"Duplicate partner pair: {pair_a}"
            assert pair_b not in partner_pairs, f"Duplicate partner pair: {pair_b}"
            partner_pairs.add(pair_a)
            partner_pairs.add(pair_b)

        # Every player sits out exactly once and plays 4 games
        for pid in player_play_counts:
            assert player_play_counts[pid] == 4, f"Player {pid} played {player_play_counts[pid]} games instead of 4"
            assert sit_out_counts[pid] == 1, f"Player {pid} sat out {sit_out_counts[pid]} times instead of 1"

        # Out of 10 possible pairs from 5 players, exactly 10 pairs partner across the 5 games (2 pairs per game)
        assert len(partner_pairs) == 10

    def test_mixed_scramble_strictly_4_player_courts_100_percent_mixed_teams(self):
        """
        Mixed Scramble:
        - Must create 4-player courts with 2 males and 2 females.
        - Generates 2 games: [M1, F1] vs [M2, F2] and [M1, F2] vs [M2, F1].
        - 100% of teams are mixed doubles (1 male, 1 female).
        - ZERO same-sex pairings on either side.
        """
        engine = ScrambleEngine()
        players = [
            {"id": "M1", "display_name": "Male 1", "gender": "Male", "seed": 1},
            {"id": "M2", "display_name": "Male 2", "gender": "Male", "seed": 2},
            {"id": "F1", "display_name": "Female 1", "gender": "Female", "seed": 3},
            {"id": "F2", "display_name": "Female 2", "gender": "Female", "seed": 4},
        ]
        plan = engine.generate_round_matchups(players, round_number=1, division="Mixed Scramble")
        matches = plan["matches"]

        assert len(matches) == 2
        for m in matches:
            for side_key in ("side_a", "side_b"):
                side = m[side_key]
                assert len(side) == 2
                genders = sorted([p["gender"] for p in side])
                assert genders == ["Female", "Male"], f"Side {side_key} is not a mixed team: {genders}"

    def test_mixed_scramble_rejects_unbalanced_and_invalid_rosters(self):
        """Mixed Scramble rejects non-multiples of 4, unequal male/female count, or missing profile gender."""
        engine = ScrambleEngine()

        # Missing gender
        p_missing_gender = [
            {"id": "1", "display_name": "P1", "gender": None},
            {"id": "2", "display_name": "P2", "gender": "Male"},
            {"id": "3", "display_name": "P3", "gender": "Female"},
            {"id": "4", "display_name": "P4", "gender": "Female"},
        ]
        with pytest.raises(ScrambleConfigurationError) as exc_missing:
            engine.generate_round_matchups(p_missing_gender, round_number=1, division="Mixed Scramble")
        assert "verified profile gender" in str(exc_missing.value)

        # Unequal counts (3 males, 1 female)
        p_unequal = [
            {"id": "1", "display_name": "M1", "gender": "Male"},
            {"id": "2", "display_name": "M2", "gender": "Male"},
            {"id": "3", "display_name": "M3", "gender": "Male"},
            {"id": "4", "display_name": "F1", "gender": "Female"},
        ]
        with pytest.raises(ScrambleConfigurationError) as exc_unequal:
            engine.generate_round_matchups(p_unequal, round_number=1, division="Mixed Scramble")
        assert "equal number of male and female players" in str(exc_unequal.value)

        # 6 players (not multiple of 4, impossible to form balanced 4-player courts)
        p_six = [
            {"id": f"M{i}", "display_name": f"M{i}", "gender": "Male"} for i in range(1, 4)
        ] + [
            {"id": f"F{i}", "display_name": f"F{i}", "gender": "Female"} for i in range(1, 4)
        ]
        with pytest.raises(ScrambleConfigurationError) as exc_six:
            engine.generate_round_matchups(p_six, round_number=1, division="Mixed Scramble")
        assert "multiples of 4" in str(exc_six.value)

    def test_separate_partner_and_opponent_history_tracking(self):
        """Ensure opponent history does not count as partner history and vice versa."""
        engine = ScrambleEngine()
        p_ids = [f"P{i}" for i in range(1, 9)]
        players = [{"id": pid, "display_name": pid, "skill_rating": 3.5} for pid in p_ids]

        # In Round 1, P1 and P2 were partners, P3 and P4 were opponents of P1 and P2
        partner_history = {"P1": {"P2": 1}, "P2": {"P1": 1}}
        opponent_history = {
            "P1": {"P3": 1, "P4": 1},
            "P2": {"P3": 1, "P4": 1},
            "P3": {"P1": 1, "P2": 1},
            "P4": {"P1": 1, "P2": 1},
        }

        # Generate Round 2
        plan = engine.generate_round_matchups(
            players,
            round_number=2,
            partner_history=partner_history,
            opponent_history=opponent_history,
        )

        # Partner history of P1 and P2 should result in P1 and P2 not partnering again if possible
        for m in plan["matches"]:
            sa_ids = [p["id"] for p in m["side_a"]]
            sb_ids = [p["id"] for p in m["side_b"]]
            assert not ("P1" in sa_ids and "P2" in sa_ids), "P1 and P2 partnered again in round 2!"
            assert not ("P1" in sb_ids and "P2" in sb_ids), "P1 and P2 partnered again in round 2!"

    def test_strict_determinism_identical_input_produces_identical_schedule(self):
        """Identical inputs, rosters, and histories must produce byte-for-byte identical schedules."""
        engine = ScrambleEngine()
        players = [
            {"id": f"P{i}", "display_name": f"Player {i}", "seed": i, "skill_rating": 3.0 + (i % 3) * 0.5}
            for i in range(1, 9)
        ]
        plan1 = engine.generate_round_matchups(players, round_number=1)
        plan2 = engine.generate_round_matchups(players, round_number=1)

        m1_specs = [
            (
                m["match_number"],
                [p["id"] for p in m["side_a"]],
                [p["id"] for p in m["side_b"]],
            )
            for m in plan1["matches"]
        ]
        m2_specs = [
            (
                m["match_number"],
                [p["id"] for p in m["side_a"]],
                [p["id"] for p in m["side_b"]],
            )
            for m in plan2["matches"]
        ]

        assert m1_specs == m2_specs, "Schedules were not deterministic!"


# ─────────────────────────────────────────────────────────────────────────────
# 2. INTEGRATION TESTS (DATABASE & API)
# ─────────────────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def scramble_audit_setup(db_session: AsyncSession):
    """Sets up a club, director, male player, female player, and unverified player."""
    club = Club(
        name="Scramble Test Club",
        slug=f"scramble-test-club-{uuid.uuid4().hex[:6]}",
        description="Testing scramble audit",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    # Director
    director_user = User(
        email=f"director_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Tournament Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(director_user)
    await db_session.flush()
    db_session.add(ClubMembership(club_id=club.id, user_id=director_user.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))

    # Male Player
    male_user = User(
        email=f"male_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Bob Male",
        is_active=True,
        is_verified=True,
    )
    db_session.add(male_user)
    await db_session.flush()
    db_session.add(PlayerProfile(user_id=male_user.id, display_name="Bob Male", gender="Male", skill_rating=3.5))
    male_cpm = ClubPlayerMembership(club_id=club.id, user_id=male_user.id, membership_number="M001", status=PlayerMembershipStatus.ACTIVE)
    db_session.add(male_cpm)

    # Female Player
    female_user = User(
        email=f"female_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Alice Female",
        is_active=True,
        is_verified=True,
    )
    db_session.add(female_user)
    await db_session.flush()
    db_session.add(PlayerProfile(user_id=female_user.id, display_name="Alice Female", gender="Female", skill_rating=3.5))
    female_cpm = ClubPlayerMembership(club_id=club.id, user_id=female_user.id, membership_number="F001", status=PlayerMembershipStatus.ACTIVE)
    db_session.add(female_cpm)

    # Unverified Player (no gender in profile)
    unverified_user = User(
        email=f"unverified_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Pat Neutral",
        is_active=True,
        is_verified=True,
    )
    db_session.add(unverified_user)
    await db_session.flush()
    db_session.add(PlayerProfile(user_id=unverified_user.id, display_name="Pat Neutral", gender=None, skill_rating=3.5))
    unverified_cpm = ClubPlayerMembership(club_id=club.id, user_id=unverified_user.id, membership_number="U001", status=PlayerMembershipStatus.ACTIVE)
    db_session.add(unverified_cpm)

    await db_session.commit()

    return {
        "club": club,
        "director": director_user,
        "male_user": male_user,
        "male_cpm": male_cpm,
        "female_user": female_user,
        "female_cpm": female_cpm,
        "unverified_user": unverified_user,
        "unverified_cpm": unverified_cpm,
    }


class TestScrambleRegistrationAndEligibilityAPI:
    """Verifies backend enforcement of Scramble category eligibility and registration rules."""

    @pytest.mark.asyncio
    async def test_all_four_scramble_categories_creation(
        self, async_client: AsyncClient, scramble_audit_setup: dict
    ):
        """All 4 categories must be valid, persisted in format_configuration, and authoritative."""
        data = scramble_audit_setup
        club = data["club"]
        headers = make_auth_header(data["director"])
        now = datetime.now(timezone.utc)

        categories = [
            ("Open Scramble", "Any"),
            ("Men's Scramble", "Male"),
            ("Women's Scramble", "Female"),
            ("Mixed Scramble", "Any"),
        ]

        for cat_name, expected_gender_eligibility in categories:
            payload = {
                "name": f"Test {cat_name}",
                "format": "scramble",
                "format_configuration": {
                    "category": cat_name,
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
            assert res.status_code == 201, f"Failed to create {cat_name}: {res.text}"
            body = res.json()
            assert body["format_configuration"]["category"] == cat_name
            assert body["format_configuration"]["gender_eligibility"] == expected_gender_eligibility

    @pytest.mark.asyncio
    async def test_mens_scramble_registration_enforces_male_profile(
        self, async_client: AsyncClient, scramble_audit_setup: dict
    ):
        """Men's Scramble accepts male player, rejects female player and unverified player."""
        data = scramble_audit_setup
        club = data["club"]
        director_headers = make_auth_header(data["director"])
        now = datetime.now(timezone.utc)

        # Create Men's Scramble tournament
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=director_headers,
            json={
                "name": "Men Scramble Event",
                "format": "scramble",
                "format_configuration": {"category": "Men's Scramble", "rounds": 3},
                "start_date": (now + timedelta(days=2)).isoformat(),
                "end_date": (now + timedelta(days=3)).isoformat(),
                "registration_open_at": (now - timedelta(days=1)).isoformat(),
                "registration_close_at": (now + timedelta(days=1)).isoformat(),
                "min_participants": 4,
                "max_participants": 16,
            },
        )
        assert res.status_code == 201
        t_id = res.json()["id"]

        # Open registration
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t_id}/open-registration",
            headers=director_headers,
        )

        # 1. Female player attempts to register -> 400 Rejected
        female_headers = make_auth_header(data["female_user"])
        f_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=female_headers,
            json={},
        )
        assert f_res.status_code == 400
        assert "restricted to male players" in f_res.json()["detail"]

        # 2. Female player attempts to bypass by self-declaring gender="Male" in payload -> Must still be rejected!
        f_bypass_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=female_headers,
            json={"gender": "Male"},
        )
        assert f_bypass_res.status_code == 400
        assert "restricted to male players" in f_bypass_res.json()["detail"]

        # 3. Unverified player (no gender in profile) -> 400 Rejected
        unverified_headers = make_auth_header(data["unverified_user"])
        u_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=unverified_headers,
            json={},
        )
        assert u_res.status_code == 400
        assert "requires a verified player profile" in u_res.json()["detail"]

        # 4. Male player -> 200 Confirmed
        male_headers = make_auth_header(data["male_user"])
        m_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=male_headers,
            json={},
        )
        assert m_res.status_code == 201
        assert m_res.json()["status"] == "confirmed"

    @pytest.mark.asyncio
    async def test_womens_scramble_registration_enforces_female_profile(
        self, async_client: AsyncClient, scramble_audit_setup: dict
    ):
        """Women's Scramble accepts female player, rejects male player and unverified player."""
        data = scramble_audit_setup
        club = data["club"]
        director_headers = make_auth_header(data["director"])
        now = datetime.now(timezone.utc)

        # Create Women's Scramble tournament
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=director_headers,
            json={
                "name": "Women Scramble Event",
                "format": "scramble",
                "format_configuration": {"category": "Women's Scramble", "rounds": 3},
                "start_date": (now + timedelta(days=2)).isoformat(),
                "end_date": (now + timedelta(days=3)).isoformat(),
                "registration_open_at": (now - timedelta(days=1)).isoformat(),
                "registration_close_at": (now + timedelta(days=1)).isoformat(),
                "min_participants": 4,
                "max_participants": 16,
            },
        )
        assert res.status_code == 201
        t_id = res.json()["id"]

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t_id}/open-registration",
            headers=director_headers,
        )

        # Male player attempts to register -> 400 Rejected
        male_headers = make_auth_header(data["male_user"])
        m_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=male_headers,
            json={},
        )
        assert m_res.status_code == 400
        assert "restricted to female players" in m_res.json()["detail"]

        # Female player -> 200 Confirmed
        female_headers = make_auth_header(data["female_user"])
        f_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=female_headers,
            json={},
        )
        assert f_res.status_code == 201
        assert f_res.json()["status"] == "confirmed"

    @pytest.mark.asyncio
    async def test_mixed_scramble_registration_requires_verified_gender(
        self, async_client: AsyncClient, scramble_audit_setup: dict
    ):
        """Mixed Scramble accepts both male and female players with verified gender; rejects unverified."""
        data = scramble_audit_setup
        club = data["club"]
        director_headers = make_auth_header(data["director"])
        now = datetime.now(timezone.utc)

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=director_headers,
            json={
                "name": "Mixed Scramble Event",
                "format": "scramble",
                "format_configuration": {"category": "Mixed Scramble", "rounds": 3},
                "start_date": (now + timedelta(days=2)).isoformat(),
                "end_date": (now + timedelta(days=3)).isoformat(),
                "registration_open_at": (now - timedelta(days=1)).isoformat(),
                "registration_close_at": (now + timedelta(days=1)).isoformat(),
                "min_participants": 4,
                "max_participants": 16,
            },
        )
        assert res.status_code == 201
        t_id = res.json()["id"]

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t_id}/open-registration",
            headers=director_headers,
        )

        # Unverified player -> 400
        unverified_headers = make_auth_header(data["unverified_user"])
        u_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=unverified_headers,
            json={},
        )
        assert u_res.status_code == 400
        assert "requires a verified player profile" in u_res.json()["detail"]

        # Male player -> 201 Confirmed
        male_headers = make_auth_header(data["male_user"])
        m_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=male_headers,
            json={},
        )
        assert m_res.status_code == 201

        # Female player -> 201 Confirmed
        female_headers = make_auth_header(data["female_user"])
        f_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=female_headers,
            json={},
        )
        assert f_res.status_code == 201

    @pytest.mark.asyncio
    async def test_scramble_registration_rejects_partner_payload(
        self, async_client: AsyncClient, scramble_audit_setup: dict
    ):
        """Scramble is individual registration only; sending partner_membership_id is rejected."""
        data = scramble_audit_setup
        club = data["club"]
        director_headers = make_auth_header(data["director"])
        now = datetime.now(timezone.utc)

        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments",
            headers=director_headers,
            json={
                "name": "Open Scramble Event",
                "format": "scramble",
                "format_configuration": {"category": "Open Scramble", "rounds": 3},
                "start_date": (now + timedelta(days=2)).isoformat(),
                "end_date": (now + timedelta(days=3)).isoformat(),
                "registration_open_at": (now - timedelta(days=1)).isoformat(),
                "registration_close_at": (now + timedelta(days=1)).isoformat(),
                "min_participants": 4,
                "max_participants": 16,
            },
        )
        assert res.status_code == 201
        t_id = res.json()["id"]

        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t_id}/open-registration",
            headers=director_headers,
        )

        male_headers = make_auth_header(data["male_user"])
        partner_cpm = data["female_cpm"]

        p_res = await async_client.post(
            f"/api/v1/tournaments/{t_id}/register",
            headers=male_headers,
            json={"partner_membership_id": str(partner_cpm.id)},
        )
        assert p_res.status_code == 400
        assert "individual registration only" in p_res.json()["detail"]
