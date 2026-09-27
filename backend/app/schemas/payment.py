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
    player_id: UUID = Field(..., description="ID of the user receiving the membership")
    subscription_id: UUID = Field(..., description="ID of the member subscription")
    amount: Decimal = Field(..., gt=0, decimal_places=2, description="Payment amount (> 0)")
    currency: str = Field(default="INR", min_length=3, max_length=3, description="Currency code")
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
    subscription_id: UUID | None
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
            player_info = PaymentPlayerEmbeddedInfo(
                id=payment.player.id,
                email=payment.player.email,
                full_name=payment.player.full_name,
            )

        sub_info = None
        if payment.subscription:
            plan_name = payment.subscription.plan.name if payment.subscription.plan else None
            sub_info = PaymentSubscriptionEmbeddedInfo(
                id=payment.subscription.id,
                plan_name=plan_name,
            )

        return cls(
            id=payment.id,
            reference=payment.reference,
            club_id=payment.club_id,
            player_id=payment.player_id,
            subscription_id=payment.subscription_id,
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
    amount: Decimal
    currency: str
    status: PaymentStatus
    status_label: str
    purpose: PaymentPurpose
    purpose_label: str
    payment_method: PaymentMethod
    payment_method_label: str
    created_at: datetime
    paid_at: datetime | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, payment) -> "PlayerPaymentResponse":
        club_name = payment.club.name if payment.club else None
        return cls(
            id=payment.id,
            reference=payment.reference,
            club_id=payment.club_id,
            club_name=club_name,
            amount=payment.amount,
            currency=payment.currency,
            status=payment.status,
            status_label=payment.status.display_label,
            purpose=payment.purpose,
            purpose_label=payment.purpose.display_label,
            payment_method=payment.payment_method,
            payment_method_label=payment.payment_method.display_label,
            created_at=payment.created_at,
            paid_at=payment.paid_at,
        )


class PaymentSummaryResponse(BaseModel):
    total_count: int
    succeeded_count: int
    pending_count: int
    failed_count: int
    total_amount_collected: Decimal
    currency: str = "INR"
