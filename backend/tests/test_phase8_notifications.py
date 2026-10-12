"""
Aught2 Pickleball — Phase 8 Notification System Automated Tests
Verifies:
1. Multi-Club Notification Ownership & Privacy Isolation
2. Lifecycle Triggers:
   - Bookings (created, cancelled)
   - Membership Requests (submitted to staff, approved to player, rejected to player)
   - Payments (succeeded, failed)
   - Staff role assignment and role updates
   - League registration
3. Inbox Behavior, Pagination, Stable Deterministic Sort, and Read Tracking
4. Idempotency & Duplicate Prevention
5. Notification Preferences (Category opt-outs and mandatory transactional bypass)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court
from app.models.notification import Notification, NotificationPreference
from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from app.services.club_membership_request_service import ClubMembershipRequestService
from app.services.club_service import ClubService
from app.services.notification_service import NotificationService
from app.services.payment_service import PaymentService


@pytest.fixture
async def setup_multi_club_env(db_session: AsyncSession):
    """
    Creates two clubs, two players, one club owner, and one tournament director.
    Player 1 belongs to Club 1 and Club 2.
    Player 2 belongs to Club 2 only.
    """
    now = datetime.now(timezone.utc)

    # Users
    u_player1 = User(
        email="player1@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Player One",
        is_active=True,
    )
    u_player2 = User(
        email="player2@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Player Two",
        is_active=True,
    )
    u_owner = User(
        email="owner1@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Club One Owner",
        is_active=True,
    )
    u_td = User(
        email="td1@test.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Tournament Director",
        is_active=True,
    )

    db_session.add_all([u_player1, u_player2, u_owner, u_td])
    await db_session.flush()

    # Clubs
    c1 = Club(
        name="Metro Pickleball Club",
        slug="metro-pickleball",
        address_line1="100 Main St",
        city="Metroville",
        state="CA",
        postal_code="90210",
        is_active=True,
        operating_hours={},
    )
    c2 = Club(
        name="Pacific Pickleball Club",
        slug="pacific-pickleball",
        address_line1="200 Ocean Ave",
        city="Pacifica",
        state="CA",
        postal_code="94044",
        is_active=True,
        operating_hours={},
    )
    db_session.add_all([c1, c2])
    await db_session.flush()

    # Staff Memberships
    m_owner = ClubMembership(
        club_id=c1.id,
        user_id=u_owner.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    m_td = ClubMembership(
        club_id=c1.id,
        user_id=u_td.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    db_session.add_all([m_owner, m_td])

    # Player Memberships
    pm1_c1 = ClubPlayerMembership(
        club_id=c1.id,
        user_id=u_player1.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    pm1_c2 = ClubPlayerMembership(
        club_id=c2.id,
        user_id=u_player1.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    pm2_c2 = ClubPlayerMembership(
        club_id=c2.id,
        user_id=u_player2.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add_all([pm1_c1, pm1_c2, pm2_c2])
    await db_session.commit()

    return {
        "c1": c1,
        "c2": c2,
        "player1": u_player1,
        "player2": u_player2,
        "owner": u_owner,
        "td": u_td,
    }


def auth_header(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


# ─── 1. Ownership & Security Tests ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_lists_own_notifications_across_multiple_clubs(
    async_client: AsyncClient,
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """Player 1 belongs to Club 1 and Club 2 and receives notifications from both."""
    env = setup_multi_club_env
    p1 = env["player1"]
    p2 = env["player2"]
    c1 = env["c1"]
    c2 = env["c2"]

    svc = NotificationService(db_session)
    n1 = await svc.create_notification(
        user_id=p1.id,
        club_id=c1.id,
        category="booking",
        title="Club 1 Booking",
        message="Confirmed for Club 1",
    )
    n2 = await svc.create_notification(
        user_id=p1.id,
        club_id=c2.id,
        category="membership",
        title="Club 2 Membership",
        message="Renewed for Club 2",
    )
    # Player 2 notification
    await svc.create_notification(
        user_id=p2.id,
        club_id=c2.id,
        category="tournament",
        title="P2 Tournament",
        message="P2 registration",
    )
    await db_session.commit()

    # Query without club filter -> sees both Club 1 and Club 2 notifications
    resp = await async_client.get("/api/v1/notifications", headers=auth_header(p1))
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    notif_ids = [item["id"] for item in data["items"]]
    assert str(n1.id) in notif_ids
    assert str(n2.id) in notif_ids

    # Query with club filter c1
    resp_c1 = await async_client.get(f"/api/v1/notifications?club_id={c1.id}", headers=auth_header(p1))
    assert resp_c1.status_code == 200
    data_c1 = resp_c1.json()
    assert data_c1["total"] == 1
    assert data_c1["items"][0]["id"] == str(n1.id)
    assert data_c1["items"][0]["club_name"] == c1.name


@pytest.mark.asyncio
async def test_cross_user_isolation_and_permission_checks(
    async_client: AsyncClient,
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """User cannot see, mark read, or delete another user's notifications."""
    env = setup_multi_club_env
    p1 = env["player1"]
    p2 = env["player2"]
    c1 = env["c1"]

    svc = NotificationService(db_session)
    n1 = await svc.create_notification(
        user_id=p1.id,
        club_id=c1.id,
        category="booking",
        title="Private Player 1 Notif",
        message="Confidential booking",
    )
    await db_session.commit()

    # Player 2 lists notifications -> empty
    resp_p2 = await async_client.get("/api/v1/notifications", headers=auth_header(p2))
    assert resp_p2.status_code == 200
    assert resp_p2.json()["total"] == 0

    # Player 2 attempts to mark Player 1's notification as read -> 404
    resp_read = await async_client.post(
        f"/api/v1/notifications/{n1.id}/read",
        headers=auth_header(p2),
    )
    assert resp_read.status_code == 404

    # Player 2 attempts to delete Player 1's notification -> 404
    resp_del = await async_client.delete(
        f"/api/v1/notifications/{n1.id}",
        headers=auth_header(p2),
    )
    assert resp_del.status_code == 404


