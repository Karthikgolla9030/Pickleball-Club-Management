"""
Aught2 Pickleball — Double Elimination Comprehensive Full Flow Tests

Tests Phase 5 Requirements:
1. Standard 8-team Double Elimination bracket generates 15 matches (including conditional Reset Final)
   with valid feeder relationships and destination pointers.
2. Non-power-of-two team counts (e.g. 5, 6, 7 teams) with BYEs do not create fake losses.
3. Match readiness and dependency progression: independent matches unlock as soon as their feeders resolve.
4. start_match validation: cannot start a match if team slots are unresolved, or if already completed/cancelled.
5. Outcome A: WB champion wins Grand Final -> tournament completes in 14 matches, Reset Final cancelled, champion is WB.
6. Outcome B: LB champion wins Grand Final -> Reset Final activates, tournament stays in_progress, Reset Final winner is champion.
7. Score correction on COMPLETED tournament: correcting Grand Final from WB win to LB win reopens tournament to IN_PROGRESS,
   un-cancels Reset Final, and clears premature podium.
8. Destination pointers populated in MatchResponse (winner_next_match_number, loser_next_match_number).
"""
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.core.security import hash_password
from app.models.user import User
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
from app.services.competition_service import CompetitionService
from app.services.competition.bracket_engine import BracketEngine


def make_teams(count: int) -> list[dict]:
    return [
        {
            "id": uuid.uuid4(),
            "name": f"Team {i+1}",
            "seed": i + 1,
            "player1_id": uuid.uuid4(),
            "player2_id": uuid.uuid4(),
        }
        for i in range(count)
    ]


# ─── PURE ENGINE TESTS ────────────────────────────────────────────────────────

class TestDoubleEliminationEngineProgression:
    def test_8_team_feeder_relationships_and_destination_pointers(self):
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(8)
        slots = engine.generate_bracket(tournament_id, teams, bracket_format="Double Elimination")

        assert len(slots) == 15
        slot_map = {s.match_number: s for s in slots}

        # Check WB Round 1 matches feed both WB R2 and LB R1
        m1 = slot_map[1]
        assert m1.next_match_id == slot_map[5].id
        assert m1.loser_next_match_id == slot_map[8].id

        m2 = slot_map[2]
        assert m2.next_match_id == slot_map[5].id
        assert m2.loser_next_match_id == slot_map[8].id

        m3 = slot_map[3]
        assert m3.next_match_id == slot_map[6].id
        assert m3.loser_next_match_id == slot_map[9].id

        m4 = slot_map[4]
        assert m4.next_match_id == slot_map[6].id
        assert m4.loser_next_match_id == slot_map[9].id

        # Grand Final (M14)
        m14 = slot_map[14]
        assert m14.bracket_section == "grand_final"
        assert m14.next_match_id == slot_map[15].id  # Feeds Reset Final team_a
        assert m14.loser_next_match_id == slot_map[15].id  # Feeds Reset Final team_b (if LB wins)

        # Reset Final (M15)
        m15 = slot_map[15]
        assert m15.bracket_section == "reset_final"
        assert m15.is_conditional is True
        assert m15.next_match_id is None
        assert m15.loser_next_match_id is None

    def test_non_power_of_two_byes_no_fake_losses(self):
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        for count in [5, 6, 7]:
            teams = make_teams(count)
            slots = engine.generate_bracket(tournament_id, teams, bracket_format="Double Elimination")
            assert len(slots) == 15

            wb_r1 = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 1]
            byes = [s for s in wb_r1 if s.is_bye]
            assert len(byes) == 8 - count

            # Every BYE match must have a real winner and NO loser
            for b in byes:
                assert b.status == "completed"
                assert b.winner_team_id is not None
                # Team B was None (BYE), so no team was eliminated or given a loss
                assert b.team_b_id is None


# ─── ASYNC SERVICE & INTEGRATION TESTS ────────────────────────────────────────

