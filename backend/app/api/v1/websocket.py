"""
Aught2 Pickleball — WebSocket Real-Time Endpoint
Provides authenticated WebSocket connectivity for Player and Club management interfaces.
"""
from __future__ import annotations

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import decode_access_token
from app.core.websocket_manager import ws_manager
from app.models.club_membership import ClubMembership
from app.models.club_player_membership import ClubPlayerMembership
from app.models.user import User

logger = logging.getLogger(__name__)

ws_router = APIRouter(tags=["Real-Time WebSockets"])


async def _get_user_authorized_clubs(user_id: UUID) -> list[str]:
    """Retrieve all club IDs where the user has staff or player membership."""
    club_ids: set[str] = set()
    async with AsyncSessionLocal() as session:
        # 1. Staff memberships
        staff_res = await session.execute(
            select(ClubMembership.club_id).where(
                ClubMembership.user_id == user_id,
                ClubMembership.is_active == True,
            )
        )
        for row in staff_res.scalars().all():
            club_ids.add(str(row))

        # 2. Player memberships
        player_res = await session.execute(
            select(ClubPlayerMembership.club_id).where(
                ClubPlayerMembership.user_id == user_id,
                ClubPlayerMembership.status == "active",
            )
        )
        for row in player_res.scalars().all():
            club_ids.add(str(row))

    return list(club_ids)


@ws_router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
):
    """
    Main authenticated WebSocket endpoint.
    Clients connect with ?token=<access_token> or authenticate in first message.
    """
    if not token:
        # Check if auth token passed in headers / cookies or query
        auth_header = websocket.headers.get("Authorization") or websocket.headers.get("sec-websocket-protocol")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        logger.warning("WebSocket connection rejected: No token provided")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Authenticate token
    try:
        user_id_str = decode_access_token(token)
        user_id = UUID(user_id_str)
    except Exception as exc:
        logger.warning("WebSocket connection rejected: Invalid token: %s", exc)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Verify user exists in database
    async with AsyncSessionLocal() as session:
        res = await session.execute(select(User).where(User.id == user_id, User.is_active == True))
        user = res.scalar_one_or_none()
        if not user:
            logger.warning("WebSocket rejected: User %s not found or inactive", user_id)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    # Resolve authorized clubs
    club_ids = await _get_user_authorized_clubs(user_id)

    # Register and accept connection
    await ws_manager.connect(websocket, user_id=str(user_id), club_ids=club_ids)

    # Send welcome handshake
    await websocket.send_text(
        json.dumps(
            {
                "type": "connection.established",
                "user_id": str(user_id),
                "clubs": club_ids,
                "message": "Connected to Aught2 Pickleball real-time event stream",
            }
        )
    )

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                msg = json.loads(raw_data)
            except Exception:
                continue

            action = msg.get("action") or msg.get("type")

            if action == "ping":
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "pong",
                            "timestamp": msg.get("timestamp"),
                        }
                    )
                )

            elif action == "subscribe_club":
                req_club_id = msg.get("club_id")
                if req_club_id:
                    # Verify user belongs to requested club
                    cid_str = str(req_club_id)
                    current_clubs = await _get_user_authorized_clubs(user_id)
                    if cid_str in current_clubs:
                        await ws_manager.subscribe_club(websocket, cid_str)
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "club.subscribed",
                                    "club_id": cid_str,
                                    "status": "ok",
                                }
                            )
                        )
                    else:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "error",
                                    "message": f"Unauthorized club subscription: {cid_str}",
                                }
                            )
                        )

    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.error("Error in websocket loop for user %s: %s", user_id, exc)
        await ws_manager.disconnect(websocket)
