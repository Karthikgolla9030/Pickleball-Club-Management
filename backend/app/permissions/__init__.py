"""
Aught2 Pickleball — Centralized Permission System

ALL role → permission logic lives here.
NEVER scatter `if role == "club_owner"` checks across the codebase.

Usage:
    from app.permissions import Permission, has_permission
    from app.models.club_membership import ClubRole

    if has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_TOURNAMENTS):
        ...

    # Or via dependency injection in FastAPI routes:
    # Depends(require_permission(Permission.MANAGE_TOURNAMENTS))
"""
from __future__ import annotations

import enum
from typing import FrozenSet

from app.models.club_membership import ClubRole


class Permission(str, enum.Enum):
    """
    All available permissions in the system.
    Add new permissions here as features are built.
    """
    # Club administration
    MANAGE_CLUB = "manage_club"
    MANAGE_USERS = "manage_users"
    MANAGE_ROLES = "manage_roles"
    MANAGE_SETTINGS = "manage_settings"
    MANAGE_PAYMENTS = "manage_payments"

    # Operations
    MANAGE_MEMBERS = "manage_members"
    MANAGE_MEMBERSHIPS = "manage_memberships"
    MANAGE_BOOKINGS = "manage_bookings"
    MANAGE_COURTS = "manage_courts"
    MANAGE_REPORTS = "manage_reports"
    MANAGE_EVENTS = "manage_events"
    MANAGE_LESSONS = "manage_lessons"

    # Tournaments & Leagues
    MANAGE_TOURNAMENTS = "manage_tournaments"
    MANAGE_LEAGUES = "manage_leagues"
    MANAGE_TEAMS = "manage_teams"
    MANAGE_MATCHES = "manage_matches"
    MANAGE_SCORES = "manage_scores"
    MANAGE_STANDINGS = "manage_standings"
    MANAGE_RESULTS = "manage_results"
    MANAGE_SCHEDULES = "manage_schedules"


# ─── Role → Permission Mapping ────────────────────────────────────────────────
# This is the SINGLE source of truth for all authorization decisions.

_CLUB_OWNER_PERMISSIONS: FrozenSet[Permission] = frozenset(Permission)
"""Club Owner has ALL permissions."""

_CLUB_MANAGER_PERMISSIONS: FrozenSet[Permission] = frozenset({
    Permission.MANAGE_MEMBERS,
    Permission.MANAGE_BOOKINGS,
    Permission.MANAGE_COURTS,
    Permission.MANAGE_MEMBERSHIPS,
    Permission.MANAGE_PAYMENTS,
    Permission.MANAGE_EVENTS,
    Permission.MANAGE_LESSONS,
    Permission.MANAGE_TOURNAMENTS,
    Permission.MANAGE_LEAGUES,
    Permission.MANAGE_TEAMS,
    Permission.MANAGE_MATCHES,
    Permission.MANAGE_SCORES,
    Permission.MANAGE_STANDINGS,
    Permission.MANAGE_RESULTS,
    Permission.MANAGE_SCHEDULES,
    Permission.MANAGE_REPORTS,
    # NOT: MANAGE_ROLES, MANAGE_USERS, MANAGE_SETTINGS, MANAGE_CLUB
})

_TOURNAMENT_DIRECTOR_PERMISSIONS: FrozenSet[Permission] = frozenset({
    Permission.MANAGE_TOURNAMENTS,
    Permission.MANAGE_LEAGUES,
    Permission.MANAGE_TEAMS,
    Permission.MANAGE_MATCHES,
    Permission.MANAGE_SCORES,
    Permission.MANAGE_STANDINGS,
    Permission.MANAGE_RESULTS,
    Permission.MANAGE_SCHEDULES,
    # NOT: MANAGE_USERS, MANAGE_ROLES, MANAGE_PAYMENTS,
    #      MANAGE_SETTINGS, MANAGE_CLUB, MANAGE_MEMBERS,
    #      MANAGE_BOOKINGS, MANAGE_COURTS, MANAGE_MEMBERSHIPS
})

ROLE_PERMISSIONS: dict[ClubRole, FrozenSet[Permission]] = {
    ClubRole.CLUB_OWNER: _CLUB_OWNER_PERMISSIONS,
    ClubRole.CLUB_MANAGER: _CLUB_MANAGER_PERMISSIONS,
    ClubRole.TOURNAMENT_DIRECTOR: _TOURNAMENT_DIRECTOR_PERMISSIONS,
}


# ─── Public API ───────────────────────────────────────────────────────────────

def has_permission(role: ClubRole, permission: Permission) -> bool:
    """
    Check whether a given club role has a specific permission.

    Args:
        role: The ClubRole to check.
        permission: The Permission to check for.

    Returns:
        True if the role has the permission, False otherwise.
    """
    role_perms = ROLE_PERMISSIONS.get(role, frozenset())
    return permission in role_perms


def get_permissions(role: ClubRole) -> FrozenSet[Permission]:
    """Return the complete set of permissions for a role."""
    return ROLE_PERMISSIONS.get(role, frozenset())


def get_role_display_label(role: ClubRole) -> str:
    """Return the human-readable display label for a role."""
    return role.display_label
