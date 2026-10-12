"""
Aught2 Pickleball — Notifications API Endpoints
Endpoints for listing, filtering, marking as read, dismissing, and managing preferences.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.notification import (
    NotificationListResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdateRequest,
    NotificationResponse,
    NotificationUnreadCountResponse,
)
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    category: str | None = Query(default=None, description="Optional category filter"),
    club_id: UUID | None = Query(default=None, description="Optional club scope"),
    date: str | None = Query(default=None, description="Filter for specific date (YYYY-MM-DD)"),
    unread_only: bool = Query(default=False, description="Filter for unread only"),
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Retrieve notifications for the authenticated user."""
    service = NotificationService(db)
    items, total, unread = await service.list_user_notifications(
        user_id=current_user.id,
        category=category,
        club_id=club_id,
        date_str=date,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )
    return NotificationListResponse(
        items=[NotificationResponse.model_validate(i) for i in items],
        total=total,
        unread_count=unread,
    )


@router.get("/unread-count", response_model=NotificationUnreadCountResponse)
async def get_unread_notification_count(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Get the unread notification badge count."""
    service = NotificationService(db)
    _, _, unread = await service.list_user_notifications(
        user_id=current_user.id, limit=1
    )
    return NotificationUnreadCountResponse(unread_count=unread)


@router.get("/preferences", response_model=NotificationPreferenceResponse)
async def get_notification_preferences(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Get notification preferences for the authenticated user."""
    service = NotificationService(db)
    pref = await service.get_preferences(user_id=current_user.id)
    await db.commit()
    return NotificationPreferenceResponse.model_validate(pref)


@router.put("/preferences", response_model=NotificationPreferenceResponse)
async def update_notification_preferences(
    payload: NotificationPreferenceUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Update notification preferences for the authenticated user."""
    service = NotificationService(db)
    pref = await service.update_preferences(
        user_id=current_user.id,
        updates=payload.model_dump(exclude_unset=True),
    )
    await db.commit()
    return NotificationPreferenceResponse.model_validate(pref)


@router.post("/{notification_id}/read", response_model=dict)
@router.patch("/{notification_id}/read", response_model=dict)
async def mark_notification_as_read(
    notification_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Mark a specific notification as read."""
    service = NotificationService(db)
    success = await service.mark_as_read(
        notification_id=notification_id, user_id=current_user.id
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    await db.commit()
    return {"status": "ok", "id": str(notification_id)}


@router.post("/read-all", response_model=dict)
async def mark_all_notifications_as_read(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Mark all unread notifications as read."""
    service = NotificationService(db)
    count = await service.mark_all_as_read(user_id=current_user.id)
    await db.commit()
    return {"status": "ok", "marked_read_count": count}


@router.delete("/{notification_id}", response_model=dict)
async def delete_notification(
    notification_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Dismiss / delete a specific notification belonging to the authenticated user."""
    service = NotificationService(db)
    success = await service.delete_notification(
        notification_id=notification_id, user_id=current_user.id
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    await db.commit()
    return {"status": "ok", "id": str(notification_id)}
