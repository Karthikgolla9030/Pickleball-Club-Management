"""
Seed script to clean up present leagues in production NEON database and create two 12-team leagues:
1. "Aught2 Premier Doubles League" (12 Teams, Doubles, 12 Weeks: 11 Regular + 1 Playoff, IN_PROGRESS with 66 fixtures generated and week 1 scheduled)
2. "Aught2 Championship Singles League" (12 Players, Singles, 12 Weeks: 11 Regular + 1 Playoff, IN_PROGRESS with 66 fixtures generated and week 1 scheduled)
"""
import sys
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.services.league_service import LeagueService

NEON_DB_URL = "postgresql+psycopg://neondb_owner:npg_0Dih5TSXyrKu@ep-muddy-sun-b3dznvdm-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

DEMO_PASSWORD_HASH = "$2b$12$mMFx2XaS7q1ZLymSwtntxe9WrdopKp3t.n3sjX179Hhi5dqjwKd8C"

NEW_PLAYERS = [
    ("Peter", "Parker", "player17@demo.local", "M", 4.5),
    ("Quinn", "Fabray", "player18@demo.local", "F", 3.8),
    ("Rachel", "Green", "player19@demo.local", "F", 3.6),
    ("Sam", "Winchester", "player20@demo.local", "M", 4.2),
    ("Tara", "Maclay", "player21@demo.local", "F", 3.7),
    ("Uma", "Thurman", "player22@demo.local", "F", 4.4),
    ("Victor", "Stone", "player23@demo.local", "M", 4.8),
    ("Wendy", "Darling", "player24@demo.local", "F", 3.5),
    ("Xander", "Harris", "player25@demo.local", "M", 3.9),
    ("Yolanda", "Adams", "player26@demo.local", "F", 4.1),
    ("Zachary", "Levi", "player27@demo.local", "M", 4.3),
    ("Amber", "Heard", "player28@demo.local", "F", 3.6),
    ("Brian", "Cox", "player29@demo.local", "M", 4.6),
    ("Chloe", "Bennet", "player30@demo.local", "F", 4.0),
    ("Dylan", "O'Brien", "player31@demo.local", "M", 4.2),
    ("Emma", "Stone", "player32@demo.local", "F", 4.1),
    ("Felix", "Jones", "player33@demo.local", "M", 3.8),
    ("Gina", "Torres", "player34@demo.local", "F", 4.5),
]


