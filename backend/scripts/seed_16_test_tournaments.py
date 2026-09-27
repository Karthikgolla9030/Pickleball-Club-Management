"""
Aught2 Pickleball — Seed Exactly 16 Fully Registered Test Tournaments

Generates EXACTLY 16 test tournaments:
4 formats x 4 categories per format:

A. Round Robin (4):
   1. Round Robin — Singles (16 individual players, 16 1-player teams)
   2. Round Robin — Men's Doubles (32 male players, 16 2-player teams)
   3. Round Robin — Women's Doubles (32 female players, 16 2-player teams)
   4. Round Robin — Mixed Doubles (16 male + 16 female, 16 2-player teams)

B. Pool Play (4):
   1. Pool Play — Singles (16 individual players, 16 1-player teams)
   2. Pool Play — Men's Doubles (32 male players, 16 2-player teams)
   3. Pool Play — Women's Doubles (32 female players, 16 2-player teams)
   4. Pool Play — Mixed Doubles (16 male + 16 female, 16 2-player teams)

C. Bracket Play (4):
   1. Bracket Play — Singles (16 individual players, 16 1-player teams)
   2. Bracket Play — Men's Doubles (32 male players, 16 2-player teams)
   3. Bracket Play — Women's Doubles (32 female players, 16 2-player teams)
   4. Bracket Play — Mixed Doubles (16 male + 16 female, 16 2-player teams)

D. Scramble (4) — Scramble-specific divisions:
   1. Open Scramble (16 individual players: 8 male + 8 female, NO teams)
   2. Men's Scramble (16 individual male players, NO teams)
   3. Women's Scramble (16 individual female players, NO teams)
   4. Mixed Scramble (16 individual players: 8 male + 8 female balanced, NO teams)

Key Rules:
- All 16 tournaments display 16/16 registered (capacity: 16).
- All 16 tournaments in status REGISTRATION_OPEN with future deadlines.
- Real database records (TournamentRegistration, Team, TeamMember).
- Zero premature matches, pools, brackets, rounds, scores, or standings.
- player@demo.local is EXCLUDED from registrations.
- Idempotent and safe to run repeatedly.
"""
import asyncio
from datetime import datetime, timedelta, timezone
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
from app.models.competition import Match, MatchParticipant, Pool, PoolTeam, Team, TeamMember
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

# Precomputed bcrypt hash for 'password123'
DEFAULT_PASSWORD_HASH = "$2b$12$/vxKwf5Tc.3749vJcuBySOnoYMH957zRk1g0EwsENqMd6kapBrHH6"

MALE_PLAYER_SPECS = [
    ("male_player_1@demo.local", "Alex Miller", "Alex", "Miller"),
    ("male_player_2@demo.local", "Ben Davis", "Ben", "Davis"),
    ("male_player_3@demo.local", "Chris Evans", "Chris", "Evans"),
    ("male_player_4@demo.local", "David Clark", "David", "Clark"),
    ("male_player_5@demo.local", "Ethan Wright", "Ethan", "Wright"),
    ("male_player_6@demo.local", "Frank Harris", "Frank", "Harris"),
    ("male_player_7@demo.local", "George Martin", "George", "Martin"),
    ("male_player_8@demo.local", "Henry Walker", "Henry", "Walker"),
    ("male_player_9@demo.local", "Ian Robinson", "Ian", "Robinson"),
    ("male_player_10@demo.local", "Jack White", "Jack", "White"),
    ("male_player_11@demo.local", "Kevin Hall", "Kevin", "Hall"),
    ("male_player_12@demo.local", "Liam Young", "Liam", "Young"),
    ("male_player_13@demo.local", "Michael King", "Michael", "King"),
    ("male_player_14@demo.local", "Nathan Scott", "Nathan", "Scott"),
    ("male_player_15@demo.local", "Oliver Green", "Oliver", "Green"),
    ("male_player_16@demo.local", "Peter Adams", "Peter", "Adams"),
    ("male_player_17@demo.local", "Quentin Baker", "Quentin", "Baker"),
    ("male_player_18@demo.local", "Ryan Gonzalez", "Ryan", "Gonzalez"),
    ("male_player_19@demo.local", "Sam Nelson", "Sam", "Nelson"),
    ("male_player_20@demo.local", "Thomas Carter", "Thomas", "Carter"),
    ("male_player_21@demo.local", "Victor Mitchell", "Victor", "Mitchell"),
    ("male_player_22@demo.local", "William Perez", "William", "Perez"),
    ("male_player_23@demo.local", "Xavier Roberts", "Xavier", "Roberts"),
    ("male_player_24@demo.local", "Zachary Turner", "Zachary", "Turner"),
    ("male_player_25@demo.local", "Aaron Phillips", "Aaron", "Phillips"),
    ("male_player_26@demo.local", "Brian Campbell", "Brian", "Campbell"),
    ("male_player_27@demo.local", "Charles Parker", "Charles", "Parker"),
    ("male_player_28@demo.local", "Daniel Evans", "Daniel", "Evans"),
    ("male_player_29@demo.local", "Edward Edwards", "Edward", "Edwards"),
    ("male_player_30@demo.local", "Felix Collins", "Felix", "Collins"),
    ("male_player_31@demo.local", "Gabriel Stewart", "Gabriel", "Stewart"),
    ("male_player_32@demo.local", "Harry Sanchez", "Harry", "Sanchez"),
]

