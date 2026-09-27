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

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_player_membership import PlayerMembershipStatus
from app.models.payment import (
    Payment,
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
)
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.member_subscription_repository import MemberSubscriptionRepository
from app.repositories.payment_repository import PaymentRepository
from app.repositories.user_repository import UserRepository
from app.schemas.payment import (
    CreatePaymentRequest,
    PaymentResponse,
    PaymentSummaryResponse,
    PlayerPaymentResponse,
)


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
        PaymentStatus.SUCCEEDED: set(),   # Terminal
        PaymentStatus.FAILED: set(),      # Terminal
        PaymentStatus.CANCELLED: set(),   # Terminal
        PaymentStatus.REFUNDED: set(),    # Terminal (future)
        PaymentStatus.PARTIALLY_REFUNDED: set(),  # Terminal (future)
    }

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.payment_repo = PaymentRepository(db)
        self.club_repo = ClubRepository(db)
        self.subscription_repo = MemberSubscriptionRepository(db)
        self.user_repo = UserRepository(db)
        self.player_membership_repo = ClubPlayerMembershipRepository(db)

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

        self.validate_status_transition(payment.status, PaymentStatus.SUCCEEDED)

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.SUCCEEDED
        payment.paid_at = now
        payment.status_changed_by_user_id = actor_id
        payment.updated_at = now
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

        self.validate_status_transition(payment.status, PaymentStatus.FAILED)

        now = datetime.now(timezone.utc)
        payment.status = PaymentStatus.FAILED
        payment.failed_at = now
        payment.failure_reason = failure_reason
        payment.status_changed_by_user_id = actor_id
        payment.updated_at = now
        await self.db.flush()

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
