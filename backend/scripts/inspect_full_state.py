import asyncio
import logging
import os
import sys

logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from app.core.database import engine

async def inspect():
    async with engine.connect() as conn:
        print("=" * 60)
        print("DATABASE ENVIRONMENT INSPECTION")
        print("=" * 60)
        db_res = await conn.execute(text("SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), version();"))
        row = db_res.fetchone()
        print(f"Database: {row[0]}")
        print(f"User:     {row[1]}")
        print(f"Host/IP:  {row[2]}")
        print(f"Port:     {row[3]}")
        print(f"Version:  {row[4]}")
        print("-" * 60)

        tables_res = await conn.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """))
        tables = [r[0] for r in tables_res.fetchall()]

        print("\n=== ALL USERS IN DATABASE ===")
        users = await conn.execute(text("SELECT id, email, full_name, is_active, is_verified, hashed_password FROM users;"))
        for u in users.fetchall():
            hash_snippet = u.hashed_password[:15] + "..." if u.hashed_password else "None"
            print(f"ID: {u.id} | Email: {u.email} | Name: {u.full_name} | Active: {u.is_active} | Verified: {u.is_verified} | Hash: {hash_snippet}")

        print("\n=== ALL TABLES ROW COUNTS ===")
        for t in tables:
            cnt_res = await conn.execute(text(f'SELECT count(*) FROM "{t}";'))
            cnt = cnt_res.scalar()
            print(f"{t:35}: {cnt}")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(inspect())
