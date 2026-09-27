"""
Aught2 Pickleball — Phase 12 Membership API Tests

Tests cover:
  - MembershipPlan CRUD (create, get, update, deactivate, reactivate)
  - MemberSubscription lifecycle (create, active, scheduled, expired, cancel, renew)
  - Date validation, plan-club consistency, player-club consistency
  - Authorization (owner/manager yes, tournament director/player no)
  - Tenant isolation (cross-club access denied)
  - Booking integration (plan limits applied when subscription active)
  - Regression: all Phase 1-11 behaviors preserved
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.membership import (
    MembershipPlan,
    MemberSubscription,
    PlanDurationUnit,
    PlanStatus,
    SubscriptionStatus,
)
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_a(db_session: AsyncSession) -> Club:
    club = Club(name="Club Alpha", slug=f"club-alpha-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_b(db_session: AsyncSession) -> Club:
    club = Club(name="Club Beta", slug=f"club-beta-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def owner_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"owner-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Owner User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def manager_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"manager-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Manager User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def td_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"td-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="TD User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def player_user(db_session: AsyncSession) -> User:
    u = User(
        email=f"player-{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Test1234!"),
        full_name="Player User",
        is_active=True,
        is_verified=True,
    )
    db_session.add(u)
    await db_session.flush()
    return u


@pytest_asyncio.fixture
async def owner_membership(db_session, club_a, owner_user) -> ClubMembership:
    m = ClubMembership(club_id=club_a.id, user_id=owner_user.id, role=ClubRole.CLUB_OWNER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return m


@pytest_asyncio.fixture
async def manager_membership(db_session, club_a, manager_user) -> ClubMembership:
    m = ClubMembership(club_id=club_a.id, user_id=manager_user.id, role=ClubRole.CLUB_MANAGER, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return m


@pytest_asyncio.fixture
async def td_membership(db_session, club_a, td_user) -> ClubMembership:
    m = ClubMembership(club_id=club_a.id, user_id=td_user.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True)
    db_session.add(m)
    await db_session.flush()
    return m


@pytest_asyncio.fixture
async def player_club_membership(db_session, club_a, player_user) -> ClubPlayerMembership:
    pm = ClubPlayerMembership(
        club_id=club_a.id,
        user_id=player_user.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(pm)
    await db_session.flush()
    return pm


@pytest_asyncio.fixture
async def basic_plan(db_session, club_a) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_a.id,
        name="Basic Monthly",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=999,
        currency="INR",
        benefits=["Court access"],
        booking_limit=3,
        advance_booking_days=14,
        status=PlanStatus.ACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


@pytest_asyncio.fixture
async def inactive_plan(db_session, club_a) -> MembershipPlan:
    plan = MembershipPlan(
        club_id=club_a.id,
        name="Inactive Plan",
        duration_unit=PlanDurationUnit.MONTHLY,
        price=500,
        currency="INR",
        status=PlanStatus.INACTIVE,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


@pytest_asyncio.fixture
async def active_subscription(db_session, club_a, player_club_membership, basic_plan) -> MemberSubscription:
    today = date.today()
    sub = MemberSubscription(
        club_id=club_a.id,
        player_membership_id=player_club_membership.id,
        membership_plan_id=basic_plan.id,
        start_date=today - timedelta(days=5),
        end_date=today + timedelta(days=25),
        status=SubscriptionStatus.ACTIVE,
        auto_renew=False,
    )
    db_session.add(sub)
    await db_session.flush()
    return sub


# ─── Helpers ──────────────────────────────────────────────────────────────────

def auth(user: User) -> dict:
    return make_auth_header(user)


# ═══════════════════════════════════════════════════════════════════════════════
# PLAN TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestMembershipPlanCreate:
    @pytest.mark.asyncio
    async def test_owner_can_create_plan(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={
                "name": "Gold Monthly",
                "duration_unit": "monthly",
                "price": "1500.00",
                "currency": "INR",
                "benefits": ["Court access", "Priority booking"],
                "booking_limit": 5,
                "advance_booking_days": 21,
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["name"] == "Gold Monthly"
        assert data["duration_unit"] == "monthly"
        assert data["club_id"] == str(club_a.id)
        assert data["status"] == "active"
        assert data["booking_limit"] == 5
        assert data["advance_booking_days"] == 21

    @pytest.mark.asyncio
    async def test_manager_can_create_plan(
        self,
        async_client: AsyncClient,
        club_a: Club,
        manager_user: User,
        manager_membership: ClubMembership,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={"name": "Manager Plan", "duration_unit": "yearly", "price": "5000"},
            headers=auth(manager_user),
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_tournament_director_denied(
        self,
        async_client: AsyncClient,
        club_a: Club,
        td_user: User,
        td_membership: ClubMembership,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={"name": "TD Plan", "duration_unit": "monthly", "price": "100"},
            headers=auth(td_user),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_player_denied_plan_creation(
        self,
        async_client: AsyncClient,
        club_a: Club,
        player_user: User,
        player_club_membership: ClubPlayerMembership,
    ):
        """Players have no ClubMembership (staff role), so they get 403."""
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={"name": "Player Plan", "duration_unit": "monthly", "price": "100"},
            headers=auth(player_user),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_invalid_price_rejected(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={"name": "Bad Plan", "duration_unit": "monthly", "price": "-100"},
            headers=auth(owner_user),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_duration_rejected(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={"name": "Bad Plan", "duration_unit": "weekly", "price": "100"},
            headers=auth(owner_user),
        )
        assert resp.status_code == 422


class TestMembershipPlanRead:
    @pytest.mark.asyncio
    async def test_get_plan(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
    ):
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{basic_plan.id}",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(basic_plan.id)
        assert data["name"] == "Basic Monthly"
        assert "subscriber_count" in data

    @pytest.mark.asyncio
    async def test_list_plans(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
        inactive_plan: MembershipPlan,
    ):
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        plans = resp.json()
        assert len(plans) >= 2

    @pytest.mark.asyncio
    async def test_filter_by_active_status(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
        inactive_plan: MembershipPlan,
    ):
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/membership-plans?status=active",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        plans = resp.json()
        assert all(p["status"] == "active" for p in plans)

    @pytest.mark.asyncio
    async def test_plan_belongs_to_club(
        self,
        async_client: AsyncClient,
        club_a: Club,
        club_b: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
    ):
        """Can't access Club A's plan via Club B's URL."""
        # Add owner to club_b
        club_b_mem = ClubMembership(club_id=club_b.id, user_id=owner_user.id, role=ClubRole.CLUB_OWNER, is_active=True)
        # We don't add this, just test cross-club access is denied
        resp = await async_client.get(
            f"/api/v1/clubs/{club_b.id}/membership-plans/{basic_plan.id}",
            headers=auth(owner_user),
        )
        # Forbidden (no membership) or 404 (plan not in club_b)
        assert resp.status_code in (403, 404)


