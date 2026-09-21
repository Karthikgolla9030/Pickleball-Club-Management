"""
Development seed script — NOT for production use.

Creates:
  - 1 demo club: "Aught2 Demo Club"
  - 4 demo users with clearly fake credentials:
    - owner@demo.local    → Club Owner
    - manager@demo.local  → Club Manager
    - director@demo.local → Tournament Director
    - player@demo.local   → No club membership (player experience)

Run:
    python -m scripts.seed

Requires database to be up and migrations applied:
    alembic upgrade head
    python -m scripts.seed
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User

DEMO_USERS = [
    {
        "email": "owner@demo.local",
        "password": "DemoOwner2024!",
        "full_name": "Demo Owner",
        "role": ClubRole.CLUB_OWNER,
    },
    {
        "email": "manager@demo.local",
        "password": "DemoManager2024!",
        "full_name": "Demo Manager",
        "role": ClubRole.CLUB_MANAGER,
    },
    {
        "email": "director@demo.local",
        "password": "DemoDirector2024!",
        "full_name": "Demo Director",
        "role": ClubRole.TOURNAMENT_DIRECTOR,
    },
]

DEMO_PLAYER = {
    "email": "player@demo.local",
    "password": "DemoPlayer2024!",
    "full_name": "Demo Player",
}

DEMO_CLUB = {
    "name": "Aught2 Demo Club",
    "slug": "aught2-demo",
    "description": "Development demo club — not a real club.",
}


async def seed(session: AsyncSession) -> None:
    print("🌱 Seeding development data...")

    # Create demo club
    club = Club(**DEMO_CLUB)
    session.add(club)
    await session.flush()
    print(f"  ✅ Club created: {club.name} (id={club.id})")

    # Create staff users with memberships
    for data in DEMO_USERS:
        user = User(
            email=data["email"],
            hashed_password=hash_password(data["password"]),
            full_name=data["full_name"],
            is_verified=True,
        )
        session.add(user)
        await session.flush()

        membership = ClubMembership(
            user_id=user.id,
            club_id=club.id,
            role=data["role"],
        )
        session.add(membership)
        await session.flush()

        print(
            f"  ✅ User: {data['email']} → {data['role'].display_label} at {club.name}"
        )

    # Create player user (no club membership)
    player = User(
        email=DEMO_PLAYER["email"],
        hashed_password=hash_password(DEMO_PLAYER["password"]),
        full_name=DEMO_PLAYER["full_name"],
        is_verified=True,
    )
    session.add(player)
    await session.flush()
    print(f"  ✅ Player: {DEMO_PLAYER['email']} (no club membership)")

    await session.commit()
    print("\n🎉 Seed complete!")
    print("\nDemo credentials (development only):")
    print("  owner@demo.local     / DemoOwner2024!")
    print("  manager@demo.local   / DemoManager2024!")
    print("  director@demo.local  / DemoDirector2024!")
    print("  player@demo.local    / DemoPlayer2024!")


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
