"""
Aught2 Pickleball — Repeatable Development Demo Dataset Seeder

Produces the exact demo dataset requested:
1. Exactly four tournaments, one per supported format:
   - 1 Round Robin (round_robin)
   - 1 Pool Play (pool_play)
   - 1 Scramble (scramble)
   - 1 standalone Bracket (bracket)
   In discoverable, registration_open states with realistic configurations.
2. Exactly one league:
   - Aught2 Premier Doubles League
   - 8/8 fixed doubles teams registered (16 player slots total)
   - Mix of eligible linked club members and manually entered guest partners (no fake user accounts)
   - 8 weeks (7 regular season weeks + 1 playoff week)
   - Regular season round-robin schedule generated using deterministic competition engine
   - Clean initial state with no fabricated match results

Idempotent: Safe to run repeatedly without creating duplicates.
Development-only: Guarded against execution in production environments.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Match, MatchParticipant, Pool, PoolTeam, Team, TeamMember
from app.models.league import (
    League,
    LeagueStatus,
    LeagueWeek,
    LeagueWeeklyStanding,
    LeagueWeekStatus,
    LeagueWeekType,
)
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import TournamentRegistration
from app.models.user import User
from app.services.league_service import LeagueService


# Guard against running in production
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
if ENVIRONMENT in ("production", "prod"):
    print("[ERROR] Cannot run development demo seed script in production environment.")
    sys.exit(1)


DEMO_TOURNAMENT_NAMES = {
    TournamentFormat.ROUND_ROBIN: "Aught2 Spring Round Robin Showcase",
    TournamentFormat.POOL_PLAY: "Aught2 Pool Play Championship",
    TournamentFormat.SCRAMBLE: "Aught2 Saturday Scramble Challenge",
    TournamentFormat.BRACKET: "Aught2 Classic Bracket Knockout",
}

DEMO_LEAGUE_NAME = "Aught2 Premier Doubles League"


async def seed_demo_dataset():
    async with AsyncSessionLocal() as session:
        print("=" * 60)
        print("SEEDING REQUESTED DEVELOPMENT DEMO DATASET")
        print("=" * 60)

        # 1. Identify Target Demo Club
        club_query = await session.execute(
            select(Club).where(Club.name.ilike("%Aught2%")).limit(1)
        )
        club = club_query.scalars().first()
        if not club:
            club_query = await session.execute(select(Club).limit(1))
            club = club_query.scalars().first()
        if not club:
            raise RuntimeError("No club found in database to seed demo dataset into.")

        print(f"Target Demo Club: '{club.name}' (ID: {club.id})")

        # 2. Find Club Creator / Staff User
        staff_query = await session.execute(
            select(User).where(User.email.ilike("%owner%")).limit(1)
        )
        staff_user = staff_query.scalars().first()
        if not staff_user:
            staff_user = (await session.execute(select(User).limit(1))).scalars().first()

        creator_id = staff_user.id if staff_user else None

        # 3. Clean up non-demo/extra tournaments for this club to ensure EXACTLY 4 demo tournaments
        existing_tournaments = (
            await session.execute(select(Tournament).where(Tournament.club_id == club.id))
        ).scalars().all()

        target_names = set(DEMO_TOURNAMENT_NAMES.values())
        for t in existing_tournaments:
            if t.name not in target_names:
                print(f"Cleaning extra non-demo tournament: '{t.name}' ({t.format.value})")
                await session.execute(delete(MatchParticipant).where(MatchParticipant.match_id.in_(
                    select(Match.id).where(Match.tournament_id == t.id)
                )))
                await session.execute(delete(Match).where(Match.tournament_id == t.id))
                await session.execute(delete(PoolTeam).where(PoolTeam.pool_id.in_(
                    select(Pool.id).where(Pool.tournament_id == t.id)
                )))
                await session.execute(delete(Pool).where(Pool.tournament_id == t.id))
                await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(
                    select(Team.id).where(Team.tournament_id == t.id)
                )))
                await session.execute(delete(Team).where(Team.tournament_id == t.id))
                await session.execute(delete(TournamentRegistration).where(TournamentRegistration.tournament_id == t.id))
                await session.execute(delete(Tournament).where(Tournament.id == t.id))

        await session.commit()

        # 4. Seed Exactly 4 Demo Tournaments (one per supported format)
        now = datetime.now(timezone.utc)
        tournaments_by_format: dict[TournamentFormat, Tournament] = {}

        for fmt, name in DEMO_TOURNAMENT_NAMES.items():
            existing = (
                await session.execute(
                    select(Tournament)
                    .where(Tournament.club_id == club.id, Tournament.name == name)
                    .limit(1)
                )
            ).scalars().first()

            if existing:
                print(f"[OK] Tournament already exists: '{name}' ({fmt.value})")
                tournaments_by_format[fmt] = existing
                continue

            # Tournament Configurations
            if fmt == TournamentFormat.ROUND_ROBIN:
                format_config = {
                    "game_format": "single_game",
                    "target_score": 11,
                    "win_by": 2,
                    "match_duration_minutes": 25,
                }
                desc = "Competitive Round Robin tournament where every team competes against each other in deterministic rotational play."
                min_p, max_p = 4, 8
            elif fmt == TournamentFormat.POOL_PLAY:
                format_config = {
                    "pool_count": 2,
                    "qualifier_count": 4,
                    "bracket_type": "Single Elimination",
                    "balance_tolerance": 0.5,
                }
                desc = "Multi-pool tournament featuring intra-pool round robins advancing top qualifiers into a championship bracket."
                min_p, max_p = 8, 16
            elif fmt == TournamentFormat.SCRAMBLE:
                format_config = {
                    "planned_rounds": 4,
                    "partner_matching": "round_robin",
                    "games_per_round": 1,
                }
                desc = "Fast-paced dynamic scramble tournament with rotating partners and individual leaderboard points."
                min_p, max_p = 8, 16
            else:  # BRACKET
                format_config = {
                    "bracket_type": "single_elimination",
                    "third_place_match": True,
                }
                desc = "Classic single-elimination tournament knockout bracket culminating in championship crown."
                min_p, max_p = 4, 16

            t = Tournament(
                club_id=club.id,
                created_by_user_id=creator_id,
                name=name,
                description=desc,
                status=TournamentStatus.REGISTRATION_OPEN,
                format=fmt,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=7),
                end_date=now + timedelta(days=9),
                registration_open_at=now - timedelta(days=2),
                registration_close_at=now + timedelta(days=6),
                location_name=f"{club.name} Courts",
                min_participants=min_p,
                max_participants=max_p,
                scoring_rules={"game_format": "single_game", "target_score": 11, "win_by": 2},
                tiebreaker_rules=["wins", "points_differential", "total_points_scored", "team_name_deterministic"],
                format_configuration=format_config,
            )
            session.add(t)
            await session.flush()
            print(f"+ Created Demo Tournament: '{name}' ({fmt.value}) [ID: {t.id}]")
            tournaments_by_format[fmt] = t

        await session.commit()

        # 5. Clean up extra leagues to ensure EXACTLY 1 demo league
        existing_leagues = (
            await session.execute(select(League).where(League.club_id == club.id))
        ).scalars().all()

        for l in existing_leagues:
            if l.name != DEMO_LEAGUE_NAME:
                print(f"Cleaning extra non-demo league: '{l.name}'")
                await session.execute(delete(MatchParticipant).where(MatchParticipant.match_id.in_(
                    select(Match.id).where(Match.league_id == l.id)
                )))
                await session.execute(delete(Match).where(Match.league_id == l.id))
                await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(
                    select(Team.id).where(Team.league_id == l.id)
                )))
                await session.execute(delete(Team).where(Team.league_id == l.id))
                await session.execute(delete(LeagueWeeklyStanding).where(LeagueWeeklyStanding.league_id == l.id))
                await session.execute(delete(LeagueWeek).where(LeagueWeek.league_id == l.id))
                await session.execute(delete(League).where(League.id == l.id))

        await session.commit()

        # 6. Seed Exactly One League with 8/8 Doubles Teams & 16 Player Slots
        league = (
            await session.execute(
                select(League)
                .where(League.club_id == club.id, League.name == DEMO_LEAGUE_NAME)
                .limit(1)
            )
        ).scalars().first()

        if league:
            # Check teams count
            league_teams = (
                await session.execute(
                    select(Team)
                    .options(selectinload(Team.members))
                    .where(Team.league_id == league.id)
                )
            ).scalars().all()

            if len(league_teams) == 8:
                print(f"[OK] League already has 8/8 teams registered: '{DEMO_LEAGUE_NAME}'")
                print("Demo dataset is already completely seeded and up-to-date!")
                return

            print(f"Re-initializing league teams for '{DEMO_LEAGUE_NAME}'...")
            await session.execute(delete(MatchParticipant).where(MatchParticipant.match_id.in_(
                select(Match.id).where(Match.league_id == league.id)
            )))
            await session.execute(delete(Match).where(Match.league_id == league.id))
            await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(
                select(Team.id).where(Team.league_id == league.id)
            )))
            await session.execute(delete(Team).where(Team.league_id == league.id))
            await session.execute(delete(LeagueWeeklyStanding).where(LeagueWeeklyStanding.league_id == league.id))
            await session.execute(delete(LeagueWeek).where(LeagueWeek.league_id == league.id))
            await session.execute(delete(League).where(League.id == league.id))
            await session.commit()

        # Create the league (8 weeks: 7 regular season weeks for 8 teams round robin + 1 playoff week)
        league = League(
            club_id=club.id,
            name=DEMO_LEAGUE_NAME,
            description="Official 8-team premier doubles league featuring 7 regular season match weeks and championship playoffs.",
            status=LeagueStatus.REGISTRATION_OPEN,
            number_of_weeks=8,
            current_week=1,
            team_size=2,
            playoff_team_count=4,
            scoring_rules={"game_format": "single_game", "target_score": 11, "win_by": 2},
            start_date=now + timedelta(days=3),
        )
        session.add(league)
        await session.flush()

        # Create 8 LeagueWeek records (Weeks 1..7 Regular Season, Week 8 Playoffs)
        for w in range(1, 9):
            is_playoff = (w == 8)
            session.add(
                LeagueWeek(
                    league_id=league.id,
                    week_number=w,
                    week_type=LeagueWeekType.PLAYOFFS if is_playoff else LeagueWeekType.REGULAR_SEASON,
                    status=LeagueWeekStatus.PENDING,
                )
            )
        await session.flush()

        # 7. Fetch active club player memberships
        memberships = (
            await session.execute(
                select(ClubPlayerMembership)
                .options(selectinload(ClubPlayerMembership.user))
                .where(
                    ClubPlayerMembership.club_id == club.id,
                    ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
                )
            )
        ).scalars().all()

        if len(memberships) < 13:
            raise RuntimeError(f"Expected at least 13 active club player memberships, got {len(memberships)}.")

        # Define 8 fixed doubles teams:
        # Teams 1-5: 2 linked active club members each (10 members)
        # Teams 6-8: 1 linked active club member + 1 manual guest partner name (3 members + 3 guests)
        # Total: 13 unique club members + 3 guests = 16 player slots across 8 teams (8/8 teams)
        teams_spec = [
            ("The Kitchen Masters", memberships[0].id, memberships[1].id, None),
            ("Baseline Bombers", memberships[2].id, memberships[3].id, None),
            ("Dink Dynamos", memberships[4].id, memberships[5].id, None),
            ("Net Dominators", memberships[6].id, memberships[7].id, None),
            ("Spin Wizards", memberships[8].id, memberships[9].id, None),
            ("Lob Masters", memberships[10].id, None, "Guest Partner Alex Taylor"),
            ("Court Crushers", memberships[11].id, None, "Guest Partner Jordan Lee"),
            ("Paddle Power", memberships[12].id, None, "Guest Partner Sam Rivera"),
        ]

        created_teams: list[Team] = []
        for seed_idx, (t_name, m1_id, m2_id, guest_name) in enumerate(teams_spec, start=1):
            team = Team(
                league_id=league.id,
                name=t_name,
                seed=seed_idx,
            )
            session.add(team)
            await session.flush()

            # Member 1 (Always an active club member)
            session.add(
                TeamMember(
                    team_id=team.id,
                    player_membership_id=m1_id,
                    guest_name=None,
                )
            )

            # Member 2 (Active club member or manual guest partner)
            session.add(
                TeamMember(
                    team_id=team.id,
                    player_membership_id=m2_id,
                    guest_name=guest_name,
                )
            )
            await session.flush()
            created_teams.append(team)
            print(f"  + Registered Team {seed_idx}/8: '{t_name}' (2 slots: Member + {'Guest: ' + guest_name if guest_name else 'Member'})")

        await session.commit()

        # 8. Close registration and generate regular-season schedule using existing deterministic LeagueService
        print("\nClosing league registration and generating deterministic round-robin schedule...")
        league.status = LeagueStatus.REGISTRATION_CLOSED
        await session.commit()

        league_service = LeagueService(session)
        schedule_resp = await league_service.generate_schedule(club.id, league.id)
        await session.commit()

        total_matches = sum(len(w.matches) for w in schedule_resp)
        print(f"[OK] Regular-season schedule generated successfully!")
        print(f"  Total Weeks: {len(schedule_resp)} (Weeks 1..7 Regular Season)")
        print(f"  Total Matches: {total_matches} (Deterministic single round-robin, exactly 7 matches per team)")
        print(f"  Status: {league.status.value}")

        print("\n" + "=" * 60)
        print("DEMO DATASET SEED COMPLETE:")
        print(f"[OK] Tournaments ({len(tournaments_by_format)} total):")
        for fmt, t in tournaments_by_format.items():
            print(f"   - {fmt.value.upper()}: '{t.name}' [{t.status.value}]")
        print(f"[OK] League (1 total):")
        print(f"   - '{league.name}' (8/8 teams registered, 16 player slots, {total_matches} scheduled matches)")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed_demo_dataset())
