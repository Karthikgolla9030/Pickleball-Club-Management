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
import json
from typing import Any
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

def resolve_payment_display_data(payment) -> dict[str, Any]:
    """
    Safely resolves display fields from a payment record without exposing raw metadata or internal fields.
    Handles legacy [META] JSON strings, linked ORM models, and provider error codes.
    """
    meta: dict[str, Any] = {}
    clean_note: str | None = None

    raw_notes = getattr(payment, "notes", None)
    if raw_notes:
        raw_str = str(raw_notes).strip()
        if "[META]" in raw_str:
            parts = raw_str.split("[META]", 1)
            pre_note = parts[0].strip() or None
            meta_json = parts[1].strip()
            try:
                meta = json.loads(meta_json)
                n = meta.get("notes")
                clean_note = pre_note or (str(n).strip() if n and str(n).lower() not in ("null", "none") else None)
            except Exception:
                clean_note = pre_note
        elif raw_str.startswith("{") and raw_str.endswith("}"):
            try:
                meta = json.loads(raw_str)
                n = meta.get("notes")
                clean_note = str(n).strip() if n and str(n).lower() not in ("null", "none") else None
            except Exception:
                clean_note = raw_str
        else:
            clean_note = raw_str

    if clean_note:
        clean_note_str = str(clean_note).strip()
        if (
            clean_note_str.startswith("{")
            or "[META]" in clean_note_str
            or clean_note_str.lower() in ("none", "null")
        ):
            clean_note = None
        else:
            clean_note = clean_note_str

    purpose_val = getattr(payment, "purpose", None)
    purpose_labels = {
        PaymentPurpose.COURT_BOOKING: "Court Booking",
        PaymentPurpose.MEMBERSHIP: "Membership",
        PaymentPurpose.TOURNAMENT: "Tournament Registration",
        PaymentPurpose.LEAGUE: "League Registration",
        PaymentPurpose.EVENT: "Event Registration",
        PaymentPurpose.LESSON: "Lesson & Coaching",
    }
    service_label = purpose_labels.get(purpose_val, "Payment")

    activity_title: str | None = None
    activity_subtitle: str | None = None

    if purpose_val == PaymentPurpose.MEMBERSHIP:
        if getattr(payment, "subscription", None):
            try:
                plan = getattr(payment.subscription, "plan", None)
                if plan and getattr(plan, "name", None):
                    activity_title = plan.name
            except Exception:
                pass
        if not activity_title and meta:
            activity_title = meta.get("activity_name") or meta.get("plan_name")
        if meta and meta.get("interval"):
            activity_subtitle = f"{str(meta['interval']).capitalize()} Plan"

    elif purpose_val == PaymentPurpose.COURT_BOOKING:
        if getattr(payment, "booking", None):
            try:
                court = getattr(payment.booking, "court", None)
                if court and getattr(court, "name", None):
                    activity_title = court.name
                    if getattr(court, "court_type", None):
                        activity_subtitle = f"{str(court.court_type).capitalize()} Court"
            except Exception:
                pass
        if not activity_title and meta:
            activity_title = meta.get("activity_title") or meta.get("court_name")
        if not activity_subtitle and meta:
            sub = meta.get("activity_subtitle")
            dur = meta.get("duration_minutes")
            parts = []
            if sub and str(sub).lower() not in ("null", "none"):
                parts.append(str(sub))
            if dur:
                parts.append(f"{dur} mins")
            activity_subtitle = " · ".join(parts) if parts else None

    elif purpose_val == PaymentPurpose.TOURNAMENT:
        if getattr(payment, "tournament", None):
            try:
                activity_title = payment.tournament.name
            except Exception:
                pass
        if not activity_title and meta:
            activity_title = meta.get("activity_name") or meta.get("activity_title")

    elif purpose_val == PaymentPurpose.EVENT:
        if getattr(payment, "event", None):
            try:
                activity_title = payment.event.title
            except Exception:
                pass
        if not activity_title and meta:
            activity_title = meta.get("activity_name") or meta.get("activity_title")

    elif purpose_val == PaymentPurpose.LESSON:
        if getattr(payment, "lesson", None):
            try:
                activity_title = payment.lesson.title
            except Exception:
                pass
        if not activity_title and meta:
            activity_title = meta.get("activity_name") or meta.get("activity_title")

    elif purpose_val == PaymentPurpose.LEAGUE:
        if getattr(payment, "league", None):
            try:
                activity_title = payment.league.name
            except Exception:
                pass
        if not activity_title and meta:
            activity_title = meta.get("activity_name") or meta.get("activity_title")

    # Clean activity title
    if activity_title:
        title_str = str(activity_title).strip()
        if title_str.startswith("{") or "[META]" in title_str:
            activity_title = None
        else:
            for prefix in ("Court: ", "Tournament: ", "Event: ", "Lesson: ", "League: "):
                if title_str.startswith(prefix):
                    title_str = title_str[len(prefix):].strip()
            activity_title = title_str

    if activity_subtitle:
        sub_str = str(activity_subtitle).strip()
        if sub_str.startswith("{") or "[META]" in sub_str:
            activity_subtitle = None
        else:
            activity_subtitle = sub_str

    # Clean failure reason
    raw_failure = getattr(payment, "failure_reason", None)
    clean_failure: str | None = None
    if raw_failure:
        f_str = str(raw_failure).strip()
        upper_f = f_str.upper()
        if "USER_DROPPED" in upper_f:
            clean_failure = "Payment was not completed by the user"
        elif "SIGNATURE" in upper_f and "VERIFICATION" in upper_f:
            clean_failure = "Payment verification could not be authenticated"
        elif "FAILED_WEBHOOK" in upper_f or "PAYMENT_FAILED" in upper_f:
            clean_failure = "Payment was declined by the bank or card issuer"
        elif upper_f.startswith("PROVIDER WEBHOOK REPORTED"):
            clean_failure = "Payment processing was not completed"
        elif f_str.startswith("{") or "[META]" in f_str:
            clean_failure = "Payment processing failed"
        else:
            clean_failure = f_str

    return {
        "service_name": service_label,
        "activity_title": activity_title,
        "activity_subtitle": activity_subtitle,
        "notes": clean_note,
        "failure_reason": clean_failure,
    }


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
    activity_title: str | None = None
    activity_subtitle: str | None = None
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
            except Exception:
                sub_info = None

        display_data = resolve_payment_display_data(payment)

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
            service_name=display_data["service_name"],
            activity_title=display_data["activity_title"],
            activity_subtitle=display_data["activity_subtitle"],
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
            notes=display_data["notes"],
            failure_reason=display_data["failure_reason"],
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
    activity_title: str | None = None
    activity_subtitle: str | None = None
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

        display_data = resolve_payment_display_data(payment)

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
            service_name=display_data["service_name"],
            activity_title=display_data["activity_title"],
            activity_subtitle=display_data["activity_subtitle"],
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


