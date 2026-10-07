"""
Seed script to populate the exact four leagues shown in the reference mockup:
1. "Aught2 Premier Doubles League"
   - Status: IN_PROGRESS (Week 1 of 12)
   - 12 Teams (Doubles), 12 Weeks (11 regular season + 1 playoff, Top 4 to Playoffs)
   - Registered player: Demo Player (player@demo.local) on "Echo Elites" with Dylan O'Brien
   - Week 1 matches: 4 of 66 matches completed (6% progress)
   - Official Standings matching Screen 2:
     #1 Alpha Aces (Alice Johnson & Amber Heard) - 1 MP, 1 W, 0 L, +7 Diff, 2 Pts
     #2 Beta Blasters (Bob Martinez & Brian Cox) - 1 MP, 1 W, 0 L, +5 Diff, 2 Pts
     #3 Court Commanders (Carol Smith & Chloe Bennet) - 1 MP, 1 W, 0 L, +3 Diff, 2 Pts
     #4 Dink Dynamos (David Lee & Demo Owner) - 1 MP, 0 W, 1 L, -3 Diff, 0 Pts
     #5 Echo Elites (Demo Player & Dylan O'Brien) - 0 MP, 0 W, 0 L, 0 Diff, 0 Pts
     #6 Falcon Force (Emma Stone & Eva Chen) - 0 MP, 0 W, 0 L, 0 Diff, 0 Pts
     #7 Gamma Grinders (Felix Jones & Frank Wilson) - 0 MP, 0 W, 0 L, 0 Diff, 0 Pts
     ... remaining teams up to 12.

2. "Aught2 Championship Singles League"
   - Status: DRAFT (UPCOMING badge)
   - 12 Weeks, 12 Teams (Singles)
   - Starts Mon, 5 Oct 2026

3. "Fall Open Doubles League"
   - Status: REGISTRATION_OPEN (OPEN REGISTRATION badge)
   - 10 Weeks, 8 Teams (Doubles)
   - Registration closes 15 Sep 2026

4. "Summer Mixed League"
   - Status: REGISTRATION_CLOSED (REGISTRATION CLOSED badge)
   - 10 Weeks, 10 Teams (Mixed Doubles)
   - Registration closed 1 Aug 2026
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta

from app.core.database import AsyncSessionLocal
from app.services.league_service import LeagueService
from sqlalchemy import text


async def seed():
    club_id = uuid.UUID('db24a487-ed43-455e-964e-624c04fe223c')

    async with AsyncSessionLocal() as db:
        print('1. Cleaning up existing leagues, matches, standings, and teams...')
        await db.execute(text('DELETE FROM matches WHERE league_id IS NOT NULL'))
        await db.execute(text('DELETE FROM league_weekly_standings WHERE league_id IS NOT NULL'))
        await db.execute(text('DELETE FROM league_weeks WHERE league_id IS NOT NULL'))
        await db.execute(text('UPDATE leagues SET champion_team_id = NULL'))
        await db.execute(text('''
            DELETE FROM team_members 
            WHERE team_id IN (SELECT id FROM teams WHERE league_id IS NOT NULL)
        '''))
        await db.execute(text('DELETE FROM teams WHERE league_id IS NOT NULL'))
        await db.execute(text('DELETE FROM leagues'))
        await db.commit()
        print('Cleaned up existing leagues!')

        # Query active club members
        res = await db.execute(text('''
            SELECT cpm.id, u.id, u.full_name, u.email, COALESCE(pp.skill_rating, 3.5)
            FROM club_player_memberships cpm
            JOIN users u ON cpm.user_id = u.id
            LEFT JOIN player_profiles pp ON pp.user_id = u.id
            WHERE cpm.club_id = :club_id
            ORDER BY u.full_name
        '''), {'club_id': club_id})
        members = res.fetchall()
        print(f'Total available club members: {len(members)}')

        # Member lookup helper
        member_by_name = {m[2]: m for m in members}
        demo_player_m = next((m for m in members if 'player@demo.local' in m[3]), members[0])
        demo_owner_m = next((m for m in members if 'owner@demo.local' in m[3]), members[1])

        svc = LeagueService(db)
        now = datetime.utcnow()
        rules_dict = {"game_format": "single_game", "target_score": 11, "win_by": 2}

        # ──────────────────────────────────────────────────────────────────────────
        # LEAGUE 1: Aught2 Premier Doubles League (LIVE / IN PROGRESS)
        # ──────────────────────────────────────────────────────────────────────────
        print('\n2. Creating League 1: Aught2 Premier Doubles League (LIVE)...')
        l1_start = datetime(2026, 1, 12, 9, 0, 0)
        l1_end = datetime(2026, 3, 30, 18, 0, 0)
        l1_id = uuid.uuid4()

        await db.execute(text('''
            INSERT INTO leagues (
                id, club_id, name, description, status, number_of_weeks, current_week,
                team_size, playoff_team_count, max_teams, registration_fee,
                registration_open_at, registration_close_at, scoring_rules,
                start_date, end_date, created_at, updated_at
            ) VALUES (
                :id, :club_id, :name, :description, 'IN_PROGRESS', 12, 1,
                2, 4, 12, 25.0,
                :reg_open, :reg_close, :scoring_rules,
                :start_date, :end_date, :now, :now
            )
        '''), {
            'id': l1_id,
            'club_id': club_id,
            'name': 'Aught2 Premier Doubles League',
            'description': '12-team premier doubles round-robin competition across 11 regular-season weeks followed by Championship Playoffs (Top 4 Qualify).',
            'reg_open': l1_start - timedelta(days=21),
            'reg_close': l1_start - timedelta(days=3),
            'scoring_rules': json.dumps(rules_dict),
            'start_date': l1_start,
            'end_date': l1_end,
            'now': now,
        })

        # Create 12 weeks for League 1
        l1_week1_id = uuid.uuid4()
        for w in range(1, 13):
            wid = l1_week1_id if w == 1 else uuid.uuid4()
            w_start = l1_start + timedelta(weeks=w-1)
            w_end = w_start + timedelta(days=6)
            await db.execute(text('''
                INSERT INTO league_weeks (
                    id, league_id, week_number, week_type, status,
                    start_date, end_date, created_at, updated_at
                ) VALUES (
                    :id, :league_id, :week_number, :week_type, :status,
                    :start_date, :end_date, :now, :now
                )
            '''), {
                'id': wid,
                'league_id': l1_id,
                'week_number': w,
                'week_type': 'PLAYOFFS' if w == 12 else 'REGULAR_SEASON',
                'status': 'IN_PROGRESS' if w == 1 else 'PENDING',
                'start_date': w_start,
                'end_date': w_end,
                'now': now,
            })

        # Define 12 doubles teams with exact names and rosters from mockup
        doubles_rosters = [
            ('Alpha Aces', 'Alice Johnson', 'Amber Heard'),
            ('Beta Blasters', 'Bob Martinez', 'Brian Cox'),
            ('Court Commanders', 'Carol Smith', 'Chloe Bennet'),
            ('Dink Dynamos', 'David Lee', 'Demo Owner'),
            ('Echo Elites', 'Demo Player', 'Dylan O\'Brien'),
            ('Falcon Force', 'Emma Stone', 'Eva Chen'),
            ('Gamma Grinders', 'Felix Jones', 'Frank Wilson'),
            ('Hurricane Hitters', 'Grace Martinez', 'Grace Hopper'),
            ('Iron Invaders', 'Harry Kane', 'Henry Ford'),
            ('Juggernauts', 'Ian Wright', 'Iris West'),
            ('Kitchen Kings', 'Jack Sparrow', 'John Doe'),
            ('Lightning Lobs', 'Kelly Clarkson', 'Kevin Hart'),
        ]

        team_ids_map = {}
        for idx, (tname, p1_name, p2_name) in enumerate(doubles_rosters):
            tid = uuid.uuid4()
            team_ids_map[tname] = tid
            await db.execute(text('''
                INSERT INTO teams (id, league_id, name, seed, created_at, updated_at)
                VALUES (:id, :league_id, :name, :seed, :now, :now)
            '''), {
                'id': tid,
                'league_id': l1_id,
                'name': tname,
                'seed': idx + 1,
                'now': now,
            })

            # Member 1
            pm1 = member_by_name.get(p1_name) or demo_player_m if 'Demo Player' in p1_name else (member_by_name.get(p1_name) or members[(idx*2) % len(members)])
            # Member 2
            pm2 = demo_owner_m if 'Demo Owner' in p2_name else (member_by_name.get(p2_name) or members[(idx*2+1) % len(members)])

            await db.execute(text('''
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            '''), {'id': uuid.uuid4(), 'team_id': tid, 'pm_id': pm1[0], 'now': now})
            await db.execute(text('''
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            '''), {'id': uuid.uuid4(), 'team_id': tid, 'pm_id': pm2[0], 'now': now})

        await db.commit()
        print('Created 12 teams for League 1!')

        # Generate schedule (66 matches across 11 weeks)
        print('Generating 66 fixtures for League 1...')
        await svc.generate_schedule(club_id, l1_id, force=True)
        await db.commit()

        # Query courts
        res_courts = await db.execute(text('SELECT id, name FROM courts WHERE club_id = :club_id ORDER BY name'), {'club_id': club_id})
        courts = res_courts.fetchall()

        # Fetch Week 1 matches
        res_w1 = await db.execute(text('''
            SELECT m.id, m.match_number, m.team_a_id, m.team_b_id
            FROM matches m
            JOIN league_weeks lw ON m.league_week_id = lw.id
            WHERE m.league_id = :lid AND lw.week_number = 1
            ORDER BY m.match_number
        '''), {'lid': l1_id})
        w1_matches = res_w1.fetchall()

        # Setup 4 completed matches for Week 1:
        # Match 1: Alpha Aces (11) vs Hurricane Hitters (4) -> Alpha Aces +7
        # Match 2: Beta Blasters (11) vs Iron Invaders (6) -> Beta Blasters +5
        # Match 3: Court Commanders (11) vs Dink Dynamos (8) -> Court Commanders +3, Dink Dynamos -3
        # Match 4: Juggernauts (11) vs Kitchen Kings (9) -> Juggernauts +2
        completed_fixtures = [
            ('Alpha Aces', 'Hurricane Hitters', 11, 4),
            ('Beta Blasters', 'Iron Invaders', 11, 6),
            ('Court Commanders', 'Dink Dynamos', 11, 8),
            ('Juggernauts', 'Kitchen Kings', 11, 9),
        ]

        for i, (winner_name, loser_name, w_score, l_score) in enumerate(completed_fixtures):
            m_id = w1_matches[i][0]
            w_tid = team_ids_map[winner_name]
            l_tid = team_ids_map[loser_name]
            c = courts[i % len(courts)] if courts else None
            m_time = l1_start + timedelta(hours=9 + i * 2)

            await db.execute(text('''
                UPDATE matches
                SET team_a_id = :ta, team_b_id = :tb,
                    score_a = :sa, score_b = :sb,
                    winner_team_id = :w_id, status = 'COMPLETED',
                    court_id = :cid, scheduled_start_at = :st, completed_at = :st
                WHERE id = :mid
            '''), {
                'ta': w_tid,
                'tb': l_tid,
                'sa': w_score,
                'sb': l_score,
                'w_id': w_tid,
                'cid': c[0] if c else None,
                'st': m_time,
                'mid': m_id,
            })

        # Assign courts and times to the remaining Week 1 matches (scheduled)
        for i in range(4, len(w1_matches)):
            m_id = w1_matches[i][0]
            c = courts[i % len(courts)] if courts else None
            m_time = l1_start + timedelta(hours=9 + i * 2)
            await db.execute(text('''
                UPDATE matches
                SET court_id = :cid, scheduled_start_at = :st
                WHERE id = :mid
            '''), {
                'cid': c[0] if c else None,
                'st': m_time,
                'mid': m_id,
            })

        await db.commit()

        # Update standings & snapshots for League 1
        l1_obj = await svc.league_repo.get_league(l1_id)
        await svc._update_standings_and_snapshots(l1_obj)
        await db.commit()
        print('Updated League 1 standings: 4 of 66 matches completed!')


        # ──────────────────────────────────────────────────────────────────────────
        # LEAGUE 2: Aught2 Championship Singles League (UPCOMING)
        # ──────────────────────────────────────────────────────────────────────────
        print('\n3. Creating League 2: Aught2 Championship Singles League (UPCOMING)...')
        l2_start = datetime(2026, 10, 5, 9, 0, 0)
        l2_end = l2_start + timedelta(weeks=12)
        l2_id = uuid.uuid4()

        await db.execute(text('''
            INSERT INTO leagues (
                id, club_id, name, description, status, number_of_weeks, current_week,
                team_size, playoff_team_count, max_teams, registration_fee,
                registration_open_at, registration_close_at, scoring_rules,
                start_date, end_date, created_at, updated_at
            ) VALUES (
                :id, :club_id, :name, :description, 'DRAFT', 12, 1,
                1, 4, 12, 20.0,
                :reg_open, :reg_close, :scoring_rules,
                :start_date, :end_date, :now, :now
            )
        '''), {
            'id': l2_id,
            'club_id': club_id,
            'name': 'Aught2 Championship Singles League',
            'description': '12-player individual championship round-robin league across 11 regular weeks with top 4 advancing to single-elimination playoffs.',
            'reg_open': l2_start - timedelta(days=14),
            'reg_close': l2_start - timedelta(days=2),
            'scoring_rules': json.dumps(rules_dict),
            'start_date': l2_start,
            'end_date': l2_end,
            'now': now,
        })
        await db.commit()
        print('Created League 2!')


        # ──────────────────────────────────────────────────────────────────────────
        # LEAGUE 3: Fall Open Doubles League (OPEN REGISTRATION)
        # ──────────────────────────────────────────────────────────────────────────
        print('\n4. Creating League 3: Fall Open Doubles League (OPEN REGISTRATION)...')
        l3_start = datetime(2026, 9, 20, 9, 0, 0)
        l3_end = l3_start + timedelta(weeks=10)
        l3_close = datetime(2026, 9, 15, 23, 59, 59)
        l3_id = uuid.uuid4()

        await db.execute(text('''
            INSERT INTO leagues (
                id, club_id, name, description, status, number_of_weeks, current_week,
                team_size, playoff_team_count, max_teams, registration_fee,
                registration_open_at, registration_close_at, scoring_rules,
                start_date, end_date, created_at, updated_at
            ) VALUES (
                :id, :club_id, :name, :description, 'REGISTRATION_OPEN', 10, 1,
                2, 4, 8, 15.0,
                :reg_open, :reg_close, :scoring_rules,
                :start_date, :end_date, :now, :now
            )
        '''), {
            'id': l3_id,
            'club_id': club_id,
            'name': 'Fall Open Doubles League',
            'description': '8-team open doubles competition welcoming intermediate to advanced players.',
            'reg_open': now - timedelta(days=10),
            'reg_close': l3_close,
            'scoring_rules': json.dumps(rules_dict),
            'start_date': l3_start,
            'end_date': l3_end,
            'now': now,
        })
        await db.commit()
        print('Created League 3!')


        # ──────────────────────────────────────────────────────────────────────────
        # LEAGUE 4: Summer Mixed League (REGISTRATION CLOSED)
        # ──────────────────────────────────────────────────────────────────────────
        print('\n5. Creating League 4: Summer Mixed League (REGISTRATION CLOSED)...')
        l4_start = datetime(2026, 8, 10, 9, 0, 0)
        l4_end = l4_start + timedelta(weeks=10)
        l4_close = datetime(2026, 8, 1, 23, 59, 59)
        l4_id = uuid.uuid4()

        await db.execute(text('''
            INSERT INTO leagues (
                id, club_id, name, description, status, number_of_weeks, current_week,
                team_size, playoff_team_count, max_teams, registration_fee,
                registration_open_at, registration_close_at, scoring_rules,
                start_date, end_date, created_at, updated_at
            ) VALUES (
                :id, :club_id, :name, :description, 'REGISTRATION_CLOSED', 10, 1,
                2, 4, 10, 20.0,
                :reg_open, :reg_close, :scoring_rules,
                :start_date, :end_date, :now, :now
            )
        '''), {
            'id': l4_id,
            'club_id': club_id,
            'name': 'Summer Mixed League',
            'description': '10-team mixed doubles league. Registration is now officially closed.',
            'reg_open': now - timedelta(days=40),
            'reg_close': l4_close,
            'scoring_rules': json.dumps(rules_dict),
            'start_date': l4_start,
            'end_date': l4_end,
            'now': now,
        })
        await db.commit()
        print('Created League 4!')

        # ──────────────────────────────────────────────────────────────────────────
        # Verification Summary
        # ──────────────────────────────────────────────────────────────────────────
        print('\n=== SEED VERIFICATION ===')
        summary = await db.execute(text('''
            SELECT l.name, l.status, l.number_of_weeks, l.team_size,
                   COUNT(DISTINCT t.id) as team_count,
                   COUNT(DISTINCT m.id) as match_count,
                   COUNT(DISTINCT CASE WHEN m.status = 'COMPLETED' THEN m.id END) as completed_matches
            FROM leagues l
            LEFT JOIN teams t ON t.league_id = l.id
            LEFT JOIN matches m ON m.league_id = l.id
            GROUP BY l.id, l.name, l.status, l.number_of_weeks, l.team_size
            ORDER BY l.created_at
        '''))
        for r in summary.fetchall():
            fmt = "Singles" if r[3] == 1 else "Doubles"
            print(f"- {r[0]}: Status={r[1]}, Weeks={r[2]}, Format={fmt}, Teams={r[4]}, Matches={r[5]} (Completed: {r[6]})")


if __name__ == '__main__':
    asyncio.run(seed())
