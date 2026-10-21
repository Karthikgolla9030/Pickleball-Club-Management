"""
Aught2 Pickleball — Notification Service
Business logic for creating, delivering, tracking, and managing persistent notifications.
Enforces multi-club recipient isolation, idempotency, and user preferences.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.events import EventType, dispatch_event
from app.models.notification import Notification, NotificationPreference

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_preferences(self, user_id: UUID) -> NotificationPreference:
        """Fetch or initialize default notification preferences for a user."""
        res = await self.db.execute(
            select(NotificationPreference).where(NotificationPreference.user_id == user_id)
        )
        pref = res.scalar_one_or_none()
        if not pref:
            pref = NotificationPreference(
                user_id=user_id,
                booking_notifications=True,
                membership_notifications=True,
                tournament_notifications=True,
                event_notifications=True,
                payment_notifications=True,
                administrative_notifications=True,
            )
            self.db.add(pref)
            await self.db.flush()
        return pref

    async def update_preferences(
        self,
        user_id: UUID,
        updates: dict[str, Any],
    ) -> NotificationPreference:
        """Update persistent notification preferences for a user."""
        pref = await self.get_preferences(user_id)
        for field in [
            "booking_notifications",
            "membership_notifications",
            "tournament_notifications",
            "event_notifications",
            "payment_notifications",
            "administrative_notifications",
        ]:
            if field in updates and updates[field] is not None:
                setattr(pref, field, bool(updates[field]))
        pref.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return pref

    async def create_notification(
        self,
        user_id: UUID,
        title: str,
        message: str,
        category: str = "general",
        club_id: UUID | None = None,
        data: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        mandatory: bool = False,
    ) -> Notification | None:
        """
        Create a persistent notification and broadcast via WebSocket.
        Applies idempotency de-duplication and respects user preferences.
        """
        data_dict = dict(data or {})
        effective_key = idempotency_key or data_dict.get("idempotency_key")
        if effective_key:
            data_dict["idempotency_key"] = effective_key
            # Check recent notifications for idempotency to avoid duplicates
            recent_stmt = (
                select(Notification)
                .where(Notification.user_id == user_id)
                .order_by(Notification.created_at.desc(), Notification.id.desc())
                .limit(50)
            )
            recent_res = await self.db.execute(recent_stmt)
            for existing in recent_res.scalars().all():
                if existing.data and existing.data.get("idempotency_key") == effective_key:
                    logger.info("Notification de-duplicated via idempotency_key '%s'", effective_key)
                    return existing

        # Check user preferences for optional notifications
        if not mandatory:
            cat_lower = category.lower()
            pref = await self.get_preferences(user_id)
            if "booking" in cat_lower and not pref.booking_notifications:
                logger.info("Notification skipped for user %s: booking notifications disabled", user_id)
                return None
            if "membership" in cat_lower and not pref.membership_notifications:
                logger.info("Notification skipped for user %s: membership notifications disabled", user_id)
                return None
            if ("tournament" in cat_lower or "league" in cat_lower) and not pref.tournament_notifications:
                logger.info("Notification skipped for user %s: tournament notifications disabled", user_id)
                return None
            if ("event" in cat_lower or "lesson" in cat_lower) and not pref.event_notifications:
                logger.info("Notification skipped for user %s: event notifications disabled", user_id)
                return None
            if "payment" in cat_lower and not pref.payment_notifications:
                logger.info("Notification skipped for user %s: payment notifications disabled", user_id)
                return None
            if "admin" in cat_lower and not pref.administrative_notifications:
                logger.info("Notification skipped for user %s: administrative notifications disabled", user_id)
                return None

        notification = Notification(
            user_id=user_id,
            club_id=club_id,
            category=category,
            title=title,
            message=message,
            is_read=False,
            read_at=None,
            data=data_dict,
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
            "read_at": None,
            "data": data_dict,
            "resource_type": data_dict.get("resource_type"),
            "resource_id": data_dict.get("resource_id"),
            "action_url": data_dict.get("action_url"),
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
        mandatory: bool = False,
    ) -> list[Notification]:
        """Notify active *staff* members of a club (owner/manager roles only).

        Intentionally excludes regular player members so that internal
        operational notifications are not leaked to the player inbox.
        """
        from app.models.club_membership import ClubMembership, ClubRole
        staff_roles = [
            ClubRole.CLUB_OWNER,
            ClubRole.CLUB_MANAGER,
            "club_owner",
            "club_manager",
            "owner",
            "manager",
        ]
        staff_res = await self.db.execute(
            select(ClubMembership.user_id).where(
                ClubMembership.club_id == club_id,
                ClubMembership.is_active == True,
                # Owner and manager roles are considered staff
                ClubMembership.role.in_(staff_roles),
            )
        )
        staff_uids = set(staff_res.scalars().all())
        created: list[Notification] = []
        for uid in staff_uids:
            n = await self.create_notification(
                user_id=uid,
                title=title,
                message=message,
                category=category,
                club_id=club_id,
                data=data,
                mandatory=mandatory,
            )
            if n:
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
        """
        Return (items, total_count, unread_count) for the user.
        Eager-loads club to ensure club_name is available without N+1 queries.
        Uses deterministic secondary ordering (created_at desc, id desc).
        """
        query = (
            select(Notification)
            .options(selectinload(Notification.club))
            .where(Notification.user_id == user_id)
        )
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
            elif "tournament" in cat_lower or "league" in cat_lower:
                cats = ["tournament", "tournaments", "league", "leagues"]
            elif "event" in cat_lower or "lesson" in cat_lower:
                cats = ["event", "events", "lesson", "lessons"]
            elif "membership" in cat_lower or "member" in cat_lower:
                cats = ["membership", "memberships"]
            elif "payment" in cat_lower:
                cats = ["payment", "payments"]
            elif "admin" in cat_lower:
                cats = ["administrative", "admin", "general"]
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

        query = query.order_by(Notification.created_at.desc(), Notification.id.desc()).offset(offset).limit(limit)
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
        """Mark a single notification as read and record read_at.

        Idempotent: repeated calls on an already-read notification succeed
        without modifying read_at again.
        """
        res = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        notification = res.scalar_one_or_none()
        if not notification:
            return False

        # Idempotency guard — don't touch read_at if already read
        if not notification.is_read:
            now = datetime.now(timezone.utc)
            notification.is_read = True
            notification.read_at = now
            await self.db.flush()
        return True

    async def mark_all_as_read(
        self,
        user_id: UUID,
        club_id: UUID | None = None,
    ) -> int:
        """Mark all unread notifications as read for a user.

        When *club_id* is provided the operation is scoped to notifications
        belonging to that club (plus platform-wide general notifications).
        This prevents the club management UI from accidentally marking
        player-side or cross-club notifications as read.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            update(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.is_read == False,
            )
        )
        if club_id:
            from sqlalchemy import or_
            stmt = stmt.where(
                or_(
                    Notification.club_id == club_id,
                    Notification.club_id.is_(None),
                )
            )
        stmt = stmt.values(is_read=True, read_at=now)
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.rowcount

    async def delete_notification(self, notification_id: UUID, user_id: UUID) -> bool:
        """Delete / dismiss a single notification belonging to the authenticated user."""
        res = await self.db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        notification = res.scalar_one_or_none()
        if not notification:
            return False

        await self.db.delete(notification)
        await self.db.flush()
        return True
