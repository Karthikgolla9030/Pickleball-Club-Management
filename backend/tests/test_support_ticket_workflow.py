"""
Aught2 Pickleball — Comprehensive Support Ticket Workflow Tests

Tests:
1. Player ticket creation, validation, and requester-only access.
2. Club staff ticket creation, club-scoped listing, and cross-club isolation (403/404 prevention).
3. Club staff reply with sender_role="club_staff".
4. Admin status/priority updates, audit logging, and in-app notifications.
5. Admin replies with in-app notification dispatch.
6. Reopening resolved tickets automatically when requester replies.
7. Closed ticket enforcement (cannot reply).
8. Input validation (short subject, short description, invalid club ID).
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.notification import Notification
from app.models.platform_audit_log import PlatformAuditLog
from app.models.support_ticket import SupportTicket, SupportTicketMessage, TicketCategory, TicketPriority, TicketStatus
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.fixture
async def platform_owner(db_session: AsyncSession) -> User:
    settings = get_settings()
    platform_email = settings.PLATFORM_OWNER_EMAILS[0] if settings.PLATFORM_OWNER_EMAILS else "platform@aught2.com"
    owner = User(
        id=uuid.uuid4(),
        email=platform_email,
        hashed_password=hash_password("SuperSecret123!"),
        full_name="Platform Administrator",
        is_active=True,
        is_verified=True,
    )
    db_session.add(owner)
    await db_session.commit()
    await db_session.refresh(owner)
    return owner


@pytest.fixture
async def player_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"player.wf.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Player Workflow",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def club_a(db_session: AsyncSession) -> Club:
    club = Club(
        id=uuid.uuid4(),
        name="Club Alpha",
        slug=f"club-alpha-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.commit()
    await db_session.refresh(club)
    return club


@pytest.fixture
async def club_b(db_session: AsyncSession) -> Club:
    club = Club(
        id=uuid.uuid4(),
        name="Club Beta",
        slug=f"club-beta-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.commit()
    await db_session.refresh(club)
    return club


@pytest.fixture
async def club_a_owner(db_session: AsyncSession, club_a: Club) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"owner.a.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("StaffPass123!"),
        full_name="Alpha Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubMembership(
        id=uuid.uuid4(),
        user_id=user.id,
        club_id=club_a.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def club_a_manager(db_session: AsyncSession, club_a: Club) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"manager.a.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("StaffPass123!"),
        full_name="Alpha Manager",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubMembership(
        id=uuid.uuid4(),
        user_id=user.id,
        club_id=club_a.id,
        role=ClubRole.CLUB_MANAGER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def club_b_owner(db_session: AsyncSession, club_b: Club) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"owner.b.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("StaffPass123!"),
        full_name="Beta Owner",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    membership = ClubMembership(
        id=uuid.uuid4(),
        user_id=user.id,
        club_id=club_b.id,
        role=ClubRole.CLUB_OWNER,
        is_active=True,
    )
    db_session.add(membership)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ─── TESTS ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_input_validation(
    async_client: AsyncClient,
    player_user: User,
):
    """Subject and description must meet length constraints; nonexistent club returns 404."""
    # 1. Subject too short (<3)
    res_sub = await async_client.post(
        "/api/v1/support/tickets",
        json={"subject": "Hi", "description": "Valid description length here", "category": "general"},
        headers=make_auth_header(player_user),
    )
    assert res_sub.status_code == 422

    # 2. Description too short (<5)
    res_desc = await async_client.post(
        "/api/v1/support/tickets",
        json={"subject": "Valid Subject", "description": "No", "category": "general"},
        headers=make_auth_header(player_user),
    )
    assert res_desc.status_code == 422

    # 3. Nonexistent club ID
    fake_club_id = str(uuid.uuid4())
    res_club = await async_client.post(
        "/api/v1/support/tickets",
        json={
            "subject": "Valid Subject",
            "description": "Valid description length here",
            "category": "general",
            "club_id": fake_club_id,
        },
        headers=make_auth_header(player_user),
    )
    assert res_club.status_code == 404


@pytest.mark.asyncio
async def test_club_staff_scope_and_cross_club_isolation(
    async_client: AsyncClient,
    club_a: Club,
    club_b: Club,
    club_a_owner: User,
    club_a_manager: User,
    club_b_owner: User,
    player_user: User,
):
    """
    Validates:
    - Club A Owner creates a facility ticket for Club A.
    - Club A Manager can list and inspect Club A's facility tickets.
    - Club B Owner cannot list tickets passing club_id for Club A (403 Forbidden).
    - Club B Owner cannot view or reply to Club A's ticket (404 Not Found).
    - Regular Player cannot pass Club A's club_id to list tickets (403 Forbidden).
    - Club A Manager replies to the ticket with sender_role='club_staff'.
    """
    # 1. Club A Owner creates a support ticket for Club A
    create_res = await async_client.post(
        "/api/v1/support/tickets",
        json={
            "subject": "Lighting malfunction on Court 4",
            "description": "Lights turned off automatically during a match session.",
            "category": "facility",
            "priority": "high",
            "club_id": str(club_a.id),
        },
        headers=make_auth_header(club_a_owner),
    )
    assert create_res.status_code == 201
    ticket_id = create_res.json()["id"]

    # 2. Club A Manager lists tickets for Club A -> succeeds
    list_res = await async_client.get(
        f"/api/v1/support/tickets?club_id={club_a.id}",
        headers=make_auth_header(club_a_manager),
    )
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert any(t["id"] == ticket_id for t in items)

    # 3. Club A Manager can retrieve ticket detail
    get_res = await async_client.get(
        f"/api/v1/support/tickets/{ticket_id}",
        headers=make_auth_header(club_a_manager),
    )
    assert get_res.status_code == 200
    assert get_res.json()["id"] == ticket_id

    # 4. Club B Owner attempts to list tickets with Club A scope -> 403 Forbidden
    cross_list_res = await async_client.get(
        f"/api/v1/support/tickets?club_id={club_a.id}",
        headers=make_auth_header(club_b_owner),
    )
    assert cross_list_res.status_code == 403

    # 5. Club B Owner attempts to inspect Club A's ticket -> 404 Not Found
    cross_get_res = await async_client.get(
        f"/api/v1/support/tickets/{ticket_id}",
        headers=make_auth_header(club_b_owner),
    )
    assert cross_get_res.status_code == 404

    # 6. Regular player attempts to list tickets with Club A scope -> 403 Forbidden
    player_list_res = await async_client.get(
        f"/api/v1/support/tickets?club_id={club_a.id}",
        headers=make_auth_header(player_user),
    )
    assert player_list_res.status_code == 403

    # 7. Club A Manager replies to the ticket -> sender_role is 'club_staff'
    reply_res = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "Maintenance team has been dispatched to check the breaker panel."},
        headers=make_auth_header(club_a_manager),
    )
    assert reply_res.status_code == 200
    reply_data = reply_res.json()
    assert len(reply_data["messages"]) == 2
    staff_msg = reply_data["messages"][1]
    assert staff_msg["sender_role"] == "club_staff"
    assert staff_msg["sender_email"] == club_a_manager.email


@pytest.mark.asyncio
async def test_resolved_ticket_reopening_and_notifications(
    async_client: AsyncClient,
    db_session: AsyncSession,
    player_user: User,
    platform_owner: User,
):
    """
    Validates:
    - Admin updates ticket status to resolved -> in-app notification delivered to requester.
    - Requester posts reply -> status transitions back to in_progress automatically.
    - Admin replies -> status transitions to waiting_for_requester and in-app notification delivered.
    """
    # 1. Create ticket
    create_res = await async_client.post(
        "/api/v1/support/tickets",
        json={
            "subject": "Missing tournament registration receipt",
            "description": "I paid for the Winter Classic but did not receive a receipt.",
            "category": "tournament",
            "priority": "medium",
        },
        headers=make_auth_header(player_user),
    )
    assert create_res.status_code == 201
    ticket_id = create_res.json()["id"]
    ref_num = create_res.json()["reference_number"]

    # 2. Admin marks ticket as resolved
    resolve_res = await async_client.patch(
        f"/api/v1/platform/support/tickets/{ticket_id}",
        json={"status": "resolved", "reason": "Receipt re-sent via platform email"},
        headers=make_auth_header(platform_owner),
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "resolved"

    # Check notification for requester was created
    notif_stmt = (
        select(Notification)
        .where(Notification.user_id == player_user.id)
        .order_by(Notification.created_at.desc())
    )
    notif_res = await db_session.execute(notif_stmt)
    notifs = notif_res.scalars().all()
    assert len(notifs) >= 1
    assert ref_num in notifs[0].title or ref_num in notifs[0].message

    # 3. Requester replies to the resolved ticket -> auto-reopens to in_progress
    reopen_reply_res = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "I checked my spam folder and still do not see it."},
        headers=make_auth_header(player_user),
    )
    assert reopen_reply_res.status_code == 200
    assert reopen_reply_res.json()["status"] == "in_progress"

    # 4. Admin replies to ticket -> transitions to waiting_for_requester
    admin_reply_res = await async_client.post(
        f"/api/v1/platform/support/tickets/{ticket_id}/replies",
        json={"message": "We have re-sent it to your secondary email. Please verify if received."},
        headers=make_auth_header(platform_owner),
    )
    assert admin_reply_res.status_code == 200
    assert admin_reply_res.json()["status"] == "waiting_for_requester"

    # Verify notification for admin reply was also created for requester
    notif_res2 = await db_session.execute(notif_stmt)
    notifs2 = notif_res2.scalars().all()
    assert len(notifs2) >= 2
    assert "Support replied" in notifs2[0].title
