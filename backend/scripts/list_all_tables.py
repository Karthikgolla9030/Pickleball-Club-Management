import asyncio
from app.core.database import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as session:
        query = text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")
        res = await session.execute(query)
        tables = [r[0] for r in res.fetchall()]
        print(f"Total tables: {len(tables)}")
        for t in tables:
            cnt = (await session.execute(text(f"SELECT COUNT(*) FROM {t}"))).scalar()
            print(f"  {t:32}: {cnt} rows")

if __name__ == "__main__":
    asyncio.run(check())
