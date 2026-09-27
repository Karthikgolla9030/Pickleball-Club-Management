"""
Aught2 Pickleball — Payments API Endpoints (Phase 13)

Staff Endpoints:
  - GET   /clubs/{club_id}/payments
  - GET   /clubs/{club_id}/payments/summary
  - GET   /clubs/{club_id}/payments/{payment_id}
  - POST  /clubs/{club_id}/payments
  - POST  /clubs/{club_id}/payments/{payment_id}/process
  - POST  /clubs/{club_id}/payments/{payment_id}/succeed
  - POST  /clubs/{club_id}/payments/{payment_id}/fail
  - POST  /clubs/{club_id}/payments/{payment_id}/cancel

Player Endpoints:
  - GET   /payments
  - GET   /payments/{payment_id}

Authorization:
  - Staff: requires Permission.MANAGE_PAYMENTS (Club Owner, Club Manager)
  - Player: authenticated user can only view their own payments
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_club_membership,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.payment import PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.user import User
from app.permissions import Permission
from app.schemas.payment import (
    CreatePaymentRequest,
    PaymentCancelRequest,
    PaymentFailRequest,
    PaymentResponse,
    PaymentSummaryResponse,
    PlayerPaymentResponse,
)
from app.services.payment_service import PaymentService

# ─── Staff Payments Router ───────────────────────────────────────────────────

club_payments_router = APIRouter(
    prefix="/clubs/{club_id}/payments",
    tags=["Club Payments"],
)

# ─── Player Payments Router ──────────────────────────────────────────────────

player_payments_router = APIRouter(
    prefix="/payments",
    tags=["Player Payments"],
)


# ═══════════════════════════════════════════════════════════════════════════════
# STAFF PAYMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@club_payments_router.get(
    "",
    response_model=list[PaymentResponse],
    summary="List club payments",
    description="List all payments for a club with optional filtering by status, purpose, player, subscription, payment method, and date range.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_payments required)"},
    },
)
async def list_club_payments(
    club_id: UUID,
    payment_status: PaymentStatus | None = Query(default=None, alias="status"),
    purpose: PaymentPurpose | None = Query(default=None),
    player_id: UUID | None = Query(default=None),
    subscription_id: UUID | None = Query(default=None),
    payment_method: PaymentMethod | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> list[PaymentResponse]:
    """Retrieve payments list for staff management."""
    return await PaymentService(db).list_club_payments(
        club_id=club_id,
        status=payment_status,
        purpose=purpose,
        player_id=player_id,
        subscription_id=subscription_id,
        payment_method=payment_method,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@club_payments_router.get(
    "/summary",
    response_model=PaymentSummaryResponse,
    summary="Get club payment summary metrics",
    description="Returns aggregate metrics: total payments count, counts by status, and total collected amount.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Club not found"},
    },
)
async def get_club_payment_summary(
    club_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentSummaryResponse:
    """Retrieve aggregated summary metrics for club payments."""
    return await PaymentService(db).get_payment_summary(club_id=club_id)


@club_payments_router.get(
    "/{payment_id}",
    response_model=PaymentResponse,
    summary="Get club payment detail",
    description="Returns full payment details for staff view, scoped to the specified club.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Payment not found in this club"},
    },
)
async def get_club_payment(
    club_id: UUID,
    payment_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentResponse:
    """Retrieve a single payment detail."""
    return await PaymentService(db).get_club_payment(
        club_id=club_id,
        payment_id=payment_id,
    )


@club_payments_router.post(
    "",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a membership payment record",
    description="Staff creates a manual payment record for a player membership subscription.",
    responses={
        400: {"description": "Validation error or cross-player inconsistency"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Club or subscription not found"},
    },
)
async def create_club_payment(
    club_id: UUID,
    payload: CreatePaymentRequest,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentResponse:
    """Create a new payment record in PENDING status."""
    return await PaymentService(db).create_membership_payment(
        club_id=club_id,
        payload=payload,
        created_by_user_id=current_user.id,
    )


@club_payments_router.post(
    "/{payment_id}/process",
    response_model=PaymentResponse,
    summary="Mark payment as processing",
    description="Transitions a pending payment to processing.",
    responses={
        400: {"description": "Invalid status transition"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Payment not found"},
    },
)
async def process_payment(
    club_id: UUID,
    payment_id: UUID,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentResponse:
    """Transition payment to processing."""
    return await PaymentService(db).mark_as_processing(
        club_id=club_id,
        payment_id=payment_id,
        actor_id=current_user.id,
    )


@club_payments_router.post(
    "/{payment_id}/succeed",
    response_model=PaymentResponse,
    summary="Mark payment as succeeded",
    description="Transitions payment to succeeded status, recording paid_at timestamp and auditing actor.",
    responses={
        400: {"description": "Invalid status transition"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Payment not found"},
    },
)
async def succeed_payment(
    club_id: UUID,
    payment_id: UUID,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentResponse:
    """Complete a manual payment."""
    return await PaymentService(db).mark_as_succeeded(
        club_id=club_id,
        payment_id=payment_id,
        actor_id=current_user.id,
    )


@club_payments_router.post(
    "/{payment_id}/fail",
    response_model=PaymentResponse,
    summary="Mark payment as failed",
    description="Transitions pending/processing payment to failed status, recording failed_at and reason.",
    responses={
        400: {"description": "Invalid status transition"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Payment not found"},
    },
)
async def fail_payment(
    club_id: UUID,
    payment_id: UUID,
    payload: PaymentFailRequest,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentResponse:
    """Mark payment as failed with reason."""
    return await PaymentService(db).mark_as_failed(
        club_id=club_id,
        payment_id=payment_id,
        actor_id=current_user.id,
        failure_reason=payload.failure_reason,
    )


@club_payments_router.post(
    "/{payment_id}/cancel",
    response_model=PaymentResponse,
    summary="Cancel payment",
    description="Cancels a pending or processing payment without deleting historical record.",
    responses={
        400: {"description": "Invalid status transition"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Payment not found"},
    },
)
async def cancel_payment(
    club_id: UUID,
    payment_id: UUID,
    payload: PaymentCancelRequest | None = None,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentResponse:
    """Cancel a pending payment."""
    reason = payload.cancellation_reason if payload else None
    return await PaymentService(db).cancel_payment(
        club_id=club_id,
        payment_id=payment_id,
        actor_id=current_user.id,
        cancellation_reason=reason,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PLAYER PAYMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@player_payments_router.get(
    "",
    response_model=list[PlayerPaymentResponse],
    summary="List authenticated player's own payments",
    description="Returns payment history for the calling player across all clubs.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def list_player_payments(
    payment_status: PaymentStatus | None = Query(default=None, alias="status"),
    purpose: PaymentPurpose | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerPaymentResponse]:
    """Retrieve caller's own payment history."""
    return await PaymentService(db).list_player_payments(
        user_id=current_user.id,
        status=payment_status,
        purpose=purpose,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )


@player_payments_router.get(
    "/{payment_id}",
    response_model=PlayerPaymentResponse,
    summary="Get authenticated player's payment detail",
    description="Returns read-only payment detail for caller's own payment. Returns 404 if payment belongs to another user.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Payment not found"},
    },
)
async def get_player_payment(
    payment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerPaymentResponse:
    """Retrieve caller's own payment detail."""
    return await PaymentService(db).get_player_payment(
        user_id=current_user.id,
        payment_id=payment_id,
    )
