"""
Create a 12-team Double Elimination Bracket Tournament with full registration (12/12 teams).
Format: Bracket
Bracket Type: Double Elimination
Status: registration_closed (Ready for the manager to generate bracket and test)
"""
import asyncio
from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.court import Court
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.user import User
from app.models.player_profile import PlayerProfile
from app.models.competition import (
    Match,
    Team,
    TeamMember,
)
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import TournamentRegistration, RegistrationStatus

CLUB_ID = UUID("db24a487-ed43-455e-964e-624c04fe223c")

TEAM_NAMES = [
    "Apex Smashers",
    "Court Dominators",
    "Kitchen Masters",
    "Dink Dynamos",
    "Pickle Pros",
    "Baseline Barons",
    "Net Ninjas",
    "Drop Shot Aces",
    "Side Out Strikers",
    "Topspin Titans",
    "Volley Vipers",
    "Rally Raiders",
]

async def create_double_elimination_tournament():
    async with AsyncSessionLocal() as session:
        # 1. Fetch club
        club = (await session.execute(select(Club).where(Club.id == CLUB_ID))).scalars().first()
        if not club:
            club = (await session.execute(select(Club).limit(1))).scalars().first()
            if not club:
                print("No club found.")
                return

        # 2. Find or clean existing tournament with this name
        existing_t = (await session.execute(
            select(Tournament).where(
                Tournament.club_id == club.id,
                Tournament.name == "Double Elimination Championship"
            )
        )).scalars().first()

        if existing_t:
            print(f"Cleaning up existing tournament {existing_t.id}...")
            await session.execute(delete(Match).where(Match.tournament_id == existing_t.id))
            await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(
                select(Team.id).where(Team.tournament_id == existing_t.id)
            )))
            await session.execute(delete(Team).where(Team.tournament_id == existing_t.id))
            await session.execute(delete(TournamentRegistration).where(TournamentRegistration.tournament_id == existing_t.id))
            await session.execute(delete(Tournament).where(Tournament.id == existing_t.id))
            await session.commit()

        # 3. Collect or create 24 active player memberships for 12 doubles teams
        memberships_q = (
            select(ClubPlayerMembership)
            .where(
                ClubPlayerMembership.club_id == club.id,
                ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE
            )
            .limit(24)
        )
        memberships = list((await session.execute(memberships_q)).scalars().all())

        # If fewer than 24, create enough users and memberships
        while len(memberships) < 24:
            idx = len(memberships) + 1
            user = User(
                id=uuid4(),
                email=f"de_player_{idx}@demo.local",
                full_name=f"DE Player {idx}",
                hashed_password="mock",
                is_active=True,
            )
            session.add(user)
            await session.flush()

            profile = PlayerProfile(
                id=uuid4(),
                user_id=user.id,
                display_name=f"DE Player {idx}",
                singles_skill_rating=3.5 + (idx % 15) * 0.1,
                doubles_skill_rating=3.5 + (idx % 15) * 0.1,
            )
            session.add(profile)
            await session.flush()

            mem = ClubPlayerMembership(
                id=uuid4(),
                user_id=user.id,
                club_id=club.id,
                membership_number=f"DEMEM-{idx:04d}",
                status=PlayerMembershipStatus.ACTIVE,
            )
            session.add(mem)
            await session.flush()
            memberships.append(mem)

        await session.commit()

        # 4. Create Tournament
        start_date = datetime(2026, 10, 5, 9, 0, tzinfo=timezone.utc)
        end_date = datetime(2026, 10, 6, 18, 0, tzinfo=timezone.utc)
        reg_open = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)
        reg_close = datetime(2026, 9, 25, 23, 59, tzinfo=timezone.utc)

        tournament_id = uuid4()
        tournament = Tournament(
            id=tournament_id,
            club_id=club.id,
            name="Double Elimination Championship",
            description="Official 12-Team Double Elimination Doubles Tournament. Winner and Elimination brackets with full 12/12 registration.",
            format=TournamentFormat.BRACKET,
            status=TournamentStatus.REGISTRATION_CLOSED,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=reg_open,
            registration_close_at=reg_close,
            location_name="Aught2 Championship Courts",
            min_participants=4,
            max_participants=12,  # 12 teams
            scoring_rules={
                "game_format": "single_game",
                "target_score": 11,
                "win_by": 2,
                "description": "First to 11 points, win by 2."
            },
            tiebreaker_rules=[
                "head_to_head",
                "points_differential",
                "total_points_scored",
                "team_name_deterministic",
            ],
            format_configuration={
                "bracket_type": "Double Elimination",
                "bracket_format": "Double Elimination",
                "category": "Doubles",
                "division": "Doubles",
                "skill_level": "4.0",
                "gender_eligibility": "Any",
                "team_size": 2,
                "registration_type": "team",
                "max_teams": 12,
                "courts_count": 4,
                "seeding_method": "Team Average Rating (Highest = Seed #1)",
                "bye_rule": "Automatic BYEs awarded to top seeds",
            }
        )
        session.add(tournament)
        await session.flush()

        # 5. Create 12 Teams with 2 players each and Confirmed Registrations
        for i in range(12):
            seed = i + 1
            team_name = TEAM_NAMES[i]
            mem1 = memberships[i * 2]
            mem2 = memberships[i * 2 + 1]

            team = Team(
                id=uuid4(),
                tournament_id=tournament_id,
                name=team_name,
                seed=seed,
            )
            session.add(team)
            await session.flush()

            # Add team members
            tm1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem1.id)
            tm2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem2.id)
            session.add(tm1)
            session.add(tm2)

            # Add confirmed tournament registrations
            reg1 = TournamentRegistration(
                id=uuid4(),
                tournament_id=tournament_id,
                player_membership_id=mem1.id,
                status=RegistrationStatus.CONFIRMED,
                registered_at=reg_open,
            )
            reg2 = TournamentRegistration(
                id=uuid4(),
                tournament_id=tournament_id,
                player_membership_id=mem2.id,
                status=RegistrationStatus.CONFIRMED,
                registered_at=reg_open,
            )
            session.add(reg1)
            session.add(reg2)

        await session.commit()
        print(f"SUCCESS: Created Double Elimination Tournament '{tournament.name}' (ID: {tournament_id})")
        print(f"Status: {tournament.status.value}, Max Participants: 12 teams, Registered: 12 teams (24 players)")

if __name__ == "__main__":
    asyncio.run(create_double_elimination_tournament())
