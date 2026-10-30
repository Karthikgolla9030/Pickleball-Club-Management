"""
Aught2 Pickleball — Support Ticket and Message Models

Enables authenticated users (club staff and players) to request support,
and platform owners to triage, assign, update, and converse on tickets.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class TicketStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    WAITING_FOR_REQUESTER = "waiting_for_requester"
    RESOLVED = "resolved"
    CLOSED = "closed"

    @property
    def display_label(self) -> str:
        labels = {
            TicketStatus.OPEN: "Open",
            TicketStatus.IN_PROGRESS: "In Progress",
            TicketStatus.WAITING_FOR_REQUESTER: "Waiting for Requester",
            TicketStatus.RESOLVED: "Resolved",
            TicketStatus.CLOSED: "Closed",
        }
        return labels.get(self, self.value.replace("_", " ").title())


class TicketPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

    @property
    def display_label(self) -> str:
        return self.value.title()


class TicketCategory(str, enum.Enum):
    GENERAL = "general"
    BILLING = "billing"
    BOOKING = "booking"
    MEMBERSHIP = "membership"
    TECHNICAL = "technical"
    ACCOUNT = "account"
    FACILITY = "facility"
    TOURNAMENT = "tournament"
    OTHER = "other"

    @property
    def display_label(self) -> str:
        labels = {
            TicketCategory.GENERAL: "General Inquiry",
            TicketCategory.BILLING: "Billing & Payment",
            TicketCategory.BOOKING: "Court Booking",
            TicketCategory.MEMBERSHIP: "Membership & Plans",
            TicketCategory.TECHNICAL: "Technical / App",
            TicketCategory.ACCOUNT: "Account & Login",
            TicketCategory.FACILITY: "Club Facility & Ops",
            TicketCategory.TOURNAMENT: "Tournament & Competition",
            TicketCategory.OTHER: "Other",
        }
        return labels.get(self, self.value.replace("_", " ").title())


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("ix_support_tickets_status_priority", "status", "priority"),
        Index("ix_support_tickets_requester_created", "requester_id", "created_at"),
        Index("ix_support_tickets_club_created", "club_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    reference_number: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
    )

    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    category: Mapped[str] = mapped_column(
        String(50),
        default=TicketCategory.GENERAL.value,
        nullable=False,
        index=True,
    )

    priority: Mapped[str] = mapped_column(
        String(20),
        default=TicketPriority.MEDIUM.value,
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default=TicketStatus.OPEN.value,
        nullable=False,
        index=True,
    )

    # Requester identity
    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requester_email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    requester_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Optional related club
    club_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Originating portal: "player" | "club"
    source_portal: Mapped[str] = mapped_column(
        String(30),
        default="player",
        nullable=False,
        index=True,
    )

    # Assigned platform admin handler
    assigned_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_admin_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    assigned_admin_name: Mapped[str | None] = mapped_column(
        String(255),
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
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    requester: Mapped["User"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[requester_id],
    )
    assigned_admin: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[assigned_admin_id],
    )
    club: Mapped["Club | None"] = relationship(  # noqa: F821
        "Club",
        foreign_keys=[club_id],
    )
    messages: Mapped[list["SupportTicketMessage"]] = relationship(
        "SupportTicketMessage",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="SupportTicketMessage.created_at.asc()",
    )


class SupportTicketMessage(Base):
    __tablename__ = "support_ticket_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sender_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sender_email: Mapped[str] = mapped_column(String(255), nullable=False)
    sender_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # sender_role: "requester" | "platform_admin"
    sender_role: Mapped[str] = mapped_column(String(30), nullable=False)

    message: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Relationships
    ticket: Mapped["SupportTicket"] = relationship(
        "SupportTicket",
        back_populates="messages",
    )
    sender: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[sender_id],
    )
