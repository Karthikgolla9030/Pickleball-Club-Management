"""
Aught2 Pickleball — MembershipPlan & MemberSubscription Models (Phase 12)

Domain distinction:
  ClubPlayerMembership → "Is this user a player of this club?"
  MemberSubscription   → "What membership plan does this club member currently have?"

These are SEPARATE concepts. Do NOT merge them.

Architecture:
  User → ClubPlayerMembership → MemberSubscription → MembershipPlan → Club

Design decisions:
  - Duration math is calendar-aware (relativedelta), centralized in MembershipPlanService.
  - Price uses Numeric (never Float) to avoid floating-point errors.
  - Subscription status is persisted but date is authoritative (lazy sync on access).
  - One active subscription per (player_membership_id, club_id) — enforced by DB constraint.
  - Inactive plans keep existing active subscriptions valid.
  - No payment processing, invoices, or refunds in Phase 12.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.club import Club
    from app.models.club_player_membership import ClubPlayerMembership
    from app.models.payment import Payment
    from app.models.user import User

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ─── Plan Enums ───────────────────────────────────────────────────────────────

class PlanStatus(str, enum.Enum):
    """Lifecycle status of a MembershipPlan."""
    ACTIVE = "active"
    INACTIVE = "inactive"

    @property
    def display_label(self) -> str:
        return {"active": "Active", "inactive": "Inactive"}[self.value]


class PlanDurationUnit(str, enum.Enum):
    """
    Supported billing period units.
    Duration arithmetic is calendar-aware (relativedelta):
      monthly   → start + 1 month
      quarterly → start + 3 months
      yearly    → start + 1 year
    """
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"

    @property
    def display_label(self) -> str:
        return {
            "monthly": "Monthly",
            "quarterly": "Quarterly",
            "yearly": "Yearly",
        }[self.value]

    @property
    def months(self) -> int:
        """Number of calendar months this unit represents."""
        return {"monthly": 1, "quarterly": 3, "yearly": 12}[self.value]


# ─── Subscription Enum ────────────────────────────────────────────────────────

class SubscriptionStatus(str, enum.Enum):
    """
    Lifecycle states for MemberSubscription.

    Lifecycle:
        scheduled → active → expired
        active    → cancelled
    """
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

    @property
    def display_label(self) -> str:
        return {
            "scheduled": "Scheduled",
            "active": "Active",
            "expired": "Expired",
            "cancelled": "Cancelled",
        }[self.value]


# ─── MembershipPlan ───────────────────────────────────────────────────────────

class MembershipPlan(Base):
    """
    A named, priced plan offered by a club.

    A club may have many plans (Basic, Premium, Annual, etc.).
    Players subscribe to plans via MemberSubscription.
    """
    __tablename__ = "membership_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus, name="plan_status", create_type=True),
        default=PlanStatus.ACTIVE,
        nullable=False,
        index=True,
    )

    duration_unit: Mapped[PlanDurationUnit] = mapped_column(
        Enum(PlanDurationUnit, name="plan_duration_unit", create_type=True),
        nullable=False,
    )

    # Price storage: NUMERIC (never FLOAT) — informational only in Phase 12
    price: Mapped[float] = mapped_column(
        Numeric(precision=10, scale=2),
        nullable=False,
        default=0,
    )
    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    # Benefits: structured JSON list of benefit strings/objects
    # Example: ["Court booking access", "Member-only events", "Advance booking"]
    benefits: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)

    # Booking integration (Phase 12 ↔ Phase 11 bridge)
    booking_limit: Mapped[int | None] = mapped_column(nullable=True)
    advance_booking_days: Mapped[int | None] = mapped_column(nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────
    club: Mapped["Club"] = relationship(  # noqa: F821
        "Club",
        back_populates="membership_plans",
    )
    subscriptions: Mapped[list["MemberSubscription"]] = relationship(
        "MemberSubscription",
        back_populates="plan",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<MembershipPlan club={self.club_id} name={self.name} status={self.status}>"


# ─── MemberSubscription ───────────────────────────────────────────────────────

class MemberSubscription(Base):
    """
    Enrollment of a club player into a MembershipPlan.

    INVARIANTS:
      - player_membership must belong to the same club as the plan.
      - Only one active/scheduled subscription per (player_membership_id, club_id).
      - Inactive plans cannot receive new subscriptions.
      - Existing active subscriptions remain valid when their plan is deactivated.
      - Historical subscriptions are never deleted.

    Expiration architecture (Decision B — date-authoritative):
      The service derives effective_status at read time:
        if status == ACTIVE and today > end_date → treat as EXPIRED
      Status is lazily persisted. No background workers needed.

    Subscription uniqueness:
      A PostgreSQL partial unique index (created in Alembic migration) prevents
      more than one active/scheduled subscription per (player_membership_id, club_id).
      The service layer also enforces this constraint programmatically for SQLite (tests).
    """
    __tablename__ = "member_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    player_membership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("club_player_memberships.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    membership_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("membership_plans.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status", create_type=True),
        default=SubscriptionStatus.ACTIVE,
        nullable=False,
        index=True,
    )

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    auto_renew: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cancellation audit trail
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # ─── Relationships ────────────────────────────────────────────
    club: Mapped["Club"] = relationship(  # noqa: F821
        "Club",
        back_populates="subscriptions",
    )
    player_membership: Mapped["ClubPlayerMembership"] = relationship(  # noqa: F821
        "ClubPlayerMembership",
        back_populates="subscriptions",
    )
    plan: Mapped["MembershipPlan"] = relationship(
        "MembershipPlan",
        back_populates="subscriptions",
    )
    cancelled_by: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[cancelled_by_user_id],
    )
    payments: Mapped[list["Payment"]] = relationship(  # noqa: F821
        "Payment",
        back_populates="subscription",
    )

    @property
    def effective_status(self) -> SubscriptionStatus:
        """
        Derive the real status from the date.
        If the DB says 'active' but today > end_date, the subscription has expired.
        This is the date-authoritative check (no background worker needed).
        """
        if self.status == SubscriptionStatus.ACTIVE:
            today = date.today()
            if today > self.end_date:
                return SubscriptionStatus.EXPIRED
        return self.status

    @property
    def is_effectively_active(self) -> bool:
        """True only if subscription is active AND not past its end date."""
        return self.effective_status == SubscriptionStatus.ACTIVE

    def __repr__(self) -> str:
        return (
            f"<MemberSubscription player_membership={self.player_membership_id} "
            f"plan={self.membership_plan_id} status={self.status}>"
        )
