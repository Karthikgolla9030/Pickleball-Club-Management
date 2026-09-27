"""
Clean all existing tournaments and leagues from the database.
Preserves:
- Users & credentials
- Club profiles & courts
- Club player memberships
- Bookings, lessons, events
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.tournament import Tournament
from app.models.league import League, LeagueWeek, LeagueWeeklyStanding
from app.models.competition import Match, MatchParticipant, Pool, PoolTeam, Team, TeamMember
from app.models.tournament_registration import TournamentRegistration

async def cleanup():
    async with AsyncSessionLocal() as session:
        print("Starting cleanup of all tournament and league records...")

        # 1. Matches and match participants
        await session.execute(delete(MatchParticipant))
        await session.execute(delete(Match))
        print("Deleted match participants and matches.")

        # 2. Pool teams and pools
        await session.execute(delete(PoolTeam))
        await session.execute(delete(Pool))
        print("Deleted pool teams and pools.")

        # 3. Team members and teams
        await session.execute(delete(TeamMember))
        await session.execute(delete(Team))
        print("Deleted team members and teams.")

        # 4. Tournament registrations
        await session.execute(delete(TournamentRegistration))
        print("Deleted tournament registrations.")

        # 5. Tournaments
        await session.execute(delete(Tournament))
        print("Deleted tournaments.")

        # 6. League weeks, standings, leagues
        await session.execute(delete(LeagueWeeklyStanding))
        await session.execute(delete(LeagueWeek))
        await session.execute(delete(League))
        print("Deleted leagues, league weeks, and standings.")

        await session.commit()
        print("Successfully committed cleanup. All tournament and league records removed!")

if __name__ == "__main__":
    asyncio.run(cleanup())
