"""add platform banners and club ad scheduling

Revision ID: b1c2d3e4f5a8
Revises: a1b2c3d4e5f7
Create Date: 2026-10-28 16:30:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a8'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    # 1. Create platform_banners table if not exists
    if "platform_banners" not in tables:
        op.create_table(
            "platform_banners",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("banner_type", sa.String(length=50), nullable=False, unique=True),
            sa.Column("image_url", sa.String(length=1000), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("subtitle", sa.String(length=500), nullable=True),
            sa.Column("cta_text", sa.String(length=100), nullable=True),
            sa.Column("cta_destination", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("updated_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_platform_banners_banner_type", "platform_banners", ["banner_type"], unique=True)
        op.create_index("ix_platform_banners_id", "platform_banners", ["id"])

    # 2. Add scheduling fields to club_carousel_slides if not exists
    if "club_carousel_slides" in tables:
        existing_cols = {c["name"] for c in insp.get_columns("club_carousel_slides")}
        if "start_date" not in existing_cols:
            op.add_column("club_carousel_slides", sa.Column("start_date", sa.DateTime(timezone=True), nullable=True))
        if "end_date" not in existing_cols:
            op.add_column("club_carousel_slides", sa.Column("end_date", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "club_carousel_slides" in tables:
        existing_cols = {c["name"] for c in insp.get_columns("club_carousel_slides")}
        if "end_date" in existing_cols:
            op.drop_column("club_carousel_slides", "end_date")
        if "start_date" in existing_cols:
            op.drop_column("club_carousel_slides", "start_date")

    if "platform_banners" in tables:
        op.drop_index("ix_platform_banners_id", table_name="platform_banners")
        op.drop_index("ix_platform_banners_banner_type", table_name="platform_banners")
        op.drop_table("platform_banners")
