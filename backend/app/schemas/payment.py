"""
Aught2 Pickleball — Payment Schemas (Phase 13)

Pydantic v2 schemas for payments.
Supports:
  - CreatePaymentRequest: administrative payment creation
  - PaymentResponse: staff view (full auditing and metadata)
  - PlayerPaymentResponse: player view (hiding internal administrative metadata)
  - PaymentSummaryResponse: club metrics
  - PaymentFailRequest, PaymentCancelRequest: controlled state transitions
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.payment import (
    PaymentMethod,
    PaymentPurpose,
    PaymentStatus,
)


# ─── Embedded Info ────────────────────────────────────────────────────────────

class PaymentPlayerEmbeddedInfo(BaseModel):
    id: UUID
    email: str
    full_name: str | None = None

    model_config = {"from_attributes": True}


class PaymentSubscriptionEmbeddedInfo(BaseModel):
    id: UUID
    plan_name: str | None = None

    model_config = {"from_attributes": True}


# ─── Request Payloads ─────────────────────────────────────────────────────────

class CreatePaymentRequest(BaseModel):
    player_id: UUID = Field(..., description="ID of the user receiving the service/membership")
    subscription_id: UUID | None = Field(default=None, description="ID of member subscription (if membership)")
    booking_id: UUID | None = Field(default=None, description="ID of court booking (if booking)")
    tournament_id: UUID | None = Field(default=None, description="ID of tournament (if tournament)")
    event_id: UUID | None = Field(default=None, description="ID of event (if event)")
    lesson_id: UUID | None = Field(default=None, description="ID of lesson (if lesson)")
    league_id: UUID | None = Field(default=None, description="ID of league (if league)")
    amount: Decimal = Field(..., gt=0, decimal_places=2, description="Payment amount (> 0)")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    payment_method: PaymentMethod = Field(..., description="Payment method: cash, bank_transfer, online, other")
    purpose: PaymentPurpose = Field(default=PaymentPurpose.MEMBERSHIP, description="Payment purpose")
    notes: str | None = Field(default=None, max_length=1000, description="Optional notes")

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, v: str) -> str:
        return v.strip().upper()


class PaymentFailRequest(BaseModel):
    failure_reason: str = Field(..., min_length=1, max_length=500, description="Reason for failure")


class PaymentCancelRequest(BaseModel):
    cancellation_reason: str | None = Field(default=None, max_length=500, description="Optional cancellation reason")


class PaymentRefundRequest(BaseModel):
    amount: Decimal | None = Field(default=None, gt=0, description="Amount to refund (defaults to full payment amount)")
    refund_reason: str = Field(..., min_length=1, max_length=500, description="Reason for refund")


# ─── Response Payloads ────────────────────────────────────────────────────────

class PaymentResponse(BaseModel):
    """
    Staff-facing detailed payment response.
    Includes full auditing, references, and administrative metadata.
    """
    id: UUID
    reference: str
    club_id: UUID
    player_id: UUID
    subscription_id: UUID | None = None
    booking_id: UUID | None = None
    tournament_id: UUID | None = None
    event_id: UUID | None = None
    lesson_id: UUID | None = None
    league_id: UUID | None = None
    service_name: str | None = None
    amount: Decimal
    currency: str
    status: PaymentStatus
    status_label: str
    purpose: PaymentPurpose
    purpose_label: str
    payment_method: PaymentMethod
    payment_method_label: str
    provider: str | None = None
    provider_payment_id: str | None = None
    provider_order_id: str | None = None
    notes: str | None = None
    failure_reason: str | None = None
    refunded_amount: Decimal | None = None
    refund_reason: str | None = None
    refunded_at: datetime | None = None
    created_by_user_id: UUID | None = None
    status_changed_by_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    paid_at: datetime | None = None
    failed_at: datetime | None = None
    cancelled_at: datetime | None = None
    player: PaymentPlayerEmbeddedInfo | None = None
    subscription: PaymentSubscriptionEmbeddedInfo | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, payment) -> "PaymentResponse":
        player_info = None
        if payment.player:
            try:
                player_info = PaymentPlayerEmbeddedInfo(
                    id=payment.player.id,
                    email=payment.player.email,
                    full_name=payment.player.full_name,
                )
            except Exception:
                player_info = None

        sub_info = None
        service_title = None
        if payment.subscription:
            try:
                plan = getattr(payment.subscription, "plan", None)
                plan_name = plan.name if plan else None
            except Exception:
                plan_name = None
            try:
                sub_info = PaymentSubscriptionEmbeddedInfo(
                    id=payment.subscription.id,
                    plan_name=plan_name,
                )
                service_title = plan_name
            except Exception:
                sub_info = None

        if not service_title:
            try:
                if payment.booking and getattr(payment.booking, "court", None):
                    service_title = f"Court: {payment.booking.court.name}"
                elif payment.tournament:
                    service_title = f"Tournament: {payment.tournament.name}"
                elif payment.event:
                    service_title = f"Event: {payment.event.title}"
                elif payment.lesson:
                    service_title = f"Lesson: {payment.lesson.title}"
                elif payment.league:
                    service_title = f"League: {payment.league.name}"
            except Exception:
                pass

        if not service_title and payment.notes:
            service_title = payment.notes

        return cls(
            id=payment.id,
            reference=payment.reference,
            club_id=payment.club_id,
            player_id=payment.player_id,
            subscription_id=payment.subscription_id,
            booking_id=payment.booking_id,
            tournament_id=payment.tournament_id,
            event_id=payment.event_id,
            lesson_id=payment.lesson_id,
            league_id=payment.league_id,
            service_name=service_title,
            amount=payment.amount,
            currency=payment.currency,
            status=payment.status,
            status_label=payment.status.display_label,
            purpose=payment.purpose,
            purpose_label=payment.purpose.display_label,
            payment_method=payment.payment_method,
            payment_method_label=payment.payment_method.display_label,
            provider=payment.provider,
            provider_payment_id=payment.provider_payment_id,
            provider_order_id=payment.provider_order_id,
            notes=payment.notes,
            failure_reason=payment.failure_reason,
            refunded_amount=payment.refunded_amount,
            refund_reason=payment.refund_reason,
            refunded_at=payment.refunded_at,
            created_by_user_id=payment.created_by_user_id,
            status_changed_by_user_id=payment.status_changed_by_user_id,
            created_at=payment.created_at,
            updated_at=payment.updated_at,
            paid_at=payment.paid_at,
            failed_at=payment.failed_at,
            cancelled_at=payment.cancelled_at,
            player=player_info,
            subscription=sub_info,
        )


class PlayerPaymentResponse(BaseModel):
    """
    Player-facing read-only payment response.
    Hides sensitive internal administrative/provider details.
    """
    id: UUID
    reference: str
    club_id: UUID
    club_name: str | None = None
    subscription_id: UUID | None = None
    booking_id: UUID | None = None
    tournament_id: UUID | None = None
    event_id: UUID | None = None
    lesson_id: UUID | None = None
    league_id: UUID | None = None
    service_name: str | None = None
    amount: Decimal
    currency: str
    status: PaymentStatus
    status_label: str
    purpose: PaymentPurpose
    purpose_label: str
    payment_method: PaymentMethod
    payment_method_label: str
    refunded_amount: Decimal | None = None
    refund_reason: str | None = None
    refunded_at: datetime | None = None
    created_at: datetime
    paid_at: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, payment) -> "PlayerPaymentResponse":
        try:
            club_name = payment.club.name if payment.club else None
        except Exception:
            club_name = None

        service_title = None
        try:
            if payment.subscription and getattr(payment.subscription, "plan", None):
                service_title = payment.subscription.plan.name
            elif payment.booking and getattr(payment.booking, "court", None):
                service_title = f"Court Booking: {payment.booking.court.name}"
            elif payment.tournament:
                service_title = f"Tournament: {payment.tournament.name}"
            elif payment.event:
                service_title = f"Event: {payment.event.title}"
            elif payment.lesson:
                service_title = f"Lesson: {payment.lesson.title}"
            elif payment.league:
                service_title = f"League: {payment.league.name}"
        except Exception:
            pass

        if not service_title and payment.notes:
            service_title = payment.notes

        return cls(
            id=payment.id,
            reference=payment.reference,
            club_id=payment.club_id,
            club_name=club_name,
            subscription_id=payment.subscription_id,
            booking_id=payment.booking_id,
            tournament_id=payment.tournament_id,
            event_id=payment.event_id,
            lesson_id=payment.lesson_id,
            league_id=payment.league_id,
            service_name=service_title,
            amount=payment.amount,
            currency=payment.currency,
            status=payment.status,
            status_label=payment.status.display_label,
            purpose=payment.purpose,
            purpose_label=payment.purpose.display_label,
            payment_method=payment.payment_method,
            payment_method_label=payment.payment_method.display_label,
            refunded_amount=payment.refunded_amount,
            refund_reason=payment.refund_reason,
            refunded_at=payment.refunded_at,
            created_at=payment.created_at,
            paid_at=payment.paid_at,
        )


class PaymentSummaryResponse(BaseModel):
    total_count: int
    succeeded_count: int
    pending_count: int
    failed_count: int
    refunded_count: int = 0
    total_amount_collected: Decimal
    total_refunded_amount: Decimal = Decimal("0.00")
    net_collected: Decimal = Decimal("0.00")
    currency: str = "USD"
