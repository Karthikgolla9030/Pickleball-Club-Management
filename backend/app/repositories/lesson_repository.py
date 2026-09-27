"""
Aught2 Pickleball — Lesson Repositories (Phase 15)

Data access layer for:
  - CoachRepository: coach personnel management, active/inactive filtering
  - LessonTypeRepository: lesson types, configuration templates
  - LessonRepository: scheduling, court/coach conflict detection, tenant-scoped queries
  - LessonRegistrationRepository: registrations, capacity tracking, attendance updates
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Sequence
import uuid
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.lesson import (
    Coach,
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)


# ─── Coach Repository ─────────────────────────────────────────────────────────

class CoachRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        club_id: UUID,
        name: str,
        bio: str | None = None,
        specialization: str | None = None,
        phone: str | None = None,
        email: str | None = None,
        user_id: UUID | None = None,
    ) -> Coach:
        coach = Coach(
            club_id=club_id,
            name=name,
            bio=bio,
            specialization=specialization,
            phone=phone,
            email=email,
            user_id=user_id,
            is_active=True,
        )
        self.db.add(coach)
        await self.db.flush()
        await self.db.refresh(coach)
        return coach

    async def get_by_id(self, coach_id: UUID, club_id: UUID | None = None) -> Coach | None:
        stmt = select(Coach).where(Coach.id == coach_id)
        if club_id is not None:
            stmt = stmt.where(Coach.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_by_club(
        self,
        club_id: UUID,
        is_active: bool | None = None,
    ) -> list[Coach]:
        stmt = select(Coach).where(Coach.club_id == club_id)
        if is_active is not None:
            stmt = stmt.where(Coach.is_active == is_active)
        stmt = stmt.order_by(Coach.name.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, coach: Coach) -> Coach:
        coach.updated_at = datetime.now(timezone.utc)
        self.db.add(coach)
        await self.db.flush()
        await self.db.refresh(coach)
        return coach


# ─── Lesson Type Repository ───────────────────────────────────────────────────

class LessonTypeRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        club_id: UUID,
        name: str,
        duration_minutes: int,
        default_price: Decimal,
        description: str | None = None,
        default_capacity: int | None = None,
        currency: str = "INR",
        is_private: bool = False,
    ) -> LessonType:
        lesson_type = LessonType(
            club_id=club_id,
            name=name,
            description=description,
            duration_minutes=duration_minutes,
            default_capacity=default_capacity,
            default_price=default_price,
            currency=currency.upper(),
            is_private=is_private,
            is_active=True,
        )
        self.db.add(lesson_type)
        await self.db.flush()
        await self.db.refresh(lesson_type)
        return lesson_type

    async def get_by_id(self, lesson_type_id: UUID, club_id: UUID | None = None) -> LessonType | None:
        stmt = select(LessonType).where(LessonType.id == lesson_type_id)
        if club_id is not None:
            stmt = stmt.where(LessonType.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_by_club(
        self,
        club_id: UUID,
        is_active: bool | None = None,
    ) -> list[LessonType]:
        stmt = select(LessonType).where(LessonType.club_id == club_id)
        if is_active is not None:
            stmt = stmt.where(LessonType.is_active == is_active)
        stmt = stmt.order_by(LessonType.name.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, lesson_type: LessonType) -> LessonType:
        lesson_type.updated_at = datetime.now(timezone.utc)
        self.db.add(lesson_type)
        await self.db.flush()
        await self.db.refresh(lesson_type)
        return lesson_type


# ─── Lesson Repository ────────────────────────────────────────────────────────

class LessonRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        club_id: UUID,
        lesson_type_id: UUID,
        coach_id: UUID,
        title: str,
        start_at: datetime,
        end_at: datetime,
        price: Decimal,
        currency: str = "INR",
        capacity: int | None = None,
        court_id: UUID | None = None,
        description: str | None = None,
        registration_opens_at: datetime | None = None,
        registration_closes_at: datetime | None = None,
        created_by_user_id: UUID | None = None,
        status: LessonStatus = LessonStatus.DRAFT,
    ) -> Lesson:
        lesson = Lesson(
            club_id=club_id,
            lesson_type_id=lesson_type_id,
            coach_id=coach_id,
            court_id=court_id,
            title=title,
            description=description,
            start_at=start_at,
            end_at=end_at,
            capacity=capacity,
            price=price,
            currency=currency.upper(),
            status=status,
            registration_opens_at=registration_opens_at,
            registration_closes_at=registration_closes_at,
            created_by_user_id=created_by_user_id,
        )
        self.db.add(lesson)
        await self.db.flush()
        return await self.get_by_id(lesson.id)  # type: ignore

    async def get_by_id(self, lesson_id: UUID, club_id: UUID | None = None) -> Lesson | None:
        stmt = (
            select(Lesson)
            .where(Lesson.id == lesson_id)
            .options(
                selectinload(Lesson.coach),
                selectinload(Lesson.lesson_type),
                selectinload(Lesson.court),
                selectinload(Lesson.created_by),
            )
        )
        if club_id is not None:
            stmt = stmt.where(Lesson.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_for_update(self, lesson_id: UUID) -> Lesson | None:
        """Lock lesson row for concurrent registration capacity check."""
        stmt = (
            select(Lesson)
            .where(Lesson.id == lesson_id)
            .with_for_update()
            .options(
                selectinload(Lesson.coach),
                selectinload(Lesson.lesson_type),
                selectinload(Lesson.court),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def find_coach_conflicts(
        self,
        coach_id: UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_lesson_id: UUID | None = None,
    ) -> list[Lesson]:
        """
        Find any draft or published lesson with the same coach that overlaps with [start_at, end_at).
        Overlap condition: existing.start_at < new.end_at AND existing.end_at > new.start_at.
        """
        stmt = select(Lesson).where(
            Lesson.coach_id == coach_id,
            Lesson.status.in_([LessonStatus.DRAFT, LessonStatus.PUBLISHED]),
            Lesson.start_at < end_at,
            Lesson.end_at > start_at,
        )
        if exclude_lesson_id is not None:
            stmt = stmt.where(Lesson.id != exclude_lesson_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def find_court_conflicts(
        self,
        court_id: UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_lesson_id: UUID | None = None,
    ) -> list[Lesson]:
        """
        Find any draft or published lesson on the same court that overlaps with [start_at, end_at).
        """
        stmt = select(Lesson).where(
            Lesson.court_id == court_id,
            Lesson.status.in_([LessonStatus.DRAFT, LessonStatus.PUBLISHED]),
            Lesson.start_at < end_at,
            Lesson.end_at > start_at,
        )
        if exclude_lesson_id is not None:
            stmt = stmt.where(Lesson.id != exclude_lesson_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_club(
        self,
        club_id: UUID,
        status: LessonStatus | None = None,
        coach_id: UUID | None = None,
        lesson_type_id: UUID | None = None,
        court_id: UUID | None = None,
        date_from: datetime | date | None = None,
        date_to: datetime | date | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Lesson]:
        stmt = (
            select(Lesson)
            .where(Lesson.club_id == club_id)
            .options(
                selectinload(Lesson.coach),
                selectinload(Lesson.lesson_type),
                selectinload(Lesson.court),
            )
        )
        if status is not None:
            stmt = stmt.where(Lesson.status == status)
        if coach_id is not None:
            stmt = stmt.where(Lesson.coach_id == coach_id)
        if lesson_type_id is not None:
            stmt = stmt.where(Lesson.lesson_type_id == lesson_type_id)
        if court_id is not None:
            stmt = stmt.where(Lesson.court_id == court_id)

        if date_from is not None:
            dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc) if isinstance(date_from, date) and not isinstance(date_from, datetime) else date_from
            stmt = stmt.where(Lesson.start_at >= dt_from)
        if date_to is not None:
            dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc) if isinstance(date_to, date) and not isinstance(date_to, datetime) else date_to
            stmt = stmt.where(Lesson.start_at <= dt_to)

        stmt = stmt.order_by(Lesson.start_at.asc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_player_discover(
        self,
        club_id: UUID,
        lesson_type_id: UUID | None = None,
        date_from: datetime | date | None = None,
        date_to: datetime | date | None = None,
        upcoming_only: bool = True,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Lesson]:
        now = datetime.now(timezone.utc)
        stmt = (
            select(Lesson)
            .where(
                Lesson.club_id == club_id,
                Lesson.status == LessonStatus.PUBLISHED,
            )
            .options(
                selectinload(Lesson.coach),
                selectinload(Lesson.lesson_type),
                selectinload(Lesson.court),
            )
        )
        if upcoming_only:
            stmt = stmt.where(Lesson.end_at >= now)
        if lesson_type_id is not None:
            stmt = stmt.where(Lesson.lesson_type_id == lesson_type_id)
        if date_from is not None:
            dt_from = datetime.combine(date_from, time.min, tzinfo=timezone.utc) if isinstance(date_from, date) and not isinstance(date_from, datetime) else date_from
            stmt = stmt.where(Lesson.start_at >= dt_from)
        if date_to is not None:
            dt_to = datetime.combine(date_to, time.max, tzinfo=timezone.utc) if isinstance(date_to, date) and not isinstance(date_to, datetime) else date_to
            stmt = stmt.where(Lesson.start_at <= dt_to)

        stmt = stmt.order_by(Lesson.start_at.asc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, lesson: Lesson) -> Lesson:
        lesson.updated_at = datetime.now(timezone.utc)
        self.db.add(lesson)
        await self.db.flush()
        return await self.get_by_id(lesson.id)  # type: ignore


# ─── Lesson Registration Repository ──────────────────────────────────────────

class LessonRegistrationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        lesson_id: UUID,
        user_id: UUID,
        notes: str | None = None,
        status: LessonRegistrationStatus = LessonRegistrationStatus.REGISTERED,
    ) -> LessonRegistration:
        registration = LessonRegistration(
            lesson_id=lesson_id,
            user_id=user_id,
            status=status,
            notes=notes,
            registered_at=datetime.now(timezone.utc),
        )
        self.db.add(registration)
        await self.db.flush()
        return await self.get_by_id(registration.id)  # type: ignore

    async def get_by_id(
        self,
        registration_id: UUID,
        lesson_id: UUID | None = None,
    ) -> LessonRegistration | None:
        stmt = (
            select(LessonRegistration)
            .where(LessonRegistration.id == registration_id)
            .options(
                selectinload(LessonRegistration.user),
                selectinload(LessonRegistration.lesson),
            )
        )
        if lesson_id is not None:
            stmt = stmt.where(LessonRegistration.lesson_id == lesson_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_active_registration_for_user(
        self,
        lesson_id: UUID,
        user_id: UUID,
    ) -> LessonRegistration | None:
        stmt = (
            select(LessonRegistration)
            .where(
                LessonRegistration.lesson_id == lesson_id,
                LessonRegistration.user_id == user_id,
                LessonRegistration.status != LessonRegistrationStatus.CANCELLED,
            )
            .options(selectinload(LessonRegistration.user))
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_any_registration_for_user(
        self,
        lesson_id: UUID,
        user_id: UUID,
    ) -> LessonRegistration | None:
        stmt = (
            select(LessonRegistration)
            .where(
                LessonRegistration.lesson_id == lesson_id,
                LessonRegistration.user_id == user_id,
            )
            .order_by(LessonRegistration.registered_at.desc())
            .options(selectinload(LessonRegistration.user))
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def count_active_by_lesson(self, lesson_id: UUID) -> int:
        stmt = (
            select(func.count(LessonRegistration.id))
            .where(
                LessonRegistration.lesson_id == lesson_id,
                LessonRegistration.status != LessonRegistrationStatus.CANCELLED,
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar() or 0)

    async def get_registration_counts(self, lesson_id: UUID) -> dict[str, int]:
        stmt = (
            select(
                LessonRegistration.status,
                func.count(LessonRegistration.id),
            )
            .where(LessonRegistration.lesson_id == lesson_id)
            .group_by(LessonRegistration.status)
        )
        result = await self.db.execute(stmt)
        counts = {s: 0 for s in LessonRegistrationStatus}
        for status_val, count in result.all():
            counts[status_val] = count

        active_count = sum(
            counts[s] for s in [
                LessonRegistrationStatus.REGISTERED,
                LessonRegistrationStatus.ATTENDED,
                LessonRegistrationStatus.NO_SHOW,
            ]
        )
        return {
            "active_count": active_count,
            "registered_count": counts[LessonRegistrationStatus.REGISTERED],
            "attended_count": counts[LessonRegistrationStatus.ATTENDED],
            "no_show_count": counts[LessonRegistrationStatus.NO_SHOW],
            "cancelled_count": counts[LessonRegistrationStatus.CANCELLED],
        }

    async def list_by_lesson(
        self,
        lesson_id: UUID,
        status: LessonRegistrationStatus | None = None,
    ) -> list[LessonRegistration]:
        stmt = (
            select(LessonRegistration)
            .where(LessonRegistration.lesson_id == lesson_id)
            .options(selectinload(LessonRegistration.user))
        )
        if status is not None:
            stmt = stmt.where(LessonRegistration.status == status)
        stmt = stmt.order_by(LessonRegistration.registered_at.asc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_user(
        self,
        user_id: UUID,
        status: LessonRegistrationStatus | None = None,
        upcoming_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> list[LessonRegistration]:
        now = datetime.now(timezone.utc)
        stmt = (
            select(LessonRegistration)
            .join(Lesson, LessonRegistration.lesson_id == Lesson.id)
            .where(LessonRegistration.user_id == user_id)
            .options(
                selectinload(LessonRegistration.lesson).selectinload(Lesson.coach),
                selectinload(LessonRegistration.lesson).selectinload(Lesson.lesson_type),
                selectinload(LessonRegistration.lesson).selectinload(Lesson.court),
                selectinload(LessonRegistration.user),
            )
        )
        if status is not None:
            stmt = stmt.where(LessonRegistration.status == status)
        if upcoming_only:
            stmt = stmt.where(Lesson.end_at >= now)

        stmt = stmt.order_by(Lesson.start_at.asc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update(self, registration: LessonRegistration) -> LessonRegistration:
        registration.updated_at = datetime.now(timezone.utc)
        self.db.add(registration)
        await self.db.flush()
        return await self.get_by_id(registration.id)  # type: ignore
