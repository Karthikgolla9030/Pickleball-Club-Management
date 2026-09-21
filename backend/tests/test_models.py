"""
Test: Models

Verifies:
  3. User model works
  4. Club model works
  5. ClubMembership model works
  6. Valid roles are accepted
  7. Invalid roles are rejected
  8. Role belongs to membership (NOT to User)
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User


# ─── Test 3: User model works ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_model_create(db_session):
    """Test 3: User model can be created and stored."""
    user = User(
        email="test@example.com",
        hashed_password="hashed_secret",
        full_name="Test User",
    )
    db_session.add(user)
    await db_session.flush()

    assert user.id is not None
    assert user.email == "test@example.com"
    assert user.full_name == "Test User"
    assert user.is_active is True
    assert user.is_verified is False


@pytest.mark.asyncio
async def test_user_has_no_role_field(db_session):
    """Test 3b: User model does NOT have a role field (role lives on ClubMembership)."""
    user = User(email="norole@example.com", hashed_password="hash")
    assert not hasattr(user, "role"), "User must NOT have a role field"


# ─── Test 4: Club model works ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_model_create(db_session):
    """Test 4: Club model can be created and stored."""
    club = Club(name="Demo Pickleball Club", slug="demo-pickleball-club")
    db_session.add(club)
    await db_session.flush()

    assert club.id is not None
    assert club.name == "Demo Pickleball Club"
    assert club.slug == "demo-pickleball-club"
    assert club.is_active is True


# ─── Test 5: ClubMembership model works ──────────────────────────────────────

@pytest.mark.asyncio
async def test_club_membership_create(db_session):
    """Test 5: ClubMembership model correctly links user to club with role."""
    user = User(email="owner@demo.local", hashed_password="hash")
    club = Club(name="Test Club", slug=f"test-club-{uuid.uuid4().hex[:8]}")
    db_session.add_all([user, club])
    await db_session.flush()

    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=ClubRole.CLUB_OWNER,
    )
    db_session.add(membership)
    await db_session.flush()

    assert membership.id is not None
    assert membership.user_id == user.id
    assert membership.club_id == club.id
    assert membership.role == ClubRole.CLUB_OWNER
    assert membership.is_active is True


# ─── Test 6: Valid roles are accepted ─────────────────────────────────────────

def test_valid_roles_accepted():
    """Test 6: All three valid role identifiers are accepted by ClubRole enum."""
    assert ClubRole("club_owner") == ClubRole.CLUB_OWNER
    assert ClubRole("club_manager") == ClubRole.CLUB_MANAGER
    assert ClubRole("tournament_director") == ClubRole.TOURNAMENT_DIRECTOR


def test_all_roles_have_display_labels():
    """Test 6b: Each role has the correct human-readable display label."""
    assert ClubRole.CLUB_OWNER.display_label == "Club Owner"
    assert ClubRole.CLUB_MANAGER.display_label == "Club Manager"
    assert ClubRole.TOURNAMENT_DIRECTOR.display_label == "Tournament Director"


# ─── Test 7: Invalid roles are rejected ───────────────────────────────────────

def test_invalid_role_rejected():
    """Test 7: Invalid role strings raise ValueError."""
    with pytest.raises(ValueError):
        ClubRole("reception")

    with pytest.raises(ValueError):
        ClubRole("admin")

    with pytest.raises(ValueError):
        ClubRole("player")

    with pytest.raises(ValueError):
        ClubRole("super_admin")

    with pytest.raises(ValueError):
        ClubRole("league_manager")

    with pytest.raises(ValueError):
        ClubRole("coach")


# ─── Test 8: Role belongs to membership, not user ─────────────────────────────

@pytest.mark.asyncio
async def test_role_belongs_to_membership_not_user(db_session):
    """
    Test 8: The same user can have different roles at different clubs.
    This proves role lives on ClubMembership, not User.
    """
    user = User(email="multirole@demo.local", hashed_password="hash")
    club_a = Club(name="Club A", slug=f"club-a-{uuid.uuid4().hex[:8]}")
    club_b = Club(name="Club B", slug=f"club-b-{uuid.uuid4().hex[:8]}")
    db_session.add_all([user, club_a, club_b])
    await db_session.flush()

    membership_a = ClubMembership(
        user_id=user.id,
        club_id=club_a.id,
        role=ClubRole.CLUB_OWNER,
    )
    membership_b = ClubMembership(
        user_id=user.id,
        club_id=club_b.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
    )
    db_session.add_all([membership_a, membership_b])
    await db_session.flush()

    # Same user, two different roles at two different clubs
    assert membership_a.user_id == user.id
    assert membership_b.user_id == user.id
    assert membership_a.role == ClubRole.CLUB_OWNER
    assert membership_b.role == ClubRole.TOURNAMENT_DIRECTOR
    assert membership_a.role != membership_b.role
