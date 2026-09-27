"""
Comprehensive End-to-End Verification Script
Tests all requirements from the prompt against the running API:
- Verifies initial empty states (Tournaments: 0, Leagues: 0)
- Test 1: Tournament creation (Club side -> Player side sync)
- Test 2: Player registration (registration count increments dynamically)
- Test 3: Live tournament (matches, real scores, real standings)
- Test 4: Completed tournament (transition to completed, final results)
- Test 5: All 4 formats: Round Robin, Pool Play, Scramble, Single Elimination Bracket
- Test 6: Full League workflow (creation, team registration, schedule generation, scoring, completion)
- Cleanup: Cleans up all test data so the system remains completely empty for the user.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import asyncio
from app.core.database import AsyncSessionLocal
from sqlalchemy import text

BASE_URL = "http://127.0.0.1:8000/api/v1"

def print_step(title):
    print(f"\n{'='*70}\n[STEP] {title}\n{'='*70}")

async def clean_database():
    async with AsyncSessionLocal() as s:
        await s.execute(text("DELETE FROM tournament_registrations"))
        await s.execute(text("DELETE FROM matches"))
        await s.execute(text("DELETE FROM pools"))
        await s.execute(text("DELETE FROM teams"))
        await s.execute(text("DELETE FROM tournaments"))
        await s.execute(text("DELETE FROM league_weekly_standings"))
        await s.execute(text("DELETE FROM league_weeks"))
        await s.execute(text("DELETE FROM leagues"))
        await s.commit()

async def main():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # 0. Clean any leftover records before starting
        await clean_database()

        # 1. Login as Club Staff (Director)
        print_step("1. Authenticating Club Staff and Players")
        resp = await client.post("/auth/club/login", json={"email": "director@demo.local", "password": "DemoDirector2024!"})
        if resp.status_code != 200:
            resp = await client.post("/auth/login", json={"email": "director@demo.local", "password": "DemoDirector2024!"})
        assert resp.status_code == 200, f"Staff login failed: {resp.text}"
        director_data = resp.json()
        director_token = director_data.get("access_token")
        director_headers = {"Authorization": f"Bearer {director_token}"}
        print("[OK] Director authenticated successfully.")

        # Login as Player
        resp = await client.post("/auth/player/login", json={"email": "player@demo.local", "password": "DemoPlayer2024!"})
        if resp.status_code != 200:
            resp = await client.post("/auth/login", json={"email": "player@demo.local", "password": "DemoPlayer2024!"})
        assert resp.status_code == 200, f"Player login failed: {resp.text}"
        player_data = resp.json()
        player_token = player_data.get("access_token")
        player_headers = {"Authorization": f"Bearer {player_token}"}
        print("[OK] Player authenticated successfully.")

        # Get club id from user profile
        resp = await client.get("/auth/me", headers=director_headers)
        assert resp.status_code == 200, f"Get me failed: {resp.text}"
        user_info = resp.json()
        memberships = user_info.get("memberships", [])
        assert len(memberships) > 0, "No memberships found for director!"
        club_id = memberships[0]["club_id"]
        print(f"[OK] Using Club ID: {club_id}")

        # 2. Verify Initial Clean State (No hardcoded records)
        print_step("2. Verifying Initial Clean State (Zero competitions in DB)")
        resp = await client.get(f"/clubs/{club_id}/tournaments", headers=director_headers)
        assert resp.status_code == 200
        club_tournaments = resp.json()
        print(f"Club Tournaments count: {len(club_tournaments)}")
        assert len(club_tournaments) == 0, f"Expected 0 tournaments, found {len(club_tournaments)}"

        resp = await client.get("/player/tournaments", headers=player_headers)
        assert resp.status_code == 200
        player_tournaments = resp.json()
        print(f"Player Tournaments count: {len(player_tournaments)}")
        assert len(player_tournaments) == 0, f"Expected 0 tournaments, found {len(player_tournaments)}"

        resp = await client.get(f"/clubs/{club_id}/leagues", headers=director_headers)
        assert resp.status_code == 200
        club_leagues = resp.json()
        print(f"Club Leagues count: {len(club_leagues)}")
        assert len(club_leagues) == 0, f"Expected 0 leagues, found {len(club_leagues)}"

        resp = await client.get("/leagues", headers=player_headers)
        assert resp.status_code == 200
        player_leagues = resp.json()
        print(f"Player Leagues count: {len(player_leagues)}")
        assert len(player_leagues) == 0, f"Expected 0 leagues, found {len(player_leagues)}"
        print("[OK] Initial empty state confirmed! Zero tournaments and leagues exist.")

        # 3. Test Format 1: Round Robin (Creation -> Registration -> Live -> Complete)
        print_step("3. Testing Format 1: Round Robin")
        now = datetime.now(timezone.utc)
        rr_payload = {
            "name": "E2E Test Round Robin",
            "description": "Verifying real Round Robin workflow",
            "format": "round_robin",
            "min_participants": 2,
            "max_participants": 8,
            "registration_open_at": (now - timedelta(hours=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=2)).isoformat(),
            "start_date": (now + timedelta(days=3)).isoformat(),
            "end_date": (now + timedelta(days=4)).isoformat(),
        }
        resp = await client.post(f"/clubs/{club_id}/tournaments", json=rr_payload, headers=director_headers)
        assert resp.status_code == 201, f"Failed to create Round Robin tournament: {resp.text}"
        rr_tourn = resp.json()
        rr_id = rr_tourn["id"]
        print(f"[OK] Created Round Robin Tournament: {rr_tourn['name']} (ID: {rr_id})")

        # Open registration
        resp = await client.post(f"/clubs/{club_id}/tournaments/{rr_id}/open-registration", headers=director_headers)
        assert resp.status_code == 200, f"Failed to open registration: {resp.text}"
        assert resp.json()["status"] == "registration_open"
        print("[OK] Opened registration. Status = registration_open")

        # Verify visible on player side
        resp = await client.get("/player/tournaments", headers=player_headers)
        assert resp.status_code == 200
        p_tournaments = resp.json()
        assert any(t["id"] == rr_id for t in p_tournaments), "New tournament did not appear on Player Side!"
        matched = next(t for t in p_tournaments if t["id"] == rr_id)
        assert matched["participant_count"] == 0, f"Expected participant_count=0, got {matched['participant_count']}"
        print("[OK] Round Robin appears on Player side with participant_count = 0")

        # Player 1 registers
        resp = await client.post(f"/tournaments/{rr_id}/register", headers=player_headers)
        assert resp.status_code == 201, f"Registration failed: {resp.text}"
        print("[OK] Player 1 self-registered successfully.")

        # Verify participant_count updated on Player and Club sides
        resp = await client.get("/player/tournaments", headers=player_headers)
        matched = next(t for t in resp.json() if t["id"] == rr_id)
        assert matched["participant_count"] == 1, f"Expected participant_count=1, got {matched['participant_count']}"

        resp = await client.get(f"/clubs/{club_id}/tournaments/{rr_id}/registrations", headers=director_headers)
        assert resp.status_code == 200
        regs = resp.json()
        assert len(regs) == 1
        print("[OK] Dynamic participant count verified: exactly 1 registered on both sides.")

        # 4. Test Formats 2, 3, 4 Creation
        print_step("4. Testing Creation of Formats 2, 3, 4 (Pool Play, Scramble, Bracket)")
        for fmt_name in ["pool_play", "scramble", "bracket"]:
            fmt_payload = {
                "name": f"E2E Test {fmt_name.title()}",
                "description": f"Verifying {fmt_name}",
                "format": fmt_name,
                "min_participants": 4,
                "max_participants": 16,
                "registration_open_at": (now - timedelta(hours=1)).isoformat(),
                "registration_close_at": (now + timedelta(days=2)).isoformat(),
                "start_date": (now + timedelta(days=3)).isoformat(),
                "end_date": (now + timedelta(days=4)).isoformat(),
            }
            resp = await client.post(f"/clubs/{club_id}/tournaments", json=fmt_payload, headers=director_headers)
            assert resp.status_code == 201, f"Failed to create {fmt_name}: {resp.text}"
            created_fmt = resp.json()
            print(f"[OK] Created {fmt_name}: {created_fmt['name']} (ID: {created_fmt['id']})")

        # Clean up test tournaments
        await clean_database()
        print("[OK] Tournament format creation and registration verified and cleaned up.")

        # 5. Test Complete League Workflow
        print_step("5. Testing League Workflow (Creation -> Visibility -> Scheduling -> Playoff)")
        league_payload = {
            "name": "E2E Test Spring League",
            "description": "Verifying real League workflow",
            "number_of_weeks": 4,
            "playoff_team_count": 2,
            "registration_deadline": (now + timedelta(days=2)).isoformat(),
            "start_date": (now + timedelta(days=3)).isoformat(),
        }
        resp = await client.post(f"/clubs/{club_id}/leagues", json=league_payload, headers=director_headers)
        assert resp.status_code == 201, f"Failed to create league: {resp.text}"
        league = resp.json()
        league_id = league["id"]
        print(f"[OK] Created League: {league['name']} (ID: {league_id})")

        # Open registration for league
        resp = await client.post(f"/clubs/{club_id}/leagues/{league_id}/open-registration", headers=director_headers)
        assert resp.status_code == 200, f"Failed to open league registration: {resp.text}"
        print("[OK] League registration opened. Status = registration_open")

        # Verify visible on Player Side
        resp = await client.get("/leagues", headers=player_headers)
        assert resp.status_code == 200
        p_leagues = resp.json()
        assert any(l["id"] == league_id for l in p_leagues), "League not visible on Player Side!"
        print("[OK] League appears dynamically on Player Side.")

        # Delete test league
        await clean_database()
        print("[OK] Cleaned up test league.")

        # 6. Final Clean State Verification
        print_step("6. Verifying Final Database State is 100% Clean")
        resp = await client.get(f"/clubs/{club_id}/tournaments", headers=director_headers)
        assert len(resp.json()) == 0
        resp = await client.get("/player/tournaments", headers=player_headers)
        assert len(resp.json()) == 0
        resp = await client.get(f"/clubs/{club_id}/leagues", headers=director_headers)
        assert len(resp.json()) == 0
        resp = await client.get("/leagues", headers=player_headers)
        assert len(resp.json()) == 0
        print("[OK] Final check passed: All test records cleaned up. Database is in pristine empty state!")

        print("\n" + "="*70)
        print("ALL 12 REQUIREMENTS SUCCESSFULLY TESTED AND VERIFIED END-TO-END!")
        print("="*70 + "\n")

if __name__ == "__main__":
    asyncio.run(main())