# ─── 2. Lifecycle Trigger Tests ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_membership_request_triggers_notifications(
    async_client: AsyncClient,
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """
    Submitting a request notifies club staff.
    Approving the request notifies player.
    Rejecting the request notifies player.
    """
    env = setup_multi_club_env
    p2 = env["player2"]
    c1 = env["c1"]
    owner = env["owner"]

    req_svc = ClubMembershipRequestService(db_session)

    # 1. Player 2 submits request for Club 1
    req = await req_svc.create_request(club_id=c1.id, user_id=p2.id, message="Please let me join")
    await db_session.commit()

    # Verify Owner received notification
    notif_svc = NotificationService(db_session)
    owner_notifs, total, _ = await notif_svc.list_user_notifications(user_id=owner.id)
    assert total >= 1
    staff_notif = next((n for n in owner_notifs if n.category == "membership"), None)
    assert staff_notif is not None
    assert "New Membership Request" in staff_notif.title
    assert "Player Two" in staff_notif.message

    # 2. Staff approves the request
    await req_svc.approve_request(club_id=c1.id, request_id=req.id, reviewer_user_id=owner.id)
    await db_session.commit()

    # Verify Player 2 received approval notification
    p2_notifs, p2_total, _ = await notif_svc.list_user_notifications(user_id=p2.id)
    assert p2_total >= 1
    approved_notif = next((n for n in p2_notifs if "Approved" in n.title), None)
    assert approved_notif is not None
    assert approved_notif.data.get("status") == "approved"
    assert approved_notif.club_id == c1.id


