"""
Aught2 Pickleball — WebSocket and Real-Time Event System Integration Tests
Validates:
- WebSocket connection, authentication, and ping/pong
- Targeted channel routing (user-scoped and club-scoped)
- Persistent notification creation, unread counts, and marking read
- Real-time event dispatching on bookings and player actions
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
import pytest
from starlette.testclient import TestClient

from app.core.database import AsyncSessionLocal
from app.core.events import EventType, dispatch_event
from app.core.security import create_access_token, hash_password
from app.core.websocket_manager import WebSocketManager
from app.main import app
from app.models.user import User
from app.services.notification_service import NotificationService


@pytest.mark.asyncio
async def test_websocket_manager_lifecycle():
    """Test WebSocketManager singleton connection and subscription tracking."""
    manager = WebSocketManager()
    user_id = str(uuid.uuid4())
    club_id = str(uuid.uuid4())

    class MockWebSocket:
        def __init__(self):
            self.sent_messages = []
            self.closed = False

        async def accept(self):
            pass

        async def send_text(self, text: str):
            self.sent_messages.append(json.loads(text))

        async def close(self, code=1000):
            self.closed = True

    mock_ws = MockWebSocket()

    # 1. Connect
    await manager.connect(mock_ws, user_id=user_id, club_ids=[club_id])
    assert user_id in manager._user_connections
    assert club_id in manager._club_connections
    assert mock_ws in manager._club_connections[club_id]

    # 2. Broadcast to user
    test_payload = {"type": "test.event", "data": {"message": "hello user"}}
    sent = await manager.broadcast_to_user(user_id, test_payload)
    assert sent == 1
    assert len(mock_ws.sent_messages) == 1
    assert mock_ws.sent_messages[0]["type"] == "test.event"

    # 3. Broadcast to club
    club_payload = {"type": "court.availability.changed", "data": {"court_id": "c1"}}
    sent = await manager.broadcast_to_club(club_id, club_payload)
    assert sent == 1
    assert len(mock_ws.sent_messages) == 2
    assert mock_ws.sent_messages[1]["type"] == "court.availability.changed"

    # 4. Disconnect
    await manager.disconnect(mock_ws)
    assert user_id not in manager._user_connections
    assert mock_ws not in manager._club_connections.get(club_id, set())


@pytest.mark.asyncio
async def test_notification_service_flow(db_session):
    """Test persistent notification creation, unread count, and mark as read."""
    # Create test user
    user = User(
        email="test_notify@aught2.com",
        hashed_password=hash_password("FakePass123!"),
        full_name="Notify Tester",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    service = NotificationService(db_session)

    # 1. Create notifications
    n1 = await service.create_notification(
        user_id=user.id,
        title="Court Booking Confirmed",
        message="Your reservation on Court 1 is confirmed.",
        category="booking",
        data={"booking_id": "b-123"},
    )
    n2 = await service.create_notification(
        user_id=user.id,
        title="Tournament Registration Confirmed",
        message="You are registered for Summer Slam.",
        category="tournament",
        data={"tournament_id": "t-456"},
    )
    await db_session.commit()

    assert n1.id is not None
    assert n2.id is not None
    assert n1.is_read is False

    # 2. List notifications
    items, total, unread = await service.list_user_notifications(user_id=user.id)
    assert total == 2
    assert unread == 2
    assert len(items) == 2

    # 3. Filter by category
    booking_items, b_total, b_unread = await service.list_user_notifications(
        user_id=user.id, category="booking"
    )
    assert b_total == 1
    assert booking_items[0].category == "booking"

    # 4. Mark single notification as read
    updated = await service.mark_as_read(notification_id=n1.id, user_id=user.id)
    assert updated is True
    await db_session.commit()

    count_after_single = await service.get_unread_count(user_id=user.id)
    assert count_after_single == 1

    # 5. Mark all as read
    updated_count = await service.mark_all_as_read(user_id=user.id)
    assert updated_count == 1
    await db_session.commit()

    count_after_all = await service.get_unread_count(user_id=user.id)
    assert count_after_all == 0


def test_websocket_auth_handshake():
    """Test WebSocket endpoint /api/v1/ws connection with valid and invalid JWT tokens."""
    client = TestClient(app)

    # 1. Connection without token must fail with policy violation (1008)
    with pytest.raises(Exception):
        with client.websocket_connect("/api/v1/ws") as websocket:
            pass

    # 2. Connection with invalid token must fail with policy violation (1008)
    with pytest.raises(Exception):
        with client.websocket_connect("/api/v1/ws?token=invalid.jwt.token") as websocket:
            pass

    # 3. Connection with valid token must succeed and respond to ping
    test_user_id = uuid.uuid4()
    valid_token = create_access_token(str(test_user_id))

    from unittest.mock import AsyncMock, patch, MagicMock

    mock_user = MagicMock()
    mock_user.id = test_user_id
    mock_user.is_active = True

    mock_db_result = MagicMock()
    mock_db_result.scalar_one_or_none.return_value = mock_user

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_db_result

    class MockSessionContext:
        async def __aenter__(self):
            return mock_session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("app.api.v1.websocket.AsyncSessionLocal", side_effect=MockSessionContext):
        with patch("app.api.v1.websocket._get_user_authorized_clubs", new=AsyncMock(return_value=["club-1", "club-2"])):
            with client.websocket_connect(f"/api/v1/ws?token={valid_token}") as websocket:
                # First message received is connection.established
                welcome = websocket.receive_json()
                assert welcome.get("type") == "connection.established"
                assert welcome.get("user_id") == str(test_user_id)
                assert welcome.get("clubs") == ["club-1", "club-2"]

                # Send heartbeat ping
                websocket.send_json({"action": "ping", "timestamp": 12345})
                pong = websocket.receive_json()
                assert pong.get("type") == "pong"
                assert pong.get("timestamp") == 12345


@pytest.mark.asyncio
async def test_event_dispatching():
    """Verify that dispatch_event formats event envelope and delivers to ws_manager."""
    from app.core.websocket_manager import ws_manager
    test_user_id = uuid.uuid4()
    test_club_id = uuid.uuid4()

    received_events = []

    class MockWS:
        async def accept(self):
            pass
        async def send_text(self, text: str):
            received_events.append(json.loads(text))
        async def close(self, code=1000):
            pass

    ws = MockWS()
    await ws_manager.connect(ws, user_id=str(test_user_id), club_ids=[str(test_club_id)])

    try:
        # Dispatch event to club and user
        await dispatch_event(
            event_type=EventType.BOOKING_CREATED,
            data={"booking_id": "b-999", "court_name": "Court A"},
            user_id=test_user_id,
            club_id=test_club_id,
        )

        assert len(received_events) >= 1
        event = received_events[-1]
        assert event["type"] == EventType.BOOKING_CREATED.value
        assert event["club_id"] == str(test_club_id)
        assert event["user_id"] == str(test_user_id)
        assert event["data"]["booking_id"] == "b-999"
        assert "timestamp" in event
    finally:
        await ws_manager.disconnect(ws)



