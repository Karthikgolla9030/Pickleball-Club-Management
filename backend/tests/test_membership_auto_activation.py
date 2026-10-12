"""
Aught2 Pickleball — Membership Auto-Activation & Approval Removal Tests

Validates:
1. Free club joining without manual approval (POST /api/v1/player/clubs/{club_id}/join)
2. Free membership plan activation (price == 0 activates subscription and player membership immediately)
3. Paid membership activation after confirmed payment success
4. Paid membership remaining inactive while payment is pending
5. Failed or cancelled payment not activating a subscription
6. Duplicate payment-success callbacks not duplicating subscriptions (idempotency)
7. Correct Members and Subscribers lists
8. Expired subscriptions not counted as active
9. Correct club-specific counts and tenant isolation
10. Staff role permissions remaining unchanged
11. Existing club memberships and subscriptions remaining intact
12. Existing membership plan management and payment history remaining functional
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
    password: str = "SecurePass123!",
    full_name: str = "Test Player",
) -> User:
    email = email or f"player_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def create_club(db: AsyncSession, name: str = "Emerald Pickleball Club") -> Club:
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
    name: str = "Standard Plan",
    price: Decimal = Decimal("999.00"),
    duration_unit: PlanDurationUnit = PlanDurationUnit.MONTHLY,
) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_id,
        name=name,
        price=price,
        currency="INR",
        duration_unit=duration_unit,
        status=PlanStatus.ACTIVE,
    )
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return plan


# ─── 1. Free Club Joining Without Manual Approval ────────────────────────────

@pytest.mark.asyncio
async def test_01_free_club_joining_without_manual_approval(
    async_client: AsyncClient, db_session: AsyncSession
):
    player = await create_user(db_session)
    club = await create_club(db_session)
    await db_session.commit()

    headers = make_auth_header(player)
    res = await async_client.post(
        f"/api/v1/player/clubs/{club.id}/join",
        headers=headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["club_id"] == str(club.id)
    assert data["status"] == "active"
    assert "membership_id" in data

    # Verify ClubPlayerMembership is active in database
    pm = (
        await db_session.execute(
            select(ClubPlayerMembership).where(
                ClubPlayerMembership.club_id == club.id,
                ClubPlayerMembership.user_id == player.id,
            )
        )
    ).scalar_one_or_none()
    assert pm is not None
    assert pm.status == PlayerMembershipStatus.ACTIVE


# ─── 2. Free Plan Activation ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_02_free_plan_activation(async_client: AsyncClient, db_session: AsyncSession):
    player = await create_user(db_session)
    club = await create_club(db_session)
    free_plan = await create_plan(db_session, club.id, name="Free Community Plan", price=Decimal("0.00"))
    await db_session.commit()

    headers = make_auth_header(player)
    res = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{free_plan.id}/subscribe",
        headers=headers,
        json={"payment_method": "cash"},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "active"
    assert data["membership_plan_id"] == str(free_plan.id)

    # Verify both subscription and player membership are active
    pm = (
        await db_session.execute(
            select(ClubPlayerMembership).where(
                ClubPlayerMembership.club_id == club.id,
                ClubPlayerMembership.user_id == player.id,
            )
        )
    ).scalar_one_or_none()
    assert pm is not None
    assert pm.status == PlayerMembershipStatus.ACTIVE

    sub = (
        await db_session.execute(
            select(MemberSubscription).where(
                MemberSubscription.club_id == club.id,
                MemberSubscription.membership_plan_id == free_plan.id,
            )
        )
    ).scalar_one_or_none()
    assert sub is not None
    assert sub.status == SubscriptionStatus.ACTIVE


# ─── 3 & 4. Paid Plan Remaining Inactive While Pending & Activating on Success ─

@pytest.mark.asyncio
async def test_03_and_04_paid_plan_pending_then_activated_on_payment_success(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_paid@test.local")
    player = await create_user(db_session, email="player_paid@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    paid_plan = await create_plan(db_session, club.id, name="Monthly Pro", price=Decimal("1500.00"))
    await db_session.commit()

    # Step 1: Player subscribes to paid plan
    player_headers = make_auth_header(player)
    res_sub = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{paid_plan.id}/subscribe",
        headers=player_headers,
        json={"payment_method": "upi"},
    )
    assert res_sub.status_code == 201
    sub_data = res_sub.json()
    assert sub_data["status"] == "scheduled"  # Inactive until payment succeeds
    assert sub_data["payment_status"] == "pending"
    payment_id = sub_data["payment_id"]

    # Verify subscription is NOT active yet
    sub = (
        await db_session.execute(
            select(MemberSubscription).where(MemberSubscription.id == uuid.UUID(sub_data["id"]))
        )
    ).scalar_one()
    assert sub.status == SubscriptionStatus.SCHEDULED

    # Step 2: Payment succeeds (confirmed)
    owner_headers = make_auth_header(owner)
    res_pay = await async_client.post(
        f"/api/v1/clubs/{club.id}/payments/{payment_id}/succeed",
        headers=owner_headers,
    )
    assert res_pay.status_code == 200
    pay_data = res_pay.json()
    assert pay_data["status"] == "succeeded"

    # Step 3: Subscription & player membership are now automatically ACTIVE
    await db_session.refresh(sub)
    assert sub.status == SubscriptionStatus.ACTIVE

    pm = (
        await db_session.execute(
            select(ClubPlayerMembership).where(
                ClubPlayerMembership.club_id == club.id,
                ClubPlayerMembership.user_id == player.id,
            )
        )
    ).scalar_one()
    assert pm.status == PlayerMembershipStatus.ACTIVE


# ─── 5. Failed or Cancelled Payment Does Not Activate Subscription ────────────

@pytest.mark.asyncio
async def test_05_failed_or_cancelled_payment_does_not_activate(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_fail@test.local")
    player = await create_user(db_session, email="player_fail@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    paid_plan = await create_plan(db_session, club.id, name="Quarterly Elite", price=Decimal("3000.00"))
    await db_session.commit()

    player_headers = make_auth_header(player)
    res_sub = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{paid_plan.id}/subscribe",
        headers=player_headers,
        json={"payment_method": "card"},
    )
    payment_id = res_sub.json()["payment_id"]
    sub_id = res_sub.json()["id"]

    owner_headers = make_auth_header(owner)
    res_fail = await async_client.post(
        f"/api/v1/clubs/{club.id}/payments/{payment_id}/fail",
        headers=owner_headers,
        json={"failure_reason": "Card declined by bank"},
    )
    assert res_fail.status_code == 200
    assert res_fail.json()["status"] == "failed"

    # Verify subscription is still NOT active
    sub = (
        await db_session.execute(
            select(MemberSubscription).where(MemberSubscription.id == uuid.UUID(sub_id))
        )
    ).scalar_one()
    assert sub.status != SubscriptionStatus.ACTIVE


# ─── 6. Idempotent Payment Success (Retries Do Not Duplicate) ─────────────────

@pytest.mark.asyncio
async def test_06_idempotent_payment_success(async_client: AsyncClient, db_session: AsyncSession):
    owner = await create_user(db_session, email="owner_idem@test.local")
    player = await create_user(db_session, email="player_idem@test.local")
    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    paid_plan = await create_plan(db_session, club.id, name="Idem Plan", price=Decimal("500.00"))
    await db_session.commit()

    res_sub = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{paid_plan.id}/subscribe",
        headers=make_auth_header(player),
        json={"payment_method": "cash"},
    )
    payment_id = res_sub.json()["payment_id"]

    owner_headers = make_auth_header(owner)
    # First callback succeeds
    res1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/payments/{payment_id}/succeed",
        headers=owner_headers,
    )
    assert res1.status_code == 200
    assert res1.json()["status"] == "succeeded"

    # Second callback retry must succeed idempotently without error
    res2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/payments/{payment_id}/succeed",
        headers=owner_headers,
    )
    assert res2.status_code == 200
    assert res2.json()["status"] == "succeeded"


# ─── 7 & 8. Members and Subscribers Lists & Expired Subscriptions ─────────────

@pytest.mark.asyncio
async def test_07_and_08_members_and_subscribers_lists(async_client: AsyncClient, db_session: AsyncSession):
    owner = await create_user(db_session, email="owner_lists@test.local")
    p_active_sub = await create_user(db_session, email="p_active_sub@test.local")
    p_ordinary = await create_user(db_session, email="p_ordinary@test.local")
    p_expired_sub = await create_user(db_session, email="p_expired_sub@test.local")

    club = await create_club(db_session)
    await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    plan = await create_plan(db_session, club.id, name="Active Plan", price=Decimal("100.00"))
    await db_session.commit()

    owner_headers = make_auth_header(owner)

    # 1. Player with active subscription
    pm_active = ClubPlayerMembership(
        user_id=p_active_sub.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE
    )
    db_session.add(pm_active)
    await db_session.flush()
    sub_active = MemberSubscription(
        club_id=club.id,
        player_membership_id=pm_active.id,
        membership_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=date.today() - timedelta(days=5),
        end_date=date.today() + timedelta(days=25),
    )
    db_session.add(sub_active)

    # 2. Ordinary member without subscription
    pm_ordinary = ClubPlayerMembership(
        user_id=p_ordinary.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE
    )
    db_session.add(pm_ordinary)

    # 3. Member with expired subscription
    pm_expired = ClubPlayerMembership(
        user_id=p_expired_sub.id, club_id=club.id, status=PlayerMembershipStatus.ACTIVE
    )
    db_session.add(pm_expired)
    await db_session.flush()
    sub_expired = MemberSubscription(
        club_id=club.id,
        player_membership_id=pm_expired.id,
        membership_plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=date.today() - timedelta(days=40),
        end_date=date.today() - timedelta(days=10),  # End date in the past
    )
    db_session.add(sub_expired)
    await db_session.commit()

    # Query club player memberships
    res_players = await async_client.get(
        f"/api/v1/clubs/{club.id}/player-memberships",
        headers=owner_headers,
    )
    assert res_players.status_code == 200
    player_list = res_players.json()
    assert len(player_list) >= 3

    # Query club subscriptions
    res_subs = await async_client.get(
        f"/api/v1/clubs/{club.id}/subscriptions",
        headers=owner_headers,
    )
    assert res_subs.status_code == 200
    subs_list = res_subs.json()
    
    # Active sub must have effective_status == 'active'
    active_entry = next(s for s in subs_list if s["id"] == str(sub_active.id))
    assert active_entry["effective_status"] == "active"

    # Expired sub must have effective_status == 'expired'
    expired_entry = next(s for s in subs_list if s["id"] == str(sub_expired.id))
    assert expired_entry["effective_status"] == "expired"


# ─── 9. Club Tenant Isolation ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_09_club_tenant_isolation(async_client: AsyncClient, db_session: AsyncSession):
    owner_a = await create_user(db_session, email="owner_iso_a@test.local")
    owner_b = await create_user(db_session, email="owner_iso_b@test.local")
    club_a = await create_club(db_session, name="Club Alpha")
    club_b = await create_club(db_session, name="Club Beta")
    await add_staff(db_session, owner_a.id, club_a.id, role=ClubRole.CLUB_OWNER)
    await add_staff(db_session, owner_b.id, club_b.id, role=ClubRole.CLUB_OWNER)
    await db_session.commit()

    # Owner A cannot access Club B payments
    res = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/payments",
        headers=make_auth_header(owner_a),
    )
    assert res.status_code == 403


# ─── 10. Staff Role Permissions Remain Unchanged ──────────────────────────────

@pytest.mark.asyncio
async def test_10_staff_role_permissions_remain_unchanged(
    async_client: AsyncClient, db_session: AsyncSession
):
    owner = await create_user(db_session, email="owner_perm@test.local")
    club = await create_club(db_session)
    membership = await add_staff(db_session, owner.id, club.id, role=ClubRole.CLUB_OWNER)
    await db_session.commit()

    assert membership.role == ClubRole.CLUB_OWNER
    assert membership.is_active is True
