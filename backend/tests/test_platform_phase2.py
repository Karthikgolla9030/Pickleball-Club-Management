"""
Pickleball Multi-Club Platform — Platform Admin Phase 2 Tests

Validates:
1. Platform Users Directory:
   - Platform owner authorization (401/403 for unauthorized users)
   - Pagination (total, limit, offset)
   - Search by name, email, and user UUID
   - Filters: is_active, club_id, role ('club_owner', 'player')
   - Multi-club users: user holding multiple distinct roles across multiple clubs returned with 0 duplicates
   - Sensitive credential exclusion (no passwords or hashed_password in payload)
   - Detailed user lookup by ID (GET /platform/users/{id}) and 404 for missing IDs
2. Club Suspension & Reactivation:
   - Platform owner can suspend an active club with administrative reason
   - Platform owner can reactivate a suspended club with administrative reason
   - Unauthorized access denied (403 for non-platform owners)
   - Invalid club ID returns 404
   - Invalid status transitions (suspending already suspended club) rejected with 400
   - Reason validation (reason < 5 chars) rejected with 422
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.player_profile import PlayerProfile
from app.models.user import User
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    password: str = "SecurePass123!",
    full_name: str = "Test User",
    is_active: bool = True,
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=is_active,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str = "Test Club",
    slug: str | None = None,
    is_active: bool = True,
) -> Club:
    slug = slug or f"club-{uuid.uuid4().hex[:8]}"
    club = Club(
        name=name,
        slug=slug,
        is_active=is_active,
    )
    db.add(club)
    await db.flush()
    return club


async def add_membership(
    db: AsyncSession,
    user_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubRole = ClubRole.CLUB_OWNER,
    is_active: bool = True,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user_id,
        club_id=club_id,
        role=role,
        is_active=is_active,
    )
    db.add(membership)
    await db.flush()
    return membership


async def get_platform_owner_header(
    async_client: AsyncClient,
    db_session: AsyncSession,
) -> dict[str, str]:
    settings = get_settings()
    platform_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@admin.com"
    await create_user(db_session, email=platform_email, password="AdminPass123!", full_name="Platform Owner")
    await db_session.commit()

    res = await async_client.post(
        "/api/v1/auth/platform/login",
        json={"email": platform_email, "password": "AdminPass123!"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ─── 1. Platform Users Directory Tests ────────────────────────────────────────

@pytest.mark.asyncio
async def test_users_directory_authorization(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Unauthenticated calls return 401/403, and ordinary users are denied with 403."""
    # 1. Unauthenticated
    resp_unauth = await async_client.get("/api/v1/platform/users")
    assert resp_unauth.status_code in (401, 403)

    # 2. Authenticated as non-platform owner (regular club staff)
    regular_user = await create_user(db_session, email="staff@test.local")
    club = await create_club(db_session)
    await add_membership(db_session, regular_user.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    staff_headers = make_auth_header(regular_user.id)
    resp_forbidden = await async_client.get("/api/v1/platform/users", headers=staff_headers)
    assert resp_forbidden.status_code == 403
    assert "Platform owner authorization required" in resp_forbidden.text


@pytest.mark.asyncio
async def test_users_directory_pagination_and_sensitive_field_exclusion(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Platform owner can list users with pagination, and passwords/hashes are strictly excluded."""
    headers = await get_platform_owner_header(async_client, db_session)

    # Create 3 users
    u1 = await create_user(db_session, email="alice_test@users.local", full_name="Alice Smith")
    u2 = await create_user(db_session, email="bob_test@users.local", full_name="Bob Jones")
    u3 = await create_user(db_session, email="charlie_test@users.local", full_name="Charlie Brown")
    await db_session.commit()

    # Query with page_size=2
    resp = await async_client.get("/api/v1/platform/users?page=1&page_size=2", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total"] >= 3
    assert len(data["items"]) == 2

    # Check sensitive field exclusion on all returned items
    for item in data["items"]:
        assert "password" not in item
        assert "hashed_password" not in item
        assert "password_hash" not in item
        assert "token" not in item
        assert "secret" not in item
        assert "id" in item
        assert "email" in item
        assert "is_active" in item


@pytest.mark.asyncio
async def test_users_directory_search_and_filtering(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Search by name, email, or user UUID, and filter by is_active, club_id, and role."""
    headers = await get_platform_owner_header(async_client, db_session)

    club_a = await create_club(db_session, name="Metropolitan Pickleball")
    club_b = await create_club(db_session, name="Suburban Courts")

    target_user = await create_user(
        db_session,
        email="unique_search_target@platform.local",
        full_name="Samantha Raye",
        is_active=True,
    )
    await add_membership(db_session, target_user.id, club_a.id, ClubRole.CLUB_OWNER)

    inactive_user = await create_user(
        db_session,
        email="inactive_user@platform.local",
        full_name="Inactive Person",
        is_active=False,
    )

    await db_session.commit()

    # Search by partial email
    res_search_email = await async_client.get(
        "/api/v1/platform/users?search=unique_search_target",
        headers=headers,
    )
    assert res_search_email.status_code == 200
    items = res_search_email.json()["items"]
    assert any(u["id"] == str(target_user.id) for u in items)

    # Search by full name
    res_search_name = await async_client.get(
        "/api/v1/platform/users?search=Samantha",
        headers=headers,
    )
    assert res_search_name.status_code == 200
    items = res_search_name.json()["items"]
    assert any(u["id"] == str(target_user.id) for u in items)

    # Search by exact UUID
    res_search_id = await async_client.get(
        f"/api/v1/platform/users?search={target_user.id}",
        headers=headers,
    )
    assert res_search_id.status_code == 200
    items = res_search_id.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(target_user.id)

    # Filter by club_id
    res_club_filter = await async_client.get(
        f"/api/v1/platform/users?club_id={club_a.id}",
        headers=headers,
    )
    assert res_club_filter.status_code == 200
    club_user_ids = [u["id"] for u in res_club_filter.json()["items"]]
    assert str(target_user.id) in club_user_ids

    # Filter by role
    res_role_filter = await async_client.get(
        "/api/v1/platform/users?role=club_owner",
        headers=headers,
    )
    assert res_role_filter.status_code == 200
    role_user_ids = [u["id"] for u in res_role_filter.json()["items"]]
    assert str(target_user.id) in role_user_ids

    # Filter by is_active=false
    res_inactive = await async_client.get(
        "/api/v1/platform/users?is_active=false",
        headers=headers,
    )
    assert res_inactive.status_code == 200
    inactive_ids = [u["id"] for u in res_inactive.json()["items"]]
    assert str(inactive_user.id) in inactive_ids
    assert str(target_user.id) not in inactive_ids


@pytest.mark.asyncio
async def test_users_directory_multi_club_user_no_duplicates(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """A user who is Club Owner at Club 1 and Club Manager at Club 2 is returned once with both memberships."""
    headers = await get_platform_owner_header(async_client, db_session)

    club1 = await create_club(db_session, name="Coastal Club")
    club2 = await create_club(db_session, name="Mountain Club")

    multi_user = await create_user(
        db_session,
        email="multi_role_admin@platform.local",
        full_name="Multi Club Executive",
    )
    await add_membership(db_session, multi_user.id, club1.id, ClubRole.CLUB_OWNER)
    await add_membership(db_session, multi_user.id, club2.id, ClubRole.CLUB_MANAGER)

    # Add player membership at club1 as well
    pm = ClubPlayerMembership(
        user_id=multi_user.id,
        club_id=club1.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="MBR-9988",
    )
    db_session.add(pm)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/platform/users?search={multi_user.email}",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    items = data["items"]

    # Must be returned exactly once (no join duplication)
    matching_users = [u for u in items if u["id"] == str(multi_user.id)]
    assert len(matching_users) == 1
    user_record = matching_users[0]

    # Verify both staff memberships are returned
    staff_memberships = user_record["club_memberships"]
    assert len(staff_memberships) == 2
    roles = {m["role"] for m in staff_memberships}
    assert "club_owner" in roles
    assert "club_manager" in roles

    # Verify player membership is also returned
    player_memberships = user_record["club_player_memberships"]
    assert len(player_memberships) == 1
    assert player_memberships[0]["membership_number"] == "MBR-9988"
    assert player_memberships[0]["club_name"] == club1.name


@pytest.mark.asyncio
async def test_get_platform_user_detail(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Retrieve detailed user account and membership information by ID."""
    headers = await get_platform_owner_header(async_client, db_session)

    user = await create_user(db_session, email="inspect_user@platform.local", full_name="Inspectable User")
    club = await create_club(db_session, name="Inspect Club")
    await add_membership(db_session, user.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    # Successful retrieval
    res = await async_client.get(f"/api/v1/platform/users/{user.id}", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == str(user.id)
    assert data["email"] == user.email
    assert data["full_name"] == user.full_name
    assert len(data["club_memberships"]) == 1
    assert data["club_memberships"][0]["role"] == "tournament_director"
    assert data["club_memberships"][0]["club_name"] == club.name

    # 404 for nonexistent user
    fake_id = uuid.uuid4()
    res_404 = await async_client.get(f"/api/v1/platform/users/{fake_id}", headers=headers)
    assert res_404.status_code == 404
    assert "User not found" in res_404.text


# ─── 2. Club Suspension & Reactivation Tests ──────────────────────────────────

@pytest.mark.asyncio
async def test_club_status_update_authorization(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Unauthorized callers cannot suspend or reactivate clubs."""
    club = await create_club(db_session, is_active=True)
    await db_session.commit()

    # 1. Unauthenticated
    res_unauth = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        json={"is_active": False, "reason": "Administrative suspension"},
    )
    assert res_unauth.status_code in (401, 403)

    # 2. Ordinary club owner
    owner_user = await create_user(db_session, email="owner_suspend@test.local")
    await add_membership(db_session, owner_user.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    owner_header = make_auth_header(owner_user.id)
    res_forbidden = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        headers=owner_header,
        json={"is_active": False, "reason": "Unauthorized self suspension attempt"},
    )
    assert res_forbidden.status_code == 403
    assert "Platform owner authorization required" in res_forbidden.text


@pytest.mark.asyncio
async def test_club_status_suspend_and_reactivate_lifecycle(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Platform owner can suspend an active club, then reactivate it with reasons."""
    headers = await get_platform_owner_header(async_client, db_session)

    club = await create_club(db_session, name="Highland Park Club", is_active=True)
    await db_session.commit()

    # 1. Suspend active club
    res_suspend = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        headers=headers,
        json={"is_active": False, "reason": "Failed annual compliance audit."},
    )
    assert res_suspend.status_code == 200, res_suspend.text
    data_suspend = res_suspend.json()
    assert data_suspend["id"] == str(club.id)
    assert data_suspend["is_active"] is False
    assert data_suspend["reason"] == "Failed annual compliance audit."

    # 2. Attempt repeated suspension (invalid transition -> 400)
    res_repeated = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        headers=headers,
        json={"is_active": False, "reason": "Suspending already suspended club."},
    )
    assert res_repeated.status_code == 400
    assert "already suspended" in res_repeated.text.lower()

    # 3. Reactivate suspended club
    res_reactivate = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        headers=headers,
        json={"is_active": True, "reason": "Compliance documentation verified and approved."},
    )
    assert res_reactivate.status_code == 200, res_reactivate.text
    data_reactivate = res_reactivate.json()
    assert data_reactivate["is_active"] is True
    assert data_reactivate["reason"] == "Compliance documentation verified and approved."

    # 4. Attempt repeated reactivation (invalid transition -> 400)
    res_repeated_reactivate = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        headers=headers,
        json={"is_active": True, "reason": "Already active club."},
    )
    assert res_repeated_reactivate.status_code == 400
    assert "already active" in res_repeated_reactivate.text.lower()


@pytest.mark.asyncio
async def test_club_status_validation_errors(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    """Validation errors: missing/too short reason (422) and nonexistent club ID (404)."""
    headers = await get_platform_owner_header(async_client, db_session)

    club = await create_club(db_session, is_active=True)
    await db_session.commit()

    # Reason too short (< 5 chars)
    res_short_reason = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        headers=headers,
        json={"is_active": False, "reason": "Bad"},
    )
    assert res_short_reason.status_code == 422

    # Missing reason
    res_missing_reason = await async_client.patch(
        f"/api/v1/platform/clubs/{club.id}/status",
        headers=headers,
        json={"is_active": False},
    )
    assert res_missing_reason.status_code == 422

    # Nonexistent club ID
    fake_club_id = uuid.uuid4()
    res_404 = await async_client.patch(
        f"/api/v1/platform/clubs/{fake_club_id}/status",
        headers=headers,
        json={"is_active": False, "reason": "Nonexistent club test"},
    )
    assert res_404.status_code == 404
    assert "Club not found" in res_404.text
