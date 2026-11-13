"""
Tests for Staff Member role, club staff management, and authorization.
"""
from datetime import datetime, timezone
import pytest
import uuid

from app.models.club_membership import ClubMembership, ClubRole
from app.models.club import Club
from app.models.user import User
from app.permissions import Permission, has_permission, get_permissions, get_role_display_label
from app.schemas.club_membership import AddMemberRequest, UpdateMemberRequest, MemberResponse


def test_club_role_enum_and_display_labels():
    """Verify all 4 club roles exist and produce correct display labels."""
    assert ClubRole.CLUB_OWNER == "club_owner"
    assert ClubRole.CLUB_MANAGER == "club_manager"
    assert ClubRole.TOURNAMENT_DIRECTOR == "tournament_director"
    assert ClubRole.STAFF_MEMBER == "staff_member"

    assert get_role_display_label(ClubRole.CLUB_OWNER) == "Club Owner"
    assert get_role_display_label(ClubRole.CLUB_MANAGER) == "Club Manager"
    assert get_role_display_label(ClubRole.TOURNAMENT_DIRECTOR) == "Tournament Director"
    assert get_role_display_label(ClubRole.STAFF_MEMBER) == "Staff Member"


def test_staff_member_permissions_least_privilege():
    """Verify Staff Member has zero administrative permissions by default."""
    staff_perms = get_permissions(ClubRole.STAFF_MEMBER)
    assert len(staff_perms) == 0

    # Explicitly check sensitive permissions
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_ROLES) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_USERS) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_SETTINGS) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_PAYMENTS) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_MEMBERS) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_COURTS) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_BOOKINGS) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_TOURNAMENTS) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_LEAGUES) is False
    assert has_permission(ClubRole.STAFF_MEMBER, Permission.MANAGE_REPORTS) is False


def test_existing_roles_permissions_unaffected():
    """Verify Club Owner, Club Manager, and Tournament Director retain full permissions."""
    # Club Owner
    assert has_permission(ClubRole.CLUB_OWNER, Permission.MANAGE_ROLES) is True
    assert has_permission(ClubRole.CLUB_OWNER, Permission.MANAGE_CLUB) is True

    # Club Manager
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_MEMBERS) is True
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_BOOKINGS) is True
    assert has_permission(ClubRole.CLUB_MANAGER, Permission.MANAGE_ROLES) is False

    # Tournament Director
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_TOURNAMENTS) is True
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_LEAGUES) is True
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_MEMBERS) is False
    assert has_permission(ClubRole.TOURNAMENT_DIRECTOR, Permission.MANAGE_ROLES) is False


def test_add_and_update_member_schemas_enforce_two_builtin_roles():
    """Verify Pydantic schemas enforce only Club Manager & Tournament Director as built-in roles."""
    # Add member request with valid built-in roles
    add_mgr = AddMemberRequest(
        email="manager@example.com",
        role=ClubRole.CLUB_MANAGER,
        full_name="Manager Person",
        temporary_password="TempPassword123!",
    )
    assert add_mgr.role == ClubRole.CLUB_MANAGER

    add_td = AddMemberRequest(
        email="td@example.com",
        role=ClubRole.TOURNAMENT_DIRECTOR,
        full_name="Director Person",
        temporary_password="TempPassword123!",
    )
    assert add_td.role == ClubRole.TOURNAMENT_DIRECTOR

    # Add member request with custom role
    cr_id = uuid.uuid4()
    add_custom = AddMemberRequest(
        email="custom@example.com",
        custom_role_id=cr_id,
        full_name="Custom Staff",
        temporary_password="TempPassword123!",
    )
    assert add_custom.custom_role_id == cr_id

    # Staff Member built-in role is strictly rejected
    with pytest.raises(ValueError, match="Staff Member is no longer an assignable built-in role"):
        AddMemberRequest(
            email="staff@example.com",
            role=ClubRole.STAFF_MEMBER,
            full_name="Legacy Staff",
            temporary_password="TempPassword123!",
        )

    # Club Owner role cannot be assigned through staff management
    with pytest.raises(ValueError, match="Cannot assign Club Owner role through staff management"):
        AddMemberRequest(
            email="owner@example.com",
            role=ClubRole.CLUB_OWNER,
            full_name="Owner Person",
            temporary_password="TempPassword123!",
        )

    # Update member request with valid roles
    update_req = UpdateMemberRequest(
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    assert update_req.role == ClubRole.TOURNAMENT_DIRECTOR

    # Update member request rejects Staff Member
    with pytest.raises(ValueError, match="Staff Member is no longer an assignable built-in role"):
        UpdateMemberRequest(role=ClubRole.STAFF_MEMBER)

    # Update member request rejects Club Owner
    with pytest.raises(ValueError, match="Cannot assign Club Owner role through staff management"):
        UpdateMemberRequest(role=ClubRole.CLUB_OWNER)

    # Response serialization for legacy staff member record
    now = datetime.now(timezone.utc)
    res = MemberResponse(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        club_id=uuid.uuid4(),
        role=ClubRole.STAFF_MEMBER,
        role_label="Staff Member (Legacy)",
        is_active=True,
        user_email="legacy_staff@example.com",
        user_full_name="Staff Person",
        created_at=now,
        updated_at=now,
    )
    assert res.role == ClubRole.STAFF_MEMBER
    assert res.role_label == "Staff Member (Legacy)"


@pytest.mark.asyncio
async def test_staff_member_db_model_persistence():
    """Verify ClubMembership SQLAlchemy model handles STAFF_MEMBER enum cleanly."""
    membership = ClubMembership(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        club_id=uuid.uuid4(),
        role=ClubRole.STAFF_MEMBER,
        is_active=True,
    )
    assert membership.role == ClubRole.STAFF_MEMBER
    assert membership.role.display_label == "Staff Member"

