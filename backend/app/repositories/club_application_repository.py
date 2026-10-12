"""
Aught2 Pickleball — Club Application Repository
Data access layer for club registration applications.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_application import ClubApplication, ClubApplicationStatus


class ClubApplicationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, application: ClubApplication) -> ClubApplication:
        self.db.add(application)
        await self.db.flush()
        await self.db.refresh(application)
        return application

    async def get_by_id(self, application_id: UUID, for_update: bool = False) -> ClubApplication | None:
        query = select(ClubApplication).where(ClubApplication.id == application_id)
        if for_update:
            query = query.with_for_update()
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_reference_number(self, reference_number: str) -> ClubApplication | None:
        clean_ref = reference_number.strip().upper()
        result = await self.db.execute(
            select(ClubApplication).where(ClubApplication.reference_number == clean_ref)
        )
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: UUID) -> list[ClubApplication]:
        result = await self.db.execute(
            select(ClubApplication)
            .where(ClubApplication.user_id == user_id)
            .order_by(ClubApplication.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_by_email(self, email: str) -> list[ClubApplication]:
        clean_email = email.strip().lower()
        result = await self.db.execute(
            select(ClubApplication)
            .where(func.lower(ClubApplication.applicant_email) == clean_email)
            .order_by(ClubApplication.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_pending_by_email(self, email: str) -> ClubApplication | None:
        clean_email = email.strip().lower()
        result = await self.db.execute(
            select(ClubApplication).where(
                func.lower(ClubApplication.applicant_email) == clean_email,
                ClubApplication.status == ClubApplicationStatus.PENDING,
            )
        )
        return result.scalar_one_or_none()

    async def get_pending_by_slug(self, slug: str) -> ClubApplication | None:
        clean_slug = slug.strip().lower()
        result = await self.db.execute(
            select(ClubApplication).where(
                ClubApplication.slug == clean_slug,
                ClubApplication.status == ClubApplicationStatus.PENDING,
            )
        )
        return result.scalar_one_or_none()

    async def list_applications(
        self,
        status: ClubApplicationStatus | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[ClubApplication], int]:
        query = select(ClubApplication)
        count_query = select(func.count(ClubApplication.id))

        if status is not None:
            status_val = status.value if hasattr(status, "value") else str(status)
            query = query.where(ClubApplication.status == status_val)
            count_query = count_query.where(ClubApplication.status == status_val)

        query = query.order_by(ClubApplication.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        total_result = await self.db.execute(count_query)
        total = total_result.scalar_one()

        items_result = await self.db.execute(query)
        items = list(items_result.scalars().all())

        return items, total
