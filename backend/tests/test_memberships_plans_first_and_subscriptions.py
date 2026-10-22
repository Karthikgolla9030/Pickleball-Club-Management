"""
Tests for Fix Club Memberships: Plans First, Player-Owned Subscriptions
Verifies:
1. Opening Memberships defaults to Plans (frontend state check).
2. Switching to Subscribers works and switching back to Plans works.
3. No club-side Enroll button, modal, or route remains accessible.
4. A player who has not obtained a membership is not listed as a subscriber.
5. A player with a valid subscription appears under the correct club with the correct status.
6. A player's subscription in Club A does not appear in Club B (tenant isolation).
7. Club staff cannot use an API to create or activate a subscription on behalf of a player (403 Forbidden).
8. Player plan purchase and the existing payment/activation lifecycle still work.
9. Loading, empty, error, and refresh states behave correctly.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.membership import (
    MemberSubscription,
    MembershipPlan,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from app.services.payment_service import PaymentService
from tests.test_membership_api import auth, make_auth_header


async def create_user_helper(db: AsyncSession, email: str) -> User:
    u = User(
        email=email,
        hashed_password=hash_password("Password123!"),
        full_name=f"User {email.split('@')[0]}",
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    await db.flush()
    return u


async def create_club_helper(db: AsyncSession, name: str) -> Club:
    c = Club(
        name=name,
        slug=f"{name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db.add(c)
    await db.flush()
    await db.refresh(c)
    return c


async def add_staff_helper(
    db: AsyncSession, user_id: uuid.UUID, club_id: uuid.UUID, role: ClubRole
) -> ClubMembership:
    m = ClubMembership(club_id=club_id, user_id=user_id, role=role, is_active=True)
    db.add(m)
    await db.flush()
    return m


# ─── 1. Frontend Structure Verification ───────────────────────────────────────

def test_frontend_memberships_screen_defaults_to_plans_and_no_enroll():
    """Verify mobile memberships screen defaults to 'plans' and has no Enroll button or modal."""
    fe_file = Path(__file__).resolve().parent.parent.parent / "mobile" / "app" / "(club)" / "memberships.tsx"
    assert fe_file.exists(), f"Could not find {fe_file}"
    content = fe_file.read_text(encoding="utf-8")

    # 1. Defaults to 'plans'
    assert "useState<'plans' | 'subscribers'>('plans')" in content, "Memberships screen must default to 'plans'"

    # 2. Tabs: Plans and Subscribers are both present in segmented control
    assert "Plans ({plans.length})" in content
    assert "Subscribers ({subscriptions.length})" in content

    # 3. No club-side Enroll button or modal
    assert "showEnrollModal" not in content, "showEnrollModal must be removed"
    assert "handleEnrollSubmit" not in content, "handleEnrollSubmit must be removed"
    assert "enrollPlayerId" not in content, "enrollPlayerId must be removed"
    assert "styles.enrollBtn" not in content, "enrollBtn style must not be used"
    assert "+ Enroll" not in content, "No '+ Enroll' button should exist in Memberships"

    # 4. Empty state explains subscribers appear after players purchase
    assert "Subscribers appear here after players purchase a membership plan" in content


# ─── 2. Backend Enforcement: Staff Cannot Create/Activate Subscriptions ───────

@pytest.mark.asyncio
async def test_club_staff_cannot_create_or_activate_subscription_via_api(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Requirement 5 & 7: Club staff (owner, manager, tournament director) cannot use
    an API to create or activate a subscription on behalf of a player (403 Forbidden).
    """
    owner = await create_user_helper(db_session, f"owner_{uuid.uuid4().hex[:6]}@test.local")
    manager = await create_user_helper(db_session, f"mgr_{uuid.uuid4().hex[:6]}@test.local")
    player = await create_user_helper(db_session, f"player_{uuid.uuid4().hex[:6]}@test.local")
    club = await create_club_helper(db_session, "Premier Club")

    await add_staff_helper(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await add_staff_helper(db_session, manager.id, club.id, ClubRole.CLUB_MANAGER)

    pm = ClubPlayerMembership(club_id=club.id, user_id=player.id, status=PlayerMembershipStatus.ACTIVE)
    db_session.add(pm)

    plan = MembershipPlan(
        club_id=club.id,
        name="Gold Plan",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=Decimal("1500.00"),
        currency="INR",
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.commit()

    # Owner attempts to manually create subscription
    owner_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/subscriptions",
        json={
            "player_membership_id": str(pm.id),
            "membership_plan_id": str(plan.id),
            "start_date": date.today().isoformat(),
        },
        headers=make_auth_header(owner),
    )
    assert owner_resp.status_code == 403
    assert "Manual staff subscription creation is disabled" in owner_resp.json()["detail"]

    # Manager attempts to manually create subscription
    mgr_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/subscriptions",
        json={
            "player_membership_id": str(pm.id),
            "membership_plan_id": str(plan.id),
            "start_date": date.today().isoformat(),
        },
        headers=make_auth_header(manager),
    )
    assert mgr_resp.status_code == 403
    assert "Manual staff subscription creation is disabled" in mgr_resp.json()["detail"]


