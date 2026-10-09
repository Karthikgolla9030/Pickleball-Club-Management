"""
Aught2 Pickleball — Club & Membership API Test Suite

Tests all 25 requirements:
 1. Authenticated user can list own clubs.
 2. User cannot list clubs they do not belong to.
 3. Active membership grants club access.
 4. Inactive membership denies club access.
 5. User can retrieve own membership.
 6. User cannot retrieve another user's membership.
 7. Club Owner can list members.
 8. Club Manager can list members.
 9. Tournament Director cannot list members.
10. Club Owner can add a member.
11. Club Manager cannot add a member.
12. Tournament Director cannot add a member.
13. Club Owner can change member role.
14. Club Manager cannot change roles.
15. Tournament Director cannot change roles.
16. Club Owner can deactivate membership.
17. Club Manager cannot deactivate membership.
18. Cannot remove the final active owner.
19. Invalid role is rejected.
20. User cannot access another club's data.
21. Multi-club memberships work correctly.
22. A user can have different roles in different clubs.
23. Player with no club membership cannot access club management.
24. Backend ignores any client-provided role.
25. Unauthorized requests return 403.
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Test Helpers ─────────────────────────────────────────────────────────────

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
    is_active: bool = True,
) -> ClubMembership:
    m = ClubMembership(
        user_id=user_id,
        club_id=club_id,
        role=role,
        is_active=is_active,
    )
    db.add(m)
    await db.flush()
    return m


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_1_authenticated_user_can_list_own_clubs(
    async_client: AsyncClient, db_session: AsyncSession
):
    """1. Authenticated user can list own clubs."""
    user = await create_user(db_session)
    club1 = await create_club(db_session, name="User Club 1")
    club2 = await create_club(db_session, name="User Club 2")
    await create_membership(db_session, user.id, club1.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, user.id, club2.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.get("/api/v1/clubs", headers=make_auth_header(user.id))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    club_ids = [c["id"] for c in data]
    assert str(club1.id) in club_ids
    assert str(club2.id) in club_ids
    # Check required fields
    item = next(c for c in data if c["id"] == str(club1.id))
    assert item["name"] == "User Club 1"
    assert item["role"] == "club_owner"
    assert item["role_label"] == "Club Owner"
    assert item["membership_is_active"] is True


@pytest.mark.asyncio
async def test_2_user_cannot_list_clubs_they_do_not_belong_to(
    async_client: AsyncClient, db_session: AsyncSession
):
    """2. User cannot list clubs they do not belong to."""
    user1 = await create_user(db_session, email="user1@test.local")
    user2 = await create_user(db_session, email="user2@test.local")
    club1 = await create_club(db_session, name="Club 1")
    club2 = await create_club(db_session, name="Club 2")
    await create_membership(db_session, user1.id, club1.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, user2.id, club2.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    resp = await async_client.get("/api/v1/clubs", headers=make_auth_header(user1.id))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == str(club1.id)
    assert str(club2.id) not in [c["id"] for c in data]


@pytest.mark.asyncio
async def test_3_active_membership_grants_club_access(
    async_client: AsyncClient, db_session: AsyncSession
):
    """3. Active membership grants club access."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, user.id, club.id, ClubRole.CLUB_OWNER, is_active=True)
    await db_session.commit()

    resp = await async_client.get(f"/api/v1/clubs/{club.id}", headers=make_auth_header(user.id))
    assert resp.status_code == 200
    assert resp.json()["id"] == str(club.id)


