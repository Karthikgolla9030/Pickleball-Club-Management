"""
Seed script to clean up present leagues and create two 12-team leagues:
1. "Aught2 Premier Doubles League" (12 Teams, Doubles, 12 Weeks: 11 Regular + 1 Playoff, IN_PROGRESS with 66 fixtures generated and week 1 scheduled)
2. "Aught2 Championship Singles League" (12 Players, Singles, 12 Weeks: 11 Regular + 1 Playoff, REGISTRATION_OPEN with all 12 confirmed players registered)
"""
import asyncio
import json
import uuid
from datetime import datetime, timedelta

from app.core.database import AsyncSessionLocal
from app.services.league_service import LeagueService
from sqlalchemy import text


async def main():
    club_id = uuid.UUID('db24a487-ed43-455e-964e-624c04fe223c')

    async with AsyncSessionLocal() as db:
        print('1. Cleaning up existing leagues from both club and player sides...')
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
        print('Cleaned up all existing leagues!')

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

        svc = LeagueService(db)
        now = datetime.utcnow()
        start_oct = datetime(2026, 10, 5, 9, 0, 0)
        end_dec = start_oct + timedelta(weeks=12)
        rules_dict = {"game_format": "single_game", "target_score": 11, "win_by": 2}

        # ─── LEAGUE 1: Premier Doubles League (12 Teams, 12 Weeks) ──────────────────
        print('\n2. Creating League 1: Aught2 Premier Doubles League...')
        l1_res = await db.execute(text('''
            INSERT INTO leagues (
                id, club_id, name, description, status, number_of_weeks, current_week,
                team_size, playoff_team_count, max_teams, registration_fee,
                registration_open_at, registration_close_at, scoring_rules,
                start_date, end_date, created_at, updated_at
            ) VALUES (
                :id, :club_id, :name, :description, :status, :number_of_weeks, 1,
                2, 4, 12, 25.0,
                :reg_open, :reg_close, :scoring_rules,
                :start_date, :end_date, :now, :now
            ) RETURNING id
        '''), {
            'id': uuid.uuid4(),
            'club_id': club_id,
            'name': 'Aught2 Premier Doubles League',
            'description': '12-team premier doubles round-robin competition across 11 regular-season weeks followed by Championship Playoffs (Top 4 Qualify).',
            'status': 'IN_PROGRESS',
            'number_of_weeks': 12,
            'reg_open': now - timedelta(days=14),
            'reg_close': now - timedelta(days=2),
            'scoring_rules': json.dumps(rules_dict),
            'start_date': start_oct,
            'end_date': end_dec,
            'now': now,
        })
        l1_id = l1_res.fetchone()[0]

        # Create 12 weeks for League 1 (11 Regular + 1 Playoff)
        for w in range(1, 13):
            is_playoff = (w == 12)
            w_start = start_oct + timedelta(weeks=w-1)
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
                'id': uuid.uuid4(),
                'league_id': l1_id,
                'week_number': w,
                'week_type': 'PLAYOFFS' if is_playoff else 'REGULAR_SEASON',
                'status': 'IN_PROGRESS' if w == 1 else 'PENDING',
                'start_date': w_start,
                'end_date': w_end,
                'now': now,
            })

        # Register 12 Doubles Teams (24 distinct members)
        doubles_team_names = [
            'Alpha Aces', 'Beta Blasters', 'Court Commanders', 'Dink Dynamos',
            'Echo Elites', 'Falcon Force', 'Gamma Grinders', 'Hurricane Hitters',
            'Iron Invaders', 'Juggernauts', 'Kitchen Kings', 'Lightning Lobs'
        ]
        for idx, t_name in enumerate(doubles_team_names):
            p1 = members[idx * 2]
            p2 = members[idx * 2 + 1]
            t_res = await db.execute(text('''
                INSERT INTO teams (id, league_id, name, seed, created_at, updated_at)
                VALUES (:id, :league_id, :name, :seed, :now, :now)
                RETURNING id
            '''), {
                'id': uuid.uuid4(),
                'league_id': l1_id,
                'name': t_name,
                'seed': idx + 1,
                'now': now,
            })
            t_id = t_res.fetchone()[0]
            await db.execute(text('''
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            '''), {'id': uuid.uuid4(), 'team_id': t_id, 'pm_id': p1[0], 'now': now})
            await db.execute(text('''
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            '''), {'id': uuid.uuid4(), 'team_id': t_id, 'pm_id': p2[0], 'now': now})

        await db.commit()
        print('Registered 12 Doubles teams!')

        # Generate schedule for League 1 (66 matches across 11 regular-season weeks)
        print('Generating 66 regular-season fixtures for League 1...')
        await svc.generate_schedule(club_id, l1_id, force=True)
        await db.commit()

        # Assign courts and times to Week 1 matches of League 1
        res_courts = await db.execute(text('SELECT id, name FROM courts WHERE club_id = :club_id ORDER BY name'), {'club_id': club_id})
        courts = res_courts.fetchall()
        if courts:
            m_res = await db.execute(text('''
                SELECT m.id FROM matches m
                JOIN league_weeks lw ON m.league_week_id = lw.id
                WHERE m.league_id = :lid AND lw.week_number = 1
                ORDER BY m.match_number
            '''), {'lid': l1_id})
            w1_matches = m_res.fetchall()
            for i, m_row in enumerate(w1_matches):
                c = courts[i % len(courts)]
                m_time = start_oct + timedelta(hours=9 + i * 2)
                await db.execute(text('''
                    UPDATE matches 
                    SET court_id = :cid, scheduled_start_at = :st
                    WHERE id = :mid
                '''), {'cid': c[0], 'st': m_time, 'mid': m_row[0]})
            await db.commit()
            print('Assigned courts and times to Week 1 matches of League 1!')


        # ─── LEAGUE 2: Championship Singles League (12 Players, 12 Weeks) ───────────
        print('\n3. Creating League 2: Aught2 Championship Singles League...')
        l2_res = await db.execute(text('''
            INSERT INTO leagues (
                id, club_id, name, description, status, number_of_weeks, current_week,
                team_size, playoff_team_count, max_teams, registration_fee,
                registration_open_at, registration_close_at, scoring_rules,
                start_date, end_date, created_at, updated_at
            ) VALUES (
                :id, :club_id, :name, :description, :status, :number_of_weeks, 1,
                1, 4, 12, 15.0,
                :reg_open, :reg_close, :scoring_rules,
                :start_date, :end_date, :now, :now
            ) RETURNING id
        '''), {
            'id': uuid.uuid4(),
            'club_id': club_id,
            'name': 'Aught2 Championship Singles League',
            'description': '12-player individual championship round-robin league across 11 regular weeks with top 4 advancing to single-elimination playoffs.',
            'status': 'REGISTRATION_OPEN',
            'number_of_weeks': 12,
            'reg_open': now - timedelta(days=7),
            'reg_close': now + timedelta(days=7),
            'scoring_rules': json.dumps(rules_dict),
            'start_date': start_oct + timedelta(weeks=1),
            'end_date': end_dec + timedelta(weeks=1),
            'now': now,
        })
        l2_id = l2_res.fetchone()[0]

        # Create 12 weeks for League 2 (11 Regular + 1 Playoff)
        for w in range(1, 13):
            is_playoff = (w == 12)
            w_start = start_oct + timedelta(weeks=w)
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
                'id': uuid.uuid4(),
                'league_id': l2_id,
                'week_number': w,
                'week_type': 'PLAYOFFS' if is_playoff else 'REGULAR_SEASON',
                'status': 'PENDING',
                'start_date': w_start,
                'end_date': w_end,
                'now': now,
            })

        # Register 12 Singles Players (distinct members 24..35)
        for idx in range(12):
            pm = members[24 + idx]
            p_name = pm[2]
            t_res = await db.execute(text('''
                INSERT INTO teams (id, league_id, name, seed, created_at, updated_at)
                VALUES (:id, :league_id, :name, :seed, :now, :now)
                RETURNING id
            '''), {
                'id': uuid.uuid4(),
                'league_id': l2_id,
                'name': p_name,
                'seed': idx + 1,
                'now': now,
            })
            t_id = t_res.fetchone()[0]
            await db.execute(text('''
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            '''), {'id': uuid.uuid4(), 'team_id': t_id, 'pm_id': pm[0], 'now': now})

        await db.commit()
        print('Registered 12 Singles players in League 2 (REGISTRATION_OPEN status)!')

        # ─── SUMMARY ────────────────────────────────────────────────────────────────
        print('\n=== SEED COMPLETED SUCCESSFULLY ===')
        res_all = await db.execute(text('''
            SELECT l.id, l.name, l.status, l.team_size, l.number_of_weeks,
                   COUNT(DISTINCT t.id) as team_count,
                   COUNT(DISTINCT m.id) as match_count
            FROM leagues l
            LEFT JOIN teams t ON t.league_id = l.id
            LEFT JOIN matches m ON m.league_id = l.id
            GROUP BY l.id, l.name, l.status, l.team_size, l.number_of_weeks
            ORDER BY l.name
        '''))
        for row in res_all.fetchall():
            print(f'League: {row[1]} | Status: {row[2]} | Format: {"Doubles" if row[3]==2 else "Singles"} | Weeks: {row[4]} | Registered: {row[5]}/12 | Matches: {row[6]}')


if __name__ == '__main__':
    asyncio.run(main())
