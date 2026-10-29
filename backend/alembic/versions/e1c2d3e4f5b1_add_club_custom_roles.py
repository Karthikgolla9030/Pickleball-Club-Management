"""add club_custom_roles table and custom_role_id to club_memberships

Revision ID: e1c2d3e4f5b1
Revises: d1c2d3e4f5b0
Create Date: 2026-10-29 14:40:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e1c2d3e4f5b1'
down_revision: Union[str, None] = 'd1c2d3e4f5b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    # 1. Create club_custom_roles table
    if "club_custom_roles" not in tables:
        op.create_table(
            "club_custom_roles",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("club_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("permissions", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("club_id", "name", name="uq_club_custom_roles_club_name"),
        )
        op.create_index("ix_club_custom_roles_club_id", "club_custom_roles", ["club_id"])

    # 2. Add custom_role_id column to club_memberships
    if "club_memberships" in tables:
        existing_cols = {c["name"] for c in insp.get_columns("club_memberships")}
        if "custom_role_id" not in existing_cols:
            op.add_column(
                "club_memberships",
                sa.Column(
                    "custom_role_id",
                    postgresql.UUID(as_uuid=True),
                    sa.ForeignKey("club_custom_roles.id", ondelete="SET NULL"),
                    nullable=True,
                ),
            )
            op.create_index("ix_club_memberships_custom_role_id", "club_memberships", ["custom_role_id"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "club_memberships" in tables:
        existing_cols = {c["name"] for c in insp.get_columns("club_memberships")}
        if "custom_role_id" in existing_cols:
            op.drop_index("ix_club_memberships_custom_role_id", table_name="club_memberships")
            op.drop_column("club_memberships", "custom_role_id")

    if "club_custom_roles" in tables:
        op.drop_table("club_custom_roles")
