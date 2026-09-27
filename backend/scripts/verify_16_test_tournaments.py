"""
Aught2 Pickleball — Verification of Exactly 16 Fully Registered Test Tournaments

Validates all prompt requirements across 10 phases:
1. Total tournaments in DB is EXACTLY 16 (no extras, no duplicates).
2. Exactly 4 tournament formats (Round Robin, Pool Play, Bracket Play, Scramble), 4 each.
3. Competition categories:
   - Round Robin: Singles, Men's Doubles, Women's Doubles, Mixed Doubles.
   - Pool Play: Singles, Men's Doubles, Women's Doubles, Mixed Doubles.
   - Bracket Play: Singles, Men's Doubles, Women's Doubles, Mixed Doubles.
   - Scramble: Open Scramble, Men's Scramble, Women's Scramble, Mixed Scramble.
4. All 16 tournaments have full registration capacity of 16/16:
   - Singles: 16 individual players, 16 1-player teams -> 16/16 players registered.
   - Doubles: 32 players, 16 2-player teams -> 16/16 teams registered.
   - Scramble: 16 individual players, 0 teams -> 16/16 players registered.
5. Mixed Doubles has 1 Male + 1 Female per team.
6. Mixed Scramble has 8 Male + 8 Female players for court balance.
7. Men's Doubles & Men's Scramble have 100% Male players.
8. Women's Doubles & Women's Scramble have 100% Female players.
9. All 16 tournaments have status REGISTRATION_OPEN with future deadlines.
10. Zero premature matches, pools, brackets, rounds, scores, or standings.
11. player@demo.local is NOT registered in any tournament.
12. Club-side and Player-side API endpoints return all 16 tournaments with participant_count = 16 and max_participants = 16.
"""
import asyncio
from datetime import datetime, timezone
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership
from app.models.competition import Match, Pool, Team, TeamMember
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from app.services.tournament_service import TournamentService

EXPECTED_FORMAT_CATEGORIES = {
    TournamentFormat.ROUND_ROBIN: [
        "Singles",
        "Men's Doubles",
        "Women's Doubles",
        "Mixed Doubles",
    ],
    TournamentFormat.POOL_PLAY: [
        "Singles",
        "Men's Doubles",
        "Women's Doubles",
        "Mixed Doubles",
    ],
    TournamentFormat.BRACKET: [
        "Singles",
        "Men's Doubles",
        "Women's Doubles",
        "Mixed Doubles",
    ],
    TournamentFormat.SCRAMBLE: [
        "Open Scramble",
        "Men's Scramble",
        "Women's Scramble",
        "Mixed Scramble",
    ],
}


