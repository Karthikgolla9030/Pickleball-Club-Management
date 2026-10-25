import asyncio
from app.core.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as session:
        tables = [
            "users", "user_roles", "clubs", "club_staff", "club_player_memberships",
            "player_profiles", "courts", "tournaments", "tournament_registrations",
            "leagues", "league_registrations", "teams", "team_members", "matches",
            "match_participants", "bookings", "payments", "support_tickets", "audit_logs"
        ]
        print("=== DATABASE TABLE RECORD COUNTS ===")
        for t in tables:
            try:
                res = await session.execute(text(f"SELECT COUNT(*) FROM {t}"))
                cnt = res.scalar()
                print(f"{t:30}: {cnt}")
            except Exception as e:
                await session.rollback()
                print(f"{t:30}: Table error or not found")

        print("\n=== CLUBS ===")
        try:
            res = await session.execute(text("SELECT id, name, slug, status FROM clubs"))
            for r in res.fetchall():
                print(f"- {r[1]} ({r[2]}): status={r[3]} id={r[0]}")
        except Exception as e:
            await session.rollback()
            print("Clubs error:", e)

        print("\n=== USERS ===")
        try:
            res = await session.execute(text("SELECT id, email, full_name, is_active FROM users"))
            for r in res.fetchall():
                print(f"- {r[1]} ({r[2]}): active={r[3]} id={r[0]}")
        except Exception as e:
            await session.rollback()
            print("Users error:", e)

if __name__ == "__main__":
    asyncio.run(main())
