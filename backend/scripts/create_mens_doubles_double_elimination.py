"""
Aught2 Pickleball — Create 8-Team Men's Doubles Double Elimination Tournament

Creates:
- Format: Bracket Play (TournamentFormat.BRACKET)
- Category: "Men's Doubles" (team_size: 2, gender: Male)
- Bracket Format: "Double Elimination"
- Capacity: 8 Teams (16 Male Players)
- Registered: Exactly 8/8 confirmed teams with 16 distinct male club players
- Status: TournamentStatus.REGISTRATION_CLOSED (Ready for Club Manager / Director to generate bracket and test)
"""
import asyncio
from datetime import datetime, timezone
import os
import sys
from uuid import UUID, uuid4

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Match, MatchParticipant, Team, TeamMember
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    DEFAULT_SCORING_RULES,
    DEFAULT_TIEBREAKER_RULES,
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User

CLUB_ID = UUID("db24a487-ed43-455e-964e-624c04fe223c")

TOURNAMENT_NAME = "Men's Doubles Double Elimination Championship"

TEAMS_SPEC = [
    {
        "name": "Apex Smashers",
        "seed": 1,
        "emails": ["male_player_1@demo.local", "male_player_2@demo.local"],
    },
    {
        "name": "Court Dominators",
        "seed": 2,
        "emails": ["male_player_3@demo.local", "male_player_4@demo.local"],
    },
    {
        "name": "Kitchen Masters",
        "seed": 3,
        "emails": ["male_player_5@demo.local", "male_player_6@demo.local"],
    },
    {
        "name": "Dink Dynamos",
        "seed": 4,
        "emails": ["male_player_7@demo.local", "male_player_8@demo.local"],
    },
    {
        "name": "Pickle Pros",
        "seed": 5,
        "emails": ["male_player_9@demo.local", "male_player_10@demo.local"],
    },
    {
        "name": "Baseline Barons",
        "seed": 6,
        "emails": ["male_player_11@demo.local", "male_player_12@demo.local"],
    },
    {
        "name": "Net Ninjas",
        "seed": 7,
        "emails": ["male_player_13@demo.local", "male_player_14@demo.local"],
    },
    {
        "name": "Drop Shot Aces",
        "seed": 8,
        "emails": ["male_player_15@demo.local", "male_player_16@demo.local"],
    },
]


