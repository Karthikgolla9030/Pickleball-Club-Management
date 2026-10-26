"""
Aught2 Pickleball — Clean Database Reset Script
Safely clears all demo and sample business records from the database,
while preserving:
1. Database schema and Alembic migrations
2. Platform settings
3. Platform Administrator account(s) (admin@pickleball.com, platform.owner@pickleball.com)
"""
import asyncio
import os
import sys

# Windows async policy fix
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, delete, text
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User

PRESERVED_ADMIN_EMAILS = [
    "admin@pickleball.com",
    "platform.owner@pickleball.com",
    "platform.owner@aught2.com",
]

async def clean_database():
    print("=" * 60)
    print("STARTING COMPLETE CLEAN DATABASE RESET")
    print("=" * 60)

    async with AsyncSessionLocal() as session:
        # Check database environment
        res = await session.execute(text("SELECT current_database(), current_user"))
        db_info = res.first()
        print(f"Connected to database '{db_info[0]}' as user '{db_info[1]}'")

        # Ensure platform admin account exists
        print("\n1. Verifying and configuring Platform Administrator accounts...")
        default_admin_pw = "PlatformAdmin2024!"
        hashed_pw = hash_password(default_admin_pw)

        for admin_email in PRESERVED_ADMIN_EMAILS:
            res = await session.execute(select(User).where(User.email == admin_email))
            admin_user = res.scalar_one_or_none()
            if admin_user:
                admin_user.hashed_password = hashed_pw
                admin_user.is_active = True
                admin_user.is_verified = True
                print(f"  [OK] Updated platform admin: {admin_email} (password: {default_admin_pw})")
            elif admin_email in ("admin@pickleball.com", "platform.owner@aught2.com"):
                new_admin = User(
                    email=admin_email,
                    hashed_password=hashed_pw,
                    full_name="Platform Administrator",
                    is_active=True,
                    is_verified=True,
                )
                session.add(new_admin)
                print(f"  [OK] Created platform admin: {admin_email} (password: {default_admin_pw})")

        await session.commit()

        # Delete in reverse foreign key order
        print("\n2. Purging business and demo records...")
        
        tables_to_clear = [
            "match_participants",
            "matches",
            "pool_teams",
            "pools",
            "team_members",
            "teams",
            "tournament_registrations",
            "tournament_favorites",
            "tournaments",
            "league_weekly_standings",
            "league_weeks",
            "leagues",
            "bookings",
            "lesson_registrations",
            "lessons",
            "lesson_types",
            "coaches",
            "event_registrations",
            "events",
            "courts",
            "member_subscriptions",
            "membership_plans",
            "club_player_memberships",
            "club_membership_requests",
            "club_memberships",
            "club_carousel_slides",
            "club_media_assets",
            "payments",
            "support_ticket_messages",
            "support_tickets",
            "notifications",
            "notification_preferences",
            "platform_audit_logs",
            "club_applications",
            "clubs",
        ]

        for tbl in tables_to_clear:
            try:
                del_res = await session.execute(text(f"DELETE FROM {tbl}"))
                print(f"  Purged {del_res.rowcount:5d} records from {tbl}")
            except Exception as e:
                print(f"  Skipped/error on {tbl}: {e}")
                await session.rollback()

        await session.commit()

        # 3. Purge player profiles and non-admin users
        print("\n3. Purging demo users and player profiles...")
        # Delete player profiles
        del_profiles = await session.execute(text("""
            DELETE FROM player_profiles 
            WHERE user_id NOT IN (
                SELECT id FROM users WHERE email IN ('admin@pickleball.com', 'platform.owner@pickleball.com', 'platform.owner@aught2.com')
            )
        """))
        print(f"  Purged {del_profiles.rowcount} player profiles")

        # Delete non-admin users
        del_users = await session.execute(text("""
            DELETE FROM users 
            WHERE email NOT IN ('admin@pickleball.com', 'platform.owner@pickleball.com', 'platform.owner@aught2.com')
        """))
        print(f"  Purged {del_users.rowcount} non-platform-admin users")

        await session.commit()

        # 4. Final verification of all tables
        print("\n4. Final Table Record Counts:")
        print("-" * 50)
        verify_tables = [
            "users", "clubs", "club_applications", "courts", "tournaments",
            "leagues", "matches", "teams", "bookings", "payments",
            "events", "lessons", "club_memberships", "club_player_memberships",
            "platform_settings"
        ]
        for tbl in verify_tables:
            res = await session.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
            cnt = res.scalar()
            print(f"  {tbl:30}: {cnt}")

        print("-" * 50)
        print("DATABASE IS NOW IN A COMPLETELY CLEAN TESTING STATE.")
        print(f"Platform Admin access: admin@pickleball.com / {default_admin_pw}")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(clean_database())
