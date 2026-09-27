"""
Aught2 Pickleball — Booking Repository (Phase 11)

Database access layer for court bookings, conflict detection, and availability lookups.
Strictly scoped by club tenant and/or player.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.booking import Booking, BookingStatus, BookingType
from app.models.court import Court
from app.models.user import User


class BookingRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, booking_id: UUID, club_id: UUID | None = None) -> Booking | None:
        """Fetch booking by ID with court and player relationships eagerly loaded."""
        stmt = (
            select(Booking)
            .options(
                selectinload(Booking.court),
                selectinload(Booking.player).selectinload(User.player_profile),
            )
            .where(Booking.id == booking_id)
        )
        if club_id is not None:
            stmt = stmt.where(Booking.club_id == club_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()


    async def lock_court_for_update(self, court_id: UUID) -> Court | None:
        """
        Acquire a row-level lock on the court record for concurrency control.
        Prevents race conditions between concurrent booking requests.
        """
        stmt = select(Court).where(Court.id == court_id).with_for_update()
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_conflicts(
        self,
        court_id: UUID,
        start_at: datetime,
        end_at: datetime,
        exclude_booking_id: UUID | None = None,
    ) -> list[Booking]:
        """
        Find any confirmed booking on the same court that overlaps with [start_at, end_at).
        Overlap condition: existing.start_at < new.end_at AND existing.end_at > new.start_at.
        """
        stmt = (
            select(Booking)
            .where(
                Booking.court_id == court_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.start_at < end_at,
                Booking.end_at > start_at,
            )
        )
        if exclude_booking_id is not None:
            stmt = stmt.where(Booking.id != exclude_booking_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_active_upcoming_by_player(
        self,
        player_id: UUID,
        now: datetime | None = None,
    ) -> int:
        """
        Count active (CONFIRMED) bookings for a player that end in the future.
        """
        if now is None:
            now = datetime.now(timezone.utc)
        stmt = (
            select(func.count(Booking.id))
            .where(
                Booking.player_id == player_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.end_at > now,
            )
        )
        result = await self.db.execute(stmt)
        return int(result.scalar_one())

    async def list_by_club(
        self,
        club_id: UUID,
        court_id: UUID | None = None,
        player_id: UUID | None = None,
        status: BookingStatus | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Booking]:
        """
        List bookings for a club with optional filtering.
        Used by club staff.
        """
        stmt = (
            select(Booking)
            .options(
                selectinload(Booking.court),
                selectinload(Booking.player).selectinload(User.player_profile),
            )
            .where(Booking.club_id == club_id)
        )
        if court_id is not None:
            stmt = stmt.where(Booking.court_id == court_id)
        if player_id is not None:
            stmt = stmt.where(Booking.player_id == player_id)
        if status is not None:
            stmt = stmt.where(Booking.status == status)
        if start_date is not None:
            stmt = stmt.where(Booking.start_at >= start_date)
        if end_date is not None:
            stmt = stmt.where(Booking.end_at <= end_date)

        stmt = stmt.order_by(Booking.start_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_by_player(
        self,
        player_id: UUID,
        club_id: UUID | None = None,
        status: BookingStatus | None = None,
        upcoming_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Booking]:
        """
        List bookings for a specific player across clubs or within a single club.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            select(Booking)
            .options(
                selectinload(Booking.court),
                selectinload(Booking.club),
                selectinload(Booking.player).selectinload(User.player_profile),
            )
            .where(Booking.player_id == player_id)
        )
        if club_id is not None:
            stmt = stmt.where(Booking.club_id == club_id)
        if status is not None:
            stmt = stmt.where(Booking.status == status)
        if upcoming_only:
            stmt = stmt.where(Booking.end_at >= now)
            stmt = stmt.order_by(Booking.start_at.asc())
        else:
            stmt = stmt.order_by(Booking.start_at.desc())

        stmt = stmt.limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_confirmed_for_date_range(
        self,
        club_id: UUID,
        start_time: datetime,
        end_time: datetime,
        court_ids: list[UUID] | None = None,
    ) -> list[Booking]:
        """
        List all confirmed bookings within a time window for availability calculation.
        """
        stmt = (
            select(Booking)
            .where(
                Booking.club_id == club_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.start_at < end_time,
                Booking.end_at > start_time,
            )
        )
        if court_ids:
            stmt = stmt.where(Booking.court_id.in_(court_ids))

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(
        self,
        club_id: UUID,
        court_id: UUID,
        player_id: UUID,
        created_by_user_id: UUID,
        booking_type: BookingType,
        start_at: datetime,
        end_at: datetime,
        status: BookingStatus = BookingStatus.CONFIRMED,
        notes: str | None = None,
    ) -> Booking:
        booking = Booking(
            club_id=club_id,
            court_id=court_id,
            player_id=player_id,
            booked_by_user_id=created_by_user_id,
            booking_type=booking_type,
            status=status,
            start_at=start_at,
            end_at=end_at,
            notes=notes.strip() if notes else None,
        )
        self.db.add(booking)
        await self.db.flush()
        # Refresh with eager relationships loaded
        return await self.get_by_id(booking.id)  # type: ignore[return-value]


    async def update(self, booking: Booking, **fields) -> Booking:
        for k, v in fields.items():
            if hasattr(booking, k):
                setattr(booking, k, v)
        await self.db.flush()
        return await self.get_by_id(booking.id)  # type: ignore[return-value]
