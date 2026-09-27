"""
Create exactly 4 fully registered test tournaments for Aught2 Pickleball:
1. Test Tournament — Round Robin (Men's Doubles, 4 teams = 8 players, 8/8 full)
2. Test Tournament — Pool Play (Mixed Doubles, 2 pools of 4 teams = 8 teams = 16 players, 16/16 full)
3. Test Tournament — Scramble (Open Scramble, individual registration, 8 players, 8/8 full, NO teams)
4. Test Tournament — Bracket Play (Men's Doubles, 4 teams = 8 players, 8/8 full)

All tournaments are in status REGISTRATION_OPEN so the user can test the registration closure
and match generation workflow manually from the club side.
player@demo.local is EXCLUDED from registrations so the user sees the tournaments as full / open,
not as already registered.
"""
import asyncio
from datetime import datetime, timedelta, timezone
import os
import sys
from uuid import UUID, uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Pool, PoolTeam, Team, TeamMember
from app.models.tournament import (
    DEFAULT_SCORING_RULES,
    DEFAULT_TIEBREAKER_RULES,
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration


async def setup_test_tournaments():
    async with AsyncSessionLocal() as session:
        print("Setting up 4 fully registered test tournaments...")

        # 1. Fetch active club 'Aught2 Pickleball'
        club = (
            await session.execute(
                select(Club).where(Club.name == "Aught2 Pickleball")
            )
        ).scalars().first()

        if not club:
            club = (
                await session.execute(
                    select(Club).where(Club.is_active == True)
                )
            ).scalars().first()

        if not club:
            raise RuntimeError("No active club found in database!")

        club_id = club.id
        print(f"Target Club: {club.name} ({club_id})")

        # 2. Fetch player memberships in this club (excluding player@demo.local)
        memberships_stmt = (
            select(ClubPlayerMembership)
            .options(
                selectinload(ClubPlayerMembership.user).selectinload(
                    getattr(ClubPlayerMembership, "user").property.mapper.class_.player_profile
                )
            )
            .where(
                ClubPlayerMembership.club_id == club_id,
                ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
            )
        )
        all_memberships = (await session.execute(memberships_stmt)).scalars().all()

        # Filter out demo user so they are never pre-registered
        test_memberships = [
            m for m in all_memberships if m.user and m.user.email != "player@demo.local"
        ]

        # Sort predictably
        test_memberships.sort(key=lambda m: m.user.email if m.user else "")
        print(f"Available test player memberships for registration: {len(test_memberships)}")
        for i, m in enumerate(test_memberships):
            u = m.user
            p = getattr(u, "player_profile", None)
            dname = p.display_name if p and p.display_name else (u.full_name if u else "Player")
            print(f"  [{i+1}] {u.email} -> {dname} (membership {m.id})")

        if len(test_memberships) < 16:
            raise RuntimeError(
                f"Expected at least 16 test player memberships, found {len(test_memberships)}"
            )

        now = datetime.now(timezone.utc)
        start_date = now + timedelta(days=14)
        end_date = now + timedelta(days=16)
        reg_open_at = now - timedelta(days=3)
        reg_close_at = now + timedelta(days=10)

        # Helper to get display name
        def get_display_name(mem: ClubPlayerMembership) -> str:
            u = mem.user
            p = getattr(u, "player_profile", None)
            if p and p.display_name:
                return p.display_name
            if u and u.full_name:
                return u.full_name
            return u.email if u else "Player"

        # ─── TOURNAMENT 1: ROUND ROBIN ────────────────────────────────────────
        print("\nCreating Tournament 1: Test Tournament — Round Robin...")
        t_rr = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Test Tournament — Round Robin",
            description=(
                "Official Round Robin test tournament. Every team plays every other team "
                "in a guaranteed round-robin schedule. Men's Doubles category."
            ),
            format=TournamentFormat.ROUND_ROBIN,
            status=TournamentStatus.REGISTRATION_OPEN,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=reg_open_at,
            registration_close_at=reg_close_at,
            location_name="Center Courts 1-4",
            min_participants=4,
            max_participants=8,  # 4 teams * 2 players = 8 players
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Men's Doubles",
                "skill_level": "3.5",
                "gender_eligibility": "Male",
                "team_size": 2,
                "registration_type": "team",
                "min_age": 18,
                "max_age": 65,
                "entry_fee": 40.0,
            },
        )
        session.add(t_rr)
        await session.flush()

        # Register 4 doubles teams (8 players: players 0..7)
        # Using male test players: player3, player5, player7, player9, player11, player13, player15, player@test.com
        rr_players = [
            m for m in test_memberships
            if m.user and m.user.email in (
                "player3@demo.local", "player5@demo.local",
                "player7@demo.local", "player9@demo.local",
                "player11@demo.local", "player13@demo.local",
                "player15@demo.local", "player@test.com"
            )
        ]
        # Fallback if any missing: take first 8 test memberships
        if len(rr_players) < 8:
            rr_players = test_memberships[:8]

        rr_team_pairings = [
            (rr_players[0], rr_players[1], 1),
            (rr_players[2], rr_players[3], 2),
            (rr_players[4], rr_players[5], 3),
            (rr_players[6], rr_players[7], 4),
        ]

        for p1, p2, seed in rr_team_pairings:
            # Create registrations
            reg1 = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_rr.id,
                player_membership_id=p1.id,
                status=RegistrationStatus.CONFIRMED,
                seed=seed,
                registered_at=now - timedelta(days=2),
            )
            reg2 = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_rr.id,
                player_membership_id=p2.id,
                status=RegistrationStatus.CONFIRMED,
                seed=seed,
                registered_at=now - timedelta(days=2),
            )
            session.add_all([reg1, reg2])
            await session.flush()

            # Create team
            team_name = f"{get_display_name(p1)} & {get_display_name(p2)}"
            team = Team(
                id=uuid4(),
                tournament_id=t_rr.id,
                name=team_name,
                seed=seed,
            )
            session.add(team)
            await session.flush()

            tm1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p1.id)
            tm2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p2.id)
            session.add_all([tm1, tm2])

        print(f"Created '{t_rr.name}': 4 teams, 8 players (8/8 spots filled).")

        # ─── TOURNAMENT 2: POOL PLAY ──────────────────────────────────────────
        print("\nCreating Tournament 2: Test Tournament — Pool Play...")
        t_pool = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Test Tournament — Pool Play",
            description=(
                "Official Pool Play test tournament featuring 2 pools of 4 teams. "
                "Top 2 teams from each pool advance to the single elimination championship bracket."
            ),
            format=TournamentFormat.POOL_PLAY,
            status=TournamentStatus.REGISTRATION_OPEN,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=reg_open_at,
            registration_close_at=reg_close_at,
            location_name="Center Courts 1-4",
            min_participants=8,
            max_participants=16,  # 8 teams * 2 players = 16 players
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Mixed Doubles",
                "skill_level": "3.5",
                "gender_eligibility": "Any",
                "team_size": 2,
                "registration_type": "team",
                "number_of_pools": 2,
                "qualifiers_per_pool": 2,
                "min_age": 18,
                "max_age": 65,
                "entry_fee": 45.0,
            },
        )
        session.add(t_pool)
        await session.flush()

        # Create 2 pools
        pool_a = Pool(id=uuid4(), tournament_id=t_pool.id, name="Pool A", display_order=1)
        pool_b = Pool(id=uuid4(), tournament_id=t_pool.id, name="Pool B", display_order=2)
        session.add_all([pool_a, pool_b])
        await session.flush()

        # Register 8 doubles teams (16 players total from test_memberships[:16])
        pool_players = test_memberships[:16]
        pool_team_pairings = [
            # Pool A (Teams 1 to 4)
            (pool_players[0], pool_players[1], 1, pool_a),
            (pool_players[2], pool_players[3], 2, pool_a),
            (pool_players[4], pool_players[5], 3, pool_a),
            (pool_players[6], pool_players[7], 4, pool_a),
            # Pool B (Teams 5 to 8)
            (pool_players[8], pool_players[9], 5, pool_b),
            (pool_players[10], pool_players[11], 6, pool_b),
            (pool_players[12], pool_players[13], 7, pool_b),
            (pool_players[14], pool_players[15], 8, pool_b),
        ]

        for p1, p2, seed, assigned_pool in pool_team_pairings:
            reg1 = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_pool.id,
                player_membership_id=p1.id,
                status=RegistrationStatus.CONFIRMED,
                seed=seed,
                registered_at=now - timedelta(days=2),
            )
            reg2 = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_pool.id,
                player_membership_id=p2.id,
                status=RegistrationStatus.CONFIRMED,
                seed=seed,
                registered_at=now - timedelta(days=2),
            )
            session.add_all([reg1, reg2])
            await session.flush()

            team_name = f"{get_display_name(p1)} & {get_display_name(p2)}"
            team = Team(
                id=uuid4(),
                tournament_id=t_pool.id,
                name=team_name,
                seed=seed,
            )
            session.add(team)
            await session.flush()

            tm1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p1.id)
            tm2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p2.id)
            pt = PoolTeam(id=uuid4(), pool_id=assigned_pool.id, team_id=team.id)
            session.add_all([tm1, tm2, pt])

        print(f"Created '{t_pool.name}': 2 pools, 8 teams, 16 players (16/16 spots filled).")

        # ─── TOURNAMENT 3: SCRAMBLE ───────────────────────────────────────────
        print("\nCreating Tournament 3: Test Tournament — Scramble...")
        t_scramble = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Test Tournament — Scramble",
            description=(
                "Official Scramble test tournament with rotating partnerships. "
                "Individual registration across 2 courts of 4 players."
            ),
            format=TournamentFormat.SCRAMBLE,
            status=TournamentStatus.REGISTRATION_OPEN,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=reg_open_at,
            registration_close_at=reg_close_at,
            location_name="Center Courts 1-2",
            min_participants=4,
            max_participants=8,  # 8 individual players
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Open Scramble",
                "skill_level": "3.5",
                "gender_eligibility": "Any",
                "team_size": 1,
                "registration_type": "individual",
                "court_count": 2,
                "min_age": 18,
                "max_age": 65,
                "entry_fee": 35.0,
            },
        )
        session.add(t_scramble)
        await session.flush()

        # Register 8 individual players (no teams!)
        scramble_players = test_memberships[:8]
        for idx, p in enumerate(scramble_players):
            reg = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_scramble.id,
                player_membership_id=p.id,
                status=RegistrationStatus.CONFIRMED,
                seed=idx + 1,
                registered_at=now - timedelta(days=2),
            )
            session.add(reg)

        print(f"Created '{t_scramble.name}': 8 individual players, NO fixed teams (8/8 spots filled).")

        # ─── TOURNAMENT 4: SINGLE ELIMINATION BRACKET ────────────────────────
        print("\nCreating Tournament 4: Test Tournament — Bracket Play...")
        t_bracket = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Test Tournament — Bracket Play",
            description=(
                "Official Single Elimination Bracket test tournament. "
                "4 seeded doubles teams compete through semifinals into the championship match."
            ),
            format=TournamentFormat.BRACKET,
            status=TournamentStatus.REGISTRATION_OPEN,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=reg_open_at,
            registration_close_at=reg_close_at,
            location_name="Center Courts 1-4",
            min_participants=4,
            max_participants=8,  # 4 teams * 2 players = 8 players
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Men's Doubles",
                "skill_level": "3.5",
                "gender_eligibility": "Male",
                "team_size": 2,
                "registration_type": "team",
                "min_age": 18,
                "max_age": 65,
                "entry_fee": 50.0,
            },
        )
        session.add(t_bracket)
        await session.flush()

        # Register 4 seeded teams (8 players)
        bracket_players = rr_players  # Use same male test players
        bracket_team_pairings = [
            (bracket_players[0], bracket_players[1], 1),
            (bracket_players[2], bracket_players[3], 2),
            (bracket_players[4], bracket_players[5], 3),
            (bracket_players[6], bracket_players[7], 4),
        ]

        for p1, p2, seed in bracket_team_pairings:
            reg1 = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_bracket.id,
                player_membership_id=p1.id,
                status=RegistrationStatus.CONFIRMED,
                seed=seed,
                registered_at=now - timedelta(days=2),
            )
            reg2 = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_bracket.id,
                player_membership_id=p2.id,
                status=RegistrationStatus.CONFIRMED,
                seed=seed,
                registered_at=now - timedelta(days=2),
            )
            session.add_all([reg1, reg2])
            await session.flush()

            team_name = f"{get_display_name(p1)} & {get_display_name(p2)}"
            team = Team(
                id=uuid4(),
                tournament_id=t_bracket.id,
                name=team_name,
                seed=seed,
            )
            session.add(team)
            await session.flush()

            tm1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p1.id)
            tm2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=p2.id)
            session.add_all([tm1, tm2])

        print(f"Created '{t_bracket.name}': 4 teams, 8 players (8/8 spots filled).")

        # Commit everything to the database
        await session.commit()
        print("\nAll 4 test tournaments successfully committed to the database!")


if __name__ == "__main__":
    asyncio.run(setup_test_tournaments())