FEMALE_PLAYER_SPECS = [
    ("female_player_1@demo.local", "Alice Smith", "Alice", "Smith"),
    ("female_player_2@demo.local", "Bethany Johnson", "Bethany", "Johnson"),
    ("female_player_3@demo.local", "Chloe Williams", "Chloe", "Williams"),
    ("female_player_4@demo.local", "Diana Brown", "Diana", "Brown"),
    ("female_player_5@demo.local", "Emma Jones", "Emma", "Jones"),
    ("female_player_6@demo.local", "Fiona Garcia", "Fiona", "Garcia"),
    ("female_player_7@demo.local", "Grace Martinez", "Grace", "Martinez"),
    ("female_player_8@demo.local", "Hannah Rodriguez", "Hannah", "Rodriguez"),
    ("female_player_9@demo.local", "Isla Wilson", "Isla", "Wilson"),
    ("female_player_10@demo.local", "Jessica Anderson", "Jessica", "Anderson"),
    ("female_player_11@demo.local", "Kayla Taylor", "Kayla", "Taylor"),
    ("female_player_12@demo.local", "Lily Thomas", "Lily", "Thomas"),
    ("female_player_13@demo.local", "Maya Moore", "Maya", "Moore"),
    ("female_player_14@demo.local", "Nora Jackson", "Nora", "Jackson"),
    ("female_player_15@demo.local", "Olivia Martin", "Olivia", "Martin"),
    ("female_player_16@demo.local", "Paige Lee", "Paige", "Lee"),
    ("female_player_17@demo.local", "Quinn Perez", "Quinn", "Perez"),
    ("female_player_18@demo.local", "Rachel Thompson", "Rachel", "Thompson"),
    ("female_player_19@demo.local", "Sophia White", "Sophia", "White"),
    ("female_player_20@demo.local", "Tara Harris", "Tara", "Harris"),
    ("female_player_21@demo.local", "Uma Sanchez", "Uma", "Sanchez"),
    ("female_player_22@demo.local", "Victoria Clark", "Victoria", "Clark"),
    ("female_player_23@demo.local", "Wendy Ramirez", "Wendy", "Ramirez"),
    ("female_player_24@demo.local", "Xena Lewis", "Xena", "Lewis"),
    ("female_player_25@demo.local", "Yasmine Robinson", "Yasmine", "Robinson"),
    ("female_player_26@demo.local", "Zoe Walker", "Zoe", "Walker"),
    ("female_player_27@demo.local", "Amber Young", "Amber", "Young"),
    ("female_player_28@demo.local", "Brooke Allen", "Brooke", "Allen"),
    ("female_player_29@demo.local", "Clara King", "Clara", "King"),
    ("female_player_30@demo.local", "Danielle Wright", "Danielle", "Wright"),
    ("female_player_31@demo.local", "Ella Scott", "Ella", "Scott"),
    ("female_player_32@demo.local", "Faith Torres", "Faith", "Torres"),
]


