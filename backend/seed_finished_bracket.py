"""
Seed exact rich data for 'Premier Grand Prix Bracket'
Matching the reference UI screenshot:
- Format: Bracket (Single Elimination)
- Status: COMPLETED
- Category: Singles, 4.5 Level, 32 players
- Location: Championship Court
- Dates: 20 Sept – 21 Sept (Registration: Opens 5 Sept, Closes 19 Sept)
- Competitors: Alex Vance, Luke Davis, Chris Morgan, Matt Carter, Daniel Kim, Ryan Brooks, Jordan Lee, Kevin Patel
- Matches:
  1. Semi Final: Alex Vance vs Chris Morgan (11 - 8) on Championship Court, 21 Sept 3:00 PM
  2. Semi Final: Matt Carter vs Luke Davis (9 - 11) on Court 2, 21 Sept 3:00 PM
  3. Final: Alex Vance vs Luke Davis (11 - 6) on Championship Court, 21 Sept 5:00 PM
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

async def seed_finished_bracket():
    async with AsyncSessionLocal() as session:
        t_id = UUID("c9ef16d3-bb79-4ff0-9549-f12671e8a621")
        t = (await session.execute(
            select(Tournament).where(Tournament.id == t_id)
        )).scalars().first()

        club = (await session.execute(select(Club).limit(1))).scalars().first()
        if not club:
            club = Club(
                id=uuid4(),
                name="Championship Court",
                slug="championship-court",
                is_active=True,
            )
            session.add(club)
            await session.flush()

        start_date = datetime(2026, 9, 20, 9, 0, tzinfo=timezone.utc)
        end_date = datetime(2026, 9, 21, 18, 0, tzinfo=timezone.utc)
        reg_open = datetime(2026, 9, 5, 8, 0, tzinfo=timezone.utc)
        reg_close = datetime(2026, 9, 19, 23, 59, tzinfo=timezone.utc)

        if not t:
            t = Tournament(
                id=t_id,
                club_id=club.id,
                name="Premier Grand Prix Bracket",
                format=TournamentFormat.BRACKET,
                status=TournamentStatus.COMPLETED,
            )
            session.add(t)

        t.club_id = club.id
        t.name = "Premier Grand Prix Bracket"
        t.description = "Completed premier singles bracket championship. Final bracket tree and champion records."
        t.status = TournamentStatus.COMPLETED
        t.format = TournamentFormat.BRACKET
        t.visibility = TournamentVisibility.PUBLIC
        t.start_date = start_date
        t.end_date = end_date
        t.registration_open_at = reg_open
        t.registration_close_at = reg_close
        t.location_name = "Championship Court"
        t.min_participants = 8
        t.max_participants = 32
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
            "category": "Singles",
            "division": "Singles",
            "skill_level": "4.5 Level",
            "gender_eligibility": "Any",
            "age_limits": "All Ages",
            "team_size": 1,
            "registration_type": "individual",
            "entrants": 32,
            "max_participants": 32,
            "elimination_type": "single_elimination",
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

        # Ensure Courts: Championship Court & Court 2
        champ_court = (await session.execute(
            select(Court).where(Court.club_id == club.id, Court.name.in_(["Championship Court", "Court 1"]))
        )).scalars().first()
        if not champ_court:
            champ_court = Court(
                id=uuid4(),
                club_id=club.id,
                name="Championship Court",
                court_number=10,
                is_active=True,
            )
            session.add(champ_court)
            await session.flush()

        court2 = (await session.execute(
            select(Court).where(Court.club_id == club.id, Court.name == "Court 2")
        )).scalars().first()
        if not court2:
            court2 = Court(
                id=uuid4(),
                club_id=club.id,
                name="Court 2",
                court_number=11,
                is_active=True,
            )
            session.add(court2)
            await session.flush()

        # Players from the reference mockup
        player_names = [
            ("Alex Vance", 1),
            ("Luke Davis", 2),
            ("Chris Morgan", 3),
            ("Matt Carter", 4),
            ("Daniel Kim", 5),
            ("Ryan Brooks", 6),
            ("Jordan Lee", 7),
            ("Kevin Patel", 8),
            ("Ethan Brown", 9),
            ("Noah Wilson", 10),
            ("Tyler Scott", 11),
            ("Sam Green", 12),
        ]

        teams = {}
        for name, seed in player_names:
            tm = Team(id=uuid4(), tournament_id=tournament_id, name=name, seed=seed)
            session.add(tm)
            teams[name] = tm

            u = (await session.execute(select(User).where(User.full_name == name))).scalars().first()
            if not u:
                u = User(
                    id=uuid4(),
                    email=f"{name.lower().replace(' ', '.')}@demo.local",
                    full_name=name,
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

        # Create the 3 completed matches matching Panel 3
        # Match 1: Semi Final — Alex Vance vs Chris Morgan (11 - 8)
        m1 = Match(
            id=uuid4(),
            tournament_id=tournament_id,
            bracket_round=1,
            match_number=1,
            stage=MatchStage.CHAMPIONSHIP,
            team_a_id=teams["Alex Vance"].id,
            team_b_id=teams["Chris Morgan"].id,
            court_id=champ_court.id,
            scheduled_start_at=datetime(2026, 9, 21, 15, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 9, 21, 16, 0, tzinfo=timezone.utc),
            status=MatchStatus.COMPLETED,
            score_a=11,
            score_b=8,
            winner_team_id=teams["Alex Vance"].id,
            completed_at=datetime(2026, 9, 21, 15, 45, tzinfo=timezone.utc),
        )

        # Match 2: Semi Final — Matt Carter vs Luke Davis (9 - 11)
        m2 = Match(
            id=uuid4(),
            tournament_id=tournament_id,
            bracket_round=1,
            match_number=2,
            stage=MatchStage.CHAMPIONSHIP,
            team_a_id=teams["Matt Carter"].id,
            team_b_id=teams["Luke Davis"].id,
            court_id=court2.id,
            scheduled_start_at=datetime(2026, 9, 21, 15, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 9, 21, 16, 0, tzinfo=timezone.utc),
            status=MatchStatus.COMPLETED,
            score_a=9,
            score_b=11,
            winner_team_id=teams["Luke Davis"].id,
            completed_at=datetime(2026, 9, 21, 15, 50, tzinfo=timezone.utc),
        )

        # Match 3: Final — Alex Vance vs Luke Davis (11 - 6)
        m3 = Match(
            id=uuid4(),
            tournament_id=tournament_id,
            bracket_round=2,
            match_number=3,
            stage=MatchStage.CHAMPIONSHIP,
            team_a_id=teams["Alex Vance"].id,
            team_b_id=teams["Luke Davis"].id,
            court_id=champ_court.id,
            scheduled_start_at=datetime(2026, 9, 21, 17, 0, tzinfo=timezone.utc),
            scheduled_end_at=datetime(2026, 9, 21, 18, 0, tzinfo=timezone.utc),
            status=MatchStatus.COMPLETED,
            score_a=11,
            score_b=6,
            winner_team_id=teams["Alex Vance"].id,
            completed_at=datetime(2026, 9, 21, 17, 45, tzinfo=timezone.utc),
        )

        session.add_all([m1, m2, m3])
        await session.commit()
        print(f"Successfully seeded 'Premier Grand Prix Bracket' (ID: {tournament_id}) with 3 matches and 12 players!")

if __name__ == "__main__":
    asyncio.run(seed_finished_bracket())
