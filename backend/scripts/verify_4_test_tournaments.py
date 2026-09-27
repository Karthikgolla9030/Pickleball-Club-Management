"""
Comprehensive verification script for the 4 Test Tournaments:
1. Verifies tournament counts and formats
2. Verifies registration numbers, statuses, and capacity
3. Verifies teams and team members for doubles tournaments
4. Verifies individual registrations (and NO teams) for Scramble
5. Verifies pools and pool-team assignments for Pool Play
6. Verifies that player@demo.local is NOT registered in any tournament
7. Verifies that no matches have been prematurely generated (all matches = 0)
8. Verifies that all 4 tournaments are in status REGISTRATION_OPEN
9. Verifies that leagues count is 0 (all hardcoded leagues removed)
"""
import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership
from app.models.competition import Match, Pool, PoolTeam, Team, TeamMember
from app.models.league import League
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration


async def verify():
    async with AsyncSessionLocal() as session:
        print("=" * 70)
        print("VERIFICATION OF 4 TEST TOURNAMENTS & CLEANUP")
        print("=" * 70)

        # 1. Check leagues count
        league_count = (await session.execute(select(func.count(League.id)))).scalar()
        print(f"\n[Check 1] Total Leagues in DB: {league_count}")
        assert league_count == 0, f"Expected 0 leagues, found {league_count}"
        print("  -> PASSED: All old hardcoded/demo leagues removed.")

        # 2. Check tournament count
        t_count = (await session.execute(select(func.count(Tournament.id)))).scalar()
        print(f"\n[Check 2] Total Tournaments in DB: {t_count}")
        assert t_count == 4, f"Expected exactly 4 tournaments, found {t_count}"
        print("  -> PASSED: Exactly 4 test tournaments exist.")

        # 3. Check matches count
        match_count = (await session.execute(select(func.count(Match.id)))).scalar()
        print(f"\n[Check 3] Total Matches in DB: {match_count}")
        assert match_count == 0, f"Expected 0 matches before lifecycle testing, found {match_count}"
        print("  -> PASSED: Zero premature matches generated.")

        # 4. Fetch the 4 tournaments
        tournaments = (
            await session.execute(
                select(Tournament)
                .options(
                    selectinload(Tournament.registrations),
                    selectinload(Tournament.teams).selectinload(Team.members),
                    selectinload(Tournament.pools).selectinload(Pool.pool_teams),
                )
                .order_by(Tournament.name)
            )
        ).scalars().all()

        # Find Demo Player membership ID to check non-registration
        demo_mem = (
            await session.execute(
                select(ClubPlayerMembership)
                .options(selectinload(ClubPlayerMembership.user))
                .where(ClubPlayerMembership.club_id == tournaments[0].club_id)
            )
        ).scalars().all()
        demo_mem_id = next(
            (m.id for m in demo_mem if m.user and m.user.email == "player@demo.local"), None
        )
        print(f"\n[Check 4] Demo Player (player@demo.local) membership ID: {demo_mem_id}")

        expected_formats = {
            "Test Tournament — Bracket Play": TournamentFormat.BRACKET,
            "Test Tournament — Pool Play": TournamentFormat.POOL_PLAY,
            "Test Tournament — Round Robin": TournamentFormat.ROUND_ROBIN,
            "Test Tournament — Scramble": TournamentFormat.SCRAMBLE,
        }

        for t in tournaments:
            print("-" * 70)
            print(f"Tournament: '{t.name}'")
            print(f"  ID: {t.id}")
            print(f"  Format: {t.format.value} (Expected: {expected_formats.get(t.name).value})")
            assert t.format == expected_formats.get(t.name), f"Format mismatch for {t.name}"

            print(f"  Status: {t.status.value} (Expected: registration_open)")
            assert t.status == TournamentStatus.REGISTRATION_OPEN, f"Status mismatch for {t.name}"

            confirmed_regs = [r for r in t.registrations if r.status == RegistrationStatus.CONFIRMED]
            print(f"  Capacity: {len(confirmed_regs)}/{t.max_participants} confirmed registrations")
            assert len(confirmed_regs) == t.max_participants, (
                f"Capacity not full for {t.name}: {len(confirmed_regs)}/{t.max_participants}"
            )

            # Ensure demo player is NOT registered
            if demo_mem_id:
                has_demo = any(r.player_membership_id == demo_mem_id for r in t.registrations)
                assert not has_demo, f"Demo player was registered in {t.name}!"
                print("  Demo Player Registered: NO (Correct - allows user to see full/open state)")

            # Format-specific checks
            if t.format == TournamentFormat.ROUND_ROBIN:
                print(f"  Category: {t.format_configuration.get('category')} (Men's Doubles)")
                print(f"  Teams count: {len(t.teams)} (Expected: 4 teams)")
                assert len(t.teams) == 4, f"Expected 4 teams for RR, found {len(t.teams)}"
                for tm in t.teams:
                    print(f"    - Team '{tm.name}' (Seed {tm.seed}): {len(tm.members)} players")
                    assert len(tm.members) == 2, f"Team {tm.name} must have exactly 2 players"

            elif t.format == TournamentFormat.POOL_PLAY:
                print(f"  Category: {t.format_configuration.get('category')} (Mixed Doubles)")
                print(f"  Pools count: {len(t.pools)} (Expected: 2 pools)")
                assert len(t.pools) == 2, f"Expected 2 pools, found {len(t.pools)}"
                print(f"  Teams count: {len(t.teams)} (Expected: 8 teams)")
                assert len(t.teams) == 8, f"Expected 8 teams for Pool Play, found {len(t.teams)}"
                for p in t.pools:
                    print(f"    - Pool '{p.name}': {len(p.pool_teams)} assigned teams")
                    assert len(p.pool_teams) == 4, f"Pool {p.name} must have 4 teams"

            elif t.format == TournamentFormat.SCRAMBLE:
                print(f"  Division: {t.format_configuration.get('category')} (Open Scramble)")
                print(f"  Registration Type: {t.format_configuration.get('registration_type')} (individual)")
                print(f"  Teams count: {len(t.teams)} (Expected: 0 teams - individual only)")
                assert len(t.teams) == 0, f"Scramble must have 0 fixed teams, found {len(t.teams)}"
                print(f"  Individual registered players: {len(confirmed_regs)}")

            elif t.format == TournamentFormat.BRACKET:
                print(f"  Category: {t.format_configuration.get('category')} (Men's Doubles)")
                print(f"  Teams count: {len(t.teams)} (Expected: 4 teams)")
                assert len(t.teams) == 4, f"Expected 4 teams for Bracket, found {len(t.teams)}"
                for tm in t.teams:
                    print(f"    - Team '{tm.name}' (Seed {tm.seed}): {len(tm.members)} players")
                    assert len(tm.members) == 2, f"Team {tm.name} must have exactly 2 players"

        print("\n" + "=" * 70)
        print("ALL VERIFICATION CHECKS PASSED PERFECTLY!")
        print("=" * 70)

if __name__ == "__main__":
    asyncio.run(verify())
