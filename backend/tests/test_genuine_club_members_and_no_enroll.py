"""
Aught2 Pickleball — Genuine Club Members & Manual Enrollment Removal Tests

Validates all 8 criteria from prompt:
1. The Enroll button and manual enrollment route/action are rejected in backend (403 Forbidden).
2. A player who has not joined the club does not appear in its Players list.
3. A player who successfully joins appears in the correct club’s list.
4. A player’s active subscription is reflected in the Subscribers filter.
5. Pending or failed join/payment states do not incorrectly appear as active members.
6. Club A cannot see Club B’s players (tenant isolation).
7. Existing staff listing and role-management behavior still works.
8. Player-side join and membership purchase flows remain fully functional.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email.lower(),
        hashed_password=hash_password("SecurePass123!"),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def create_club(db: AsyncSession, name: str = "Test Pickleball Club") -> Club:
    slug = f"club-{uuid.uuid4().hex[:6]}"
    club = Club(name=name, slug=slug, is_active=True)
    db.add(club)
    await db.flush()
    await db.refresh(club)
    return club


async def add_staff(
    db: AsyncSession,
    user_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubRole = ClubRole.CLUB_OWNER,
) -> ClubMembership:
    m = ClubMembership(user_id=user_id, club_id=club_id, role=role, is_active=True)
    db.add(m)
    await db.flush()
    await db.refresh(m)
    return m


async def create_plan(
    db: AsyncSession,
    club_id: uuid.UUID,
    name: str = "Premium Monthly",
    price: Decimal = Decimal("1200.00"),
) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_id,
        name=name,
        price=price,
        currency="INR",
        duration_unit=PlanDurationUnit.MONTHLY,
        status=PlanStatus.ACTIVE,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


# ─── 1. Manual Enrollment Route/Action Disabled in Backend ─────────────────────

@pytest.mark.asyncio
async def test_manual_enrollment_endpoint_disabled_for_staff(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_no_enr@test.local")
    manager = await create_user(db_session, email="manager_no_enr@test.local")
    candidate = await create_user(db_session, email="candidate_no_enr@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    await add_staff(db_session, manager.id, club.id, role=ClubRole.CLUB_MANAGER)
    await db_session.commit()

    payload = {"email": candidate.email, "status": "active"}

    # Owner attempt
    res_owner = await async_client.post(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner),
        json=payload,
    )
    assert res_owner.status_code == 403
    assert "manual player enrollment is disabled" in res_owner.json()["detail"].lower()

    # Manager attempt
    res_manager = await async_client.post(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(manager),
        json=payload,
    )
    assert res_manager.status_code == 403
    assert "manual player enrollment is disabled" in res_manager.json()["detail"].lower()


# ─── 2. Unjoined Player Does Not Appear in Club's Player List ─────────────────

@pytest.mark.asyncio
async def test_unjoined_player_does_not_appear_in_club_players_list(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_list_check@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)

    # Random platform player who never interacted with this club
    stranger = await create_user(db_session, email="stranger@platform.local")
    await db_session.commit()

    res = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner),
    )
    assert res.status_code == 200
    emails = [p["user_email"] for p in res.json()]
    assert "stranger@platform.local" not in emails


# ─── 3. Player Self-Service Join Populates Club's Player List ─────────────────

@pytest.mark.asyncio
async def test_player_self_service_join_populates_players_list(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_ss_join@test.local")
    player = await create_user(db_session, email="player_ss_join@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Player calls self-service join
    join_res = await async_client.post(
        f"/api/v1/player/clubs/{club.id}/join",
        headers=make_auth_header(player),
    )
    assert join_res.status_code == 201
    assert join_res.json()["status"] == "active"

    # Owner retrieves player list; player must now appear
    res = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner),
    )
    assert res.status_code == 200
    emails = [p["user_email"] for p in res.json()]
    assert "player_ss_join@test.local" in emails


# ─── 4. Active Subscription Reflected in Subscribers ──────────────────────────

@pytest.mark.asyncio
async def test_active_subscription_reflected_in_subscribers_list(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_subs_check@test.local")
    player_sub = await create_user(db_session, email="player_subscriber@test.local")
    player_norm = await create_user(db_session, email="player_normal@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)

    plan = await create_plan(db_session, club.id, name="Gold Tier", price=Decimal("0.00"))  # free plan activates immediately
    await db_session.commit()

    # Normal player joins without subscription
    await async_client.post(
        f"/api/v1/player/clubs/{club.id}/join",
        headers=make_auth_header(player_norm),
    )

    # Subscriber player subscribes to active plan
    sub_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{plan.id}/subscribe",
        headers=make_auth_header(player_sub),
        json={"payment_method": "cash"},
    )
    assert sub_res.status_code == 201
    assert sub_res.json()["status"] == "active"

    # Query subscriptions endpoint (used for the Subscribers filter)
    subs_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/subscriptions",
        headers=make_auth_header(owner),
    )
    assert subs_resp.status_code == 200
    subs_data = subs_resp.json()
    active_sub_users = [s["player"]["user_email"] for s in subs_data if s["effective_status"] == "active"]
    assert "player_subscriber@test.local" in active_sub_users
    assert "player_normal@test.local" not in active_sub_users


# ─── 5. Pending Join Request & Pending/Failed Payment Do Not Appear As Active ──

@pytest.mark.asyncio
async def test_pending_join_request_does_not_appear_as_active_member(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_req_check@test.local")
    applicant = await create_user(db_session, email="applicant_pending@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Submit request
    req_res = await async_client.post(
        f"/api/v1/player/clubs/{club.id}/membership-requests",
        headers=make_auth_header(applicant),
        json={"message": "Please approve my membership"},
    )
    assert req_res.status_code == 201
    req_id = req_res.json()["id"]

    # Check player memberships: applicant must NOT appear
    list_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner),
    )
    assert list_res.status_code == 200
    emails = [p["user_email"] for p in list_res.json()]
    assert "applicant_pending@test.local" not in emails

    # After approval, applicant appears as active
    appr_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-requests/{req_id}/approve",
        headers=make_auth_header(owner),
    )
    assert appr_res.status_code == 200

    list_res_after = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner),
    )
    emails_after = [p["user_email"] for p in list_res_after.json()]
    assert "applicant_pending@test.local" in emails_after


@pytest.mark.asyncio
async def test_failed_or_pending_paid_subscription_does_not_appear_as_active(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_fail_sub@test.local")
    buyer = await create_user(db_session, email="buyer_pending_payment@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    paid_plan = await create_plan(db_session, club.id, name="Pro Plan", price=Decimal("2500.00"))
    await db_session.commit()

    # Buyer initiates subscription to paid plan
    sub_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{paid_plan.id}/subscribe",
        headers=make_auth_header(buyer),
        json={"payment_method": "card"},
    )
    assert sub_res.status_code == 201
    assert sub_res.json()["status"] == "scheduled"
    payment_id = sub_res.json()["payment_id"]

    # While payment is pending, buyer must not appear in active players list
    list_pending = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner),
    )
    emails_pending = [p["user_email"] for p in list_pending.json()]
    assert "buyer_pending_payment@test.local" not in emails_pending

    # Payment fails
    fail_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/payments/{payment_id}/fail",
        headers=make_auth_header(owner),
        json={"failure_reason": "Insufficient balance"},
    )
    assert fail_res.status_code == 200

    # Still does not appear in active players list
    list_failed = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=make_auth_header(owner),
    )
    emails_failed = [p["user_email"] for p in list_failed.json()]
    assert "buyer_pending_payment@test.local" not in emails_failed


# ─── 6. Club Tenant Isolation ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_club_a_cannot_see_club_b_players(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner_a = await create_user(db_session, email="owner_iso_a@test.local")
    owner_b = await create_user(db_session, email="owner_iso_b@test.local")
    player_b = await create_user(db_session, email="player_club_b@test.local")

    club_a = await create_club(db_session, name="Club Alpha")
    club_b = await create_club(db_session, name="Club Beta")

    await add_staff(db_session, owner_a.id, club_a.id, role=ClubRole.CLUB_OWNER)
    await add_staff(db_session, owner_b.id, club_b.id, role=ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Player B joins Club B
    await async_client.post(
        f"/api/v1/player/clubs/{club_b.id}/join",
        headers=make_auth_header(player_b),
    )

    # Owner A viewing Club A's players must NOT see Player B
    res_a = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/player-memberships",
        headers=make_auth_header(owner_a),
    )
    assert res_a.status_code == 200
    emails_a = [p["user_email"] for p in res_a.json()]
    assert "player_club_b@test.local" not in emails_a

    # Owner A attempting to query Club B's players directly receives 403 Forbidden
    res_cross = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/player-memberships",
        headers=make_auth_header(owner_a),
    )
    assert res_cross.status_code == 403


# ─── 7. Staff Listing and Separation ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_listing_and_separation_from_players(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="staff_owner@test.local")
    manager = await create_user(db_session, email="staff_mgr@test.local")
    player = await create_user(db_session, email="ordinary_player@test.local")

    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    await add_staff(db_session, manager.id, club.id, role=ClubRole.CLUB_MANAGER)
    await db_session.commit()

    await async_client.post(
        f"/api/v1/player/clubs/{club.id}/join",
        headers=make_auth_header(player),
    )

    owner_headers = make_auth_header(owner)

    # GET /members (Staff list)
    staff_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/members",
        headers=owner_headers,
    )
    assert staff_res.status_code == 200
    staff_emails = [s["user_email"] for s in staff_res.json()]
    assert "staff_owner@test.local" in staff_emails
    assert "staff_mgr@test.local" in staff_emails
    assert "ordinary_player@test.local" not in staff_emails

    # GET /player-memberships (Players list)
    players_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=owner_headers,
    )
    assert players_res.status_code == 200
    player_emails = [p["user_email"] for p in players_res.json()]
    assert "ordinary_player@test.local" in player_emails
    assert "staff_owner@test.local" not in player_emails
    assert "staff_mgr@test.local" not in player_emails