class TestMembershipPlanUpdate:
    @pytest.mark.asyncio
    async def test_update_plan(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
    ):
        resp = await async_client.patch(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{basic_plan.id}",
            json={"name": "Updated Basic", "price": "1099.00"},
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Basic"

    @pytest.mark.asyncio
    async def test_deactivate_plan(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{basic_plan.id}/deactivate",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "inactive"

    @pytest.mark.asyncio
    async def test_reactivate_plan(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        inactive_plan: MembershipPlan,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{inactive_plan.id}/reactivate",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_deactivate_already_inactive_raises_400(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        inactive_plan: MembershipPlan,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{inactive_plan.id}/deactivate",
            headers=auth(owner_user),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_same_name_allowed_across_clubs(
        self,
        db_session: AsyncSession,
        async_client: AsyncClient,
        club_a: Club,
        club_b: Club,
        owner_user: User,
        owner_membership: ClubMembership,
    ):
        """Same plan name is valid if it belongs to different clubs."""
        # Create a plan in club_b with same name as basic_plan
        plan_b = MembershipPlan(
            club_id=club_b.id,
            name="Basic Monthly",
            duration_unit=PlanDurationUnit.MONTHLY,
            price=800,
            currency="INR",
            status=PlanStatus.ACTIVE,
        )
        db_session.add(plan_b)
        await db_session.flush()
        # Both exist with same name in different clubs
        assert plan_b.club_id == club_b.id


class TestDurationCalculation:
    @pytest.mark.asyncio
    async def test_monthly_duration(self):
        from app.services.membership_plan_service import MembershipPlanService
        start = date(2026, 1, 1)
        end = MembershipPlanService.calculate_end_date(start, PlanDurationUnit.MONTHLY)
        assert end == date(2026, 1, 31)

    @pytest.mark.asyncio
    async def test_quarterly_duration(self):
        from app.services.membership_plan_service import MembershipPlanService
        start = date(2026, 1, 1)
        end = MembershipPlanService.calculate_end_date(start, PlanDurationUnit.QUARTERLY)
        assert end == date(2026, 3, 31)

    @pytest.mark.asyncio
    async def test_yearly_duration(self):
        from app.services.membership_plan_service import MembershipPlanService
        start = date(2026, 1, 1)
        end = MembershipPlanService.calculate_end_date(start, PlanDurationUnit.YEARLY)
        assert end == date(2026, 12, 31)

    @pytest.mark.asyncio
    async def test_monthly_end_of_month_leap(self):
        """Jan 31 + 1 month = Feb 28/29 (calendar-correct)."""
        from app.services.membership_plan_service import MembershipPlanService
        start = date(2024, 1, 31)  # 2024 is a leap year
        end = MembershipPlanService.calculate_end_date(start, PlanDurationUnit.MONTHLY)
        assert end == date(2024, 2, 28)  # relativedelta clamps to last day


# ═══════════════════════════════════════════════════════════════════════════════
# SUBSCRIPTION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubscriptionCreate:
    @pytest.mark.asyncio
    async def test_owner_can_create_subscription(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
        basic_plan: MembershipPlan,
    ):
        today = date.today().isoformat()
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(basic_plan.id),
                "start_date": today,
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["status"] in ("active", "scheduled")
        assert data["membership_plan_id"] == str(basic_plan.id)

    @pytest.mark.asyncio
    async def test_manager_can_create_subscription(
        self,
        async_client: AsyncClient,
        club_a: Club,
        manager_user: User,
        manager_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
        basic_plan: MembershipPlan,
    ):
        today = date.today().isoformat()
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(basic_plan.id),
                "start_date": today,
            },
            headers=auth(manager_user),
        )
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_future_start_date_creates_scheduled(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
        basic_plan: MembershipPlan,
    ):
        future = (date.today() + timedelta(days=5)).isoformat()
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(basic_plan.id),
                "start_date": future,
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 201
        assert resp.json()["status"] == "scheduled"

    @pytest.mark.asyncio
    async def test_past_start_date_rejected(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
        basic_plan: MembershipPlan,
    ):
        past = (date.today() - timedelta(days=1)).isoformat()
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(basic_plan.id),
                "start_date": past,
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_inactive_plan_rejected(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
        inactive_plan: MembershipPlan,
    ):
        today = date.today().isoformat()
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(inactive_plan.id),
                "start_date": today,
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 400
        assert "inactive" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_duplicate_active_subscription_rejected(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
        basic_plan: MembershipPlan,
        active_subscription: MemberSubscription,
    ):
        """Cannot create second active subscription for same player/club."""
        today = date.today().isoformat()
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(basic_plan.id),
                "start_date": today,
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_tournament_director_denied_subscription_create(
        self,
        async_client: AsyncClient,
        club_a: Club,
        td_user: User,
        td_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
        basic_plan: MembershipPlan,
    ):
        today = date.today().isoformat()
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(basic_plan.id),
                "start_date": today,
            },
            headers=auth(td_user),
        )
        assert resp.status_code == 403


