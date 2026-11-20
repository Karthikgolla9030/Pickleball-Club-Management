import asyncio
import logging
import os
import sys

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from app.core.database import AsyncSessionLocal, engine
from app.main import app

async def run_verification():
    print("=" * 70)
    print("  ABSOLUTE ZERO VERIFICATION & WORKFLOW VALIDATION")
    print("=" * 70)

    # 1. DATABASE COUNTS VERIFICATION
    print("\n--- 1. VERIFYING DATABASE COUNTS ---")
    async with engine.connect() as conn:
        tables_res = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        """))
        existing_tables = {r[0] for r in tables_res.fetchall()}
        counts = {}
        for t in existing_tables:
            counts[t] = (await conn.execute(text(f'SELECT count(*) FROM "{t}";'))).scalar()

        # Detailed breakdown
        admin_users = (await conn.execute(text("SELECT count(*) FROM users WHERE lower(email) = 'admin@pickleball.com';"))).scalar()
        other_admins = (await conn.execute(text("SELECT count(*) FROM users WHERE lower(email) != 'admin@pickleball.com' AND lower(email) LIKE '%admin%';"))).scalar()
        other_users = counts.get("users", 0) - admin_users

        pending_apps = (await conn.execute(text("SELECT count(*) FROM club_applications WHERE status = 'pending';"))).scalar() if counts.get("club_applications", 0) > 0 else 0
        approved_apps = (await conn.execute(text("SELECT count(*) FROM club_applications WHERE status = 'approved';"))).scalar() if counts.get("club_applications", 0) > 0 else 0
        rejected_apps = (await conn.execute(text("SELECT count(*) FROM club_applications WHERE status = 'rejected';"))).scalar() if counts.get("club_applications", 0) > 0 else 0

        club_owners = (await conn.execute(text("SELECT count(*) FROM club_memberships WHERE role::text ILIKE '%owner%';"))).scalar() if counts.get("club_memberships", 0) > 0 else 0
        club_managers = (await conn.execute(text("SELECT count(*) FROM club_memberships WHERE role::text ILIKE '%manager%';"))).scalar() if counts.get("club_memberships", 0) > 0 else 0
        tournament_directors = (await conn.execute(text("SELECT count(*) FROM club_memberships WHERE role::text ILIKE '%director%';"))).scalar() if counts.get("club_memberships", 0) > 0 else 0

        club_op_records = (
            counts.get("courts", 0) +
            counts.get("club_media_assets", 0) +
            counts.get("club_carousel_slides", 0) +
            counts.get("club_custom_roles", 0)
        )

        player_op_records = counts.get("player_profiles", 0) + counts.get("club_player_memberships", 0)

        competitions = (
            counts.get("tournaments", 0) +
            counts.get("tournament_registrations", 0) +
            counts.get("tournament_favorites", 0) +
            counts.get("leagues", 0) +
            counts.get("league_registrations", 0) +
            counts.get("league_weeks", 0) +
            counts.get("league_weekly_standings", 0) +
            counts.get("matches", 0) +
            counts.get("match_participants", 0) +
            counts.get("teams", 0) +
            counts.get("team_members", 0) +
            counts.get("pools", 0) +
            counts.get("pool_teams", 0)
        )

        events_lessons = (
            counts.get("events", 0) +
            counts.get("event_registrations", 0) +
            counts.get("lessons", 0) +
            counts.get("lesson_registrations", 0) +
            counts.get("lesson_types", 0) +
            counts.get("coaches", 0)
        )

        memberships = (
            counts.get("membership_plans", 0) +
            counts.get("member_subscriptions", 0) +
            counts.get("club_membership_requests", 0)
        )

        activity = (
            counts.get("notifications", 0) +
            counts.get("notification_preferences", 0) +
            counts.get("support_tickets", 0) +
            counts.get("support_ticket_messages", 0) +
            counts.get("platform_audit_logs", 0)
        )

    items = [
        ("Platform Admin accounts", admin_users, 1),
        ("Other admin accounts", other_admins, 0),
        ("Club Owner accounts", club_owners, 0),
        ("Club Manager accounts", club_managers, 0),
        ("Tournament Director accounts", tournament_directors, 0),
        ("Player accounts", counts.get("player_profiles", 0), 0),
        ("Other non-admin user accounts", other_users, 0),
        ("Pending club applications", pending_apps, 0),
        ("Approved club applications", approved_apps, 0),
        ("Rejected club applications", rejected_apps, 0),
        ("Registered clubs", counts.get("clubs", 0), 0),
        ("Club operational records", club_op_records, 0),
        ("Player operational records", player_op_records, 0),
        ("Tournaments and leagues", competitions, 0),
        ("Bookings and reservations", counts.get("bookings", 0), 0),
        ("Events and lessons", events_lessons, 0),
        ("Membership subscriptions", memberships, 0),
        ("Payment transactions", counts.get("payments", 0), 0),
        ("Previous application activity", activity, 0),
    ]

    all_counts_pass = True
    print(f"{'Item':<35} | {'Current Count':<14} | {'Required':<10} | {'Status':<6}")
    print("-" * 72)
    for name, curr, req in items:
        status_str = "PASS" if curr == req else "FAIL"
        if curr != req:
            all_counts_pass = False
        print(f"{name:<35} | {curr:<14} | {req:<10} | {status_str:<6}")

    assert all_counts_pass, "Database counts verification failed!"
    print("\n[OK] All database counts match required final zero state perfectly!")

    # 2. AUTHENTICATION WORKFLOWS
    print("\n--- 2. TESTING AUTHENTICATION WORKFLOWS ---")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Test 2a: Platform Admin Login
        print("  Testing Platform Admin Login (admin@pickleball.com)...")
        res = await ac.post("/api/v1/auth/platform/login", json={
            "email": "admin@pickleball.com",
            "password": "PlatformAdmin2024!"
        })
        assert res.status_code == 200, f"Platform admin login failed: {res.text}"
        data = res.json()
        assert "access_token" in data, "No access token returned for platform admin"
        assert data["user"]["email"] == "admin@pickleball.com"
        print(f"  [OK] Platform Admin login successful! Token received for {data['user']['email']}")

        # Test 2b: Non-admin credentials fail
        test_emails = [
            ("owner@demo.local", "PlatformAdmin2024!"),
            ("manager@demo.local", "PlatformAdmin2024!"),
            ("td@demo.local", "PlatformAdmin2024!"),
            ("player1@demo.local", "PlatformAdmin2024!"),
            ("player@pickleball.com", "PlatformAdmin2024!"),
        ]
        for em, pw in test_emails:
            club_res = await ac.post("/api/v1/auth/club/login", json={"email": em, "password": pw})
            player_res = await ac.post("/api/v1/auth/player/login", json={"email": em, "password": pw})
            plat_res = await ac.post("/api/v1/auth/platform/login", json={"email": em, "password": pw})
            assert club_res.status_code in (401, 403), f"Expected 401/403 for {em} on club login, got {club_res.status_code}"
            assert player_res.status_code in (401, 403), f"Expected 401/403 for {em} on player login, got {player_res.status_code}"
            assert plat_res.status_code in (401, 403), f"Expected 401/403 for {em} on platform login, got {plat_res.status_code}"
        print("  [OK] All non-admin/demo logins successfully rejected (401/403) across all portals.")

        # 3. TEST NEW PLAYER REGISTRATION
        print("\n--- 3. TESTING NEW PLAYER REGISTRATION WORKFLOW ---")
        reg_payload = {
            "email": "fresh_player_test@pickleball.com",
            "password": "SecurePassword123!",
            "full_name": "Test Fresh Player",
            "phone": "555-0199",
            "skill_level": 3.5
        }
        reg_res = await ac.post("/api/v1/auth/player/register", json=reg_payload)
        assert reg_res.status_code == 201, f"Player registration failed: {reg_res.text}"
        reg_data = reg_res.json()
        assert reg_data["user"]["email"] == "fresh_player_test@pickleball.com"
        test_player_id = reg_data["user"]["id"]
        print(f"  [OK] New player registered successfully! User ID: {test_player_id}")

        # Clean up test player
        async with engine.begin() as conn:
            await conn.execute(text(f"DELETE FROM player_profiles WHERE user_id = '{test_player_id}';"))
            await conn.execute(text(f"DELETE FROM users WHERE id = '{test_player_id}';"))
        print("  [OK] Cleaned up temporary test player.")

        # 4. TEST NEW CLUB REGISTRATION
        print("\n--- 4. TESTING NEW CLUB REGISTRATION WORKFLOW ---")
        club_app_payload = {
            "applicant_name": "Jane Owner",
            "applicant_email": "jane_fresh_club@example.com",
            "applicant_password": "SecurePassword123!",
            "applicant_phone": "555-0299",
            "club_name": "Fresh Test Pickleball Center",
            "address_line1": "123 Fresh Way",
            "city": "Austin",
            "state": "TX",
            "postal_code": "78701",
            "country": "USA",
            "court_count": 8,
            "indoor_court_count": 4,
            "outdoor_court_count": 4
        }
        app_res = await ac.post("/api/v1/club-applications", json=club_app_payload)
        assert app_res.status_code == 201, f"Club registration application failed: {app_res.text}"
        app_data = app_res.json()
        assert app_data["status"] == "pending"
        test_app_id = app_data["id"]
        print(f"  [OK] Club application submitted successfully! App ID: {test_app_id}, Ref: {app_data['reference_number']}")

        # Clean up test club application
        async with engine.begin() as conn:
            await conn.execute(text(f"DELETE FROM club_applications WHERE id = '{test_app_id}';"))
            await conn.execute(text("DELETE FROM users WHERE email = 'jane_fresh_club@example.com';"))
        print("  [OK] Cleaned up temporary test club application and applicant user.")

    # 5. RE-VERIFY ZERO AFTER CLEANUP
    print("\n--- 5. FINAL RE-CHECK AFTER WORKFLOW TESTS ---")
    async with engine.connect() as conn:
        final_users = (await conn.execute(text("SELECT count(*) FROM users;"))).scalar()
        final_apps = (await conn.execute(text("SELECT count(*) FROM club_applications;"))).scalar()
        final_clubs = (await conn.execute(text("SELECT count(*) FROM clubs;"))).scalar()
        final_profiles = (await conn.execute(text("SELECT count(*) FROM player_profiles;"))).scalar()
        assert final_users == 1, f"Expected 1 user, got {final_users}"
        assert final_apps == 0, f"Expected 0 apps, got {final_apps}"
        assert final_clubs == 0, f"Expected 0 clubs, got {final_clubs}"
        assert final_profiles == 0, f"Expected 0 profiles, got {final_profiles}"
        print(f"  Users: {final_users} (Platform Admin only)")
        print(f"  Club Applications: {final_apps}")
        print(f"  Clubs: {final_clubs}")
        print(f"  Player Profiles: {final_profiles}")

    print("\n" + "=" * 70)
    print("  ALL VERIFICATIONS PASSED! SYSTEM IS AT ABSOLUTE ZERO.")
    print("=" * 70)

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_verification())
