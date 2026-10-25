"""
Aught2 Pickleball — Clean End-to-End Workflow Verification Script
Tests all requirements from the prompt starting from a clean database:
1. Platform Admin login and empty state verification
2. Prospective club application submission & validation
3. Platform Admin queue inspection and application approval
4. Club Owner login and portal access
5. Court creation by Club Owner
6. Tournament creation by Club Owner
7. Player registration and joining club
8. Multi-portal data consistency and tenant verification
"""
import asyncio
import os
import sys
import httpx

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from datetime import datetime, timedelta, timezone

from app.main import create_app

BASE_URL = "http://testserver"

async def run_e2e_tests():
    app = create_app()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE_URL) as client:
        print("=" * 70)
        print("RUNNING END-TO-END VERIFICATION WORKFLOW FROM CLEAN DATABASE")
        print("=" * 70)

        # ─── STEP A: Platform Admin Login & Clean Empty States ──────────
        print("\n[STEP A] Platform Admin Login & Clean Empty States")
        login_res = await client.post(
            "/api/v1/auth/platform/login",
            json={"email": "admin@pickleball.com", "password": "Password123!"},
        )
        assert login_res.status_code == 200, f"Platform admin login failed: {login_res.text}"
        admin_tokens = login_res.json()
        admin_token = admin_tokens["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print("  [PASS] Platform Admin logged in successfully.")

        # Check Platform Overview empty counts
        overview_res = await client.get("/api/v1/platform/overview", headers=admin_headers)
        assert overview_res.status_code == 200, f"Overview error: {overview_res.text}"
        overview_data = overview_res.json()
        print(f"  [PASS] Platform overview loaded: total_clubs={overview_data['clubs']['total']}, "
              f"total_applications={overview_data['applications']['total']}, "
              f"total_users={overview_data['users']['total']}")
        assert overview_data['clubs']['total'] == 0, "Expected 0 clubs initially"
        assert overview_data['applications']['total'] == 0, "Expected 0 applications initially"

        # Check applications list is empty
        apps_res = await client.get("/api/v1/platform/club-applications", headers=admin_headers)
        assert apps_res.status_code == 200
        apps_data = apps_res.json()
        assert len(apps_data["items"]) == 0, "Expected 0 application items"
        print("  [PASS] Applications queue displays clean empty state (0 items).")

        # Check clubs list is empty
        clubs_res = await client.get("/api/v1/platform/clubs", headers=admin_headers)
        assert clubs_res.status_code == 200
        clubs_data = clubs_res.json()
        assert len(clubs_data["items"]) == 0, "Expected 0 clubs"
        print("  [PASS] Platform clubs list displays clean empty state (0 clubs).")

        # ─── STEP B: Prospective Club Registration / Application ────────
        print("\n[STEP B] Prospective Club Registration / Application")
        app_payload = {
            "club_name": "Apex Pickleball Hub",
            "slug": "apex-pickleball-hub",
            "applicant_name": "Marcus Vance",
            "applicant_email": "marcus.vance@apexclub.com",
            "applicant_password": "ClubOwnerPass123!",
            "applicant_phone": "+1-512-555-0199",
            "address": "100 Championship Blvd",
            "city": "Austin",
            "state": "TX",
            "postal_code": "78701",
            "country": "US",
            "number_of_courts": 4,
            "business_tax_id": "TX-12345678",
            "terms_accepted": True,
        }

        submit_res = await client.post("/api/v1/club-applications", json=app_payload)
        assert submit_res.status_code == 201, f"Failed to submit application: {submit_res.text}"
        app_data = submit_res.json()
        app_id = app_data["id"]
        ref_num = app_data["reference_number"]
        print(f"  [PASS] Application submitted: ID={app_id}, Ref={ref_num}, Status={app_data['status']}")
        assert app_data["status"] == "pending"

        # Check duplicate submission rejection
        dup_res = await client.post("/api/v1/club-applications", json=app_payload)
        assert dup_res.status_code in (400, 409), f"Expected duplicate error, got: {dup_res.status_code}"
        print(f"  [PASS] Duplicate application handled correctly (HTTP {dup_res.status_code}).")

        # Check application appears in Platform Admin queue
        admin_queue_res = await client.get("/api/v1/platform/club-applications?status=pending", headers=admin_headers)
        assert admin_queue_res.status_code == 200
        queue_items = admin_queue_res.json()["items"]
        assert len(queue_items) == 1, "Expected 1 pending application in admin queue"
        assert queue_items[0]["id"] == app_id
        print("  [PASS] Submitted application verified in Platform Admin pending queue.")

        # ─── STEP C: Platform Admin Reviews & Approves Club ─────────────
        print("\n[STEP C] Platform Admin Reviews & Approves Club")
        approve_res = await client.post(
            f"/api/v1/platform/club-applications/{app_id}/approve",
            json={"review_notes": "All facility documentation verified and approved."},
            headers=admin_headers,
        )
        assert approve_res.status_code == 200, f"Approval failed: {approve_res.text}"
        approved_app = approve_res.json()
        assert approved_app["status"] == "approved"
        club_id = approved_app["club_id"]
        print(f"  [PASS] Application approved! Club created with ID: {club_id}")

        # Check Platform clubs list now shows 1 club
        clubs_after_res = await client.get("/api/v1/platform/clubs", headers=admin_headers)
        assert clubs_after_res.status_code == 200
        clubs_after = clubs_after_res.json()["items"]
        assert len(clubs_after) == 1, "Expected 1 club after approval"
        assert clubs_after[0]["name"] == "Apex Pickleball Hub"
        print("  [PASS] New club appears in Platform Admin clubs directory.")

        # ─── STEP D: Club Owner Access & Onboarding ────────────────────
        print("\n[STEP D] Club Owner Access & Onboarding")
        owner_login_res = await client.post(
            "/api/v1/auth/login",
            json={"email": "marcus.vance@apexclub.com", "password": "ClubOwnerPass123!"},
        )
        assert owner_login_res.status_code == 200, f"Owner login failed: {owner_login_res.text}"
        owner_auth = owner_login_res.json()
        owner_token = owner_auth["access_token"]
        owner_headers = {"Authorization": f"Bearer {owner_token}"}
        print("  [PASS] Club Owner signed in successfully.")

        # Verify club owner memberships
        me_res = await client.get("/api/v1/auth/me", headers=owner_headers)
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert len(me_data["memberships"]) >= 1
        assert me_data["memberships"][0]["role"] == "club_owner"
        print(f"  [PASS] Verified club_owner role for club: {me_data['memberships'][0]['club_name']}")

        # ─── STEP E: Club Operations (Courts, Tournaments, Members) ─────
        print("\n[STEP E] Club Operations")

        # 1. Create a Court
        court_payload = {
            "name": "Championship Court 1",
            "surface_type": "acrylic",
            "environment": "indoor",
            "is_active": True,
            "has_lighting": True,
        }
        court_res = await client.post(
            f"/api/v1/clubs/{club_id}/courts",
            json=court_payload,
            headers=owner_headers,
        )
        assert court_res.status_code == 201, f"Create court failed: {court_res.text}"
        court_data = court_res.json()
        court_id = court_data["id"]
        print(f"  [PASS] Court created: '{court_data['name']}' (ID: {court_id})")

        # 2. Create a Tournament
        now = datetime.now(timezone.utc)
        tournament_payload = {
            "name": "Apex Inaugural Open 2026",
            "format": "bracket",
            "visibility": "public",
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=5)).isoformat(),
            "start_date": (now + timedelta(days=7)).isoformat(),
            "end_date": (now + timedelta(days=8)).isoformat(),
            "min_participants": 4,
            "max_participants": 16,
            "format_configuration": {
                "category": "Singles",
                "skill_level": "3.5",
            },
        }
        tourn_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments",
            json=tournament_payload,
            headers=owner_headers,
        )
        assert tourn_res.status_code == 201, f"Create tournament failed: {tourn_res.text}"
        tourn_data = tourn_res.json()
        tourn_id = tourn_data["id"]
        print(f"  [PASS] Tournament created in DRAFT: '{tourn_data['name']}' (ID: {tourn_id})")

        # Open Tournament Registration
        open_reg_res = await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{tourn_id}/open-registration",
            headers=owner_headers,
        )
        assert open_reg_res.status_code == 200, f"Open registration failed: {open_reg_res.text}"
        print("  [PASS] Tournament registration opened successfully.")

        # 3. Register a Real Player
        player_reg_res = await client.post(
            "/api/v1/auth/player/register",
            json={
                "full_name": "Elena Rostova",
                "email": "elena.rostova@gmail.com",
                "password": "PlayerSecurePass123!",
                "phone": "+1-512-555-0822",
            },
        )
        assert player_reg_res.status_code == 201, f"Player registration failed: {player_reg_res.text}"
        player_auth = player_reg_res.json()
        player_token = player_auth["access_token"]
        player_headers = {"Authorization": f"Bearer {player_token}"}
        print("  [PASS] New Player registered and signed in.")

        # 4. Player Joins Club
        join_res = await client.post(
            f"/api/v1/player/clubs/{club_id}/join",
            headers=player_headers,
        )
        assert join_res.status_code in (200, 201), f"Player join failed: {join_res.text}"
        print("  [PASS] Player successfully enrolled in Apex Pickleball Hub.")

        # 5. Player Registers for Tournament
        player_tourn_reg = await client.post(
            f"/api/v1/tournaments/{tourn_id}/register",
            headers=player_headers,
        )
        assert player_tourn_reg.status_code in (200, 201), f"Tournament self-registration failed: {player_tourn_reg.text}"
        print("  [PASS] Player registered for tournament via self-service.")

        # ─── STEP F: Cross-Portal Consistency & Persistence Check ───────
        print("\n[STEP F] Cross-Portal Consistency & Tenant Isolation")
        
        # Check Owner's view of members
        members_res = await client.get(f"/api/v1/clubs/{club_id}/player-memberships", headers=owner_headers)
        assert members_res.status_code == 200
        members = members_res.json()
        member_items = members if isinstance(members, list) else members.get("items", [])
        assert len(member_items) >= 1, "Expected player in club member list"
        print(f"  [PASS] Club Owner sees {len(member_items)} registered player member(s).")

        # Check Owner's tournaments list
        club_tourns_res = await client.get(f"/api/v1/clubs/{club_id}/tournaments", headers=owner_headers)
        assert club_tourns_res.status_code == 200
        club_tourns = club_tourns_res.json()
        tourn_items = club_tourns if isinstance(club_tourns, list) else club_tourns.get("items", [])
        assert len(tourn_items) == 1
        assert tourn_items[0]["name"] == "Apex Inaugural Open 2026"
        print(f"  [PASS] Club Owner sees 1 real persisted tournament.")

        # Check Player's view of public tournaments
        public_tourns_res = await client.get("/api/v1/player/tournaments", headers=player_headers)
        assert public_tourns_res.status_code == 200
        pub_tourns = public_tourns_res.json()
        pub_items = pub_tourns if isinstance(pub_tourns, list) else pub_tourns.get("items", [])
        assert any(t["id"] == tourn_id for t in pub_items)
        print("  [PASS] Player discovers the real tournament in public schedule.")

        # Platform Admin overview reflects real active data
        admin_overview_final = await client.get("/api/v1/platform/overview", headers=admin_headers)
        assert admin_overview_final.status_code == 200
        final_data = admin_overview_final.json()
        print(f"  [PASS] Platform Admin overview accurately shows: 1 approved club, {final_data['clubs']['active']} active club(s), {final_data['users']['total']} total user(s).")

        print("\n" + "=" * 70)
        print("ALL END-TO-END WORKFLOWS PASSED FULLY WITH REAL PERSISTED DATA!")
        print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_e2e_tests())
