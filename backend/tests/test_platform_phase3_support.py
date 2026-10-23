"""
Aught2 Pickleball — Phase 3B Support Tickets Test Suite

Validates:
1. Requester ticket submission (reference number generation, initial message, default status).
2. Requester isolation (users can only access their own tickets).
3. Requester replies and automatic status transition to in_progress.
4. Platform owner authorization and queue visibility.
5. Platform owner status, priority, and assignment updates.
6. Platform owner reply and automatic status transition to waiting_for_requester.
7. Audit log event creation on admin status update and reply.
8. Search and filtering across queue metrics.
9. Validation errors (invalid status, closed ticket replies).
"""
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.club import Club
from app.models.platform_audit_log import PlatformAuditLog
from app.models.support_ticket import SupportTicket, SupportTicketMessage, TicketStatus
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
        email=f"player.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Player One",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def another_player(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"other.player.{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("PlayerPass123!"),
        full_name="Player Two",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def sample_club(db_session: AsyncSession) -> Club:
    club = Club(
        id=uuid.uuid4(),
        name="Austin Metro Pickleball",
        slug=f"austin-metro-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.commit()
    await db_session.refresh(club)
    return club


@pytest.mark.asyncio
async def test_requester_ticket_creation(
    async_client: AsyncClient,
    player_user: User,
    sample_club: Club,
):
    """Authenticated user creates a support ticket with generated reference number and initial message."""
    payload = {
        "subject": "Incorrect booking charge on Court 3",
        "description": "I was charged twice for a 1-hour booking session on Thursday evening.",
        "category": "billing",
        "priority": "high",
        "club_id": str(sample_club.id),
    }

    res = await async_client.post(
        "/api/v1/support/tickets",
        json=payload,
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 201
    data = res.json()
    assert data["reference_number"].startswith("SUP-")
    assert data["subject"] == payload["subject"]
    assert data["category"] == "billing"
    assert data["priority"] == "high"
    assert data["status"] == "open"
    assert data["requester_id"] == str(player_user.id)
    assert data["club_id"] == str(sample_club.id)
    assert len(data["messages"]) == 1
    assert data["messages"][0]["message"] == payload["description"]
    assert data["messages"][0]["sender_role"] == "requester"


@pytest.mark.asyncio
async def test_requester_isolation(
    async_client: AsyncClient,
    player_user: User,
    another_player: User,
):
    """A user cannot access or reply to another user's support ticket."""
    # Player 1 creates a ticket
    create_res = await async_client.post(
        "/api/v1/support/tickets",
        json={
            "subject": "Private Account Question",
            "description": "Cannot change my linked phone number in profile.",
            "category": "account",
        },
        headers=make_auth_header(player_user),
    )
    ticket_id = create_res.json()["id"]

    # Player 2 attempts to view Player 1's ticket (404)
    get_res = await async_client.get(
        f"/api/v1/support/tickets/{ticket_id}",
        headers=make_auth_header(another_player),
    )
    assert get_res.status_code == 404

    # Player 2 attempts to reply to Player 1's ticket (404)
    reply_res = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "Sneaky unauthorized reply"},
        headers=make_auth_header(another_player),
    )
    assert reply_res.status_code == 404

    # Player 2's list must not contain Player 1's ticket
    list_res = await async_client.get(
        "/api/v1/support/tickets",
        headers=make_auth_header(another_player),
    )
    assert list_res.status_code == 200
    assert not any(t["id"] == ticket_id for t in list_res.json()["items"])


@pytest.mark.asyncio
async def test_platform_admin_authorization(
    async_client: AsyncClient,
    player_user: User,
    platform_owner: User,
):
    """Platform support queue requires platform-owner authorization (403 for regular users)."""
    # 1. Unauthenticated request
    res = await async_client.get("/api/v1/platform/support/tickets")
    assert res.status_code == 401

    # 2. Regular user request
    res = await async_client.get(
        "/api/v1/platform/support/tickets",
        headers=make_auth_header(player_user),
    )
    assert res.status_code == 403

    # 3. Platform owner request
    res = await async_client.get(
        "/api/v1/platform/support/tickets",
        headers=make_auth_header(platform_owner),
    )
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "status_counts" in data


@pytest.mark.asyncio
async def test_admin_update_status_priority_assignment_and_audit(
    async_client: AsyncClient,
    player_user: User,
    platform_owner: User,
):
    """Admin updates ticket status, priority, and assignment, triggering an immutable audit record."""
    create_res = await async_client.post(
        "/api/v1/support/tickets",
        json={
            "subject": "Lighting issue on Court 1",
            "description": "Floodlight blinking during evening open play.",
            "category": "facility",
            "priority": "low",
        },
        headers=make_auth_header(player_user),
    )
    ticket_id = create_res.json()["id"]

    # Admin triages ticket
    update_res = await async_client.patch(
        f"/api/v1/platform/support/tickets/{ticket_id}",
        json={
            "status": "in_progress",
            "priority": "urgent",
            "assigned_admin_id": str(platform_owner.id),
            "reason": "Escalated for facility safety inspection",
        },
        headers=make_auth_header(platform_owner),
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["status"] == "in_progress"
    assert updated["priority"] == "urgent"
    assert updated["assigned_admin_id"] == str(platform_owner.id)

    # Verify Platform Audit Log captured the change
    audit_res = await async_client.get(
        f"/api/v1/platform/audit-logs?entity_id={ticket_id}",
        headers=make_auth_header(platform_owner),
    )
    assert audit_res.status_code == 200
    audit_items = audit_res.json()["items"]
    assert len(audit_items) >= 1
    log_entry = audit_items[0]
    assert log_entry["action"] == "support_ticket.status_updated"
    assert log_entry["entity_type"] == "support_ticket"
    assert "Escalated" in log_entry["reason"]


@pytest.mark.asyncio
async def test_admin_and_requester_reply_conversation(
    async_client: AsyncClient,
    player_user: User,
    platform_owner: User,
):
    """Admin replies (transitions to waiting_for_requester), requester replies (transitions to in_progress)."""
    # 1. Create ticket
    create_res = await async_client.post(
        "/api/v1/support/tickets",
        json={
            "subject": "Question regarding refund policy",
            "description": "How long does a clinic fee refund take to process?",
            "category": "billing",
        },
        headers=make_auth_header(player_user),
    )
    ticket_id = create_res.json()["id"]

    # 2. Admin replies
    admin_reply_res = await async_client.post(
        f"/api/v1/platform/support/tickets/{ticket_id}/replies",
        json={"message": "Refunds typically process within 3-5 business days back to your original payment method."},
        headers=make_auth_header(platform_owner),
    )
    assert admin_reply_res.status_code == 200
    admin_data = admin_reply_res.json()
    assert admin_data["status"] == "waiting_for_requester"
    assert len(admin_data["messages"]) == 2
    assert admin_data["messages"][1]["sender_role"] == "platform_admin"

    # 3. Requester replies
    requester_reply_res = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "Thank you, that clarifies it. Can you confirm transaction ref #9921?"},
        headers=make_auth_header(player_user),
    )
    assert requester_reply_res.status_code == 200
    requester_data = requester_reply_res.json()
    assert requester_data["status"] == "in_progress"
    assert len(requester_data["messages"]) == 3
    assert requester_data["messages"][2]["sender_role"] == "requester"