async def ensure_player_pool(session, club_id: UUID):
    """Ensures 32 male and 32 female active club members exist with valid profiles."""
    print("Ensuring 32 male and 32 female test player accounts in club...")
    male_members: list[ClubPlayerMembership] = []
    female_members: list[ClubPlayerMembership] = []

    async def get_or_create_member(email: str, display_name: str, first_name: str, last_name: str, gender: str):
        user = (await session.execute(select(User).where(User.email == email))).scalars().first()
        if not user:
            user = User(
                id=uuid4(),
                email=email,
                hashed_password=DEFAULT_PASSWORD_HASH,
                full_name=display_name,
                is_active=True,
                is_verified=True,
            )
            session.add(user)
            await session.flush()

        profile = (await session.execute(select(PlayerProfile).where(PlayerProfile.user_id == user.id))).scalars().first()
        if not profile:
            profile = PlayerProfile(
                id=uuid4(),
                user_id=user.id,
                display_name=display_name,
                first_name=first_name,
                last_name=last_name,
                gender=gender,
                skill_rating=3.5,
            )
            session.add(profile)
            await session.flush()
        else:
            profile.display_name = display_name
            profile.first_name = first_name
            profile.last_name = last_name
            profile.gender = gender
            profile.skill_rating = 3.5

        mem = (
            await session.execute(
                select(ClubPlayerMembership).where(
                    ClubPlayerMembership.user_id == user.id,
                    ClubPlayerMembership.club_id == club_id,
                )
            )
        ).scalars().first()

        if not mem:
            mem = ClubPlayerMembership(
                id=uuid4(),
                user_id=user.id,
                club_id=club_id,
                status=PlayerMembershipStatus.ACTIVE,
            )
            session.add(mem)
            await session.flush()
        elif mem.status != PlayerMembershipStatus.ACTIVE:
            mem.status = PlayerMembershipStatus.ACTIVE

        # Attach references for easy access
        mem.user = user
        user.player_profile = profile
        return mem

    for email, disp, fn, ln in MALE_PLAYER_SPECS:
        mem = await get_or_create_member(email, disp, fn, ln, "Male")
        male_members.append(mem)

    for email, disp, fn, ln in FEMALE_PLAYER_SPECS:
        mem = await get_or_create_member(email, disp, fn, ln, "Female")
        female_members.append(mem)

    await session.flush()
    print(f"  -> Successfully verified {len(male_members)} male and {len(female_members)} female active club players.")
    return male_members, female_members


