"""add applicant_gender and backfill club owner player profiles

Revision ID: c9d8e7f6a5b4
Revises: b891195a1b2c
Create Date: 2026-11-28 12:15:00.000000

"""
from __future__ import annotations

import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d8e7f6a5b4'
down_revision: Union[str, None] = 'b891195a1b2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("club_applications")}

    if "applicant_gender" not in existing_cols:
        op.add_column(
            "club_applications",
            sa.Column("applicant_gender", sa.String(length=30), nullable=True),
        )

    # Idempotent backfill: ensure existing club application owners have their
    # PlayerProfile row and missing phone/name populated from club_applications.
    rows = bind.execute(
        sa.text(
            """
            SELECT DISTINCT ON (COALESCE(ca.user_id, u.id))
                COALESCE(ca.user_id, u.id) AS resolved_user_id,
                ca.applicant_name,
                ca.applicant_phone,
                ca.applicant_gender,
                u.full_name,
                pp.id AS profile_id,
                pp.phone AS existing_phone,
                pp.gender AS existing_gender,
                pp.first_name AS existing_first_name,
                pp.last_name AS existing_last_name
            FROM club_applications ca
            LEFT JOIN users u
              ON ca.user_id = u.id OR lower(u.email) = lower(ca.applicant_email)
            LEFT JOIN player_profiles pp
              ON pp.user_id = COALESCE(ca.user_id, u.id)
            WHERE COALESCE(ca.user_id, u.id) IS NOT NULL
            ORDER BY COALESCE(ca.user_id, u.id), ca.created_at DESC
            """
        )
    ).fetchall() if bind.dialect.name == "postgresql" else []

    for row in rows:
        uid = row.resolved_user_id
        clean_name = (row.applicant_name or row.full_name or "").strip()
        parts = clean_name.split(None, 1) if clean_name else []
        first_name = parts[0] if parts else None
        last_name = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
        clean_phone = row.applicant_phone.strip() if row.applicant_phone and row.applicant_phone.strip() else None
        clean_gender = (
            row.applicant_gender.strip().capitalize()
            if row.applicant_gender and row.applicant_gender.strip()
            else None
        )

        if row.profile_id is None:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO player_profiles (
                        id, user_id, display_name, first_name, last_name, phone, gender, created_at, updated_at
                    ) VALUES (
                        :id, :user_id, :display_name, :first_name, :last_name, :phone, :gender, NOW(), NOW()
                    )
                    ON CONFLICT (user_id) DO NOTHING
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "user_id": uid,
                    "display_name": clean_name or "Club Owner",
                    "first_name": first_name,
                    "last_name": last_name,
                    "phone": clean_phone,
                    "gender": clean_gender,
                },
            )
        else:
            updates = {}
            if not row.existing_phone and clean_phone:
                updates["phone"] = clean_phone
            if not row.existing_gender and clean_gender:
                updates["gender"] = clean_gender
            if not row.existing_first_name and first_name:
                updates["first_name"] = first_name
            if not row.existing_last_name and last_name:
                updates["last_name"] = last_name
            if updates:
                set_clause = ", ".join(f"{k} = :{k}" for k in updates)
                updates["profile_id"] = row.profile_id
                bind.execute(
                    sa.text(f"UPDATE player_profiles SET {set_clause}, updated_at = NOW() WHERE id = :profile_id"),
                    updates,
                )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_cols = {c["name"] for c in insp.get_columns("club_applications")}

    if "applicant_gender" in existing_cols:
        op.drop_column("club_applications", "applicant_gender")
