"""
Seed the exact rich data for 'Winter Classic Round Robin'
Matching the reference UI screenshot:
- 3 Teams (6 players)
- Teams:
  1. Pickle Kings (Karthik G. & Alex C.)
  2. Net Masters (Taylor S. & Jordan L.)
  3. Court Dynamos (Ryan P. & Chris M.)
- Real completed matches on Court 1 and Court 2
- Dates: 15 Sept – 17 Sept
- Men's Doubles, 4.0 Level, Fixed Team (Doubles)
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
from app.models.competition import (
    Match,
    MatchStatus,
    MatchStage,
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

async def seed_finished_round_robin():
    async with AsyncSessionLocal() as session:
        # Find or create Tournament 'Winter Classic Round Robin'
        t = (await session.execute(
            select(Tournament).where(Tournament.name == "Winter Classic Round Robin")
        )).scalars().first()

        # Find or create club "Indoor Courts" or use existing
        club = (await session.execute(select(Club).where(Club.name == "Indoor Courts"))).scalars().first()
        if not club:
            # Check if club exists or find default
            club = (await session.execute(select(Club).limit(1))).scalars().first()
            if not club:
                club = Club(
                    id=uuid4(),
                    name="Indoor Courts",
                    slug="indoor-courts",
                    is_active=True,
                )
                session.add(club)
                await session.flush()

        start_date = datetime(2026, 9, 15, 9, 0, tzinfo=timezone.utc)
        end_date = datetime(2026, 9, 17, 18, 0, tzinfo=timezone.utc)
        reg_open = datetime(2026, 8, 31, 8, 0, tzinfo=timezone.utc)
        reg_close = datetime(2026, 9, 13, 23, 59, tzinfo=timezone.utc)

        if not t:
            t = Tournament(
                id=uuid4(),
                club_id=club.id,
                name="Winter Classic Round Robin",
                format=TournamentFormat.ROUND_ROBIN,
                status=TournamentStatus.COMPLETED,
            )
            session.add(t)

        t.club_id = club.id
        t.name = "Winter Classic Round Robin"
        t.description = "Completed round robin tournament. Final standings and recorded match results."
        t.status = TournamentStatus.COMPLETED
        t.format = TournamentFormat.ROUND_ROBIN
        t.visibility = TournamentVisibility.PUBLIC
        t.start_date = start_date
        t.end_date = end_date
        t.registration_open_at = reg_open
        t.registration_close_at = reg_close
        t.location_name = "Indoor Courts 1-4"
        t.min_participants = 4
        t.max_participants = 16
        t.scoring_rules = {
            "game_format": "single_game",
            "target_score": 11,
            "win_by": 2,
            "description": "First to 11 points, win by 2."
        }
        t.tiebreaker_rules = [
            "head_to_head",
            "points_differential",
            "total_points_scored",
            "team_name_deterministic",
        ]
        t.format_configuration = {
            "category": "Men's Doubles",
            "division": "Men's Doubles",
            "skill_level": "4.0 Level",
            "gender_eligibility": "Any",
            "age_limits": "All Ages",
            "team_size": 2,
            "registration_type": "Fixed Team (Doubles)",
        }
        await session.flush()
        tournament_id = t.id

        # Clean existing matches, team_members, teams, registrations for this tournament
        await session.execute(delete(Match).where(Match.tournament_id == tournament_id))
        await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(
            select(Team.id).where(Team.tournament_id == tournament_id)
        )))
        await session.execute(delete(Team).where(Team.tournament_id == tournament_id))
        await session.execute(delete(TournamentRegistration).where(TournamentRegistration.tournament_id == tournament_id))
        await session.flush()

        # Ensure Courts: Court 1 & Court 2
        court1 = (await session.execute(
            select(Court).where(Court.club_id == club.id, Court.name == "Court 1")
        )).scalars().first()
        if not court1:
            court1 = Court(
                id=uuid4(),
                club_id=club.id,
                name="Court 1",
                court_number=1,
                is_active=True,
            )
            session.add(court1)

        court2 = (await session.execute(
            select(Court).where(Court.club_id == club.id, Court.name == "Court 2")
        )).scalars().first()
        if not court2:
            court2 = Court(
                id=uuid4(),
                club_id=club.id,
                name="Court 2",
                court_number=2,
                is_active=True,
            )
            session.add(court2)
        await session.flush()

        # Players mapping
        player_pairs = {
            "Pickle Kings": ("Karthik G.", "Alex C."),
            "Court Dynamos": ("Ryan P.", "Chris M."),
            "Net Masters": ("Taylor S.", "Jordan L."),
        }

        # Create 3 Teams
        teams = {}
        for name, seed in [
            ("Pickle Kings", 1),
            ("Court Dynamos", 2),
            ("Net Masters", 3),
        ]:
            tm = Team(id=uuid4(), tournament_id=tournament_id, name=name, seed=seed)
            session.add(tm)
            teams[name] = tm
        await session.flush()

        # Create members and users
        for t_name, (p1_name, p2_name) in player_pairs.items():
            tm = teams[t_name]
            for p_name in (p1_name, p2_name):
                u = (await session.execute(select(User).where(User.full_name == p_name))).scalars().first()
                if not u:
                    u = User(
                        id=uuid4(),
                        email=f"{p_name.lower().replace(' ', '.').replace('.', '')}@demo.local",
                        full_name=p_name,
                        hashed_password="mock",
                        is_active=True,
                    )
                    session.add(u)
                    await session.flush()
                m = (await session.execute(
                    select(ClubPlayerMembership).where(
                        ClubPlayerMembership.user_id == u.id,
                        ClubPlayerMembership.club_id == club.id
                    )
                )).scalars().first()
                if not m:
                    m = ClubPlayerMembership(
                        id=uuid4(),
                        user_id=u.id,
                        club_id=club.id,
                        status=PlayerMembershipStatus.ACTIVE,
                    )
                    session.add(m)
                    await session.flush()
                t_mem = TeamMember(
                    id=uuid4(),
                    team_id=tm.id,
                    player_membership_id=m.id,
                )
                session.add(t_mem)
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=tournament_id,
                    player_membership_id=m.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=reg_open,
                )
                session.add(reg)
        await session.flush()

        # Create 4 completed matches matching the screenshot
        # Match 1: Court 1, 15 Sept, 9:00 AM | Pickle Kings vs Net Masters (11 - 8)
        m1 = Match(
            id=uuid4(),
            tournament_id=tournament_id,
            round_number=1,
            match_number=1,
            stage=MatchStage.REGULAR_SEASON,
            team_a_id=teams["Pickle Kings"].id,
            team_b_id=teams["Net Masters"].id,
            court_id=court1.id,
            scheduled_start_at=datetime(2026, 9, 15, 9, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 9, 15, 10, 0, tzinfo=timezone.utc),
            status=MatchStatus.COMPLETED,
            score_a=11,
            score_b=8,
            winner_team_id=teams["Pickle Kings"].id,
            completed_at=datetime(2026, 9, 15, 9, 45, tzinfo=timezone.utc),
        )

        # Match 2: Court 2, 15 Sept, 10:00 AM | Court Dynamos vs Pickle Kings (8 - 11)
        m2 = Match(
            id=uuid4(),
            tournament_id=tournament_id,
            round_number=1,
            match_number=2,
            stage=MatchStage.REGULAR_SEASON,
            team_a_id=teams["Court Dynamos"].id,
            team_b_id=teams["Pickle Kings"].id,
            court_id=court2.id,
            scheduled_start_at=datetime(2026, 9, 15, 10, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 9, 15, 11, 0, tzinfo=timezone.utc),
            status=MatchStatus.COMPLETED,
            score_a=8,
            score_b=11,
            winner_team_id=teams["Pickle Kings"].id,
            completed_at=datetime(2026, 9, 15, 10, 50, tzinfo=timezone.utc),
        )

        # Match 3: Court 1, 16 Sept, 9:00 AM | Net Masters vs Court Dynamos (9 - 11)
        m3 = Match(
            id=uuid4(),
            tournament_id=tournament_id,
            round_number=2,
            match_number=3,
            stage=MatchStage.REGULAR_SEASON,
            team_a_id=teams["Net Masters"].id,
            team_b_id=teams["Court Dynamos"].id,
            court_id=court1.id,
            scheduled_start_at=datetime(2026, 9, 16, 9, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 9, 16, 10, 0, tzinfo=timezone.utc),
            status=MatchStatus.COMPLETED,
            score_a=9,
            score_b=11,
            winner_team_id=teams["Court Dynamos"].id,
            completed_at=datetime(2026, 9, 16, 9, 50, tzinfo=timezone.utc),
        )

        # Match 4: Court 2, 17 Sept, 10:00 AM | Pickle Kings vs Court Dynamos (11 - 6)
        m4 = Match(
            id=uuid4(),
            tournament_id=tournament_id,
            round_number=3,
            match_number=4,
            stage=MatchStage.REGULAR_SEASON,
            team_a_id=teams["Pickle Kings"].id,
            team_b_id=teams["Court Dynamos"].id,
            court_id=court2.id,
            scheduled_start_at=datetime(2026, 9, 17, 10, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 9, 17, 11, 0, tzinfo=timezone.utc),
            status=MatchStatus.COMPLETED,
            score_a=11,
            score_b=6,
            winner_team_id=teams["Pickle Kings"].id,
            completed_at=datetime(2026, 9, 17, 10, 45, tzinfo=timezone.utc),
        )

        session.add_all([m1, m2, m3, m4])
        await session.commit()
        print(f"Successfully seeded 'Winter Classic Round Robin' (ID: {tournament_id}) with 3 teams and 4 matches!")

if __name__ == "__main__":
    asyncio.run(seed_finished_round_robin())
