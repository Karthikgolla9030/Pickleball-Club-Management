import sys
import os
import asyncio

if sys.platform == 'win32':
    import selectors

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

db_url = os.getenv('DATABASE_URL')
if not db_url:
    print('ERROR: DATABASE_URL environment variable must be set.')
    sys.exit(1)

async def main():
    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        cols = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'team_members';"))
        tm_cols = [c[0] for c in cols.fetchall()]
        print('team_members columns before:', tm_cols)
        if 'guest_name' not in tm_cols:
            print('Adding guest_name to team_members...')
            await conn.execute(text('ALTER TABLE team_members ADD COLUMN guest_name VARCHAR(255) NULL;'))
            print('Added guest_name.')
        else:
            print('guest_name already present in team_members.')
        await conn.execute(text('ALTER TABLE team_members ALTER COLUMN player_membership_id DROP NOT NULL;'))
        print('Altered player_membership_id to nullable.')
        await conn.execute(text("UPDATE alembic_version SET version_num = 'd4e5f6a7b8c9';"))
        print('Updated alembic_version.')

    async with engine.connect() as conn:
        rev = await conn.execute(text("SELECT version_num FROM alembic_version;"))
        print("Verified Alembic Head in Neon:", rev.scalar_one_or_none())
        cols = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'team_members';"))
        print("Updated team_members columns:", [c[0] for c in cols.fetchall()])

if __name__ == '__main__':
    if sys.platform == 'win32':
        asyncio.run(main(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    else:
        asyncio.run(main())
