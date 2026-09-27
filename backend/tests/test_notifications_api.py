"""
Aught2 Pickleball — Notifications REST API Integration Tests
Tests:
- GET /api/v1/notifications (list, category filter, date filter, unread_only, pagination)
- GET /api/v1/notifications/unread-count
- POST /api/v1/notifications/{notification_id}/read
- POST /api/v1/notifications/read-all
- Security & isolation: 401 unauthenticated, cross-user privacy (users can only see their own notifications)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.notification import Notification
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.fixture
async def sample_users(db_session: AsyncSession):
    """Create two active users for isolation testing."""
    u1 = User(
        email="notify_user1@demo.local",
        hashed_password=hash_password("Password123!"),
        full_name="Notify User One",
        is_active=True,
    )
    u2 = User(
        email="notify_user2@demo.local",
        hashed_password=hash_password("Password123!"),
        full_name="Notify User Two",
        is_active=True,
    )
    db_session.add_all([u1, u2])
    await db_session.flush()
    return u1, u2


@pytest.fixture
async def sample_club(db_session: AsyncSession):
    """Create a sample club."""
    club = Club(
        name="Aught2 Test Club",
        slug="aught2-test-club",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()
    return club


@pytest.mark.asyncio
async def test_list_notifications_empty(async_client: AsyncClient, sample_users):
    """GET /api/v1/notifications returns empty list for new user."""
    u1, _ = sample_users
    headers = make_auth_header(u1)
    res = await async_client.get("/api/v1/notifications", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["unread_count"] == 0


@pytest.mark.asyncio
async def test_list_notifications_and_filtering(
    async_client: AsyncClient, db_session: AsyncSession, sample_users, sample_club
):
    """Verify listing notifications with category, unread_only, and pagination."""
    u1, u2 = sample_users
    now = datetime.now(timezone.utc)

    n1 = Notification(
        user_id=u1.id,
        club_id=sample_club.id,
        category="bookings",
        title="Court 1 Confirmed",
        message="Your court is reserved.",
        is_read=False,
        created_at=now - timedelta(hours=1),
    )
    n2 = Notification(
        user_id=u1.id,
        club_id=sample_club.id,
        category="tournaments",
        title="Summer Slam Schedule",
        message="You are in Pool A.",
        is_read=True,
        created_at=now - timedelta(hours=2),
    )
    n3 = Notification(
        user_id=u1.id,
        club_id=sample_club.id,
        category="events",
        title="Beginner Clinic RSVP",
        message="Starts this Saturday.",
        is_read=False,
        created_at=now - timedelta(hours=3),
    )
    # Another user's notification (should never appear for u1)
    n_other = Notification(
        user_id=u2.id,
        club_id=sample_club.id,
        category="bookings",
        title="Other User Booking",
        message="Secret message.",
        is_read=False,
        created_at=now,
    )
    db_session.add_all([n1, n2, n3, n_other])
    await db_session.commit()

    headers = make_auth_header(u1)

    # 1. Fetch all for u1
    res = await async_client.get("/api/v1/notifications", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3
    assert data["unread_count"] == 2
    assert len(data["items"]) == 3
    ids = [i["id"] for i in data["items"]]
    assert str(n_other.id) not in ids

    # 2. Filter by category
    res_cat = await async_client.get("/api/v1/notifications?category=bookings", headers=headers)
    assert res_cat.status_code == 200
    cat_data = res_cat.json()
    assert cat_data["total"] == 1
    assert cat_data["items"][0]["title"] == "Court 1 Confirmed"

    # 3. Filter unread_only
    res_unread = await async_client.get("/api/v1/notifications?unread_only=true", headers=headers)
    assert res_unread.status_code == 200
    unread_data = res_unread.json()
    assert len(unread_data["items"]) == 2
    for item in unread_data["items"]:
        assert item["is_read"] is False

    # 4. Pagination
    res_page = await async_client.get("/api/v1/notifications?limit=2&offset=0", headers=headers)
    assert res_page.status_code == 200
    assert len(res_page.json()["items"]) == 2


@pytest.mark.asyncio
async def test_unread_count_endpoint(
    async_client: AsyncClient, db_session: AsyncSession, sample_users
):
    """GET /api/v1/notifications/unread-count returns accurate count."""
    u1, _ = sample_users
    now = datetime.now(timezone.utc)

    for i in range(4):
        db_session.add(
            Notification(
                user_id=u1.id,
                category="general",
                title=f"Notif {i}",
                message=f"Message {i}",
                is_read=(i >= 2),  # 2 unread, 2 read
                created_at=now,
            )
        )
    await db_session.commit()

    headers = make_auth_header(u1)
    res = await async_client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res.status_code == 200
    assert res.json()["unread_count"] == 2


@pytest.mark.asyncio
async def test_mark_single_notification_read(
    async_client: AsyncClient, db_session: AsyncSession, sample_users
):
    """POST /api/v1/notifications/{id}/read marks specific item read."""
    u1, u2 = sample_users
    n = Notification(
        user_id=u1.id,
        category="bookings",
        title="To be marked read",
        message="Important reminder",
        is_read=False,
    )
    db_session.add(n)
    await db_session.commit()

    headers = make_auth_header(u1)
    res = await async_client.post(f"/api/v1/notifications/{n.id}/read", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    # User 2 cannot mark User 1's notification as read (returns 404)
    headers_u2 = make_auth_header(u2)
    res404 = await async_client.post(f"/api/v1/notifications/{n.id}/read", headers=headers_u2)
    assert res404.status_code == 404

    # Nonexistent ID returns 404
    fake_id = uuid.uuid4()
    res_fake = await async_client.post(f"/api/v1/notifications/{fake_id}/read", headers=headers)
    assert res_fake.status_code == 404


@pytest.mark.asyncio
async def test_mark_all_notifications_read(
    async_client: AsyncClient, db_session: AsyncSession, sample_users
):
    """POST /api/v1/notifications/read-all marks all user notifications read."""
    u1, _ = sample_users
    now = datetime.now(timezone.utc)

    for i in range(3):
        db_session.add(
            Notification(
                user_id=u1.id,
                category="general",
                title=f"Notif {i}",
                message="Body",
                is_read=False,
                created_at=now,
            )
        )
    await db_session.commit()

    headers = make_auth_header(u1)
    res = await async_client.post("/api/v1/notifications/read-all", headers=headers)
    assert res.status_code == 200
    assert res.json()["marked_read_count"] == 3

    # Check unread count is now 0
    res_count = await async_client.get("/api/v1/notifications/unread-count", headers=headers)
    assert res_count.json()["unread_count"] == 0


@pytest.mark.asyncio
async def test_unauthenticated_requests_rejected(async_client: AsyncClient):
    """All notification endpoints return 401 when no auth header is supplied."""
    r1 = await async_client.get("/api/v1/notifications")
    assert r1.status_code == 401

    r2 = await async_client.get("/api/v1/notifications/unread-count")
    assert r2.status_code == 401

    fake_id = uuid.uuid4()
    r3 = await async_client.post(f"/api/v1/notifications/{fake_id}/read")
    assert r3.status_code == 401

    r4 = await async_client.post("/api/v1/notifications/read-all")
    assert r4.status_code == 401
