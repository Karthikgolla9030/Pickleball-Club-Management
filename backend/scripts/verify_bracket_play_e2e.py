"""
Comprehensive End-to-End Verification Script for Bracket Play Tournament Lifecycle:
Scenarios Tested:
  - Scenario A: Singles tournament (4 players, auto-team creation, rating seeding, match generation, score recording, winner progression, standings check, completion)
  - Scenario B: Doubles tournament (4 teams, rating calculation, seeding 1..4, match generation, court assignment)
  - Scenario C: Non-power-of-two (6 teams, 2 BYEs assigned to seeds 1 and 2, verify auto-advance)
  - Scenario D: Single Elimination with Consolation (3rd place match played, verify both 1st/2nd and 3rd/4th placements in standings)
  - Scenario E: Double Elimination (losers bracket progression, Grand Final, and Reset Final)
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Match, MatchStatus, Team, TeamMember
from app.models.court import Court
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus, TournamentVisibility
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from app.services.competition_service import CompetitionService
from app.services.tournament_service import TournamentService


def print_step(title: str):
    print(f"\n{'='*75}\n[STEP] {title}\n{'='*75}")


async def create_test_fixture(session):
    """Creates a temporary isolated Club, Director, Courts, and 8 Player Profiles with distinct ratings."""
    now = datetime.now(timezone.utc)
    tag = uuid.uuid4().hex[:6]

    # Club
    club = Club(
        name=f"E2E Bracket Club {tag}",
        slug=f"e2e-bracket-{tag}",
        created_at=now,
    )
    session.add(club)
    await session.flush()

    # Courts
    c1 = Court(club_id=club.id, name="Center Court", court_number=1, is_active=True)
    c2 = Court(club_id=club.id, name="Show Court 2", court_number=2, is_active=True)
    session.add_all([c1, c2])

    # Director
    director = User(
        email=f"director_{tag}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name=f"Director {tag}",
        is_active=True,
    )
    session.add(director)
    await session.flush()

    dir_mem = ClubMembership(
        club_id=club.id,
        user_id=director.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    session.add(dir_mem)

    # 8 Players with ratings
    ratings = [4.5, 4.0, 3.8, 3.5, 3.2, 3.0, 2.8, 2.5]
    players = []
    memberships = []

    for i, rating in enumerate(ratings):
        p_user = User(
            email=f"player_{i}_{tag}@test.local",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Player {i+1} ({rating})",
            is_active=True,
        )
        session.add(p_user)
        await session.flush()

        profile = PlayerProfile(
            user_id=p_user.id,
            display_name=f"P{i+1}_{rating}",
            skill_rating=rating,
        )
        session.add(profile)

        mem = ClubPlayerMembership(
            club_id=club.id,
            user_id=p_user.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"MEM-{tag}-{i+1}",
        )
        session.add(mem)
        await session.flush()

        players.append(p_user)
        memberships.append(mem)

    await session.commit()
    return club, director, players, memberships


async def cleanup_fixture(club_id: uuid.UUID):
    """Clean up the isolated test club and all related records."""
    async with AsyncSessionLocal() as session:
        t_ids = (
            await session.execute(
                select(Tournament.id).where(Tournament.club_id == club_id)
            )
        ).scalars().all()

        for tid in t_ids:
            await session.execute(delete(Match).where(Match.tournament_id == tid))
            await session.execute(
                delete(TeamMember).where(
                    TeamMember.team_id.in_(
                        select(Team.id).where(Team.tournament_id == tid)
                    )
                )
            )
            await session.execute(delete(Team).where(Team.tournament_id == tid))
            await session.execute(
                delete(TournamentRegistration).where(TournamentRegistration.tournament_id == tid)
            )
            await session.execute(delete(Tournament).where(Tournament.id == tid))

        await session.execute(delete(Court).where(Court.club_id == club_id))
        await session.execute(delete(ClubPlayerMembership).where(ClubPlayerMembership.club_id == club_id))
        await session.execute(delete(ClubMembership).where(ClubMembership.club_id == club_id))
        await session.execute(delete(Club).where(Club.id == club_id))
        await session.commit()


async def verify_scenario_a_singles():
    """Scenario A: Singles Tournament Lifecycle (auto-team creation, rating seeding, match generation, score recording, winner progression, standings check, completion)."""
    print_step("Scenario A: Singles Tournament Lifecycle")
    async with AsyncSessionLocal() as session:
        club, director, players, memberships = await create_test_fixture(session)

    try:
        async with AsyncSessionLocal() as session:
            t_svc = TournamentService(session)
            c_svc = CompetitionService(session)
            now = datetime.now(timezone.utc)

            # 1. Create Singles Bracket Tournament
            t = Tournament(
                club_id=club.id,
                created_by_user_id=director.id,
                name="E2E Singles Bracket Championship",
                format=TournamentFormat.BRACKET,
                status=TournamentStatus.REGISTRATION_OPEN,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=1),
                end_date=now + timedelta(days=2),
                registration_open_at=now - timedelta(days=1),
                registration_close_at=now + timedelta(hours=1),
                min_participants=4,
                max_participants=4,
                format_configuration={"bracket_format": "single_elimination", "category": "Men's Singles"},
            )
            session.add(t)
            await session.commit()
            await session.refresh(t)
            print(f"[OK] Created tournament: {t.name} (ID: {t.id})")

            # 2. Register 4 Players with ratings: 4.5, 3.0, 4.0, 3.5
            selected_indices = [0, 5, 1, 3]  # ratings: 4.5, 3.0, 4.0, 3.5
            for idx in selected_indices:
                mem = memberships[idx]
                reg = TournamentRegistration(
                    tournament_id=t.id,
                    player_membership_id=mem.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=now,
                )
                session.add(reg)
            await session.commit()
            print(f"[OK] Registered 4 singles players with ratings: 4.5, 3.0, 4.0, 3.5")

            # 3. Close Registration (triggers finalize_registrations_and_seed)
            await t_svc.close_registration(club_id=club.id, tournament_id=t.id)
            await session.refresh(t)
            assert t.status == TournamentStatus.REGISTRATION_CLOSED, "Tournament should be REGISTRATION_CLOSED"
            print("[OK] Registration closed successfully.")

            # Verify auto-teams created and sorted by rating descending
            teams = await c_svc.list_teams(club_id=club.id, tournament_id=t.id)
            assert len(teams) == 4, f"Expected 4 teams, found {len(teams)}"
            print(f"[OK] 4 single-player teams created automatically:")
            for tm in teams:
                print(f"     Seed {tm.seed}: {tm.name} (Members: {len(tm.members)})")

            # Check seeds order: Seed 1 = rating 4.5, Seed 2 = 4.0, Seed 3 = 3.5, Seed 4 = 3.0
            seeds_map = {tm.seed: tm for tm in teams}
            assert seeds_map[1].members[0].skill_rating == 4.5, f"Seed 1 should have 4.5 rating, got {seeds_map[1].members[0].skill_rating}"
            assert seeds_map[2].members[0].skill_rating == 4.0, f"Seed 2 should have 4.0 rating, got {seeds_map[2].members[0].skill_rating}"
            assert seeds_map[3].members[0].skill_rating == 3.5, f"Seed 3 should have 3.5 rating, got {seeds_map[3].members[0].skill_rating}"
            assert seeds_map[4].members[0].skill_rating == 3.0, f"Seed 4 should have 3.0 rating, got {seeds_map[4].members[0].skill_rating}"
            print("[OK] Seeding by skill rating verified: 1=4.5, 2=4.0, 3=3.5, 4=3.0")

            # 4. Generate Bracket
            gen_resp = await c_svc.generate_bracket(
                club_id=club.id,
                tournament_id=t.id,
            )
            print(f"[OK] Bracket generated: {gen_resp.matches_generated} matches across {gen_resp.rounds_count} rounds")
            assert gen_resp.matches_generated == 3, f"Expected 3 matches, got {gen_resp.matches_generated}"
            assert gen_resp.rounds_count == 2, f"Expected 2 rounds, got {gen_resp.rounds_count}"

            # 5. Verify match tree wiring
            matches = await c_svc.get_bracket_matches(club_id=club.id, tournament_id=t.id)
            r1_matches = [m for m in matches if m.bracket_round == 1]
            r2_matches = [m for m in matches if m.bracket_round == 2]
            assert len(r1_matches) == 2, "Expected 2 Round 1 matches"
            assert len(r2_matches) == 1, "Expected 1 Round 2 (Final) match"

            # R1 M1: Seed 1 vs Seed 4
            m1 = r1_matches[0]
            assert m1.team_a.seed == 1 and m1.team_b.seed == 4, f"M1 pairing error: {m1.team_a.seed} vs {m1.team_b.seed}"
            # R1 M2: Seed 2 vs Seed 3
            m2 = r1_matches[1]
            assert m2.team_a.seed == 2 and m2.team_b.seed == 3, f"M2 pairing error: {m2.team_a.seed} vs {m2.team_b.seed}"
            final_match = r2_matches[0]
            assert final_match.team_a is None and final_match.team_b is None, "Final teams should initially be empty"
            print("[OK] Round 1 pairings verified: Seed 1 vs Seed 4, Seed 2 vs Seed 3")

            # 6. Play Round 1 Match 1 (Seed 1 wins 11-5)
            res1 = await c_svc.record_match_result(
                club_id=club.id,
                tournament_id=t.id,
                match_id=m1.id,
                score_a=11,
                score_b=5,
            )
            assert res1.winner_team_id == m1.team_a_id, "Seed 1 must be winner of M1"
            print("[OK] M1 recorded: Seed 1 defeated Seed 4 (11-5)")

            # Check winner advanced to Final slot 1
            updated_final = await c_svc.get_match(club_id=club.id, tournament_id=t.id, match_id=final_match.id)
            assert updated_final.team_a_id == m1.team_a_id, "Seed 1 not advanced to Final slot 1"
            print("[OK] Winner progression verified: Seed 1 advanced to Final (slot 1)")

            # 7. Play Round 1 Match 2 (Seed 2 wins 11-8)
            res2 = await c_svc.record_match_result(
                club_id=club.id,
                tournament_id=t.id,
                match_id=m2.id,
                score_a=11,
                score_b=8,
            )
            assert res2.winner_team_id == m2.team_a_id, "Seed 2 must be winner of M2"
            print("[OK] M2 recorded: Seed 2 defeated Seed 3 (11-8)")

            # Check winner advanced to Final slot 2
            updated_final = await c_svc.get_match(club_id=club.id, tournament_id=t.id, match_id=final_match.id)
            assert updated_final.team_b_id == m2.team_a_id, "Seed 2 not advanced to Final slot 2"
            assert updated_final.status == MatchStatus.PENDING, "Final should now be PENDING"
            print("[OK] Winner progression verified: Seed 2 advanced to Final (slot 2)")

            # 8. Play Final Match (Seed 1 beats Seed 2: 11-9)
            res_final = await c_svc.record_match_result(
                club_id=club.id,
                tournament_id=t.id,
                match_id=final_match.id,
                score_a=11,
                score_b=9,
            )
            assert res_final.winner_team_id == m1.team_a_id, "Seed 1 must be Champion"
            print("[OK] Final recorded: Seed 1 defeated Seed 2 (11-9)")

            # 9. Verify Tournament is COMPLETED
            await session.refresh(t)
            assert t.status == TournamentStatus.COMPLETED, f"Tournament should be COMPLETED, got {t.status}"
            print("[OK] Tournament auto-transitioned to COMPLETED")

            # 10. Verify Standings
            standings_resp = await c_svc.get_standings(club_id=club.id, tournament_id=t.id)
            standings = standings_resp.standings
            print("[OK] Elimination Standings:")
            for row in standings:
                print(f"     Rank {row.rank}: Seed {row.team_seed} {row.team_name} | W-L: {row.wins}-{row.losses} | Status: {row.status}")

            assert standings[0].team_seed == 1 and standings[0].rank == 1 and "Champion" in (standings[0].status or "")
            assert standings[1].team_seed == 2 and standings[1].rank == 2 and "Runner-Up" in (standings[1].status or "")
            assert standings[2].rank >= 3 and ("Semifinalist" in (standings[2].status or "") or "Round 1" in (standings[2].status or ""))
            assert standings[3].rank >= 3 and ("Semifinalist" in (standings[3].status or "") or "Round 1" in (standings[3].status or ""))
            print("[OK] Standings verified with correct Ranks and Statuses!")

            # 11. Verify Bracket Summary
            summary = await c_svc.get_bracket_summary(club_id=club.id, tournament_id=t.id)
            assert summary.champion_team_id == m1.team_a_id, "Champion team ID mismatch"
            assert summary.matches_played == 3, f"Expected 3 matches played, got {summary.matches_played}"
            assert summary.matches_remaining == 0, f"Expected 0 remaining, got {summary.matches_remaining}"
            print(f"[OK] Bracket Summary: Champion is '{summary.champion_team_name}' | Total: {summary.matches_total} | Remaining: {summary.matches_remaining}")

    finally:
        await cleanup_fixture(club.id)
        print("[OK] Cleaned up Scenario A fixtures.\n")


async def verify_scenario_b_doubles_ratings():
    """Scenario B: Doubles tournament (4 teams, rating calculation, seeding 1..4, match generation, court assignment)."""
    print_step("Scenario B: Doubles Tournament (Team Average Ratings & Court Assignment)")
    async with AsyncSessionLocal() as session:
        club, director, players, memberships = await create_test_fixture(session)

    try:
        async with AsyncSessionLocal() as session:
            t_svc = TournamentService(session)
            c_svc = CompetitionService(session)
            now = datetime.now(timezone.utc)

            t = Tournament(
                club_id=club.id,
                created_by_user_id=director.id,
                name="E2E Doubles Rating Seeding Championship",
                format=TournamentFormat.BRACKET,
                status=TournamentStatus.REGISTRATION_OPEN,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=1),
                end_date=now + timedelta(days=2),
                registration_open_at=now - timedelta(days=1),
                registration_close_at=now + timedelta(hours=1),
                min_participants=8,
                max_participants=8,
                format_configuration={"bracket_format": "single_elimination", "category": "Mixed Doubles"},
            )
            session.add(t)
            await session.commit()
            await session.refresh(t)

            # Pairs of players with known skill ratings:
            # Pair A: [0, 1] -> 4.5 + 4.0 = avg 4.25
            # Pair B: [2, 3] -> 3.8 + 3.5 = avg 3.65
            # Pair C: [4, 5] -> 3.2 + 3.0 = avg 3.10
            # Pair D: [6, 7] -> 2.8 + 2.5 = avg 2.65
            pairs = [
                ("Team A (4.25)", [memberships[0], memberships[1]], 4.25),
                ("Team B (3.65)", [memberships[2], memberships[3]], 3.65),
                ("Team C (3.10)", [memberships[4], memberships[5]], 3.10),
                ("Team D (2.65)", [memberships[6], memberships[7]], 2.65),
            ]

            # Register them in reverse order so we ensure sorting works by rating descending!
            for name, pair_mems, expected_avg in reversed(pairs):
                tm = Team(tournament_id=t.id, name=name, seed=None)
                session.add(tm)
                await session.flush()
                for m in pair_mems:
                    tm_mem = TeamMember(team_id=tm.id, player_membership_id=m.id)
                    session.add(tm_mem)
                    reg = TournamentRegistration(
                        tournament_id=t.id,
                        player_membership_id=m.id,
                        status=RegistrationStatus.CONFIRMED,
                        registered_at=now,
                    )
                    session.add(reg)
            await session.commit()

            # Close registration -> triggers finalize_registrations_and_seed
            await t_svc.close_registration(club_id=club.id, tournament_id=t.id)

            # Check seeds
            teams = await c_svc.list_teams(club_id=club.id, tournament_id=t.id)
            teams_by_seed = {tm.seed: tm for tm in teams}
            assert teams_by_seed[1].name == "Team A (4.25)", f"Seed 1 should be Team A, got {teams_by_seed[1].name}"
            assert teams_by_seed[2].name == "Team B (3.65)", f"Seed 2 should be Team B, got {teams_by_seed[2].name}"
            assert teams_by_seed[3].name == "Team C (3.10)", f"Seed 3 should be Team C, got {teams_by_seed[3].name}"
            assert teams_by_seed[4].name == "Team D (2.65)", f"Seed 4 should be Team D, got {teams_by_seed[4].name}"
            print("[OK] Doubles team seeding correctly computed average player ratings and sorted descending!")

            # Generate bracket and verify court assignments
            await c_svc.generate_bracket(
                club_id=club.id,
                tournament_id=t.id,
            )
            matches = await c_svc.get_bracket_matches(club_id=club.id, tournament_id=t.id)
            r1_matches = [m for m in matches if m.bracket_round == 1]
            for m in r1_matches:
                assert m.court_id is not None, f"Match {m.id} should have court assigned"
                print(f"[OK] Round 1 Match has assigned court_id: {m.court_id}")

    finally:
        await cleanup_fixture(club.id)
        print("[OK] Cleaned up Scenario B fixtures.\n")


async def verify_scenario_c_non_power_of_two_byes():
    """Scenario C: Non-power-of-two (6 teams, 2 BYEs assigned to seeds 1 and 2, verify auto-advance)."""
    print_step("Scenario C: Non-power-of-two (6 Teams, 2 BYEs)")
    async with AsyncSessionLocal() as session:
        club, director, players, memberships = await create_test_fixture(session)

    try:
        async with AsyncSessionLocal() as session:
            c_svc = CompetitionService(session)
            now = datetime.now(timezone.utc)

            t = Tournament(
                club_id=club.id,
                created_by_user_id=director.id,
                name="E2E 6-Team Bracket with BYEs",
                format=TournamentFormat.BRACKET,
                status=TournamentStatus.REGISTRATION_CLOSED,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=1),
                end_date=now + timedelta(days=2),
                registration_open_at=now - timedelta(days=2),
                registration_close_at=now - timedelta(hours=1),
                min_participants=6,
                max_participants=6,
                format_configuration={"bracket_format": "single_elimination", "category": "Singles"},
            )
            session.add(t)
            await session.flush()

            # Create 6 teams with seeds 1..6
            for s in range(1, 7):
                tm = Team(tournament_id=t.id, name=f"Team Seed {s}", seed=s)
                session.add(tm)
                await session.flush()
                session.add(TeamMember(team_id=tm.id, player_membership_id=memberships[s-1].id))
            await session.commit()

            # Generate bracket
            gen_resp = await c_svc.generate_bracket(
                club_id=club.id,
                tournament_id=t.id,
            )
            print(f"[OK] 6-team bracket generated: {gen_resp.matches_generated} matches (Bracket size {gen_resp.bracket_size}, {gen_resp.byes_count} BYEs)")

            matches = await c_svc.get_bracket_matches(club_id=club.id, tournament_id=t.id)
            r1_matches = [m for m in matches if m.bracket_round == 1]
            r2_matches = [m for m in matches if m.bracket_round == 2]

            # In an 8-team bracket with 6 teams:
            # 2 BYE matches exist in Round 1
            bye_matches = [m for m in r1_matches if m.status == MatchStatus.COMPLETED and (m.team_a is None or m.team_b is None)]
            assert len(bye_matches) == 2, f"Expected 2 BYE matches, got {len(bye_matches)}"
            print("[OK] Exactly 2 BYE matches created in Round 1 and marked COMPLETED")

            # Seeds 1 and 2 must be auto-advanced to Round 2 Semifinals
            r2_seeded_teams = {m.team_a.seed for m in r2_matches if m.team_a} | {m.team_b.seed for m in r2_matches if m.team_b}
            assert 1 in r2_seeded_teams, f"Seed 1 not advanced to Round 2: {r2_seeded_teams}"
            assert 2 in r2_seeded_teams, f"Seed 2 not advanced to Round 2: {r2_seeded_teams}"
            print("[OK] Auto-advance confirmed: Seeds 1 and 2 are already positioned in Round 2 Semifinals!")

    finally:
        await cleanup_fixture(club.id)
        print("[OK] Cleaned up Scenario C fixtures.\n")


async def verify_scenario_d_consolation():
    """Scenario D: Single Elimination with Consolation (3rd place match played, verify both 1st/2nd and 3rd/4th placements in standings)."""
    print_step("Scenario D: Single Elimination with Consolation (3rd Place Match)")
    async with AsyncSessionLocal() as session:
        club, director, players, memberships = await create_test_fixture(session)

    try:
        async with AsyncSessionLocal() as session:
            c_svc = CompetitionService(session)
            now = datetime.now(timezone.utc)

            t = Tournament(
                club_id=club.id,
                created_by_user_id=director.id,
                name="E2E Consolation Championship",
                format=TournamentFormat.BRACKET,
                status=TournamentStatus.REGISTRATION_CLOSED,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=1),
                end_date=now + timedelta(days=2),
                registration_open_at=now - timedelta(days=2),
                registration_close_at=now - timedelta(hours=1),
                min_participants=4,
                max_participants=4,
                format_configuration={"bracket_format": "consolation", "category": "Singles"},
            )
            session.add(t)
            await session.flush()

            # 4 teams
            teams = []
            for s in range(1, 5):
                tm = Team(tournament_id=t.id, name=f"Consolation Team {s}", seed=s)
                session.add(tm)
                await session.flush()
                session.add(TeamMember(team_id=tm.id, player_membership_id=memberships[s-1].id))
                teams.append(tm)
            await session.commit()

            # Generate Consolation Bracket
            await c_svc.generate_bracket(
                club_id=club.id,
                tournament_id=t.id,
            )

            matches = await c_svc.get_bracket_matches(club_id=club.id, tournament_id=t.id)
            print(f"[OK] Generated {len(matches)} matches for Consolation bracket (Expected 4: 2 Semis, 1 Final, 1 Bronze)")
            assert len(matches) == 4, f"Expected 4 matches, got {len(matches)}"

            m_semis = [m for m in matches if m.bracket_round == 1 and m.bracket_section in ("main", "winners")]
            m_final = next(m for m in matches if m.bracket_round == 2 and m.bracket_section in ("main", "winners"))
            m_bronze = next(m for m in matches if m.bracket_section == "consolation")
            assert m_bronze is not None, "Consolation 3rd-place match not found"

            # Play Semi 1: Team 1 beats Team 4 (11-4)
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_semis[0].id,
                score_a=11, score_b=4,
            )
            # Play Semi 2: Team 2 beats Team 3 (11-6)
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_semis[1].id,
                score_a=11, score_b=6,
            )

            # Verify Bronze match is populated with losers: Team 4 and Team 3
            bronze_updated = await c_svc.get_match(club_id=club.id, tournament_id=t.id, match_id=m_bronze.id)
            assert bronze_updated.team_a_id == teams[3].id, f"Bronze team A should be Team 4, got {bronze_updated.team_a_id}"
            assert bronze_updated.team_b_id == teams[2].id, f"Bronze team B should be Team 3, got {bronze_updated.team_b_id}"
            print("[OK] Loser progression verified: Semifinal losers advanced to Consolation 3rd Place Match!")

            # Play Bronze Match: Team 3 beats Team 4 (11-7)
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_bronze.id,
                score_a=7, score_b=11,  # team_b (Team 3) wins!
            )
            print("[OK] 3rd Place Bronze Match recorded: Team 3 defeated Team 4")

            # Play Final: Team 1 beats Team 2 (11-5)
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_final.id,
                score_a=11, score_b=5,
            )
            print("[OK] Championship Final recorded: Team 1 defeated Team 2")

            # Verify Tournament Completed
            await session.refresh(t)
            assert t.status == TournamentStatus.COMPLETED

            # Verify Standings distinguish 3rd and 4th place
            standings_resp = await c_svc.get_standings(club_id=club.id, tournament_id=t.id)
            standings = standings_resp.standings
            print("[OK] Consolation Standings:")
            for row in standings:
                print(f"     Rank {row.rank}: Seed {row.team_seed} {row.team_name} | Status: {row.status}")

            assert standings[0].rank == 1 and standings[0].team_seed == 1 and "Champion" in (standings[0].status or "")
            assert standings[1].rank == 2 and standings[1].team_seed == 2 and "Runner-Up" in (standings[1].status or "")
            assert standings[2].rank == 3 and standings[2].team_seed == 3 and "3rd Place" in (standings[2].status or "")
            assert standings[3].rank == 4 and standings[3].team_seed == 4 and "4th Place" in (standings[3].status or "")
            print("[OK] Consolation 3rd and 4th place distinctions verified successfully!")

    finally:
        await cleanup_fixture(club.id)
        print("[OK] Cleaned up Scenario D fixtures.\n")


async def verify_scenario_e_double_elimination():
    """Scenario E: Double Elimination (losers bracket progression, Grand Final, and Reset Final)."""
    print_step("Scenario E: Double Elimination (Grand Final & Reset Final)")
    async with AsyncSessionLocal() as session:
        club, director, players, memberships = await create_test_fixture(session)

    try:
        async with AsyncSessionLocal() as session:
            c_svc = CompetitionService(session)
            now = datetime.now(timezone.utc)

            t = Tournament(
                club_id=club.id,
                created_by_user_id=director.id,
                name="E2E Double Elimination Championship",
                format=TournamentFormat.BRACKET,
                status=TournamentStatus.REGISTRATION_CLOSED,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=1),
                end_date=now + timedelta(days=2),
                registration_open_at=now - timedelta(days=2),
                registration_close_at=now - timedelta(hours=1),
                min_participants=4,
                max_participants=4,
                format_configuration={"bracket_format": "double_elimination", "category": "Singles"},
            )
            session.add(t)
            await session.flush()

            # 4 teams
            teams = []
            for s in range(1, 5):
                tm = Team(tournament_id=t.id, name=f"DE Team {s}", seed=s)
                session.add(tm)
                await session.flush()
                session.add(TeamMember(team_id=tm.id, player_membership_id=memberships[s-1].id))
                teams.append(tm)
            await session.commit()

            # Generate Double Elimination Bracket
            await c_svc.generate_bracket(
                club_id=club.id,
                tournament_id=t.id,
            )

            matches = await c_svc.get_bracket_matches(club_id=club.id, tournament_id=t.id)
            print(f"[OK] Generated {len(matches)} matches for Double Elimination (Expected 7: WB 3, LB 2, GF 1, RF 1)")
            assert len(matches) == 7, f"Expected 7 matches, got {len(matches)}"

            m_wb_semis = [m for m in matches if m.bracket_section in ("main", "winners") and m.bracket_round == 1]
            m_wb_final = next(m for m in matches if m.bracket_section in ("main", "winners") and m.bracket_round == 2)
            m_lb_r1 = next(m for m in matches if m.bracket_section == "losers" and "Round 1" in (m.label or ""))
            m_lb_final = next(m for m in matches if m.bracket_section == "losers" and "Final" in (m.label or ""))
            m_gf = next(m for m in matches if m.bracket_section == "grand_final")
            m_rf = next(m for m in matches if m.bracket_section == "reset_final")

            # 1. WB Semis
            # WB M1: Team 1 (Seed 1) vs Team 4 (Seed 4) -> Team 1 wins
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_wb_semis[0].id,
                score_a=11, score_b=3,
            )
            # WB M2: Team 2 (Seed 2) vs Team 3 (Seed 3) -> Team 2 wins
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_wb_semis[1].id,
                score_a=11, score_b=5,
            )
            print("[OK] WB Semifinals recorded: Winners (Team 1, Team 2) advance to WB Final; Losers (Team 4, Team 3) drop to LB R1")

            # 2. Check LB R1 populated: Team 4 vs Team 3
            lb_r1_up = await c_svc.get_match(club_id=club.id, tournament_id=t.id, match_id=m_lb_r1.id)
            assert lb_r1_up.team_a_id == teams[3].id and lb_r1_up.team_b_id == teams[2].id

            # 3. WB Final: Team 1 beats Team 2 -> Team 1 advances to Grand Final; Team 2 drops to LB Final
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_wb_final.id,
                score_a=11, score_b=8,
            )
            print("[OK] WB Final recorded: Team 1 advances to Grand Final with 0 losses; Team 2 drops to LB Final")

            # 4. LB R1: Team 3 beats Team 4 (11-7) -> Team 4 eliminated (4th place); Team 3 advances to LB Final
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_lb_r1.id,
                score_a=7, score_b=11,
            )
            print("[OK] LB R1 recorded: Team 3 advances to LB Final")

            # 5. Check LB Final populated: Team 2 (WB Final loser) vs Team 3 (LB R1 winner)
            lb_fin_up = await c_svc.get_match(club_id=club.id, tournament_id=t.id, match_id=m_lb_final.id)
            assert lb_fin_up.team_a_id == teams[1].id and lb_fin_up.team_b_id == teams[2].id

            # 6. LB Final: Team 3 beats Team 2! (score_a=9, score_b=11) -> Team 2 eliminated (3rd place); Team 3 advances to Grand Final
            await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_lb_final.id,
                score_a=9, score_b=11,
            )
            print("[OK] LB Final recorded: Team 3 advances to Grand Final against undefeated Team 1!")

            # 7. Check Grand Final populated: Team 1 (WB) vs Team 3 (LB)
            gf_up = await c_svc.get_match(club_id=club.id, tournament_id=t.id, match_id=m_gf.id)
            assert gf_up.team_a_id == teams[0].id and gf_up.team_b_id == teams[2].id
            print("[OK] Grand Final Match populated: Team 1 (Seed 1) vs Team 3 (Seed 3)")

            # 8. Grand Final: Team 3 (LB winner) DEFEATS Team 1! (score_a=8, score_b=11)
            # This causes Team 1's first loss, so RESET FINAL MUST BE ACTIVATED!
            gf_res = await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_gf.id,
                score_a=8, score_b=11,
            )
            assert gf_res.winner_team_id == teams[2].id, "Team 3 won Grand Final"
            print("[OK] Grand Final won by Losers Bracket winner (Team 3)!")

            # Tournament must NOT be completed yet because Reset Final is pending
            await session.refresh(t)
            assert t.status == TournamentStatus.IN_PROGRESS, f"Tournament should still be IN_PROGRESS, got {t.status}"
            print("[OK] Tournament correctly remains IN_PROGRESS waiting for Reset Final!")

            # Check Reset Final match is now active and PENDING
            rf_up = await c_svc.get_match(club_id=club.id, tournament_id=t.id, match_id=m_rf.id)
            assert rf_up.status == MatchStatus.PENDING, f"Reset Final should be PENDING, got {rf_up.status}"
            assert {rf_up.team_a_id, rf_up.team_b_id} == {teams[0].id, teams[2].id}, "Reset Final teams mismatch"
            print(f"[OK] Reset Final activated! Match ID: {rf_up.id} (Status: {rf_up.status.value})")

            # 9. Play Reset Final: Team 1 rebounds and wins!
            score_a, score_b = (11, 8) if rf_up.team_a_id == teams[0].id else (8, 11)
            rf_res = await c_svc.record_match_result(
                club_id=club.id, tournament_id=t.id, match_id=m_rf.id,
                score_a=score_a, score_b=score_b,
            )
            assert rf_res.winner_team_id == teams[0].id, "Team 1 won Reset Final"
            print("[OK] Reset Final won by Team 1 (11-8)")

            # Tournament is now COMPLETED
            await session.refresh(t)
            assert t.status == TournamentStatus.COMPLETED, f"Tournament should now be COMPLETED, got {t.status}"
            print("[OK] Tournament successfully COMPLETED after Reset Final!")

            # Verify Standings
            standings_resp = await c_svc.get_standings(club_id=club.id, tournament_id=t.id)
            standings = standings_resp.standings
            print("[OK] Double Elimination Final Standings:")
            for row in standings:
                print(f"     Rank {row.rank}: Seed {row.team_seed} {row.team_name} | MP: {row.matches_played} (W:{row.wins}, L:{row.losses}) | Status: {row.status}")

            assert standings[0].rank == 1 and standings[0].team_seed == 1 and "Champion" in (standings[0].status or "")
            assert standings[1].rank == 2 and standings[1].team_seed == 3 and "Runner-Up" in (standings[1].status or "")
            assert standings[2].rank == 3 and standings[2].team_seed == 2
            assert standings[3].rank == 4 and standings[3].team_seed == 4
            print("[OK] Double Elimination standings perfectly verified!")

    finally:
        await cleanup_fixture(club.id)
        print("[OK] Cleaned up Scenario E fixtures.\n")


async def main():
    print("=" * 75)
    print("STARTING FULL END-TO-END BRACKET PLAY VERIFICATION SUITE")
    print("=" * 75)
    await verify_scenario_a_singles()
    await verify_scenario_b_doubles_ratings()
    await verify_scenario_c_non_power_of_two_byes()
    await verify_scenario_d_consolation()
    await verify_scenario_e_double_elimination()
    print("=" * 75)
    print("ALL 5 BRACKET PLAY E2E SCENARIOS COMPLETED AND PASSED WITH 100% SUCCESS!")
    print("=" * 75)


if __name__ == "__main__":
    asyncio.run(main())