async def seed_16_tournaments():
    async with AsyncSessionLocal() as session:
        print("=" * 80)
        print("SEEDING EXACTLY 16 FULLY REGISTERED TEST TOURNAMENTS")
        print("=" * 80)

        # 1. Fetch Target Club
        club = (
            await session.execute(
                select(Club).where(Club.name == "Aught2 Pickleball")
            )
        ).scalars().first()

        if not club:
            club = (
                await session.execute(
                    select(Club).where(Club.is_active == True)  # noqa: E712
                )
            ).scalars().first()

        if not club:
            raise RuntimeError("No active club found in database!")

        club_id = club.id
        print(f"Target Club: {club.name} (ID: {club_id})")

        # 2. Find club creator / director user
        owner_user = (
            await session.execute(
                select(User).where(User.email.in_(["owner@demo.local", "director@demo.local"]))
            )
        ).scalars().first()
        creator_id = owner_user.id if owner_user else None

        # 3. Clean up ALL existing tournaments in club to ensure EXACTLY 16 exist
        existing_tournaments = (
            await session.execute(
                select(Tournament).where(Tournament.club_id == club_id)
            )
        ).scalars().all()

        if existing_tournaments:
            old_ids = [t.id for t in existing_tournaments]
            print(f"Found {len(old_ids)} existing tournament(s) in club. Cleaning up...")
            old_match_ids = (await session.execute(
                select(Match.id).where(Match.tournament_id.in_(old_ids))
            )).scalars().all()
            if old_match_ids:
                await session.execute(delete(MatchParticipant).where(MatchParticipant.match_id.in_(old_match_ids)))
            await session.execute(delete(Match).where(Match.tournament_id.in_(old_ids)))
            await session.execute(delete(PoolTeam).where(PoolTeam.pool_id.in_(
                select(Pool.id).where(Pool.tournament_id.in_(old_ids))
            )))
            await session.execute(delete(Pool).where(Pool.tournament_id.in_(old_ids)))
            await session.execute(delete(TeamMember).where(TeamMember.team_id.in_(
                select(Team.id).where(Team.tournament_id.in_(old_ids))
            )))
            await session.execute(delete(Team).where(Team.tournament_id.in_(old_ids)))
            await session.execute(delete(TournamentRegistration).where(TournamentRegistration.tournament_id.in_(old_ids)))
            await session.execute(delete(Tournament).where(Tournament.id.in_(old_ids)))
            await session.flush()
            print("Cleanup complete.")

        # 4. Ensure 32 male and 32 female players
        male_members, female_members = await ensure_player_pool(session, club_id)

        # Helper to get display name
        def get_name(mem: ClubPlayerMembership) -> str:
            u = mem.user
            p = getattr(u, "player_profile", None)
            if p and p.display_name:
                return p.display_name
            if u and u.full_name:
                return u.full_name
            return u.email if u else "Player"

        # Tournament scheduling parameters
        now = datetime.now(timezone.utc)
        start_date = now + timedelta(days=14)
        end_date = now + timedelta(days=16)
        reg_open_at = now - timedelta(days=3)
        reg_close_at = now + timedelta(days=10)

        # Definition of all 16 tournaments
        tournament_specs = [
            # ── A. Round Robin ───────────────────────────────────────────────
            {
                "format": TournamentFormat.ROUND_ROBIN,
                "fmt_name": "Round Robin",
                "category": "Singles",
                "name": "Test Tournament — Round Robin — Singles",
                "reg_type": "individual",
                "team_size": 1,
                "gender_eligibility": "Any",
            },
            {
                "format": TournamentFormat.ROUND_ROBIN,
                "fmt_name": "Round Robin",
                "category": "Men's Doubles",
                "name": "Test Tournament — Round Robin — Men's Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Male",
            },
            {
                "format": TournamentFormat.ROUND_ROBIN,
                "fmt_name": "Round Robin",
                "category": "Women's Doubles",
                "name": "Test Tournament — Round Robin — Women's Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Female",
            },
            {
                "format": TournamentFormat.ROUND_ROBIN,
                "fmt_name": "Round Robin",
                "category": "Mixed Doubles",
                "name": "Test Tournament — Round Robin — Mixed Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Any",
            },
            # ── B. Pool Play ─────────────────────────────────────────────────
            {
                "format": TournamentFormat.POOL_PLAY,
                "fmt_name": "Pool Play",
                "category": "Singles",
                "name": "Test Tournament — Pool Play — Singles",
                "reg_type": "individual",
                "team_size": 1,
                "gender_eligibility": "Any",
                "number_of_pools": 4,
                "qualifiers_per_pool": 2,
            },
            {
                "format": TournamentFormat.POOL_PLAY,
                "fmt_name": "Pool Play",
                "category": "Men's Doubles",
                "name": "Test Tournament — Pool Play — Men's Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Male",
                "number_of_pools": 4,
                "qualifiers_per_pool": 2,
            },
            {
                "format": TournamentFormat.POOL_PLAY,
                "fmt_name": "Pool Play",
                "category": "Women's Doubles",
                "name": "Test Tournament — Pool Play — Women's Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Female",
                "number_of_pools": 4,
                "qualifiers_per_pool": 2,
            },
            {
                "format": TournamentFormat.POOL_PLAY,
                "fmt_name": "Pool Play",
                "category": "Mixed Doubles",
                "name": "Test Tournament — Pool Play — Mixed Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Any",
                "number_of_pools": 4,
                "qualifiers_per_pool": 2,
            },
            # ── C. Bracket Play ──────────────────────────────────────────────
            {
                "format": TournamentFormat.BRACKET,
                "fmt_name": "Bracket Play",
                "category": "Singles",
                "name": "Test Tournament — Bracket Play — Singles",
                "reg_type": "individual",
                "team_size": 1,
                "gender_eligibility": "Any",
                "bracket_type": "single_elimination",
            },
            {
                "format": TournamentFormat.BRACKET,
                "fmt_name": "Bracket Play",
                "category": "Men's Doubles",
                "name": "Test Tournament — Bracket Play — Men's Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Male",
                "bracket_type": "single_elimination",
            },
            {
                "format": TournamentFormat.BRACKET,
                "fmt_name": "Bracket Play",
                "category": "Women's Doubles",
                "name": "Test Tournament — Bracket Play — Women's Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Female",
                "bracket_type": "single_elimination",
            },
            {
                "format": TournamentFormat.BRACKET,
                "fmt_name": "Bracket Play",
                "category": "Mixed Doubles",
                "name": "Test Tournament — Bracket Play — Mixed Doubles",
                "reg_type": "team",
                "team_size": 2,
                "gender_eligibility": "Any",
                "bracket_type": "single_elimination",
            },
            # ── D. Scramble (Scramble-specific categories) ────────────────────
            {
                "format": TournamentFormat.SCRAMBLE,
                "fmt_name": "Scramble",
                "category": "Open Scramble",
                "name": "Test Tournament — Scramble — Open Scramble",
                "reg_type": "individual",
                "team_size": 1,
                "gender_eligibility": "Any",
                "court_count": 4,
            },
            {
                "format": TournamentFormat.SCRAMBLE,
                "fmt_name": "Scramble",
                "category": "Men's Scramble",
                "name": "Test Tournament — Scramble — Men's Scramble",
                "reg_type": "individual",
                "team_size": 1,
                "gender_eligibility": "Male",
                "court_count": 4,
            },
            {
                "format": TournamentFormat.SCRAMBLE,
                "fmt_name": "Scramble",
                "category": "Women's Scramble",
                "name": "Test Tournament — Scramble — Women's Scramble",
                "reg_type": "individual",
                "team_size": 1,
                "gender_eligibility": "Female",
                "court_count": 4,
            },
            {
                "format": TournamentFormat.SCRAMBLE,
                "fmt_name": "Scramble",
                "category": "Mixed Scramble",
                "name": "Test Tournament — Scramble — Mixed Scramble",
                "reg_type": "individual",
                "team_size": 1,
                "gender_eligibility": "Any",
                "court_count": 4,
            },
        ]

        print(f"\nCreating exactly {len(tournament_specs)} tournaments...")
        created_tournaments = []

        for spec in tournament_specs:
            fmt = spec["format"]
            cat = spec["category"]
            t_name = spec["name"]
            is_scramble = (fmt == TournamentFormat.SCRAMBLE)
            is_singles = (cat == "Singles")

            fee = 35.0 if (is_scramble or is_singles) else 50.0

            format_cfg = {
                "category": cat,
                "skill_level_mode": "single",
                "skill_level": "3.5",
                "min_skill_level": "3.5",
                "max_skill_level": "3.5",
                "gender_eligibility": spec["gender_eligibility"],
                "team_size": spec["team_size"],
                "registration_type": spec["reg_type"],
                "min_age": 18,
                "max_age": 70,
                "entry_fee": fee,
            }

            if "number_of_pools" in spec:
                format_cfg["number_of_pools"] = spec["number_of_pools"]
                format_cfg["qualifiers_per_pool"] = spec["qualifiers_per_pool"]
            if "bracket_type" in spec:
                format_cfg["bracket_type"] = spec["bracket_type"]
            if "court_count" in spec:
                format_cfg["court_count"] = spec["court_count"]
                format_cfg["division"] = cat

            desc = (
                f"Official test tournament for {spec['fmt_name']} format in the {cat} category. "
                f"Full 16/16 registration capacity reached with verified active club members. "
                f"Registration is open and ready for manual closure and lifecycle testing."
            )

            t = Tournament(
                id=uuid4(),
                club_id=club_id,
                created_by_user_id=creator_id,
                name=t_name,
                description=desc,
                format=fmt,
                status=TournamentStatus.REGISTRATION_OPEN,
                visibility=TournamentVisibility.PUBLIC,
                start_date=start_date,
                end_date=end_date,
                registration_open_at=reg_open_at,
                registration_close_at=reg_close_at,
                location_name="Center Courts 1-4",
                min_participants=4,
                max_participants=16,  # 16 teams for doubles, 16 players for singles & scramble
                scoring_rules=dict(DEFAULT_SCORING_RULES),
                tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
                format_configuration=format_cfg,
            )
            session.add(t)
            await session.flush()

            # ── Populate Registrations & Teams ──────────────────────────────
            reg_count = 0
            team_count = 0

            if is_scramble:
                # 16 individual player registrations, 0 teams!
                if cat == "Open Scramble":
                    # 8 male + 8 female
                    chosen_members = male_members[:8] + female_members[:8]
                elif cat == "Men's Scramble":
                    # 16 male
                    chosen_members = male_members[:16]
                elif cat == "Women's Scramble":
                    # 16 female
                    chosen_members = female_members[:16]
                elif cat == "Mixed Scramble":
                    # Exactly 8 male + 8 female for court gender balance
                    chosen_members = male_members[:8] + female_members[:8]
                else:
                    chosen_members = male_members[:8] + female_members[:8]

                for seed_idx, mem in enumerate(chosen_members, start=1):
                    reg = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=mem.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    session.add(reg)
                    reg_count += 1

            elif is_singles:
                # 16 individual players, 16 1-player teams (8 male + 8 female)
                chosen_members = male_members[:8] + female_members[:8]
                for seed_idx, mem in enumerate(chosen_members, start=1):
                    reg = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=mem.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    session.add(reg)
                    reg_count += 1

                    team = Team(
                        id=uuid4(),
                        tournament_id=t.id,
                        name=get_name(mem),
                        seed=seed_idx,
                    )
                    session.add(team)
                    await session.flush()

                    tm = TeamMember(
                        id=uuid4(),
                        team_id=team.id,
                        player_membership_id=mem.id,
                    )
                    session.add(tm)
                    team_count += 1

            elif cat == "Men's Doubles":
                # 16 teams, 32 male players (all 32 male players)
                for team_idx in range(16):
                    seed_idx = team_idx + 1
                    p1 = male_members[2 * team_idx]
                    p2 = male_members[2 * team_idx + 1]

                    reg1 = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=p1.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    reg2 = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=p2.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    session.add_all([reg1, reg2])
                    reg_count += 2

                    team = Team(
                        id=uuid4(),
                        tournament_id=t.id,
                        name=f"{get_name(p1)} & {get_name(p2)}",
                        seed=seed_idx,
                    )
                    session.add(team)
                    await session.flush()

                    tm1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p1.id)
                    tm2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p2.id)
                    session.add_all([tm1, tm2])
                    team_count += 1

            elif cat == "Women's Doubles":
                # 16 teams, 32 female players (all 32 female players)
                for team_idx in range(16):
                    seed_idx = team_idx + 1
                    p1 = female_members[2 * team_idx]
                    p2 = female_members[2 * team_idx + 1]

                    reg1 = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=p1.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    reg2 = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=p2.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    session.add_all([reg1, reg2])
                    reg_count += 2

                    team = Team(
                        id=uuid4(),
                        tournament_id=t.id,
                        name=f"{get_name(p1)} & {get_name(p2)}",
                        seed=seed_idx,
                    )
                    session.add(team)
                    await session.flush()

                    tm1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p1.id)
                    tm2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p2.id)
                    session.add_all([tm1, tm2])
                    team_count += 1

            elif cat == "Mixed Doubles":
                # 16 teams, 16 male + 16 female players (32 players)
                for team_idx in range(16):
                    seed_idx = team_idx + 1
                    p_male = male_members[team_idx]
                    p_female = female_members[team_idx]

                    reg1 = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=p_male.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    reg2 = TournamentRegistration(
                        id=uuid4(),
                        tournament_id=t.id,
                        player_membership_id=p_female.id,
                        status=RegistrationStatus.CONFIRMED,
                        seed=seed_idx,
                        registered_at=now - timedelta(days=2),
                    )
                    session.add_all([reg1, reg2])
                    reg_count += 2

                    team = Team(
                        id=uuid4(),
                        tournament_id=t.id,
                        name=f"{get_name(p_male)} & {get_name(p_female)}",
                        seed=seed_idx,
                    )
                    session.add(team)
                    await session.flush()

                    tm1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p_male.id)
                    tm2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p_female.id)
                    session.add_all([tm1, tm2])
                    team_count += 1

            unit = "teams" if (not is_scramble and not is_singles) else "players"
            display_count = team_count if (not is_scramble and not is_singles) else reg_count
            created_tournaments.append({
                "name": t_name,
                "format": fmt.value,
                "category": cat,
                "registrations": reg_count,
                "teams": team_count,
                "display": f"{display_count}/16 {unit}",
            })
            print(f"  ✓ Created: {t_name} -> {display_count}/16 {unit} ({reg_count} players, {team_count} teams)")

        await session.commit()
        print("\n" + "=" * 80)
        print(f"SUCCESS: Exactly {len(created_tournaments)} test tournaments created and fully committed!")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(seed_16_tournaments())
