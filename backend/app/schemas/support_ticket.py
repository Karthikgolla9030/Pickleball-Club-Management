"""
Aught2 Pickleball — Support Ticket Pydantic Schemas

Data transfer models for support ticket submissions, administrative triage,
replies, status updates, and audit integrations.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.support_ticket import TicketCategory, TicketPriority, TicketStatus


class SupportTicketMessageItem(BaseModel):
    """Single message or reply in a support ticket thread."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ticket_id: UUID
    sender_id: UUID | None = None
    sender_email: str
    sender_name: str | None = None
    sender_role: str  # "requester" | "platform_admin"
    message: str
    created_at: datetime


class SupportTicketMessageCreateRequest(BaseModel):
    """Payload to post a reply into a ticket thread."""
    model_config = ConfigDict(str_strip_whitespace=True)

    message: str = Field(
        ...,
        min_length=2,
        max_length=5000,
        description="Reply message content",
    )


class SupportTicketCreateRequest(BaseModel):
    """Payload submitted by authenticated user (player or club staff) to open a ticket."""
    model_config = ConfigDict(str_strip_whitespace=True)

    subject: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Brief summary of the issue or request",
    )
    description: str = Field(
        ...,
        min_length=5,
        max_length=5000,
        description="Detailed description of the issue or request",
    )
    category: str = Field(
        default=TicketCategory.GENERAL.value,
        description="Issue category (e.g. general, billing, booking, membership, technical)",
    )
    priority: str = Field(
        default=TicketPriority.MEDIUM.value,
        description="Requested priority level (low, medium, high, urgent)",
    )
    club_id: UUID | None = Field(
        default=None,
        description="Optional related club facility ID",
    )
    source_portal: str | None = Field(
        default=None,
        description="Origin portal: 'player' or 'club'",
    )


class SupportTicketUpdateRequest(BaseModel):
    """Payload used by platform administrators to triage ticket status/priority/assignment."""
    model_config = ConfigDict(str_strip_whitespace=True)

    status: str | None = Field(default=None, description="Updated ticket status")
    priority: str | None = Field(default=None, description="Updated ticket priority")
    assigned_admin_id: UUID | None = Field(default=None, description="Assigned platform admin user ID")
    reason: str | None = Field(
        default=None,
        max_length=500,
        description="Optional administrative justification recorded in audit log",
    )


class SupportTicketItem(BaseModel):
    """Summary item representation for lists and queues."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    reference_number: str
    subject: str
    description: str
    category: str
    category_label: str
    priority: str
    priority_label: str
    status: str
    status_label: str
    requester_id: UUID
    requester_email: str
    requester_name: str | None = None
    club_id: UUID | None = None
    club_name: str | None = None
    club_slug: str | None = None
    source_portal: str = "player"
    origin: str = "player"  # "player" | "club"
    origin_label: str = "Player Support"  # "Player Support" | "Club Support"
    assigned_admin_id: UUID | None = None
    assigned_admin_email: str | None = None
    assigned_admin_name: str | None = None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None = None
    messages_count: int = 0


class SupportTicketDetailResponse(SupportTicketItem):
    """Full ticket detail response including conversation messages."""
    messages: list[SupportTicketMessageItem] = Field(default_factory=list)


class SupportTicketsListResponse(BaseModel):
    """Paginated list of support tickets with queue breakdown metrics."""
    items: list[SupportTicketItem]
    total: int
    page: int
    page_size: int
    status_counts: dict[str, int] = Field(default_factory=dict)
    priority_counts: dict[str, int] = Field(default_factory=dict)