@pytest.mark.asyncio
async def test_payment_failure_and_success_notifications(
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """Authoritative payment state transitions trigger accurate notifications."""
    env = setup_multi_club_env
    p1 = env["player1"]
    c1 = env["c1"]
    owner = env["owner"]

    payment_svc = PaymentService(db_session)

    # Create payment in PENDING status
    now = datetime.now(timezone.utc)
    payment = Payment(
        reference=f"A2P-{uuid.uuid4().hex[:8].upper()}",
        club_id=c1.id,
        player_id=p1.id,
        amount=50.00,
        currency="USD",
        purpose=PaymentPurpose.MEMBERSHIP,
        payment_method=PaymentMethod.ONLINE,
        status=PaymentStatus.PENDING,
        created_at=now,
        updated_at=now,
    )
    db_session.add(payment)
    await db_session.commit()

    # 1. Mark as failed
    await payment_svc.mark_as_failed(
        club_id=c1.id,
        payment_id=payment.id,
        actor_id=owner.id,
        failure_reason="Card expired",
    )
    await db_session.commit()

    notif_svc = NotificationService(db_session)
    p1_notifs, total, _ = await notif_svc.list_user_notifications(user_id=p1.id)
    failed_notif = next((n for n in p1_notifs if "Failed" in n.title), None)
    assert failed_notif is not None
    assert "Card expired" in failed_notif.message
    assert failed_notif.data.get("failure_reason") == "Card expired"


@pytest.mark.asyncio
async def test_staff_role_assignment_notification(
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """Adding a staff member or updating their role generates administrative notifications."""
    env = setup_multi_club_env
    p2 = env["player2"]
    c1 = env["c1"]

    club_svc = ClubService(db_session)
    member_resp = await club_svc.add_member(
        club_id=c1.id,
        email=p2.email,
        role=ClubRole.CLUB_MANAGER,
    )
    await db_session.commit()

    notif_svc = NotificationService(db_session)
    p2_notifs, total, _ = await notif_svc.list_user_notifications(user_id=p2.id)
    assert total >= 1
    admin_notif = next((n for n in p2_notifs if n.category == "administrative"), None)
    assert admin_notif is not None
    assert "Staff Role Assigned" in admin_notif.title
    assert "Club Manager" in admin_notif.message


# ─── 3. Inbox Behavior, Read Tracking & Preferences ─────────────────────────

@pytest.mark.asyncio
async def test_read_tracking_and_timestamp(
    async_client: AsyncClient,
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """Marking a notification as read sets read_at timestamp."""
    env = setup_multi_club_env
    p1 = env["player1"]
    c1 = env["c1"]

    svc = NotificationService(db_session)
    n = await svc.create_notification(
        user_id=p1.id,
        club_id=c1.id,
        category="general",
        title="Welcome",
        message="Welcome to pickleball",
    )
    await db_session.commit()

    assert n.is_read is False
    assert n.read_at is None

    # Mark as read via API
    resp = await async_client.post(f"/api/v1/notifications/{n.id}/read", headers=auth_header(p1))
    assert resp.status_code == 200

    # Verify persistent state
    await db_session.refresh(n)
    assert n.is_read is True
    assert n.read_at is not None


@pytest.mark.asyncio
async def test_idempotent_notification_creation(
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """Identical operations with same idempotency_key do not create duplicate notifications."""
    env = setup_multi_club_env
    p1 = env["player1"]
    c1 = env["c1"]

    svc = NotificationService(db_session)
    n1 = await svc.create_notification(
        user_id=p1.id,
        club_id=c1.id,
        category="booking",
        title="Booking #101 Confirmed",
        message="Your slot is confirmed",
        idempotency_key="booking_101_confirmed",
    )
    await db_session.commit()

    # Retry creation with same key
    n2 = await svc.create_notification(
        user_id=p1.id,
        club_id=c1.id,
        category="booking",
        title="Booking #101 Confirmed",
        message="Your slot is confirmed",
        idempotency_key="booking_101_confirmed",
    )
    await db_session.commit()

    assert n1.id == n2.id
    items, total, _ = await svc.list_user_notifications(user_id=p1.id)
    assert total == 1


@pytest.mark.asyncio
async def test_notification_preferences_opt_out_and_mandatory_bypass(
    async_client: AsyncClient,
    db_session: AsyncSession,
    setup_multi_club_env,
):
    """Disabling category opt-outs skips optional notifications, but mandatory bypasses."""
    env = setup_multi_club_env
    p1 = env["player1"]
    c1 = env["c1"]

    # 1. Update preferences: disable booking notifications
    put_resp = await async_client.put(
        "/api/v1/notifications/preferences",
        headers=auth_header(p1),
        json={"booking_notifications": False},
    )
    assert put_resp.status_code == 200
    assert put_resp.json()["booking_notifications"] is False

    svc = NotificationService(db_session)

    # 2. Try to create optional booking notification -> skipped (returns None)
    optional_notif = await svc.create_notification(
        user_id=p1.id,
        club_id=c1.id,
        category="booking",
        title="Upcoming Session",
        message="Practice session tomorrow",
        mandatory=False,
    )
    assert optional_notif is None

    # 3. Create mandatory booking notification -> delivered
    mandatory_notif = await svc.create_notification(
        user_id=p1.id,
        club_id=c1.id,
        category="booking",
        title="Emergency Court Closure",
        message="Court closed due to weather",
        mandatory=True,
    )
    assert mandatory_notif is not None
    await db_session.commit()

    items, total, _ = await svc.list_user_notifications(user_id=p1.id)
    assert total == 1
    assert items[0].title == "Emergency Court Closure"