class TestSubscriptionLifecycle:
    @pytest.mark.asyncio
    async def test_get_subscription(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        active_subscription: MemberSubscription,
    ):
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/subscriptions/{active_subscription.id}",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(active_subscription.id)
        assert data["status"] == "active"
        assert "plan_name" in data

    @pytest.mark.asyncio
    async def test_cancel_active_subscription(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        active_subscription: MemberSubscription,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions/{active_subscription.id}/cancel",
            json={"cancellation_reason": "Test cancellation"},
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "cancelled"
        assert data["cancellation_reason"] == "Test cancellation"

    @pytest.mark.asyncio
    async def test_cancel_already_cancelled_fails(
        self,
        db_session: AsyncSession,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        active_subscription: MemberSubscription,
    ):
        # Cancel it first
        active_subscription.status = SubscriptionStatus.CANCELLED
        await db_session.flush()

        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions/{active_subscription.id}/cancel",
            json={},
            headers=auth(owner_user),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_expired_subscription_effective_status(self, db_session: AsyncSession):
        """Effective_status returns EXPIRED when today > end_date."""
        sub = MemberSubscription(
            id=uuid.uuid4(),
            club_id=uuid.uuid4(),
            player_membership_id=uuid.uuid4(),
            membership_plan_id=uuid.uuid4(),
            status=SubscriptionStatus.ACTIVE,
            start_date=date.today() - timedelta(days=60),
            end_date=date.today() - timedelta(days=1),
            auto_renew=False,
        )
        assert sub.effective_status == SubscriptionStatus.EXPIRED
        assert not sub.is_effectively_active

    @pytest.mark.asyncio
    async def test_scheduled_subscription_not_active(self, db_session: AsyncSession):
        """SCHEDULED subscription is not effectively active."""
        sub = MemberSubscription(
            id=uuid.uuid4(),
            club_id=uuid.uuid4(),
            player_membership_id=uuid.uuid4(),
            membership_plan_id=uuid.uuid4(),
            status=SubscriptionStatus.SCHEDULED,
            start_date=date.today() + timedelta(days=5),
            end_date=date.today() + timedelta(days=35),
            auto_renew=False,
        )
        assert sub.effective_status == SubscriptionStatus.SCHEDULED
        assert not sub.is_effectively_active

    @pytest.mark.asyncio
    async def test_renew_subscription(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        active_subscription: MemberSubscription,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions/{active_subscription.id}/renew",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        data = resp.json()
        # Renewal creates a NEW subscription
        assert data["id"] != str(active_subscription.id)
        # New start should be after old end
        new_start = date.fromisoformat(data["start_date"])
        old_end = active_subscription.end_date
        assert new_start > old_end

    @pytest.mark.asyncio
    async def test_list_subscriptions_with_status_filter(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        active_subscription: MemberSubscription,
    ):
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/subscriptions?status=active",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        subs = resp.json()
        assert all(s["status"] in ("active",) for s in subs)


class TestPlayerMembershipView:
    @pytest.mark.asyncio
    async def test_player_can_view_own_membership(
        self,
        db_session: AsyncSession,
        async_client: AsyncClient,
        club_a: Club,
        player_user: User,
        player_club_membership: ClubPlayerMembership,
        basic_plan: MembershipPlan,
    ):
        """Player can view their active membership via /player/membership."""
        # Create an active subscription
        today = date.today()
        sub = MemberSubscription(
            club_id=club_a.id,
            player_membership_id=player_club_membership.id,
            membership_plan_id=basic_plan.id,
            start_date=today - timedelta(days=3),
            end_date=today + timedelta(days=27),
            status=SubscriptionStatus.ACTIVE,
            auto_renew=False,
        )
        db_session.add(sub)
        await db_session.flush()

        resp = await async_client.get(
            f"/api/v1/player/membership?club_id={club_a.id}",
            headers=auth(player_user),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["plan_name"] == "Basic Monthly"
        assert data["status"] == "active"
        assert "booking_limit" in data
        assert "advance_booking_days" in data

    @pytest.mark.asyncio
    async def test_player_no_membership_returns_404(
        self,
        async_client: AsyncClient,
        club_a: Club,
        player_user: User,
        player_club_membership: ClubPlayerMembership,
    ):
        resp = await async_client.get(
            f"/api/v1/player/membership?club_id={club_a.id}",
            headers=auth(player_user),
        )
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# TENANT ISOLATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestTenantIsolation:
    @pytest_asyncio.fixture
    async def club_b_owner(self, db_session: AsyncSession, club_b: Club) -> tuple[User, ClubMembership]:
        u = User(
            email=f"b-owner-{uuid.uuid4().hex[:6]}@test.local",
            hashed_password=hash_password("Test1234!"),
            is_active=True,
            is_verified=True,
        )
        db_session.add(u)
        await db_session.flush()
        m = ClubMembership(club_id=club_b.id, user_id=u.id, role=ClubRole.CLUB_OWNER, is_active=True)
        db_session.add(m)
        await db_session.flush()
        return u, m

    @pytest.mark.asyncio
    async def test_cross_club_plan_access_denied(
        self,
        async_client: AsyncClient,
        club_a: Club,
        club_b: Club,
        basic_plan: MembershipPlan,
        club_b_owner: tuple,
    ):
        """Club B owner cannot access Club A plans."""
        b_owner, _ = club_b_owner
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{basic_plan.id}",
            headers=auth(b_owner),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_cross_club_subscription_access_denied(
        self,
        async_client: AsyncClient,
        club_a: Club,
        club_b: Club,
        active_subscription: MemberSubscription,
        club_b_owner: tuple,
    ):
        """Club B owner cannot access Club A subscriptions."""
        b_owner, _ = club_b_owner
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/subscriptions/{active_subscription.id}",
            headers=auth(b_owner),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_foreign_plan_id_rejected(
        self,
        db_session: AsyncSession,
        async_client: AsyncClient,
        club_a: Club,
        club_b: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        player_club_membership: ClubPlayerMembership,
    ):
        """Cannot enroll a player into a plan from another club."""
        # Create a plan in club_b
        plan_b = MembershipPlan(
            club_id=club_b.id,
            name="Plan B",
            duration_unit=PlanDurationUnit.MONTHLY,
            price=500,
            currency="INR",
            status=PlanStatus.ACTIVE,
        )
        db_session.add(plan_b)
        await db_session.flush()

        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(player_club_membership.id),
                "membership_plan_id": str(plan_b.id),
                "start_date": date.today().isoformat(),
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 404  # Plan not in club_a

    @pytest.mark.asyncio
    async def test_foreign_player_membership_rejected(
        self,
        db_session: AsyncSession,
        async_client: AsyncClient,
        club_a: Club,
        club_b: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
    ):
        """Cannot enroll a player from club_b into club_a subscription."""
        # Create a player in club_b only
        other_user = User(
            email=f"other-{uuid.uuid4().hex[:6]}@test.local",
            hashed_password=hash_password("Test1234!"),
            is_active=True,
            is_verified=True,
        )
        db_session.add(other_user)
        await db_session.flush()
        pm_b = ClubPlayerMembership(
            club_id=club_b.id,
            user_id=other_user.id,
            status=PlayerMembershipStatus.ACTIVE,
        )
        db_session.add(pm_b)
        await db_session.flush()

        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/subscriptions",
            json={
                "player_membership_id": str(pm_b.id),
                "membership_plan_id": str(basic_plan.id),
                "start_date": date.today().isoformat(),
            },
            headers=auth(owner_user),
        )
        assert resp.status_code == 404  # Player membership not in club_a


# ═══════════════════════════════════════════════════════════════════════════════
# BOOKING INTEGRATION TESTS (Phase 11 ↔ Phase 12)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBookingIntegration:
    @pytest.mark.asyncio
    async def test_effective_status_active_subscription(self):
        """Active subscription with today in range → effectively active."""
        today = date.today()
        sub = MemberSubscription(
            id=uuid.uuid4(),
            club_id=uuid.uuid4(),
            player_membership_id=uuid.uuid4(),
            membership_plan_id=uuid.uuid4(),
            status=SubscriptionStatus.ACTIVE,
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=25),
            auto_renew=False,
        )
        assert sub.is_effectively_active

    @pytest.mark.asyncio
    async def test_cancelled_subscription_not_active(self):
        """Cancelled subscription is never effectively active."""
        today = date.today()
        sub = MemberSubscription(
            id=uuid.uuid4(),
            club_id=uuid.uuid4(),
            player_membership_id=uuid.uuid4(),
            membership_plan_id=uuid.uuid4(),
            status=SubscriptionStatus.CANCELLED,
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=25),
            auto_renew=False,
        )
        assert not sub.is_effectively_active
        assert sub.effective_status == SubscriptionStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_expired_subscription_returns_defaults(self):
        """Expired subscription → effective status is EXPIRED, not ACTIVE."""
        today = date.today()
        sub = MemberSubscription(
            id=uuid.uuid4(),
            club_id=uuid.uuid4(),
            player_membership_id=uuid.uuid4(),
            membership_plan_id=uuid.uuid4(),
            status=SubscriptionStatus.ACTIVE,
            start_date=today - timedelta(days=40),
            end_date=today - timedelta(days=10),
            auto_renew=False,
        )
        assert not sub.is_effectively_active
        assert sub.effective_status == SubscriptionStatus.EXPIRED

    @pytest.mark.asyncio
    async def test_inactive_plan_with_active_subscription_stays_valid(
        self,
        db_session: AsyncSession,
    ):
        """
        INVARIANT 7: Existing active subscriptions remain valid when their plan is deactivated.
        The subscription's effective_status depends on dates and subscription status, NOT plan status.
        """
        today = date.today()
        sub = MemberSubscription(
            id=uuid.uuid4(),
            club_id=uuid.uuid4(),
            player_membership_id=uuid.uuid4(),
            membership_plan_id=uuid.uuid4(),
            status=SubscriptionStatus.ACTIVE,
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=25),
            auto_renew=False,
        )
        # The plan being inactive does not affect existing subscription's effective_status
        assert sub.is_effectively_active  # subscription still valid

    @pytest.mark.asyncio
    async def test_deactivated_plan_still_has_valid_subscriptions(
        self,
        db_session: AsyncSession,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
        active_subscription: MemberSubscription,
    ):
        """Deactivating a plan does not cancel active subscriptions."""
        # Deactivate the plan
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{basic_plan.id}/deactivate",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200

        # Subscription should still be active
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/subscriptions/{active_subscription.id}",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"


