"""
Aught2 Pickleball — Finite Scramble Tournament Tests

Verifies:
1. Recommendation logic for Open/Men/Women vs. Mixed Scramble
2. Honest partner and opponent coverage metric calculations
3. Strict finite round boundary enforcement (rejecting round increment past planned_rounds)
4. Player availability automatic carry-forward between rounds
5. Authoritative planned_rounds API configuration
6. Accurate differentiation of round progress from tournament progress
7. Final tournament conclusion and champion crowning
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
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus, TournamentVisibility
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from app.schemas.competition import ScrambleAvailabilityRequest, MatchResultRequest
from app.services.competition.scramble_engine import (
    ScrambleEngine,
    calculate_overall_coverage,
    calculate_recommended_rounds,
)
from app.services.competition_service import CompetitionService
from tests.conftest import make_auth_header


# ─────────────────────────────────────────────────────────────────────────────
# 1. PURE ENGINE TESTS: Recommendations & Coverage
# ─────────────────────────────────────────────────────────────────────────────

class TestScrambleRecommendationAndCoverage:
    def test_calculate_recommended_rounds_open(self):
        """
        In Open Scramble, a 4-player court produces 3 games, so each player has 3 partner slots per round.
        With N=16 players, each player has 15 possible partners.
        ceil(15 / 3) = 5 rounds.
        """
        rec_16 = calculate_recommended_rounds(player_count=16, division="Open Scramble", courts_count=4)
        assert rec_16["recommended_rounds"] == 5
        assert rec_16["partner_slots_per_round"] == 3
        assert rec_16["possible_partners_per_player"] == 15
        assert "5 rounds" in rec_16["reason"]

        # N=8 players -> 7 possible partners -> ceil(7 / 3) = 3 rounds
        rec_8 = calculate_recommended_rounds(player_count=8, division="Open Scramble", courts_count=2)
        assert rec_8["recommended_rounds"] == 3

        # N=12 players -> 11 possible partners -> ceil(11 / 3) = 4 rounds
        rec_12 = calculate_recommended_rounds(player_count=12, division="Men's Scramble", courts_count=3)
        assert rec_12["recommended_rounds"] == 4

    def test_calculate_recommended_rounds_mixed(self):
        """
        In Mixed Scramble, a balanced 4-player court (2M + 2F) produces 2 mixed games per round.
        With N=16 players (8 men, 8 women), each player has 8 possible partners of opposite gender.
        ceil(8 / 2) = 4 rounds.
        """
        rec_mixed_16 = calculate_recommended_rounds(player_count=16, division="Mixed Scramble", courts_count=4)
        assert rec_mixed_16["recommended_rounds"] == 4
        assert rec_mixed_16["partner_slots_per_round"] == 2
        assert rec_mixed_16["possible_partners_per_player"] == 8
        assert "4 rounds" in rec_mixed_16["reason"]

        # N=8 players -> 4 possible opposite-gender partners -> ceil(4 / 2) = 2 rounds
        rec_mixed_8 = calculate_recommended_rounds(player_count=8, division="Mixed Scramble", courts_count=2)
        assert rec_mixed_8["recommended_rounds"] == 2

    def test_coverage_calculation_honesty(self):
        """
        Verifies calculate_overall_coverage accurately measures unique partners,
        repeat counts, and never claims full coverage if incomplete.
        """
        players = [
            {"id": f"P{i}", "display_name": f"Player {i}", "gender": "Male"}
            for i in range(1, 9)
        ]

        # Scenario A: Incomplete round with 1 match
        matches_incomplete = [
            {
                "round_number": 1,
                "side_a_player_ids": ["P1", "P2"],
                "side_b_player_ids": ["P3", "P4"],
            }
        ]
        cov_inc = calculate_overall_coverage(players, matches_incomplete, division="Open Scramble")
        assert cov_inc["all_partners_covered"] is False
        assert "Partner rotation active" in cov_inc["quality_claim"]
        assert cov_inc["total_repeat_partner_pairs"] == 0

        # Scenario B: Match with repeat partner
        matches_repeats = [
            {
                "round_number": 1,
                "side_a_player_ids": ["P1", "P2"],
                "side_b_player_ids": ["P3", "P4"],
            },
            {
                "round_number": 2,
                "side_a_player_ids": ["P1", "P2"], # Repeated partnership P1+P2
                "side_b_player_ids": ["P5", "P6"],
            },
        ]
        cov_rep = calculate_overall_coverage(players, matches_repeats, division="Open Scramble")
        assert cov_rep["all_partners_covered"] is False
        assert cov_rep["total_repeat_partner_pairs"] == 1
        assert "1 repeat" in cov_rep["quality_claim"]


# ─────────────────────────────────────────────────────────────────────────────
# 2. INTEGRATION TESTS: Finite Rounds & State Transitions
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def unique_id() -> str:
    return uuid.uuid4().hex[:8]


@pytest_asyncio.fixture
async def scramble_setup(db_session: AsyncSession, unique_id: str):
    """
    Creates club, manager user, and a 8-player Open Scramble tournament with planned_rounds = 2.
    """
    # Manager
    mgr_user = User(
        email=f"scramble_mgr_{unique_id}@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Scramble Manager",
        is_active=True,
    )
    db_session.add(mgr_user)
    await db_session.flush()

    club = Club(
        name=f"Finite Scramble Club {unique_id}",
        slug=f"finite-scramble-{unique_id}",
        description="Finite Scramble Test Club",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    membership = ClubMembership(
        user_id=mgr_user.id,
        club_id=club.id,
        role=ClubRole.CLUB_MANAGER,
        is_active=True,
    )
    db_session.add(membership)

    # Tournament with planned_rounds = 2
    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club.id,
        name=f"Finite Scramble Tournament {unique_id}",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_CLOSED,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=2),
        registration_open_at=now - timedelta(days=5),
        registration_close_at=now - timedelta(hours=1),
        max_participants=8,
        min_participants=4,
        format_configuration={
            "category": "Open Scramble",
            "courts_count": 2,
            "planned_rounds": 2,
            "rounds": 2,
            "available_player_ids": [],
        },
    )
    db_session.add(t)
    await db_session.flush()

    # 8 Registered Players
    players = []
    for i in range(1, 9):
        u = User(
            email=f"player_{i}_{unique_id}@test.com",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Player {i}",
            is_active=True,
        )
        db_session.add(u)
        await db_session.flush()

        prof = PlayerProfile(
            user_id=u.id,
            display_name=f"Player {i}",
            gender="Male" if i <= 4 else "Female",
            skill_rating=3.5,
        )
        db_session.add(prof)

        cpm = ClubPlayerMembership(
            club_id=club.id,
            user_id=u.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"M-{unique_id}-{i}",
        )
        db_session.add(cpm)
        await db_session.flush()

        reg = TournamentRegistration(
            tournament_id=t.id,
            player_membership_id=cpm.id,
            status=RegistrationStatus.CONFIRMED,
            seed=i,
        )
        db_session.add(reg)
        players.append(cpm)

    await db_session.commit()
    await db_session.refresh(t)

    return {
        "club": club,
        "manager": mgr_user,
        "tournament": t,
        "players": players,
    }


class TestFiniteScrambleLifecycle:
    @pytest.mark.asyncio
    async def test_finite_round_boundary_enforcement(
        self,
        db_session: AsyncSession,
        scramble_setup: dict,
    ):
        """
        Tests that when a tournament has planned_rounds = 2:
        1. Round 1 can be generated, played, and finished.
        2. Advancing to Round 2 succeeds.
        3. Round 2 is flagged as is_final_round == True.
        4. Attempting to advance to Round 3 fails with 400 Bad Request.
        5. Tournament completion works and crowns the winner.
        """
        club = scramble_setup["club"]
        tournament = scramble_setup["tournament"]
        comp_svc = CompetitionService(db_session)

        # 1. Check initial state
        state1 = await comp_svc.get_scramble_state(club.id, tournament.id)
        assert state1.planned_rounds == 2
        assert state1.current_round == 1
        assert state1.is_final_round is False

        # Set player availability for Round 1
        pids = [p.id for p in scramble_setup["players"]]
        await comp_svc.set_scramble_player_availability(
            club.id, tournament.id, ScrambleAvailabilityRequest(player_membership_ids=pids)
        )

        # Create Round 1 matchups
        plan_r1 = await comp_svc.create_scramble_round_matchups(club.id, tournament.id)
        assert plan_r1.round_games_total == 6 # 2 courts of 4 players = 3 games * 2 courts = 6 games

        # Start Round 1
        await comp_svc.start_scramble_round(club.id, tournament.id)

        # Record scores for all 6 games in Round 1
        matches_r1 = await comp_svc.list_scramble_matches(club.id, tournament.id)
        for m in matches_r1:
            await comp_svc.record_match_result(
                club.id, tournament.id, m.id, 11, 7
            )

        # Finish Round 1
        await comp_svc.finish_scramble_round(club.id, tournament.id)
        state_r1_done = await comp_svc.get_scramble_state(club.id, tournament.id)
        assert state_r1_done.round_status == "completed"
        assert state_r1_done.is_final_round is False
        assert "start_next_round" in state_r1_done.valid_actions

        # 2. Advance to Round 2 (the final planned round)
        await comp_svc.start_scramble_next_round(club.id, tournament.id)
        state2 = await comp_svc.get_scramble_state(club.id, tournament.id)
        assert state2.current_round == 2
        assert state2.is_final_round is True
        # Availability was carried forward automatically!
        assert len(state2.available_player_ids) == 8

        # Create Round 2 matchups
        plan_r2 = await comp_svc.create_scramble_round_matchups(club.id, tournament.id)
        assert plan_r2.round_games_total == 6
        await comp_svc.start_scramble_round(club.id, tournament.id)

        # Record scores for all Round 2 matches
        matches_r2 = [
            m for m in await comp_svc.list_scramble_matches(club.id, tournament.id)
            if m.round_number == 2
        ]
        for m in matches_r2:
            await comp_svc.record_match_result(
                club.id, tournament.id, m.id, 11, 9
            )

        # Finish Round 2
        await comp_svc.finish_scramble_round(club.id, tournament.id)
        state_r2_done = await comp_svc.get_scramble_state(club.id, tournament.id)
        assert state_r2_done.round_status == "completed"
        assert state_r2_done.is_final_round is True
        # CRITICAL: start_next_round MUST NOT be in valid_actions on final round!
        assert "start_next_round" not in state_r2_done.valid_actions
        assert "end_tournament" in state_r2_done.valid_actions

        # 3. Attempting to start Round 3 MUST be rejected with 400 Bad Request
        with pytest.raises(Exception) as exc_info:
            await comp_svc.start_scramble_next_round(club.id, tournament.id)
        assert "configured limit of 2 rounds" in str(exc_info.value).lower()

        # 4. Attempting to create matchups beyond planned rounds MUST be rejected
        config = dict(tournament.format_configuration or {})
        config["current_round"] = 3
        config["round_status"] = "setup"
        await comp_svc.tournament_repo.update(tournament, format_configuration=config)
        await comp_svc.db.commit()

        with pytest.raises(Exception) as exc_info_m:
            await comp_svc.create_scramble_round_matchups(club.id, tournament.id)
        assert "exceeds planned limit" in str(exc_info_m.value).lower()

        # Restore config back to current_round=2, round_status="completed" for step 5
        config["current_round"] = 2
        config["round_status"] = "completed"
        await comp_svc.tournament_repo.update(tournament, format_configuration=config)
        await comp_svc.db.commit()

        # 5. Conclude tournament
        end_res = await comp_svc.end_scramble_tournament(club.id, tournament.id)
        assert end_res.tournament_status == "completed"
        assert end_res.champion_player_name is not None

        # Verify final state
        final_state = await comp_svc.get_scramble_state(club.id, tournament.id)
        assert final_state.tournament_status == "completed"
        assert final_state.champion_player_name is not None

    @pytest.mark.asyncio
    async def test_update_planned_rounds_api(
        self,
        db_session: AsyncSession,
        async_client: AsyncClient,
        scramble_setup: dict,
    ):
        """
        Tests setting and adjusting planned rounds via the backend API.
        """
        club = scramble_setup["club"]
        manager = scramble_setup["manager"]
        tournament = scramble_setup["tournament"]

        headers = make_auth_header(manager)

        # Update planned rounds to 4
        url = f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/scramble/planned-rounds"
        resp = await async_client.post(url, json={"planned_rounds": 4}, headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["planned_rounds"] == 4
        assert data["is_final_round"] is False

        # Verify state endpoint also reflects 4 planned rounds
        state_url = f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/scramble/state"
        resp_state = await async_client.get(state_url, headers=headers)
        assert resp_state.status_code == 200
        state_data = resp_state.json()
        assert state_data["planned_rounds"] == 4
