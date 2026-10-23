"""
Aught2 Pickleball — Authenticated Requester Support API Endpoints

Endpoints for authenticated players and club staff to submit and manage their support tickets:
- POST /api/v1/support/tickets
- GET  /api/v1/support/tickets
- GET  /api/v1/support/tickets/{ticket_id}
- POST /api/v1/support/tickets/{ticket_id}/replies
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.support_ticket import (
    SupportTicketCreateRequest,
    SupportTicketDetailResponse,
    SupportTicketMessageCreateRequest,
    SupportTicketsListResponse,
)
from app.services.support_ticket_service import SupportTicketService

router = APIRouter(prefix="/support/tickets", tags=["Support Tickets (Requester)"])


@router.post(
    "",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new support ticket",
    description="Allows authenticated players and club staff to submit a support ticket.",
)
async def create_support_ticket(
    payload: SupportTicketCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketDetailResponse:
    """Create a support ticket on behalf of the authenticated user."""
    return await SupportTicketService(db).create_ticket(
        requester=current_user,
        payload=payload,
    )


@router.get(
    "",
    response_model=SupportTicketsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List requester's own support tickets",
    description="Returns tickets submitted by the authenticated user with optional status filter.",
)
async def list_my_support_tickets(
    status: str | None = Query(default=None, description="Filter by status (open, in_progress, waiting_for_requester, resolved, closed)"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=20, ge=1, le=50, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketsListResponse:
    """List tickets belonging to current authenticated user."""
    return await SupportTicketService(db).list_requester_tickets(
        requester_id=current_user.id,
        status_filter=status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{ticket_id}",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get single support ticket detail",
    description="Retrieve full ticket thread if owned by the current authenticated user.",
)
async def get_my_support_ticket(
    ticket_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketDetailResponse:
    """Get ticket detail for requester."""
    return await SupportTicketService(db).get_requester_ticket(
        ticket_id=ticket_id,
        requester_id=current_user.id,
    )


@router.post(
    "/{ticket_id}/replies",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Post reply to own support ticket",
    description="Allows requester to reply to their support ticket thread.",
)
async def reply_to_my_support_ticket(
    ticket_id: UUID,
    payload: SupportTicketMessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketDetailResponse:
    """Requester reply to support ticket."""
    return await SupportTicketService(db).requester_reply(
        ticket_id=ticket_id,
        requester=current_user,
        payload=payload,
    )
