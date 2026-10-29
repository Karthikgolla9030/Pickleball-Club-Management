"""
Aught2 Pickleball — Club Custom Role Model

Enables club owners to create custom staff roles (e.g., Coach, Receptionist,
Court Supervisor, Accountant) with granular, club-scoped permission sets.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.club import Club
    from app.models.club_membership import ClubMembership


class ClubCustomRole(Base):
    __tablename__ = "club_custom_roles"
    __table_args__ = (
        UniqueConstraint("club_id", "name", name="uq_club_custom_roles_club_name"),
        Index("ix_club_custom_roles_club_id", "club_id"),
    )

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
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    permissions: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
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
    club: Mapped["Club"] = relationship("Club", back_populates="custom_roles")
    memberships: Mapped[list["ClubMembership"]] = relationship(
        "ClubMembership",
        back_populates="custom_role",
        passive_deletes=True,
    )