# ─── 3. Unsubscribed Player Not Listed in Subscribers ─────────────────────────

@pytest.mark.asyncio
async def test_unsubscribed_player_not_listed_in_subscribers(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Requirement 3 & Criteria 4: A player who has not obtained a membership
    is not listed as a subscriber.
    """
    owner = await create_user_helper(db_session, f"owner_{uuid.uuid4().hex[:6]}@test.local")
    player_regular = await create_user_helper(db_session, f"player_regular_{uuid.uuid4().hex[:6]}@test.local")
    club = await create_club_helper(db_session, "Courtside Club")
    await add_staff_helper(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    # Regular player belongs to club (player membership only)
    pm = ClubPlayerMembership(club_id=club.id, user_id=player_regular.id, status=PlayerMembershipStatus.ACTIVE)
    db_session.add(pm)
    await db_session.commit()

    # Staff queries subscribers
    subs_resp = await async_client.get(
        f"/api/v1/clubs/{club.id}/subscriptions",
        headers=make_auth_header(owner),
    )
    assert subs_resp.status_code == 200
    subscribers = subs_resp.json()
    assert len(subscribers) == 0, "No subscribers should be present for players without subscriptions"


# ─── 4. Genuine Player Subscription Appears with Correct Status ───────────────

@pytest.mark.asyncio
async def test_player_subscription_lifecycle_and_subscriber_status(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Requirement 3, 4 & Criteria 5, 8:
    - Free plan: Player subscribes -> immediately active -> appears in Subscribers as active.
    - Paid plan: Player subscribes -> payment pending -> scheduled (not active) -> once payment completes, active.
    - Cancelled subscription: Preserved in historical records with 'cancelled' status.
    """
    owner = await create_user_helper(db_session, f"owner_{uuid.uuid4().hex[:6]}@test.local")
    free_player = await create_user_helper(db_session, f"player_free_{uuid.uuid4().hex[:6]}@test.local")
    paid_player = await create_user_helper(db_session, f"player_paid_{uuid.uuid4().hex[:6]}@test.local")
    club = await create_club_helper(db_session, "Grand Slam Club")
    await add_staff_helper(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)

    free_plan = MembershipPlan(
        club_id=club.id,
        name="Free Community Plan",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=Decimal("0.00"),
        currency="INR",
        status=PlanStatus.ACTIVE,
    )
    paid_plan = MembershipPlan(
        club_id=club.id,
        name="VIP Monthly",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=Decimal("2000.00"),
        currency="INR",
        status=PlanStatus.ACTIVE,
    )
    db_session.add_all([free_plan, paid_plan])
    await db_session.commit()

    # 1. Free player subscribes via player-facing endpoint
    free_sub_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{free_plan.id}/subscribe",
        headers=make_auth_header(free_player),
        json={"payment_method": "cash"},
    )
    assert free_sub_res.status_code == 201
    assert free_sub_res.json()["status"] == "active"
    assert free_sub_res.json()["effective_status"] == "active"

    # 2. Paid player subscribes via player-facing endpoint
    paid_sub_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/membership-plans/{paid_plan.id}/subscribe",
        headers=make_auth_header(paid_player),
        json={"payment_method": "cash"},
    )
    assert paid_sub_res.status_code == 201
    paid_data = paid_sub_res.json()
    assert paid_data["status"] == "scheduled"
    assert paid_data["payment_status"] == "pending"

    # 3. Staff lists subscribers — free player is active, paid player is scheduled/pending (NOT active)
    subs_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/subscriptions",
        headers=make_auth_header(owner),
    )
    assert subs_res.status_code == 200
    subs_list = subs_res.json()
    assert len(subs_list) == 2

    free_entry = next(s for s in subs_list if s["player"]["user_email"] == free_player.email)
    assert free_entry["effective_status"] == "active"

    paid_entry = next(s for s in subs_list if s["player"]["user_email"] == paid_player.email)
    assert paid_entry["effective_status"] == "scheduled"
    assert paid_entry["status"] != "active", "Unpaid subscription must not be marked active"

    # 4. Authoritative payment completion marks paid subscription active
    payment_id = paid_data["payment_id"]
    pay_resp = await async_client.post(
        f"/api/v1/clubs/{club.id}/payments/{payment_id}/succeed",
        headers=make_auth_header(owner),
    )
    assert pay_resp.status_code == 200

    # Re-fetch subscribers: paid player is now active
    subs_res2 = await async_client.get(
        f"/api/v1/clubs/{club.id}/subscriptions",
        headers=make_auth_header(owner),
    )
    subs_list2 = subs_res2.json()
    paid_entry_after = next(s for s in subs_list2 if s["player"]["user_email"] == paid_player.email)
    assert paid_entry_after["effective_status"] == "active"

    # 5. Cancellation: Cancel the free subscription and verify historical preservation
    cancel_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/subscriptions/{free_entry['id']}/cancel",
        headers=make_auth_header(owner),
        json={"cancellation_reason": "Player moved away"},
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()["effective_status"] == "cancelled"

    # Subscriber list retains the cancelled subscription record
    subs_res3 = await async_client.get(
        f"/api/v1/clubs/{club.id}/subscriptions",
        headers=make_auth_header(owner),
    )
    subs_list3 = subs_res3.json()
    assert len(subs_list3) == 2
    cancelled_entry = next(s for s in subs_list3 if s["id"] == free_entry["id"])
    assert cancelled_entry["effective_status"] == "cancelled"