async def main():
    engine = create_async_engine(NEON_DB_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    club_id = uuid.UUID("7a9da92c-7850-475b-80a4-c1b3e66aca05")  # Aught2 Pickleball

    async with SessionLocal() as db:
        print("1. Cleaning up ALL existing leagues from Neon database...")
        await db.execute(text("DELETE FROM matches WHERE league_id IS NOT NULL"))
        await db.execute(text("DELETE FROM league_weekly_standings WHERE league_id IS NOT NULL"))
        await db.execute(text("DELETE FROM league_weeks WHERE league_id IS NOT NULL"))
        await db.execute(text("UPDATE leagues SET champion_team_id = NULL"))
        await db.execute(text("""
            DELETE FROM team_members 
            WHERE team_id IN (SELECT id FROM teams WHERE league_id IS NOT NULL)
        """))
        await db.execute(text("DELETE FROM teams WHERE league_id IS NOT NULL"))
        await db.execute(text("DELETE FROM leagues"))
        await db.commit()
        print("   -> Successfully purged all old leagues, teams, weeks, standings, and matches!")

        # 2. Check available members for Aught2 Pickleball
        print("\n2. Checking club player memberships in Neon...")
        res = await db.execute(text("""
            SELECT cpm.id, u.id, u.full_name, u.email, COALESCE(pp.skill_rating, 3.5)
            FROM club_player_memberships cpm
            JOIN users u ON cpm.user_id = u.id
            LEFT JOIN player_profiles pp ON pp.user_id = u.id
            WHERE cpm.club_id = :club_id
            ORDER BY u.full_name
        """), {"club_id": club_id})
        members = list(res.fetchall())
        print(f"   Current member count: {len(members)}")

        now = datetime.now(timezone.utc)

        # If less than 36 members, insert extra players
        if len(members) < 36:
            print(f"   Adding {36 - len(members)} additional club members to reach 36 players...")
            for idx, (first, last, email, gender, rating) in enumerate(NEW_PLAYERS):
                # Check if user already exists
                existing = await db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email})
                u_row = existing.fetchone()
                if u_row:
                    u_id = u_row[0]
                else:
                    u_id = uuid.uuid4()
                    full_name = f"{first} {last}"
                    await db.execute(text("""
                        INSERT INTO users (id, email, hashed_password, full_name, is_active, is_verified, created_at, updated_at)
                        VALUES (:id, :email, :hp, :full_name, true, true, :now, :now)
                    """), {"id": u_id, "email": email, "hp": DEMO_PASSWORD_HASH, "full_name": full_name, "now": now})

                    pp_id = uuid.uuid4()
                    await db.execute(text("""
                        INSERT INTO player_profiles (id, user_id, display_name, first_name, last_name, skill_rating, gender, created_at, updated_at)
                        VALUES (:id, :uid, :dn, :fn, :ln, :sr, :gender, :now, :now)
                    """), {
                        "id": pp_id, "uid": u_id, "dn": f"{first} {last[0]}.",
                        "fn": first, "ln": last, "sr": rating, "gender": gender, "now": now
                    })

                # Check CPM
                cpm_check = await db.execute(text("""
                    SELECT id FROM club_player_memberships WHERE user_id = :uid AND club_id = :cid
                """), {"uid": u_id, "cid": club_id})
                if not cpm_check.fetchone():
                    cpm_id = uuid.uuid4()
                    mem_no = f"AUG-P-{len(members) + idx + 1:03d}"
                    await db.execute(text("""
                        INSERT INTO club_player_memberships (id, club_id, user_id, status, membership_number, joined_at, expires_at, created_at, updated_at)
                        VALUES (:id, :cid, :uid, 'ACTIVE', :mno, :now, :exp, :now, :now)
                    """), {
                        "id": cpm_id, "cid": club_id, "uid": u_id, "mno": mem_no,
                        "now": now, "exp": now + timedelta(days=365)
                    })

            await db.commit()

            # Re-fetch members
            res = await db.execute(text("""
                SELECT cpm.id, u.id, u.full_name, u.email, COALESCE(pp.skill_rating, 3.5)
                FROM club_player_memberships cpm
                JOIN users u ON cpm.user_id = u.id
                LEFT JOIN player_profiles pp ON pp.user_id = u.id
                WHERE cpm.club_id = :club_id
                ORDER BY u.full_name
            """), {"club_id": club_id})
            members = list(res.fetchall())
            print(f"   -> Members count after setup: {len(members)}")

        # Fetch club courts for scheduling
        res_courts = await db.execute(
            text("SELECT id, name FROM courts WHERE club_id = :club_id ORDER BY name"),
            {"club_id": club_id}
        )
        courts = res_courts.fetchall()
        print(f"   Available courts: {[c[1] for c in courts]}")

        svc = LeagueService(db)
        start_oct = datetime(2026, 10, 5, 9, 0, 0, tzinfo=timezone.utc)
        end_dec = start_oct + timedelta(weeks=12)
        rules_dict = {"game_format": "single_game", "target_score": 11, "win_by": 2}

        # ─── LEAGUE 1: Premier Doubles League (12 Teams, 12 Weeks) ──────────────────
        print("\n3. Creating League 1: 'Aught2 Premier Doubles League'...")
        l1_id = uuid.uuid4()
        await db.execute(text("""
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
            )
        """), {
            "id": l1_id,
            "club_id": club_id,
            "name": "Aught2 Premier Doubles League",
            "description": "12-team premier doubles round-robin competition across 11 regular-season weeks followed by Championship Playoffs (Top 4 Qualify).",
            "status": "IN_PROGRESS",
            "number_of_weeks": 12,
            "reg_open": now - timedelta(days=14),
            "reg_close": now - timedelta(days=2),
            "scoring_rules": json.dumps(rules_dict),
            "start_date": start_oct,
            "end_date": end_dec,
            "now": now,
        })

        # 12 weeks: 11 Regular Season + 1 Playoff
        for w in range(1, 13):
            is_playoff = (w == 12)
            w_start = start_oct + timedelta(weeks=w - 1)
            w_end = w_start + timedelta(days=6)
            await db.execute(text("""
                INSERT INTO league_weeks (
                    id, league_id, week_number, week_type, status,
                    start_date, end_date, created_at, updated_at
                ) VALUES (
                    :id, :league_id, :week_number, :week_type, :status,
                    :start_date, :end_date, :now, :now
                )
            """), {
                "id": uuid.uuid4(),
                "league_id": l1_id,
                "week_number": w,
                "week_type": "PLAYOFFS" if is_playoff else "REGULAR_SEASON",
                "status": "IN_PROGRESS" if w == 1 else "PENDING",
                "start_date": w_start,
                "end_date": w_end,
                "now": now,
            })

        # Register 12 Doubles Teams (using first 24 members)
        doubles_team_names = [
            "Alpha Aces", "Beta Blasters", "Court Commanders", "Dink Dynamos",
            "Echo Elites", "Falcon Force", "Gamma Grinders", "Hurricane Hitters",
            "Iron Invaders", "Juggernauts", "Kitchen Kings", "Lightning Lobs"
        ]
        for idx, t_name in enumerate(doubles_team_names):
            p1 = members[idx * 2]
            p2 = members[idx * 2 + 1]
            t_id = uuid.uuid4()
            await db.execute(text("""
                INSERT INTO teams (id, league_id, name, seed, created_at, updated_at)
                VALUES (:id, :league_id, :name, :seed, :now, :now)
            """), {
                "id": t_id,
                "league_id": l1_id,
                "name": t_name,
                "seed": idx + 1,
                "now": now,
            })
            await db.execute(text("""
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            """), {"id": uuid.uuid4(), "team_id": t_id, "pm_id": p1[0], "now": now})
            await db.execute(text("""
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            """), {"id": uuid.uuid4(), "team_id": t_id, "pm_id": p2[0], "now": now})

        await db.commit()
        print("   -> Registered 12 Doubles teams (24 members)!")

        # Generate schedule for League 1 (66 matches across 11 regular-season weeks)
        print("   -> Generating 66 regular-season fixtures for League 1...")
        await svc.generate_schedule(club_id, l1_id, force=True)
        await db.commit()

        # Assign courts and times to Week 1 matches of League 1
        if courts:
            m_res = await db.execute(text("""
                SELECT m.id FROM matches m
                JOIN league_weeks lw ON m.league_week_id = lw.id
                WHERE m.league_id = :lid AND lw.week_number = 1
                ORDER BY m.match_number
            """), {"lid": l1_id})
            w1_matches = m_res.fetchall()
            for i, m_row in enumerate(w1_matches):
                c = courts[i % len(courts)]
                m_time = start_oct + timedelta(hours=9 + i * 2)
                await db.execute(text("""
                    UPDATE matches 
                    SET court_id = :cid, scheduled_start_at = :st
                    WHERE id = :mid
                """), {"cid": c[0], "st": m_time, "mid": m_row[0]})
            await db.commit()
            print("   -> Assigned courts and scheduled start times to Week 1 matches of League 1!")


        # ─── LEAGUE 2: Championship Singles League (12 Players, 12 Weeks) ───────────
        print("\n4. Creating League 2: 'Aught2 Championship Singles League'...")
        l2_id = uuid.uuid4()
        await db.execute(text("""
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
            )
        """), {
            "id": l2_id,
            "club_id": club_id,
            "name": "Aught2 Championship Singles League",
            "description": "12-player individual championship round-robin league across 11 regular weeks with top 4 advancing to single-elimination playoffs.",
            "status": "IN_PROGRESS",
            "number_of_weeks": 12,
            "reg_open": now - timedelta(days=14),
            "reg_close": now - timedelta(days=1),
            "scoring_rules": json.dumps(rules_dict),
            "start_date": start_oct + timedelta(weeks=1),
            "end_date": end_dec + timedelta(weeks=1),
            "now": now,
        })

        # 12 weeks: 11 Regular Season + 1 Playoff
        for w in range(1, 13):
            is_playoff = (w == 12)
            w_start = start_oct + timedelta(weeks=w)
            w_end = w_start + timedelta(days=6)
            await db.execute(text("""
                INSERT INTO league_weeks (
                    id, league_id, week_number, week_type, status,
                    start_date, end_date, created_at, updated_at
                ) VALUES (
                    :id, :league_id, :week_number, :week_type, :status,
                    :start_date, :end_date, :now, :now
                )
            """), {
                "id": uuid.uuid4(),
                "league_id": l2_id,
                "week_number": w,
                "week_type": "PLAYOFFS" if is_playoff else "REGULAR_SEASON",
                "status": "IN_PROGRESS" if w == 1 else "PENDING",
                "start_date": w_start,
                "end_date": w_end,
                "now": now,
            })

        # Register 12 Singles Players (members 24..35)
        for idx in range(12):
            pm = members[24 + idx]
            p_name = pm[2]
            t_id = uuid.uuid4()
            await db.execute(text("""
                INSERT INTO teams (id, league_id, name, seed, created_at, updated_at)
                VALUES (:id, :league_id, :name, :seed, :now, :now)
            """), {
                "id": t_id,
                "league_id": l2_id,
                "name": p_name,
                "seed": idx + 1,
                "now": now,
            })
            await db.execute(text("""
                INSERT INTO team_members (id, team_id, player_membership_id, created_at)
                VALUES (:id, :team_id, :pm_id, :now)
            """), {"id": uuid.uuid4(), "team_id": t_id, "pm_id": pm[0], "now": now})

        await db.commit()
        print("   -> Registered 12 Singles players (12 distinct members) in League 2!")

        # Generate schedule for League 2 (66 matches across 11 regular-season weeks)
        print("   -> Generating 66 regular-season fixtures for League 2...")
        await svc.generate_schedule(club_id, l2_id, force=True)
        await db.commit()

        # Assign courts and times to Week 1 matches of League 2
        if courts:
            m_res2 = await db.execute(text("""
                SELECT m.id FROM matches m
                JOIN league_weeks lw ON m.league_week_id = lw.id
                WHERE m.league_id = :lid AND lw.week_number = 1
                ORDER BY m.match_number
            """), {"lid": l2_id})
            w1_matches2 = m_res2.fetchall()
            for i, m_row in enumerate(w1_matches2):
                c = courts[i % len(courts)]
                m_time = (start_oct + timedelta(weeks=1)) + timedelta(hours=9 + i * 2)
                await db.execute(text("""
                    UPDATE matches 
                    SET court_id = :cid, scheduled_start_at = :st
                    WHERE id = :mid
                """), {"cid": c[0], "st": m_time, "mid": m_row[0]})
            await db.commit()
            print("   -> Assigned courts and scheduled start times to Week 1 matches of League 2!")

        # ─── FINAL VERIFICATION ──────────────────────────────────────────────────────
        print("\n=== VERIFICATION OF NEON PRODUCTION DATABASE ===")
        res_all = await db.execute(text("""
            SELECT l.id, l.name, l.status, l.team_size, l.number_of_weeks,
                   COUNT(DISTINCT t.id) as team_count,
                   COUNT(DISTINCT m.id) as match_count
            FROM leagues l
            LEFT JOIN teams t ON t.league_id = l.id
            LEFT JOIN matches m ON m.league_id = l.id
            GROUP BY l.id, l.name, l.status, l.team_size, l.number_of_weeks
            ORDER BY l.name
        """))
        for row in res_all.fetchall():
            fmt = "Doubles (2/team)" if row[3] == 2 else "Singles (1/player)"
            print(f" -> League: {row[1]}")
            print(f"    Status: {row[2]} | Format: {fmt} | Weeks: {row[4]} | Teams: {row[5]}/12 | Matches: {row[6]}")

    print("\nDONE! All changes committed to live Neon production database.")


if __name__ == "__main__":
    asyncio.run(main())