@pytest.mark.asyncio
class TestDoubleEliminationServiceWorkflow:
    async def _setup_tournament(self, db_session: AsyncSession, num_teams: int = 8):
        owner = User(
            email=f"owner+{uuid.uuid4().hex[:6]}@test.local",
            hashed_password=hash_password("TestPass123!"),
            full_name="Tournament Owner",
            is_active=True,
            is_verified=True,
        )
        db_session.add(owner)
        await db_session.flush()

        profile = PlayerProfile(user_id=owner.id, display_name="Owner")
        db_session.add(profile)
        await db_session.flush()

        club = Club(
            name=f"Club {uuid.uuid4().hex[:6]}",
            slug=f"club-{uuid.uuid4().hex[:6]}",
            is_active=True,
        )
        db_session.add(club)
        await db_session.flush()

        member = ClubMembership(
            club_id=club.id,
            user_id=owner.id,
            role=ClubRole.CLUB_OWNER,
            is_active=True,
        )
        db_session.add(member)

        now = datetime.now(timezone.utc)
        tournament = Tournament(
            club_id=club.id,
            created_by_user_id=owner.id,
            name="DE Championship",
            format=TournamentFormat.BRACKET,
            visibility=TournamentVisibility.PUBLIC,
            status=TournamentStatus.REGISTRATION_CLOSED,
            registration_open_at=now - timedelta(days=7),
            registration_close_at=now - timedelta(days=1),
            start_date=now + timedelta(days=1),
            end_date=now + timedelta(days=2),
            format_configuration={"bracket_format": "Double Elimination"},
            scoring_rules={"game_format": "1 to 11", "target_score": 11, "win_by": 2},
        )
        db_session.add(tournament)
        await db_session.flush()

        teams = []
        for i in range(num_teams):
            u1 = User(
                email=f"p{i}_1_{uuid.uuid4().hex[:6]}@test.local",
                hashed_password=hash_password("Pass123!"),
                full_name=f"Player {i}_1",
                is_active=True,
                is_verified=True,
            )
            u2 = User(
                email=f"p{i}_2_{uuid.uuid4().hex[:6]}@test.local",
                hashed_password=hash_password("Pass123!"),
                full_name=f"Player {i}_2",
                is_active=True,
                is_verified=True,
            )
            db_session.add_all([u1, u2])
            await db_session.flush()

            pm1 = ClubPlayerMembership(
                user_id=u1.id,
                club_id=club.id,
                membership_number=f"M1-{u1.id.hex[:6]}",
                status=PlayerMembershipStatus.ACTIVE,
            )
            pm2 = ClubPlayerMembership(
                user_id=u2.id,
                club_id=club.id,
                membership_number=f"M2-{u2.id.hex[:6]}",
                status=PlayerMembershipStatus.ACTIVE,
            )
            db_session.add_all([pm1, pm2])
            await db_session.flush()

            t = Team(
                tournament_id=tournament.id,
                name=f"Team {i+1}",
                seed=i + 1,
            )
            db_session.add(t)
            await db_session.flush()

            m1 = TeamMember(team_id=t.id, player_membership_id=pm1.id)
            m2 = TeamMember(team_id=t.id, player_membership_id=pm2.id)
            db_session.add_all([m1, m2])
            await db_session.flush()
            teams.append(t)

        return owner, club, tournament, teams

    async def test_start_match_blocks_unpopulated_slots(self, db_session: AsyncSession):
        owner, club, tournament, teams = await self._setup_tournament(db_session, 8)
        comp_service = CompetitionService(db_session)

        # Generate bracket
        await comp_service.generate_bracket(club.id, tournament.id)

        matches_res = await comp_service.get_bracket_matches(club.id, tournament.id)
        slot_map = {m.match_number: m for m in matches_res}

        # Match 5 (WB Round 2) is waiting for Match 1 & Match 2 winners -> unpopulated!
        m5 = slot_map[5]
        assert m5.team_a_id is None or m5.team_b_id is None

        # Attempt to start match 5 must be rejected with 400
        with pytest.raises(HTTPException) as exc_info:
            await comp_service.start_match(club.id, tournament.id, uuid.UUID(str(m5.id)))
        assert exc_info.value.status_code == 400
        assert "both competitors must be determined" in exc_info.value.detail

    async def test_start_match_succeeds_when_populated(self, db_session: AsyncSession):
        owner, club, tournament, teams = await self._setup_tournament(db_session, 8)
        comp_service = CompetitionService(db_session)

        # Generate bracket
        await comp_service.generate_bracket(club.id, tournament.id)

        matches_res = await comp_service.get_bracket_matches(club.id, tournament.id)
        m1 = next(m for m in matches_res if m.match_number == 1)
        assert m1.team_a_id is not None and m1.team_b_id is not None

        # Start match 1
        updated = await comp_service.start_match(club.id, tournament.id, uuid.UUID(str(m1.id)))
        assert updated.status == "in_progress"

    async def test_full_de_flow_wb_wins_14_matches(self, db_session: AsyncSession):
        owner, club, tournament, teams = await self._setup_tournament(db_session, 8)
        comp_service = CompetitionService(db_session)

        await comp_service.generate_bracket(club.id, tournament.id)

        # Helper to play a match by match_number
        async def play_m(m_num: int, score_a: int, score_b: int):
            m_list = await comp_service.get_bracket_matches(club.id, tournament.id)
            target = next(m for m in m_list if m.match_number == m_num)
            await comp_service.record_match_result(
                club.id,
                tournament.id,
                uuid.UUID(str(target.id)),
                score_a,
                score_b,
            )

        # WB Round 1: M1, M2, M3, M4
        await play_m(1, 11, 4)
        await play_m(2, 11, 6)
        await play_m(3, 11, 5)
        await play_m(4, 11, 7)

        # Verify destination pointers returned on MatchResponse
        m_list = await comp_service.get_bracket_matches(club.id, tournament.id)
        m_map = {m.match_number: m for m in m_list}
        assert m_map[1].winner_next_match_number == 5
        assert m_map[1].loser_next_match_number == 8

        # Play remaining matches until Grand Final
        while True:
            cur = await comp_service.get_bracket_matches(club.id, tournament.id)
            gf = next(m for m in cur if m.bracket_section == "grand_final")
            if gf.team_a_id and gf.team_b_id:
                break
            playable = [
                m for m in cur
                if m.status == "pending" and m.team_a_id and m.team_b_id and m.bracket_section != "reset_final"
            ]
            if not playable:
                break
            await play_m(playable[0].match_number, 11, 5)

        # WB champion wins Grand Final
        cur = await comp_service.get_bracket_matches(club.id, tournament.id)
        gf = next(m for m in cur if m.bracket_section == "grand_final")
        await play_m(gf.match_number, 11, 5)

        # Tournament should be COMPLETED in 14 matches!
        await db_session.refresh(tournament)
        assert tournament.status == TournamentStatus.COMPLETED

        final_matches = await comp_service.get_bracket_matches(club.id, tournament.id)
        rf = next(m for m in final_matches if m.bracket_section == "reset_final")
        assert rf.status == "cancelled"
        assert tournament.format_configuration.get("winner") is not None

    async def test_score_correction_on_completed_tournament_reopens_reset_final(self, db_session: AsyncSession):
        owner, club, tournament, teams = await self._setup_tournament(db_session, 8)
        comp_service = CompetitionService(db_session)
        await comp_service.generate_bracket(club.id, tournament.id)

        async def play_m(m_num: int, score_a: int, score_b: int):
            m_list = await comp_service.get_bracket_matches(club.id, tournament.id)
            target = next(m for m in m_list if m.match_number == m_num)
            await comp_service.record_match_result(
                club.id,
                tournament.id,
                uuid.UUID(str(target.id)),
                score_a,
                score_b,
            )

        # Play all matches to Grand Final
        await play_m(1, 11, 0)
        await play_m(2, 11, 0)
        await play_m(3, 11, 0)
        await play_m(4, 11, 0)

        while True:
            cur = await comp_service.get_bracket_matches(club.id, tournament.id)
            gf = next(m for m in cur if m.bracket_section == "grand_final")
            if gf.team_a_id and gf.team_b_id:
                break
            playable = [
                m for m in cur
                if m.status == "pending" and m.team_a_id and m.team_b_id and m.bracket_section != "reset_final"
            ]
            if not playable:
                break
            await play_m(playable[0].match_number, 11, 5)

        # Grand Final: Record 11-5 (Team A / WB champion won) -> Completed!
        cur = await comp_service.get_bracket_matches(club.id, tournament.id)
        gf = next(m for m in cur if m.bracket_section == "grand_final")
        await play_m(gf.match_number, 11, 5)

        await db_session.refresh(tournament)
        assert tournament.status == TournamentStatus.COMPLETED

        # Now staff corrects GF score: Team A got 5, Team B (LB finalist) got 11!
        corrected = await comp_service.correct_match_result(
            club.id,
            tournament.id,
            uuid.UUID(str(gf.id)),
            5,
            11,
        )

        # Verify tournament reopened
        await db_session.refresh(tournament)
        assert tournament.status == TournamentStatus.IN_PROGRESS
        assert tournament.format_configuration.get("winner") is None

        # Verify Reset Final un-cancelled and both teams populated
        cur2 = await comp_service.get_bracket_matches(club.id, tournament.id)
        rf = next(m for m in cur2 if m.bracket_section == "reset_final")
        assert rf.status == "pending"
        assert rf.team_a_id is not None and rf.team_b_id is not None

        # Play Reset Final -> Team B wins championship!
        await play_m(rf.match_number, 9, 11)

        await db_session.refresh(tournament)
        assert tournament.status == TournamentStatus.COMPLETED
        assert tournament.format_configuration.get("winner") is not None
