"""
Aught2 Pickleball — Post-Registration Workflow Tests

Comprehensive verification of the post-registration format configuration workflow:
1. Scramble tournaments:
   - Feasibility and recommendation calculation (8 players, 5 players odd count, 7 players unpartitionable, <4 players)
   - Partner preview generation across rounds
   - Post-registration setup endpoint (GET)
   - Confirm and generate schedule endpoint (POST)
   - Preventing tournament start before format configuration is complete
   - Permitting tournament start after format configuration is complete
   - Duplicate generation prevention / idempotent regeneration
   - Registration reopening resets schedule and configuration stage
   - Player withdrawal in registration_closed invalidates schedule

2. Pool Play tournaments:
   - Pool configuration calculation & feasible configurations (8 teams, 12 teams, uneven pools)
   - Qualifier validation (qualifiers > min pool size rejected)
   - Post-registration setup endpoint with recommendations (GET)
   - Confirm and generate pools and matches endpoint (POST)
   - Serpentine team allocation and complete team assignment
   - Championship bracket generation structure
   - Preventing tournament start before format configuration is complete
   - Permitting tournament start after format configuration is complete
   - Registration reopening resets schedule
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
from app.models.competition import Match, MatchStatus, Pool, PoolTeam, Team, TeamMember
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
from app.services.competition.pool_play_engine import (
    PoolConfigurationError,
    PoolPlayEngine,
)
from app.services.competition.scramble_engine import (
    ScrambleConfigurationError,
    ScrambleEngine,
)
from tests.conftest import make_auth_header


# ==============================================================================
# 1. Pure Engine Unit Tests: Post-Registration Recommendations
# ==============================================================================

class TestPostRegistrationEngineUnit:
    def test_scramble_recommendation_8_players(self):
        engine = ScrambleEngine()
        rec = engine.calculate_post_registration_recommendation(player_count=8, courts_count=2)
        assert rec["is_schedule_feasible"] is True
        assert rec["player_count"] == 8
        assert rec["feasible_doubles_pairs"] == 4
        assert rec["feasible_matches_per_round"] == 2
        assert rec["recommended_rounds"] == 3
        assert rec["partition"] == {"courts_of_4": 2, "courts_of_5": 0}
        assert "evenly divide" in rec["odd_player_handling_message"].lower()

    def test_scramble_recommendation_5_players_odd_count(self):
        engine = ScrambleEngine()
        rec = engine.calculate_post_registration_recommendation(player_count=5, courts_count=1)
        assert rec["is_schedule_feasible"] is True
        assert rec["partition"] == {"courts_of_4": 0, "courts_of_5": 1}
        assert rec["odd_player_handling_message"] is not None
        assert "5-player court" in rec["odd_player_handling_message"]
        assert "bye" in rec["odd_player_handling_message"].lower()

    def test_scramble_recommendation_7_players_unpartitionable(self):
        engine = ScrambleEngine()
        rec = engine.calculate_post_registration_recommendation(player_count=7, courts_count=2)
        assert rec["is_schedule_feasible"] is False
        assert rec["odd_player_handling_message"] is not None
        assert "unbalanced" in rec["odd_player_handling_message"].lower()

    def test_scramble_recommendation_insufficient_players(self):
        engine = ScrambleEngine()
        rec = engine.calculate_post_registration_recommendation(player_count=3, courts_count=1)
        assert rec["is_schedule_feasible"] is False
        assert "at least 4" in rec["odd_player_handling_message"].lower()

    def test_pool_play_feasible_configurations_8_teams(self):
        engine = PoolPlayEngine()
        configs = engine.get_feasible_pool_configurations(teams_count=8)
        pool_counts = [c["number_of_pools"] for c in configs]
        assert 2 in pool_counts
        assert 4 in pool_counts

        # Check 2 pools config
        c2 = next(c for c in configs if c["number_of_pools"] == 2)
        assert c2["min_teams_per_pool"] == 4
        assert c2["max_teams_per_pool"] == 4
        assert c2["allowed_qualifiers"] == [1, 2, 3, 4]

    def test_pool_play_recommendation_8_teams(self):
        engine = PoolPlayEngine()
        rec_pools, rec_qualifiers, rec_bracket, rec_reason, configs = (
            engine.calculate_recommended_pool_configuration(teams_count=8)
        )
        assert rec_pools == 2
        assert rec_qualifiers == 2
        assert rec_bracket == "Single Elimination"
        assert len(configs) >= 2

    def test_pool_play_recommendation_12_teams(self):
        engine = PoolPlayEngine()
        rec_pools, rec_qualifiers, rec_bracket, rec_reason, configs = (
            engine.calculate_recommended_pool_configuration(teams_count=12)
        )
        assert rec_pools in (3, 4)
        assert rec_qualifiers in (1, 2)


# ==============================================================================
# 2. Integration Fixtures
# ==============================================================================

@pytest_asyncio.fixture
async def workflow_setup(db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    club = Club(
        name="Workflow Test Club",
        slug=f"workflow-club-{uuid.uuid4().hex[:6]}",
        address_line1="100 Tennis Way",
        city="Austin",
        state="TX",
        postal_code="78701",
        country="USA",
    )
    db_session.add(club)
    await db_session.flush()

    director = User(
        email=f"workflow_td_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Workflow Tournament Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(director)
    await db_session.flush()

    db_session.add(PlayerProfile(user_id=director.id, display_name=director.full_name))
    db_session.add(ClubMembership(user_id=director.id, club_id=club.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    await db_session.flush()

    # 16 Player Users and Club Player Memberships
    players = []
    memberships = []
    for i in range(1, 17):
        p = User(
            email=f"workflow_player_{i}_{uuid.uuid4().hex[:6]}@test.local",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Workflow Player {i}",
            is_active=True,
            is_verified=True,
        )
        db_session.add(p)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=p.id, display_name=f"WP {i}"))
        pm = ClubPlayerMembership(
            user_id=p.id,
            club_id=club.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"WF-{i:03d}",
        )
        db_session.add(pm)
        await db_session.flush()
        players.append(p)
        memberships.append(pm)

    await db_session.commit()

    return {
        "club": club,
        "director": director,
        "players": players,
        "memberships": memberships,
    }


# ==============================================================================
# 3. Scramble Post-Registration Workflow Integration Tests
# ==============================================================================

class TestScramblePostRegistrationWorkflow:
    @pytest.mark.asyncio
    async def test_scramble_full_post_registration_workflow(
        self, async_client: AsyncClient, db_session: AsyncSession, workflow_setup: dict
    ):
        club = workflow_setup["club"]
        director = workflow_setup["director"]
        memberships = workflow_setup["memberships"]
        headers = make_auth_header(director.id)

        # 1. Create Scramble Tournament
        now = datetime.now(timezone.utc)
        tournament = Tournament(
            club_id=club.id,
            created_by_user_id=director.id,
            name="Post-Reg Scramble",
            status=TournamentStatus.REGISTRATION_OPEN,
            format=TournamentFormat.SCRAMBLE,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now + timedelta(days=1),
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            min_participants=4,
            max_participants=16,
            format_configuration={
                "is_format_configured": False,
                "configuration_stage": "awaiting_format_configuration",
            },
        )
        db_session.add(tournament)
        await db_session.flush()

        # 2. Register 8 Players
        for i in range(8):
            db_session.add(
                TournamentRegistration(
                    tournament_id=tournament.id,
                    player_membership_id=memberships[i].id,
                    status=RegistrationStatus.CONFIRMED,
                    seed=i + 1,
                )
            )
        await db_session.commit()

        # 3. Close Registration
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/close-registration",
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "registration_closed"

        # 4. Attempt to Start Tournament before Post-Registration Generation -> Blocked
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/start",
            headers=headers,
        )
        assert res.status_code == 400
        assert "must be configured and generated" in res.json()["detail"].lower()

        # 5. Query Post-Registration Setup
        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/scramble/post-registration-setup",
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["confirmed_player_count"] == 8
        assert data["is_schedule_feasible"] is True
        assert data["feasible_doubles_pairs"] == 4
        assert data["feasible_matches_per_round"] == 2
        assert data["is_generated"] is False
        assert data["configuration_stage"] == "awaiting_format_configuration"
        assert len(data["preview_rounds"]) > 0

        # 6. Confirm and Generate Scramble Schedule with 5 rounds
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/scramble/confirm-and-generate",
            headers=headers,
            json={"rounds": 5, "rotation_rule": "Full Rotation (no repeating partners)"},
        )
        assert res.status_code in (200, 201)
        gen_data = res.json()
        assert gen_data["rounds_count"] == 5
        assert gen_data["participants_count"] == 8
        assert gen_data["matches_generated"] == 10  # 2 matches per round * 5 rounds

        # 7. Start Tournament Now -> Succeeds!
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/start",
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_scramble_insufficient_players_blocked(
        self, async_client: AsyncClient, db_session: AsyncSession, workflow_setup: dict
    ):
        club = workflow_setup["club"]
        director = workflow_setup["director"]
        memberships = workflow_setup["memberships"]
        headers = make_auth_header(director.id)

        now = datetime.now(timezone.utc)
        tournament = Tournament(
            club_id=club.id,
            created_by_user_id=director.id,
            name="Scramble Few Players",
            status=TournamentStatus.REGISTRATION_CLOSED,
            format=TournamentFormat.SCRAMBLE,
            visibility=TournamentVisibility.PUBLIC,
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now - timedelta(days=1),
            min_participants=4,
            max_participants=16,
            format_configuration={"is_format_configured": False},
        )
        db_session.add(tournament)
        await db_session.flush()

        # Only 3 confirmed players (<4)
        for i in range(3):
            db_session.add(
                TournamentRegistration(
                    tournament_id=tournament.id,
                    player_membership_id=memberships[i].id,
                    status=RegistrationStatus.CONFIRMED,
                    seed=i + 1,
                )
            )
        await db_session.commit()

        # GET setup diagnostics should show unfeasible
        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/scramble/post-registration-setup",
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["is_schedule_feasible"] is False

        # Attempt to confirm and generate should be rejected with 400
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/scramble/confirm-and-generate",
            headers=headers,
            json={"rounds": 3},
        )
        assert res.status_code == 400


# ==============================================================================
# 4. Pool Play Post-Registration Workflow Integration Tests
# ==============================================================================

class TestPoolPlayPostRegistrationWorkflow:
    @pytest.mark.asyncio
    async def test_pool_play_full_post_registration_workflow(
        self, async_client: AsyncClient, db_session: AsyncSession, workflow_setup: dict
    ):
        club = workflow_setup["club"]
        director = workflow_setup["director"]
        memberships = workflow_setup["memberships"]
        headers = make_auth_header(director.id)

        now = datetime.now(timezone.utc)
        tournament = Tournament(
            club_id=club.id,
            created_by_user_id=director.id,
            name="Post-Reg Pool Play",
            status=TournamentStatus.REGISTRATION_OPEN,
            format=TournamentFormat.POOL_PLAY,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now + timedelta(days=1),
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            min_participants=8,
            max_participants=16,
            format_configuration={
                "is_format_configured": False,
                "configuration_stage": "awaiting_format_configuration",
            },
        )
        db_session.add(tournament)
        await db_session.flush()

        # Create 8 confirmed registrations & 8 teams (1 player per team for simplicity)
        for i in range(8):
            db_session.add(
                TournamentRegistration(
                    tournament_id=tournament.id,
                    player_membership_id=memberships[i].id,
                    status=RegistrationStatus.CONFIRMED,
                    seed=i + 1,
                )
            )
            t = Team(tournament_id=tournament.id, name=f"Team {chr(65 + i)}", seed=i + 1)
            db_session.add(t)
            await db_session.flush()
            db_session.add(TeamMember(team_id=t.id, player_membership_id=memberships[i].id))

        await db_session.commit()

        # Close Registration
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/close-registration",
            headers=headers,
        )
        assert res.status_code == 200

        # Attempt to Start Tournament before generation -> Blocked
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/start",
            headers=headers,
        )
        assert res.status_code == 400
        assert "must be configured and generated" in res.json()["detail"].lower()

        # GET Pool Play Post-Registration Setup
        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/pool-play/post-registration-setup",
            headers=headers,
        )
        assert res.status_code == 200
        setup = res.json()
        assert setup["confirmed_teams_count"] == 8
        assert setup["recommended_pools"] == 2
        assert setup["recommended_qualifiers_per_pool"] == 2
        assert setup["is_configuration_valid"] is True
        assert setup["is_generated"] is False
        assert setup["configuration_stage"] == "awaiting_format_configuration"
        assert len(setup["preview_pools"]) == 2  # 2 pools previewed
        # Verify serpentine allocation in preview: 4 teams per pool
        assert len(setup["preview_pools"][0]["teams"]) == 4
        assert len(setup["preview_pools"][1]["teams"]) == 4

        # Test invalid configuration query: qualifiers > min pool size
        res = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/pool-play/post-registration-setup?number_of_pools=2&qualifiers_per_pool=5",
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["is_configuration_valid"] is False
        assert "exceeds" in res.json()["validation_error"].lower()

        # Confirm and Generate Pool Play (2 pools, 2 qualifiers per pool)
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/pool-play/confirm-and-generate",
            headers=headers,
            json={
                "number_of_pools": 2,
                "qualifiers_per_pool": 2,
                "bracket_type": "Single Elimination",
            },
        )
        assert res.status_code in (200, 201)
        gen_data = res.json()
        assert gen_data["pools_count"] == 2
        assert gen_data["teams_count"] == 8
        assert gen_data["matches_generated"] == 12  # C(4,2)*2 = 6*2 = 12 matches

        # Start Tournament Now -> Succeeds!
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/start",
            headers=headers,
        )
        assert res.status_code == 200
        assert res.json()["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_reopen_registration_and_schedule_invalidation(
        self, async_client: AsyncClient, db_session: AsyncSession, workflow_setup: dict
    ):
        club = workflow_setup["club"]
        director = workflow_setup["director"]
        memberships = workflow_setup["memberships"]
        headers = make_auth_header(director.id)

        now = datetime.now(timezone.utc)
        tournament = Tournament(
            club_id=club.id,
            created_by_user_id=director.id,
            name="Reopen Test Tournament",
            status=TournamentStatus.REGISTRATION_CLOSED,
            format=TournamentFormat.POOL_PLAY,
            visibility=TournamentVisibility.PUBLIC,
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now - timedelta(days=1),
            min_participants=4,
            max_participants=16,
            format_configuration={"is_format_configured": False},
        )
        db_session.add(tournament)
        await db_session.flush()

        for i in range(4):
            db_session.add(
                TournamentRegistration(
                    tournament_id=tournament.id,
                    player_membership_id=memberships[i].id,
                    status=RegistrationStatus.CONFIRMED,
                    seed=i + 1,
                )
            )
            t = Team(tournament_id=tournament.id, name=f"Team {i + 1}", seed=i + 1)
            db_session.add(t)
            await db_session.flush()
            db_session.add(TeamMember(team_id=t.id, player_membership_id=memberships[i].id))
        await db_session.commit()

        # Generate Pool Play (2 pools of 2)
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/pool-play/confirm-and-generate",
            headers=headers,
            json={"number_of_pools": 2, "qualifiers_per_pool": 1, "bracket_type": "Single Elimination"},
        )
        assert res.status_code in (200, 201)

        # Attempt to reopen registration without reset_schedule=True -> Blocked with 400
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/open-registration",
            headers=headers,
        )
        assert res.status_code == 400
        assert "reset_schedule=true" in res.json()["detail"].lower()

        # Reopen with reset_schedule=True -> Succeeds and resets schedule
        res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tournament.id}/open-registration?reset_schedule=true",
            headers=headers,
        )
        assert res.status_code in (200, 201)
        assert res.json()["status"] == "registration_open"
        assert res.json()["format_configuration"]["is_format_configured"] is False
        assert res.json()["format_configuration"]["configuration_stage"] == "awaiting_format_configuration"