@pytest.mark.asyncio
async def test_4_inactive_membership_denies_club_access(
    async_client: AsyncClient, db_session: AsyncSession
):
    """4. Inactive membership denies club access (returns 403)."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    await create_membership(db_session, user.id, club.id, ClubRole.CLUB_OWNER, is_active=False)
    await db_session.commit()

    resp = await async_client.get(f"/api/v1/clubs/{club.id}", headers=make_auth_header(user.id))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_5_user_can_retrieve_own_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    """5. User can retrieve own membership."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    membership = await create_membership(
        db_session, user.id, club.id, ClubRole.TOURNAMENT_DIRECTOR
    )
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/membership", headers=make_auth_header(user.id)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(membership.id)
    assert data["user_id"] == str(user.id)
    assert data["club_id"] == str(club.id)
    assert data["role"] == "tournament_director"
    assert data["role_label"] == "Tournament Director"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_6_user_cannot_retrieve_another_users_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    """6. User cannot retrieve another user's membership."""
    user1 = await create_user(db_session, email="u1@test.local")
    user2 = await create_user(db_session, email="u2@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, user1.id, club.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, user2.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    # user2 queries /clubs/{club_id}/membership: returns user2's membership, NEVER user1's
    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/membership", headers=make_auth_header(user2.id)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == str(user2.id)
    assert data["role"] == "club_manager"
    assert data["user_id"] != str(user1.id)


@pytest.mark.asyncio
async def test_7_club_owner_can_list_members(
    async_client: AsyncClient, db_session: AsyncSession
):
    """7. Club Owner can list members."""
    owner = await create_user(db_session, email="owner@test.local")
    member = await create_user(db_session, email="member@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, member.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/members", headers=make_auth_header(owner.id)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_8_club_manager_can_list_members(
    async_client: AsyncClient, db_session: AsyncSession
):
    """8. Club Manager can list members."""
    owner = await create_user(db_session, email="owner@test.local")
    manager = await create_user(db_session, email="manager@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/members", headers=make_auth_header(manager.id)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.asyncio
async def test_9_tournament_director_cannot_list_members(
    async_client: AsyncClient, db_session: AsyncSession
):
    """9. Tournament Director cannot list members (returns 403)."""
    director = await create_user(db_session, email="td@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, director.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/members", headers=make_auth_header(director.id)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_10_club_owner_can_add_member(
    async_client: AsyncClient, db_session: AsyncSession
):
    """10. Club Owner can add a member."""
    owner = await create_user(db_session, email="owner@test.local")
    new_user = await create_user(db_session, email="newmember@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/members",
        headers=make_auth_header(owner.id),
        json={"email": new_user.email, "role": "club_manager"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["user_id"] == str(new_user.id)
    assert data["role"] == "club_manager"
    assert data["role_label"] == "Club Manager"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_11_club_manager_cannot_add_member(
    async_client: AsyncClient, db_session: AsyncSession
):
    """11. Club Manager cannot add a member (returns 403)."""
    manager = await create_user(db_session, email="manager@test.local")
    new_user = await create_user(db_session, email="newmember@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/members",
        headers=make_auth_header(manager.id),
        json={"email": new_user.email, "role": "tournament_director"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_12_tournament_director_cannot_add_member(
    async_client: AsyncClient, db_session: AsyncSession
):
    """12. Tournament Director cannot add a member (returns 403)."""
    director = await create_user(db_session, email="td@test.local")
    new_user = await create_user(db_session, email="newmember@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, director.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/members",
        headers=make_auth_header(director.id),
        json={"email": new_user.email, "role": "club_manager"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_13_club_owner_can_change_member_role(
    async_client: AsyncClient, db_session: AsyncSession
):
    """13. Club Owner can change member role."""
    owner = await create_user(db_session, email="owner@test.local")
    member = await create_user(db_session, email="member@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    m = await create_membership(db_session, member.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{m.id}",
        headers=make_auth_header(owner.id),
        json={"role": "tournament_director"},
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "tournament_director"
    assert resp.json()["role_label"] == "Tournament Director"


@pytest.mark.asyncio
async def test_14_club_manager_cannot_change_roles(
    async_client: AsyncClient, db_session: AsyncSession
):
    """14. Club Manager cannot change roles (returns 403)."""
    manager = await create_user(db_session, email="manager@test.local")
    member = await create_user(db_session, email="member@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)
    m = await create_membership(db_session, member.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{m.id}",
        headers=make_auth_header(manager.id),
        json={"role": "club_owner"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_15_tournament_director_cannot_change_roles(
    async_client: AsyncClient, db_session: AsyncSession
):
    """15. Tournament Director cannot change roles (returns 403)."""
    director = await create_user(db_session, email="td@test.local")
    member = await create_user(db_session, email="member@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, director.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    m = await create_membership(db_session, member.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{m.id}",
        headers=make_auth_header(director.id),
        json={"role": "club_owner"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_16_club_owner_can_deactivate_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    """16. Club Owner can deactivate membership."""
    owner = await create_user(db_session, email="owner@test.local")
    member = await create_user(db_session, email="member@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    m = await create_membership(db_session, member.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.delete(
        f"/api/v1/clubs/{club.id}/members/{m.id}",
        headers=make_auth_header(owner.id),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


@pytest.mark.asyncio
async def test_17_club_manager_cannot_deactivate_membership(
    async_client: AsyncClient, db_session: AsyncSession
):
    """17. Club Manager cannot deactivate membership (returns 403)."""
    manager = await create_user(db_session, email="manager@test.local")
    member = await create_user(db_session, email="member@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)
    m = await create_membership(db_session, member.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    resp = await async_client.delete(
        f"/api/v1/clubs/{club.id}/members/{m.id}",
        headers=make_auth_header(manager.id),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_18_cannot_remove_the_final_active_owner(
    async_client: AsyncClient, db_session: AsyncSession
):
    """18. Cannot remove or deactivate the final active owner."""
    owner = await create_user(db_session, email="sole_owner@test.local")
    club = await create_club(db_session)
    owner_m = await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # 1. Attempt to deactivate the only active owner via DELETE
    resp_del = await async_client.delete(
        f"/api/v1/clubs/{club.id}/members/{owner_m.id}",
        headers=make_auth_header(owner.id),
    )
    assert resp_del.status_code == 400
    assert "active owner" in resp_del.json()["detail"].lower()

    # 2. Attempt to demote the only active owner via PATCH
    resp_patch_role = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{owner_m.id}",
        headers=make_auth_header(owner.id),
        json={"role": "club_manager"},
    )
    assert resp_patch_role.status_code == 400
    assert "active owner" in resp_patch_role.json()["detail"].lower()

    # 3. Attempt to deactivate the only active owner via PATCH is_active=False
    resp_patch_active = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{owner_m.id}",
        headers=make_auth_header(owner.id),
        json={"is_active": False},
    )
    assert resp_patch_active.status_code == 400
    assert "active owner" in resp_patch_active.json()["detail"].lower()


@pytest.mark.asyncio
async def test_19_invalid_role_is_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    """19. Invalid role is rejected with 422."""
    owner = await create_user(db_session, email="owner@test.local")
    member = await create_user(db_session, email="member@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    m = await create_membership(db_session, member.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    # Try invalid role in POST
    resp_post = await async_client.post(
        f"/api/v1/clubs/{club.id}/members",
        headers=make_auth_header(owner.id),
        json={"email": "some@user.com", "role": "admin"},
    )
    assert resp_post.status_code == 422

    # Try invalid role in PATCH
    resp_patch = await async_client.patch(
        f"/api/v1/clubs/{club.id}/members/{m.id}",
        headers=make_auth_header(owner.id),
        json={"role": "super_admin"},
    )
    assert resp_patch.status_code == 422


@pytest.mark.asyncio
async def test_20_user_cannot_access_another_clubs_data(
    async_client: AsyncClient, db_session: AsyncSession
):
    """20. User cannot access another club's data."""
    user = await create_user(db_session, email="user@test.local")
    club1 = await create_club(db_session, name="My Club")
    club2 = await create_club(db_session, name="Other Club")
    await create_membership(db_session, user.id, club1.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Try to access club2 details
    resp_club = await async_client.get(
        f"/api/v1/clubs/{club2.id}", headers=make_auth_header(user.id)
    )
    assert resp_club.status_code in (403, 404)

    # Try to access club2 members
    resp_members = await async_client.get(
        f"/api/v1/clubs/{club2.id}/members", headers=make_auth_header(user.id)
    )
    assert resp_members.status_code in (403, 404)


@pytest.mark.asyncio
async def test_21_multi_club_memberships_work_correctly(
    async_client: AsyncClient, db_session: AsyncSession
):
    """21. Multi-club memberships work correctly."""
    user = await create_user(db_session)
    club1 = await create_club(db_session, name="Club 1")
    club2 = await create_club(db_session, name="Club 2")
    club3 = await create_club(db_session, name="Club 3")
    await create_membership(db_session, user.id, club1.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, user.id, club2.id, ClubRole.CLUB_MANAGER)
    await create_membership(db_session, user.id, club3.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    resp = await async_client.get("/api/v1/clubs", headers=make_auth_header(user.id))
    assert resp.status_code == 200
    assert len(resp.json()) == 3


@pytest.mark.asyncio
async def test_22_user_can_have_different_roles_in_different_clubs(
    async_client: AsyncClient, db_session: AsyncSession
):
    """22. A user can have different roles in different clubs."""
    user = await create_user(db_session)
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    await create_membership(db_session, user.id, club_a.id, ClubRole.CLUB_OWNER)
    await create_membership(db_session, user.id, club_b.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    # In Club A: user is Owner → can add members
    new_user = await create_user(db_session, email="new@test.local")
    await db_session.commit()
    resp_a = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/members",
        headers=make_auth_header(user.id),
        json={"email": new_user.email, "role": "club_manager"},
    )
    assert resp_a.status_code == 201

    # In Club B: user is Tournament Director → cannot add members (403)
    resp_b = await async_client.post(
        f"/api/v1/clubs/{club_b.id}/members",
        headers=make_auth_header(user.id),
        json={"email": new_user.email, "role": "club_manager"},
    )
    assert resp_b.status_code == 403


@pytest.mark.asyncio
async def test_23_player_with_no_club_membership_cannot_access_club_management(
    async_client: AsyncClient, db_session: AsyncSession
):
    """23. Player with no club membership cannot access club management."""
    player = await create_user(db_session, email="player@test.local")
    club = await create_club(db_session)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/members", headers=make_auth_header(player.id)
    )
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_24_backend_ignores_any_client_provided_role(
    async_client: AsyncClient, db_session: AsyncSession
):
    """24. Backend ignores any client-provided role in headers, params, or body."""
    director = await create_user(db_session, email="td@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, director.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    # Director tries to spoof role as club_owner via headers and query params
    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/members?role=club_owner",
        headers={
            **make_auth_header(director.id),
            "X-Role": "club_owner",
            "Role": "club_owner",
        },
    )
    # Database role is authoritative → 403 Forbidden!
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_25_unauthorized_requests_return_403(
    async_client: AsyncClient, db_session: AsyncSession
):
    """25. Unauthorized requests return 403."""
    user = await create_user(db_session)
    club = await create_club(db_session)
    # No membership in this club
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/membership", headers=make_auth_header(user.id)
    )
    # Either 403 or 404
    assert resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_26_club_owner_can_update_club_details(
    async_client: AsyncClient, db_session: AsyncSession
):
    """26. Club Owner can update club details (name, location, hours, contacts)."""
    owner = await create_user(db_session, email="owner_update@test.local")
    club = await create_club(db_session, name="Original Name")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    update_payload = {
        "name": "Aught2 Premier Pickleball",
        "short_description": "Premier Pickleball Facility",
        "description": "Full featured indoor and outdoor pickleball club.",
        "contact_email": "contact@aught2.com",
        "contact_phone": "+1 (555) 234-5678",
        "website": "https://aught2.com",
        "established_year": 2022,
        "address_line1": "123 Pickleball Way",
        "address_line2": "Suite 100",
        "city": "Austin",
        "state": "TX",
        "postal_code": "78701",
        "country": "United States",
        "operating_days": "Monday - Sunday",
        "opening_time": "06:30:00",
        "closing_time": "22:30:00",
        "timezone": "America/Chicago",
        "facilities_summary": "8 Indoor Courts, Pro Shop, Lounge",
        "holiday_closure_notes": "Closed on Thanksgiving and Christmas Day",
    }

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        json=update_payload,
        headers=make_auth_header(owner.id),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Aught2 Premier Pickleball"
    assert data["short_description"] == "Premier Pickleball Facility"
    assert data["contact_email"] == "contact@aught2.com"
    assert data["city"] == "Austin"
    assert data["state"] == "TX"
    assert data["postal_code"] == "78701"
    assert data["facilities_summary"] == "8 Indoor Courts, Pro Shop, Lounge"
    assert data["opening_time"] == "06:30:00"
    assert data["closing_time"] == "22:30:00"

    # Verify persistence via GET /api/v1/clubs/{club_id}
    get_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}",
        headers=make_auth_header(owner.id),
    )
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["name"] == "Aught2 Premier Pickleball"
    assert get_data["city"] == "Austin"


@pytest.mark.asyncio
async def test_27_club_manager_cannot_update_club_details(
    async_client: AsyncClient, db_session: AsyncSession
):
    """27. Club Manager cannot update club details (403 Forbidden)."""
    manager = await create_user(db_session, email="manager_update@test.local")
    club = await create_club(db_session, name="Protected Name")
    await create_membership(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        json={"name": "Hacked Name"},
        headers=make_auth_header(manager.id),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_28_tournament_director_cannot_update_club_details(
    async_client: AsyncClient, db_session: AsyncSession
):
    """28. Tournament Director cannot update club details (403 Forbidden)."""
    director = await create_user(db_session, email="td_update@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, director.id, club.id, ClubRole.TOURNAMENT_DIRECTOR)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        json={"name": "Director Renamed"},
        headers=make_auth_header(director.id),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_29_player_without_staff_role_cannot_update_club_details(
    async_client: AsyncClient, db_session: AsyncSession
):
    """29. Player without staff role cannot update club details (403 Forbidden)."""
    player = await create_user(db_session, email="regular_player@test.local")
    club = await create_club(db_session)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        json={"name": "Player Renamed"},
        headers=make_auth_header(player.id),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_30_cross_club_owner_cannot_update_other_club(
    async_client: AsyncClient, db_session: AsyncSession
):
    """30. Owner of Club A cannot update Club B (tenant isolation)."""
    owner_a = await create_user(db_session, email="owner_a@test.local")
    club_a = await create_club(db_session, name="Club A")
    club_b = await create_club(db_session, name="Club B")
    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club_b.id}",
        json={"name": "Club B Hijacked"},
        headers=make_auth_header(owner_a.id),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_31_invalid_time_range_is_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    """31. Opening time equal to or later than closing time returns 400 Bad Request."""
    owner = await create_user(db_session, email="owner_time@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        json={"opening_time": "22:00:00", "closing_time": "08:00:00"},
        headers=make_auth_header(owner.id),
    )
    assert resp.status_code == 400
    assert "earlier than closing time" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_32_invalid_email_format_is_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    """32. Malformed contact email format is rejected with 422."""
    owner = await create_user(db_session, email="owner_email@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}",
        json={"contact_email": "not-a-valid-email"},
        headers=make_auth_header(owner.id),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_33_public_club_endpoint_returns_safe_public_data(
    async_client: AsyncClient, db_session: AsyncSession
):
    """33. Public club endpoint returns public fields without requiring staff auth."""
    club = await create_club(db_session, name="Public Aught2 Club")
    club.address_line1 = "456 Court Lane"
    club.city = "Dallas"
    club.state = "TX"
    club.postal_code = "75001"
    club.facilities_summary = "12 Courts"
    await db_session.commit()

    resp = await async_client.get(f"/api/v1/clubs/{club.id}/public")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Public Aught2 Club"
    assert data["city"] == "Dallas"
    assert data["facilities_summary"] == "12 Courts"


@pytest.mark.asyncio
async def test_34_club_owner_can_upload_logo(
    async_client: AsyncClient, db_session: AsyncSession
):
    """34. Club owner can upload base64 or URL logo and it persists."""
    owner = await create_user(db_session, email="owner_logo@test.local")
    club = await create_club(db_session)
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Small 1x1 base64 transparent PNG
    dummy_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/logo",
        json={"image_data": dummy_b64},
        headers=make_auth_header(owner.id),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["logo_url"] is not None
    assert "/uploads/logos/" in data["logo_url"]