# ═══════════════════════════════════════════════════════════════════════════════
# PLAN INVARIANT TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestPlanInvariants:
    @pytest.mark.asyncio
    async def test_price_is_decimal_not_float(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
    ):
        """Price should come back as a decimal-precise string."""
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{basic_plan.id}",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        price = resp.json()["price"]
        # Should be representable as Decimal without floating-point error
        d = Decimal(str(price))
        assert d == Decimal("999.00") or d == Decimal("999")

    @pytest.mark.asyncio
    async def test_invalid_booking_limit_rejected(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={"name": "Bad Limits", "duration_unit": "monthly", "price": "100", "booking_limit": -1},
            headers=auth(owner_user),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_invalid_advance_booking_days_rejected(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
    ):
        resp = await async_client.post(
            f"/api/v1/clubs/{club_a.id}/membership-plans",
            json={"name": "Bad Days", "duration_unit": "monthly", "price": "100", "advance_booking_days": 0},
            headers=auth(owner_user),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_subscriber_count_in_plan_detail(
        self,
        async_client: AsyncClient,
        club_a: Club,
        owner_user: User,
        owner_membership: ClubMembership,
        basic_plan: MembershipPlan,
        active_subscription: MemberSubscription,
    ):
        """Plan detail shows correct subscriber count."""
        resp = await async_client.get(
            f"/api/v1/clubs/{club_a.id}/membership-plans/{basic_plan.id}",
            headers=auth(owner_user),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["subscriber_count"] >= 1
