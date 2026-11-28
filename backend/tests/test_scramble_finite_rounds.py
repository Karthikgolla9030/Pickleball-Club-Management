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

        # Start Round 1 & Start Tournament
        await comp_svc.start_scramble_round(club.id, tournament.id)
        from app.services.tournament_service import TournamentService
        await TournamentService(db_session).start_tournament(club.id, tournament.id)

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


@pytest.mark.asyncio
async def test_scramble_rotation_metrics_16_players_5_rounds_and_court_capacity_matrix(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """
    Comprehensive audit & regression test covering:
    - 16 players across 5 rounds & 2 active courts:
      * 20 valid matches, 4 distinct players per match, no duplicate players in a round, 5 games per player.
      * Unique Partner Pairings == 40, Repeated Partner Pairings == 0,
        Unique Opponent Pairings + Repeated Opponent Pairings == 80 (matches independent calculation).
      * Unplayed pending / cancelled / incomplete matches are excluded from actual-play stats.
    - Rotation rule variants (`Full Rotation`, `Balanced Pairings`, `Skill-Tiered Rotation`).
    - Court capacity matrix:
      * 4 players on 1 court (capacity 1)
      * 8 players on 2 courts (capacity 2)
      * 2 selected courts with capacity 1 -> only 1 court assigned concurrently
      * 2 selected courts with capacity 2 -> both courts assigned concurrently
      * Rejects capacity > selected courts; revalidates capacity when changing court selection
      * Completed tournament GET state/setup remain read-only with exact metrics & zero mutation.
    """
    from app.models.court import Court, CourtEnvironment, CourtStatus

    uid = uuid.uuid4().hex[:6]
    owner = User(
        email=f"sc_owner_{uid}@test.com",
        hashed_password=hash_password("TestPass123!"),
        full_name="Scramble Owner",
        is_active=True,
    )
    db_session.add(owner)
    await db_session.flush()

    club = Club(
        name=f"Scramble Audit Club {uid}",
        slug=f"sc-audit-{uid}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    db_session.add(
        ClubMembership(club_id=club.id, user_id=owner.id, role=ClubRole.CLUB_OWNER, is_active=True)
    )

    c1 = Court(
        club_id=club.id,
        name="Court 1",
        display_name="Court 1",
        court_number=1,
        surface_type="Sport Court",
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=1,
    )
    c2 = Court(
        club_id=club.id,
        name="Court 2",
        display_name="Court 2",
        court_number=2,
        surface_type="Sport Court",
        indoor_outdoor=CourtEnvironment.OUTDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
        display_order=2,
    )
    db_session.add_all([c1, c2])
    await db_session.flush()

    players = []
    for i in range(16):
        u = User(
            email=f"sc_p_{uid}_{i}@test.com",
            hashed_password=hash_password("TestPass123!"),
            full_name=f"Player {i + 1}",
            is_active=True,
        )
        db_session.add(u)
        await db_session.flush()
        prof = PlayerProfile(
            user_id=u.id,
            display_name=f"Player {i + 1}",
            skill_rating=3.0 + ((i % 4) * 0.5),
            gender="Male",
        )
        db_session.add(prof)
        pm = ClubPlayerMembership(
            club_id=club.id,
            user_id=u.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"SC-{uid}-{i:02d}",
        )
        db_session.add(pm)
        await db_session.flush()
        players.append((u, pm))

    owner_h = make_auth_header(owner.id)
    now = datetime.now(timezone.utc)

    # 1) Create 16-player Open Scramble (simulating legacy wizard payload with 1 court in assigned_courts but no selected_court_ids)
    t = Tournament(
        club_id=club.id,
        created_by_user_id=owner.id,
        name=f"Scramble 16P Audit {uid}",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_CLOSED,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now - timedelta(hours=1),
        min_participants=4,
        max_participants=16,
        format_configuration={
            "category": "Open Scramble",
            "registration_type": "individual",
            "team_size": 1,
            "planned_rounds": 5,
            "rounds": 5,
            "courts_count": 1,
        },
    )
    db_session.add(t)
    await db_session.flush()

    for idx, (_, pm) in enumerate(players):
        db_session.add(
            TournamentRegistration(
                tournament_id=t.id,
                player_membership_id=pm.id,
                status=RegistrationStatus.CONFIRMED,
                seed=idx + 1,
            )
        )
    await db_session.commit()

    # Pre-save Setup defaults capacity cleanly to 2 when 2 active courts are resolved
    setup0 = (
        await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/post-registration-setup",
            headers=owner_h,
        )
    )
    assert setup0.status_code == 200
    assert len(setup0.json()["selected_court_ids"]) == 2
    assert setup0.json()["courts_count"] == 2

    # Save 2 selected courts with capacity = 1 (explicitly reduced) -> allowed and persists cleanly
    save_cap1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "rounds": 5,
            "rotation_rule": "Full Rotation (no repeating partners)",
            "selected_court_ids": [str(c1.id), str(c2.id)],
            "courts_count": 1,
        },
    )
    assert save_cap1.status_code == 200
    assert save_cap1.json()["courts_count"] == 1
    assert set(save_cap1.json()["selected_court_ids"]) == {str(c1.id), str(c2.id)}

    # Reject capacity > selected court count (2 capacity on 1 selected court)
    bad_save = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "rounds": 5,
            "rotation_rule": "Full Rotation (no repeating partners)",
            "selected_court_ids": [str(c1.id)],
            "courts_count": 2,
        },
    )
    assert bad_save.status_code == 400

    # Generate with 2 courts & capacity 1 -> only 1st selected court gets assigned
    gen1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/confirm-and-generate",
        headers=owner_h,
        json={
            "rounds": 5,
            "rotation_rule": "Full Rotation (no repeating partners)",
            "selected_court_ids": [str(c1.id), str(c2.id)],
            "courts_count": 1,
            "require_saved_config": True,
        },
    )
    assert gen1.status_code == 201
    ms_cap1 = (
        await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=owner_h,
        )
    ).json()
    assert len(ms_cap1) == 20
    assert {m["court_id"] for m in ms_cap1} == {str(c1.id)}

    # Change court selection to 2 courts & capacity 2, save, reload, regenerate -> both courts assigned
    resave_cap2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/configuration",
        headers=owner_h,
        json={
            "rounds": 5,
            "rotation_rule": "Full Rotation (no repeating partners)",
            "selected_court_ids": [str(c1.id), str(c2.id)],
            "courts_count": 2,
        },
    )
    assert resave_cap2.status_code == 200
    reloaded = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/post-registration-setup",
        headers=owner_h,
    )
    assert reloaded.status_code == 200
    assert reloaded.json()["configuration_saved"] is True
    assert reloaded.json()["courts_count"] == 2

    gen2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/confirm-and-generate",
        headers=owner_h,
        json={
            "rounds": 5,
            "rotation_rule": "Full Rotation (no repeating partners)",
            "selected_court_ids": [str(c1.id), str(c2.id)],
            "courts_count": 2,
            "require_saved_config": True,
        },
    )
    assert gen2.status_code == 201

    ms = (
        await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=owner_h,
        )
    ).json()
    assert len(ms) == 20
    assert {m["court_id"] for m in ms} == {str(c1.id), str(c2.id)}

    # Independently audit all 20 generated matches
    appearances_by_player: dict[str, int] = {}
    partner_pair_counts: dict[tuple[str, str], int] = {}
    opponent_pair_counts: dict[tuple[str, str], int] = {}
    players_by_round: dict[int, list[str]] = {}

    for m in ms:
        sa = [str(p["player_membership_id"]) for p in m["side_a_participants"]]
        sb = [str(p["player_membership_id"]) for p in m["side_b_participants"]]
        assert len(sa) == 2 and len(sb) == 2
        all_four = sa + sb
        assert len(set(all_four)) == 4
        players_by_round.setdefault(m["round_number"], []).extend(all_four)
        for pid in all_four:
            appearances_by_player[pid] = appearances_by_player.get(pid, 0) + 1
        for side in (sa, sb):
            pair = tuple(sorted(side))
            partner_pair_counts[pair] = partner_pair_counts.get(pair, 0) + 1
        for a in sa:
            for b in sb:
                opair = tuple(sorted((a, b)))
                opponent_pair_counts[opair] = opponent_pair_counts.get(opair, 0) + 1

    assert len(appearances_by_player) == 16
    assert all(cnt == 5 for cnt in appearances_by_player.values())
    for rnd, pids in players_by_round.items():
        assert len(pids) == 16 and len(set(pids)) == 16, f"Duplicate or missing player in round {rnd}"

    exp_unique_p = len(partner_pair_counts)
    exp_rep_p = sum(c - 1 for c in partner_pair_counts.values() if c > 1)
    exp_unique_o = len(opponent_pair_counts)
    exp_rep_o = sum(c - 1 for c in opponent_pair_counts.values() if c > 1)
    assert exp_unique_p == 40
    assert exp_rep_p == 0
    assert exp_unique_o + exp_rep_o == 80

    # Check Overview state BEFORE completion (registration_closed generated preview)
    pre_state = (
        await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=owner_h,
        )
    ).json()
    cov = pre_state["coverage_summary"]
    assert cov["unique_partner_pairings"] == exp_unique_p
    assert cov["repeated_partner_pairings"] == exp_rep_p
    assert cov["unique_opponent_pairings"] == exp_unique_o
    assert cov["repeated_opponent_pairings"] == exp_rep_o
    assert cov["coverage_scope"] == "generated_schedule"

    # Start tournament & complete ONLY first 12 matches -> actual-play stats must count ONLY those 12 completed matches!
    assert (
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/start",
            headers=owner_h,
        )
    ).status_code == 200

    for m in ms[:12]:
        r_score = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{m['id']}/result",
            headers=owner_h,
            json={"score_a": 11, "score_b": 7},
        )
        assert r_score.status_code == 200

    mid_state = (
        await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=owner_h,
        )
    ).json()
    assert mid_state["coverage_summary"]["coverage_scope"] == "actual_played"
    assert mid_state["coverage_summary"]["matches_analyzed"] == 12
    assert (
        mid_state["coverage_summary"]["unique_partner_pairings"]
        + mid_state["coverage_summary"]["repeated_partner_pairings"]
        == 24
    )

    # Complete remaining 8 matches, then conclude Scramble tournament cleanly
    for m in ms[12:]:
        r_score = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{m['id']}/result",
            headers=owner_h,
            json={"score_a": 11, "score_b": 8},
        )
        assert r_score.status_code == 200

    end_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/end-tournament",
        headers=owner_h,
    )
    assert end_res.status_code == 200

    final_state = (
        await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=owner_h,
        )
    ).json()
    assert final_state["tournament_status"] == "completed"
    fcov = final_state["coverage_summary"]
    assert fcov["coverage_scope"] == "actual_played"
    assert fcov["matches_analyzed"] == 20
    assert fcov["unique_partner_pairings"] == exp_unique_p
    assert fcov["repeated_partner_pairings"] == exp_rep_p
    assert fcov["unique_opponent_pairings"] == exp_unique_o
    assert fcov["repeated_opponent_pairings"] == exp_rep_o

    # Setup GET on completed stays read-only & preserves saved capacity/courts
    final_setup = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/post-registration-setup",
        headers=owner_h,
    )
    assert final_setup.status_code == 200
    assert final_setup.json()["is_completed"] is True
    assert final_setup.json()["is_locked"] is True
    assert final_setup.json()["courts_count"] == 2

    # Engine pure tests: 4 players on 1 court, 8 players on 2 courts, and all 3 rotation rules + self/cancelled/invalid guards
    eng = ScrambleEngine()
    p4 = [{"id": str(players[i][1].id), "display_name": f"P{i}", "seed": i + 1, "skill_rating": 3.5} for i in range(4)]
    m4 = eng.generate_matchups(p4, num_rounds=3, rotation_rule="Full Rotation (no repeating partners)")
    assert len(m4) == 3
    cov4 = calculate_overall_coverage(p4, m4)
    assert cov4["unique_partner_pairings"] == 6 and cov4["repeated_partner_pairings"] == 0

    p8 = [{"id": str(players[i][1].id), "display_name": f"P{i}", "seed": i + 1, "skill_rating": 3.0 + (i % 2)} for i in range(8)]
    for rule in (
        "Full Rotation (no repeating partners)",
        "Balanced Pairings (fair partner distribution)",
        "Skill-Tiered Rotation (similar rating partners)",
    ):
        m8 = eng.generate_matchups(p8, num_rounds=3, rotation_rule=rule)
        assert len(m8) == 6
        for item in m8:
            ids = [x["id"] for x in item["side_a"] + item["side_b"]]
            assert len(set(ids)) == 4

    # Exclude cancelled & invalid self-pair/incomplete matches cleanly from calculate_overall_coverage
    mixed_matches = [
        {"status": "completed", "side_a": [{"id": p4[0]["id"]}, {"id": p4[1]["id"]}], "side_b": [{"id": p4[2]["id"]}, {"id": p4[3]["id"]}]},
        {"status": "completed", "side_a": [{"id": p4[1]["id"]}, {"id": p4[0]["id"]}], "side_b": [{"id": p4[3]["id"]}, {"id": p4[2]["id"]}]},  # reverse order -> counts as 2 repeated partner & 4 repeated opponent
        {"status": "cancelled", "side_a": [{"id": p4[0]["id"]}, {"id": p4[2]["id"]}], "side_b": [{"id": p4[1]["id"]}, {"id": p4[3]["id"]}]},
        {"status": "completed", "side_a": [{"id": p4[0]["id"]}, {"id": p4[0]["id"]}], "side_b": [{"id": p4[1]["id"]}, {"id": p4[2]["id"]}]},  # invalid self-pair
        {"status": "completed", "side_a": [{"id": p4[0]["id"]}], "side_b": [{"id": p4[1]["id"]}, {"id": p4[2]["id"]}]},  # incomplete
    ]
    cov_guard = calculate_overall_coverage(p4, mixed_matches, tournament_status="completed")
    assert cov_guard["matches_analyzed"] == 2
    assert cov_guard["unique_partner_pairings"] == 2
    assert cov_guard["repeated_partner_pairings"] == 2
    assert cov_guard["unique_opponent_pairings"] == 4
    assert cov_guard["repeated_opponent_pairings"] == 4