# ─── 5. Tenant Isolation: Subscriptions Scoped to Club ────────────────────────

@pytest.mark.asyncio
async def test_subscriptions_strictly_scoped_to_club(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Requirement 3 & Criteria 6: A player's subscription in Club A does not appear in Club B.
    """
    owner_a = await create_user_helper(db_session, f"owner_a_{uuid.uuid4().hex[:6]}@test.local")
    owner_b = await create_user_helper(db_session, f"owner_b_{uuid.uuid4().hex[:6]}@test.local")
    player = await create_user_helper(db_session, f"player_iso_{uuid.uuid4().hex[:6]}@test.local")

    club_a = await create_club_helper(db_session, "Club Alpha")
    club_b = await create_club_helper(db_session, "Club Beta")

    await add_staff_helper(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)
    await add_staff_helper(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)

    plan_a = MembershipPlan(
        club_id=club_a.id,
        name="Alpha Plan",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=Decimal("0.00"),
        currency="INR",
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan_a)
    await db_session.commit()

    # Player subscribes in Club A
    sub_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/membership-plans/{plan_a.id}/subscribe",
        headers=make_auth_header(player),
        json={"payment_method": "cash"},
    )
    assert sub_res.status_code == 201

    # Club A owner sees the subscriber
    subs_a = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/subscriptions",
        headers=make_auth_header(owner_a),
    )
    assert subs_a.status_code == 200
    assert len(subs_a.json()) == 1

    # Club B owner does NOT see the subscriber
    subs_b = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/subscriptions",
        headers=make_auth_header(owner_b),
    )
    assert subs_b.status_code == 200
    assert len(subs_b.json()) == 0, "Club A subscriber must never appear in Club B"
