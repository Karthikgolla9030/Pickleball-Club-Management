"""
Aught2 Pickleball — Platform Audit Log Model

Centralized, immutable audit trail for platform-level administrative actions.
Records who performed the action, what entity was affected, what changed,
the administrative reason, and safe execution metadata.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PlatformAuditLog(Base):
    __tablename__ = "platform_audit_logs"
    __table_args__ = (
        Index("ix_platform_audit_logs_created_action", "created_at", "action"),
        Index("ix_platform_audit_logs_entity", "entity_type", "entity_id"),
        Index("ix_platform_audit_logs_actor", "actor_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Actor identity (platform owner/admin)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    actor_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Action definition, e.g. "club_application.approved", "club.suspended"
    action: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )

    # Target entity
    entity_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    entity_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )
    entity_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Execution outcome: "success" | "failed"
    outcome: Mapped[str] = mapped_column(
        String(32),
        default="success",
        nullable=False,
        index=True,
    )

    # Administrative justification
    reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Safe structured context (e.g. status_before, status_after, slug)
    details: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
    )

    # Client network context
    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )

    # Actor relationship
    actor: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[actor_id],
    )
