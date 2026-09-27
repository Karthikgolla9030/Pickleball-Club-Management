"""
Aught2 Pickleball — Membership Plan & Member Subscription Schemas (Phase 12)

Pydantic v2 schemas for request/response serialization.

Notes:
  - price uses Decimal for round-trip correctness (never float).
  - benefits is a list of strings/dicts stored as JSON.
  - Player-facing views (PlayerMembershipView) are read-only.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.membership import PlanDurationUnit, PlanStatus, SubscriptionStatus


# ─── Plan Schemas ─────────────────────────────────────────────────────────────

class MembershipPlanCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    duration_unit: PlanDurationUnit
    price: Decimal = Field(..., ge=0, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    benefits: list[str] = Field(default_factory=list)
    booking_limit: int | None = Field(default=None, ge=0)
    advance_booking_days: int | None = Field(default=None, gt=0)

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, v: str) -> str:
        return v.upper()

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Plan name cannot be blank")
        return v


class MembershipPlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    duration_unit: PlanDurationUnit | None = None
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    benefits: list[str] | None = None
    booking_limit: int | None = Field(default=None, ge=0)
    advance_booking_days: int | None = Field(default=None, gt=0)
    status: PlanStatus | None = None

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, v: str | None) -> str | None:
        return v.upper() if v else v


class MembershipPlanResponse(BaseModel):
    id: UUID
    club_id: UUID
    name: str
    description: str | None
    status: PlanStatus
    status_label: str
    duration_unit: PlanDurationUnit
    duration_label: str
    price: Decimal
    currency: str
    benefits: list[str]
    booking_limit: int | None
    advance_booking_days: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_status(cls, plan) -> "MembershipPlanResponse":
        return cls(
            id=plan.id,
            club_id=plan.club_id,
            name=plan.name,
            description=plan.description,
            status=plan.status,
            status_label=plan.status.display_label,
            duration_unit=plan.duration_unit,
            duration_label=plan.duration_unit.display_label,
            price=plan.price,
            currency=plan.currency,
            benefits=plan.benefits or [],
            booking_limit=plan.booking_limit,
            advance_booking_days=plan.advance_booking_days,
            created_at=plan.created_at,
            updated_at=plan.updated_at,
        )


class MembershipPlanDetailResponse(MembershipPlanResponse):
    """Extended plan response that includes subscriber count."""
    subscriber_count: int = 0

    @classmethod
    def from_orm_with_count(cls, plan, subscriber_count: int) -> "MembershipPlanDetailResponse":
        base = MembershipPlanResponse.from_orm_with_status(plan)
        return cls(**base.model_dump(), subscriber_count=subscriber_count)


# ─── Subscription Schemas ─────────────────────────────────────────────────────

class MemberSubscriptionCreate(BaseModel):
    player_membership_id: UUID
    membership_plan_id: UUID
    start_date: date
    auto_renew: bool = False
    notes: str | None = None

    @model_validator(mode="after")
    def validate_start_date(self) -> "MemberSubscriptionCreate":
        today = date.today()
        if self.start_date < today:
            raise ValueError(
                "start_date cannot be in the past. "
                "Use today or a future date."
            )
        return self


class MemberSubscriptionUpdate(BaseModel):
    auto_renew: bool | None = None
    notes: str | None = None


class MemberSubscriptionCancelRequest(BaseModel):
    cancellation_reason: str | None = None


class SubscriptionPlayerInfo(BaseModel):
    player_membership_id: UUID
    user_id: UUID
    user_email: str
    user_full_name: str | None = None

    model_config = {"from_attributes": True}


class MemberSubscriptionResponse(BaseModel):
    id: UUID
    club_id: UUID
    player_membership_id: UUID
    membership_plan_id: UUID
    status: SubscriptionStatus
    status_label: str
    effective_status: SubscriptionStatus
    start_date: date
    end_date: date
    auto_renew: bool
    notes: str | None
    cancelled_at: datetime | None
    cancelled_by_user_id: UUID | None
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime
    # Embedded details
    plan_name: str | None = None
    plan_duration: str | None = None
    plan_price: Decimal | None = None
    plan_currency: str | None = None
    plan_benefits: list[str] = []
    plan_booking_limit: int | None = None
    plan_advance_booking_days: int | None = None
    player: SubscriptionPlayerInfo | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, sub) -> "MemberSubscriptionResponse":
        player_info = None
        if sub.player_membership and sub.player_membership.user:
            u = sub.player_membership.user
            player_info = SubscriptionPlayerInfo(
                player_membership_id=sub.player_membership_id,
                user_id=u.id,
                user_email=u.email,
                user_full_name=u.full_name,
            )
        plan = sub.plan
        return cls(
            id=sub.id,
            club_id=sub.club_id,
            player_membership_id=sub.player_membership_id,
            membership_plan_id=sub.membership_plan_id,
            status=sub.status,
            status_label=sub.status.display_label,
            effective_status=sub.effective_status,
            start_date=sub.start_date,
            end_date=sub.end_date,
            auto_renew=sub.auto_renew,
            notes=sub.notes,
            cancelled_at=sub.cancelled_at,
            cancelled_by_user_id=sub.cancelled_by_user_id,
            cancellation_reason=sub.cancellation_reason,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
            plan_name=plan.name if plan else None,
            plan_duration=plan.duration_unit.display_label if plan else None,
            plan_price=plan.price if plan else None,
            plan_currency=plan.currency if plan else None,
            plan_benefits=plan.benefits or [] if plan else [],
            plan_booking_limit=plan.booking_limit if plan else None,
            plan_advance_booking_days=plan.advance_booking_days if plan else None,
            player=player_info,
        )


# ─── Player-Facing Membership View ────────────────────────────────────────────

class PlayerMembershipView(BaseModel):
    """
    Read-only membership view for the authenticated player.
    Players can VIEW their subscription but NEVER modify it.
    """
    subscription_id: UUID
    club_id: UUID
    plan_name: str
    plan_description: str | None
    status: SubscriptionStatus
    status_label: str
    effective_status: SubscriptionStatus
    start_date: date
    end_date: date
    auto_renew: bool
    benefits: list[str]
    booking_limit: int | None
    advance_booking_days: int | None
    duration_label: str
    price: Decimal
    currency: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_subscription(cls, sub) -> "PlayerMembershipView":
        plan = sub.plan
        return cls(
            subscription_id=sub.id,
            club_id=sub.club_id,
            plan_name=plan.name,
            plan_description=plan.description,
            status=sub.status,
            status_label=sub.status.display_label,
            effective_status=sub.effective_status,
            start_date=sub.start_date,
            end_date=sub.end_date,
            auto_renew=sub.auto_renew,
            benefits=plan.benefits or [],
            booking_limit=plan.booking_limit,
            advance_booking_days=plan.advance_booking_days,
            duration_label=plan.duration_unit.display_label,
            price=plan.price,
            currency=plan.currency,
        )


# Backward-compatibility aliases
CreateMembershipPlanRequest = MembershipPlanCreate
UpdateMembershipPlanRequest = MembershipPlanUpdate
CreateSubscriptionRequest = MemberSubscriptionCreate
UpdateSubscriptionRequest = MemberSubscriptionUpdate
CancelSubscriptionRequest = MemberSubscriptionCancelRequest
