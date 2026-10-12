"""
Aught2 Pickleball — ClubApplication Model

Represents a public application to register a new club facility on the platform.
Lifecycle states:
  pending  -> awaiting review by authorized platform owner
  approved -> approved by platform owner; creates Club and initial club_owner membership
  rejected -> rejected by platform owner with optional rejection reason
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, time, timezone

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ClubApplicationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

    @property
    def display_label(self) -> str:
        labels = {
            ClubApplicationStatus.PENDING: "Pending Review",
            ClubApplicationStatus.APPROVED: "Approved",
            ClubApplicationStatus.REJECTED: "Rejected",
        }
        return labels[self]


class ClubApplication(Base):
    __tablename__ = "club_applications"
    __table_args__ = (
        Index("ix_club_applications_status_created", "status", "created_at"),
        Index("ix_club_applications_email_status", "applicant_email", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Clean human-readable reference number, e.g. "APP-A1B2C3D4"
    reference_number: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
    )

    # Applicant details
    applicant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    applicant_email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    applicant_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Associated user identity (created or linked upon application submission)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Club facility details
    club_name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    short_description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    established_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Location details
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str] = mapped_column(
        String(100),
        default="United States",
        nullable=False,
    )

    # Operating schedule
    operating_days: Mapped[str | None] = mapped_column(
        String(100),
        default="Monday - Sunday",
        nullable=True,
    )
    opening_time: Mapped[time] = mapped_column(
        Time,
        default=time(6, 0),
        nullable=False,
    )
    closing_time: Mapped[time] = mapped_column(
        Time,
        default=time(22, 0),
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(
        String(50),
        default="UTC",
        nullable=False,
    )
    facilities_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Lifecycle & approval state machine
    status: Mapped[ClubApplicationStatus] = mapped_column(
        Enum(
            ClubApplicationStatus,
            name="club_application_status",
            create_type=True,
        ),
        default=ClubApplicationStatus.PENDING,
        nullable=False,
        index=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Review audit
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Created club reference upon approval
    club_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="SET NULL"),
        nullable=True,
    )

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

    # Relationships
    user: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[user_id],
    )
    reviewed_by: Mapped["User | None"] = relationship(  # noqa: F821
        "User",
        foreign_keys=[reviewed_by_id],
    )
    club: Mapped["Club | None"] = relationship(  # noqa: F821
        "Club",
        foreign_keys=[club_id],
    )
