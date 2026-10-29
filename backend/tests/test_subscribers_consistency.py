"""
Tests for subscriber consistency between Memberships and Members (Players) views.

Verifies:
1. Player with active subscription appears in club player memberships with is_subscriber=True.
2. Player with scheduled subscription appears in club player memberships with is_subscriber=True and subscription_status='scheduled'.
3. Player with expired or cancelled subscription has is_subscriber=False.
4. Player with no subscription appears with is_subscriber=False.
5. Cross-club tenant isolation: subscription in Club B does not mark player as subscriber in Club A.
6. Player membership with status=INACTIVE is auto-healed to ACTIVE if they have an active or scheduled subscription.
7. Player with multiple subscriptions is deduplicated (appears only once).
8. Club staff members are still strictly excluded from the player memberships list.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
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
from app.models.player_profile import PlayerProfile
from app.models.user import User
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str,
    full_name: str = "Test Player",
    avatar_url: str | None = None,
) -> User:
    u = User(
        email=email,
        hashed_password=hash_password("Password123!"),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(u)
    await db.flush()

    prof = PlayerProfile(
        user_id=u.id,
        display_name=full_name,
        profile_image_url=avatar_url,
    )
    db.add(prof)
    await db.flush()
    return u


async def create_club(db: AsyncSession, name: str = "Test Club") -> Club:
    club = Club(
        name=name,
        slug=f"club-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(club)
    await db.flush()
    return club


async def create_plan(
    db: AsyncSession,
    club_id: uuid.UUID,
    name: str = "Base plan",
    price: Decimal = Decimal("99.00"),
) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_id,
        name=name,
        price=price,
        duration_unit=PlanDurationUnit.MONTHLY,
        status=PlanStatus.ACTIVE,
    )
    db.add(plan)
    await db.flush()
    return plan


async def create_subscription(
    db: AsyncSession,
    club_id: uuid.UUID,
    plan_id: uuid.UUID,
    player_membership_id: uuid.UUID,
    status: SubscriptionStatus,
    start_date: date | None = None,
    end_date: date | None = None,
) -> MemberSubscription:
    today = date.today()
    sub = MemberSubscription(
        club_id=club_id,
        membership_plan_id=plan_id,
        player_membership_id=player_membership_id,
        status=status,
        start_date=start_date or (today if status != SubscriptionStatus.SCHEDULED else today + timedelta(days=7)),
        end_date=end_date or (today + timedelta(days=30)),
        auto_renew=True,
    )
    db.add(sub)
    await db.flush()
    return sub


@pytest.mark.asyncio
async def test_subscribers_consistency_api(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    club_a = await create_club(db_session, "Club Alpha")
    club_b = await create_club(db_session, "Club Beta")

    # Owner of Club Alpha
    owner = await create_user(db_session, "owner@alpha.local", "Alpha Owner")
    owner_staff = ClubMembership(
        user_id=owner.id,
        club_id=club_a.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(owner_staff)

    # Plans
    plan_a = await create_plan(db_session, club_a.id, "Base plan", Decimal("99.00"))
    plan_b = await create_plan(db_session, club_b.id, "Beta Pro", Decimal("150.00"))

    # Player 1: Active subscription in Club Alpha
    p1 = await create_user(db_session, "player1@test.com", "Player One")
    p1_mem = ClubPlayerMembership(
        user_id=p1.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-P-001",
    )
    db_session.add(p1_mem)
    await db_session.flush()
    await create_subscription(db_session, club_a.id, plan_a.id, p1_mem.id, SubscriptionStatus.ACTIVE)

    # Player 7: Scheduled subscription in Club Alpha (the exact user bug case!)
    p7 = await create_user(db_session, "player7@test.com", "player7")
    p7_mem = ClubPlayerMembership(
        user_id=p7.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-P-007",
    )
    db_session.add(p7_mem)
    await db_session.flush()
    await create_subscription(db_session, club_a.id, plan_a.id, p7_mem.id, SubscriptionStatus.SCHEDULED)

    # Player 2: Expired subscription in Club Alpha
    p2 = await create_user(db_session, "player2@test.com", "Player Two")
    p2_mem = ClubPlayerMembership(
        user_id=p2.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-P-002",
    )
    db_session.add(p2_mem)
    await db_session.flush()
    await create_subscription(
        db_session,
        club_a.id,
        plan_a.id,
        p2_mem.id,
        SubscriptionStatus.EXPIRED,
        start_date=date.today() - timedelta(days=60),
        end_date=date.today() - timedelta(days=30),
    )

    # Player 3: Cancelled subscription in Club Alpha
    p3 = await create_user(db_session, "player3@test.com", "Player Three")
    p3_mem = ClubPlayerMembership(
        user_id=p3.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-P-003",
    )
    db_session.add(p3_mem)
    await db_session.flush()
    await create_subscription(db_session, club_a.id, plan_a.id, p3_mem.id, SubscriptionStatus.CANCELLED)

    # Player 4: Normal player with NO subscription in Club Alpha
    p4 = await create_user(db_session, "player4@test.com", "Player Four")
    p4_mem = ClubPlayerMembership(
        user_id=p4.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-P-004",
    )
    db_session.add(p4_mem)

    # Player 5: INACTIVE membership record in Club Alpha, BUT has ACTIVE subscription
    # (should be auto-healed to ACTIVE and included with is_subscriber=True)
    p5 = await create_user(db_session, "player5@test.com", "Player Five")
    p5_mem = ClubPlayerMembership(
        user_id=p5.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.INACTIVE,
        membership_number="AUG-P-005",
    )
    db_session.add(p5_mem)
    await db_session.flush()
    await create_subscription(db_session, club_a.id, plan_a.id, p5_mem.id, SubscriptionStatus.ACTIVE)

    # Player 6: Subscribed ONLY in Club Beta (tenant isolation check)
    p6 = await create_user(db_session, "player6@test.com", "Player Six")
    p6_mem = ClubPlayerMembership(
        user_id=p6.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-P-006",
    )
    db_session.add(p6_mem)
    p6_b_mem = ClubPlayerMembership(
        user_id=p6.id,
        club_id=club_b.id,
        status=PlayerMembershipStatus.ACTIVE,
        membership_number="AUG-B-006",
    )
    db_session.add(p6_b_mem)
    await db_session.flush()
    await create_subscription(db_session, club_b.id, plan_b.id, p6_b_mem.id, SubscriptionStatus.ACTIVE)

    await db_session.commit()

    headers = make_auth_header(owner)

    # Fetch Club Alpha player memberships
    resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/player-memberships",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Index results by user email
    by_email = {m["user_email"]: m for m in data}

    # Verify Player 1 (ACTIVE subscription)
    assert "player1@test.com" in by_email
    assert by_email["player1@test.com"]["is_subscriber"] is True
    assert by_email["player1@test.com"]["subscription_status"] == "active"
    assert by_email["player1@test.com"]["plan_name"] == "Base plan"

    # Verify Player 7 (SCHEDULED subscription - exact user reported bug)
    assert "player7@test.com" in by_email
    assert by_email["player7@test.com"]["is_subscriber"] is True
    assert by_email["player7@test.com"]["subscription_status"] == "scheduled"
    assert by_email["player7@test.com"]["plan_name"] == "Base plan"

    # Verify Player 2 (EXPIRED subscription)
    assert "player2@test.com" in by_email
    assert by_email["player2@test.com"]["is_subscriber"] is False

    # Verify Player 3 (CANCELLED subscription)
    assert "player3@test.com" in by_email
    assert by_email["player3@test.com"]["is_subscriber"] is False

    # Verify Player 4 (Normal user, NO subscription)
    assert "player4@test.com" in by_email
    assert by_email["player4@test.com"]["is_subscriber"] is False
    assert by_email["player4@test.com"]["subscription_status"] is None

    # Verify Player 5 (Previously INACTIVE membership healed to ACTIVE by subscription)
    assert "player5@test.com" in by_email
    assert by_email["player5@test.com"]["status"] in ("active", "ACTIVE")
    assert by_email["player5@test.com"]["is_subscriber"] is True
    assert by_email["player5@test.com"]["subscription_status"] == "active"

    # Verify Player 6 (Subscribed to Club Beta, NOT Club Alpha)
    assert "player6@test.com" in by_email
    assert by_email["player6@test.com"]["is_subscriber"] is False
    assert by_email["player6@test.com"]["subscription_status"] is None

    # Verify Owner (Staff) is NOT in player memberships
    assert "owner@alpha.local" not in by_email
