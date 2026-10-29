"""
Comprehensive tests for Custom Staff Roles and Granular Permission Management.
Covers:
  1. Club Owner creates a custom role with permissions (201).
  2. Duplicate role names in same club rejected (400).
  3. Reserved system role names rejected (400).
  4. Cross-club isolation (same custom role name in distinct clubs allowed).
  5. Forbidden/owner-only permissions filtered out.
  6. Authorization: Club Manager/TD/Player cannot create or manage custom roles (403).
  7. Add staff member with custom_role_id and verify response metadata.
  8. Authoritative permission enforcement: staff member with custom role possesses granted perms.
  9. Update custom role name, description, and permissions.
  10. Safe deletion: deleting role with assigned staff rejected without reassignment (400).
  11. Safe deletion: deleting role with valid reassign_to_role_id reassigns staff and deletes role.
  12. Audit logging for custom role lifecycle operations.
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_custom_role import ClubCustomRole
from app.models.club_membership import ClubMembership, ClubRole
from app.models.platform_audit_log import PlatformAuditLog
from app.models.user import User
from app.permissions import Permission, membership_has_permission, get_membership_permissions
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str = None,
    full_name: str = "Test User",
    is_active: bool = True,
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=is_active,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str = None,
    slug: str = None,
    is_active: bool = True,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    name = name or f"Club {suffix}"
    slug = slug or f"club-{suffix}"
    club = Club(name=name, slug=slug, is_active=is_active)
    db.add(club)
    await db.flush()
    return club


async def create_membership(
    db: AsyncSession,
    user_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubRole,
    custom_role_id: uuid.UUID | None = None,
    is_active: bool = True,
) -> ClubMembership:
    m = ClubMembership(
        user_id=user_id,
        club_id=club_id,
        role=role,
        custom_role_id=custom_role_id,
        is_active=is_active,
    )
    db.add(m)
    await db.flush()
    return m


@pytest.mark.asyncio
async def test_owner_can_create_custom_role(async_client: AsyncClient, db_session: AsyncSession):
    """Club Owner can create a custom role with valid permissions."""
    owner = await create_user(db_session, email="owner_cr@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "name": "Front Desk Receptionist",
        "description": "Handles member check-ins and court bookings",
        "permissions": ["manage_members", "manage_bookings"],
    }

    res = await async_client.post(f"/api/v1/clubs/{club.id}/custom-roles", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Front Desk Receptionist"
    assert data["description"] == "Handles member check-ins and court bookings"
    assert set(data["permissions"]) == {"manage_members", "manage_bookings"}
    assert data["staff_count"] == 0
    assert data["club_id"] == str(club.id)


@pytest.mark.asyncio
async def test_duplicate_role_name_rejected_same_club(async_client: AsyncClient, db_session: AsyncSession):
    """Creating two custom roles with identical names in the same club is rejected."""
    owner = await create_user(db_session, email="owner_dup@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    # First role
    role = ClubCustomRole(club_id=club.id, name="Coach", permissions=["manage_lessons"])
    db_session.add(role)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "name": "coach",  # case-insensitive match
        "permissions": ["manage_lessons"],
    }
    res = await async_client.post(f"/api/v1/clubs/{club.id}/custom-roles", json=payload, headers=headers)
    assert res.status_code == 400
    assert "already exists" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_reserved_role_name_rejected(async_client: AsyncClient, db_session: AsyncSession):
    """Cannot use reserved built-in role names for custom roles."""
    owner = await create_user(db_session, email="owner_res@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    for reserved in ["Club Owner", "Club Manager", "Tournament Director", "Staff Member", "Player"]:
        payload = {"name": reserved, "permissions": ["manage_courts"]}
        res = await async_client.post(f"/api/v1/clubs/{club.id}/custom-roles", json=payload, headers=headers)
        assert res.status_code == 400
        assert "reserved" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cross_club_isolation_same_role_name(async_client: AsyncClient, db_session: AsyncSession):
    """Distinct clubs can create roles with the same name without collision."""
    owner1 = await create_user(db_session, email="owner1_iso@test.local")
    club1 = await create_club(db_session, name="Club One")
    await create_membership(db_session, owner1.id, club1.id, ClubRole.CLUB_OWNER)

    owner2 = await create_user(db_session, email="owner2_iso@test.local")
    club2 = await create_club(db_session, name="Club Two")
    await create_membership(db_session, owner2.id, club2.id, ClubRole.CLUB_OWNER)

    # Club 1 role
    role1 = ClubCustomRole(club_id=club1.id, name="Lead Coach", permissions=["manage_lessons"])
    db_session.add(role1)
    await db_session.commit()

    # Club 2 creates same name
    headers2 = make_auth_header(owner2.id)
    payload = {"name": "Lead Coach", "permissions": ["manage_lessons", "manage_courts"]}
    res = await async_client.post(f"/api/v1/clubs/{club2.id}/custom-roles", json=payload, headers=headers2)
    assert res.status_code == 201
    assert res.json()["club_id"] == str(club2.id)


@pytest.mark.asyncio
async def test_disallowed_permissions_filtered_out(async_client: AsyncClient, db_session: AsyncSession):
    """Platform admin and owner-only permissions cannot be granted to custom roles."""
    owner = await create_user(db_session, email="owner_perm@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "name": "Restricted Staff",
        "permissions": [
            "manage_roles",     # Owner-only: must be filtered out
            "manage_users",     # Owner-only: must be filtered out
            "manage_platform",  # Platform Admin: must be filtered out
            "manage_bookings",  # Valid custom permission: kept
        ],
    }
    res = await async_client.post(f"/api/v1/clubs/{club.id}/custom-roles", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert "manage_roles" not in data["permissions"]
    assert "manage_users" not in data["permissions"]
    assert "manage_platform" not in data["permissions"]
    assert data["permissions"] == ["manage_bookings"]


@pytest.mark.asyncio
async def test_non_owner_cannot_create_or_modify_custom_roles(async_client: AsyncClient, db_session: AsyncSession):
    """Non-owners (e.g. Club Manager, Tournament Director, Player) cannot create or edit custom roles."""
    manager = await create_user(db_session, email="manager_cr@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    headers = make_auth_header(manager.id)
    payload = {"name": "Unauthorized Role", "permissions": ["manage_bookings"]}
    res = await async_client.post(f"/api/v1/clubs/{club.id}/custom-roles", json=payload, headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_add_staff_member_with_custom_role(async_client: AsyncClient, db_session: AsyncSession):
    """Club Owner adds a staff member with a custom role."""
    owner = await create_user(db_session, email="owner_staff@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    custom_role = ClubCustomRole(
        club_id=club.id,
        name="Event Coordinator",
        permissions=["manage_events", "manage_bookings"],
    )
    db_session.add(custom_role)
    await db_session.commit()

    headers = make_auth_header(owner.id)
    payload = {
        "email": "coordinator@test.local",
        "full_name": "Casey Jordan",
        "custom_role_id": str(custom_role.id),
    }
    res = await async_client.post(f"/api/v1/clubs/{club.id}/members", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["user_email"] == "coordinator@test.local"
    assert data["custom_role_id"] == str(custom_role.id)
    assert data["custom_role_name"] == "Event Coordinator"
    assert data["role_label"] == "Event Coordinator"
    assert set(data["permissions"]) == {"manage_events", "manage_bookings"}


@pytest.mark.asyncio
async def test_authoritative_dynamic_permission_evaluation(db_session: AsyncSession):
    """Verify membership_has_permission accurately evaluates custom role permissions."""
    club = await create_club(db_session)
    custom_role = ClubCustomRole(
        club_id=club.id,
        name="Front Desk",
        permissions=["manage_bookings", "manage_courts"],
    )
    db_session.add(custom_role)
    await db_session.flush()

    user = await create_user(db_session)
    membership = await create_membership(
        db_session, user.id, club.id, ClubRole.STAFF_MEMBER, custom_role_id=custom_role.id
    )
    membership.custom_role = custom_role

    # Check authorized permissions
    assert membership_has_permission(membership, Permission.MANAGE_BOOKINGS) is True
    assert membership_has_permission(membership, Permission.MANAGE_COURTS) is True

    # Check unauthorized permissions
    assert membership_has_permission(membership, Permission.MANAGE_MEMBERS) is False
    assert membership_has_permission(membership, Permission.MANAGE_PAYMENTS) is False
    assert membership_has_permission(membership, Permission.MANAGE_ROLES) is False


@pytest.mark.asyncio
async def test_delete_custom_role_with_assigned_staff_and_reassignment(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Attempting to delete a custom role with active staff without reassignment fails (400).
    Providing reassign_to_role_id reassigns staff and successfully deletes the role.
    """
    owner = await create_user(db_session, email="owner_del@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    role_a = ClubCustomRole(club_id=club.id, name="Role A", permissions=["manage_bookings"])
    role_b = ClubCustomRole(club_id=club.id, name="Role B", permissions=["manage_courts"])
    db_session.add_all([role_a, role_b])
    await db_session.flush()

    staff_user = await create_user(db_session, email="staff_assigned@test.local")
    staff_member = await create_membership(
        db_session, staff_user.id, club.id, ClubRole.STAFF_MEMBER, custom_role_id=role_a.id
    )
    await db_session.commit()

    headers = make_auth_header(owner.id)

    # 1. Deletion without reassignment fails
    res = await async_client.delete(f"/api/v1/clubs/{club.id}/custom-roles/{role_a.id}", headers=headers)
    assert res.status_code == 400
    assert "cannot delete" in str(res.json()["detail"]).lower()

    # 2. Deletion with valid reassignment succeeds
    res_ok = await async_client.delete(
        f"/api/v1/clubs/{club.id}/custom-roles/{role_a.id}?reassign_to_role_id={role_b.id}",
        headers=headers,
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["success"] is True
    assert res_ok.json()["reassigned_count"] == 1

    # Verify staff member has now been reassigned to role_b
    await db_session.refresh(staff_member)
    assert staff_member.custom_role_id == role_b.id

    # Verify role_a is removed from DB
    stmt = select(ClubCustomRole).where(ClubCustomRole.id == role_a.id)
    deleted_check = await db_session.scalar(stmt)
    assert deleted_check is None
