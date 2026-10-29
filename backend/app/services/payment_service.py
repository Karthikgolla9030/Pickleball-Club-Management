"""
Aught2 Pickleball — Payment Service (Phase 13)

Business logic and validation for payments.
Enforces:
  - Tenant isolation (payments belong to exactly one club).
  - Cross-player and cross-club integrity:
      payment.player_id == subscription.player_membership.user_id
      payment.club_id == subscription.club_id
  - Controlled lifecycle state transitions.
  - Snapshotting payment amounts (historical immutability).
  - No gateway SDK dependencies or API calls in Phase 13.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.payment.gateway import get_payment_gateway
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club_player_membership import PlayerMembershipStatus
from app.models.court import CourtStatus
from app.models.membership import SubscriptionStatus
from app.models.payment import (
    Payment,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
)
from app.models.tournament import TournamentStatus
from app.repositories.booking_repository import BookingRepository
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.court_repository import CourtRepository
from app.repositories.event_repository import EventRepository
from app.repositories.league_repository import LeagueRepository
from app.repositories.lesson_repository import LessonRepository
from app.repositories.member_subscription_repository import MemberSubscriptionRepository
from app.repositories.membership_plan_repository import MembershipPlanRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.tournament_repository import TournamentRepository
from app.repositories.user_repository import UserRepository
from app.schemas.payment import (
    CheckoutInitiateRequest,
    CheckoutInitiateResponse,
    CheckoutPriceBreakdown,
    CheckoutVerifyRequest,
    CheckoutVerifyResponse,
    CreatePaymentRequest,
    PaymentResponse,
    PaymentSummaryResponse,
    PlayerPaymentResponse,
)

logger = logging.getLogger(__name__)


class PaymentService:
    """Service handling payment creation, status transitions, and queries."""

    # Valid lifecycle transitions for Phase 13
    ALLOWED_TRANSITIONS: dict[PaymentStatus, set[PaymentStatus]] = {
        PaymentStatus.PENDING: {
            PaymentStatus.PROCESSING,
            PaymentStatus.SUCCEEDED,
            PaymentStatus.FAILED,
            PaymentStatus.CANCELLED,
        },
        PaymentStatus.PROCESSING: {
            PaymentStatus.SUCCEEDED,
            PaymentStatus.FAILED,
            PaymentStatus.CANCELLED,
        },
        PaymentStatus.SUCCEEDED: {
            PaymentStatus.REFUNDED,
            PaymentStatus.PARTIALLY_REFUNDED,
        },
        PaymentStatus.FAILED: set(),      # Terminal
        PaymentStatus.CANCELLED: set(),   # Terminal
        PaymentStatus.REFUNDED: set(),    # Terminal
        PaymentStatus.PARTIALLY_REFUNDED: {
            PaymentStatus.REFUNDED,
        },
    }

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.club_repo = ClubRepository(db)
        self.subscription_repo = MemberSubscriptionRepository(db)
        self.user_repo = UserRepository(db)
        self.player_membership_repo = ClubPlayerMembershipRepository(db)
        self.court_repo = CourtRepository(db)
        self.booking_repo = BookingRepository(db)
        self.tournament_repo = TournamentRepository(db)
        self.event_repo = EventRepository(db)
        self.lesson_repo = LessonRepository(db)
        self.league_repo = LeagueRepository(db)
        self.plan_repo = MembershipPlanRepository(db)

    def validate_status_transition(
        self,
        current_status: PaymentStatus,
        target_status: PaymentStatus,
    ) -> None:
        """
        Enforce state machine rules. Raises HTTP 400 on illegal transitions.
        Arbitrary mutation via PATCH is strictly forbidden.
        """
        allowed = self.ALLOWED_TRANSITIONS.get(current_status, set())
        if target_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Invalid payment status transition from '{current_status.value}' "
                    f"to '{target_status.value}'"
                ),
            )

    async def create_membership_payment(
        self,
        club_id: UUID,
        payload: CreatePaymentRequest,
        created_by_user_id: UUID | None,
    ) -> PaymentResponse:
        """
        Create a new payment record for a membership subscription.
        Validates:
          - Club existence
          - Subscription existence and club match
          - Player existence, membership in club, and ownership of subscription
          - Amount > 0
          - Purpose == membership
        """
        # 1. Verify club exists
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        # 2. Phase 13 purpose check
        if payload.purpose != PaymentPurpose.MEMBERSHIP:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only 'membership' purpose is supported in Phase 13",
            )

        # 3. Membership payment requires subscription_id
        if not payload.subscription_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="subscription_id is required for membership payments",
            )

        # 4. Verify subscription exists in THIS club
        subscription = await self.subscription_repo.get_by_id(
            payload.subscription_id,
            club_id=club_id,
        )
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member subscription not found in this club",
            )

        # 5. Verify player exists
        player_user = await self.user_repo.get_by_id(payload.player_id)
        if not player_user or not player_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Player user not found or inactive",
            )

        # 6. Verify player owns this subscription
        if (
            not subscription.player_membership
            or subscription.player_membership.user_id != payload.player_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Subscription does not belong to the specified player",
            )

        # 7. Verify player belongs to club
        pm = await self.player_membership_repo.get_by_user_and_club(
            user_id=payload.player_id,
            club_id=club_id,
        )
        if not pm or pm.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Player is not an active member of this club",
            )

        # 8. Amount validation
        if payload.amount <= Decimal("0"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment amount must be greater than zero",
            )

        # 9. Generate deterministic unique reference
        reference = await self.payment_repo.generate_reference()

        # 10. Persist payment
        payment = Payment(
            reference=reference,
            club_id=club_id,
            player_id=payload.player_id,
            subscription_id=payload.subscription_id,
            amount=payload.amount,
            currency=payload.currency,
            status=PaymentStatus.PENDING,
            purpose=payload.purpose,
            payment_method=payload.payment_method,
            notes=payload.notes,
            created_by_user_id=created_by_user_id,
        )

        created_payment = await self.payment_repo.create(payment)
        # Fetch eager loaded instance
        full_payment = await self.payment_repo.get_by_id(created_payment.id, club_id=club_id)
        return PaymentResponse.from_orm_model(full_payment)

    async def mark_as_processing(
        self,
        club_id: UUID,
        payment_id: UUID,
        actor_id: UUID | None,
    ) -> PaymentResponse:
        """Transition payment from pending to processing."""
        payment = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found in this club",
            )

        self.validate_status_transition(payment.status, PaymentStatus.PROCESSING)

        payment.status = PaymentStatus.PROCESSING
        payment.status_changed_by_user_id = actor_id
        payment.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

        full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        return PaymentResponse.from_orm_model(full)

    async def mark_as_succeeded(
        self,
        club_id: UUID,
        payment_id: UUID,
        actor_id: UUID | None,
    ) -> PaymentResponse:
        """
        Transition payment to succeeded (e.g. for cash, bank_transfer, or confirmed online payment).
        Sets paid_at timestamp and records audit actor.
        """
        payment = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found in this club",
            )

        # Idempotent: If payment already succeeded, return cleanly without duplicate processing
        if payment.status == PaymentStatus.SUCCEEDED:
            full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
            return PaymentResponse.from_orm_model(full)

        self.validate_status_transition(payment.status, PaymentStatus.SUCCEEDED)

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.SUCCEEDED
        payment.paid_at = now
        payment.status_changed_by_user_id = actor_id
        payment.updated_at = now

        # If this payment is for a subscription, activate it and ensure player membership is active
        if payment.subscription_id:
            sub = await self.subscription_repo.get_by_id(payment.subscription_id, club_id=club_id)
            if sub:
                today = date.today()
                if sub.status == SubscriptionStatus.SCHEDULED and sub.start_date <= today <= sub.end_date:
                    sub.status = SubscriptionStatus.ACTIVE
                    sub.updated_at = now
                # Automatically ensure player's club membership is active
                if sub.player_membership_id:
                    pm = await self.player_membership_repo.get_by_id(sub.player_membership_id)
                    if pm and pm.status != PlayerMembershipStatus.ACTIVE:
                        pm.status = PlayerMembershipStatus.ACTIVE
                        if not pm.joined_at:
                            pm.joined_at = now
                        pm.updated_at = now
                await self.db.flush()
                try:
                    from app.core.events import EventType, dispatch_event
                    from app.services.notification_service import NotificationService
                    plan_name = sub.plan.name if sub.plan else "Membership Plan"
                    await dispatch_event(
                        event_type=EventType.PLAYER_MEMBERSHIP_UPDATED,
                        data={
                            "subscription_id": str(sub.id),
                            "club_id": str(club_id),
                            "user_id": str(payment.player_id),
                            "status": sub.status.value,
                            "plan_name": plan_name,
                        },
                        club_id=club_id,
                        user_id=payment.player_id,
                    )
                    notif_svc = NotificationService(self.db)
                    await notif_svc.create_notification(
                        user_id=payment.player_id,
                        club_id=club_id,
                        category="membership",
                        title="Payment Succeeded — Membership Active",
                        message=f"Payment for '{plan_name}' was received. Your subscription is now active!",
                        data={"subscription_id": str(sub.id), "payment_id": str(payment.id)},
                    )
                except Exception:
                    pass
        else:
            try:
                from app.services.notification_service import NotificationService
                notif_svc = NotificationService(self.db)
                curr_str = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
                await notif_svc.create_notification(
                    user_id=payment.player_id,
                    club_id=club_id,
                    category="payment",
                    title="Payment Succeeded",
                    message=f"Your payment of {curr_str} {payment.amount} has been successfully processed.",
                    data={
                        "resource_type": "payment",
                        "resource_id": str(payment.id),
                        "amount": float(payment.amount),
                        "idempotency_key": f"payment_succeeded_{payment.id}",
                    },
                    mandatory=True,
                )
            except Exception:
                pass

        await self.db.flush()

        full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        return PaymentResponse.from_orm_model(full)

    async def mark_as_failed(
        self,
        club_id: UUID,
        payment_id: UUID,
        actor_id: UUID | None,
        failure_reason: str,
    ) -> PaymentResponse:
        """
        Transition payment to failed.
        Preserves payment record for auditability, records failed_at and reason.
        """
        payment = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found in this club",
            )

        if payment.status == PaymentStatus.FAILED:
            full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
            return PaymentResponse.from_orm_model(full)

        self.validate_status_transition(payment.status, PaymentStatus.FAILED)

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.FAILED
        payment.failed_at = now
        payment.failure_reason = failure_reason
        payment.status_changed_by_user_id = actor_id
        payment.updated_at = now
        await self.db.flush()

        try:
            from app.services.notification_service import NotificationService
            notif_svc = NotificationService(self.db)
            curr_str = payment.currency.value if hasattr(payment.currency, "value") else str(payment.currency)
            await notif_svc.create_notification(
                user_id=payment.player_id,
                club_id=club_id,
                category="payment",
                title="Payment Failed",
                message=f"Payment for {curr_str} {payment.amount} failed. Reason: {failure_reason}",
                data={
                    "resource_type": "payment",
                    "resource_id": str(payment.id),
                    "failure_reason": failure_reason,
                    "idempotency_key": f"payment_failed_{payment.id}",
                },
                mandatory=True,
            )
        except Exception:
            pass

        full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        return PaymentResponse.from_orm_model(full)

    async def cancel_payment(
        self,
        club_id: UUID,
        payment_id: UUID,
        actor_id: UUID | None,
        cancellation_reason: str | None = None,
    ) -> PaymentResponse:
        """
        Cancel a pending or processing payment.
        Does NOT delete the record. Preserves audit history.
        """
        payment = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found in this club",
            )

        if payment.status == PaymentStatus.CANCELLED:
            full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
            return PaymentResponse.from_orm_model(full)

        self.validate_status_transition(payment.status, PaymentStatus.CANCELLED)

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.CANCELLED
        payment.cancelled_at = now
        payment.status_changed_by_user_id = actor_id
        payment.updated_at = now
        if cancellation_reason:
            if payment.notes:
                payment.notes = f"{payment.notes} | Cancellation: {cancellation_reason}"
            else:
                payment.notes = f"Cancellation: {cancellation_reason}"
        await self.db.flush()

        full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        return PaymentResponse.from_orm_model(full)

    async def refund_payment(
        self,
        club_id: UUID,
        payment_id: UUID,
        actor_id: UUID | None,
        amount: Decimal | None = None,
        refund_reason: str = "Refund requested",
    ) -> PaymentResponse:
        """
        Refund a succeeded payment (in full or partially).
        Updates refunded_amount, status, and audits timestamp and actor.
        """
        payment = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found in this club",
            )

        if payment.status not in (PaymentStatus.SUCCEEDED, PaymentStatus.PARTIALLY_REFUNDED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot refund a payment in '{payment.status.value}' status",
            )

        refund_amt = amount if amount is not None else payment.amount
        if refund_amt <= Decimal("0"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Refund amount must be greater than zero",
            )

        existing_refunded = payment.refunded_amount or Decimal("0.00")
        new_total_refunded = existing_refunded + refund_amt
        if new_total_refunded > payment.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total refunded ({new_total_refunded}) exceeds payment amount ({payment.amount})",
            )

        target_status = (
            PaymentStatus.REFUNDED
            if new_total_refunded == payment.amount
            else PaymentStatus.PARTIALLY_REFUNDED
        )

        now = datetime.now(timezone.utc)
        payment.status = target_status
        payment.refunded_amount = new_total_refunded
        payment.refund_reason = refund_reason
        payment.refunded_at = now
        payment.status_changed_by_user_id = actor_id
        payment.updated_at = now
        await self.db.flush()

        try:
            from app.services.notification_service import NotificationService
            notif_svc = NotificationService(self.db)
            await notif_svc.create_notification(
                user_id=payment.player_id,
                club_id=club_id,
                category="payment",
                title="Payment Refunded",
                message=f"Refund of {payment.currency} {refund_amt} processed for transaction {payment.reference}. Reason: {refund_reason}",
                data={
                    "payment_id": str(payment.id),
                    "refund_amount": float(refund_amt),
                    "reason": refund_reason,
                },
            )
        except Exception:
            pass

        full = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        return PaymentResponse.from_orm_model(full)

    async def record_service_payment(
        self,
        club_id: UUID,
        player_id: UUID,
        amount: Decimal,
        purpose: PaymentPurpose,
        currency: str = "USD",
        payment_method: PaymentMethod = PaymentMethod.ONLINE,
        status: PaymentStatus = PaymentStatus.SUCCEEDED,
        notes: str | None = None,
        booking_id: UUID | None = None,
        tournament_id: UUID | None = None,
        event_id: UUID | None = None,
        lesson_id: UUID | None = None,
        league_id: UUID | None = None,
        subscription_id: UUID | None = None,
        created_by_user_id: UUID | None = None,
    ) -> Payment:
        """
        Generic helper used by other service domains (court bookings, tournaments,
        events, lessons, leagues) to persist real canonical transactions in the payments ledger.
        """
        reference = await self.payment_repo.generate_reference()
        now = datetime.now(timezone.utc)
        payment = Payment(
            reference=reference,
            club_id=club_id,
            player_id=player_id,
            subscription_id=subscription_id,
            booking_id=booking_id,
            tournament_id=tournament_id,
            event_id=event_id,
            lesson_id=lesson_id,
            league_id=league_id,
            amount=amount,
            currency=currency,
            status=status,
            purpose=purpose,
            payment_method=payment_method,
            notes=notes,
            created_by_user_id=created_by_user_id or player_id,
            paid_at=now if status == PaymentStatus.SUCCEEDED else None,
        )
        return await self.payment_repo.create(payment)

    async def get_club_payment(
        self,
        club_id: UUID,
        payment_id: UUID,
    ) -> PaymentResponse:
        """Get staff payment detail, scoped to club."""
        payment = await self.payment_repo.get_by_id(payment_id, club_id=club_id)
        if not payment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found in this club",
            )
        return PaymentResponse.from_orm_model(payment)

    async def list_club_payments(
        self,
        club_id: UUID,
        status: PaymentStatus | None = None,
        purpose: PaymentPurpose | None = None,
        player_id: UUID | None = None,
        subscription_id: UUID | None = None,
        payment_method: PaymentMethod | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PaymentResponse]:
        """List payments for staff management with filters."""
        payments = await self.payment_repo.list_by_club(
            club_id=club_id,
            status=status,
            purpose=purpose,
            player_id=player_id,
            subscription_id=subscription_id,
            payment_method=payment_method,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )
        return [PaymentResponse.from_orm_model(p) for p in payments]

    async def get_payment_summary(self, club_id: UUID) -> PaymentSummaryResponse:
        """Return aggregated summary metrics for club payments."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )
        summary = await self.payment_repo.get_club_summary(club_id)
        return PaymentSummaryResponse(**summary)

    async def get_player_payment(
        self,
        user_id: UUID,
        payment_id: UUID,
    ) -> PlayerPaymentResponse:
        """Get payment detail for authenticated player (own payments only)."""
        payment = await self.payment_repo.get_by_id(payment_id)
        if not payment or payment.player_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Payment not found",
            )
        return PlayerPaymentResponse.from_orm_model(payment)

    async def list_player_payments(
        self,
        user_id: UUID,
        status: PaymentStatus | None = None,
        purpose: PaymentPurpose | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[PlayerPaymentResponse]:
        """List authenticated player's own payment history."""
        payments = await self.payment_repo.list_by_player(
            player_id=user_id,
            status=status,
            purpose=purpose,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            offset=offset,
        )
        return [PlayerPaymentResponse.from_orm_model(p) for p in payments]

    # ═══════════════════════════════════════════════════════════════════════════
    # UNIFIED CHECKOUT & PAYMENT PROVIDER INTEGRATION
    # ═══════════════════════════════════════════════════════════════════════════

    async def initiate_checkout(
        self,
        user_id: UUID,
        payload: CheckoutInitiateRequest,
    ) -> CheckoutInitiateResponse:
        """
        Initiate real-time checkout across any paid activity:
        Court booking, Tournament registration, Event, Lesson, League, Membership.
        """
        # 1. Verify club exists
        club = await self.club_repo.get_by_id(payload.club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        # 2. Verify user exists
        user = await self.user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User not found or inactive",
            )

        # 3. Check membership discount eligibility
        pm = await self.player_membership_repo.get_by_user_and_club(
            user_id=user_id, club_id=payload.club_id
        )
        is_club_member = pm is not None and pm.status == PlayerMembershipStatus.ACTIVE

        base_amount = Decimal("0.00")
        summary: dict[str, Any] = {
            "club_id": str(club.id),
            "club_name": club.name,
            "currency": payload.currency,
        }
        meta_dict: dict[str, Any] = {
            **(payload.metadata or {}),
            "club_id": str(payload.club_id),
            "purpose": payload.purpose.value,
            "user_id": str(user_id),
        }

        # Validate activity rules and pricing based on purpose
        if payload.purpose == PaymentPurpose.COURT_BOOKING:
            if not payload.activity_id:
                raise HTTPException(status_code=400, detail="activity_id (court_id) is required for court bookings")
            if not payload.start_at or not payload.end_at or payload.end_at <= payload.start_at:
                raise HTTPException(status_code=400, detail="Valid start_at and end_at are required for court bookings")

            court = await self.court_repo.get_by_id(payload.activity_id)
            if not court or court.club_id != payload.club_id:
                raise HTTPException(status_code=404, detail="Court not found in this club")
            if not court.is_active or court.status != CourtStatus.ACTIVE:
                raise HTTPException(status_code=400, detail="Court is currently unavailable for bookings")

            # Check double-booking conflicts
            conflicts = await self.booking_repo.find_conflicts(
                court_id=court.id,
                start_at=payload.start_at,
                end_at=payload.end_at,
            )
            if conflicts:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Court is already booked for this time slot")

            # Calculate price
            duration_minutes = int((payload.end_at - payload.start_at).total_seconds() / 60)
            hours = Decimal(duration_minutes) / Decimal(60)
            rate = Decimal(str(court.price_per_hour or "40.00"))
            base_amount = (hours * rate).quantize(Decimal("0.01"))

            summary.update({
                "title": f"Court: {court.name}",
                "activity_name": court.name,
                "court_id": str(court.id),
                "start_at": payload.start_at.isoformat(),
                "end_at": payload.end_at.isoformat(),
                "duration_minutes": duration_minutes,
                "hourly_rate": float(rate),
            })
            incoming_meta = payload.metadata or {}
            meta_dict.update({
                "court_id": str(court.id),
                "start_at": payload.start_at.isoformat(),
                "end_at": payload.end_at.isoformat(),
                "hourly_rate": float(rate),
                "notes": incoming_meta.get("notes") or payload.notes,
                "staff_booking": bool(incoming_meta.get("staff_booking", False)),
                "player_id": incoming_meta.get("player_id"),
                "guest_name": incoming_meta.get("guest_name"),
            })

        elif payload.purpose == PaymentPurpose.TOURNAMENT:
            if not payload.activity_id:
                raise HTTPException(status_code=400, detail="activity_id (tournament_id) is required for tournament registration")
            tournament = await self.tournament_repo.get_by_id(payload.activity_id)
            if not tournament or tournament.club_id != payload.club_id:
                raise HTTPException(status_code=404, detail="Tournament not found in this club")
            if tournament.status != TournamentStatus.REGISTRATION_OPEN:
                raise HTTPException(status_code=400, detail=f"Tournament registration is {tournament.status.value}")

            format_config = tournament.format_configuration or {}
            fee_raw = format_config.get("entry_fee") or format_config.get("registration_fee") or 35.00
            base_amount = Decimal(str(fee_raw)).quantize(Decimal("0.01"))

            summary.update({
                "title": f"Tournament: {tournament.name}",
                "activity_name": tournament.name,
                "tournament_id": str(tournament.id),
                "format": tournament.format.value,
                "category": format_config.get("category", "Open"),
            })
            meta_dict.update({
                "tournament_id": str(tournament.id),
                "partner_name": payload.metadata.get("partner_name") if payload.metadata else None,
                "team_name": payload.metadata.get("team_name") if payload.metadata else None,
                "skill_level": payload.metadata.get("skill_level") if payload.metadata else None,
                "notes": payload.notes,
            })

        elif payload.purpose == PaymentPurpose.EVENT:
            if not payload.activity_id:
                raise HTTPException(status_code=400, detail="activity_id (event_id) is required for event registration")
            event = await self.event_repo.get_by_id(payload.activity_id, club_id=payload.club_id)
            if not event:
                raise HTTPException(status_code=404, detail="Event not found in this club")
            fee_raw = (
                getattr(event, "registration_fee", None)
                or getattr(event, "price", None)
                or getattr(event, "fee", None)
                or Decimal("25.00")
            )
            base_amount = Decimal(str(fee_raw)).quantize(Decimal("0.01"))

            summary.update({
                "title": f"Event: {event.title}",
                "activity_name": event.title,
                "event_id": str(event.id),
                "event_type": event.event_type.value if hasattr(event.event_type, "value") else str(event.event_type),
            })
            meta_dict.update({
                "event_id": str(event.id),
                "notes": payload.notes,
            })

        elif payload.purpose == PaymentPurpose.LESSON:
            if not payload.activity_id:
                raise HTTPException(status_code=400, detail="activity_id (lesson_id) is required for lesson booking")
            lesson = await self.lesson_repo.get_by_id(payload.activity_id, club_id=payload.club_id)
            if not lesson:
                raise HTTPException(status_code=404, detail="Lesson not found in this club")
            fee_raw = getattr(lesson, "price", None) or Decimal("50.00")
            base_amount = Decimal(str(fee_raw)).quantize(Decimal("0.01"))

            summary.update({
                "title": f"Lesson: {lesson.title}",
                "activity_name": lesson.title,
                "lesson_id": str(lesson.id),
                "coach": getattr(lesson, "coach_name", "Head Coach"),
            })
            meta_dict.update({
                "lesson_id": str(lesson.id),
                "notes": payload.notes,
            })

        elif payload.purpose == PaymentPurpose.LEAGUE:
            if not payload.activity_id:
                raise HTTPException(status_code=400, detail="activity_id (league_id) is required for league registration")
            league = await self.league_repo.get_by_id(payload.activity_id, club_id=payload.club_id)
            if not league:
                raise HTTPException(status_code=404, detail="League not found in this club")
            fee_raw = getattr(league, "registration_fee", None) or Decimal("40.00")
            base_amount = Decimal(str(fee_raw)).quantize(Decimal("0.01"))

            summary.update({
                "title": f"League: {league.name}",
                "activity_name": league.name,
                "league_id": str(league.id),
            })
            meta_dict.update({
                "league_id": str(league.id),
                "notes": payload.notes,
            })

        elif payload.purpose == PaymentPurpose.MEMBERSHIP:
            if not payload.activity_id:
                raise HTTPException(status_code=400, detail="activity_id (plan_id or subscription_id) is required")
            plan = await self.plan_repo.get_by_id(payload.activity_id, club_id=payload.club_id)
            if not plan:
                sub = await self.subscription_repo.get_by_id(payload.activity_id, club_id=payload.club_id)
                if sub and sub.plan:
                    plan = sub.plan
                    meta_dict["subscription_id"] = str(sub.id)
            if not plan:
                raise HTTPException(status_code=404, detail="Membership plan not found in this club")

            base_amount = Decimal(str(plan.price)).quantize(Decimal("0.01"))
            interval_val = getattr(plan, "duration_unit", None) or getattr(plan, "interval", None) or "yearly"
            interval_str = interval_val.value if hasattr(interval_val, "value") else str(interval_val)
            summary.update({
                "title": f"Membership: {plan.name}",
                "activity_name": plan.name,
                "plan_id": str(plan.id),
                "interval": interval_str,
            })
            meta_dict.update({
                "plan_id": str(plan.id),
                "notes": payload.notes,
            })

        # Calculate member discount (10% off for verified club members on courts & events)
        discount_amount = Decimal("0.00")
        if is_club_member and payload.purpose in (PaymentPurpose.COURT_BOOKING, PaymentPurpose.EVENT):
            discount_amount = (base_amount * Decimal("0.10")).quantize(Decimal("0.01"))

        # Calculate standard tax (5% GST / Sales Tax)
        taxable_amount = max(Decimal("0.00"), base_amount - discount_amount)
        tax_amount = (taxable_amount * Decimal("0.05")).quantize(Decimal("0.01"))

        # Service fee: $0.00
        service_fee = Decimal("0.00")

        final_amount = max(Decimal("0.00"), base_amount - discount_amount + tax_amount + service_fee)

        breakdown = CheckoutPriceBreakdown(
            base_amount=base_amount,
            discount_amount=discount_amount,
            tax_amount=tax_amount,
            service_fee=service_fee,
            final_amount=final_amount,
            currency=payload.currency,
        )

        reference = await self.payment_repo.generate_reference()

        # Handle zero-dollar or free activity
        if final_amount <= Decimal("0.00"):
            payment = Payment(
                reference=reference,
                club_id=payload.club_id,
                player_id=user_id,
                amount=Decimal("0.00"),
                currency=payload.currency,
                status=PaymentStatus.SUCCEEDED,
                purpose=payload.purpose,
                payment_method=PaymentMethod.OTHER,
                paid_at=datetime.now(timezone.utc),
                notes=f"[META]{json.dumps(meta_dict)}",
                created_by_user_id=user_id,
            )
            created_pay = await self.payment_repo.create(payment)
            await self.db.commit()

            return CheckoutInitiateResponse(
                payment_id=created_pay.id,
                reference=created_pay.reference,
                status=PaymentStatus.SUCCEEDED,
                breakdown=breakdown,
                provider="free",
                provider_order_id="free_complimentary",
                provider_key_id=None,
                supported_methods=["free"],
                selected_method="free",
                payment_methods=None,
                activity_summary=summary,
                is_free=True,
            )

        # Get configured payment gateway (Cashfree, Razorpay, or Stripe)
        prov_request = payload.metadata.get("provider") if payload.metadata else None
        gateway = get_payment_gateway(prov_request)

        # Selected payment method from payload or metadata (defaults to upi)
        selected_method = (
            payload.selected_method
            or (payload.metadata.get("selected_method") if payload.metadata else None)
            or ("cash" if payload.payment_method == PaymentMethod.CASH else "upi")
        )

        # Standardize on USD across all checkout calculations
        target_currency = (payload.currency or "USD").upper()
        if gateway.name == "cashfree" and getattr(gateway, "_has_live_credentials", False):
            target_currency = "INR"

        breakdown.currency = target_currency
        summary["currency"] = target_currency

        customer_details = {
            "customer_id": str(user_id),
            "customer_name": user.full_name or "Player",
            "customer_email": user.email or "player@example.com",
            "customer_phone": getattr(user, "phone", None) or "9999999999",
        }

        order_res = gateway.create_order(
            amount=final_amount,
            currency=target_currency,
            receipt=reference,
            customer_details=customer_details,
            notes={
                "user_id": str(user_id),
                "club_id": str(payload.club_id),
                "purpose": payload.purpose.value,
                "selected_method": selected_method,
            },
        )

        meta_dict["selected_method"] = selected_method

        payment = Payment(
            reference=reference,
            club_id=payload.club_id,
            player_id=user_id,
            amount=final_amount,
            currency=order_res.currency or target_currency,
            status=PaymentStatus.PENDING,
            purpose=payload.purpose,
            payment_method=payload.payment_method,
            provider=order_res.provider,
            provider_order_id=order_res.order_id,
            notes=f"[META]{json.dumps(meta_dict)}",
            created_by_user_id=user_id,
        )

        if payload.purpose == PaymentPurpose.TOURNAMENT:
            payment.tournament_id = payload.activity_id
        elif payload.purpose == PaymentPurpose.EVENT:
            payment.event_id = payload.activity_id
        elif payload.purpose == PaymentPurpose.LESSON:
            payment.lesson_id = payload.activity_id
        elif payload.purpose == PaymentPurpose.LEAGUE:
            payment.league_id = payload.activity_id
        elif payload.purpose == PaymentPurpose.MEMBERSHIP and "subscription_id" in meta_dict:
            payment.subscription_id = UUID(meta_dict["subscription_id"])

        created_pay = await self.payment_repo.create(payment)
        await self.db.commit()

        cf_methods = (order_res.notes or {}).get("payment_methods", "upi,cc,dc,nb")

        return CheckoutInitiateResponse(
            payment_id=created_pay.id,
            reference=created_pay.reference,
            status=PaymentStatus.PENDING,
            breakdown=breakdown,
            provider=order_res.provider,
            provider_order_id=order_res.order_id,
            provider_key_id=order_res.key_id,
            payment_session_id=order_res.payment_session_id,
            supported_methods=["upi", "card", "netbanking", "cash"],
            selected_method=selected_method,
            payment_methods=cf_methods,
            activity_summary=summary,
            is_free=False,
        )

    async def verify_checkout(
        self,
        user_id: UUID,
        payload: CheckoutVerifyRequest,
    ) -> CheckoutVerifyResponse:
        """
        Verify payment signature or order status, update transaction state to SUCCEEDED,
        and fulfill activity registration / booking atomically.
        """
        payment = await self.payment_repo.get_by_id(payload.payment_id)
        if not payment:
            raise HTTPException(status_code=404, detail="Payment record not found")
        if payment.player_id != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized: Payment belongs to another player")

        # Idempotent response if already confirmed
        if payment.status == PaymentStatus.SUCCEEDED:
            full = await self.payment_repo.get_by_id(payment.id)
            return CheckoutVerifyResponse(
                success=True,
                payment=PlayerPaymentResponse.from_orm_model(full),
                message="Payment already verified and confirmed.",
                booking_or_registration={"reference": payment.reference, "status": "confirmed"},
            )

        gateway = get_payment_gateway(payload.provider)
        provider_name = (payload.provider or "").lower()

        if provider_name == "cashfree":
            # Direct server-to-server verification with Cashfree Sandbox API
            valid, cf_pay_id, failure_reason, cf_status = gateway.verify_order_status(
                order_id=payload.provider_order_id,
                expected_amount=payment.amount,
                expected_currency=payment.currency,
            )
            if not valid:
                if cf_status in ("ACTIVE", "PENDING"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Payment is still pending on Cashfree. Please complete checkout before verifying.",
                    )
                payment.status = PaymentStatus.FAILED
                payment.failed_at = datetime.now(timezone.utc)
                payment.failure_reason = failure_reason or f"Cashfree verification failed ({cf_status})"
                await self.db.commit()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cashfree payment verification failed: {failure_reason or cf_status}",
                )
            if cf_pay_id:
                payload.provider_payment_id = cf_pay_id
        else:
            # Cryptographic signature verification for Razorpay/Stripe
            valid = gateway.verify_payment_signature(
                payment_id=payload.provider_payment_id or "",
                order_id=payload.provider_order_id,
                signature=payload.provider_signature or "",
            )
            if not valid:
                payment.status = PaymentStatus.FAILED
                payment.failed_at = datetime.now(timezone.utc)
                payment.failure_reason = "Cryptographic signature verification failed"
                await self.db.commit()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Payment signature verification failed. Transaction was not confirmed.",
                )

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.SUCCEEDED
        payment.paid_at = now
        payment.provider_payment_id = payload.provider_payment_id
        payment.updated_at = now

        # Parse metadata
        meta: dict[str, Any] = {}
        if payment.notes and "[META]" in payment.notes:
            try:
                meta_str = payment.notes.split("[META]", 1)[1]
                meta = json.loads(meta_str)
            except Exception:
                meta = {}

        booking_or_reg: dict[str, Any] = {
            "payment_reference": payment.reference,
            "status": "confirmed",
            "paid_at": now.isoformat(),
        }

        # Activity Fulfillment
        if payment.purpose == PaymentPurpose.COURT_BOOKING:
            court_id = UUID(meta["court_id"]) if "court_id" in meta else None
            start_dt = datetime.fromisoformat(meta["start_at"]) if "start_at" in meta else None
            end_dt = datetime.fromisoformat(meta["end_at"]) if "end_at" in meta else None

            if court_id and start_dt and end_dt:
                conflicts = await self.booking_repo.find_conflicts(
                    court_id=court_id,
                    start_at=start_dt,
                    end_at=end_dt,
                )
                if conflicts:
                    payment.status = PaymentStatus.REFUNDED
                    payment.refund_reason = "Court slot was taken during checkout. Automatic refund initiated."
                    payment.refunded_at = now
                    payment.refunded_amount = payment.amount
                    await self.db.commit()
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Selected court slot is no longer available. A full refund has been initiated.",
                    )

                is_staff_booking = bool(meta.get("staff_booking", False))
                target_player_id = None
                if meta.get("player_id"):
                    try:
                        target_player_id = UUID(str(meta["player_id"]))
                    except Exception:
                        target_player_id = None
                elif not is_staff_booking:
                    target_player_id = payment.player_id

                booking_type = BookingType.STAFF if is_staff_booking else BookingType.PLAYER
                booking_notes = meta.get("notes")
                if is_staff_booking and meta.get("guest_name"):
                    prefix = f"Walk-in Guest: {meta['guest_name']}"
                    booking_notes = f"{prefix}\n{booking_notes}" if booking_notes else prefix

                raw_player_count = meta.get("player_count")
                parsed_player_count = int(raw_player_count) if raw_player_count is not None and str(raw_player_count).isdigit() else None

                booking = await self.booking_repo.create(
                    club_id=payment.club_id,
                    court_id=court_id,
                    player_id=target_player_id,
                    created_by_user_id=user_id,
                    booking_type=booking_type,
                    start_at=start_dt,
                    end_at=end_dt,
                    status=BookingStatus.CONFIRMED,
                    notes=booking_notes,
                    price_per_hour=Decimal(str(meta.get("hourly_rate", "40.00"))),
                    total_price=payment.amount,
                    currency=payment.currency,
                    player_count=parsed_player_count,
                )
                payment.booking_id = booking.id
                booking_or_reg.update({
                    "booking_id": str(booking.id),
                    "court_name": booking.court.name if booking.court else "Court",
                    "start_at": booking.start_at.isoformat(),
                    "end_at": booking.end_at.isoformat(),
                })

        elif payment.purpose == PaymentPurpose.TOURNAMENT:
            tournament_id = payment.tournament_id or (UUID(meta["tournament_id"]) if "tournament_id" in meta else None)
            if tournament_id:
                try:
                    from app.services.tournament_service import TournamentService
                    from app.schemas.tournament import PlayerSelfRegistrationRequest
                    t_payload = PlayerSelfRegistrationRequest(
                        partner_name=meta.get("partner_name"),
                        team_name=meta.get("team_name"),
                        skill_level=meta.get("skill_level"),
                        notes=meta.get("notes"),
                        payment_method="online",
                    )
                    t_res = await TournamentService(self.db).register_player(
                        tournament_id=tournament_id,
                        user_id=payment.player_id,
                        payload=t_payload,
                    )
                    booking_or_reg.update({
                        "tournament_id": str(tournament_id),
                        "reference_number": t_res.reference_number,
                        "status": t_res.status.value,
                    })
                except Exception as e:
                    logger.warning(f"Tournament auto-registration fulfillment: {e}")
                    booking_or_reg["tournament_id"] = str(tournament_id)

        elif payment.purpose == PaymentPurpose.EVENT:
            event_id = payment.event_id or (UUID(meta["event_id"]) if "event_id" in meta else None)
            if event_id:
                try:
                    from app.services.event_service import EventService
                    e_res = await EventService(self.db).register_player(
                        event_id=event_id,
                        user_id=payment.player_id,
                        notes=meta.get("notes"),
                    )
                    booking_or_reg.update({
                        "event_id": str(event_id),
                        "registration_id": str(e_res.id),
                        "status": e_res.status.value,
                    })
                except Exception as e:
                    logger.warning(f"Event auto-registration fulfillment: {e}")
                    booking_or_reg["event_id"] = str(event_id)

        elif payment.purpose == PaymentPurpose.LESSON:
            lesson_id = payment.lesson_id or (UUID(meta["lesson_id"]) if "lesson_id" in meta else None)
            if lesson_id:
                try:
                    from app.services.lesson_service import LessonService
                    l_res = await LessonService(self.db).register_player(
                        lesson_id=lesson_id,
                        user_id=payment.player_id,
                        notes=meta.get("notes"),
                    )
                    booking_or_reg.update({
                        "lesson_id": str(lesson_id),
                        "registration_id": str(l_res.id),
                        "status": l_res.status.value,
                    })
                except Exception as e:
                    logger.warning(f"Lesson auto-registration fulfillment: {e}")
                    booking_or_reg["lesson_id"] = str(lesson_id)

        elif payment.purpose == PaymentPurpose.LEAGUE:
            league_id = payment.league_id or (UUID(meta["league_id"]) if "league_id" in meta else None)
            if league_id:
                booking_or_reg["league_id"] = str(league_id)

        elif payment.purpose == PaymentPurpose.MEMBERSHIP:
            plan_id = UUID(meta["plan_id"]) if "plan_id" in meta else None
            if plan_id:
                try:
                    from app.services.member_subscription_service import MemberSubscriptionService
                    from app.schemas.membership import MemberSubscriptionCreateRequest
                    sub_svc = MemberSubscriptionService(self.db)
                    sub_res = await sub_svc.create_subscription(
                        club_id=payment.club_id,
                        payload=MemberSubscriptionCreateRequest(
                            user_id=payment.player_id,
                            plan_id=plan_id,
                            start_date=date.today(),
                            is_auto_renew=True,
                        ),
                        actor_id=payment.player_id,
                    )
                    payment.subscription_id = sub_res.id
                    booking_or_reg.update({
                        "subscription_id": str(sub_res.id),
                        "plan_name": sub_res.plan_name,
                        "status": sub_res.status.value,
                    })
                except Exception as e:
                    logger.warning(f"Subscription fulfillment: {e}")

        # Send in-app notification
        try:
            from app.services.notification_service import NotificationService
            notif_svc = NotificationService(self.db)
            await notif_svc.create_notification(
                user_id=payment.player_id,
                club_id=payment.club_id,
                category="payment",
                title="Payment Confirmed!",
                message=f"Your payment of {payment.currency} {payment.amount} (Ref: {payment.reference}) has been confirmed.",
                data={
                    "payment_id": str(payment.id),
                    "reference": payment.reference,
                    "purpose": payment.purpose.value,
                    "amount": float(payment.amount),
                },
                mandatory=True,
            )
        except Exception:
            pass

        await self.db.commit()

        full = await self.payment_repo.get_by_id(payment.id)
        return CheckoutVerifyResponse(
            success=True,
            payment=PlayerPaymentResponse.from_orm_model(full),
            message="Payment successfully verified and booking confirmed.",
            booking_or_registration=booking_or_reg,
        )

    async def process_webhook(
        self,
        provider: str,
        payload_bytes: bytes,
        signature_header: str,
        timestamp_header: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Process incoming payment webhooks from Cashfree, Razorpay, or Stripe idempotently.
        """
        gateway = get_payment_gateway(provider)
        if not gateway.verify_webhook_signature(payload_bytes, signature_header, timestamp_header=timestamp_header):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

        try:
            data = json.loads(payload_bytes.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        event_type = data.get("event") or data.get("type")
        provider_order_id = None
        provider_payment_id = None
        is_success = False
        is_failure = False

        prov_lower = provider.lower()
        if prov_lower == "cashfree":
            cf_data = data.get("data", {})
            cf_order = cf_data.get("order", {})
            cf_payment = cf_data.get("payment", {})
            provider_order_id = cf_order.get("order_id") or data.get("order_id")
            provider_payment_id = str(cf_payment.get("cf_payment_id") or cf_payment.get("payment_id") or "")
            cf_status = (cf_payment.get("payment_status") or "").upper()

            if event_type in ("PAYMENT_SUCCESS_WEBHOOK", "ORDER_PAID") or cf_status == "SUCCESS":
                is_success = True
            elif event_type in ("PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK") or cf_status in ("FAILED", "CANCELLED", "USER_DROPPED"):
                is_failure = True

        elif prov_lower == "razorpay":
            payload_data = data.get("payload", {})
            payment_entity = payload_data.get("payment", {}).get("entity", {})
            provider_payment_id = payment_entity.get("id")
            provider_order_id = payment_entity.get("order_id")
            if event_type in ("payment.captured", "order.paid"):
                is_success = True
            elif event_type == "payment.failed":
                is_failure = True

        elif prov_lower == "stripe":
            obj = data.get("data", {}).get("object", {})
            provider_order_id = obj.get("id")
            provider_payment_id = obj.get("latest_charge")
            if event_type in ("payment_intent.succeeded",):
                is_success = True
            elif event_type in ("payment_intent.payment_failed",):
                is_failure = True

        if provider_order_id:
            payment = await self.payment_repo.get_by_provider_order_id(provider_order_id)
            if payment and payment.status != PaymentStatus.SUCCEEDED:
                if is_success:
                    now = datetime.now(timezone.utc)
                    payment.status = PaymentStatus.SUCCEEDED
                    payment.paid_at = now
                    if provider_payment_id:
                        payment.provider_payment_id = provider_payment_id

                    # Parse metadata to fulfill booking if user disconnected before verification
                    meta: dict[str, Any] = {}
                    if payment.notes and "[META]" in payment.notes:
                        try:
                            meta = json.loads(payment.notes.split("[META]", 1)[1])
                        except Exception:
                            meta = {}
                    reg_dict: dict[str, Any] = {}
                    if payment.purpose == PaymentPurpose.COURT_BOOKING and not payment.booking_id:
                        court_id = UUID(meta["court_id"]) if "court_id" in meta else None
                        start_dt = datetime.fromisoformat(meta["start_at"]) if "start_at" in meta else None
                        end_dt = datetime.fromisoformat(meta["end_at"]) if "end_at" in meta else None
                        if court_id and start_dt and end_dt:
                            conflicts = await self.booking_repo.find_conflicts(court_id=court_id, start_at=start_dt, end_at=end_dt)
                            if not conflicts:
                                is_staff_booking = bool(meta.get("staff_booking", False))
                                target_player_id = None
                                if meta.get("player_id"):
                                    try:
                                        target_player_id = UUID(str(meta["player_id"]))
                                    except Exception:
                                        target_player_id = None
                                elif not is_staff_booking:
                                    target_player_id = payment.player_id

                                booking_type = BookingType.STAFF if is_staff_booking else BookingType.PLAYER
                                booking_notes = meta.get("notes")
                                if is_staff_booking and meta.get("guest_name"):
                                    prefix = f"Walk-in Guest: {meta['guest_name']}"
                                    booking_notes = f"{prefix}\n{booking_notes}" if booking_notes else prefix

                                raw_player_count = meta.get("player_count")
                                parsed_player_count = int(raw_player_count) if raw_player_count is not None and str(raw_player_count).isdigit() else None

                                booking = await self.booking_repo.create(
                                    club_id=payment.club_id,
                                    court_id=court_id,
                                    player_id=target_player_id,
                                    created_by_user_id=payment.player_id,
                                    booking_type=booking_type,
                                    start_at=start_dt,
                                    end_at=end_dt,
                                    status=BookingStatus.CONFIRMED,
                                    notes=booking_notes,
                                    price_per_hour=Decimal(str(meta.get("hourly_rate", "40.00"))),
                                    total_price=payment.amount,
                                    currency=payment.currency,
                                    player_count=parsed_player_count,
                                )
                                payment.booking_id = booking.id

                    await self.db.commit()

                elif is_failure:
                    payment.status = PaymentStatus.FAILED
                    payment.failed_at = datetime.now(timezone.utc)
                    payment.failure_reason = f"Provider webhook reported {event_type}"
                    await self.db.commit()

        return {"status": "processed", "event": event_type}