# ─── Unified Checkout Schemas ────────────────────────────────────────────────

class CheckoutPriceBreakdown(BaseModel):
    base_amount: Decimal
    discount_amount: Decimal = Decimal("0.00")
    tax_amount: Decimal = Decimal("0.00")
    service_fee: Decimal = Decimal("0.00")
    final_amount: Decimal
    currency: str = "USD"


class CheckoutInitiateRequest(BaseModel):
    club_id: UUID = Field(..., description="Target club for the activity")
    purpose: PaymentPurpose = Field(..., description="Activity purpose")
    activity_id: UUID | None = Field(default=None, description="ID of court, tournament, event, lesson, plan, or league")
    start_at: datetime | None = Field(default=None, description="Start time for court booking or lesson")
    end_at: datetime | None = Field(default=None, description="End time for court booking or lesson")
    payment_method: PaymentMethod = Field(default=PaymentMethod.ONLINE, description="Requested payment method")
    selected_method: str | None = Field(default=None, description="Requested checkout payment method: upi, card, netbanking")
    currency: str = Field(default="USD", min_length=3, max_length=3)
    notes: str | None = Field(default=None, max_length=1000)
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, v: str) -> str:
        return v.strip().upper()


class CheckoutInitiateResponse(BaseModel):
    payment_id: UUID
    reference: str
    status: PaymentStatus
    breakdown: CheckoutPriceBreakdown
    provider: str
    provider_order_id: str | None = None
    provider_key_id: str | None = None
    payment_session_id: str | None = None
    supported_methods: list[str] = ["upi", "card", "netbanking"]
    selected_method: str | None = None
    payment_methods: str | None = None
    activity_summary: dict[str, str | int | float | bool | None]
    is_free: bool = False


class CheckoutVerifyRequest(BaseModel):
    payment_id: UUID
    provider: str
    provider_payment_id: str | None = None
    provider_order_id: str
    provider_signature: str | None = None


class CheckoutVerifyResponse(BaseModel):
    success: bool
    payment: PlayerPaymentResponse
    message: str
    booking_or_registration: dict[str, str | int | float | bool | None] | None = None

