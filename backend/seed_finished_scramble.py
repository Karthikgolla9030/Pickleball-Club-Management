"""
Seed exact rich data for 'Downtown Weekend Scramble'
Matching the reference UI screenshot:
- Format: Scramble
- Status: COMPLETED
- Category / Division: Open Scramble, 3.5 Level, 12 players
- Location: Downtown Outdoor Courts
- Dates: 22 Sept – 23 Sept (Registration: Opens 9 Sept, Closes 21 Sept)
- Competitors (12 players):
  1. Player Pete (Champion: 58 pts, 11-4, +32)
  2. David L (Runner-Up: 42 pts, 9-6, +18)
  3. Frank W (3rd Place: 41 pts, 8-6, +15)
  4. Alex R. (38 pts, 8-7, +10)
  5. Chris Morgan (36 pts, 7-7, +8)
  6. Priya S. (34 pts, 7-8, +4)
  7. Mike T. (32 pts, 6-8, -2)
  8. Sarah K. (30 pts, 6-9, -6)
  9. Jason P. (28 pts, 5-9, -8)
  10. Emma C. (26 pts, 5-10, -12)
  11. Kevin D. (24 pts, 4-10, -16)
  12. Laura M. (22 pts, 4-11, -20)
- Rounds & Games:
  6 Rounds, 18 Games total (All completed)
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
    MatchStatus,
    MatchStage,
    MatchParticipant,
)
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import TournamentRegistration, RegistrationStatus

PLAYERS_INFO = [
    {"name": "Player Pete", "email": "player.pete@demo.local", "first": "Pete", "last": "Player", "pts": 58, "w": 11, "l": 4, "diff": 32},
    {"name": "David L", "email": "david.l@demo.local", "first": "David", "last": "L", "pts": 42, "w": 9, "l": 6, "diff": 18},
    {"name": "Frank W", "email": "frank.w@demo.local", "first": "Frank", "last": "W", "pts": 41, "w": 8, "l": 6, "diff": 15},
    {"name": "Alex R.", "email": "alex.r@demo.local", "first": "Alex", "last": "R", "pts": 38, "w": 8, "l": 7, "diff": 10},
    {"name": "Chris Morgan", "email": "chris.m@demo.local", "first": "Chris", "last": "Morgan", "pts": 36, "w": 7, "l": 7, "diff": 8},
    {"name": "Priya S.", "email": "priya.s@demo.local", "first": "Priya", "last": "S", "pts": 34, "w": 7, "l": 8, "diff": 4},
    {"name": "Mike T.", "email": "mike.t@demo.local", "first": "Mike", "last": "T", "pts": 32, "w": 6, "l": 8, "diff": -2},
    {"name": "Sarah K.", "email": "sarah.k@demo.local", "first": "Sarah", "last": "K", "pts": 30, "w": 6, "l": 9, "diff": -6},
    {"name": "Jason P.", "email": "jason.p@demo.local", "first": "Jason", "last": "P", "pts": 28, "w": 5, "l": 9, "diff": -8},
    {"name": "Emma C.", "email": "emma.c@demo.local", "first": "Emma", "last": "C", "pts": 26, "w": 5, "l": 10, "diff": -12},
    {"name": "Kevin D.", "email": "kevin.d@demo.local", "first": "Kevin", "last": "D", "pts": 24, "w": 4, "l": 10, "diff": -16},
    {"name": "Laura M.", "email": "laura.m@demo.local", "first": "Laura", "last": "M", "pts": 22, "w": 4, "l": 11, "diff": -20},
]

async def seed_finished_scramble():
    async with AsyncSessionLocal() as session:
        t_id = UUID("b9207948-fa8d-4e06-858f-87cb6fafd36a")
        t = (await session.execute(
            select(Tournament).where(Tournament.id == t_id)
        )).scalars().first()

        club = (await session.execute(select(Club).limit(1))).scalars().first()
        if not club:
            club = Club(
                id=uuid4(),
                name="Downtown Club",
                slug="downtown-club",
                is_active=True,
            )
            session.add(club)
            await session.flush()
        else:
            club.name = "Downtown Club"
            await session.flush()

        # Find or create courts
        court_res = (await session.execute(
            select(Court).where(Court.club_id == club.id)
        )).scalars().all()
        
        court1 = next((c for c in court_res if "1" in c.name), None)
        court2 = next((c for c in court_res if "2" in c.name), None)
        if not court1:
            court1 = Court(
                id=uuid4(),
                club_id=club.id,
                name="Court 1",
                court_number=21,
                surface="cushioned_acrylic",
                is_indoor=False,
                is_active=True,
            )
            session.add(court1)
            await session.flush()
        if not court2:
            court2 = Court(
                id=uuid4(),
                club_id=club.id,
                name="Court 2",
                court_number=22,
                surface="cushioned_acrylic",
                is_indoor=False,
                is_active=True,
            )
            session.add(court2)
            await session.flush()

        start_date = datetime(2026, 9, 22, 9, 0, tzinfo=timezone.utc)
        end_date = datetime(2026, 9, 23, 18, 0, tzinfo=timezone.utc)
        reg_open = datetime(2026, 9, 9, 8, 0, tzinfo=timezone.utc)
        reg_close = datetime(2026, 9, 21, 23, 59, tzinfo=timezone.utc)

        if not t:
            t = Tournament(
                id=t_id,
                club_id=club.id,
                name="Downtown Weekend Scramble",
                format=TournamentFormat.SCRAMBLE,
                status=TournamentStatus.COMPLETED,
            )
            session.add(t)

        t.club_id = club.id
        t.name = "Downtown Weekend Scramble"
        t.description = "Individual scramble rotation: partners rotate each round. Final standings track each player's points across all games."
        t.status = TournamentStatus.COMPLETED
        t.format = TournamentFormat.SCRAMBLE
        t.visibility = TournamentVisibility.PUBLIC
        t.start_date = start_date
        t.end_date = end_date
        t.registration_open_at = reg_open
        t.registration_close_at = reg_close
        t.location_name = "Downtown Outdoor Courts"
        t.min_participants = 8
        t.max_participants = 12
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
        ]
        t.format_configuration = {
            "category": "Open Scramble",
            "division": "Open Scramble",
            "skill_level": "3.5 Level",
            "gender_eligibility": "Any",
            "age_restriction_type": "all_ages",
            "rounds": 6,
            "courts_count": 2,
            "entrants": 12,
            "current_round": 6,
            "round_status": "completed",
        }
        await session.flush()

        # Clean old registrations for this tournament
        await session.execute(
            delete(TournamentRegistration).where(TournamentRegistration.tournament_id == t.id)
        )
        await session.flush()

        # Seed players & memberships
        player_memberships = {}
        for p_info in PLAYERS_INFO:
            user = (await session.execute(
                select(User).where(User.email == p_info["email"])
            )).scalars().first()
            if not user:
                user = User(
                    id=uuid4(),
                    email=p_info["email"],
                    hashed_password="test_hash_password",
                    full_name=p_info["name"],
                    is_active=True,
                    is_verified=True,
                )
                session.add(user)
                await session.flush()

            prof = (await session.execute(
                select(PlayerProfile).where(PlayerProfile.user_id == user.id)
            )).scalars().first()
            if not prof:
                prof = PlayerProfile(
                    id=uuid4(),
                    user_id=user.id,
                    display_name=p_info["name"],
                    first_name=p_info["first"],
                    last_name=p_info["last"],
                )
                session.add(prof)
                await session.flush()
            else:
                prof.display_name = p_info["name"]

            pm = (await session.execute(
                select(ClubPlayerMembership).where(
                    ClubPlayerMembership.club_id == club.id,
                    ClubPlayerMembership.user_id == user.id,
                )
            )).scalars().first()
            if not pm:
                pm = ClubPlayerMembership(
                    id=uuid4(),
                    club_id=club.id,
                    user_id=user.id,
                    membership_number=f"M-{p_info['last'][:3].upper()}-{user.id.hex[:4].upper()}",
                    status=PlayerMembershipStatus.ACTIVE,
                    joined_at=reg_open,
                )
                session.add(pm)
                await session.flush()

            player_memberships[p_info["name"]] = pm

            # Register for tournament
            reg = (await session.execute(
                select(TournamentRegistration).where(
                    TournamentRegistration.tournament_id == t.id,
                    TournamentRegistration.player_membership_id == pm.id,
                )
            )).scalars().first()
            if not reg:
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=t.id,
                    player_membership_id=pm.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=reg_open,
                )
                session.add(reg)
                await session.flush()

        # Clean existing matches for this tournament to ensure exact matches
        existing_matches = (await session.execute(
            select(Match).where(Match.tournament_id == t.id)
        )).scalars().all()
        for em in existing_matches:
            await session.execute(
                delete(MatchParticipant).where(MatchParticipant.match_id == em.id)
            )
            await session.delete(em)
        await session.flush()

        # Games definition matching the reference image
        # 6 rounds with 3 games each = 18 games
        games_data = [
            # Round 1 (22 Sept, 9:00 AM • Court 1)
            {
                "round": 1, "game": 1, "court": court1,
                "time": datetime(2026, 9, 22, 9, 0, tzinfo=timezone.utc),
                "side_a": ["Alex R.", "Player Pete"],
                "side_b": ["Mike T.", "Sarah K."],
                "score_a": 11, "score_b": 8,
            },
            {
                "round": 1, "game": 2, "court": court1,
                "time": datetime(2026, 9, 22, 9, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Priya S."],
                "side_b": ["David L", "Emma C."],
                "score_a": 9, "score_b": 11,
            },
            {
                "round": 1, "game": 3, "court": court1,
                "time": datetime(2026, 9, 22, 9, 0, tzinfo=timezone.utc),
                "side_a": ["Jason P.", "Player Pete"],
                "side_b": ["Frank W", "Laura M."],
                "score_a": 11, "score_b": 10,
            },
            # Round 2 (22 Sept, 10:00 AM • Court 2)
            {
                "round": 2, "game": 1, "court": court2,
                "time": datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Emma C."],
                "side_b": ["Chris Morgan", "Priya S."],
                "score_a": 11, "score_b": 6,
            },
            {
                "round": 2, "game": 2, "court": court2,
                "time": datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc),
                "side_a": ["Kevin D.", "Player Pete"],
                "side_b": ["David L", "Frank W"],
                "score_a": 8, "score_b": 11,
            },
            {
                "round": 2, "game": 3, "court": court2,
                "time": datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Laura M."],
                "side_b": ["Mike T.", "Alex R."],
                "score_a": 11, "score_b": 7,
            },
            # Round 3 (22 Sept, 11:00 AM • Court 1)
            {
                "round": 3, "game": 1, "court": court1,
                "time": datetime(2026, 9, 22, 11, 0, tzinfo=timezone.utc),
                "side_a": ["Chris Morgan", "Player Pete"],
                "side_b": ["David L", "Emma C."],
                "score_a": 11, "score_b": 9,
            },
            {
                "round": 3, "game": 2, "court": court1,
                "time": datetime(2026, 9, 22, 11, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Sarah K."],
                "side_b": ["Jason P.", "Priya S."],
                "score_a": 11, "score_b": 8,
            },
            {
                "round": 3, "game": 3, "court": court1,
                "time": datetime(2026, 9, 22, 11, 0, tzinfo=timezone.utc),
                "side_a": ["Frank W", "Player Pete"],
                "side_b": ["Mike T.", "Kevin D."],
                "score_a": 9, "score_b": 11,
            },
            # Round 4 (22 Sept, 1:00 PM • Court 2)
            {
                "round": 4, "game": 1, "court": court2,
                "time": datetime(2026, 9, 22, 13, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Alex R."],
                "side_b": ["Frank W", "Laura M."],
                "score_a": 11, "score_b": 7,
            },
            {
                "round": 4, "game": 2, "court": court2,
                "time": datetime(2026, 9, 22, 13, 0, tzinfo=timezone.utc),
                "side_a": ["David L", "Player Pete"],
                "side_b": ["Priya S.", "Jason P."],
                "score_a": 10, "score_b": 11,
            },
            {
                "round": 4, "game": 3, "court": court2,
                "time": datetime(2026, 9, 22, 13, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Kevin D."],
                "side_b": ["Chris Morgan", "Mike T."],
                "score_a": 11, "score_b": 5,
            },
            # Round 5 (23 Sept, 9:00 AM • Court 1)
            {
                "round": 5, "game": 1, "court": court1,
                "time": datetime(2026, 9, 23, 9, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Priya S."],
                "side_b": ["Frank W", "Sarah K."],
                "score_a": 11, "score_b": 6,
            },
            {
                "round": 5, "game": 2, "court": court1,
                "time": datetime(2026, 9, 23, 9, 0, tzinfo=timezone.utc),
                "side_a": ["David L", "Alex R."],
                "side_b": ["Emma C.", "Laura M."],
                "score_a": 11, "score_b": 8,
            },
            {
                "round": 5, "game": 3, "court": court1,
                "time": datetime(2026, 9, 23, 9, 0, tzinfo=timezone.utc),
                "side_a": ["Jason P.", "Chris Morgan"],
                "side_b": ["Mike T.", "Kevin D."],
                "score_a": 11, "score_b": 9,
            },
            # Round 6 (23 Sept, 10:00 AM • Court 2)
            {
                "round": 6, "game": 1, "court": court2,
                "time": datetime(2026, 9, 23, 10, 0, tzinfo=timezone.utc),
                "side_a": ["Player Pete", "Frank W"],
                "side_b": ["David L", "Jason P."],
                "score_a": 11, "score_b": 8,
            },
            {
                "round": 6, "game": 2, "court": court2,
                "time": datetime(2026, 9, 23, 10, 0, tzinfo=timezone.utc),
                "side_a": ["Alex R.", "Chris Morgan"],
                "side_b": ["Mike T.", "Emma C."],
                "score_a": 11, "score_b": 7,
            },
            {
                "round": 6, "game": 3, "court": court2,
                "time": datetime(2026, 9, 23, 10, 0, tzinfo=timezone.utc),
                "side_a": ["Priya S.", "Sarah K."],
                "side_b": ["Kevin D.", "Laura M."],
                "score_a": 11, "score_b": 9,
            },
        ]

        for idx, g in enumerate(games_data, start=1):
            m = Match(
                id=uuid4(),
                tournament_id=t.id,
                round_number=g["round"],
                match_number=idx,
                stage=None,
                court_id=g["court"].id,
                scheduled_start_at=g["time"],
                completed_at=g["time"],
                status=MatchStatus.COMPLETED,
                score_a=g["score_a"],
                score_b=g["score_b"],
            )
            session.add(m)
            await session.flush()

            # Side A participants
            for slot, p_name in enumerate(g["side_a"], start=1):
                pm = player_memberships[p_name]
                mp = MatchParticipant(
                    id=uuid4(),
                    match_id=m.id,
                    player_membership_id=pm.id,
                    side="side_a",
                    partner_slot=slot,
                )
                session.add(mp)

            # Side B participants
            for slot, p_name in enumerate(g["side_b"], start=1):
                pm = player_memberships[p_name]
                mp = MatchParticipant(
                    id=uuid4(),
                    match_id=m.id,
                    player_membership_id=pm.id,
                    side="side_b",
                    partner_slot=slot,
                )
                session.add(mp)

        await session.commit()
        print("Successfully seeded Downtown Weekend Scramble with 12 players and 18 matches!")

if __name__ == "__main__":
    asyncio.run(seed_finished_scramble())
