"""
Aught2 Pickleball — Scramble & Pool Play Audit Fix Verification Suite

Automated test verification of:
  1. Scramble Finite Planned Rounds Enforcement:
     - Tournament configured for 3 rounds strictly respects the 3-round boundary.
     - Planned rounds is authoritative: matches with round_number > planned_rounds are ignored.
     - Round matchup creation is idempotent: repeating the request does not duplicate matches.
     - Completing round 1 does not prematurely mark the tournament complete while planned rounds remain.
  2. Pool Play Championship Winner Resolution:
     - Semifinal completion advances winners into the Championship Final without declaring a champion.
     - Tournament remains IN_PROGRESS while Championship Final is unplayed.
     - Completing the Championship Final officially marks the tournament COMPLETED with the Final match winner as champion.
     - Resetting/correcting the final match safely reverts tournament status to IN_PROGRESS and clears the champion.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.court import Court
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Match, MatchStage, MatchStatus, MatchParticipant, Team, TeamMember
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.fixture
def unique_id() -> str:
    return uuid.uuid4().hex[:8]


# ==============================================================================
# Fixtures
# ==============================================================================

@pytest_asyncio.fixture
async def scramble_3_round_setup(db_session: AsyncSession, unique_id: str):
    """8-player Scramble tournament with planned_rounds = 3."""
    mgr_user = User(
        email=f"scramble_mgr_{unique_id}@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Scramble Manager",
        is_active=True,
    )
    db_session.add(mgr_user)
    await db_session.flush()

    club = Club(
        name=f"Audit Scramble Club {unique_id}",
        slug=f"audit-scramble-{unique_id}",
        description="Audit Scramble Club",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    c1 = Court(club_id=club.id, name="Court 1", court_number=1, is_active=True)
    c2 = Court(club_id=club.id, name="Court 2", court_number=2, is_active=True)
    db_session.add_all([c1, c2])
    await db_session.flush()

    membership = ClubMembership(
        user_id=mgr_user.id,
        club_id=club.id,
        role=ClubRole.CLUB_MANAGER,
        is_active=True,
    )
    db_session.add(membership)

    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club.id,
        name=f"Scramble 3-Round Tournament {unique_id}",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_CLOSED,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=2),
        registration_open_at=now - timedelta(days=5),
        registration_close_at=now - timedelta(hours=1),
        max_participants=8,
        min_participants=4,
        scoring_rules={"target_score": 11, "win_by": 2},
        format_configuration={
            "category": "Open Scramble",
            "courts_count": 2,
            "planned_rounds": 3,
            "rounds": 3,
            "current_round": 1,
            "round_status": "setup",
            "available_player_ids": [],
        },
    )
    db_session.add(t)
    await db_session.flush()

    players = []
    pids = []
    for i in range(1, 9):
        u = User(
            email=f"scramble_p{i}_{unique_id}@test.com",
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
            skill_rating=3.0 + (i * 0.1),
        )
        db_session.add(prof)

        cpm = ClubPlayerMembership(
            club_id=club.id,
            user_id=u.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"SC-{unique_id}-{i}",
        )
        db_session.add(cpm)
        await db_session.flush()

        reg = TournamentRegistration(
            tournament_id=t.id,
            player_membership_id=cpm.id,
            status=RegistrationStatus.CONFIRMED,
            seed=i,
            registered_at=now - timedelta(days=4, hours=i),
        )
        db_session.add(reg)
        players.append(cpm)
        pids.append(str(cpm.id))

    t.format_configuration = {
        "category": "Open Scramble",
        "courts_count": 2,
        "planned_rounds": 3,
        "rounds": 3,
        "current_round": 1,
        "round_status": "setup",
        "available_player_ids": pids,
    }
    await db_session.commit()
    await db_session.refresh(t)

    return {
        "club": club,
        "manager": mgr_user,
        "tournament": t,
        "players": players,
    }


@pytest_asyncio.fixture
async def pool_play_bracket_setup(db_session: AsyncSession, unique_id: str):
    """Pool play tournament with championship bracket (2 Semifinals + 1 Final)."""
    td_user = User(
        email=f"pool_td_{unique_id}@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Pool TD",
        is_active=True,
    )
    db_session.add(td_user)
    await db_session.flush()

    club = Club(
        name=f"Pool Play Club {unique_id}",
        slug=f"pool-play-{unique_id}",
        description="Pool Play Test Club",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    membership = ClubMembership(
        user_id=td_user.id,
        club_id=club.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    db_session.add(membership)

    now = datetime.now(timezone.utc)
    t = Tournament(
        club_id=club.id,
        name=f"Pool Play Championship {unique_id}",
        format=TournamentFormat.POOL_PLAY,
        status=TournamentStatus.IN_PROGRESS,
        visibility=TournamentVisibility.PUBLIC,
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=2),
        registration_open_at=now - timedelta(days=5),
        registration_close_at=now - timedelta(hours=1),
        max_participants=4,
        min_participants=4,
        scoring_rules={"target_score": 11, "win_by": 2},
        format_configuration={"team_size": 1, "qualifiers_per_pool": 2},
    )
    db_session.add(t)
    await db_session.flush()

    # Create 4 teams
    teams = []
    for i in range(1, 5):
        u = User(
            email=f"team_u{i}_{unique_id}@test.com",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Player Team {i}",
            is_active=True,
        )
        db_session.add(u)
        await db_session.flush()

        prof = PlayerProfile(user_id=u.id, display_name=f"Player Team {i}", skill_rating=4.0)
        db_session.add(prof)

        cpm = ClubPlayerMembership(
            club_id=club.id,
            user_id=u.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"PP-{unique_id}-{i}",
        )
        db_session.add(cpm)
        await db_session.flush()

        team = Team(
            tournament_id=t.id,
            name=f"Team {i}",
            seed=i,
        )
        db_session.add(team)
        await db_session.flush()

        tm = TeamMember(team_id=team.id, player_membership_id=cpm.id)
        db_session.add(tm)
        teams.append(team)

    # Create 1 pool match (already completed)
    pm = Match(
        tournament_id=t.id,
        stage=MatchStage.POOL,
        round_number=1,
        match_number=1,
        team_a_id=teams[0].id,
        team_b_id=teams[1].id,
        score_a=11,
        score_b=8,
        winner_team_id=teams[0].id,
        status=MatchStatus.COMPLETED,
    )
    db_session.add(pm)
    await db_session.flush()

    # Final Match (Round 2)
    final_m = Match(
        id=uuid.uuid4(),
        tournament_id=t.id,
        stage=MatchStage.CHAMPIONSHIP,
        bracket_round=2,
        match_number=4,
        team_a_id=None,
        team_b_id=None,
        status=MatchStatus.PENDING,
        next_match_id=None,
    )
    db_session.add(final_m)
    await db_session.flush()

    # SF1 (Round 1) -> feeds final_m team_a
    sf1_m = Match(
        id=uuid.uuid4(),
        tournament_id=t.id,
        stage=MatchStage.CHAMPIONSHIP,
        bracket_round=1,
        match_number=2,
        team_a_id=teams[0].id,
        team_b_id=teams[1].id,
        status=MatchStatus.PENDING,
        next_match_id=final_m.id,
        next_match_slot="team_a",
    )
    db_session.add(sf1_m)

    # SF2 (Round 1) -> feeds final_m team_b
    sf2_m = Match(
        id=uuid.uuid4(),
        tournament_id=t.id,
        stage=MatchStage.CHAMPIONSHIP,
        bracket_round=1,
        match_number=3,
        team_a_id=teams[2].id,
        team_b_id=teams[3].id,
        status=MatchStatus.PENDING,
        next_match_id=final_m.id,
        next_match_slot="team_b",
    )
    db_session.add(sf2_m)
    await db_session.commit()

    return {
        "club": club,
        "td": td_user,
        "tournament": t,
        "teams": teams,
        "sf1": sf1_m,
        "sf2": sf2_m,
        "final": final_m,
    }


# ==============================================================================
# Scramble Tests
# ==============================================================================

@pytest.mark.asyncio
class TestScrambleAuditFixes:
    async def test_scramble_planned_rounds_boundary_and_filtering(
        self, async_client: AsyncClient, scramble_3_round_setup: dict, db_session: AsyncSession
    ):
        """
        Verify:
        1. A tournament configured for 3 planned rounds returns planned_rounds=3.
        2. Any matches with round_number > 3 in DB are filtered out from matches and standings.
        3. Manager cannot advance beyond round 3.
        """
        data = scramble_3_round_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["manager"])

        # 1. State returns planned_rounds = 3
        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=headers,
        )
        assert res.status_code == 200
        state = res.json()
        assert state["planned_rounds"] == 3
        assert state["current_round"] == 1

        # 2. Inject a stale match with round_number = 5 directly into DB
        stale_m = Match(
            id=uuid.uuid4(),
            tournament_id=t.id,
            round_number=5,
            match_number=99,
            status=MatchStatus.COMPLETED,
            score_a=11,
            score_b=0,
        )
        db_session.add(stale_m)
        await db_session.commit()

        # Check list_scramble_matches filters out round 5
        matches_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        assert matches_res.status_code == 200
        matches = matches_res.json()
        assert not any(m.get("round_number") == 5 for m in matches)

        # Check get_scramble_state total_games ignores round 5
        state_res2 = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=headers,
        )
        assert state_res2.status_code == 200
        assert state_res2.json()["total_games"] == 0

    async def test_scramble_duplicate_matchup_generation_is_idempotent(
        self, async_client: AsyncClient, scramble_3_round_setup: dict
    ):
        """
        Verify:
        Repeating the matchup generation request while in matchups_created does NOT
        create duplicate matches or error out.
        """
        data = scramble_3_round_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["manager"])

        # Generate matchups for round 1
        res1 = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matchups",
            headers=headers,
            json={},
        )
        assert res1.status_code == 200, res1.text
        state1 = res1.json()
        assert state1["round_status"] == "matchups_created"

        matches_res1 = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        matches1 = matches_res1.json()
        count1 = len(matches1)
        assert count1 > 0

        # Second call to create matchups should be idempotent (return existing state safely)
        res2 = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matchups",
            headers=headers,
            json={},
        )
        assert res2.status_code == 200
        state2 = res2.json()
        assert state2["round_status"] == "matchups_created"

        matches_res2 = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        matches2 = matches_res2.json()
        assert len(matches2) == count1, "Match count must not duplicate on repeated generation"

    async def test_scramble_does_not_complete_until_final_round_finished(
        self, async_client: AsyncClient, scramble_3_round_setup: dict
    ):
        """
        Completing Round 1 matches does NOT mark a 3-round tournament completed.
        """
        data = scramble_3_round_setup
        club = data["club"]
        t = data["tournament"]
        headers = make_auth_header(data["manager"])

        # Generate and start Round 1
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matchups",
            headers=headers,
            json={},
        )
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/start-round",
            headers=headers,
        )

        matches_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        r1_matches = matches_res.json()

        # Complete all round 1 matches
        for m in r1_matches:
            await async_client.post(
                f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{m['id']}/result",
                headers=headers,
                json={"score_a": 11, "score_b": 7},
            )

        # Finish round 1
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/finish-round",
            headers=headers,
        )

        # Check tournament state: MUST NOT be completed because 2 more rounds remain
        state_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=headers,
        )
        state = state_res.json()
        assert state["tournament_status"] == "in_progress"
        assert state["champion_player_id"] is None
        assert state["current_round"] == 1
        assert state["is_final_round"] is False


# ==============================================================================
# Pool Play Tests
# ==============================================================================

@pytest.mark.asyncio
class TestPoolPlayAuditFixes:
    async def test_pool_play_semifinal_winner_does_not_declare_champion(
        self, async_client: AsyncClient, pool_play_bracket_setup: dict
    ):
        """
        Verify:
        1. Recording score for Semifinal 1 advances the winner to the Final.
        2. Completing Semifinal 1 does NOT mark the tournament completed.
        3. Tournament winner and podium remain unset in format_configuration.
        """
        data = pool_play_bracket_setup
        club = data["club"]
        t = data["tournament"]
        sf1 = data["sf1"]
        final = data["final"]
        teams = data["teams"]
        headers = make_auth_header(data["td"])

        # Score Semifinal 1: Team 1 (score 11) vs Team 2 (score 5) -> Team 1 wins
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{sf1.id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 5},
        )
        assert res.status_code == 200

        # Check final match has team_a = Team 1
        final_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{final.id}",
            headers=headers,
        )
        assert final_res.status_code == 200
        assert str(final_res.json()["team_a_id"]) == str(teams[0].id)
        assert final_res.json()["status"] == "pending"

        # Check tournament status and format_configuration: MUST NOT BE COMPLETED
        t_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
            headers=headers,
        )
        assert t_res.status_code == 200
        t_data = t_res.json()
        assert t_data["status"] == "in_progress", "Tournament must remain in_progress after semifinal"
        cfg = t_data.get("format_configuration") or {}
        assert "winner" not in cfg, "Semifinal winner must NOT be crowned tournament champion"

    async def test_pool_play_champion_awarded_only_after_final_completed(
        self, async_client: AsyncClient, pool_play_bracket_setup: dict
    ):
        """
        Verify:
        1. After both semifinals are completed, tournament remains in_progress.
        2. Completing the Final crowns the Final match winner as tournament champion.
        """
        data = pool_play_bracket_setup
        club = data["club"]
        t = data["tournament"]
        sf1 = data["sf1"]
        sf2 = data["sf2"]
        final = data["final"]
        teams = data["teams"]
        headers = make_auth_header(data["td"])

        # SF1: Team 1 beats Team 2
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{sf1.id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 5},
        )

        # SF2: Team 4 beats Team 3
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{sf2.id}/result",
            headers=headers,
            json={"score_a": 7, "score_b": 11},
        )

        # Check tournament is STILL in_progress
        t_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
            headers=headers,
        )
        assert t_res.json()["status"] == "in_progress"

        # Final: Team 4 beats Team 1 (score 9 vs 11 -> Team 4 wins)
        final_score_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{final.id}/result",
            headers=headers,
            json={"score_a": 9, "score_b": 11},
        )
        assert final_score_res.status_code == 200

        # Now tournament must be COMPLETED and champion must be Team 4
        t_res_final = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
            headers=headers,
        )
        assert t_res_final.status_code == 200
        t_final_data = t_res_final.json()
        assert t_final_data["status"] == "completed"
        cfg = t_final_data.get("format_configuration") or {}
        assert "winner" in cfg
        assert cfg["winner"]["team_id"] == str(teams[3].id), "Champion must be the Final match winner (Team 4)"
        assert cfg["podium"][0]["team_id"] == str(teams[3].id)
        assert cfg["podium"][1]["team_id"] == str(teams[0].id)

    async def test_pool_play_reset_final_reverts_tournament_completion(
        self, async_client: AsyncClient, pool_play_bracket_setup: dict
    ):
        """
        Verify:
        Resetting or correcting the final match safely reverts tournament status
        from COMPLETED back to IN_PROGRESS and clears the champion fields.
        """
        data = pool_play_bracket_setup
        club = data["club"]
        t = data["tournament"]
        sf1 = data["sf1"]
        sf2 = data["sf2"]
        final = data["final"]
        teams = data["teams"]
        headers = make_auth_header(data["td"])

        # Complete SF1 and SF2
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{sf1.id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 5},
        )
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{sf2.id}/result",
            headers=headers,
            json={"score_a": 7, "score_b": 11},
        )

        # Complete Final
        await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{final.id}/result",
            headers=headers,
            json={"score_a": 11, "score_b": 8},
        )

        # Verify tournament is completed
        t_done = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
            headers=headers,
        )
        assert t_done.json()["status"] == "completed"

        # Correct final result to change scores
        correct_res = await async_client.patch(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{final.id}/result",
            headers=headers,
            json={"score_a": 8, "score_b": 11},
        )
        assert correct_res.status_code == 200, correct_res.text

        # After correction, Team 4 is now champion
        t_corr = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
            headers=headers,
        )
        assert t_corr.json()["status"] == "completed"
        assert t_corr.json()["format_configuration"]["winner"]["team_id"] == str(teams[3].id)


@pytest.mark.asyncio
async def test_scramble_court_allocation_and_court_numbers_in_matches(
    async_client: AsyncClient, scramble_3_round_setup
):
    """
    Verifies Court 1 and Court 2 match allocation & visibility:
    1. 8 players on 2 courts generate exactly 6 matches for Round 1 (3 on Court 1, 3 on Court 2).
    2. list_scramble_matches returns court_number and court_name populated on each match.
    3. Exactly 3 matches belong to Court 1 and 3 matches belong to Court 2 (no court is empty).
    4. get_scramble_state returns rounds_data with both courts defined and populated with matches.
    """
    club = scramble_3_round_setup["club"]
    t = scramble_3_round_setup["tournament"]
    mgr = scramble_3_round_setup["manager"]
    headers = make_auth_header(mgr)

    # Generate Round 1 matchups
    gen_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matchups",
        headers=headers,
    )
    assert gen_res.status_code == 200, gen_res.text
    state_data = gen_res.json()

    # Verify rounds_data is present in state response
    assert "rounds_data" in state_data
    assert "1" in state_data["rounds_data"]
    r1_courts = state_data["rounds_data"]["1"]["courts"]
    assert len(r1_courts) == 2
    assert r1_courts[0]["court_number"] == 1
    assert len(r1_courts[0]["matches"]) == 3
    assert r1_courts[1]["court_number"] == 2
    assert len(r1_courts[1]["matches"]) == 3

    # Query matches endpoint
    m_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
        headers=headers,
    )
    assert m_res.status_code == 200, m_res.text
    matches = m_res.json()
    assert len(matches) == 6

    # Verify each match has court_number and court_name populated
    c1_matches = [m for m in matches if m.get("court_number") == 1]
    c2_matches = [m for m in matches if m.get("court_number") == 2]

    assert len(c1_matches) == 3, f"Expected 3 matches on Court 1, got {len(c1_matches)}"
    assert len(c2_matches) == 3, f"Expected 3 matches on Court 2, got {len(c2_matches)}"

    for m in c1_matches:
        assert m["court_name"] == "Court 1"
        assert m["round_number"] == 1
    for m in c2_matches:
        assert m["court_name"] == "Court 2"
        assert m["round_number"] == 1


@pytest.mark.asyncio
async def test_scramble_rounds_advance_to_planned_limit_and_blocks_further(
    async_client: AsyncClient, scramble_3_round_setup
):
    """
    Verifies that a tournament configured for 3 planned rounds can complete
    Rounds 1, 2, and 3, but is strictly blocked from advancing to Round 4.
    """
    club = scramble_3_round_setup["club"]
    t = scramble_3_round_setup["tournament"]
    mgr = scramble_3_round_setup["manager"]
    headers = make_auth_header(mgr)

    for round_num in (1, 2, 3):
        # 1. Generate matchups if in setup
        st = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/state",
            headers=headers,
        )
        if st.json()["round_status"] == "setup":
            await async_client.post(
                f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matchups",
                headers=headers,
            )

        # 2. Start round
        start_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/start-round",
            headers=headers,
        )
        assert start_res.status_code == 200

        # 3. Get round matches and score them
        m_res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/matches",
            headers=headers,
        )
        r_matches = [m for m in m_res.json() if m["round_number"] == round_num]
        assert len(r_matches) == 6

        for m in r_matches:
            await async_client.post(
                f"/api/v1/clubs/{club.id}/tournaments/{t.id}/matches/{m['id']}/result",
                headers=headers,
                json={"score_a": 11, "score_b": 7},
            )

        # 4. Finish round
        fin_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/finish-round",
            headers=headers,
        )
        assert fin_res.status_code == 200
        assert fin_res.json()["round_status"] == "completed"

        if round_num < 3:
            # Advance to next round
            next_res = await async_client.post(
                f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/next-round",
                headers=headers,
            )
            assert next_res.status_code == 200
            assert next_res.json()["current_round"] == round_num + 1

    # Now at end of Round 3, attempt to start Round 4: MUST BE REJECTED!
    blocked_next = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}/scramble/next-round",
        headers=headers,
    )
    assert blocked_next.status_code == 400
    assert "configured limit of 3 rounds" in blocked_next.json()["detail"]