async def create_tournament():
    async with AsyncSessionLocal() as session:
        # 1. Fetch club
        club = (await session.execute(select(Club).where(Club.id == CLUB_ID))).scalars().first()
        if not club:
            club = (await session.execute(select(Club).limit(1))).scalars().first()
            if not club:
                print("[ERROR] No club found in database.")
                return

        print(f"[INFO] Using club: {club.id} ({club.name})")

        # 2. Find creator (Demo Owner / Manager)
        owner_user = (await session.execute(
            select(User).where(User.email == "owner@demo.local")
        )).scalars().first()
        creator_id = owner_user.id if owner_user else None

        # 3. Clean up existing tournament with this name if any
        existing_tournaments = (await session.execute(
            select(Tournament).where(
                Tournament.club_id == club.id,
                Tournament.name == TOURNAMENT_NAME
            )
        )).scalars().all()

        for ext in existing_tournaments:
            print(f"[INFO] Cleaning previous tournament: {ext.id} - {ext.name}")
            # Delete matches
            await session.execute(delete(MatchParticipant).where(MatchParticipant.match_id.in_(
                select(Match.id).where(Match.tournament_id == ext.id)
            )))
            await session.execute(delete(Match).where(Match.tournament_id == ext.id))
            # Delete team members and teams
            await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(
                select(Team.id).where(Team.tournament_id == ext.id)
            )))
            await session.execute(delete(Team).where(Team.tournament_id == ext.id))
            # Delete registrations
            await session.execute(delete(TournamentRegistration).where(TournamentRegistration.tournament_id == ext.id))
            # Delete tournament
            await session.execute(delete(Tournament).where(Tournament.id == ext.id))

        await session.commit()

        # 4. Fetch the 16 male player memberships
        needed_emails = [e for t in TEAMS_SPEC for e in t["emails"]]
        memberships_q = (
            select(ClubPlayerMembership, User)
            .join(User, ClubPlayerMembership.user_id == User.id)
            .where(
                ClubPlayerMembership.club_id == club.id,
                ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
                User.email.in_(needed_emails)
            )
        )
        res = (await session.execute(memberships_q)).all()
        membership_by_email = {u.email: m for m, u in res}

        # Verify all 16 exist
        missing = [e for e in needed_emails if e not in membership_by_email]
        if missing:
            print(f"[ERROR] Missing club memberships for: {missing}")
            return

        print(f"[INFO] Verified all 16 male player memberships for 8 teams.")

        # 5. Create Tournament record
        start_date = datetime(2026, 10, 10, 9, 0, tzinfo=timezone.utc)
        end_date = datetime(2026, 10, 11, 18, 0, tzinfo=timezone.utc)
        reg_open_at = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)
        reg_close_at = datetime(2026, 10, 8, 23, 59, tzinfo=timezone.utc)

        format_cfg = {
            "category": "Men's Doubles",
            "competition_category": "Men's Doubles",
            "bracket_type": "Double Elimination",
            "bracket_format": "Double Elimination",
            "division": "Men's Doubles",
            "team_size": 2,
            "registration_type": "team",
            "gender_eligibility": "Male",
            "skill_level_mode": "single",
            "skill_level": "4.0",
            "min_skill_level": "4.0",
            "max_skill_level": "4.0",
            "min_age": 18,
            "max_age": 70,
            "entry_fee": 50.0,
            "max_teams": 8,
            "courts_count": 4,
            "seeding_method": "Team Average Rating (Highest = Seed #1)",
            "bye_rule": "Automatic BYEs awarded to top seeds",
        }

        scoring_rules = {
            "game_format": "single_game",
            "target_score": 11,
            "win_by": 2,
            "description": "First to 11 points, win by 2.",
        }

        tiebreaker_rules = [
            "head_to_head",
            "points_differential",
            "total_points_scored",
            "team_name_deterministic",
        ]

        desc = (
            "Official 8-Team Double Elimination Men's Doubles Championship. "
            "Seeded bracket with Winners and Elimination (Losers) brackets leading to the Grand Final. "
            "All 8/8 teams registered with 16 verified male players."
        )

        tournament_id = uuid4()
        tournament = Tournament(
            id=tournament_id,
            club_id=club.id,
            created_by_user_id=creator_id,
            name=TOURNAMENT_NAME,
            description=desc,
            format=TournamentFormat.BRACKET,
            status=TournamentStatus.REGISTRATION_CLOSED,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=reg_open_at,
            registration_close_at=reg_close_at,
            location_name="Aught2 Center Courts 1-4",
            min_participants=4,
            max_participants=8,  # 8 teams
            scoring_rules=scoring_rules,
            tiebreaker_rules=tiebreaker_rules,
            format_configuration=format_cfg,
        )
        session.add(tournament)
        await session.flush()

        # 6. Create 8 Teams with 2 male members each and Confirmed Registrations
        created_teams = []
        for spec in TEAMS_SPEC:
            team_id = uuid4()
            team = Team(
                id=team_id,
                tournament_id=tournament_id,
                name=spec["name"],
                seed=spec["seed"],
            )
            session.add(team)
            await session.flush()

            for email in spec["emails"]:
                mem = membership_by_email[email]
                # Team Member
                tm = TeamMember(
                    id=uuid4(),
                    team_id=team_id,
                    player_membership_id=mem.id,
                )
                session.add(tm)

                # Tournament Registration (Confirmed)
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=tournament_id,
                    player_membership_id=mem.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=reg_open_at,
                )
                session.add(reg)

            created_teams.append(team)

        await session.commit()

        print("\n" + "=" * 70)
        print("SUCCESSFULLY CREATED DOUBLE ELIMINATION MEN'S DOUBLES TOURNAMENT")
        print("=" * 70)
        print(f"Tournament ID:       {tournament_id}")
        print(f"Tournament Name:     {tournament.name}")
        print(f"Club:                {club.name} ({club.id})")
        print(f"Format:              Bracket Play (Double Elimination)")
        print(f"Category:            Men's Doubles (2 players per team, Male only)")
        print(f"Status:              {tournament.status.value} (Ready to generate bracket)")
        print(f"Registered Teams:    {len(created_teams)} / {tournament.max_participants} teams (16 players total)")
        print("\nRegistered Teams (Seeded 1-8):")
        for t in created_teams:
            spec = next(s for s in TEAMS_SPEC if s["name"] == t.name)
            emails = ", ".join(spec["emails"])
            print(f"  Seed #{t.seed}: {t.name:<20} [Players: {emails}]")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(create_tournament())
