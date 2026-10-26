"""purge demo and business data clean slate

Revision ID: f7b8c9d0e1f2
Revises: f6a7b8c9d1e2
Create Date: 2026-10-26 10:45:00.000000

"""
from __future__ import annotations

import uuid
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from app.core.security import hash_password

# revision identifiers, used by Alembic.
revision: str = 'f7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Purge all competitions, bookings, and facility records in foreign-key safe order
    tables = [
        "match_participants",
        "matches",
        "pool_teams",
        "pools",
        "team_members",
        "teams",
        "tournament_registrations",
        "tournament_favorites",
        "tournaments",
        "league_weekly_standings",
        "league_weeks",
        "leagues",
        "bookings",
        "lesson_registrations",
        "lessons",
        "lesson_types",
        "coaches",
        "event_registrations",
        "events",
        "courts",
        "member_subscriptions",
        "membership_plans",
        "club_player_memberships",
        "club_membership_requests",
        "club_memberships",
        "club_carousel_slides",
        "club_media_assets",
        "payments",
        "support_ticket_messages",
        "support_tickets",
        "notifications",
        "notification_preferences",
        "platform_audit_logs",
        "club_applications",
        "clubs",
    ]

    for tbl in tables:
        try:
            op.execute(f"DELETE FROM {tbl}")
        except Exception as e:
            # Table might not exist or be empty in some environments
            pass

    # 2. Delete all non-admin player profiles
    try:
        op.execute("""
            DELETE FROM player_profiles 
            WHERE user_id NOT IN (
                SELECT id FROM users WHERE email IN ('admin@pickleball.com', 'platform.owner@pickleball.com', 'platform.owner@aught2.com')
            )
        """)
    except Exception:
        pass

    # 3. Delete all non-admin users
    try:
        op.execute("""
            DELETE FROM users 
            WHERE email NOT IN ('admin@pickleball.com', 'platform.owner@pickleball.com', 'platform.owner@aught2.com')
        """)
    except Exception:
        pass

    # 4. Configure Platform Administrator accounts
    default_admin_pw = "PlatformAdmin2024!"
    hashed_pw = hash_password(default_admin_pw)
    escaped_hash = hashed_pw.replace("'", "''")

    try:
        op.execute(f"""
            UPDATE users 
            SET hashed_password = '{escaped_hash}', is_active = true, is_verified = true
            WHERE email IN ('admin@pickleball.com', 'platform.owner@pickleball.com', 'platform.owner@aught2.com')
        """)
    except Exception:
        pass

    admin_accounts = [
        ('admin@pickleball.com', 'Platform Administrator'),
        ('platform.owner@aught2.com', 'Aught2 Platform Administrator'),
        ('platform.owner@pickleball.com', 'Platform Administrator'),
    ]
    for email, full_name in admin_accounts:
        u_id = str(uuid.uuid4())
        try:
            op.execute(f"""
                INSERT INTO users (id, email, hashed_password, full_name, is_active, is_verified, created_at, updated_at)
                SELECT '{u_id}', '{email}', '{escaped_hash}', '{full_name}', true, true, NOW(), NOW()
                WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '{email}')
            """)
        except Exception:
            pass


def downgrade() -> None:
    # Irreversible data cleanup
    pass