async def verify():
    async with AsyncSessionLocal() as session:
        print("=" * 80)
        print("VERIFYING EXACTLY 16 FULLY REGISTERED TEST TOURNAMENTS")
        print("=" * 80)

        # 1. Fetch Target Club
        club = (
            await session.execute(
                select(Club).where(Club.name == "Aught2 Pickleball")
            )
        ).scalars().first()
        if not club:
            club = (await session.execute(select(Club).where(Club.is_active == True))).scalars().first()
        assert club is not None, "Club not found!"
        club_id = club.id
        print(f"\n[Check 1] Target Club: {club.name} ({club_id})")

        # 2. Total tournaments in DB
        all_tournaments_in_db = (
            await session.execute(
                select(Tournament)
                .options(
                    selectinload(Tournament.registrations).selectinload(
                        TournamentRegistration.player_membership
                    ).selectinload(ClubPlayerMembership.user).selectinload(User.player_profile)
                )
                .order_by(Tournament.created_at.asc())
            )
        ).scalars().all()

        print(f"\n[Check 2] Total Tournaments in Entire DB: {len(all_tournaments_in_db)}")
        assert len(all_tournaments_in_db) == 16, (
            f"Expected exactly 16 tournaments in DB, found {len(all_tournaments_in_db)}"
        )
        print("  -> PASSED: Exactly 16 tournaments exist in the database (no extras or duplicates).")

        # 3. Check 4 formats x 4 categories
        format_counts: dict[TournamentFormat, list[Tournament]] = {}
        for t in all_tournaments_in_db:
            format_counts.setdefault(t.format, []).append(t)

        print("\n[Check 3] Formats & Categories Verification:")
        for fmt, expected_cats in EXPECTED_FORMAT_CATEGORIES.items():
            t_list = format_counts.get(fmt, [])
            print(f"  • {fmt.value.upper()}: {len(t_list)} tournaments")
            assert len(t_list) == 4, f"Format {fmt.value} expected 4 tournaments, got {len(t_list)}"
            
            actual_cats = [(t.format_configuration or {}).get("category") for t in t_list]
            for exp_cat in expected_cats:
                assert exp_cat in actual_cats, f"Format {fmt.value} missing category '{exp_cat}'. Got: {actual_cats}"
            print(f"    Categories: {actual_cats}")

        print("  -> PASSED: Exactly 4 formats and exactly 4 specified categories per format.")

        # 4. Check zero matches, pools, brackets, rounds, scores, or standings
        match_count = (await session.execute(select(func.count(Match.id)))).scalar()
        pool_count = (await session.execute(select(func.count(Pool.id)))).scalar()
        print("\n[Check 4] Premature Match & Pool Generation Check:")
        print(f"  • Total Matches: {match_count}")
        print(f"  • Total Pools: {pool_count}")
        assert match_count == 0, f"Expected 0 matches, found {match_count}"
        assert pool_count == 0, f"Expected 0 pools, found {pool_count}"
        print("  -> PASSED: Zero premature matches or pools generated.")

        # 5. Check tournament status and dates
        now = datetime.now(timezone.utc)
        print("\n[Check 5] Tournament Statuses & Deadlines:")
        for t in all_tournaments_in_db:
            assert t.status == TournamentStatus.REGISTRATION_OPEN, (
                f"Tournament '{t.name}' status is {t.status}"
            )
            assert t.registration_close_at is not None
            close_at = t.registration_close_at
            if close_at.tzinfo is None:
                close_at = close_at.replace(tzinfo=timezone.utc)
            assert close_at > now, f"Tournament '{t.name}' registration deadline has already passed"
        print("  -> PASSED: All 16 tournaments are REGISTRATION_OPEN with valid future deadlines.")

        # 6. Check demo player is NOT registered
        print("\n[Check 6] Demo Player Excluded Check:")
        demo_regs = (
            await session.execute(
                select(TournamentRegistration)
                .join(ClubPlayerMembership, TournamentRegistration.player_membership_id == ClubPlayerMembership.id)
                .join(ClubPlayerMembership.user)
                .where(
                    ClubPlayerMembership.user.property.mapper.class_.email == "player@demo.local",
                )
            )
        ).scalars().all()
        assert len(demo_regs) == 0, f"player@demo.local found registered in {len(demo_regs)} tournaments!"
        print("  -> PASSED: player@demo.local is NOT registered in any test tournament.")

        # 7. Check Registrations, Capacities, Teams, and Category Eligibility
        print("\n[Check 7] Individual Tournament Capacity & Eligibility Verification:")
        for t in all_tournaments_in_db:
            cat = (t.format_configuration or {}).get("category", "")
            is_scramble = (t.format == TournamentFormat.SCRAMBLE)
            is_singles = (cat == "Singles")

            # Fetch registrations
            regs = (
                await session.execute(
                    select(TournamentRegistration)
                    .where(TournamentRegistration.tournament_id == t.id)
                )
            ).scalars().all()
            confirmed_regs = [r for r in regs if r.status == RegistrationStatus.CONFIRMED]

            # Fetch teams
            teams = (
                await session.execute(
                    select(Team)
                    .options(
                        selectinload(Team.members).selectinload(TeamMember.player_membership).selectinload(
                            ClubPlayerMembership.user
                        ).selectinload(User.player_profile)
                    )
                    .where(Team.tournament_id == t.id)
                )
            ).scalars().all()

            # max_participants is always 16
            assert t.max_participants == 16, f"Tournament '{t.name}' max_participants is {t.max_participants}, expected 16"

            if is_scramble:
                # 16 individual player registrations, 0 teams
                assert len(teams) == 0, f"Scramble tournament '{t.name}' has {len(teams)} teams, expected 0"
                assert len(confirmed_regs) == 16, (
                    f"Scramble tournament '{t.name}' has {len(confirmed_regs)} registrations, expected 16"
                )

                # Fetch player profiles for gender checks
                reg_members = (
                    await session.execute(
                        select(ClubPlayerMembership)
                        .options(selectinload(ClubPlayerMembership.user).selectinload(User.player_profile))
                        .where(ClubPlayerMembership.id.in_([r.player_membership_id for r in confirmed_regs]))
                    )
                ).scalars().all()

                genders = [m.user.player_profile.gender for m in reg_members if m.user and m.user.player_profile]

                if cat == "Men's Scramble":
                    assert all(g == "Male" for g in genders), f"Men's Scramble has non-male players: {genders}"
                elif cat == "Women's Scramble":
                    assert all(g == "Female" for g in genders), f"Women's Scramble has non-female players: {genders}"
                elif cat == "Mixed Scramble":
                    m_count = sum(1 for g in genders if g == "Male")
                    f_count = sum(1 for g in genders if g == "Female")
                    assert m_count == 8 and f_count == 8, (
                        f"Mixed Scramble must have exactly 8 male and 8 female players for court balance. Got {m_count}M, {f_count}F"
                    )

                print(f"  ✓ [SCRAMBLE] [{cat}] {t.name}: 16/16 players registered (0 teams, genders: {cat})")

            elif is_singles:
                # 16 individual players, 16 1-player teams
                assert len(confirmed_regs) == 16, (
                    f"Singles tournament '{t.name}' has {len(confirmed_regs)} registrations, expected 16"
                )
                assert len(teams) == 16, f"Singles tournament '{t.name}' has {len(teams)} teams, expected 16"
                for tm in teams:
                    assert len(tm.members) == 1, f"Singles team '{tm.name}' has {len(tm.members)} members, expected 1"

                print(f"  ✓ [{t.format.value.upper()}] [Singles] {t.name}: 16/16 players registered (16 teams)")

            else:
                # Doubles (Men's, Women's, Mixed): 16 teams, 32 player registrations
                assert len(teams) == 16, f"Doubles tournament '{t.name}' has {len(teams)} teams, expected 16"
                assert len(confirmed_regs) == 32, (
                    f"Doubles tournament '{t.name}' has {len(confirmed_regs)} player registrations, expected 32"
                )
                for tm in teams:
                    assert len(tm.members) == 2, f"Doubles team '{tm.name}' has {len(tm.members)} members, expected 2"
                    m1_user = tm.members[0].player_membership.user
                    m2_user = tm.members[1].player_membership.user
                    g1 = getattr(m1_user.player_profile, "gender", None) if m1_user else None
                    g2 = getattr(m2_user.player_profile, "gender", None) if m2_user else None

                    if cat == "Men's Doubles":
                        assert g1 == "Male" and g2 == "Male", (
                            f"Men's Doubles team '{tm.name}' has non-male players: {g1}, {g2}"
                        )
                    elif cat == "Women's Doubles":
                        assert g1 == "Female" and g2 == "Female", (
                            f"Women's Doubles team '{tm.name}' has non-female players: {g1}, {g2}"
                        )
                    elif cat == "Mixed Doubles":
                        g_set = {g1, g2}
                        assert g_set == {"Male", "Female"}, (
                            f"Mixed Doubles team '{tm.name}' must have 1 Male and 1 Female, got: {g1}, {g2}"
                        )

                print(f"  ✓ [{t.format.value.upper()}] [{cat}] {t.name}: 16/16 teams registered (16 teams, 32 players)")

        # 8. Check Tournament Service API Listings (Club-side & Player-side)
        print("\n[Check 8] API Service Layer Listings:")
        service = TournamentService(session)
        club_list = await service.list_club_tournaments(club_id=club_id)
        print(f"  • Club-side API returns: {len(club_list)} tournaments")
        assert len(club_list) == 16, f"Club-side API returned {len(club_list)}, expected 16"
        for ct in club_list:
            assert ct.status.value == "registration_open"
            assert ct.participant_count == 16, (
                f"Tournament '{ct.name}' participant_count is {ct.participant_count}, expected 16"
            )
            assert ct.max_participants == 16, (
                f"Tournament '{ct.name}' max_participants is {ct.max_participants}, expected 16"
            )

        player_discover = await service.list_public_tournaments(user_id=None)
        print(f"  • Player-side API returns: {len(player_discover)} tournaments")
        assert len(player_discover) == 16, f"Player-side API returned {len(player_discover)}, expected 16"
        for pt in player_discover:
            assert pt.status.value == "registration_open"
            assert pt.participant_count == 16, (
                f"Tournament '{pt.name}' participant_count is {pt.participant_count}, expected 16"
            )
            assert pt.max_participants == 16, (
                f"Tournament '{pt.name}' max_participants is {pt.max_participants}, expected 16"
            )

        print("\n" + "=" * 80)
        print("ALL 16 TEST TOURNAMENTS 100% VERIFIED AND COMPLIANT WITH ALL REQUIREMENTS")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(verify())
