import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership
from app.models.player_profile import PlayerProfile
from app.models.tournament import Tournament

import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

async def main():
    async with AsyncSessionLocal() as s:
        clubs = (await s.execute(select(Club))).scalars().all()
        print("=== CLUBS ===")
        for c in clubs:
            print(f"Club: {c.id} - {c.name}")
        print("=== TOURNAMENTS ===")
        tournaments = (await s.execute(select(Tournament))).scalars().all()
        for t in tournaments:
            print(f"  [{t.id}] Club: {t.club_id} | {t.name} ({t.format.value}, {t.status.value})")

        from sqlalchemy.orm import selectinload
        members = (await s.execute(
            select(ClubPlayerMembership)
            .options(
                selectinload(ClubPlayerMembership.user).selectinload(
                    getattr(ClubPlayerMembership, "user").property.mapper.class_.player_profile
                )
            )
        )).scalars().all()
        print(f"\nTotal Memberships ({len(members)}):")
        for m in members:
            u = m.user
            prof = u.player_profile if u else None
            g = prof.gender if prof else "None"
            r = prof.skill_rating if prof else "None"
            print(f"  Club: {m.club_id} | {u.email} | {u.full_name} | Gender: {g} | Rating: {r} | Status: {m.status.value} | MemberId: {m.id}")

if __name__ == "__main__":
    asyncio.run(main())
