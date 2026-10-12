"""
Aught2 Pickleball — Phase 2 Multi-Club Discovery & Membership Request Tests
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_membership_request import (
    ClubMembershipRequest,
    MembershipRequestStatus,
)
from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
)
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.fixture
def client(async_client):
    return async_client


@pytest.fixture
def db(db_session):
    return db_session


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
    city: str = "Austin",
    state: str = "TX",
    is_active: bool = True,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    name = name or f"Club {suffix}"
    slug = slug or f"club-{suffix}"
    club = Club(
        name=name,
        slug=slug,
        city=city,
        state=state,
        is_active=is_active,
        short_description=f"Premier pickleball club in {city}",
    )
    db.add(club)
    await db.flush()
    return club


async def assign_staff(
    db: AsyncSession,
    user: User,
    club: Club,
    role: ClubRole,
    is_active: bool = True,
) -> ClubMembership:
    membership = ClubMembership(
        user_id=user.id,
        club_id=club.id,
        role=role,
        is_active=is_active,
    )
    db.add(membership)
    await db.flush()
    return membership


# ─── 1. Public Club Discovery Tests ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_public_club_discovery_pagination_and_search(
    client: AsyncClient, db: AsyncSession
):
    club1 = await create_club(db, name="Austin Pickleball Hub", city="Austin", state="TX")
    club2 = await create_club(db, name="Dallas Smash Center", city="Dallas", state="TX")
    club3 = await create_club(db, name="Austin Racket Club", city="Austin", state="TX")
    await db.commit()

    # 1. Search by name
    res = await client.get("/api/v1/clubs/public?search=Smash")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    items = data["items"]
    assert any(c["id"] == str(club2.id) for c in items)
    assert not any(c["id"] == str(club1.id) for c in items)

    # 2. Filter by city
    res_city = await client.get("/api/v1/clubs/public?city=Austin")
    assert res_city.status_code == 200
    city_data = res_city.json()
    assert city_data["total"] >= 2
    city_items = city_data["items"]
    assert any(c["id"] == str(club1.id) for c in city_items)
    assert any(c["id"] == str(club3.id) for c in city_items)
    assert not any(c["id"] == str(club2.id) for c in city_items)

    # 3. Pagination
    res_paged = await client.get("/api/v1/clubs/public?page=1&page_size=2")
    assert res_paged.status_code == 200
    paged_data = res_paged.json()
    assert len(paged_data["items"]) <= 2
    assert paged_data["page"] == 1
    assert paged_data["page_size"] == 2


@pytest.mark.asyncio
async def test_public_club_discovery_filters_inactive_clubs(
    client: AsyncClient, db: AsyncSession
):
    active_club = await create_club(db, name="Active Club", is_active=True)
    inactive_club = await create_club(db, name="Inactive Club", is_active=False)
    await db.commit()

    res = await client.get("/api/v1/clubs/public")
    assert res.status_code == 200
    data = res.json()
    item_ids = [c["id"] for c in data["items"]]
    assert str(active_club.id) in item_ids
    assert str(inactive_club.id) not in item_ids


@pytest.mark.asyncio
async def test_public_club_discovery_does_not_leak_private_fields(
    client: AsyncClient, db: AsyncSession
):
    club = await create_club(db, name="Public Club")
    await db.commit()

    res = await client.get(f"/api/v1/clubs/{club.id}/public")
    assert res.status_code == 200
    data = res.json()
    # Check that internal / private fields are absent
    assert "owner_id" not in data
    assert "created_by_user_id" not in data
    assert "stripe_account_id" not in data
    assert "bank_account" not in data
    assert "memberships" not in data
    assert data["name"] == club.name
    assert data["slug"] == club.slug


# ─── 2. Public Membership Plans Tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_public_membership_plans_active_only(
    client: AsyncClient, db: AsyncSession
):
    club = await create_club(db)
    active_plan = MembershipPlan(
        club_id=club.id,
        name="Gold Annual",
        price=500.0,
        duration_unit=PlanDurationUnit.YEARLY,
        status=PlanStatus.ACTIVE,
    )
    inactive_plan = MembershipPlan(
        club_id=club.id,
        name="Old Discontinued",
        price=100.0,
        duration_unit=PlanDurationUnit.MONTHLY,
        status=PlanStatus.INACTIVE,
    )
    db.add_all([active_plan, inactive_plan])
    await db.commit()

    # Public endpoint should return only active plans without requiring auth
    res = await client.get(f"/api/v1/clubs/{club.id}/membership-plans/public")
    assert res.status_code == 200
    plans = res.json()
    plan_ids = [p["id"] for p in plans]
    assert str(active_plan.id) in plan_ids
    assert str(inactive_plan.id) not in plan_ids


# ─── 3. Player Membership Request Lifecycle Tests ─────────────────────────────


@pytest.mark.asyncio
async def test_player_can_submit_membership_request(
    client: AsyncClient, db: AsyncSession
):
    player = await create_user(db, email="applicant@test.local")
    club = await create_club(db)
    await db.commit()

    headers = make_auth_header(player)
    res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=headers,
        json={"message": "I love pickleball and want to join your club!"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["club_id"] == str(club.id)
    assert data["user_id"] == str(player.id)
    assert data["status"] == "pending"
    assert data["message"] == "I love pickleball and want to join your club!"
    assert data["club_name"] == club.name


@pytest.mark.asyncio
async def test_duplicate_pending_membership_request_rejected(
    client: AsyncClient, db: AsyncSession
):
    player = await create_user(db)
    club = await create_club(db)
    await db.commit()

    headers = make_auth_header(player)
    res1 = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=headers,
        json={"message": "First application"},
    )
    assert res1.status_code == 201

    # Second application while first is pending must fail with 400
    res2 = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=headers,
        json={"message": "Second application"},
    )
    assert res2.status_code == 400
    assert "already have a pending membership request" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_active_player_member_request_rejected(
    client: AsyncClient, db: AsyncSession
):
    player = await create_user(db)
    club = await create_club(db)
    # Already an active member
    mem = ClubPlayerMembership(
        user_id=player.id,
        club_id=club.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db.add(mem)
    await db.commit()

    headers = make_auth_header(player)
    res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=headers,
        json={"message": "Join request"},
    )
    assert res.status_code == 400
    assert "already an active player member" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_player_can_view_own_requests_and_status(
    client: AsyncClient, db: AsyncSession
):
    player = await create_user(db)
    club1 = await create_club(db)
    club2 = await create_club(db)
    await db.commit()

    headers = make_auth_header(player)
    await client.post(
        f"/api/v1/player/clubs/{club1.id}/membership-requests",
        headers=headers,
        json={"message": "Request for club 1"},
    )
    await client.post(
        f"/api/v1/player/clubs/{club2.id}/membership-requests",
        headers=headers,
        json={"message": "Request for club 2"},
    )

    # 1. List all requests
    res_list = await client.get("/api/v1/player/membership-requests", headers=headers)
    assert res_list.status_code == 200
    reqs = res_list.json()
    assert len(reqs) == 2

    # 2. Check club-specific request endpoint
    res_single = await client.get(
        f"/api/v1/player/clubs/{club1.id}/membership-request", headers=headers
    )
    assert res_single.status_code == 200
    req1 = res_single.json()
    assert req1["club_id"] == str(club1.id)
    assert req1["status"] == "pending"


@pytest.mark.asyncio
async def test_player_can_withdraw_pending_request(
    client: AsyncClient, db: AsyncSession
):
    player = await create_user(db)
    club = await create_club(db)
    await db.commit()

    headers = make_auth_header(player)
    create_res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=headers,
        json={"message": "Joining"},
    )
    assert create_res.status_code == 201
    req_id = create_res.json()["id"]

    # Withdraw request
    withdraw_res = await client.post(
        f"/api/v1/player/membership-requests/{req_id}/withdraw",
        headers=headers,
    )
    assert withdraw_res.status_code == 200
    assert withdraw_res.json()["status"] == "withdrawn"

    # After withdrawal, player CAN submit a new request
    new_res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=headers,
        json={"message": "Re-applying after withdrawal"},
    )
    assert new_res.status_code == 201
    assert new_res.json()["status"] == "pending"


# ─── 4. Staff Approval and Rejection Tests ────────────────────────────────────


@pytest.mark.asyncio
async def test_club_owner_can_approve_request_and_activates_player_membership(
    client: AsyncClient, db: AsyncSession
):
    owner = await create_user(db, email="owner@test.local")
    player = await create_user(db, email="player@test.local")
    club = await create_club(db)
    await assign_staff(db, owner, club, ClubRole.CLUB_OWNER)
    await db.commit()

    # 1. Player submits request
    player_headers = make_auth_header(player)
    sub_res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=player_headers,
        json={"message": "Please let me in!"},
    )
    assert sub_res.status_code == 201
    req_id = sub_res.json()["id"]

    # 2. Staff lists requests
    owner_headers = make_auth_header(owner)
    list_res = await client.get(
        f"/api/v1/clubs/{club.id}/membership-requests?status=pending",
        headers=owner_headers,
    )
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 3. Staff approves request
    approve_res = await client.post(
        f"/api/v1/clubs/{club.id}/membership-requests/{req_id}/approve",
        headers=owner_headers,
    )
    assert approve_res.status_code == 200
    app_data = approve_res.json()
    assert app_data["status"] == "approved"
    assert app_data["reviewed_by_id"] == str(owner.id)

    # 4. Verify ClubPlayerMembership is active in database
    mem_stmt = select(ClubPlayerMembership).where(
        ClubPlayerMembership.club_id == club.id,
        ClubPlayerMembership.user_id == player.id,
    )
    membership = (await db.execute(mem_stmt)).scalars().first()
    assert membership is not None
    assert membership.status == PlayerMembershipStatus.ACTIVE

    # 5. Verify NO paid MemberSubscription was created (strict separation)
    sub_stmt = select(MemberSubscription).where(
        MemberSubscription.club_id == club.id,
    )
    subscriptions = (await db.execute(sub_stmt)).scalars().all()
    assert len(subscriptions) == 0


@pytest.mark.asyncio
async def test_repeated_approval_on_non_pending_request_rejected(
    client: AsyncClient, db: AsyncSession
):
    owner = await create_user(db)
    player = await create_user(db)
    club = await create_club(db)
    await assign_staff(db, owner, club, ClubRole.CLUB_OWNER)
    await db.commit()

    # Submit and approve
    sub_res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=make_auth_header(player),
    )
    req_id = sub_res.json()["id"]

    owner_headers = make_auth_header(owner)
    await client.post(
        f"/api/v1/clubs/{club.id}/membership-requests/{req_id}/approve",
        headers=owner_headers,
    )

    # Second approval attempt must fail with 400
    repeat_res = await client.post(
        f"/api/v1/clubs/{club.id}/membership-requests/{req_id}/approve",
        headers=owner_headers,
    )
    assert repeat_res.status_code == 400
    assert "pending" in repeat_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_self_approval_by_staff_rejected(
    client: AsyncClient, db: AsyncSession
):
    owner = await create_user(db)
    club = await create_club(db)
    await assign_staff(db, owner, club, ClubRole.CLUB_OWNER)
    await db.commit()

    # Owner submits a membership request for themselves as a player
    owner_headers = make_auth_header(owner)
    sub_res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=owner_headers,
    )
    req_id = sub_res.json()["id"]

    # Owner attempting to approve their own request must fail with 403
    app_res = await client.post(
        f"/api/v1/clubs/{club.id}/membership-requests/{req_id}/approve",
        headers=owner_headers,
    )
    assert app_res.status_code == 403
    assert "cannot approve their own" in app_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_club_owner_can_reject_request_with_reason(
    client: AsyncClient, db: AsyncSession
):
    owner = await create_user(db)
    player = await create_user(db)
    club = await create_club(db)
    await assign_staff(db, owner, club, ClubRole.CLUB_OWNER)
    await db.commit()

    # Submit
    player_headers = make_auth_header(player)
    sub_res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=player_headers,
    )
    req_id = sub_res.json()["id"]

    # Reject
    owner_headers = make_auth_header(owner)
    rej_res = await client.post(
        f"/api/v1/clubs/{club.id}/membership-requests/{req_id}/reject",
        headers=owner_headers,
        json={"rejection_reason": "Club is currently at full capacity for this tier."},
    )
    assert rej_res.status_code == 200
    rej_data = rej_res.json()
    assert rej_data["status"] == "rejected"
    assert rej_data["rejection_reason"] == "Club is currently at full capacity for this tier."
    assert rej_data["reviewed_by_id"] == str(owner.id)

    # After rejection, player CAN re-apply
    reapply_res = await client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=player_headers,
        json={"message": "Re-applying when space opens."},
    )
    assert reapply_res.status_code == 201
    assert reapply_res.json()["status"] == "pending"


# ─── 5. Security & RBAC Isolation Tests ───────────────────────────────────────


@pytest.mark.asyncio
async def test_tournament_director_cannot_manage_membership_requests(
    client: AsyncClient, db: AsyncSession
):
    td = await create_user(db)
    club = await create_club(db)
    await assign_staff(db, td, club, ClubRole.TOURNAMENT_DIRECTOR)
    await db.commit()

    td_headers = make_auth_header(td)
    # Tournament director is denied MANAGE_MEMBERS permission (403)
    list_res = await client.get(
        f"/api/v1/clubs/{club.id}/membership-requests",
        headers=td_headers,
    )
    assert list_res.status_code == 403


@pytest.mark.asyncio
async def test_cross_club_staff_cannot_access_other_club_membership_requests(
    client: AsyncClient, db: AsyncSession
):
    owner_a = await create_user(db)
    club_a = await create_club(db, name="Club A")
    club_b = await create_club(db, name="Club B")
    await assign_staff(db, owner_a, club_a, ClubRole.CLUB_OWNER)
    await db.commit()

    # Owner of Club A attempting to view Club B's requests must receive 403
    headers = make_auth_header(owner_a)
    res = await client.get(
        f"/api/v1/clubs/{club_b.id}/membership-requests",
        headers=headers,
    )
    assert res.status_code == 403
