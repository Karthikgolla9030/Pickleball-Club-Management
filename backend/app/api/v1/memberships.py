"""
Aught2 Pickleball — Membership Plans & Subscriptions API (Phase 12)

Club-scoped endpoints for:
  - Membership plan catalog (CRUD, activate/deactivate)
  - Member subscriptions (create, cancel, renew, list with filters)

Authorization:
  - manage_memberships required for all staff plan/subscription operations
  - Players use /player/membership for their own read-only view

Tenant isolation:
  - All routes are scoped to club_id path parameter
  - Service layer enforces cross-club access is impossible
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
from app.models.membership import PlanStatus, SubscriptionStatus
from app.models.user import User
from app.permissions import Permission
from app.schemas.membership import (
    MemberSubscriptionCancelRequest,
    MemberSubscriptionCreate,
    MemberSubscriptionResponse,
    MemberSubscriptionUpdate,
    MembershipPlanCreate,
    MembershipPlanDetailResponse,
    MembershipPlanResponse,
    MembershipPlanUpdate,
)
from app.services.member_subscription_service import MemberSubscriptionService
from app.services.membership_plan_service import MembershipPlanService

# ─── Plan Catalog Router ──────────────────────────────────────────────────────

plans_router = APIRouter(
    prefix="/clubs/{club_id}/membership-plans",
    tags=["Membership Plans"],
)

# ─── Subscription Router ──────────────────────────────────────────────────────

subscriptions_router = APIRouter(
    prefix="/clubs/{club_id}/subscriptions",
    tags=["Member Subscriptions"],
)


# ═══════════════════════════════════════════════════════════════════════════════
# PLAN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@plans_router.get(
    "",
    response_model=list[MembershipPlanResponse],
    summary="List membership plans for a club",
    description=(
        "Returns all membership plans for the club. "
        "Optionally filter by status (active/inactive). "
        "Requires manage_memberships permission."
    ),
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Club not found"},
    },
)
async def list_membership_plans(
    club_id: UUID,
    plan_status: PlanStatus | None = Query(default=None, alias="status"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> list[MembershipPlanResponse]:
    """List all plans for a club, optionally filtered by status."""
    return await MembershipPlanService(db).list_plans(
        club_id=club_id,
        status=plan_status,
    )


@plans_router.post(
    "",
    response_model=MembershipPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a membership plan",
    description=(
        "Create a new membership plan for the club. "
        "Requires manage_memberships permission (owner or manager)."
    ),
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Club not found"},
        422: {"description": "Validation error"},
    },
)
async def create_membership_plan(
    club_id: UUID,
    payload: MembershipPlanCreate,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipPlanResponse:
    """Create a new membership plan."""
    return await MembershipPlanService(db).create_plan(club_id=club_id, payload=payload)


@plans_router.get(
    "/{plan_id}",
    response_model=MembershipPlanDetailResponse,
    summary="Get membership plan detail",
    description="Returns plan with subscriber count. Requires manage_memberships.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Plan not found in this club"},
    },
)
async def get_membership_plan(
    club_id: UUID,
    plan_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipPlanDetailResponse:
    """Get detailed plan information including subscriber count."""
    return await MembershipPlanService(db).get_plan(club_id=club_id, plan_id=plan_id)


@plans_router.patch(
    "/{plan_id}",
    response_model=MembershipPlanResponse,
    summary="Update a membership plan",
    description=(
        "Update plan name, description, duration, price, benefits, or status. "
        "club_id is immutable. Historical subscriptions remain linked to original plan data."
    ),
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Plan not found in this club"},
        422: {"description": "Validation error"},
    },
)
async def update_membership_plan(
    club_id: UUID,
    plan_id: UUID,
    payload: MembershipPlanUpdate,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipPlanResponse:
    """Update membership plan fields."""
    return await MembershipPlanService(db).update_plan(
        club_id=club_id, plan_id=plan_id, payload=payload
    )


@plans_router.post(
    "/{plan_id}/deactivate",
    response_model=MembershipPlanResponse,
    summary="Deactivate a membership plan",
    description=(
        "Mark plan as inactive. New subscriptions cannot be created. "
        "Existing active subscriptions remain valid — they are NOT cancelled. "
        "This distinction is critical."
    ),
    responses={
        400: {"description": "Plan is already inactive"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Plan not found in this club"},
    },
)
async def deactivate_membership_plan(
    club_id: UUID,
    plan_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipPlanResponse:
    """Deactivate a membership plan."""
    return await MembershipPlanService(db).deactivate_plan(club_id=club_id, plan_id=plan_id)


@plans_router.post(
    "/{plan_id}/reactivate",
    response_model=MembershipPlanResponse,
    summary="Reactivate a membership plan",
    description="Reactivate an inactive plan, allowing new subscriptions.",
    responses={
        400: {"description": "Plan is already active"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Plan not found in this club"},
    },
)
async def reactivate_membership_plan(
    club_id: UUID,
    plan_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipPlanResponse:
    """Reactivate an inactive membership plan."""
    return await MembershipPlanService(db).reactivate_plan(club_id=club_id, plan_id=plan_id)


# ═══════════════════════════════════════════════════════════════════════════════
# SUBSCRIPTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@subscriptions_router.get(
    "",
    response_model=list[MemberSubscriptionResponse],
    summary="List subscriptions for a club",
    description=(
        "List all member subscriptions with optional filters. "
        "Filter by player, plan, status, or date range using query parameters."
    ),
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
    },
)
async def list_subscriptions(
    club_id: UUID,
    player_membership_id: UUID | None = Query(default=None),
    plan_id: UUID | None = Query(default=None),
    sub_status: SubscriptionStatus | None = Query(default=None, alias="status"),
    start_date_from: date | None = Query(default=None),
    start_date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> list[MemberSubscriptionResponse]:
    """List subscriptions with filtering support."""
    return await MemberSubscriptionService(db).list_subscriptions(
        club_id=club_id,
        player_membership_id=player_membership_id,
        plan_id=plan_id,
        status_filter=sub_status,
        start_date_from=start_date_from,
        start_date_to=start_date_to,
        limit=limit,
        offset=offset,
    )


@subscriptions_router.post(
    "",
    response_model=MemberSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll a player in a membership plan",
    description=(
        "Staff enrollment workflow: select player, plan, and start date. "
        "Validates: active player membership, active plan, same club, no conflicting subscription."
    ),
    responses={
        400: {"description": "Validation error (inactive player/plan, past start date)"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Player or plan not found"},
        409: {"description": "Player already has an active/scheduled subscription"},
    },
)
async def create_subscription(
    club_id: UUID,
    payload: MemberSubscriptionCreate,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MemberSubscriptionResponse:
    """Enroll a club player in a membership plan."""
    return await MemberSubscriptionService(db).create_subscription(
        club_id=club_id,
        payload=payload,
        staff_user_id=current_user.id,
    )


@subscriptions_router.get(
    "/{subscription_id}",
    response_model=MemberSubscriptionResponse,
    summary="Get subscription detail",
    description="Get full subscription detail including player and plan info.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Subscription not found in this club"},
    },
)
async def get_subscription(
    club_id: UUID,
    subscription_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MemberSubscriptionResponse:
    """Get subscription details."""
    return await MemberSubscriptionService(db).get_subscription(
        club_id=club_id, subscription_id=subscription_id
    )


@subscriptions_router.patch(
    "/{subscription_id}",
    response_model=MemberSubscriptionResponse,
    summary="Update subscription (auto_renew, notes)",
    description="Update mutable subscription fields: auto_renew and notes.",
    responses={
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Subscription not found in this club"},
    },
)
async def update_subscription(
    club_id: UUID,
    subscription_id: UUID,
    payload: MemberSubscriptionUpdate,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MemberSubscriptionResponse:
    """Update subscription mutable fields."""
    return await MemberSubscriptionService(db).update_subscription(
        club_id=club_id, subscription_id=subscription_id, payload=payload
    )


@subscriptions_router.post(
    "/{subscription_id}/cancel",
    response_model=MemberSubscriptionResponse,
    summary="Cancel a subscription",
    description=(
        "Staff cancels an active or scheduled subscription. "
        "Status is set to 'cancelled'. Record is never deleted. "
        "No refunds are processed (Phase 12 — no payment integration)."
    ),
    responses={
        400: {"description": "Cannot cancel a non-active/scheduled subscription"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Subscription not found in this club"},
    },
)
async def cancel_subscription(
    club_id: UUID,
    subscription_id: UUID,
    payload: MemberSubscriptionCancelRequest,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MemberSubscriptionResponse:
    """Cancel a membership subscription."""
    return await MemberSubscriptionService(db).cancel_subscription(
        club_id=club_id,
        subscription_id=subscription_id,
        staff_user_id=current_user.id,
        payload=payload,
    )


@subscriptions_router.post(
    "/{subscription_id}/renew",
    response_model=MemberSubscriptionResponse,
    summary="Renew a subscription",
    description=(
        "Administrative renewal: creates a new subscription record starting the day after the current end_date. "
        "Old subscription is preserved for audit history. "
        "No automatic billing is processed."
    ),
    responses={
        400: {"description": "Cannot renew (wrong status, inactive plan)"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Subscription not found"},
        409: {"description": "Active subscription already exists"},
    },
)
async def renew_subscription(
    club_id: UUID,
    subscription_id: UUID,
    current_user: User = Depends(get_current_user),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_MEMBERSHIPS)),
    db: AsyncSession = Depends(get_db),
) -> MemberSubscriptionResponse:
    """Renew a membership subscription (creates new record)."""
    return await MemberSubscriptionService(db).renew_subscription(
        club_id=club_id,
        subscription_id=subscription_id,
        staff_user_id=current_user.id,
    )
