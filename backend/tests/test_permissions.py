"""
Test: Permission System

Verifies:
  9.  Permission mapping works
  10. Unauthorized permission is rejected
  11. Club Owner has role-management permission
  12. Club Manager does NOT have role-management permission
  13. Tournament Director has tournament permission
  14. Tournament Director has league permission
  15. Tournament Director does NOT have member-management permission
"""
from __future__ import annotations

import pytest

from app.models.club_membership import ClubRole
from app.permissions import Permission, get_permissions, has_permission


# ─── Test 9: Permission mapping works ─────────────────────────────────────────

def test_permission_mapping_exists():
    """Test 9: ROLE_PERMISSIONS mapping covers all three roles."""
    from app.permissions import ROLE_PERMISSIONS
    assert ClubRole.CLUB_OWNER in ROLE_PERMISSIONS
    assert ClubRole.CLUB_MANAGER in ROLE_PERMISSIONS
    assert ClubRole.TOURNAMENT_DIRECTOR in ROLE_PERMISSIONS


def test_get_permissions_returns_frozenset():
    """Test 9b: get_permissions returns a frozenset for each role."""
    for role in ClubRole:
        perms = get_permissions(role)
        assert isinstance(perms, frozenset)
        assert len(perms) > 0


# ─── Test 10: Unauthorized permission is rejected ─────────────────────────────

def test_has_permission_returns_false_for_missing():
    """Test 10: has_permission returns False when role lacks a permission."""
    # Tournament Director cannot manage members
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_MEMBERS) is False

    # Club Manager cannot manage roles
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_ROLES) is False

    # Club Manager cannot manage club settings
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_SETTINGS) is False


# ─── Test 11: Club Owner has role-management permission ───────────────────────

def test_club_owner_has_role_management():
    """Test 11: Club Owner has MANAGE_ROLES permission."""
    assert has_permission(ClubRole.CLUB_OWNER, Permission.MANAGE_ROLES) is True


def test_club_owner_has_all_permissions():
    """Test 11b: Club Owner has every available permission."""
    for perm in Permission:
        assert has_permission(ClubRole.CLUB_OWNER, perm) is True, (
            f"Club Owner should have {perm.value}"
        )


# ─── Test 12: Club Manager does NOT have role-management ──────────────────────

def test_club_manager_cannot_manage_roles():
    """Test 12: Club Manager does NOT have MANAGE_ROLES permission."""
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_ROLES) is False


def test_club_manager_cannot_manage_users():
    """Test 12b: Club Manager does NOT have MANAGE_USERS permission."""
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_USERS) is False


def test_club_manager_cannot_manage_payments():
    """Test 12c: Club Manager does NOT have MANAGE_PAYMENTS permission."""
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_PAYMENTS) is False


def test_club_manager_cannot_manage_club():
    """Test 12d: Club Manager does NOT have MANAGE_CLUB permission."""
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_CLUB) is False


def test_club_manager_cannot_manage_settings():
    """Test 12e: Club Manager does NOT have MANAGE_SETTINGS permission."""
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_SETTINGS) is False


def test_club_manager_can_manage_operations():
    """Test 12f: Club Manager CAN manage members, bookings, courts, memberships."""
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_MEMBERS) is True
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_BOOKINGS) is True
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_COURTS) is True
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_MEMBERSHIPS) is True
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_REPORTS) is True


# ─── Test 13: Tournament Director has tournament permission ───────────────────

def test_tournament_director_has_tournament_permission():
    """Test 13: Tournament Director has MANAGE_TOURNAMENTS permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_TOURNAMENTS) is True


def test_tournament_director_can_manage_competition():
    """Test 13b: Tournament Director can manage full competition lifecycle."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_TEAMS) is True
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_MATCHES) is True
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_SCORES) is True
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_STANDINGS) is True
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_RESULTS) is True


# ─── Test 14: Tournament Director has league permission ───────────────────────

def test_tournament_director_has_league_permission():
    """Test 14: Tournament Director has MANAGE_LEAGUES permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_LEAGUES) is True


# ─── Test 15: Tournament Director does NOT have member-management ─────────────

def test_tournament_director_cannot_manage_members():
    """Test 15: Tournament Director does NOT have MANAGE_MEMBERS permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_MEMBERS) is False


def test_tournament_director_cannot_manage_bookings():
    """Test 15b: Tournament Director does NOT have MANAGE_BOOKINGS permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_BOOKINGS) is False


def test_tournament_director_cannot_manage_courts():
    """Test 15c: Tournament Director does NOT have MANAGE_COURTS permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_COURTS) is False


def test_tournament_director_cannot_manage_memberships():
    """Test 15d: Tournament Director does NOT have MANAGE_MEMBERSHIPS permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_MEMBERSHIPS) is False


def test_tournament_director_cannot_manage_payments():
    """Test 15e: Tournament Director does NOT have MANAGE_PAYMENTS permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_PAYMENTS) is False


def test_tournament_director_cannot_manage_roles():
    """Test 15f: Tournament Director does NOT have MANAGE_ROLES permission."""
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_ROLES) is False
