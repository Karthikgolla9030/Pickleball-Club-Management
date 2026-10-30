"""add centralized legal documents, versions, acceptances, and help content

Revision ID: f2c3d4e5f6b2
Revises: e1c2d3e4f5b1
Create Date: 2026-10-30 22:45:00.000000

"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f2c3d4e5f6b2'
down_revision: Union[str, None] = 'e1c2d3e4f5b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    # 1. Add source_portal to support_tickets if not exists
    if "support_tickets" in tables:
        columns = [c["name"] for c in insp.get_columns("support_tickets")]
        if "source_portal" not in columns:
            op.add_column(
                "support_tickets",
                sa.Column("source_portal", sa.String(length=30), nullable=True),
            )
            # Backfill existing tickets
            op.execute(
                "UPDATE support_tickets SET source_portal = CASE WHEN club_id IS NOT NULL THEN 'club' ELSE 'player' END"
            )
            op.alter_column("support_tickets", "source_portal", nullable=False, server_default="player")
            op.create_index("ix_support_tickets_source_portal", "support_tickets", ["source_portal"])

    # 2. Create help_categories table
    if "help_categories" not in tables:
        op.create_table(
            "help_categories",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("slug", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("target_audience", sa.String(length=20), nullable=False, server_default="all"),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_help_categories_slug", "help_categories", ["slug"], unique=True)
        op.create_index("ix_help_categories_target_audience", "help_categories", ["target_audience"])

    # 3. Create faqs table
    if "faqs" not in tables:
        op.create_table(
            "faqs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("help_categories.id", ondelete="SET NULL"), nullable=True),
            sa.Column("question", sa.String(length=500), nullable=False),
            sa.Column("answer", sa.Text(), nullable=False),
            sa.Column("target_audience", sa.String(length=20), nullable=False, server_default="all"),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_faqs_category_id", "faqs", ["category_id"])
        op.create_index("ix_faqs_target_audience", "faqs", ["target_audience"])
        op.create_index("ix_faqs_is_published", "faqs", ["is_published"])

    # 4. Create help_articles table
    if "help_articles" not in tables:
        op.create_table(
            "help_articles",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("help_categories.id", ondelete="SET NULL"), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("slug", sa.String(length=280), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("target_audience", sa.String(length=20), nullable=False, server_default="all"),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_help_articles_slug", "help_articles", ["slug"], unique=True)
        op.create_index("ix_help_articles_category_id", "help_articles", ["category_id"])
        op.create_index("ix_help_articles_target_audience", "help_articles", ["target_audience"])
        op.create_index("ix_help_articles_is_published", "help_articles", ["is_published"])

    # 5. Create legal_documents table
    if "legal_documents" not in tables:
        op.create_table(
            "legal_documents",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("document_type", sa.String(length=50), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("target_audience", sa.String(length=50), nullable=False, server_default="all"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_legal_documents_type", "legal_documents", ["document_type"], unique=True)

    # 6. Create legal_document_versions table
    if "legal_document_versions" not in tables:
        op.create_table(
            "legal_document_versions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("legal_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version", sa.String(length=20), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("effective_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("requires_renewed_acceptance", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("change_summary", sa.Text(), nullable=True),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_legal_document_versions_doc_status", "legal_document_versions", ["document_id", "status"])
        op.create_index("ix_legal_document_versions_doc_version", "legal_document_versions", ["document_id", "version"])

    # 7. Create legal_acceptances table
    if "legal_acceptances" not in tables:
        op.create_table(
            "legal_acceptances",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("legal_documents.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("legal_document_versions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_type", sa.String(length=50), nullable=False),
            sa.Column("document_version", sa.String(length=20), nullable=False),
            sa.Column("club_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clubs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("source", sa.String(length=50), nullable=False, server_default="player_registration"),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=255), nullable=True),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_legal_acceptances_user_doc", "legal_acceptances", ["user_id", "document_type"])
        op.create_index("ix_legal_acceptances_club", "legal_acceptances", ["club_id"])
        op.create_index("ix_legal_acceptances_accepted_at", "legal_acceptances", ["accepted_at"])


def downgrade() -> None:
    op.drop_table("legal_acceptances")
    op.drop_table("legal_document_versions")
    op.drop_table("legal_documents")
    op.drop_table("help_articles")
    op.drop_table("faqs")
    op.drop_table("help_categories")
    op.drop_column("support_tickets", "source_portal")

