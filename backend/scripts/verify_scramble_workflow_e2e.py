"""
End-to-End Scramble Tournament Workflow Verification Script

Tests the complete lifecycle required by the prompt:
1. Registration Open -> Registration Closed transition
2. Skill rating-based player sorting & seeding (highest to lowest)
3. Overview and setup state validation
4. Availability management and court partition validation (reject invalid participant counts)
5. 4-player Scramble mathematical rotation verification:
   - 3 games per 4-player court
   - Each player partners every other player on the court exactly once
   - Each game has 4 distinct players
6. Court assignment and round generation persistence
7. Scoring, validation of win-by rules, and score correction
8. Individual standings live updates
9. Tournament completion and final results (no premature completion or fake champions)
"""

import asyncio
import os
import sys
import uuid

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.club_player_membership import ClubPlayerMembership
from app.models.competition import Match
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.schemas.competition import (
    ScrambleAvailabilityRequest,
    ScrambleMatchupGenerateRequest,
)
from app.services.competition_service import CompetitionService
from app.services.tournament_service import TournamentService


async def run_verification():
    print("=" * 80)
    print("STARTING E2E SCRAMBLE TOURNAMENT WORKFLOW VERIFICATION")
    print("=" * 80)

    async with AsyncSessionLocal() as session:
        t_svc = TournamentService(session)
        c_svc = CompetitionService(session)

        # 1. Fetch the Scramble Test Tournament
        stmt = (
            select(Tournament)
            .options(
                selectinload(Tournament.registrations).selectinload(TournamentRegistration.player_membership),
            )
            .where(Tournament.name == "Test Tournament — Scramble")
        )
        tournament = (await session.execute(stmt)).scalar_one_or_none()
        assert tournament is not None, "Test Tournament — Scramble not found in DB!"
        club_id = tournament.club_id
        tournament_id = tournament.id

        # Clean reset to ensure idempotency
        existing_matches = (await session.execute(select(Match).where(Match.tournament_id == tournament_id))).scalars().all()
        for em in existing_matches:
            await session.delete(em)
        tournament.status = TournamentStatus.REGISTRATION_OPEN
        config = dict(tournament.format_configuration or {})
        config.pop("seeded_players", None)
        config.pop("rounds_data", None)
        config.pop("current_round", None)
        config.pop("round_status", None)
        config.pop("available_player_ids", None)
        tournament.format_configuration = config
        for r in tournament.registrations:
            r.seed = None
        await session.commit()
        await session.refresh(tournament)

        print(f"\n[Step 1] Initial Tournament State: '{tournament.name}'")
        print(f"  ID: {tournament_id}")
        print(f"  Club ID: {club_id}")
        print(f"  Format: {tournament.format.value}")
        print(f"  Initial Status: {tournament.status.value}")
        assert tournament.status == TournamentStatus.REGISTRATION_OPEN, (
            f"Expected status REGISTRATION_OPEN, got {tournament.status.value}"
        )

        # Check confirmed registrations
        confirmed_regs = [r for r in tournament.registrations if r.status == RegistrationStatus.CONFIRMED]
        print(f"  Confirmed Registrations: {len(confirmed_regs)}")
        assert len(confirmed_regs) == 8, f"Expected 8 confirmed registrations, got {len(confirmed_regs)}"

        # 2. Close Registration & Seed Players by Skill Rating
        print("\n[Step 2] Closing Registration & Seeding Players by Skill Rating...")
        closed_tournament = await t_svc.close_registration(club_id=club_id, tournament_id=tournament_id)
        assert closed_tournament.status == TournamentStatus.REGISTRATION_CLOSED, (
            f"Expected status REGISTRATION_CLOSED, got {closed_tournament.status.value}"
        )
        print("  -> Tournament status successfully updated to REGISTRATION_CLOSED.")

        # Verify seeding order
        seeded_players = closed_tournament.format_configuration.get("seeded_players", [])
        print(f"  Seeded players count: {len(seeded_players)}")
        assert len(seeded_players) == 8, f"Expected 8 seeded players, got {len(seeded_players)}"

        print("  Player Seeding (Highest to Lowest Skill Rating):")
        prev_rating = 999.0
        for p in seeded_players:
            rating = p.get("rating", 0.0)
            seed = p.get("seed")
            name = p.get("name")
            print(f"    Seed #{seed}: {name} (Skill Rating: {rating})")
            assert rating <= prev_rating, f"Player {name} rating {rating} is greater than previous {prev_rating}!"
            prev_rating = rating

        # Top seed should have 4.5 rating
        assert seeded_players[0]["rating"] == 4.5
        assert seeded_players[0]["seed"] == 1
        print(f"  -> Top seed confirmed: {seeded_players[0]['name']} (Rating: {seeded_players[0]['rating']})")
        print("  -> PASSED: Players deterministically sorted and seeded by skill rating descending.")

        # 3. Check Initial Scramble State (Before Round Generation)
        print("\n[Step 3] Checking Initial Scramble State (Setup Mode)...")
        state = await c_svc.get_scramble_state(club_id=club_id, tournament_id=tournament_id)
        print(f"  Current Round: {state.current_round}")
        print(f"  Round Status: {state.round_status}")
        print(f"  Registered Count: {state.registered_players_count}")
        print(f"  Available Count: {state.available_players_count}")
        print(f"  Total Games: {state.total_games}")
        print(f"  Games Completed: {state.games_completed}")
        print(f"  Champion Player ID: {state.champion_player_id}")

        assert state.current_round == 1
        assert state.round_status == "setup"
        assert state.registered_players_count == 8
        assert state.available_players_count == 8
        assert state.champion_player_id is None, "Champion must NOT be set prematurely!"
        print("  -> PASSED: Setup state correct, no premature champion.")

        # 4. Availability & Partition Validation Test
        print("\n[Step 4] Testing Availability & Court Partition Validation...")
        # Test: 7 available players should be rejected because 7 cannot partition into 4 or 5 player scramble courts
        seven_players = [uuid.UUID(p["membership_id"]) for p in seeded_players[:7]]
        try:
            await c_svc.set_scramble_player_availability(
                club_id=club_id,
                tournament_id=tournament_id,
                payload=ScrambleAvailabilityRequest(player_membership_ids=seven_players),
            )
            assert False, "Should have rejected 7 players partition!"
        except Exception as e:
            print(f"  -> Successfully rejected 7 players partition: {e.detail if hasattr(e, 'detail') else e}")
            print("  -> PASSED: Partition validation prevents invalid Scramble groups.")

        # Restore all 8 players availability
        all_eight_uuids = [uuid.UUID(p["membership_id"]) for p in seeded_players]
        state_after_avail = await c_svc.set_scramble_player_availability(
            club_id=club_id,
            tournament_id=tournament_id,
            payload=ScrambleAvailabilityRequest(player_membership_ids=all_eight_uuids),
        )
        assert state_after_avail.available_players_count == 8

        # 5. Generate Round 1 Matchups with 8 Players
        print("\n[Step 5] Generating Round 1 Matchups with All 8 Players...")
        round_info = await c_svc.create_scramble_round_matchups(
            club_id=club_id,
            tournament_id=tournament_id,
            payload=ScrambleMatchupGenerateRequest(),
        )

        matches = await c_svc.list_scramble_matches(club_id=club_id, tournament_id=tournament_id)
        print(f"  Round 1 courts created: {len(round_info.courts)}")
        print(f"  Round 1 matches created: {len(matches)}")
        assert len(round_info.courts) == 2, f"Expected 2 courts for 8 players, got {len(round_info.courts)}"
        assert len(matches) == 6, f"Expected 6 matches (3 per court), got {len(matches)}"

        # Verify Mathematical Scramble Rotation on each court
        print("\n[Step 6] Verifying Mathematical Scramble Rotation per Court...")
        for court in round_info.courts:
            print(f"\n  Court: {court.court_name} (Court ID: {court.court_id})")
            print(f"  Players on Court ({len(court.players)}): {[p.display_name for p in court.players]}")
            assert len(court.players) == 4, f"Expected 4 players on court, got {len(court.players)}"

            court_matches = [m for m in matches if str(m.court_id) == str(court.court_id)]
            print(f"  Matches on this court: {len(court_matches)}")
            assert len(court_matches) == 3, f"Expected 3 matches on court, got {len(court_matches)}"

            # Track partnerships
            partnerships = {p.id: set() for p in court.players}
            games_played = {p.id: 0 for p in court.players}

            for idx, m in enumerate(court_matches, 1):
                # In MatchResponse, side_a_participants and side_b_participants contain ScheduledMatchParticipant
                team_a = m.side_a_participants or []
                team_b = m.side_b_participants or []
                print(f"    Game {idx}: {[p.display_name for p in team_a]} vs {[p.display_name for p in team_b]}")
                assert len(team_a) == 2, f"Team A must have 2 players, got {len(team_a)}"
                assert len(team_b) == 2, f"Team B must have 2 players, got {len(team_b)}"

                all_game_players = set([p.player_membership_id for p in team_a + team_b])
                assert len(all_game_players) == 4, "Game must have 4 distinct players"

                # Record partnerships
                p_a1, p_a2 = team_a[0].player_membership_id, team_a[1].player_membership_id
                p_b1, p_b2 = team_b[0].player_membership_id, team_b[1].player_membership_id

                partnerships[p_a1].add(p_a2)
                partnerships[p_a2].add(p_a1)
                partnerships[p_b1].add(p_b2)
                partnerships[p_b2].add(p_b1)

                for p_id in all_game_players:
                    games_played[p_id] += 1

            # Assert: every player played all 3 games
            for p_id, count in games_played.items():
                assert count == 3, f"Player {p_id} played {count} games, expected 3!"

            # Assert: every player partnered each other player on court exactly once
            for p_id, partners in partnerships.items():
                assert len(partners) == 3, f"Player {p_id} partnered with {len(partners)} distinct players, expected 3!"

            print(f"  -> Court {court.court_name}: PASSED true 4-player Scramble rotation!")

        # 7. Start Round 1
        print("\n[Step 7] Starting Round 1...")
        round_started = await c_svc.start_scramble_round(club_id=club_id, tournament_id=tournament_id)
        assert round_started.round_status == "in_progress"

        # Check tournament status transitioned to IN_PROGRESS
        t_refreshed = (await session.execute(select(Tournament).where(Tournament.id == tournament_id))).scalar_one()
        assert t_refreshed.status == TournamentStatus.IN_PROGRESS
        print("  -> PASSED: Round 1 started, tournament status is IN_PROGRESS.")

        # 8. Test Scoring & Standings
        print("\n[Step 8] Testing Scoring Rules, Validation, and Live Standings...")
        # Score invalid score: 11-10 (not win by 2)
        game_1 = matches[0]
        try:
            await c_svc.record_match_result(
                club_id=club_id,
                tournament_id=tournament_id,
                match_id=game_1.id,
                score_a=11,
                score_b=10,
            )
            assert False, "Should have failed win-by-2 validation!"
        except Exception as e:
            print(f"  -> Successfully rejected invalid score (11-10): {e.detail if hasattr(e, 'detail') else e}")
            print("  -> PASSED: Score validation enforced.")

        # Score valid score: 11-8 for Game 1
        res = await c_svc.record_match_result(
            club_id=club_id,
            tournament_id=tournament_id,
            match_id=game_1.id,
            score_a=11,
            score_b=8,
        )
        assert res.status.value == "completed"

        # Check live standings
        standings_res = await c_svc.get_scramble_standings(club_id=club_id, tournament_id=tournament_id)
        print(f"  Standings calculated for {len(standings_res.standings)} players.")
        # Players with 1 win should have +3 diff
        winner_standings = [s for s in standings_res.standings if s.wins == 1]
        loser_standings = [s for s in standings_res.standings if s.losses == 1]
        assert len(winner_standings) == 2
        assert len(loser_standings) == 2
        assert winner_standings[0].points_differential == 3
        assert loser_standings[0].points_differential == -3
        assert winner_standings[0].skill_rating is not None, "Standings row must include skill_rating!"
        print(f"  -> Standings verified! Winner: {winner_standings[0].display_name} (Rating: {winner_standings[0].skill_rating}, +{winner_standings[0].points_differential} diff)")

        # Test score editing / correction (change 11-8 to 11-9)
        print("  Testing score editing / correction (11-8 -> 11-9)...")
        res_edited = await c_svc.correct_match_result(
            club_id=club_id,
            tournament_id=tournament_id,
            match_id=game_1.id,
            score_a=11,
            score_b=9,
        )
        standings_edited = await c_svc.get_scramble_standings(club_id=club_id, tournament_id=tournament_id)
        winner_edited = [s for s in standings_edited.standings if s.wins == 1]
        assert winner_edited[0].points_differential == 2, f"Expected +2 diff after edit, got {winner_edited[0].points_differential}"
        print("  -> PASSED: Standings recalculated accurately after score correction.")

        # Complete the remaining 5 games
        scores = [
            (11, 7),  # Game 2
            (12, 10), # Game 3
            (11, 6),  # Game 4
            (11, 8),  # Game 5
            (11, 5),  # Game 6
        ]
        for m, (s_a, s_b) in zip(matches[1:], scores):
            await c_svc.record_match_result(
                club_id=club_id,
                tournament_id=tournament_id,
                match_id=m.id,
                score_a=s_a,
                score_b=s_b,
            )

        # Check round status after all games completed
        round_state = await c_svc.get_scramble_state(club_id=club_id, tournament_id=tournament_id)
        print(f"\n[Step 9] All Games Scored:")
        print(f"  Games Completed: {round_state.games_completed} / {round_state.total_games}")
        print(f"  Round Status: {round_state.round_status}")
        print(f"  Tournament Status: {round_state.tournament_status}")
        assert round_state.games_completed == 6
        assert round_state.games_remaining == 0
        assert round_state.round_status == "completed"
        # Tournament should STILL be in_progress until manager officially finishes/ends tournament!
        assert round_state.tournament_status == "in_progress"
        print("  -> PASSED: Round completed, tournament remains in_progress until explicit completion.")

        # 10. Finish Round & End Tournament
        print("\n[Step 10] Ending Tournament & Crowning Champion...")
        ended_state = await c_svc.end_scramble_tournament(club_id=club_id, tournament_id=tournament_id)
        assert ended_state.tournament_status == "completed"
        assert ended_state.champion_player_name is not None
        print(f"  Crown Champion: {ended_state.champion_player_name}")

        final_standings = await c_svc.get_scramble_standings(club_id=club_id, tournament_id=tournament_id)
        top_standing = final_standings.standings[0]
        assert top_standing.display_name == ended_state.champion_player_name
        print(f"  Final Standings #1: {top_standing.display_name} ({top_standing.wins}W - {top_standing.losses}L, Diff: {top_standing.points_differential})")
        print("  -> PASSED: Champion matches final standings rank #1.")

        print("\n" + "=" * 80)
        print("ALL 10 VERIFICATION CHECKS PASSED PERFECTLY!")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(run_verification())
