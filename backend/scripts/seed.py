"""
Development seed script — NOT for production use.

Phase 12 Seed Data (extends Phase 11):
  Membership Plans for Aught2 Pickleball:
    - Basic Monthly      ₹999/month
    - Premium Monthly    ₹1,799/month
    - Annual Premium     ₹14,999/year

  Sample Subscriptions:
    - player@demo.local   → active   (Basic Monthly)
    - player2@demo.local  → scheduled (Premium Monthly)
    - player3@demo.local  → expired   (Annual Premium)
    - player4@demo.local  → cancelled (Basic Monthly)

Phase 6 Seed Data (extends Phase 5):
  Clubs:
    - Aught2 Pickleball (slug: aught2-pickleball)
    - Aught2 Downtown   (slug: aught2-downtown)

  Tournaments:
    - Spring Round Robin Open   [round_robin, in_progress]
        - 4 teams, 6 matches, 4 completed results
    - Summer Pool Play Showcase [pool_play, in_progress]
        - 4 pools (Pool A, Pool B, Pool C, Pool D)
        - 8 teams (2 per pool)
        - 4 pool stage matches completed
        - Championship single-elimination bracket generated
        - 2 Semifinal matches completed (Thunder & Blaze advance)
        - Championship Final pending between Thunder and Blaze!
    - Downtown Weekend Scramble [scramble, completed]
    - Invitational Bracket      [bracket, draft, private]
    - Aught2 Summer Slam        [bracket, in_progress, PUBLIC]  ← Phase 8 standalone bracket

Run:
    python -m scripts.seed
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from datetime import date, datetime, time, timedelta, timezone

from decimal import Decimal

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.payment import (
    Payment,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
)
from app.models.event import (
    Event,
    EventRegistration,
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)
from app.models.lesson import (
    Coach,
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)
from app.models.competition import (
    Match,
    MatchParticipant,
    MatchStage,
    MatchStatus,
    Pool,
    PoolTeam,
    Team,
    TeamMember,
)
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.notification import Notification
from app.models.user import User
from app.models.league import (
    League,
    LeagueStatus,
    LeagueWeek,
    LeagueWeekStatus,
    LeagueWeekType,
    LeagueWeeklyStanding,
)
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.services.competition.scramble_engine import ScrambleEngine
from app.services.competition.bracket_engine import BracketEngine
from app.services.competition.league_engine import LeagueEngine


CLUBS_DATA = [
    {
        "name": "Aught2 Pickleball",
        "slug": "aught2-pickleball",
        "description": "Premier facility with 12 championship indoor courts.",
    },
    {
        "name": "Aught2 Downtown",
        "slug": "aught2-downtown",
        "description": "Urban pickleball club featuring 8 outdoor lighted courts.",
    },
]

USERS_DATA = [
    {
        "email": "owner@demo.local",
        "password": "DemoOwner2024!",
        "full_name": "Demo Owner",
        "display_name": "Owner Dave",
        "bio": "Passionate club founder and 4.0 pickleball player.",
    },
    {
        "email": "manager@demo.local",
        "password": "DemoManager2024!",
        "full_name": "Demo Manager",
        "display_name": "Manager Mary",
        "bio": "Facility operations manager and avid tournament player.",
    },
    {
        "email": "director@demo.local",
        "password": "DemoDirector2024!",
        "full_name": "Demo Director",
        "display_name": "Director Dan",
        "bio": "Tournament director & certified referee.",
    },
    {
        "email": "player@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Demo Player",
        "display_name": "Player Pete",
        "bio": "Recreational 3.5 player looking for weekend tournaments.",
    },
    {
        "email": "owner@test.com",
        "password": "Password123!",
        "full_name": "Test Owner",
        "display_name": "Club Owner",
        "bio": "Club owner test account.",
    },
    {
        "email": "manager@test.com",
        "password": "Password123!",
        "full_name": "Test Manager",
        "display_name": "Club Manager",
        "bio": "Club manager test account.",
    },
    {
        "email": "director@test.com",
        "password": "Password123!",
        "full_name": "Test Director",
        "display_name": "Tournament Director",
        "bio": "Tournament director test account.",
    },
    {
        "email": "player@test.com",
        "password": "Password123!",
        "full_name": "Test Player",
        "display_name": "Demo Player",
        "bio": "Player test account.",
    },
    {
        "email": "player2@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Alice Johnson",
        "display_name": "Alice J",
        "bio": "3.5-rated player, loves doubles.",
    },
    {
        "email": "player3@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Bob Martinez",
        "display_name": "Bob M",
        "bio": "Former tennis player converted to pickleball.",
    },
    {
        "email": "player4@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Carol Smith",
        "display_name": "Carol S",
        "bio": "Weekend warrior, 4.0 rated.",
    },
    {
        "email": "player5@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "David Lee",
        "display_name": "David L",
        "bio": "Local champion at Aught2.",
    },
    {
        "email": "player6@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Eva Chen",
        "display_name": "Eva C",
        "bio": "Competitive 4.5 player.",
    },
    {
        "email": "player7@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Frank Wilson",
        "display_name": "Frank W",
        "bio": "Consistent 3.5 player.",
    },
    {
        "email": "player8@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Grace Hopper",
        "display_name": "Grace H",
        "bio": "Analytical and accurate player.",
    },
    {
        "email": "player9@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Hank Green",
        "display_name": "Hank G",
        "bio": "Strong dinking and baseline game.",
    },
    {
        "email": "player10@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Ivy Taylor",
        "display_name": "Ivy T",
        "bio": "Fast reflexes at the kitchen line.",
    },
    {
        "email": "player11@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Jack Ryan",
        "display_name": "Jack R",
        "bio": "Power server and aggressive attacker.",
    },
    {
        "email": "player12@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Karen Page",
        "display_name": "Karen P",
        "bio": "Strategic doubles partner.",
    },
    {
        "email": "player13@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Leo Fitz",
        "display_name": "Leo F",
        "bio": "Precision drop shots and third-shot drops.",
    },
    {
        "email": "player14@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Maya Lin",
        "display_name": "Maya L",
        "bio": "Steady and calm under pressure.",
    },
    {
        "email": "player15@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Noah Cent",
        "display_name": "Noah C",
        "bio": "Energetic court coverage.",
    },
    {
        "email": "player16@demo.local",
        "password": "DemoPlayer2024!",
        "full_name": "Olivia Wild",
        "display_name": "Olivia W",
        "bio": "Consistent spin and placement.",
    },
]


async def seed(session: AsyncSession) -> None:
    print("Seeding development data for Phase 6 (Round Robin + Pool Play)...")

    # Clear existing data in reverse FK order
    await session.execute(delete(Notification))
    await session.execute(delete(LessonRegistration))
    await session.execute(delete(Lesson))
    await session.execute(delete(LessonType))
    await session.execute(delete(Coach))
    await session.execute(delete(EventRegistration))
    await session.execute(delete(Event))
    await session.execute(delete(Payment))
    await session.execute(delete(MemberSubscription))
    await session.execute(delete(MembershipPlan))
    await session.execute(delete(LeagueWeeklyStanding))
    await session.execute(delete(MatchParticipant))
    await session.execute(delete(Match))
    await session.execute(delete(PoolTeam))
    await session.execute(delete(Pool))
    await session.execute(delete(LeagueWeek))
    await session.execute(delete(League))
    await session.execute(delete(TeamMember))
    await session.execute(delete(Team))
    await session.execute(delete(TournamentRegistration))
    await session.execute(delete(Tournament))
    await session.execute(delete(ClubPlayerMembership))
    await session.execute(delete(PlayerProfile))
    await session.execute(delete(ClubMembership))
    await session.execute(delete(Booking))
    await session.execute(delete(Court))
    await session.execute(delete(Club))
    await session.execute(delete(User))
    await session.flush()

    # 1. Create Clubs
    clubs_by_slug: dict[str, Club] = {}
    for club_data in CLUBS_DATA:
        club = Club(
            name=club_data["name"],
            slug=club_data["slug"],
            description=club_data["description"],
            is_active=True,
        )
        session.add(club)
        await session.flush()
        clubs_by_slug[club.slug] = club
        print(f"  Club: {club.name}")

    # 1b. Create Courts (Phase 10)
    courts_data = [
        # Aught2 Pickleball (5 courts: 4 active, 1 inactive maintenance)
        {
            "club_slug": "aught2-pickleball",
            "name": "Court 1",
            "display_name": None,
            "court_number": 1,
            "indoor_outdoor": CourtEnvironment.INDOOR,
            "surface_type": "Acrylic",
            "description": None,
            "is_active": True,
            "status": CourtStatus.ACTIVE,
            "display_order": 0,
        },
        {
            "club_slug": "aught2-pickleball",
            "name": "Court 2",
            "display_name": None,
            "court_number": 2,
            "indoor_outdoor": CourtEnvironment.INDOOR,
            "surface_type": "Acrylic",
            "description": None,
            "is_active": True,
            "status": CourtStatus.ACTIVE,
            "display_order": 1,
        },
        {
            "club_slug": "aught2-pickleball",
            "name": "Court 3",
            "display_name": None,
            "court_number": 3,
            "indoor_outdoor": CourtEnvironment.OUTDOOR,
            "surface_type": "Concrete",
            "description": None,
            "is_active": True,
            "status": CourtStatus.ACTIVE,
            "display_order": 2,
        },
        {
            "club_slug": "aught2-pickleball",
            "name": "Court 4",
            "display_name": None,
            "court_number": 4,
            "indoor_outdoor": CourtEnvironment.OUTDOOR,
            "surface_type": "Sport Court",
            "description": None,
            "is_active": True,
            "status": CourtStatus.ACTIVE,
            "display_order": 3,
        },
        {
            "club_slug": "aught2-pickleball",
            "name": "Court 5",
            "display_name": "Stadium Court",
            "court_number": 5,
            "indoor_outdoor": CourtEnvironment.INDOOR,
            "surface_type": "Cushioned Acrylic",
            "description": "Under maintenance / resurfacing",
            "is_active": False,
            "status": CourtStatus.INACTIVE,
            "display_order": 4,
        },
        # Aught2 Downtown (3 courts: all active)
        {
            "club_slug": "aught2-downtown",
            "name": "Court 1",
            "display_name": None,
            "court_number": 1,
            "indoor_outdoor": CourtEnvironment.OUTDOOR,
            "surface_type": "Sport Court",
            "description": None,
            "is_active": True,
            "status": CourtStatus.ACTIVE,
            "display_order": 0,
        },
        {
            "club_slug": "aught2-downtown",
            "name": "Court 2",
            "display_name": None,
            "court_number": 2,
            "indoor_outdoor": CourtEnvironment.OUTDOOR,
            "surface_type": "Sport Court",
            "description": None,
            "is_active": True,
            "status": CourtStatus.ACTIVE,
            "display_order": 1,
        },
        {
            "club_slug": "aught2-downtown",
            "name": "Court 3",
            "display_name": None,
            "court_number": 3,
            "indoor_outdoor": CourtEnvironment.INDOOR,
            "surface_type": "Acrylic",
            "description": None,
            "is_active": True,
            "status": CourtStatus.ACTIVE,
            "display_order": 2,
        },
    ]

    courts_by_slug_name: dict[tuple[str, str], Court] = {}
    for cdata in courts_data:
        court = Court(
            club_id=clubs_by_slug[cdata["club_slug"]].id,
            name=cdata["name"],
            display_name=cdata["display_name"],
            court_number=cdata["court_number"],
            indoor_outdoor=cdata["indoor_outdoor"],
            surface_type=cdata["surface_type"],
            description=cdata["description"],
            is_active=cdata["is_active"],
            status=cdata["status"],
            display_order=cdata["display_order"],
        )
        session.add(court)
        await session.flush()
        courts_by_slug_name[(cdata["club_slug"], cdata["name"])] = court
    print(f"  Created {len(courts_data)} courts across {len(clubs_by_slug)} clubs")

    # 2. Create Users & PlayerProfiles
    users_by_email: dict[str, User] = {}
    profiles_by_email: dict[str, PlayerProfile] = {}
    for user_data in USERS_DATA:
        user = User(
            email=user_data["email"],
            hashed_password=hash_password(user_data["password"]),
            full_name=user_data["full_name"],
            is_active=True,
            is_verified=True,
        )
        session.add(user)
        await session.flush()
        users_by_email[user.email] = user

        profile = PlayerProfile(
            user_id=user.id,
            display_name=user_data["display_name"],
            bio=user_data["bio"],
        )
        session.add(profile)
        await session.flush()
        profiles_by_email[user.email] = profile

    print(f"  Created {len(users_by_email)} users with profiles")

    # 3. Staff Club Memberships
    for email, club_slug, role in [
        ("owner@demo.local", "aught2-pickleball", ClubRole.CLUB_OWNER),
        ("manager@demo.local", "aught2-pickleball", ClubRole.CLUB_MANAGER),
        ("director@demo.local", "aught2-pickleball", ClubRole.TOURNAMENT_DIRECTOR),
        ("director@demo.local", "aught2-downtown", ClubRole.CLUB_MANAGER),
        ("owner@test.com", "aught2-pickleball", ClubRole.CLUB_OWNER),
        ("manager@test.com", "aught2-pickleball", ClubRole.CLUB_MANAGER),
        ("director@test.com", "aught2-pickleball", ClubRole.TOURNAMENT_DIRECTOR),
    ]:
        m = ClubMembership(
            user_id=users_by_email[email].id,
            club_id=clubs_by_slug[club_slug].id,
            role=role,
            is_active=True,
        )
        session.add(m)
    await session.flush()
    print("  Staff memberships created")

    # 4. Club Player Memberships
    player_memberships: dict[str, ClubPlayerMembership] = {}
    # player@demo.local through player16@demo.local + owner at aught2-pickleball
    club_aught2 = clubs_by_slug["aught2-pickleball"]
    player_config = [
        ("player@demo.local", "AUG-P-001"),
        ("player@test.com", "AUG-P-099"),
        ("owner@demo.local", "AUG-P-002"),
    ] + [
        (f"player{i}@demo.local", f"AUG-P-{i:03d}")
        for i in range(2, 17)
    ]

    for email, mem_num in player_config:
        pm = ClubPlayerMembership(
            user_id=users_by_email[email].id,
            club_id=club_aught2.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=mem_num,
        )
        session.add(pm)
        await session.flush()
        player_memberships[email] = pm

    # Director at Downtown
    club_downtown = clubs_by_slug["aught2-downtown"]
    pm_dt = ClubPlayerMembership(
        user_id=users_by_email["director@demo.local"].id,
        club_id=club_downtown.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-DT-000",
    )
    session.add(pm_dt)
    await session.flush()
    player_memberships["director@demo.local"] = pm_dt

    # 8 Downtown Player Memberships for Scramble
    dt_player_emails = [
        "player@demo.local",
        "player2@demo.local",
        "player3@demo.local",
        "player4@demo.local",
        "player5@demo.local",
        "player6@demo.local",
        "player7@demo.local",
        "player8@demo.local",
    ]
    dt_player_memberships: dict[str, ClubPlayerMembership] = {}
    for i, email in enumerate(dt_player_emails, start=1):
        pm = ClubPlayerMembership(
            user_id=users_by_email[email].id,
            club_id=club_downtown.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"AUG-DT-{i:03d}",
        )
        session.add(pm)
        await session.flush()
        dt_player_memberships[email] = pm

    print(f"  Created {len(player_memberships) + len(dt_player_memberships)} club player memberships")

    # 5. Tournaments & Leagues
    SEED_DEMO_COMPETITIONS = True
    if SEED_DEMO_COMPETITIONS:
        now = datetime.now(timezone.utc)
        director_user = users_by_email["director@demo.local"]
        owner_user = users_by_email["owner@demo.local"]

        # 5a. Spring Round Robin Open — in_progress (Phase 5 demo)
        t1 = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=director_user.id,
            name="Spring Round Robin Open",
            description="Fast-paced round robin format for all 3.5+ club members.",
            status=TournamentStatus.IN_PROGRESS,
            format=TournamentFormat.ROUND_ROBIN,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=14),
            registration_close_at=now - timedelta(days=1),
            start_date=now + timedelta(days=1),
            end_date=now + timedelta(days=2),
            location_name="Championship Courts 1-4",
            min_participants=4,
            max_participants=16,
        )
        session.add(t1)
        await session.flush()

        # 5b. Summer Pool Play Showcase — in_progress (Phase 6 demo)
        t2 = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=director_user.id,
            name="Summer Pool Play Showcase",
            description="Split pool competition followed by single-elimination championship playoffs.",
            status=TournamentStatus.IN_PROGRESS,
            format=TournamentFormat.POOL_PLAY,
            format_configuration={"number_of_pools": 4, "qualifiers_per_pool": 1},
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=10),
            registration_close_at=now - timedelta(days=1),
            start_date=now + timedelta(days=1),
            end_date=now + timedelta(days=3),
            location_name="Courts 5-8",
            min_participants=8,
            max_participants=24,
        )
        session.add(t2)
        await session.flush()

        # 5c. Downtown Weekend Scramble — completed (Phase 7 demo)
        t3 = Tournament(
            club_id=club_downtown.id,
            created_by_user_id=director_user.id,
            name="Downtown Weekend Scramble",
            description="Individual scramble rotation: rotating partners each round.",
            status=TournamentStatus.COMPLETED,
            format=TournamentFormat.SCRAMBLE,
            format_configuration={"rounds": 3, "matches_per_player": 3, "partner_rotation": "balanced"},
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=14),
            registration_close_at=now - timedelta(days=2),
            start_date=now - timedelta(days=1),
            end_date=now,
            location_name="Downtown Outdoor Courts",
            min_participants=4,
            max_participants=12,
        )
        session.add(t3)
        await session.flush()


        # 5d. Invitational Championship Bracket
        t4 = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=owner_user.id,
            name="Invitational Championship Bracket",
            description="Private single elimination invitational for premier players.",
            status=TournamentStatus.DRAFT,
            format=TournamentFormat.BRACKET,
            visibility=TournamentVisibility.PRIVATE,
            registration_open_at=now + timedelta(days=20),
            registration_close_at=now + timedelta(days=40),
            start_date=now + timedelta(days=45),
            end_date=now + timedelta(days=46),
            location_name="Stadium Court",
            min_participants=8,
            max_participants=16,
        )
        session.add(t4)
        await session.flush()

        # 5e. Aught2 Summer Slam — Standalone Bracket (Phase 8 demo, in_progress)
        t5 = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=director_user.id,
            name="Aught2 Summer Slam",
            description="Single-elimination bracket for top 4 seeded teams. First-round action in progress!",
            status=TournamentStatus.IN_PROGRESS,
            format=TournamentFormat.BRACKET,
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=14),
            registration_close_at=now - timedelta(days=2),
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=1),
            location_name="Aught2 Main Courts",
            min_participants=4,
            max_participants=8,
        )
        session.add(t5)
        await session.flush()
        print("  Tournaments created: Round Robin, Pool Play, Scramble, Bracket (Draft), Bracket (In-Progress)")

        # ─── 4 Open Tournaments for Player Registration (All 4 Formats) ───────────
        # 1. Round Robin Open
        open_rr = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=director_user.id,
            name="Aught2 Fall Round Robin",
            description="Recreational round robin tournament for club members. Every team plays every other team with deterministic rankings.",
            status=TournamentStatus.REGISTRATION_OPEN,
            format=TournamentFormat.ROUND_ROBIN,
            format_configuration={
                "category": "Open Doubles",
                "game_format": "single_game",
                "target_score": 11,
                "win_by": 2,
                "skill_level": "3.5",
            },
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now + timedelta(days=10),
            start_date=now + timedelta(days=14),
            end_date=now + timedelta(days=15),
            location_name="Aught2 Indoor Courts 1-4",
            min_participants=4,
            max_participants=16,
        )
        session.add(open_rr)

        # 2. Pool Play Open
        open_pool = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=director_user.id,
            name="Metro Pool Play Championship",
            description="Two-stage competition: teams compete within pools, followed by single-elimination Championship Bracket playoffs.",
            status=TournamentStatus.REGISTRATION_OPEN,
            format=TournamentFormat.POOL_PLAY,
            format_configuration={
                "category": "Open Doubles",
                "number_of_pools": 2,
                "qualifiers_per_pool": 2,
                "game_format": "single_game",
                "target_score": 11,
                "win_by": 2,
                "skill_level": "4.0",
            },
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now + timedelta(days=10),
            start_date=now + timedelta(days=16),
            end_date=now + timedelta(days=18),
            location_name="Championship Courts 1-6",
            min_participants=8,
            max_participants=16,
        )
        session.add(open_pool)

        # 3. Individual Scramble Open
        open_scramble = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=director_user.id,
            name="Friday Night Scramble Showdown",
            description="Individual scramble format: no partner needed! Players register individually and rotate partners every round, accumulating individual point totals.",
            status=TournamentStatus.REGISTRATION_OPEN,
            format=TournamentFormat.SCRAMBLE,
            format_configuration={
                "category": "Open Scramble",
                "rounds": 3,
                "matches_per_player": 3,
                "partner_rotation": "balanced",
                "skill_level": "3.5",
            },
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now + timedelta(days=10),
            start_date=now + timedelta(days=12),
            end_date=now + timedelta(days=12),
            location_name="Court 1 & Court 2",
            min_participants=4,
            max_participants=16,
        )
        session.add(open_scramble)

        # 4. Standalone Single Elimination Bracket Open
        open_bracket = Tournament(
            club_id=club_aught2.id,
            created_by_user_id=director_user.id,
            name="Aught2 Premier Bracket Open",
            description="High-stakes single-elimination bracket tournament. Win each round to advance to the finals and win the championship trophy!",
            status=TournamentStatus.REGISTRATION_OPEN,
            format=TournamentFormat.BRACKET,
            format_configuration={
                "category": "Open Doubles",
                "seeding_method": "manual",
                "game_format": "single_game",
                "target_score": 11,
                "win_by": 2,
                "skill_level": "4.0",
            },
            visibility=TournamentVisibility.PUBLIC,
            registration_open_at=now - timedelta(days=5),
            registration_close_at=now + timedelta(days=10),
            start_date=now + timedelta(days=20),
            end_date=now + timedelta(days=21),
            location_name="Stadium Center Court",
            min_participants=4,
            max_participants=16,
        )
        session.add(open_bracket)
        await session.flush()

        # Pre-register a few other club members (leaving player@demo.local unregistered so they can register)
        # Round Robin registrations (2 players)
        session.add(TournamentRegistration(
            tournament_id=open_rr.id,
            player_membership_id=player_memberships["player13@demo.local"].id,
            status=RegistrationStatus.CONFIRMED,
            notes="Pre-registered club team",
        ))
        session.add(TournamentRegistration(
            tournament_id=open_rr.id,
            player_membership_id=player_memberships["player14@demo.local"].id,
            status=RegistrationStatus.CONFIRMED,
            notes="Pre-registered club team",
        ))

        # Pool Play registrations (4 players)
        for p_email in ["player9@demo.local", "player10@demo.local", "player11@demo.local", "player12@demo.local"]:
            session.add(TournamentRegistration(
                tournament_id=open_pool.id,
                player_membership_id=player_memberships[p_email].id,
                status=RegistrationStatus.CONFIRMED,
            ))

        # Scramble registrations (3 players)
        for p_email in ["player6@demo.local", "player7@demo.local", "player8@demo.local"]:
            session.add(TournamentRegistration(
                tournament_id=open_scramble.id,
                player_membership_id=player_memberships[p_email].id,
                status=RegistrationStatus.CONFIRMED,
            ))

        # Bracket registrations (2 players)
        for p_email in ["player15@demo.local", "player16@demo.local"]:
            session.add(TournamentRegistration(
                tournament_id=open_bracket.id,
                player_membership_id=player_memberships[p_email].id,
                status=RegistrationStatus.CONFIRMED,
            ))
        await session.flush()
        print("  Created 4 tournaments with REGISTRATION_OPEN across all 4 formats (Round Robin, Pool Play, Scramble, Bracket)!")

        # 6. Registrations for Spring Round Robin
        rr_players = [
            "player@demo.local", "owner@demo.local", "player2@demo.local", "player3@demo.local",
            "player4@demo.local", "player5@demo.local", "player6@demo.local", "player7@demo.local",
        ]
        for i, email in enumerate(rr_players, start=1):
            reg = TournamentRegistration(
                tournament_id=t1.id,
                player_membership_id=player_memberships[email].id,
                status=RegistrationStatus.CONFIRMED,
                seed=i,
            )
            session.add(reg)
        await session.flush()

        # 7. Teams for Spring Round Robin
        team_alpha = Team(tournament_id=t1.id, name="Team Alpha", seed=1)
        team_bravo = Team(tournament_id=t1.id, name="Team Bravo", seed=2)
        team_charlie = Team(tournament_id=t1.id, name="Team Charlie", seed=3)
        team_delta = Team(tournament_id=t1.id, name="Team Delta", seed=4)
        for team in [team_alpha, team_bravo, team_charlie, team_delta]:
            session.add(team)
        await session.flush()

        rr_members = [
            (team_alpha, "player@demo.local", "player2@demo.local"),
            (team_bravo, "player3@demo.local", "player4@demo.local"),
            (team_charlie, "player5@demo.local", "player6@demo.local"),
            (team_delta, "owner@demo.local", "player7@demo.local"),
        ]
        for t, e1, e2 in rr_members:
            session.add(TeamMember(team_id=t.id, player_membership_id=player_memberships[e1].id))
            session.add(TeamMember(team_id=t.id, player_membership_id=player_memberships[e2].id))
        await session.flush()

        # Round Robin Matches & Results
        rr_matches_data = [
            (1, 1, team_alpha.id, team_bravo.id, 11, 7, team_alpha.id, MatchStatus.COMPLETED, 4),
            (1, 2, team_charlie.id, team_delta.id, 9, 11, team_delta.id, MatchStatus.COMPLETED, 3),
            (2, 3, team_alpha.id, team_charlie.id, 11, 4, team_alpha.id, MatchStatus.COMPLETED, 2),
            (2, 4, team_bravo.id, team_delta.id, 13, 11, team_bravo.id, MatchStatus.COMPLETED, 1),
            (3, 5, team_alpha.id, team_delta.id, None, None, None, MatchStatus.PENDING, None),
            (3, 6, team_bravo.id, team_charlie.id, None, None, None, MatchStatus.PENDING, None),
        ]
        for r_num, m_num, ta, tb, sa, sb, wid, st, hrs in rr_matches_data:
            m = Match(
                tournament_id=t1.id,
                round_number=r_num,
                match_number=m_num,
                team_a_id=ta,
                team_b_id=tb,
                score_a=sa,
                score_b=sb,
                winner_team_id=wid,
                status=st,
                completed_at=(now - timedelta(hours=hrs)) if hrs else None,
            )
            session.add(m)
        await session.flush()
        print("  Spring Round Robin: 4 teams, 6 matches (4 completed)")

        # ─── 8. Phase 6: Summer Pool Play Showcase ──────────────────────────────
        # 8a. Registrations: 16 players confirmed
        pp_player_emails = [
            "player@demo.local", "player2@demo.local", "player3@demo.local", "player4@demo.local",
            "player5@demo.local", "player6@demo.local", "player7@demo.local", "player8@demo.local",
            "player9@demo.local", "player10@demo.local", "player11@demo.local", "player12@demo.local",
            "player13@demo.local", "player14@demo.local", "player15@demo.local", "player16@demo.local",
        ]
        for i, email in enumerate(pp_player_emails, start=1):
            reg = TournamentRegistration(
                tournament_id=t2.id,
                player_membership_id=player_memberships[email].id,
                status=RegistrationStatus.CONFIRMED,
                seed=i,
            )
            session.add(reg)
        await session.flush()

        # 8b. 8 Teams
        pp_teams_def = [
            ("Thunder", 1, "player@demo.local", "player2@demo.local"),
            ("Lightning", 2, "player3@demo.local", "player4@demo.local"),
            ("Blaze", 3, "player5@demo.local", "player6@demo.local"),
            ("Inferno", 4, "player7@demo.local", "player8@demo.local"),
            ("Vortex", 5, "player9@demo.local", "player10@demo.local"),
            ("Cyclone", 6, "player11@demo.local", "player12@demo.local"),
            ("Avalanche", 7, "player13@demo.local", "player14@demo.local"),
            ("Blizzard", 8, "player15@demo.local", "player16@demo.local"),
        ]
        pp_teams: dict[str, Team] = {}
        for name, seed_num, e1, e2 in pp_teams_def:
            team = Team(tournament_id=t2.id, name=name, seed=seed_num)
            session.add(team)
            await session.flush()
            pp_teams[name] = team
            session.add(TeamMember(team_id=team.id, player_membership_id=player_memberships[e1].id))
            session.add(TeamMember(team_id=team.id, player_membership_id=player_memberships[e2].id))
        await session.flush()

        # 8c. 4 Pools
        pool_a = Pool(tournament_id=t2.id, name="Pool A", display_order=1)
        pool_b = Pool(tournament_id=t2.id, name="Pool B", display_order=2)
        pool_c = Pool(tournament_id=t2.id, name="Pool C", display_order=3)
        pool_d = Pool(tournament_id=t2.id, name="Pool D", display_order=4)
        for p in [pool_a, pool_b, pool_c, pool_d]:
            session.add(p)
        await session.flush()

        # 8d. Assign teams to pools (2 per pool)
        pool_assignments = [
            (pool_a, pp_teams["Thunder"], 1),
            (pool_a, pp_teams["Lightning"], 2),
            (pool_b, pp_teams["Blaze"], 1),
            (pool_b, pp_teams["Inferno"], 2),
            (pool_c, pp_teams["Vortex"], 1),
            (pool_c, pp_teams["Cyclone"], 2),
            (pool_d, pp_teams["Avalanche"], 1),
            (pool_d, pp_teams["Blizzard"], 2),
        ]
        for pool, team, seed_in_pool in pool_assignments:
            session.add(PoolTeam(pool_id=pool.id, team_id=team.id, seed=seed_in_pool))
        await session.flush()

        # 8e. Pool stage matches (1 per pool, all completed)
        # Pool A: Thunder (11) vs Lightning (7) -> Thunder wins
        # Pool B: Blaze (11) vs Inferno (8) -> Blaze wins
        # Pool C: Vortex (11) vs Cyclone (6) -> Vortex wins
        # Pool D: Avalanche (11) vs Blizzard (9) -> Avalanche wins
        pool_matches_data = [
            (pool_a, pp_teams["Thunder"], pp_teams["Lightning"], 11, 7, pp_teams["Thunder"], 1),
            (pool_b, pp_teams["Blaze"], pp_teams["Inferno"], 11, 8, pp_teams["Blaze"], 2),
            (pool_c, pp_teams["Vortex"], pp_teams["Cyclone"], 11, 6, pp_teams["Vortex"], 3),
            (pool_d, pp_teams["Avalanche"], pp_teams["Blizzard"], 11, 9, pp_teams["Avalanche"], 4),
        ]
        for pool, ta, tb, sa, sb, wid, match_num in pool_matches_data:
            m = Match(
                tournament_id=t2.id,
                stage=MatchStage.POOL,
                pool_id=pool.id,
                round_number=1,
                match_number=match_num,
                team_a_id=ta.id,
                team_b_id=tb.id,
                score_a=sa,
                score_b=sb,
                winner_team_id=wid.id,
                status=MatchStatus.COMPLETED,
                completed_at=now - timedelta(hours=6 - match_num),
            )
            session.add(m)
        await session.flush()

        # 8f. Championship Bracket
        # 4 Qualifiers:
        # Seed 1: Thunder (Pool A #1)
        # Seed 2: Blaze (Pool B #1)
        # Seed 3: Vortex (Pool C #1)
        # Seed 4: Avalanche (Pool D #1)
        # Pairings: 1v4 (Thunder vs Avalanche), 2v3 (Blaze vs Vortex)
        #
        # First create Final (Match 7) so Semifinals can reference it
        final_match = Match(
            tournament_id=t2.id,
            stage=MatchStage.CHAMPIONSHIP,
            bracket_round=2,
            bracket_position=1,
            round_number=2,
            match_number=7,
            team_a_id=pp_teams["Thunder"].id,  # Advanced from Semifinal 1
            team_b_id=pp_teams["Blaze"].id,    # Advanced from Semifinal 2
            status=MatchStatus.PENDING,
        )
        session.add(final_match)
        await session.flush()

        # Semifinal 1 (Match 5): Thunder vs Avalanche -> Thunder wins 11-8
        semi_1 = Match(
            tournament_id=t2.id,
            stage=MatchStage.CHAMPIONSHIP,
            bracket_round=1,
            bracket_position=1,
            round_number=1,
            match_number=5,
            team_a_id=pp_teams["Thunder"].id,
            team_b_id=pp_teams["Avalanche"].id,
            score_a=11,
            score_b=8,
            winner_team_id=pp_teams["Thunder"].id,
            status=MatchStatus.COMPLETED,
            completed_at=now - timedelta(hours=2),
            next_match_id=final_match.id,
            next_match_slot="team_a",
        )
        session.add(semi_1)

        # Semifinal 2 (Match 6): Blaze vs Vortex -> Blaze wins 11-9
        semi_2 = Match(
            tournament_id=t2.id,
            stage=MatchStage.CHAMPIONSHIP,
            bracket_round=1,
            bracket_position=2,
            round_number=1,
            match_number=6,
            team_a_id=pp_teams["Blaze"].id,
            team_b_id=pp_teams["Vortex"].id,
            score_a=11,
            score_b=9,
            winner_team_id=pp_teams["Blaze"].id,
            status=MatchStatus.COMPLETED,
            completed_at=now - timedelta(hours=1),
            next_match_id=final_match.id,
            next_match_slot="team_b",
        )
        session.add(semi_2)
        await session.flush()

        # 9. Downtown Weekend Scramble (Phase 7 demo)
        dt_registered_players = []
        for seed_num, email in enumerate(dt_player_emails, start=1):
            reg = TournamentRegistration(
                tournament_id=t3.id,
                player_membership_id=dt_player_memberships[email].id,
                status=RegistrationStatus.CONFIRMED,
                seed=seed_num,
                registered_at=now - timedelta(days=10 - seed_num),
            )
            session.add(reg)
            dt_registered_players.append({
                "id": dt_player_memberships[email].id,
                "player_membership_id": dt_player_memberships[email].id,
                "user_id": users_by_email[email].id,
                "name": users_by_email[email].full_name,
                "seed": seed_num,
                "registered_at": (now - timedelta(days=10 - seed_num)).isoformat(),
            })
        await session.flush()

        scramble_engine = ScrambleEngine()
        scramble_matchups = scramble_engine.generate_matchups(dt_registered_players, 3)

        scramble_scores = [
            (11, 7),
            (11, 9),
            (12, 10),
            (11, 8),
            (11, 6),
            (11, 9),
        ]

        for m_idx, (m_spec, (score_a, score_b)) in enumerate(zip(scramble_matchups, scramble_scores), start=1):
            m = Match(
                tournament_id=t3.id,
                stage=None,
                round_number=m_spec["round_number"],
                match_number=m_spec["match_number"],
                status=MatchStatus.COMPLETED,
                score_a=score_a,
                score_b=score_b,
                completed_at=now - timedelta(hours=8 - m_idx),
            )
            session.add(m)
            await session.flush()

            for slot, p in enumerate(m_spec["side_a"], start=1):
                session.add(
                    MatchParticipant(
                        match_id=m.id,
                        player_membership_id=p["id"],
                        side="side_a",
                        partner_slot=slot,
                    )
                )
            for slot, p in enumerate(m_spec["side_b"], start=1):
                session.add(
                    MatchParticipant(
                        match_id=m.id,
                        player_membership_id=p["id"],
                        side="side_b",
                        partner_slot=slot,
                    )
                )
        await session.flush()

        # 10. Aught2 Summer Slam — Phase 8 standalone bracket (4 teams, seeded)
        # Use players 8-15 (not used in RR or scramble) for Summer Slam
        slam_player_emails = [
            "player8@demo.local",   # Seed 1
            "player9@demo.local",   # Seed 1 partner
            "player10@demo.local",  # Seed 2
            "player11@demo.local",  # Seed 2 partner
            "player12@demo.local",  # Seed 3
            "player13@demo.local",  # Seed 3 partner
            "player14@demo.local",  # Seed 4
            "player15@demo.local",  # Seed 4 partner
        ]

        # Create 4 teams (2 players each)
        slam_teams: dict[str, Team] = {}
        team_configs = [
            ("Alpha Aces",   1, "player8@demo.local",  "player9@demo.local"),
            ("Beta Blasters", 2, "player10@demo.local", "player11@demo.local"),
            ("Gamma Grinders", 3, "player12@demo.local", "player13@demo.local"),
            ("Delta Dropshots", 4, "player14@demo.local", "player15@demo.local"),
        ]

        for team_name, seed_num, email_a, email_b in team_configs:
            team = Team(
                tournament_id=t5.id,
                name=team_name,
                seed=seed_num,
            )
            session.add(team)
            await session.flush()

            for email in [email_a, email_b]:
                pm = player_memberships[email]
                # Registration
                reg = TournamentRegistration(
                    tournament_id=t5.id,
                    player_membership_id=pm.id,
                    status=RegistrationStatus.CONFIRMED,
                    seed=seed_num,
                    registered_at=now - timedelta(days=3),
                )
                session.add(reg)
                member = TeamMember(
                    team_id=team.id,
                    player_membership_id=pm.id,
                )
                session.add(member)

            slam_teams[team_name] = team

        await session.flush()

        # Generate bracket using BracketEngine (deterministic seeding: 1v4, 2v3)
        bracket_engine = BracketEngine()
        slam_team_dicts = [
            {
                "id": slam_teams[name].id,
                "name": name,
                "seed": seed,
                "members": [
                    {"player_membership_id": player_memberships[e_a].id},
                    {"player_membership_id": player_memberships[e_b].id},
                ],
            }
            for name, seed, e_a, e_b in team_configs
        ]

        slots = bracket_engine.generate_bracket(t5.id, slam_team_dicts)

        # Persist all match slots
        id_map: dict = {}  # old UUID -> new Match.id (for next_match_id fixup)
        slam_matches: list[Match] = []
        for s in slots:
            m = Match(
                tournament_id=t5.id,
                stage=None,
                bracket_round=s.bracket_round,
                bracket_position=s.bracket_position,
                match_number=s.match_number,
                team_a_id=s.team_a_id,
                team_b_id=s.team_b_id,
                status=s.status,
                score_a=s.score_a,
                score_b=s.score_b,
                winner_team_id=s.winner_team_id,
            )
            session.add(m)
            await session.flush()
            id_map[s.id] = m
            slam_matches.append((s, m))

        # Fix next_match_id references (the engine produced temp UUIDs)
        slot_id_to_match = {s.id: m for s, m in slam_matches}
        for s, m in slam_matches:
            if s.next_match_id is not None and s.next_match_id in slot_id_to_match:
                m.next_match_id = slot_id_to_match[s.next_match_id].id
        await session.flush()

        # Record Round 1, Match 1 result: Alpha Aces (Seed 1) vs Delta Dropshots (Seed 4)
        # Alpha Aces wins 11-7 — they advance to the final
        r1_match1 = next(
            m for s, m in slam_matches
            if s.bracket_round == 1 and s.bracket_position == 1 and s.team_a_id is not None and s.team_b_id is not None
        )
        r1_match1.score_a = 11
        r1_match1.score_b = 7
        r1_match1.winner_team_id = slam_teams["Alpha Aces"].id
        r1_match1.status = MatchStatus.COMPLETED
        r1_match1.completed_at = now - timedelta(hours=1)

        # Advance winner to final
        if r1_match1.next_match_id:
            final_m = next((m for _, m in slam_matches if m.id == r1_match1.next_match_id), None)
            if final_m and final_m.team_a_id is None:
                final_m.team_a_id = slam_teams["Alpha Aces"].id

        await session.flush()

        # ─── 6. Phase 9: League Competition — Aught2 Summer League ───────────────
        print("  Seeding Phase 9 League: Aught2 Summer League...")
        league_engine = LeagueEngine()

        league = League(
            club_id=club_aught2.id,
            name="Aught2 Summer League",
            description="Premier 4-week competitive doubles league with regular season standings and championship playoffs.",
            number_of_weeks=4,
            current_week=4,
            team_size=2,
            playoff_team_count=4,
            status=LeagueStatus.PLAYOFFS,
            start_date=now - timedelta(days=28),
        )
        session.add(league)
        await session.flush()

        # 8 fixed doubles teams (16 players total from player@demo.local to player16@demo.local)
        league_team_configs = [
            ("Viper Volleys", 1, "player@demo.local", "player2@demo.local"),
            ("Falcon Smashers", 2, "player3@demo.local", "player4@demo.local"),
            ("Titan Dinking", 3, "player5@demo.local", "player6@demo.local"),
            ("Apex Picklers", 4, "player7@demo.local", "player8@demo.local"),
            ("Shadow Drops", 5, "player9@demo.local", "player10@demo.local"),
            ("Storm Servers", 6, "player11@demo.local", "player12@demo.local"),
            ("Blaze Blockers", 7, "player13@demo.local", "player14@demo.local"),
            ("Zen Spinners", 8, "player15@demo.local", "player16@demo.local"),
        ]

        league_teams: dict[str, Team] = {}
        for name, seed_num, email_a, email_b in league_team_configs:
            t = Team(
                league_id=league.id,
                name=name,
                seed=seed_num,
            )
            session.add(t)
            await session.flush()
            league_teams[name] = t

            for email in [email_a, email_b]:
                pm = player_memberships[email]
                tm = TeamMember(team_id=t.id, player_membership_id=pm.id)
                session.add(tm)

        await session.flush()

        # Create 4 League Weeks: Weeks 1..3 Regular Season (completed), Week 4 Playoffs (in_progress)
        league_weeks: dict[int, LeagueWeek] = {}
        for w in range(1, 5):
            w_type = LeagueWeekType.REGULAR_SEASON if w < 4 else LeagueWeekType.PLAYOFFS
            w_status = LeagueWeekStatus.COMPLETED if w < 4 else LeagueWeekStatus.IN_PROGRESS
            lw = LeagueWeek(
                league_id=league.id,
                week_number=w,
                week_type=w_type,
                status=w_status,
            )
            session.add(lw)
            await session.flush()
            league_weeks[w] = lw

        # Generate regular season schedule for 8 teams across 3 regular season weeks
        league_teams_input = [
            {"id": t.id, "name": t.name, "seed": t.seed}
            for t in league_teams.values()
        ]
        reg_slots = league_engine.generate_regular_season_schedule(league_teams_input, num_regular_weeks=3)

        # Deterministic scores for 12 regular season matches (scored to 11, win by 2)
        reg_scores = [
            # Week 1: 4 matches
            (11, 7), (11, 9), (11, 6), (11, 8),
            # Week 2: 4 matches
            (11, 5), (8, 11), (11, 9), (12, 10),
            # Week 3: 4 matches
            (11, 8), (11, 4), (9, 11), (11, 7),
        ]

        all_reg_matches_dicts: list[dict[str, Any]] = []

        for idx, slot in enumerate(reg_slots):
            s_a, s_b = reg_scores[idx % len(reg_scores)]
            winner_id = slot.team_a_id if s_a > s_b else slot.team_b_id
            m = Match(
                league_id=league.id,
                league_week_id=league_weeks[slot.week_number].id,
                tournament_id=None,
                stage=MatchStage.REGULAR_SEASON,
                match_number=slot.match_number,
                team_a_id=slot.team_a_id,
                team_b_id=slot.team_b_id,
                status=MatchStatus.COMPLETED,
                score_a=s_a,
                score_b=s_b,
                winner_team_id=winner_id,
                completed_at=now - timedelta(days=(4 - slot.week_number) * 7),
            )
            session.add(m)
            all_reg_matches_dicts.append({
                "status": "completed",
                "team_a_id": slot.team_a_id,
                "team_b_id": slot.team_b_id,
                "score_a": s_a,
                "score_b": s_b,
                "week_number": slot.week_number,
            })

        await session.flush()

        # Compute and save weekly standings snapshots for weeks 1, 2, 3
        final_standings = None
        for w in range(1, 4):
            matches_up_to_w = [m for m in all_reg_matches_dicts if m["week_number"] <= w]
            standings = league_engine.calculate_standings(league_teams_input, matches_up_to_w)
            if w == 3:
                final_standings = standings

            for row in standings:
                snap = LeagueWeeklyStanding(
                    league_id=league.id,
                    league_week_id=league_weeks[w].id,
                    week_number=w,
                    team_id=row.team_id,
                    rank=row.rank,
                    matches_played=row.matches_played,
                    wins=row.wins,
                    losses=row.losses,
                    points_scored=row.points_scored,
                    points_allowed=row.points_allowed,
                    points_differential=row.points_differential,
                )
                session.add(snap)
        await session.flush()

        # Week 4: Playoffs
        # Top 4 teams qualify seeded 1..4 based on final regular season standings
        assert final_standings is not None
        qualified_teams = league_engine.prepare_playoff_teams(final_standings, playoff_team_count=4)
        playoff_slots = league_engine.generate_playoff_bracket(league.id, qualified_teams)

        playoff_matches: list[tuple[Any, Match]] = []
        for ps in playoff_slots:
            pm = Match(
                league_id=league.id,
                league_week_id=league_weeks[4].id,
                tournament_id=None,
                stage=MatchStage.PLAYOFFS,
                bracket_round=ps.bracket_round,
                bracket_position=ps.bracket_position,
                match_number=ps.match_number,
                team_a_id=ps.team_a_id,
                team_b_id=ps.team_b_id,
                status=ps.status,
                score_a=ps.score_a,
                score_b=ps.score_b,
                winner_team_id=ps.winner_team_id,
            )
            session.add(pm)
            await session.flush()
            playoff_matches.append((ps, pm))

        # Fix next_match_id references
        slot_to_match_map = {ps.id: m for ps, m in playoff_matches}
        for ps, m in playoff_matches:
            if ps.next_match_id and ps.next_match_id in slot_to_match_map:
                m.next_match_id = slot_to_match_map[ps.next_match_id].id
        await session.flush()

        # Complete 2 Semifinals (Round 1)
        sf1 = next(m for ps, m in playoff_matches if ps.bracket_round == 1 and ps.bracket_position == 1)
        sf2 = next(m for ps, m in playoff_matches if ps.bracket_round == 1 and ps.bracket_position == 2)

        # SF 1: Team A wins 11-6
        sf1.score_a = 11
        sf1.score_b = 6
        sf1.winner_team_id = sf1.team_a_id
        sf1.status = MatchStatus.COMPLETED
        sf1.completed_at = now - timedelta(hours=3)

        # SF 2: Team A wins 11-9
        sf2.score_a = 11
        sf2.score_b = 9
        sf2.winner_team_id = sf2.team_a_id
        sf2.status = MatchStatus.COMPLETED
        sf2.completed_at = now - timedelta(hours=2)

        # Advance both winners to Championship Final (Round 2, Match 1)
        final_match = next(m for ps, m in playoff_matches if ps.bracket_round == 2 and ps.bracket_position == 1)
        final_match.team_a_id = sf1.winner_team_id
        final_match.team_b_id = sf2.winner_team_id
        final_match.status = MatchStatus.PENDING
        final_match.score_a = None
        final_match.score_b = None
        final_match.winner_team_id = None
        await session.flush()

    # ─── Seed Realistic Court Bookings (Phase 11) ──────────────────────────────
    today = datetime.now(timezone.utc).date()
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)

    c1_aught2 = courts_by_slug_name[("aught2-pickleball", "Court 1")]
    c2_aught2 = courts_by_slug_name[("aught2-pickleball", "Court 2")]
    c3_aught2 = courts_by_slug_name[("aught2-pickleball", "Court 3")]
    c1_dt = courts_by_slug_name[("aught2-downtown", "Court 1")]

    sample_bookings = [
        # Court 1 today 10:00-11:00 UTC (Player self-booking, confirmed)
        Booking(
            club_id=c1_aught2.club_id,
            court_id=c1_aught2.id,
            player_id=users_by_email["player@demo.local"].id,
            booked_by_user_id=users_by_email["player@demo.local"].id,
            booking_type=BookingType.PLAYER,
            status=BookingStatus.CONFIRMED,
            start_at=datetime.combine(today, time(10, 0), tzinfo=timezone.utc),
            end_at=datetime.combine(today, time(11, 0), tzinfo=timezone.utc),
            notes="Morning drill practice",
        ),
        # Court 1 today 14:00-15:00 UTC (Staff-created booking for player2, confirmed)
        Booking(
            club_id=c1_aught2.club_id,
            court_id=c1_aught2.id,
            player_id=users_by_email["player2@demo.local"].id,
            booked_by_user_id=users_by_email["manager@demo.local"].id,
            booking_type=BookingType.STAFF,
            status=BookingStatus.CONFIRMED,
            start_at=datetime.combine(today, time(14, 0), tzinfo=timezone.utc),
            end_at=datetime.combine(today, time(15, 0), tzinfo=timezone.utc),
            notes="Staff reserved for player2",
        ),
        # Court 1 today 16:00-17:00 UTC (Player self-booking, cancelled)
        Booking(
            club_id=c1_aught2.club_id,
            court_id=c1_aught2.id,
            player_id=users_by_email["player3@demo.local"].id,
            booked_by_user_id=users_by_email["player3@demo.local"].id,
            booking_type=BookingType.PLAYER,
            status=BookingStatus.CANCELLED,
            start_at=datetime.combine(today, time(16, 0), tzinfo=timezone.utc),
            end_at=datetime.combine(today, time(17, 0), tzinfo=timezone.utc),
            notes="Evening match",
            cancelled_at=datetime.now(timezone.utc) - timedelta(hours=3),
            cancelled_by_user_id=users_by_email["player3@demo.local"].id,
            cancellation_reason="Schedule conflict",
        ),
        # Court 2 tomorrow 09:00-10:00 UTC (Player self-booking, confirmed)
        Booking(
            club_id=c2_aught2.club_id,
            court_id=c2_aught2.id,
            player_id=users_by_email["player@demo.local"].id,
            booked_by_user_id=users_by_email["player@demo.local"].id,
            booking_type=BookingType.PLAYER,
            status=BookingStatus.CONFIRMED,
            start_at=datetime.combine(tomorrow, time(9, 0), tzinfo=timezone.utc),
            end_at=datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc),
            notes="Singles match prep",
        ),
        # Court 2 tomorrow 11:00-12:00 UTC (Player self-booking, confirmed)
        Booking(
            club_id=c2_aught2.club_id,
            court_id=c2_aught2.id,
            player_id=users_by_email["player4@demo.local"].id,
            booked_by_user_id=users_by_email["player4@demo.local"].id,
            booking_type=BookingType.PLAYER,
            status=BookingStatus.CONFIRMED,
            start_at=datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc),
            end_at=datetime.combine(tomorrow, time(12, 0), tzinfo=timezone.utc),
            notes="Doubles training",
        ),
        # Court 3 day after tomorrow 15:00-16:00 UTC (Player self-booking, confirmed)
        Booking(
            club_id=c3_aught2.club_id,
            court_id=c3_aught2.id,
            player_id=users_by_email["player5@demo.local"].id,
            booked_by_user_id=users_by_email["player5@demo.local"].id,
            booking_type=BookingType.PLAYER,
            status=BookingStatus.CONFIRMED,
            start_at=datetime.combine(day_after, time(15, 0), tzinfo=timezone.utc),
            end_at=datetime.combine(day_after, time(16, 0), tzinfo=timezone.utc),
            notes="Cross-court dinking practice",
        ),
        # Downtown Court 1 tomorrow 10:00-11:00 UTC (Player self-booking, confirmed)
        Booking(
            club_id=c1_dt.club_id,
            court_id=c1_dt.id,
            player_id=users_by_email["player@demo.local"].id,
            booked_by_user_id=users_by_email["player@demo.local"].id,
            booking_type=BookingType.PLAYER,
            status=BookingStatus.CONFIRMED,
            start_at=datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc),
            end_at=datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc),
            notes="Downtown outdoor session",
        ),
    ]

    for b in sample_bookings:
        session.add(b)
    await session.flush()
    print(f"  Created {len(sample_bookings)} bookings across Aught2 facilities")

    await session.commit()
    print("  Summer Pool Play Showcase: 4 pools, 8 teams, 4 pool matches (all completed)")
    print("  Championship Bracket: 2 Semifinals completed, Championship Final pending (Thunder vs Blaze)!")
    print("  Downtown Weekend Scramble: 8 players, 3 rounds, 6 scramble matches (all completed)!")
    print("  Aught2 Summer Slam: 4 teams, bracket generated, Round 1 Match 1 complete (Alpha Aces 11-7 Delta Dropshots)!")
    print("  Aught2 Summer League: 8 teams, Weeks 1-3 completed (12 matches scored), Week 4 Playoffs in progress (Semifinals completed, Final pending)!")
    print("  Courts: Aught2 Pickleball (5 courts, 1 inactive), Aught2 Downtown (3 courts, all active)")
    print(f"  Bookings: {len(sample_bookings)} realistic bookings seeded (Confirmed, Cancelled, Staff-created)")
    print("\nPhase 11 seed complete!")

    # ─── Phase 12: Membership Plans & Subscriptions ──────────────────────────────────
    print("\n[Phase 12] Seeding membership plans and subscriptions...")

    # Delete existing Phase 12 data (clean re-seed)
    await session.execute(delete(MemberSubscription))
    await session.execute(delete(MembershipPlan))
    await session.flush()

    # Get the Aught2 Pickleball club
    from sqlalchemy import select
    result = await session.execute(
        select(Club).where(Club.slug == "aught2-pickleball")
    )
    a2_club = result.scalar_one()

    # ─── Create Plans ────────────────────────────────────────────────
    basic_plan = MembershipPlan(
        club_id=a2_club.id,
        name="Basic Monthly",
        description="Standard monthly membership with core court access and booking privileges.",
        status=PlanStatus.ACTIVE,
        duration_unit=PlanDurationUnit.MONTHLY,
        price=999.00,
        currency="INR",
        benefits=[
            "Court booking access",
            "Member-only events",
            "Priority access",
        ],
        booking_limit=3,
        advance_booking_days=14,
    )
    premium_plan = MembershipPlan(
        club_id=a2_club.id,
        name="Premium Monthly",
        description="Premium monthly membership with expanded booking windows and priority access.",
        status=PlanStatus.ACTIVE,
        duration_unit=PlanDurationUnit.MONTHLY,
        price=1799.00,
        currency="INR",
        benefits=[
            "Court booking access",
            "Member-only events",
            "5 upcoming bookings",
            "21-day advance booking",
            "Tournament eligibility",
        ],
        booking_limit=5,
        advance_booking_days=21,
    )
    annual_plan = MembershipPlan(
        club_id=a2_club.id,
        name="Annual Premium",
        description="Best value — full year of premium access with the highest booking limits.",
        status=PlanStatus.ACTIVE,
        duration_unit=PlanDurationUnit.YEARLY,
        price=14999.00,
        currency="INR",
        benefits=[
            "Court booking access",
            "Member-only events",
            "5 upcoming bookings",
            "30-day advance booking",
            "Tournament eligibility",
            "Discounted lessons (future)",
        ],
        booking_limit=5,
        advance_booking_days=30,
    )
    for plan in [basic_plan, premium_plan, annual_plan]:
        session.add(plan)
    await session.flush()
    print(f"  Created 3 membership plans for {a2_club.name}")

    # ─── Create Sample Subscriptions ─────────────────────────────────────
    # Get player memberships for seeded players
    pm_result = await session.execute(
        select(ClubPlayerMembership).where(
            ClubPlayerMembership.club_id == a2_club.id
        )
    )
    player_memberships = {pm.user_id: pm for pm in pm_result.scalars().all()}

    today = date.today()

    sample_subs = []

    # Active subscription: player@demo.local → Basic Monthly
    player_user = users_by_email.get("player@demo.local")
    if player_user and player_user.id in player_memberships:
        pm = player_memberships[player_user.id]
        start = today - timedelta(days=10)
        end = date(start.year + (1 if start.month == 12 else 0),
                   1 if start.month == 12 else start.month + 1,
                   start.day) - timedelta(days=1)
        sample_subs.append(MemberSubscription(
            club_id=a2_club.id,
            player_membership_id=pm.id,
            membership_plan_id=basic_plan.id,
            start_date=start,
            end_date=end,
            status=SubscriptionStatus.ACTIVE,
            auto_renew=False,
            notes="Active Basic Monthly membership",
        ))

    # Scheduled subscription: player2@demo.local → Premium Monthly
    player2_user = users_by_email.get("player2@demo.local")
    if player2_user and player2_user.id in player_memberships:
        pm = player_memberships[player2_user.id]
        start = today + timedelta(days=5)
        end = date(start.year + (1 if start.month == 12 else 0),
                   1 if start.month == 12 else start.month + 1,
                   start.day) - timedelta(days=1)
        sample_subs.append(MemberSubscription(
            club_id=a2_club.id,
            player_membership_id=pm.id,
            membership_plan_id=premium_plan.id,
            start_date=start,
            end_date=end,
            status=SubscriptionStatus.SCHEDULED,
            auto_renew=True,
            notes="Upcoming Premium Monthly subscription",
        ))

    # Expired subscription: player3@demo.local → Annual Premium (past end date)
    player3_user = users_by_email.get("player3@demo.local")
    if player3_user and player3_user.id in player_memberships:
        pm = player_memberships[player3_user.id]
        start = today - timedelta(days=370)
        end = today - timedelta(days=5)
        sample_subs.append(MemberSubscription(
            club_id=a2_club.id,
            player_membership_id=pm.id,
            membership_plan_id=annual_plan.id,
            start_date=start,
            end_date=end,
            status=SubscriptionStatus.EXPIRED,
            auto_renew=False,
            notes="Annual Premium — expired",
        ))

    # Cancelled subscription: player4@demo.local → Basic Monthly
    player4_user = users_by_email.get("player4@demo.local")
    if player4_user and player4_user.id in player_memberships:
        pm = player_memberships[player4_user.id]
        start = today - timedelta(days=20)
        end = date(start.year + (1 if start.month == 12 else 0),
                   1 if start.month == 12 else start.month + 1,
                   start.day) - timedelta(days=1)
        sample_subs.append(MemberSubscription(
            club_id=a2_club.id,
            player_membership_id=pm.id,
            membership_plan_id=basic_plan.id,
            start_date=start,
            end_date=end,
            status=SubscriptionStatus.CANCELLED,
            auto_renew=False,
            notes="Cancelled at player request",
            cancelled_at=datetime.now(timezone.utc) - timedelta(days=5),
            cancellation_reason="Player moved to different club",
        ))

    for s in sample_subs:
        session.add(s)
    await session.flush()
    print(f"  Created {len(sample_subs)} sample subscriptions (active, scheduled, expired, cancelled)")

    # ─── Phase 13: Membership Payments ──────────────────────────────
    print("Creating Phase 13 membership payments...")
    owner_user = users_by_email["owner@demo.local"]
    sample_payments = [
        # 1. Succeeded: player@demo.local for Basic Monthly (₹999)
        Payment(
            reference="A2P-2026-000001",
            club_id=a2_club.id,
            player_id=users_by_email["player@demo.local"].id,
            subscription_id=sample_subs[0].id,
            amount=Decimal("999.00"),
            currency="INR",
            status=PaymentStatus.SUCCEEDED,
            purpose=PaymentPurpose.MEMBERSHIP,
            payment_method=PaymentMethod.BANK_TRANSFER,
            notes="Initial enrollment payment for Basic Monthly",
            created_by_user_id=owner_user.id,
            status_changed_by_user_id=owner_user.id,
            paid_at=datetime.now(timezone.utc) - timedelta(days=2),
        ),
        # 2. Succeeded: player2@demo.local for Premium Monthly (₹1,799)
        Payment(
            reference="A2P-2026-000002",
            club_id=a2_club.id,
            player_id=users_by_email["player2@demo.local"].id,
            subscription_id=sample_subs[1].id,
            amount=Decimal("1799.00"),
            currency="INR",
            status=PaymentStatus.SUCCEEDED,
            purpose=PaymentPurpose.MEMBERSHIP,
            payment_method=PaymentMethod.CASH,
            notes="Front desk cash payment for Premium Monthly",
            created_by_user_id=owner_user.id,
            status_changed_by_user_id=owner_user.id,
            paid_at=datetime.now(timezone.utc) - timedelta(days=1),
        ),
        # 3. Pending: player3@demo.local for Annual Premium (₹999)
        Payment(
            reference="A2P-2026-000003",
            club_id=a2_club.id,
            player_id=users_by_email["player3@demo.local"].id,
            subscription_id=sample_subs[2].id,
            amount=Decimal("999.00"),
            currency="INR",
            status=PaymentStatus.PENDING,
            purpose=PaymentPurpose.MEMBERSHIP,
            payment_method=PaymentMethod.BANK_TRANSFER,
            notes="Awaiting bank transfer confirmation",
            created_by_user_id=owner_user.id,
        ),
        # 4. Failed: player4@demo.local for Basic Monthly (₹999)
        Payment(
            reference="A2P-2026-000004",
            club_id=a2_club.id,
            player_id=users_by_email["player4@demo.local"].id,
            subscription_id=sample_subs[3].id,
            amount=Decimal("999.00"),
            currency="INR",
            status=PaymentStatus.FAILED,
            purpose=PaymentPurpose.MEMBERSHIP,
            payment_method=PaymentMethod.ONLINE,
            notes="Payment gateway session timed out",
            failure_reason="Payment timed out / session expired",
            created_by_user_id=owner_user.id,
            status_changed_by_user_id=owner_user.id,
            failed_at=datetime.now(timezone.utc) - timedelta(days=5),
        ),
    ]

    for p in sample_payments:
        session.add(p)
    await session.flush()
    print(f"  Created {len(sample_payments)} sample payments (2 succeeded, 1 pending, 1 failed)")

    # 10. Phase 14: Events & Event Registrations
    print("Seeding Phase 14 Events...")
    now = datetime.now(timezone.utc)

    # Event 1: Saturday Social Night (social, published, members_only, capacity: 16, fee: 0)
    event_social = Event(
        club_id=a2_club.id,
        title="Saturday Social Night",
        description="Weekly recreational round-robin social and mixer for all club members. Music and refreshments provided.",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.MEMBERS_ONLY,
        start_at=now + timedelta(days=3, hours=18),
        end_at=now + timedelta(days=3, hours=21),
        location="Center Courts 1-4",
        capacity=16,
        registration_required=True,
        registration_opens_at=now - timedelta(days=5),
        registration_closes_at=now + timedelta(days=3, hours=17),
        registration_fee=Decimal("0.00"),
        currency="INR",
        created_by_user_id=owner_user.id,
    )
    session.add(event_social)
    await session.flush()

    # Event 2: Beginner Pickleball Clinic (clinic, published, public, capacity: 8, fee: 499)
    event_clinic = Event(
        club_id=a2_club.id,
        title="Beginner Pickleball Clinic",
        description="Learn fundamentals, rules, and kitchen etiquette from certified instructors. Equipment provided.",
        event_type=EventType.CLINIC,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=5, hours=10),
        end_at=now + timedelta(days=5, hours=12),
        location="Training Court 5",
        capacity=8,
        registration_required=True,
        registration_opens_at=now - timedelta(days=3),
        registration_closes_at=now + timedelta(days=5, hours=9),
        registration_fee=Decimal("499.00"),
        currency="INR",
        created_by_user_id=owner_user.id,
    )
    session.add(event_clinic)
    await session.flush()

    # Event 3: Club Anniversary Gathering (special, draft, public, unlimited capacity)
    event_anniversary = Event(
        club_id=a2_club.id,
        title="Club Anniversary Gathering",
        description="Celebrating 2 years of Aught2 Pickleball! Special exhibition matches and community BBQ.",
        event_type=EventType.SPECIAL,
        status=EventStatus.DRAFT,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=20, hours=16),
        end_at=now + timedelta(days=20, hours=20),
        location="Main Club Pavilion",
        capacity=None,
        registration_required=True,
        registration_opens_at=now + timedelta(days=5),
        registration_closes_at=now + timedelta(days=19),
        registration_fee=Decimal("0.00"),
        currency="INR",
        created_by_user_id=owner_user.id,
    )
    session.add(event_anniversary)
    await session.flush()

    # Event 4: Community Open House (community, completed, public, capacity: 50)
    event_openhouse = Event(
        club_id=a2_club.id,
        title="Community Open House",
        description="Free demo day for local residents to try pickleball and tour facilities.",
        event_type=EventType.COMMUNITY,
        status=EventStatus.COMPLETED,
        visibility=EventVisibility.PUBLIC,
        start_at=now - timedelta(days=10, hours=10),
        end_at=now - timedelta(days=10, hours=14),
        location="Courts 1-8",
        capacity=50,
        registration_required=True,
        registration_opens_at=now - timedelta(days=20),
        registration_closes_at=now - timedelta(days=10, hours=9),
        registration_fee=Decimal("0.00"),
        currency="INR",
        created_by_user_id=owner_user.id,
    )
    session.add(event_openhouse)
    await session.flush()

    # Registrations across various statuses:
    # 1. Social Night:
    #    - player@demo.local: REGISTERED
    #    - player2@demo.local: REGISTERED
    #    - player3@demo.local: WAITLISTED
    #    - player4@demo.local: CANCELLED
    # 2. Clinic:
    #    - player5@demo.local: REGISTERED
    #    - player6@demo.local: REGISTERED
    # 3. Open House (completed):
    #    - player7@demo.local: ATTENDED
    #    - player8@demo.local: NO_SHOW
    sample_registrations = [
        EventRegistration(
            event_id=event_social.id,
            user_id=users_by_email["player@demo.local"].id,
            status=EventRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=4),
            notes="Looking forward to social night!",
        ),
        EventRegistration(
            event_id=event_social.id,
            user_id=users_by_email["player2@demo.local"].id,
            status=EventRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=3),
        ),
        EventRegistration(
            event_id=event_social.id,
            user_id=users_by_email["player3@demo.local"].id,
            status=EventRegistrationStatus.WAITLISTED,
            registered_at=now - timedelta(days=2),
            notes="Please promote if a spot opens",
        ),
        EventRegistration(
            event_id=event_social.id,
            user_id=users_by_email["player4@demo.local"].id,
            status=EventRegistrationStatus.CANCELLED,
            registered_at=now - timedelta(days=4),
            cancelled_at=now - timedelta(days=1),
            notes="Schedule conflict",
        ),
        EventRegistration(
            event_id=event_clinic.id,
            user_id=users_by_email["player5@demo.local"].id,
            status=EventRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=2),
            notes="Bringing own paddle",
        ),
        EventRegistration(
            event_id=event_clinic.id,
            user_id=users_by_email["player6@demo.local"].id,
            status=EventRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=1),
        ),
        EventRegistration(
            event_id=event_openhouse.id,
            user_id=users_by_email["player7@demo.local"].id,
            status=EventRegistrationStatus.ATTENDED,
            registered_at=now - timedelta(days=15),
            notes="First time playing pickleball",
        ),
        EventRegistration(
            event_id=event_openhouse.id,
            user_id=users_by_email["player8@demo.local"].id,
            status=EventRegistrationStatus.NO_SHOW,
            registered_at=now - timedelta(days=14),
        ),
    ]

    for reg in sample_registrations:
        session.add(reg)
    await session.flush()
    print(f"  Created {len(sample_registrations)} sample registrations (registered, waitlisted, attended, no-show, cancelled)")

    # =========================================================================
    # Phase 15: Coaches, Lesson Types, Lessons, and Lesson Registrations
    # =========================================================================
    print("\nSeeding Phase 15 Coaching & Lessons...")
    club_main = clubs_by_slug["aught2-pickleball"]

    # 1. Coaches
    coach_alex = Coach(
        club_id=club_main.id,
        name="Alex Morgan",
        specialization="Advanced Strategy & Singles",
        phone="+91 98765 43210",
        email="alex.morgan@demo.local",
        bio="PPR Certified Coach with 8+ years coaching top tournament players.",
        is_active=True,
    )
    coach_priya = Coach(
        club_id=club_main.id,
        name="Priya Sharma",
        specialization="Beginner & Dinking Fundamentals",
        phone="+91 98765 43211",
        email="priya.sharma@demo.local",
        bio="Focuses on mechanics, third-shot drops, and court safety.",
        is_active=True,
    )
    coach_daniel = Coach(
        club_id=club_main.id,
        name="Daniel Lee",
        specialization="Doubles Stacking & Transition",
        phone="+91 98765 43212",
        email="daniel.lee@demo.local",
        bio="Former college tennis athlete specialized in tactical doubles play.",
        is_active=True,
    )
    session.add_all([coach_alex, coach_priya, coach_daniel])
    await session.flush()
    print("  Created 3 coaches: Alex Morgan, Priya Sharma, Daniel Lee")

    # 2. Lesson Types
    lt_beginner = LessonType(
        club_id=club_main.id,
        name="Beginner Fundamentals",
        description="Introduction to grip, paddle control, basic dinking, and court rules.",
        duration_minutes=60,
        default_capacity=8,
        default_price=Decimal("600.00"),
        currency="INR",
        is_private=False,
        is_active=True,
    )
    lt_intermediate = LessonType(
        club_id=club_main.id,
        name="Intermediate Skills",
        description="Third-shot drop drills, transition zone resets, and cross-court dinking.",
        duration_minutes=60,
        default_capacity=6,
        default_price=Decimal("800.00"),
        currency="INR",
        is_private=False,
        is_active=True,
    )
    lt_private = LessonType(
        club_id=club_main.id,
        name="Private Coaching",
        description="1-on-1 personalized technical feedback, video analysis, and target drills.",
        duration_minutes=60,
        default_capacity=1,
        default_price=Decimal("1500.00"),
        currency="INR",
        is_private=True,
        is_active=True,
    )
    lt_doubles = LessonType(
        club_id=club_main.id,
        name="Doubles Strategy",
        description="Stacking, switching, poaching, and target placement in doubles play.",
        duration_minutes=90,
        default_capacity=8,
        default_price=Decimal("1000.00"),
        currency="INR",
        is_private=False,
        is_active=True,
    )
    session.add_all([lt_beginner, lt_intermediate, lt_private, lt_doubles])
    await session.flush()
    print("  Created 4 lesson types: Beginner, Intermediate, Private, Doubles Strategy")

    # 3. Lessons
    court_1 = courts_by_slug_name.get(("aught2-pickleball", "Court 1"))
    court_2 = courts_by_slug_name.get(("aught2-pickleball", "Court 2"))
    court_3 = courts_by_slug_name.get(("aught2-pickleball", "Court 3"))

    lesson_beginner = Lesson(
        club_id=club_main.id,
        lesson_type_id=lt_beginner.id,
        coach_id=coach_priya.id,
        court_id=court_1.id if court_1 else None,
        title="Saturday Beginner Clinic",
        description="Master the fundamentals and basic kitchen rules.",
        start_at=now + timedelta(days=2, hours=2),
        end_at=now + timedelta(days=2, hours=3),
        capacity=8,
        price=Decimal("600.00"),
        currency="INR",
        status=LessonStatus.PUBLISHED,
        registration_opens_at=now - timedelta(days=5),
        registration_closes_at=now + timedelta(days=2, hours=1),
        created_by_user_id=users_by_email["owner@demo.local"].id,
    )

    lesson_intermediate = Lesson(
        club_id=club_main.id,
        lesson_type_id=lt_intermediate.id,
        coach_id=coach_alex.id,
        court_id=court_2.id if court_2 else None,
        title="Third-Shot Mastery",
        description="Intensive practice on drops, drives, and transition zone defense.",
        start_at=now + timedelta(days=3, hours=4),
        end_at=now + timedelta(days=3, hours=5),
        capacity=6,
        price=Decimal("800.00"),
        currency="INR",
        status=LessonStatus.PUBLISHED,
        registration_opens_at=now - timedelta(days=5),
        registration_closes_at=now + timedelta(days=3, hours=3),
        created_by_user_id=users_by_email["manager@demo.local"].id,
    )

    lesson_private = Lesson(
        club_id=club_main.id,
        lesson_type_id=lt_private.id,
        coach_id=coach_daniel.id,
        court_id=court_3.id if court_3 else None,
        title="1-on-1 Tactical Coaching",
        description="Individual technique fine-tuning and tactical video review.",
        start_at=now + timedelta(days=4, hours=1),
        end_at=now + timedelta(days=4, hours=2),
        capacity=1,
        price=Decimal("1500.00"),
        currency="INR",
        status=LessonStatus.PUBLISHED,
        registration_opens_at=now - timedelta(days=5),
        registration_closes_at=now + timedelta(days=4),
        created_by_user_id=users_by_email["owner@demo.local"].id,
    )

    lesson_completed = Lesson(
        club_id=club_main.id,
        lesson_type_id=lt_doubles.id,
        coach_id=coach_daniel.id,
        court_id=court_1.id if court_1 else None,
        title="Past Doubles Strategy Workshop",
        description="Completed workshop on stacking and transition zone teamwork.",
        start_at=now - timedelta(days=5, hours=3),
        end_at=now - timedelta(days=5, hours=1, minutes=30),
        capacity=8,
        price=Decimal("1000.00"),
        currency="INR",
        status=LessonStatus.COMPLETED,
        registration_opens_at=now - timedelta(days=12),
        registration_closes_at=now - timedelta(days=5, hours=4),
        created_by_user_id=users_by_email["owner@demo.local"].id,
    )

    session.add_all([lesson_beginner, lesson_intermediate, lesson_private, lesson_completed])
    await session.flush()
    print("  Created 4 lessons: Beginner (published), Intermediate (published), Private (published), Doubles Strategy (completed)")

    # 4. Lesson Registrations
    lesson_registrations = [
        # Beginner registrations
        LessonRegistration(
            lesson_id=lesson_beginner.id,
            user_id=users_by_email["player@demo.local"].id,
            status=LessonRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=2),
            notes="Focusing on forehand control",
        ),
        LessonRegistration(
            lesson_id=lesson_beginner.id,
            user_id=users_by_email["player2@demo.local"].id,
            status=LessonRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=1),
        ),
        LessonRegistration(
            lesson_id=lesson_beginner.id,
            user_id=users_by_email["player3@demo.local"].id,
            status=LessonRegistrationStatus.CANCELLED,
            registered_at=now - timedelta(days=3),
            cancelled_at=now - timedelta(days=1),
            notes="Schedule conflict, had to cancel",
        ),
        # Intermediate registrations
        LessonRegistration(
            lesson_id=lesson_intermediate.id,
            user_id=users_by_email["player4@demo.local"].id,
            status=LessonRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=2),
        ),
        LessonRegistration(
            lesson_id=lesson_intermediate.id,
            user_id=users_by_email["player5@demo.local"].id,
            status=LessonRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=1),
        ),
        # Private coaching registration (fills capacity 1)
        LessonRegistration(
            lesson_id=lesson_private.id,
            user_id=users_by_email["player@demo.local"].id,
            status=LessonRegistrationStatus.REGISTERED,
            registered_at=now - timedelta(days=1),
            notes="Looking for backhand roll improvement",
        ),
        # Completed lesson registrations (attended, no_show)
        LessonRegistration(
            lesson_id=lesson_completed.id,
            user_id=users_by_email["player@demo.local"].id,
            status=LessonRegistrationStatus.ATTENDED,
            registered_at=now - timedelta(days=10),
            attended_at=now - timedelta(days=5, hours=3),
        ),
        LessonRegistration(
            lesson_id=lesson_completed.id,
            user_id=users_by_email["player2@demo.local"].id,
            status=LessonRegistrationStatus.ATTENDED,
            registered_at=now - timedelta(days=9),
            attended_at=now - timedelta(days=5, hours=3),
        ),
        LessonRegistration(
            lesson_id=lesson_completed.id,
            user_id=users_by_email["player3@demo.local"].id,
            status=LessonRegistrationStatus.NO_SHOW,
            registered_at=now - timedelta(days=8),
        ),
        LessonRegistration(
            lesson_id=lesson_completed.id,
            user_id=users_by_email["player4@demo.local"].id,
            status=LessonRegistrationStatus.ATTENDED,
            registered_at=now - timedelta(days=7),
            attended_at=now - timedelta(days=5, hours=3),
        ),
    ]

    session.add_all(lesson_registrations)
    await session.flush()
    print(f"  Created {len(lesson_registrations)} lesson registrations (registered, attended, no-show, cancelled)")

    # ─── Phase 17: Competition Scheduling & Court Assignment ─────────────────
    print("\n[Phase 17] Seeding competition schedules and court assignments...")
    from sqlalchemy import select

    c_res = await session.execute(
        select(Court).join(Club).where(Club.slug == "aught2-pickleball")
    )
    a2_courts_map = {c.court_number: c for c in c_res.scalars().all() if c.court_number}

    dt_res = await session.execute(
        select(Court).join(Club).where(Club.slug == "aught2-downtown")
    )
    dt_courts_map = {c.court_number: c for c in dt_res.scalars().all() if c.court_number}

    # Query matches from Spring Round Robin (t1)
    rr_matches = (
        await session.execute(
            select(Match).where(Match.tournament_id == t1.id).order_by(Match.match_number)
        )
    ).scalars().all()

    if len(rr_matches) >= 1:
        rr_matches[0].court_id = a2_courts_map[1].id
        rr_matches[0].scheduled_start_at = now - timedelta(hours=4)
        rr_matches[0].scheduled_end_at = now - timedelta(hours=3)

    if len(rr_matches) >= 2:
        rr_matches[1].court_id = a2_courts_map[2].id
        rr_matches[1].scheduled_start_at = now - timedelta(hours=3)
        rr_matches[1].scheduled_end_at = now - timedelta(hours=2)

    if len(rr_matches) >= 5:
        rr_matches[4].court_id = a2_courts_map[1].id
        rr_matches[4].scheduled_start_at = datetime.combine(tomorrow, time(13, 0), tzinfo=timezone.utc)
        rr_matches[4].scheduled_end_at = datetime.combine(tomorrow, time(14, 0), tzinfo=timezone.utc)
    # Match 6 remains intentionally unscheduled

    # Query matches from Aught2 Summer Slam (t5)
    slam_m_res = (
        await session.execute(
            select(Match).where(Match.tournament_id == t5.id).order_by(Match.match_number)
        )
    ).scalars().all()

    if len(slam_m_res) >= 1:
        slam_m_res[0].court_id = a2_courts_map[3].id
        slam_m_res[0].scheduled_start_at = now - timedelta(hours=5)
        slam_m_res[0].scheduled_end_at = now - timedelta(hours=4)

    if len(slam_m_res) >= 2:
        slam_m_res[1].court_id = a2_courts_map[4].id
        slam_m_res[1].scheduled_start_at = datetime.combine(tomorrow, time(10, 0), tzinfo=timezone.utc)
        slam_m_res[1].scheduled_end_at = datetime.combine(tomorrow, time(11, 0), tzinfo=timezone.utc)

    # Downtown Scramble matches (t3)
    scramble_matches = (
        await session.execute(
            select(Match).where(Match.tournament_id == t3.id).order_by(Match.match_number)
        )
    ).scalars().all()
    if len(scramble_matches) >= 2:
        scramble_matches[0].court_id = dt_courts_map[1].id
        scramble_matches[0].scheduled_start_at = now - timedelta(days=1, hours=3)
        scramble_matches[0].scheduled_end_at = now - timedelta(days=1, hours=2)

        scramble_matches[1].court_id = dt_courts_map[2].id
        scramble_matches[1].scheduled_start_at = now - timedelta(days=1, hours=3)
        scramble_matches[1].scheduled_end_at = now - timedelta(days=1, hours=2)

    # League matches (playoff final pending)
    league_playoff_res = (
        await session.execute(
            select(Match).where(Match.league_id == league.id, Match.stage == MatchStage.PLAYOFFS)
        )
    ).scalars().all()
    for lpm in league_playoff_res:
        if lpm.bracket_round == 2 and lpm.status == MatchStatus.PENDING:
            lpm.court_id = a2_courts_map[1].id
            lpm.scheduled_start_at = datetime.combine(tomorrow, time(15, 0), tzinfo=timezone.utc)
            lpm.scheduled_end_at = datetime.combine(tomorrow, time(16, 0), tzinfo=timezone.utc)

    await session.flush()
    print("  Seeded competition schedules across Round Robin, Bracket, Scramble, and League Playoff Final!")

    # ─── Phase 18: Real-Time Notifications ───────────────────────────────────
    print("\n[Phase 18] Seeding demo notifications...")
    demo_owner = users_by_email["owner@demo.local"]
    demo_player = users_by_email["player@demo.local"]

    notifications_data = [
        # Staff (owner) notifications
        Notification(
            user_id=demo_owner.id,
            club_id=a2_club.id,
            category="bookings",
            title="New Court Reservation",
            message="Demo Player reserved Court 1 for tomorrow at 10:00 AM - 11:00 AM.",
            is_read=False,
            data={"court_id": str(a2_courts_map[1].id) if 1 in a2_courts_map else None},
            created_at=now - timedelta(hours=2),
        ),
        Notification(
            user_id=demo_owner.id,
            club_id=a2_club.id,
            category="tournaments",
            title="Tournament Registration",
            message="Thunder has registered for the Summer Pool Play Showcase.",
            is_read=False,
            data={"tournament_id": str(t2.id)},
            created_at=now - timedelta(hours=5),
        ),
        Notification(
            user_id=demo_owner.id,
            club_id=a2_club.id,
            category="memberships",
            title="New Member Subscription",
            message="Bob Martinez purchased a Basic Monthly membership plan.",
            is_read=True,
            data={"plan_name": "Basic Monthly"},
            created_at=now - timedelta(days=1, hours=3),
        ),
        Notification(
            user_id=demo_owner.id,
            club_id=a2_club.id,
            category="events",
            title="Event Capacity Milestone",
            message="Saturday Social Night has reached 12/16 registered participants.",
            is_read=True,
            data={"event_id": str(event_social.id)},
            created_at=now - timedelta(days=1, hours=6),
        ),
        Notification(
            user_id=demo_owner.id,
            club_id=a2_club.id,
            category="bookings",
            title="Court Booking Cancelled",
            message="A reservation for Court 2 tomorrow at 2:00 PM was cancelled.",
            is_read=True,
            data={"court_id": str(a2_courts_map[2].id) if 2 in a2_courts_map else None},
            created_at=now - timedelta(days=2),
        ),

        # Player notifications
        Notification(
            user_id=demo_player.id,
            club_id=a2_club.id,
            category="bookings",
            title="Court Booking Confirmed",
            message="Your reservation for Court 1 is confirmed for tomorrow at 10:00 AM.",
            is_read=False,
            data={"court_id": str(a2_courts_map[1].id) if 1 in a2_courts_map else None},
            created_at=now - timedelta(hours=1),
        ),
        Notification(
            user_id=demo_player.id,
            club_id=a2_club.id,
            category="tournaments",
            title="Tournament Schedule Updated",
            message="Your match in the Spring Round Robin has been scheduled on Court 1.",
            is_read=False,
            data={"tournament_id": str(t1.id)},
            created_at=now - timedelta(hours=3),
        ),
        Notification(
            user_id=demo_player.id,
            club_id=a2_club.id,
            category="events",
            title="Lesson Confirmed: Beginner Pickleball",
            message="You are registered for Beginner Pickleball Coaching with Coach Priya.",
            is_read=True,
            data={"lesson_id": str(lesson_beginner.id)},
            created_at=now - timedelta(days=1, hours=4),
        ),
        Notification(
            user_id=demo_player.id,
            club_id=a2_club.id,
            category="general",
            title="Welcome to Aught2 Pickleball!",
            message="Your club membership is active. Enjoy booking courts and entering tournaments!",
            is_read=True,
            data={},
            created_at=now - timedelta(days=3),
        ),
    ]

    session.add_all(notifications_data)
    await session.flush()
    print(f"  Created {len(notifications_data)} demo notifications across staff and player accounts!")

    await session.commit()
    print("\nPhase 15, 17 & 18 seed complete! Coaching, schedules, and notifications seeded successfully.")


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
    else:
        asyncio.run(main())
