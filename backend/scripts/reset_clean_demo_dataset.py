import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

if sys.platform == 'win32':
    import selectors

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.models.club import Club
from app.models.court import Court
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
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
from app.models.tournament import (
    DEFAULT_SCORING_RULES,
    DEFAULT_TIEBREAKER_RULES,
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.league import (
    League,
    LeagueWeek,
    LeagueWeeklyStanding,
    LeagueStatus,
    LeagueWeekType,
    LeagueWeekStatus,
)
from app.services.competition.bracket_engine import BracketEngine
from app.services.competition.round_robin_engine import RoundRobinEngine
from app.services.competition.pool_play_engine import PoolPlayEngine
from app.services.competition.scramble_engine import ScrambleEngine

DEFAULT_NEON_URL = (
    "postgresql+psycopg://neondb_owner:npg_0Dih5TSXyrKu@"
    "ep-muddy-sun-b3dznvdm-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?"
    "sslmode=require&channel_binding=require"
)

async def reset_database(target_url: str):
    print(f"\n=======================================================")
    print(f"Connecting to database: {target_url.split('@')[-1] if '@' in target_url else target_url}")
    print(f"=======================================================")
    
    engine = create_async_engine(target_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with session_factory() as session:
        # 1. PURGE ALL OLD COMPETITIONS
        print("1. Purging all tournaments, leagues, matches, teams, and registrations...")
        await session.execute(delete(MatchParticipant))
        await session.execute(delete(Match))
        await session.execute(delete(PoolTeam))
        await session.execute(delete(Pool))
        await session.execute(delete(TeamMember))
        await session.execute(delete(Team))
        await session.execute(delete(TournamentRegistration))
        await session.execute(delete(Tournament))
        await session.execute(delete(LeagueWeeklyStanding))
        await session.execute(delete(LeagueWeek))
        await session.execute(delete(League))
        await session.commit()
        print("  Purge complete. 0 tournaments and 0 leagues remain.")

        # 2. IDENTIFY CLUB & COURTS
        club_row = (await session.execute(
            select(Club).where(Club.name.ilike("%Aught2 Pickleball%"))
        )).scalars().first()

        if not club_row:
            club_row = (await session.execute(select(Club).where(Club.is_active == True))).scalars().first()
        if not club_row:
            raise RuntimeError("No club found in database!")

        club_id = club_row.id
        print(f"2. Target Club: {club_row.name} ({club_id})")

        courts = (await session.execute(
            select(Court).where(Court.club_id == club_id, Court.is_active == True).order_by(Court.name)
        )).scalars().all()
        print(f"  Found {len(courts)} active courts for {club_row.name}")
        court_ids = [c.id for c in courts] or [None]

        # 3. IDENTIFY PLAYER MEMBERSHIPS
        mems_stmt = (
            select(ClubPlayerMembership)
            .where(
                ClubPlayerMembership.club_id == club_id,
                ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
            )
            .order_by(ClubPlayerMembership.created_at)
        )
        memberships = (await session.execute(mems_stmt)).scalars().all()
        print(f"3. Found {len(memberships)} active club player memberships.")

        if len(memberships) < 16:
            raise RuntimeError(f"Need at least 16 player memberships for 8 doubles teams. Found {len(memberships)}.")

        # Pick 16 players
        p16 = memberships[:16]

        # 8 fixed doubles team definitions
        team_defs = [
            ("Alpha Aces", p16[0], p16[1], 1),
            ("Beta Blasters", p16[2], p16[3], 2),
            ("Gamma Grinders", p16[4], p16[5], 3),
            ("Delta Dropshots", p16[6], p16[7], 4),
            ("Apex Attackers", p16[8], p16[9], 5),
            ("Vortex Volleys", p16[10], p16[11], 6),
            ("Sonic Slicers", p16[12], p16[13], 7),
            ("Titan Titans", p16[14], p16[15], 8),
        ]

        now = datetime.now(timezone.utc)
        start_date = now - timedelta(hours=2)
        end_date = now + timedelta(days=2)

        # ─── TOURNAMENT 1: BRACKET PLAY (Doubles, 8/8 registered, IN_PROGRESS) ───
        print("\n4. Creating Tournament 1: Aught2 Championship Bracket (Doubles)...")
        t_bracket = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Aught2 Championship Bracket (Doubles)",
            description="Premier 8-team single elimination championship bracket. Doubles competition starting from Quarterfinals.",
            format=TournamentFormat.BRACKET,
            status=TournamentStatus.IN_PROGRESS,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=now - timedelta(days=7),
            registration_close_at=now - timedelta(hours=3),
            location_name="Center Courts 1-4",
            min_participants=4,
            max_participants=8,
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Men's Doubles",
                "team_size": 2,
                "bracket_format": "Single Elimination",
                "bracket_type": "Single Elimination",
                "has_third_place_match": False,
            },
        )
        session.add(t_bracket)
        await session.flush()

        # Create 8 teams & registrations for bracket
        b_teams = []
        for name, mem1, mem2, seed in team_defs:
            # Registrations
            r1 = TournamentRegistration(
                id=uuid4(), tournament_id=t_bracket.id, player_membership_id=mem1.id,
                status=RegistrationStatus.CONFIRMED, seed=seed, registered_at=now - timedelta(days=4)
            )
            r2 = TournamentRegistration(
                id=uuid4(), tournament_id=t_bracket.id, player_membership_id=mem2.id,
                status=RegistrationStatus.CONFIRMED, seed=seed, registered_at=now - timedelta(days=4)
            )
            session.add_all([r1, r2])
            await session.flush()

            team = Team(id=uuid4(), tournament_id=t_bracket.id, name=name, seed=seed)
            session.add(team)
            await session.flush()
            m1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem1.id)
            m2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem2.id)
            session.add_all([m1, m2])
            await session.flush()
            b_teams.append(team)

        # Generate bracket matches using BracketEngine
        b_team_dicts = [
            {"id": t.id, "name": t.name, "seed": t.seed, "members": [{"player_membership_id": tm.id}]}
            for t, (_, tm, _, _) in zip(b_teams, team_defs)
        ]
        b_engine = BracketEngine()
        b_slots = b_engine.generate_bracket(t_bracket.id, b_team_dicts, bracket_format="Single Elimination")

        # Insert bracket matches (pass 1: insert with next_match_id=None to satisfy foreign key)
        slot_map = {}
        for s in b_slots:
            m = Match(
                id=s.id,
                tournament_id=s.tournament_id,
                bracket_round=s.bracket_round,
                bracket_position=s.bracket_position,
                match_number=s.match_number,
                team_a_id=s.team_a_id,
                team_b_id=s.team_b_id,
                status=MatchStatus.PENDING,
                score_a=None,
                score_b=None,
                winner_team_id=None,
                next_match_id=None,
                next_match_slot=s.next_match_slot,
                court_id=court_ids[(s.match_number - 1) % len(court_ids)] if court_ids else None,
            )
            session.add(m)
            slot_map[s.id] = m
        await session.flush()

        # Pass 2: Set next_match_id now that all match rows exist
        for s in b_slots:
            if s.next_match_id:
                slot_map[s.id].next_match_id = s.next_match_id
        await session.flush()

        # Update metadata in format_configuration
        bracket_meta = {
            str(s.id): {
                "bracket_section": s.bracket_section,
                "label": s.label or ("Final" if s.bracket_round == 3 else ("Semifinal" if s.bracket_round == 2 else "Quarterfinal")),
                "is_bye": s.is_bye,
                "next_match_slot": s.next_match_slot,
            }
            for s in b_slots
        }
        cfg = dict(t_bracket.format_configuration or {})
        cfg["bracket_data"] = {"matches": bracket_meta}
        t_bracket.format_configuration = cfg
        await session.flush()
        print(f"  Created bracket tournament with {len(b_teams)} teams and {len(b_slots)} matches (Round 1 pending, ready to play).")


        # ─── TOURNAMENT 2: ROUND ROBIN (Doubles, 8/8 registered, IN_PROGRESS) ───
        print("\n5. Creating Tournament 2: Aught2 Round Robin Classic (Doubles)...")
        t_rr = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Aught2 Round Robin Classic (Doubles)",
            description="8-team complete round-robin tournament. All teams play guaranteed matches with live standings and point differentials.",
            format=TournamentFormat.ROUND_ROBIN,
            status=TournamentStatus.IN_PROGRESS,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=now - timedelta(days=7),
            registration_close_at=now - timedelta(hours=3),
            location_name="Courts 1-4",
            min_participants=4,
            max_participants=8,
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Open Doubles",
                "team_size": 2,
            },
        )
        session.add(t_rr)
        await session.flush()

        rr_teams = []
        for name, mem1, mem2, seed in team_defs:
            r1 = TournamentRegistration(
                id=uuid4(), tournament_id=t_rr.id, player_membership_id=mem1.id,
                status=RegistrationStatus.CONFIRMED, seed=seed, registered_at=now - timedelta(days=4)
            )
            r2 = TournamentRegistration(
                id=uuid4(), tournament_id=t_rr.id, player_membership_id=mem2.id,
                status=RegistrationStatus.CONFIRMED, seed=seed, registered_at=now - timedelta(days=4)
            )
            session.add_all([r1, r2])
            await session.flush()

            team = Team(id=uuid4(), tournament_id=t_rr.id, name=name, seed=seed)
            session.add(team)
            await session.flush()
            m1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem1.id)
            m2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem2.id)
            session.add_all([m1, m2])
            await session.flush()
            rr_teams.append(team)

        rr_team_ids = [t.id for t in rr_teams]
        rr_engine = RoundRobinEngine()
        rr_matches_gen = rr_engine.generate_schedule(rr_team_ids)

        for idx, m_gen in enumerate(rr_matches_gen, start=1):
            m = Match(
                id=uuid4(),
                tournament_id=t_rr.id,
                match_number=idx,
                round_number=m_gen.round_number,
                team_a_id=m_gen.team_a_id,
                team_b_id=m_gen.team_b_id,
                status=MatchStatus.PENDING,
                score_a=None,
                score_b=None,
                winner_team_id=None,
                court_id=court_ids[(idx - 1) % len(court_ids)] if court_ids else None,
            )
            session.add(m)
        await session.flush()
        print(f"  Created Round Robin tournament with {len(rr_teams)} teams and {len(rr_matches_gen)} matches (Round 1 ready).")


        # ─── TOURNAMENT 3: POOL PLAY (Doubles, 8/8 registered, IN_PROGRESS) ───
        print("\n6. Creating Tournament 3: Aught2 Pool Play Showdown (Doubles)...")
        t_pool = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Aught2 Pool Play Showdown (Doubles)",
            description="8 doubles teams split into Pool A and Pool B. Pool round-robin with top teams advancing to Championship Bracket.",
            format=TournamentFormat.POOL_PLAY,
            status=TournamentStatus.IN_PROGRESS,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=now - timedelta(days=7),
            registration_close_at=now - timedelta(hours=3),
            location_name="North & South Courts",
            min_participants=4,
            max_participants=8,
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Open Doubles",
                "team_size": 2,
                "pool_count": 2,
                "advance_per_pool": 2,
            },
        )
        session.add(t_pool)
        await session.flush()

        pool_teams = []
        for name, mem1, mem2, seed in team_defs:
            r1 = TournamentRegistration(
                id=uuid4(), tournament_id=t_pool.id, player_membership_id=mem1.id,
                status=RegistrationStatus.CONFIRMED, seed=seed, registered_at=now - timedelta(days=4)
            )
            r2 = TournamentRegistration(
                id=uuid4(), tournament_id=t_pool.id, player_membership_id=mem2.id,
                status=RegistrationStatus.CONFIRMED, seed=seed, registered_at=now - timedelta(days=4)
            )
            session.add_all([r1, r2])
            await session.flush()

            team = Team(id=uuid4(), tournament_id=t_pool.id, name=name, seed=seed)
            session.add(team)
            await session.flush()
            m1 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem1.id)
            m2 = TeamMember(id=uuid4(), team_id=team.id, player_membership_id=mem2.id)
            session.add_all([m1, m2])
            await session.flush()
            pool_teams.append(team)

        # Create Pool A and Pool B
        pool_a = Pool(id=uuid4(), tournament_id=t_pool.id, name="Pool A", display_order=1)
        pool_b = Pool(id=uuid4(), tournament_id=t_pool.id, name="Pool B", display_order=2)
        session.add_all([pool_a, pool_b])
        await session.flush()

        # Assign 4 teams each (odd seeds to A, even seeds to B)
        teams_a = [pool_teams[0], pool_teams[2], pool_teams[4], pool_teams[6]]
        teams_b = [pool_teams[1], pool_teams[3], pool_teams[5], pool_teams[7]]

        for pt in teams_a:
            session.add(PoolTeam(id=uuid4(), pool_id=pool_a.id, team_id=pt.id))
        for pt in teams_b:
            session.add(PoolTeam(id=uuid4(), pool_id=pool_b.id, team_id=pt.id))
        await session.flush()

        # Generate pool matches
        pp_engine = PoolPlayEngine()
        matches_a = pp_engine.generate_pool_matches(pool_a.id, teams=[{"id": t.id} for t in teams_a], match_number_offset=1)
        matches_b = pp_engine.generate_pool_matches(pool_b.id, teams=[{"id": t.id} for t in teams_b], match_number_offset=len(matches_a) + 1)

        match_num = 1
        for m_gen in matches_a:
            m = Match(
                id=uuid4(),
                tournament_id=t_pool.id,
                pool_id=pool_a.id,
                match_number=match_num,
                round_number=m_gen.round_number,
                stage=MatchStage.POOL,
                team_a_id=m_gen.team_a_id,
                team_b_id=m_gen.team_b_id,
                status=MatchStatus.PENDING,
                score_a=None,
                score_b=None,
                winner_team_id=None,
                court_id=court_ids[(match_num - 1) % len(court_ids)] if court_ids else None,
            )
            session.add(m)
            match_num += 1

        for m_gen in matches_b:
            m = Match(
                id=uuid4(),
                tournament_id=t_pool.id,
                pool_id=pool_b.id,
                match_number=match_num,
                round_number=m_gen.round_number,
                stage=MatchStage.POOL,
                team_a_id=m_gen.team_a_id,
                team_b_id=m_gen.team_b_id,
                status=MatchStatus.PENDING,
                score_a=None,
                score_b=None,
                winner_team_id=None,
                court_id=court_ids[(match_num - 1) % len(court_ids)] if court_ids else None,
            )
            session.add(m)
            match_num += 1

        await session.flush()
        print(f"  Created Pool Play tournament with 2 pools, 8 teams, and {match_num - 1} pool matches (ready to play).")


        # ─── TOURNAMENT 4: SCRAMBLE (8 registered players, IN_PROGRESS) ───
        print("\n7. Creating Tournament 4: Aught2 Dynamic Scramble (Doubles)...")
        t_scramble = Tournament(
            id=uuid4(),
            club_id=club_id,
            name="Aught2 Dynamic Scramble (Doubles)",
            description="8 players rotate doubles partners every round. Individual points tracking with live standings ladder.",
            format=TournamentFormat.SCRAMBLE,
            status=TournamentStatus.IN_PROGRESS,
            visibility=TournamentVisibility.PUBLIC,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=now - timedelta(days=7),
            registration_close_at=now - timedelta(hours=3),
            location_name="Courts 1-2",
            min_participants=4,
            max_participants=8,
            scoring_rules=dict(DEFAULT_SCORING_RULES),
            tiebreaker_rules=list(DEFAULT_TIEBREAKER_RULES),
            format_configuration={
                "category": "Open Scramble",
                "scramble_type": "Individual Rotating Doubles",
                "planned_rounds": 3,
                "rounds": 3,
                "rounds_count": 3,
            },
        )
        session.add(t_scramble)
        await session.flush()

        scramble_players = p16[:8]
        for p in scramble_players:
            reg = TournamentRegistration(
                id=uuid4(),
                tournament_id=t_scramble.id,
                player_membership_id=p.id,
                status=RegistrationStatus.CONFIRMED,
                registered_at=now - timedelta(days=2),
            )
            session.add(reg)
        await session.flush()

        scramble_engine = ScrambleEngine()
        scramble_pdicts = [
            {"id": p.id, "player_membership_id": p.id, "display_name": f"Player {idx}"}
            for idx, p in enumerate(scramble_players, start=1)
        ]
        scramble_matchups = scramble_engine.generate_matchups(scramble_pdicts, num_rounds=3)

        match_count = 0
        for sm in scramble_matchups:
            # Create match
            m = Match(
                id=uuid4(),
                tournament_id=t_scramble.id,
                round_number=sm["round_number"],
                match_number=sm["match_number"],
                court_id=court_ids[(sm["match_number"] - 1) % len(court_ids)] if court_ids else None,
                status=MatchStatus.PENDING,
                score_a=None,
                score_b=None,
            )
            session.add(m)
            await session.flush()

            # Create match participants (2 on side_a, 2 on side_b)
            for slot_idx, p in enumerate(sm["side_a"], start=1):
                mp = MatchParticipant(
                    id=uuid4(),
                    match_id=m.id,
                    player_membership_id=p["id"],
                    side="side_a",
                    partner_slot=slot_idx,
                )
                session.add(mp)
            for slot_idx, p in enumerate(sm["side_b"], start=1):
                mp = MatchParticipant(
                    id=uuid4(),
                    match_id=m.id,
                    player_membership_id=p["id"],
                    side="side_b",
                    partner_slot=slot_idx,
                )
                session.add(mp)
            match_count += 1

        await session.flush()
        print(f"  Created Scramble tournament with 8 players, 7 rounds, {match_count} matches (ready to play).")


        # ─── LEAGUE: EXACTLY 1 LEAGUE (8 doubles teams, IN_PROGRESS) ───
        print("\n8. Creating Exactly 1 League: Aught2 Premier Doubles League...")
        league = League(
            id=uuid4(),
            club_id=club_id,
            name="Aught2 Premier Doubles League",
            description="Premier 4-week competitive doubles league with round-robin schedule and championship playoffs.",
            number_of_weeks=4,
            current_week=1,
            team_size=2,
            playoff_team_count=4,
            status=LeagueStatus.IN_PROGRESS,
            start_date=now - timedelta(days=1),
        )
        session.add(league)
        await session.flush()

        # Create 8 doubles teams for the league
        l_teams = []
        for name, mem1, mem2, seed in team_defs:
            l_team = Team(id=uuid4(), league_id=league.id, name=name, seed=seed)
            session.add(l_team)
            await session.flush()
            m1 = TeamMember(id=uuid4(), team_id=l_team.id, player_membership_id=mem1.id)
            m2 = TeamMember(id=uuid4(), team_id=l_team.id, player_membership_id=mem2.id)
            session.add_all([m1, m2])
            await session.flush()
            l_teams.append(l_team)

        # Create 4 League Weeks
        l_weeks = []
        for w_num in range(1, 5):
            lw = LeagueWeek(
                id=uuid4(),
                league_id=league.id,
                week_number=w_num,
                week_type=LeagueWeekType.PLAYOFFS if w_num == 4 else LeagueWeekType.REGULAR_SEASON,
                status=LeagueWeekStatus.IN_PROGRESS if w_num == 1 else LeagueWeekStatus.PENDING,
            )
            session.add(lw)
            await session.flush()
            l_weeks.append(lw)

        # Week 1 Schedule: 4 matches between 8 teams
        # 1v2, 3v4, 5v6, 7v8
        week1_pairs = [
            (l_teams[0], l_teams[1]),
            (l_teams[2], l_teams[3]),
            (l_teams[4], l_teams[5]),
            (l_teams[6], l_teams[7]),
        ]
        w1 = l_weeks[0]
        for m_idx, (ta, tb) in enumerate(week1_pairs, start=1):
            m = Match(
                id=uuid4(),
                league_id=league.id,
                league_week_id=w1.id,
                match_number=m_idx,
                round_number=1,
                stage=MatchStage.REGULAR_SEASON,
                team_a_id=ta.id,
                team_b_id=tb.id,
                status=MatchStatus.PENDING,
                score_a=None,
                score_b=None,
                court_id=court_ids[(m_idx - 1) % len(court_ids)] if court_ids else None,
            )
            session.add(m)
        await session.flush()
        print(f"  Created 1 League with 8 doubles teams, 4 weeks, and Week 1 matches scheduled (0 scores entered).")

        await session.commit()
        print("\nAll changes committed successfully!")

if __name__ == '__main__':
    target = os.environ.get('TARGET_DB_URL', DEFAULT_NEON_URL)
    if len(sys.argv) > 1:
        target = sys.argv[1]
    if sys.platform == 'win32':
        asyncio.run(reset_database(target), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    else:
        asyncio.run(reset_database(target))