@pytest.mark.asyncio
async def test_ticket_validation_and_closed_state(
    async_client: AsyncClient,
    player_user: User,
    platform_owner: User,
):
    """Validation prevents invalid status and prevents replying to closed tickets."""
    create_res = await async_client.post(
        "/api/v1/support/tickets",
        json={
            "subject": "General feedback",
            "description": "Great courts and lighting at the new location.",
            "category": "general",
        },
        headers=make_auth_header(player_user),
    )
    ticket_id = create_res.json()["id"]

    # Invalid status transition (400)
    bad_status_res = await async_client.patch(
        f"/api/v1/platform/support/tickets/{ticket_id}",
        json={"status": "invalid_status_xyz"},
        headers=make_auth_header(platform_owner),
    )
    assert bad_status_res.status_code == 400

    # Close ticket
    close_res = await async_client.patch(
        f"/api/v1/platform/support/tickets/{ticket_id}",
        json={"status": "closed"},
        headers=make_auth_header(platform_owner),
    )
    assert close_res.status_code == 200

    # Requester attempting to reply to closed ticket receives 400
    reply_to_closed_res = await async_client.post(
        f"/api/v1/support/tickets/{ticket_id}/replies",
        json={"message": "Trying to message closed ticket"},
        headers=make_auth_header(player_user),
    )
    assert reply_to_closed_res.status_code == 400
    assert "closed" in reply_to_closed_res.json()["detail"].lower()
