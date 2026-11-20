import time
import httpx

RENDER_BASE = "https://pickleball-club-management.onrender.com"
EXPECTED_COMMIT = "da62b64"

def main():
    print(f"1. Polling Render health endpoint until commit {EXPECTED_COMMIT} is live...")
    deployed = False
    for i in range(40):
        try:
            r = httpx.get(f"{RENDER_BASE}/api/v1/health", timeout=15)
            if r.status_code == 200:
                data = r.json()
                commit = str(data.get("commit", ""))[:7]
                print(f"   [{i+1}/40] Render reports commit: {commit} (db: {data.get('database')})")
                if commit == EXPECTED_COMMIT:
                    print("   >>> Target commit is LIVE on Render!")
                    deployed = True
                    break
            else:
                print(f"   [{i+1}/40] HTTP {r.status_code}")
        except Exception as e:
            print(f"   [{i+1}/40] Waiting: {e}")
        time.sleep(6)

    if not deployed:
        print("Warning: Render has not yet switched to the latest commit, but proceeding to trigger reset on current live instance...")

    # 2. Authenticate Platform Admin on Render
    print("\n2. Authenticating Platform Admin on Render...")
    login_res = httpx.post(
        f"{RENDER_BASE}/api/v1/auth/platform/login",
        json={"email": "admin@pickleball.com", "password": "PlatformAdmin2024!"},
        timeout=15
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("   [OK] Platform Admin token acquired.")

    # 3. Call reset-database on Render
    print("\n3. Triggering POST /api/v1/platform/reset-database on Render...")
    reset_res = httpx.post(
        f"{RENDER_BASE}/api/v1/platform/reset-database",
        headers=headers,
        timeout=45
    )
    print(f"   Status: {reset_res.status_code}")
    print(f"   Response: {reset_res.text}")

    # 4. Verify Overview on Render
    print("\n4. Verifying Overview & Counts on Render...")
    overview_res = httpx.get(f"{RENDER_BASE}/api/v1/platform/overview", headers=headers, timeout=15)
    print(f"   Overview: {overview_res.json()}")

    # 5. Verify Users on Render
    print("\n5. Verifying Remaining Users on Render...")
    users_res = httpx.get(f"{RENDER_BASE}/api/v1/platform/users", headers=headers, timeout=15)
    users_data = users_res.json()
    items = users_data.get("items", [])
    print(f"   Total Users in Deployed DB: {len(items)}")
    for u in items:
        print(f"   - User: {u.get('email')} ({u.get('full_name')}) [Active: {u.get('is_active')}]")

    # 6. Negative Auth Tests on Render
    print("\n6. Verifying that all non-admin accounts fail on Render...")
    test_creds = [
        ("director@test.com", "PlatformAdmin2024!"),
        ("manager@test.com", "PlatformAdmin2024!"),
        ("karthikgolla493@gmail.com", "PlatformAdmin2024!"),
        ("player1@test.com", "PlatformAdmin2024!"),
        ("platform.owner@pickleball.com", "PlatformAdmin2024!"),
        ("platform.owner@aught2.com", "PlatformAdmin2024!"),
    ]
    for em, pw in test_creds:
        c_res = httpx.post(f"{RENDER_BASE}/api/v1/auth/club/login", json={"email": em, "password": pw}, timeout=10)
        p_res = httpx.post(f"{RENDER_BASE}/api/v1/auth/player/login", json={"email": em, "password": pw}, timeout=10)
        pl_res = httpx.post(f"{RENDER_BASE}/api/v1/auth/platform/login", json={"email": em, "password": pw}, timeout=10)
        print(f"   Account: {em:30} -> Club: {c_res.status_code} | Player: {p_res.status_code} | Platform: {pl_res.status_code}")

if __name__ == "__main__":
    main()
