"""
Aught2 Pickleball — Notification Service
Business logic for creating, delivering, and tracking persistent notifications.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import EventType, dispatch_event
from app.models.notification import Notification

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_notification(
        self,
        user_id: UUID,
        title: str,
        message: str,
        category: str = "general",
        club_id: UUID | None = None,
        data: dict[str, Any] | None = None,
    ) -> Notification:
        """Create a notification in the database and push via WebSocket."""
        notification = Notification(
            user_id=user_id,
            club_id=club_id,
            category=category,
            title=title,
            message=message,
            is_read=False,
            data=data or {},
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(notification)
        await self.db.flush()

        # Real-time WebSocket delivery
        payload = {
            "id": str(notification.id),
            "user_id": str(user_id),
            "club_id": str(club_id) if club_id else None,
            "category": category,
            "title": title,
            "message": message,
            "is_read": False,
            "data": data or {},
            "created_at": notification.created_at.isoformat(),
        }
        await dispatch_event(
            event_type=EventType.NOTIFICATION_CREATED,
            data=payload,
            user_id=user_id,
            club_id=club_id,
        )

        logger.info(
            "Created and pushed notification %s to user %s: '%s'",
            notification.id,
            user_id,
            title,
        )
        return notification

    async def notify_club_staff(
        self,
        club_id: UUID,
        title: str,
        message: str,
        category: str = "general",
        data: dict[str, Any] | None = None,
    ) -> list[Notification]:
        """Notify all active staff members of a club and broadcast over WebSocket."""
        from app.models.club_membership import ClubMembership
        staff_res = await self.db.execute(
            select(ClubMembership.user_id).where(
                ClubMembership.club_id == club_id,
                ClubMembership.is_active == True,
            )
        )
        staff_uids = set(staff_res.scalars().all())
        created = []
        for uid in staff_uids:
            n = await self.create_notification(
                user_id=uid,
                title=title,
                message=message,
                category=category,
                club_id=club_id,
                data=data,
            )
            created.append(n)
        return created

    async def list_user_notifications(
        self,
        user_id: UUID,
        category: str | None = None,
        club_id: UUID | None = None,
        date_str: str | None = None,
        unread_only: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Notification], int, int]:
        """Return (items, total_count, unread_count) for the user."""
        query = select(Notification).where(Notification.user_id == user_id)
        count_query = select(func.count(Notification.id)).where(Notification.user_id == user_id)
        unread_count_query = select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )

        if club_id:
            query = query.where((Notification.club_id == club_id) | (Notification.club_id.is_(None)))
            count_query = count_query.where((Notification.club_id == club_id) | (Notification.club_id.is_(None)))
            unread_count_query = unread_count_query.where((Notification.club_id == club_id) | (Notification.club_id.is_(None)))

        if date_str:
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d").date()
                day_start = datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)
                day_end = datetime.combine(d, datetime.max.time(), tzinfo=timezone.utc)
                query = query.where(Notification.created_at >= day_start, Notification.created_at <= day_end)
                count_query = count_query.where(Notification.created_at >= day_start, Notification.created_at <= day_end)
                unread_count_query = unread_count_query.where(Notification.created_at >= day_start, Notification.created_at <= day_end)
            except Exception:
                pass

        if category and category.lower() != "all":
            cat_lower = category.lower()
            if "booking" in cat_lower:
                cats = ["booking", "bookings"]
            elif "tournament" in cat_lower:
                cats = ["tournament", "tournaments"]
            elif "event" in cat_lower or "lesson" in cat_lower:
                cats = ["event", "events", "lesson", "lessons"]
            elif "membership" in cat_lower or "member" in cat_lower:
                cats = ["membership", "memberships"]
            else:
                cats = [category]
            query = query.where(Notification.category.in_(cats))
            count_query = count_query.where(Notification.category.in_(cats))
            unread_count_query = unread_count_query.where(Notification.category.in_(cats))

        if unread_only:
            query = query.where(Notification.is_read == False)
            count_query = count_query.where(Notification.is_read == False)

        total_res = await self.db.execute(count_query)
        total = total_res.scalar_one() or 0

        unread_res = await self.db.execute(unread_count_query)
        unread_count = unread_res.scalar_one() or 0

        query = query.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
        items_res = await self.db.execute(query)
        items = list(items_res.scalars().all())

        return items, total, unread_count

    async def get_unread_count(self, user_id: UUID) -> int:
        """Get total number of unread notifications for a user."""
        unread_res = await self.db.execute(
            select(func.count(Notification.id)).where(
                Notification.user_id == user_id,
                Notification.is_read == False,
            )
        )
        return unread_res.scalar_one() or 0

    async def mark_as_read(self, notification_id: UUID, user_id: UUID) -> bool:
        """Mark a single notification as read."""
        res = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        notification = res.scalar_one_or_none()
        if not notification:
            return False

        notification.is_read = True
        await self.db.flush()
        return True

    async def mark_all_as_read(self, user_id: UUID) -> int:
        """Mark all unread notifications as read for a user."""
        result = await self.db.execute(
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read == False,
            )
            .values(is_read=True)
        )
        await self.db.flush()
        return result.rowcount
