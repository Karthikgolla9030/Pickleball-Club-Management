"""User repository — database query layer for User model."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(
            select(User).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        email: str,
        hashed_password: str,
        full_name: str | None = None,
    ) -> User:
        user = User(
            email=email.lower(),
            hashed_password=hashed_password,
            full_name=full_name,
        )
        self.db.add(user)
        await self.db.flush()  # Get ID without full commit
        await self.db.refresh(user)
        return user

    async def get_all(self) -> list[User]:
        result = await self.db.execute(select(User).order_by(User.created_at))
        return list(result.scalars().all())
