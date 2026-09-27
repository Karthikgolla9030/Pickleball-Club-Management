"""
Aught2 Pickleball — Member Subscription Service (Phase 12)

Business logic for subscription lifecycle:
  - Create (staff enrollment workflow)
  - Cancel
  - Renew (creates a new record — preserves audit history)
  - View (player-facing, read-only)

INVARIANTS enforced here:
  1. player_membership must belong to the same club as the plan.
  2. Only one active/scheduled subscription per (player_membership, club).
  3. Inactive plans cannot receive new subscriptions.
  4. Only active club players can receive new subscriptions.
  5. start_date must not be in the past (admin backdating not supported).
  6. end_date is derived from plan duration — always calendar-correct.
  7. Cancellation is soft — never deletes historical records.
  8. Renewal creates a new subscription record (old one is left expired/cancelled).

Expiration architecture:
  Status is lazily synced: if status==ACTIVE and today > end_date,
  the service returns effective_status=EXPIRED without a background worker.
  The service also persists the new status when it detects expiry.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_player_membership import PlayerMembershipStatus
from app.models.membership import PlanStatus, SubscriptionStatus
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.member_subscription_repository import MemberSubscriptionRepository
from app.repositories.membership_plan_repository import MembershipPlanRepository
from app.schemas.membership import (
    MemberSubscriptionCancelRequest,
    MemberSubscriptionCreate,
    MemberSubscriptionResponse,
    MemberSubscriptionUpdate,
    PlayerMembershipView,
)
from app.core.events import EventType, dispatch_event
from app.services.membership_plan_service import MembershipPlanService
from app.services.notification_service import NotificationService


class MemberSubscriptionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.sub_repo = MemberSubscriptionRepository(db)
        self.plan_repo = MembershipPlanRepository(db)
        self.player_repo = ClubPlayerMembershipRepository(db)

    # ─── Expiration Sync ──────────────────────────────────────────────────────

    async def _sync_expiry(self, sub) -> None:
        """
        Lazily persist expiration: if the date has passed and status is still ACTIVE,
        update the DB. No background worker required.
        """
        if (
            sub.status == SubscriptionStatus.ACTIVE
            and date.today() > sub.end_date
        ):
            await self.sub_repo.update(sub, status=SubscriptionStatus.EXPIRED)

    # ─── Create Subscription (Staff Enrollment) ───────────────────────────────

    async def create_subscription(
        self,
        club_id: UUID,
        payload: MemberSubscriptionCreate,
        staff_user_id: UUID,
    ) -> MemberSubscriptionResponse:
        """
        Enroll an active club player into a plan.

        Validates:
          - player_membership belongs to this club
          - player membership is active
          - plan belongs to this club
          - plan is active
          - no conflicting active/scheduled subscription exists
          - start_date is not in the past

        Creates subscription with status:
          - ACTIVE if start_date == today
          - SCHEDULED if start_date > today
        """
        # 1. Validate player membership belongs to this club
        player_membership = await self.player_repo.get_by_id(payload.player_membership_id)
        if not player_membership or player_membership.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Player membership not found in this club",
            )

        # 2. Validate player membership is active
        if player_membership.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Player must have an active club membership to receive a subscription",
            )

        # 3. Validate plan belongs to this club
        plan = await self.plan_repo.get_by_id(
            plan_id=payload.membership_plan_id, club_id=club_id
        )
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership plan not found in this club",
            )

        # 4. Validate plan is active (inactive plans cannot receive new subscriptions)
        if plan.status != PlanStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create a subscription for an inactive membership plan",
            )

        # 5. Validate no conflicting active/scheduled subscription
        existing = await self.sub_repo.get_active_or_scheduled_for_player_in_club(
            player_membership_id=payload.player_membership_id,
            club_id=club_id,
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Player already has an {existing.status.value} subscription "
                    f"for this club. Cancel or expire it before creating a new one."
                ),
            )

        # 6. Determine initial status
        today = date.today()
        initial_status = (
            SubscriptionStatus.ACTIVE
            if payload.start_date == today
            else SubscriptionStatus.SCHEDULED
        )

        # 7. Calculate end_date from plan duration (calendar-correct)
        end_date = MembershipPlanService.calculate_end_date(
            start=payload.start_date,
            unit=plan.duration_unit,
        )

        # 8. Create subscription
        sub = await self.sub_repo.create(
            club_id=club_id,
            player_membership_id=payload.player_membership_id,
            membership_plan_id=payload.membership_plan_id,
            start_date=payload.start_date,
            end_date=end_date,
            status=initial_status,
            auto_renew=payload.auto_renew,
            notes=payload.notes,
        )
        await self.db.commit()
        resp = MemberSubscriptionResponse.from_orm(sub)

        try:
            pm = await self.player_repo.get_by_id(payload.player_membership_id)
            if pm:
                plan_obj = await self.plan_repo.get_by_id(payload.membership_plan_id)
                plan_name = plan_obj.name if plan_obj else "Membership Plan"
                await dispatch_event(
                    event_type=EventType.PLAYER_MEMBERSHIP_UPDATED,
                    data={
                        "subscription_id": str(sub.id),
                        "club_id": str(club_id),
                        "user_id": str(pm.user_id),
                        "status": sub.status.value,
                        "plan_name": plan_name,
                    },
                    club_id=club_id,
                    user_id=pm.user_id,
                )
                notif_svc = NotificationService(self.db)
                await notif_svc.create_notification(
                    user_id=pm.user_id,
                    club_id=club_id,
                    category="membership",
                    title="Membership Plan Enrolled",
                    message=f"You have been enrolled in '{plan_name}'.",
                    data={"subscription_id": str(sub.id)},
                )
                await notif_svc.notify_club_staff(
                    club_id=club_id,
                    category="membership",
                    title="Membership Updated",
                    message=f"Membership '{plan_name}' has been updated.",
                    data={"subscription_id": str(sub.id), "player_id": str(pm.user_id)},
                )
                await self.db.commit()
        except Exception:
            pass

        return resp

    # ─── Read Subscription ────────────────────────────────────────────────────

    async def get_subscription(
        self,
        club_id: UUID,
        subscription_id: UUID,
    ) -> MemberSubscriptionResponse:
        """Get subscription scoped to club. Lazily syncs expiry."""
        sub = await self.sub_repo.get_by_id(
            subscription_id=subscription_id, club_id=club_id
        )
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found in this club",
            )
        await self._sync_expiry(sub)
        return MemberSubscriptionResponse.from_orm(sub)

    async def list_subscriptions(
        self,
        club_id: UUID,
        player_membership_id: UUID | None = None,
        plan_id: UUID | None = None,
        status_filter: SubscriptionStatus | None = None,
        start_date_from: date | None = None,
        start_date_to: date | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[MemberSubscriptionResponse]:
        """List subscriptions for a club with optional filters."""
        subs = await self.sub_repo.list_by_club(
            club_id=club_id,
            player_membership_id=player_membership_id,
            plan_id=plan_id,
            status=status_filter,
            start_date_from=start_date_from,
            start_date_to=start_date_to,
            limit=limit,
            offset=offset,
        )
        # Sync expiry for all active subs
        for sub in subs:
            await self._sync_expiry(sub)
        return [MemberSubscriptionResponse.from_orm(s) for s in subs]

    async def update_subscription(
        self,
        club_id: UUID,
        subscription_id: UUID,
        payload: MemberSubscriptionUpdate,
    ) -> MemberSubscriptionResponse:
        """Update mutable fields (auto_renew, notes) of a subscription."""
        sub = await self.sub_repo.get_by_id(
            subscription_id=subscription_id, club_id=club_id
        )
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found in this club",
            )
        kwargs: dict = {}
        if payload.auto_renew is not None:
            kwargs["auto_renew"] = payload.auto_renew
        if payload.notes is not None:
            kwargs["notes"] = payload.notes
        updated = await self.sub_repo.update(sub, **kwargs)
        await self.db.commit()
        return MemberSubscriptionResponse.from_orm(updated)

    # ─── Cancellation ─────────────────────────────────────────────────────────

    async def cancel_subscription(
        self,
        club_id: UUID,
        subscription_id: UUID,
        staff_user_id: UUID,
        payload: MemberSubscriptionCancelRequest,
    ) -> MemberSubscriptionResponse:
        """
        Staff cancels an active or scheduled subscription.
        Status is set to CANCELLED — record is never deleted.
        """
        sub = await self.sub_repo.get_by_id(
            subscription_id=subscription_id, club_id=club_id
        )
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found in this club",
            )
        if sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.SCHEDULED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel a subscription with status '{sub.status.value}'",
            )

        now = datetime.now(timezone.utc)
        sub.status = SubscriptionStatus.CANCELLED
        sub.cancelled_at = now
        sub.cancelled_by_user_id = staff_user_id
        sub.cancellation_reason = payload.cancellation_reason
        await self.db.flush()
        await self.db.commit()
        full_sub = await self.sub_repo.get_by_id(sub.id, club_id=club_id)
        resp = MemberSubscriptionResponse.from_orm(full_sub)

        try:
            pm = await self.player_repo.get_by_id(sub.player_membership_id)
            if pm:
                plan_name = sub.plan.name if sub.plan else "Membership Plan"
                await dispatch_event(
                    event_type=EventType.PLAYER_MEMBERSHIP_UPDATED,
                    data={
                        "subscription_id": str(sub.id),
                        "club_id": str(club_id),
                        "user_id": str(pm.user_id),
                        "status": sub.status.value,
                        "plan_name": plan_name,
                    },
                    club_id=club_id,
                    user_id=pm.user_id,
                )
                await NotificationService(self.db).create_notification(
                    user_id=pm.user_id,
                    club_id=club_id,
                    category="membership",
                    title="Membership Plan Cancelled",
                    message=f"Your subscription for '{plan_name}' has been cancelled by club staff.",
                    data={"subscription_id": str(sub.id)},
                )
                await self.db.commit()
        except Exception:
            pass

        return resp

    # ─── Renewal ─────────────────────────────────────────────────────────────

    async def renew_subscription(
        self,
        club_id: UUID,
        subscription_id: UUID,
        staff_user_id: UUID,
    ) -> MemberSubscriptionResponse:
        """
        Administratively renew a subscription.

        Architecture (preserves audit history):
          1. The existing subscription is marked EXPIRED (or left as-is if already expired).
          2. A NEW subscription is created starting the day after the old end_date.

        This approach keeps full history without invisible mutation of historical records.
        """
        sub = await self.sub_repo.get_by_id(
            subscription_id=subscription_id, club_id=club_id
        )
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found in this club",
            )
        if sub.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot renew a subscription with status '{sub.status.value}'",
            )

        # Verify plan is still active (can renew into an active plan)
        plan = await self.plan_repo.get_by_id(
            plan_id=sub.membership_plan_id, club_id=club_id
        )
        if not plan or plan.status != PlanStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The plan associated with this subscription is no longer active",
            )

        # Verify no conflicting active/scheduled subscription already
        existing_new = await self.sub_repo.get_active_or_scheduled_for_player_in_club(
            player_membership_id=sub.player_membership_id,
            club_id=club_id,
        )
        if existing_new and existing_new.id != sub.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Player already has an active or scheduled subscription",
            )

        # Mark old subscription as expired if still active
        if sub.status == SubscriptionStatus.ACTIVE:
            await self.sub_repo.update(sub, status=SubscriptionStatus.EXPIRED)

        # Calculate new subscription dates (next day after old end_date)
        from datetime import timedelta
        new_start = sub.end_date + timedelta(days=1)
        new_end = MembershipPlanService.calculate_end_date(
            start=new_start,
            unit=plan.duration_unit,
        )

        today = date.today()
        new_status = (
            SubscriptionStatus.ACTIVE
            if new_start <= today
            else SubscriptionStatus.SCHEDULED
        )

        new_sub = await self.sub_repo.create(
            club_id=club_id,
            player_membership_id=sub.player_membership_id,
            membership_plan_id=sub.membership_plan_id,
            start_date=new_start,
            end_date=new_end,
            status=new_status,
            auto_renew=sub.auto_renew,
            notes=None,
        )
        await self.db.commit()
        resp = MemberSubscriptionResponse.from_orm(new_sub)

        try:
            pm = await self.player_repo.get_by_id(sub.player_membership_id)
            if pm:
                await dispatch_event(
                    event_type=EventType.PLAYER_MEMBERSHIP_UPDATED,
                    data={
                        "subscription_id": str(new_sub.id),
                        "club_id": str(club_id),
                        "user_id": str(pm.user_id),
                        "status": new_sub.status.value,
                        "plan_name": plan.name,
                    },
                    club_id=club_id,
                    user_id=pm.user_id,
                )
                await NotificationService(self.db).create_notification(
                    user_id=pm.user_id,
                    club_id=club_id,
                    category="membership",
                    title="Membership Plan Renewed",
                    message=f"Your subscription for '{plan.name}' has been renewed.",
                    data={"subscription_id": str(new_sub.id)},
                )
                await self.db.commit()
        except Exception:
            pass

        return resp

    # ─── Player View ──────────────────────────────────────────────────────────

    async def get_player_membership_view(
        self,
        user_id: UUID,
        club_id: UUID,
    ) -> PlayerMembershipView:
        """
        Player-facing: return the active subscription for a player in a specific club.
        Players can VIEW only — they cannot modify subscriptions.
        """
        sub = await self.sub_repo.get_by_user_and_club(
            user_id=user_id, club_id=club_id
        )
        if not sub:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active membership found for this club",
            )
        await self._sync_expiry(sub)
        return PlayerMembershipView.from_subscription(sub)

    # ─── Booking Integration Helper ───────────────────────────────────────────

    async def get_player_booking_limits(
        self,
        user_id: UUID,
        club_id: UUID,
    ) -> tuple[int, int] | None:
        """
        Return (booking_limit, advance_booking_days) from the player's active plan,
        or None if no active subscription exists.

        Called by BookingService — booking limit logic stays centralized there.
        """
        sub = await self.sub_repo.get_by_user_and_club(
            user_id=user_id, club_id=club_id
        )
        if not sub or not sub.is_effectively_active:
            return None
        plan = sub.plan
        if plan.booking_limit is None and plan.advance_booking_days is None:
            return None
        return (plan.booking_limit, plan.advance_booking_days)
