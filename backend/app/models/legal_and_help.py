"""
Aught2 Pickleball — Legal Documents and Help & Support Models

Defines database models for:
- HelpCategory: Categories for organizing FAQs and Help Articles.
- FAQ: Frequently Asked Questions dynamically shown on Player and Club portals.
- HelpArticle: Detailed guide articles with rich markdown content.
- LegalDocument: Centralized legal documents (Player Terms, Club Terms, Privacy Policy, Club Agreement).
- LegalDocumentVersion: Immutable version history of legal documents with draft/published state.
- LegalAcceptance: Historical user and club acceptance records for compliance tracking.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class LegalDocumentType(str, enum.Enum):
    PLAYER_TERMS = "player_terms"
    CLUB_TERMS = "club_terms"
    PRIVACY_POLICY = "privacy_policy"
    CLUB_AGREEMENT = "club_agreement"

    @property
    def display_label(self) -> str:
        labels = {
            LegalDocumentType.PLAYER_TERMS: "Player Terms of Service",
            LegalDocumentType.CLUB_TERMS: "Club & Facility Terms of Service",
            LegalDocumentType.PRIVACY_POLICY: "Privacy Policy",
            LegalDocumentType.CLUB_AGREEMENT: "Club/Facility Operating Agreement",
        }
        return labels.get(self, self.value.replace("_", " ").title())


class ContentAudience(str, enum.Enum):
    PLAYER = "player"
    CLUB = "club"
    ALL = "all"


class DocumentVersionStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


# ─── Help & Support Models ───────────────────────────────────────────────────

class HelpCategory(Base):
    __tablename__ = "help_categories"
    __table_args__ = (
        Index("ix_help_categories_slug", "slug", unique=True),
        Index("ix_help_categories_target_audience", "target_audience"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_audience: Mapped[str] = mapped_column(
        String(20),
        default=ContentAudience.ALL.value,
        nullable=False,
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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

    faqs: Mapped[list["FAQ"]] = relationship(
        "FAQ",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="FAQ.display_order.asc()",
    )
    articles: Mapped[list["HelpArticle"]] = relationship(
        "HelpArticle",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="HelpArticle.display_order.asc()",
    )


class FAQ(Base):
    __tablename__ = "faqs"
    __table_args__ = (
        Index("ix_faqs_category_id", "category_id"),
        Index("ix_faqs_target_audience", "target_audience"),
        Index("ix_faqs_is_published", "is_published"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("help_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    question: Mapped[str] = mapped_column(String(500), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    target_audience: Mapped[str] = mapped_column(
        String(20),
        default=ContentAudience.ALL.value,
        nullable=False,
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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

    category: Mapped["HelpCategory | None"] = relationship(
        "HelpCategory",
        back_populates="faqs",
    )


class HelpArticle(Base):
    __tablename__ = "help_articles"
    __table_args__ = (
        Index("ix_help_articles_slug", "slug", unique=True),
        Index("ix_help_articles_category_id", "category_id"),
        Index("ix_help_articles_target_audience", "target_audience"),
        Index("ix_help_articles_is_published", "is_published"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("help_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(280), nullable=False, unique=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    target_audience: Mapped[str] = mapped_column(
        String(20),
        default=ContentAudience.ALL.value,
        nullable=False,
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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

    category: Mapped["HelpCategory | None"] = relationship(
        "HelpCategory",
        back_populates="articles",
    )


# ─── Legal Document Models ───────────────────────────────────────────────────

class LegalDocument(Base):
    __tablename__ = "legal_documents"
    __table_args__ = (
        Index("ix_legal_documents_type", "document_type", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    target_audience: Mapped[str] = mapped_column(
        String(50),
        default=ContentAudience.ALL.value,
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

    versions: Mapped[list["LegalDocumentVersion"]] = relationship(
        "LegalDocumentVersion",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="LegalDocumentVersion.created_at.desc()",
    )
    acceptances: Mapped[list["LegalAcceptance"]] = relationship(
        "LegalAcceptance",
        back_populates="document",
        cascade="all, delete-orphan",
    )


class LegalDocumentVersion(Base):
    __tablename__ = "legal_document_versions"
    __table_args__ = (
        Index("ix_legal_document_versions_doc_status", "document_id", "status"),
        Index("ix_legal_document_versions_doc_version", "document_id", "version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("legal_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default=DocumentVersionStatus.DRAFT.value,
        nullable=False,
        index=True,
    )
    effective_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    requires_renewed_acceptance: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
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

    document: Mapped["LegalDocument"] = relationship(
        "LegalDocument",
        back_populates="versions",
    )
    acceptances: Mapped[list["LegalAcceptance"]] = relationship(
        "LegalAcceptance",
        back_populates="version",
        cascade="all, delete-orphan",
    )


class LegalAcceptance(Base):
    __tablename__ = "legal_acceptances"
    __table_args__ = (
        Index("ix_legal_acceptances_user_doc", "user_id", "document_type"),
        Index("ix_legal_acceptances_club", "club_id"),
        Index("ix_legal_acceptances_accepted_at", "accepted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("legal_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("legal_document_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    document_version: Mapped[str] = mapped_column(String(20), nullable=False)
    club_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clubs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source: Mapped[str] = mapped_column(
        String(50),
        default="player_registration",
        nullable=False,
    )
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])  # noqa: F821
    document: Mapped["LegalDocument"] = relationship("LegalDocument", back_populates="acceptances")
    version: Mapped["LegalDocumentVersion"] = relationship("LegalDocumentVersion", back_populates="acceptances")
    club: Mapped["Club | None"] = relationship("Club", foreign_keys=[club_id])  # noqa: F821

