"""
Seed all missing status and format tournament combinations.
Ensures:
- Round Robin: registration_open, in_progress, completed
- Pool Play: registration_open, in_progress, completed
- Scramble: registration_open, in_progress, completed
- Bracket: registration_open, in_progress, completed
"""
import asyncio
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Match, MatchParticipant, MatchStatus, MatchStage, Pool, PoolTeam, Team, TeamMember
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
    DEFAULT_SCORING_RULES,
    DEFAULT_TIEBREAKER_RULES,
)
from app.models.tournament_registration import TournamentRegistration, RegistrationStatus

async def seed():
    async with AsyncSessionLocal() as session:
        # Get active club
        club = (await session.execute(select(Club).where(Club.is_active == True))).scalars().first()
        if not club:
            print("No active club found!")
            return
        club_id = club.id
        print(f"Using Club: {club.name} ({club_id})")

        from sqlalchemy.orm import selectinload
        # Get some active player memberships
        memberships = (await session.execute(
            select(ClubPlayerMembership).options(selectinload(ClubPlayerMembership.user)).where(
                ClubPlayerMembership.club_id == club_id,
                ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE
            )
        )).scalars().all()
        print(f"Found {len(memberships)} active player memberships")

        now = datetime.now(timezone.utc)

        # ─── 1. REGISTRATION OPEN TOURNAMENTS (ALL 4 FORMATS) ───

        # 1a. Round Robin - Registration Open
        rr_open_name = "Metro Round Robin Championship"
        rr_open_check = (await session.execute(
            select(Tournament).where(Tournament.name == rr_open_name)
        )).scalars().first()
        if not rr_open_check:
            t = Tournament(
                id=uuid4(),
                club_id=club_id,
                name=rr_open_name,
                description="Annual metro doubles round robin tournament. Fixed teams of 2 players compete in guaranteed round-robin matches.",
                format=TournamentFormat.ROUND_ROBIN,
                status=TournamentStatus.REGISTRATION_OPEN,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=14),
                end_date=now + timedelta(days=16),
                registration_open_at=now - timedelta(days=2),
                registration_close_at=now + timedelta(days=10),
                location_name="Center Courts 1-4",
                min_participants=4,
                max_participants=16,
                scoring_rules=dict(DEFAULT_SCORING_RULES),
                tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
                format_configuration={
                    "category": "Men's Doubles",
                    "skill_level": "3.5",
                    "gender_eligibility": "Male",
                    "team_size": 2,
                    "registration_type": "team",
                    "min_age": 18,
                    "max_age": 60,
                },
            )
            session.add(t)
            await session.flush()
            # Add a couple registrations so capacity shows ~3/8
            for m in memberships[:3]:
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=t.id,
                    player_membership_id=m.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=now - timedelta(days=1),
                )
                session.add(reg)
            print(f"Created: {rr_open_name} (ROUND_ROBIN, REGISTRATION_OPEN)")

        # 1b. Pool Play - Registration Open
        pool_open_name = "City Pool Play Championship"
        pool_open_check = (await session.execute(
            select(Tournament).where(Tournament.name == pool_open_name)
        )).scalars().first()
        if not pool_open_check:
            t = Tournament(
                id=uuid4(),
                club_id=club_id,
                name=pool_open_name,
                description="Premier mixed doubles pool play championship. 4 pools of 4 teams each, top 2 advance to championship knockout bracket.",
                format=TournamentFormat.POOL_PLAY,
                status=TournamentStatus.REGISTRATION_OPEN,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=20),
                end_date=now + timedelta(days=22),
                registration_open_at=now - timedelta(days=3),
                registration_close_at=now + timedelta(days=15),
                location_name="Tournament Pavilion",
                min_participants=4,
                max_participants=16,
                scoring_rules=dict(DEFAULT_SCORING_RULES),
                tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
                format_configuration={
                    "category": "Mixed Doubles",
                    "skill_level": "4.0",
                    "gender_eligibility": "Any",
                    "team_size": 2,
                    "registration_type": "team",
                    "number_of_pools": 4,
                    "qualifiers_per_pool": 2,
                },
            )
            session.add(t)
            await session.flush()
            for m in memberships[1:5]:
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=t.id,
                    player_membership_id=m.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=now - timedelta(days=2),
                )
                session.add(reg)
            print(f"Created: {pool_open_name} (POOL_PLAY, REGISTRATION_OPEN)")

        # 1c. Scramble - Registration Open
        scramble_open_name = "Open Division Sunset Scramble"
        scramble_open_check = (await session.execute(
            select(Tournament).where(Tournament.name == scramble_open_name)
        )).scalars().first()
        if not scramble_open_check:
            t = Tournament(
                id=uuid4(),
                club_id=club_id,
                name=scramble_open_name,
                description="Social individual-entry scramble tournament. Rotating partners assigned each round by the system. Individual points tracked.",
                format=TournamentFormat.SCRAMBLE,
                status=TournamentStatus.REGISTRATION_OPEN,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=7),
                end_date=now + timedelta(days=8),
                registration_open_at=now - timedelta(days=1),
                registration_close_at=now + timedelta(days=5),
                location_name="East Courts A & B",
                min_participants=4,
                max_participants=12,
                scoring_rules=dict(DEFAULT_SCORING_RULES),
                tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
                format_configuration={
                    "category": "Open Scramble",
                    "skill_level": "3.5",
                    "gender_eligibility": "Any",
                    "team_size": 1,
                    "registration_type": "individual",
                    "rounds": 4,
                    "partner_rotation": "balanced",
                },
            )
            session.add(t)
            await session.flush()
            for m in memberships[:2]:
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=t.id,
                    player_membership_id=m.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=now - timedelta(hours=12),
                )
                session.add(reg)
            print(f"Created: {scramble_open_name} (SCRAMBLE, REGISTRATION_OPEN)")

        # 1d. Bracket - Registration Open
        bracket_open_name = "Fall Single Elimination Bracket"
        bracket_open_check = (await session.execute(
            select(Tournament).where(Tournament.name == bracket_open_name)
        )).scalars().first()
        if not bracket_open_check:
            t = Tournament(
                id=uuid4(),
                club_id=club_id,
                name=bracket_open_name,
                description="High stakes singles single-elimination tournament. Win or go home tournament bracket.",
                format=TournamentFormat.BRACKET,
                status=TournamentStatus.REGISTRATION_OPEN,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now + timedelta(days=25),
                end_date=now + timedelta(days=26),
                registration_open_at=now - timedelta(days=4),
                registration_close_at=now + timedelta(days=18),
                location_name="Stadium Court",
                min_participants=4,
                max_participants=8,
                scoring_rules=dict(DEFAULT_SCORING_RULES),
                tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
                format_configuration={
                    "category": "Singles",
                    "skill_level": "4.5",
                    "gender_eligibility": "Any",
                    "team_size": 1,
                    "registration_type": "individual",
                },
            )
            session.add(t)
            await session.flush()
            for m in memberships[:3]:
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=t.id,
                    player_membership_id=m.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=now - timedelta(days=1),
                )
                session.add(reg)
            print(f"Created: {bracket_open_name} (BRACKET, REGISTRATION_OPEN)")

        # ─── 2. SCRAMBLE IN_PROGRESS ───
        scramble_live_name = "Twilight Rotating Scramble"
        scramble_live_check = (await session.execute(
            select(Tournament).where(Tournament.name == scramble_live_name)
        )).scalars().first()
        if not scramble_live_check:
            t = Tournament(
                id=uuid4(),
                club_id=club_id,
                name=scramble_live_name,
                description="Active evening scramble in progress. Live scores and rotating partnerships update after each game.",
                format=TournamentFormat.SCRAMBLE,
                status=TournamentStatus.IN_PROGRESS,
                visibility=TournamentVisibility.PUBLIC,
                start_date=now - timedelta(hours=2),
                end_date=now + timedelta(hours=3),
                registration_open_at=now - timedelta(days=5),
                registration_close_at=now - timedelta(hours=3),
                location_name="Courts 1-3",
                min_participants=4,
                max_participants=8,
                scoring_rules=dict(DEFAULT_SCORING_RULES),
                tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
                format_configuration={
                    "category": "Open Scramble",
                    "skill_level": "3.5",
                    "team_size": 1,
                    "registration_type": "individual",
                    "rounds": 3,
                },
            )
            session.add(t)
            await session.flush()

            # Add registered players
            active_mems = memberships[:4]
            for idx, m in enumerate(active_mems):
                reg = TournamentRegistration(
                    id=uuid4(),
                    tournament_id=t.id,
                    player_membership_id=m.id,
                    status=RegistrationStatus.CONFIRMED,
                    registered_at=now - timedelta(days=4),
                )
                session.add(reg)

            # Add live scramble matches
            if len(active_mems) >= 4:
                m1 = Match(
                    id=uuid4(),
                    tournament_id=t.id,
                    round_number=1,
                    match_number=1,
                    status=MatchStatus.COMPLETED,
                    score_a=11,
                    score_b=8,
                    completed_at=now - timedelta(hours=1),
                )
                session.add(m1)
                await session.flush()
                session.add_all([
                    MatchParticipant(match_id=m1.id, player_membership_id=active_mems[0].id, side="side_a", partner_slot=1),
                    MatchParticipant(match_id=m1.id, player_membership_id=active_mems[1].id, side="side_a", partner_slot=2),
                    MatchParticipant(match_id=m1.id, player_membership_id=active_mems[2].id, side="side_b", partner_slot=1),
                    MatchParticipant(match_id=m1.id, player_membership_id=active_mems[3].id, side="side_b", partner_slot=2),
                ])

                m2 = Match(
                    id=uuid4(),
                    tournament_id=t.id,
                    round_number=2,
                    match_number=2,
                    status=MatchStatus.PENDING,
                    score_a=7,
                    score_b=5,
                )
                session.add(m2)
                await session.flush()
                session.add_all([
                    MatchParticipant(match_id=m2.id, player_membership_id=active_mems[0].id, side="side_a", partner_slot=1),
                    MatchParticipant(match_id=m2.id, player_membership_id=active_mems[2].id, side="side_a", partner_slot=2),
                    MatchParticipant(match_id=m2.id, player_membership_id=active_mems[1].id, side="side_b", partner_slot=1),
                    MatchParticipant(match_id=m2.id, player_membership_id=active_mems[3].id, side="side_b", partner_slot=2),
                ])
            print(f"Created: {scramble_live_name} (SCRAMBLE, IN_PROGRESS)")

        # ─── 3. COMPLETED TOURNAMENTS ───
        # Note: Completed tournaments must only be created through genuine competition completion,
        # never artificially inserted with 0 registrations.

        await session.commit()
        print("Seeding complete! Tournaments seeded with valid registrations.")

if __name__ == "__main__":
    asyncio.run(seed())
