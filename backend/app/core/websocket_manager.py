"""
Aught2 Pickleball — WebSocket Connection & Channel Manager
Handles authenticated real-time connections, group channels, and event broadcasting
between Player Side and Club Side.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Manages active WebSocket connections organized by user and club channels.
    Supports targeted user delivery, club-wide broadcasting, and global broadcasts.
    """

    def __init__(self) -> None:
        # user_id (str) -> set[WebSocket]
        self._user_connections: dict[str, set[WebSocket]] = {}
        # club_id (str) -> set[WebSocket]
        self._club_connections: dict[str, set[WebSocket]] = {}
        # websocket -> set of club_ids subscribed to
        self._socket_clubs: dict[WebSocket, set[str]] = {}
        # websocket -> user_id
        self._socket_user: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        user_id: str,
        club_ids: list[str] | None = None,
    ) -> None:
        """Register an authenticated WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            # Register user connection
            if user_id not in self._user_connections:
                self._user_connections[user_id] = set()
            self._user_connections[user_id].add(websocket)
            self._socket_user[websocket] = user_id
            self._socket_clubs[websocket] = set()

            # Subscribe to initial club channels
            if club_ids:
                for cid in club_ids:
                    cid_str = str(cid)
                    if cid_str not in self._club_connections:
                        self._club_connections[cid_str] = set()
                    self._club_connections[cid_str].add(websocket)
                    self._socket_clubs[websocket].add(cid_str)

        logger.info(
            "WebSocket connected: user=%s, subscribed_clubs=%s (total user sockets: %d)",
            user_id,
            club_ids or [],
            len(self._user_connections.get(user_id, set())),
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        """Clean up disconnected WebSocket from all channels."""
        async with self._lock:
            user_id = self._socket_user.pop(websocket, None)
            if user_id and user_id in self._user_connections:
                self._user_connections[user_id].discard(websocket)
                if not self._user_connections[user_id]:
                    del self._user_connections[user_id]

            subscribed_clubs = self._socket_clubs.pop(websocket, set())
            for cid in subscribed_clubs:
                if cid in self._club_connections:
                    self._club_connections[cid].discard(websocket)
                    if not self._club_connections[cid]:
                        del self._club_connections[cid]

        logger.info("WebSocket disconnected: user=%s", user_id)

    async def subscribe_club(self, websocket: WebSocket, club_id: str) -> None:
        """Dynamically subscribe an existing connection to a club channel."""
        cid_str = str(club_id)
        async with self._lock:
            if cid_str not in self._club_connections:
                self._club_connections[cid_str] = set()
            self._club_connections[cid_str].add(websocket)

            if websocket in self._socket_clubs:
                self._socket_clubs[websocket].add(cid_str)

        logger.debug("Socket subscribed to club channel: %s", cid_str)

    async def broadcast_to_user(
        self,
        user_id: str | UUID,
        event: dict[str, Any],
    ) -> int:
        """Send an event to all active sockets belonging to a specific user."""
        uid_str = str(user_id)
        sockets = set()
        async with self._lock:
            if uid_str in self._user_connections:
                sockets = set(self._user_connections[uid_str])

        if not sockets:
            return 0

        message_str = json.dumps(event)
        dead_sockets = []
        sent_count = 0

        for ws in sockets:
            try:
                await ws.send_text(message_str)
                sent_count += 1
            except Exception as exc:
                logger.warning("Failed sending to socket for user %s: %s", uid_str, exc)
                dead_sockets.append(ws)

        for ws in dead_sockets:
            await self.disconnect(ws)

        return sent_count

    async def broadcast_to_club(
        self,
        club_id: str | UUID,
        event: dict[str, Any],
        exclude_user_id: str | UUID | None = None,
    ) -> int:
        """Send an event to all users subscribed to a club channel."""
        cid_str = str(club_id)
        exclude_str = str(exclude_user_id) if exclude_user_id else None

        sockets = set()
        async with self._lock:
            if cid_str in self._club_connections:
                sockets = set(self._club_connections[cid_str])

        if not sockets:
            return 0

        message_str = json.dumps(event)
        dead_sockets = []
        sent_count = 0

        for ws in sockets:
            if exclude_str and self._socket_user.get(ws) == exclude_str:
                continue
            try:
                await ws.send_text(message_str)
                sent_count += 1
            except Exception as exc:
                logger.warning("Failed sending to club socket for club %s: %s", cid_str, exc)
                dead_sockets.append(ws)

        for ws in dead_sockets:
            await self.disconnect(ws)

        return sent_count

    async def broadcast_all(self, event: dict[str, Any]) -> int:
        """Broadcast an event to all connected clients across the application."""
        all_sockets = set()
        async with self._lock:
            for s_set in self._user_connections.values():
                all_sockets.update(s_set)

        if not all_sockets:
            return 0

        message_str = json.dumps(event)
        dead_sockets = []
        sent_count = 0

        for ws in all_sockets:
            try:
                await ws.send_text(message_str)
                sent_count += 1
            except Exception as exc:
                dead_sockets.append(ws)

        for ws in dead_sockets:
            await self.disconnect(ws)

        return sent_count

    def get_connected_user_count(self) -> int:
        return len(self._user_connections)

    def is_user_connected(self, user_id: str | UUID) -> bool:
        return str(user_id) in self._user_connections


# Global singleton instance
ws_manager = WebSocketManager()
