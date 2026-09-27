"""
Aught2 Pickleball — Payment Model (Phase 13)

Production-ready internal payment foundation.
Establishes the core payment domain model, status transitions, Decimal money storage,
unique deterministic reference formatting, and subscription relationships.

Architecture:
    Club → MemberSubscription → Payment
    User (Player) ← Payment
    User (Staff / Created By) ← Payment

Design invariants:
    - No external payment gateway SDK dependencies or API calls in Phase 13.
    - Money is stored using Numeric(10, 2), never floating-point.
    - Reference is deterministic-safe, unique, human-readable (e.g. A2P-2026-000001).
    - Payment is authoritative historical record; plan price changes do NOT change past payments.
    - subscription_id is nullable in the model (for future phases: bookings, events, etc.),
      but Phase 13 strictly enforces subscription_id for purpose == MEMBERSHIP.
    - Refunds are architecturally prepared via status enum, but no refund operations exist in Phase 13.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ─── Payment Enums ────────────────────────────────────────────────────────────

class PaymentPurpose(str, enum.Enum):
    """
    Controlled payment purpose.
    Phase 13 supports only 'membership'.
    Extensible for future phases (booking, tournament, lesson, event).
    """
    MEMBERSHIP = "membership"

    @property
    def display_label(self) -> str:
        return {"membership": "Membership"}[self.value]


class PaymentStatus(str, enum.Enum):
    """
    Controlled payment lifecycle status.

    Lifecycle transitions:
        pending → processing, succeeded, failed, cancelled
        processing → succeeded, failed, cancelled
        succeeded → (terminal in Phase 13)
        failed → (terminal in Phase 13)
        cancelled → (terminal in Phase 13)

    refunded & partially_refunded are future-compatible states (no false generation in Phase 13).
    """
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"

    @property
    def display_label(self) -> str:
        return {
            "pending": "Pending",
            "processing": "Processing",
            "succeeded": "Succeeded",
            "failed": "Failed",
            "cancelled": "Cancelled",
            "refunded": "Refunded",
            "partially_refunded": "Partially Refunded",
        }[self.value]


class PaymentMethod(str, enum.Enum):
    """
    Payment methods recorded internally.
    Online payments require explicit completion events before becoming succeeded.
    """
    CASH = "cash"
    BANK_TRANSFER = "bank_transfer"
    ONLINE = "online"
    OTHER = "other"

    @property
    def display_label(self) -> str:
        return {
            "cash": "Cash",
            "bank_transfer": "Bank Transfer",
            "online": "Online",
            "other": "Other",
        }[self.value]


# ─── Payment Model ────────────────────────────────────────────────────────────

class Payment(Base):
    """
    Represents a financial payment record associated with a club.

    Invariants:
        - Belongs to exactly one club.
        - Identifies the player receiving the benefit.
        - For membership payments, links to MemberSubscription.
        - Decimal amount strictly >= 0 (and > 0 for membership).
        - Unique reference (A2P-YYYY-NNNNNN).
        - Historical record is immutable upon completion.
    """
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    reference: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("member_subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Money storage: NUMERIC(10, 2) — NEVER FLOAT
    amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=10, scale=2),
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status", create_type=True),
        default=PaymentStatus.PENDING,
        nullable=False,
        index=True,
    )

    purpose: Mapped[PaymentPurpose] = mapped_column(
        Enum(PaymentPurpose, name="payment_purpose", create_type=True),
        default=PaymentPurpose.MEMBERSHIP,
        nullable=False,
    )

    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method", create_type=True),
        nullable=False,
    )

    # Optional gateway metadata (for future gateway integration)
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    provider_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audit actors
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status_changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ─── Relationships ────────────────────────────────────────────
    club: Mapped["Club"] = relationship(  # noqa: F821
        "Club",
        back_populates="payments",
    )
    player: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[player_id],
        back_populates="payments",
    )
    subscription: Mapped["MemberSubscription | None"] = relationship(  # noqa: F821
        "MemberSubscription",
        foreign_keys=[subscription_id],
        back_populates="payments",
    )
    created_by: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[created_by_user_id],
    )
    status_changed_by: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[status_changed_by_user_id],
    )

    def __repr__(self) -> str:
        return (
            f"<Payment ref={self.reference} club={self.club_id} "
            f"player={self.player_id} amount={self.amount} {self.currency} "
            f"status={self.status}>"
        )
