"""
Aught2 Pickleball — Platform Owner Management API Endpoints

Privileged platform owner review workflows:
- List pending, approved, and rejected club registration applications
- Inspect complete application details
- Transactionally approve application (creates Club & initial club_owner membership)
- Transactionally reject application (records reason, no club created)

Security:
- All endpoints strictly require platform owner authorization via get_current_platform_owner.
- Club staff roles (club_owner, club_manager, tournament_director) cannot access platform endpoints.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_platform_owner
from app.core.database import get_db
from app.models.club_application import ClubApplicationStatus
from app.models.user import User
from app.schemas.club_application import (
    ClubApplicationRejectRequest,
    ClubApplicationResponse,
)
from app.services.club_application_service import ClubApplicationService

router = APIRouter(prefix="/platform", tags=["Platform Administration"])


@router.get(
    "/club-applications",
    response_model=dict,
    summary="List club applications for platform review",
    description="Returns paginated club registration applications. Filter by status: pending, approved, rejected.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def list_club_applications(
    status_filter: ClubApplicationStatus | None = Query(default=None, alias="status", description="Filter by application status"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List club applications for platform owner review."""
    items, total = await ClubApplicationService(db).platform_list_applications(
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [item.model_dump() for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/club-applications/{application_id}",
    response_model=ClubApplicationResponse,
    summary="Get club application details",
    description="Retrieve full details of a specific club registration application.",
    responses={
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Application not found"},
    },
)
async def get_club_application(
    application_id: UUID,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationResponse:
    """Retrieve application details for platform review."""
    return await ClubApplicationService(db).platform_get_application(application_id)


@router.post(
    "/club-applications/{application_id}/approve",
    response_model=ClubApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Approve club application",
    description="Atomically creates the Club facility, grants initial club_owner membership to applicant, and marks application approved.",
    responses={
        400: {"description": "Application is not in pending state or duplicate slug"},
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Application not found"},
    },
)
async def approve_club_application(
    application_id: UUID,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationResponse:
    """Approve a pending club application."""
    return await ClubApplicationService(db).platform_approve_application(
        application_id=application_id,
        platform_owner_id=current_platform_owner.id,
    )


@router.post(
    "/club-applications/{application_id}/reject",
    response_model=ClubApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Reject club application",
    description="Atomically rejects a pending club application with an optional reason. Never creates a club or owner membership.",
    responses={
        400: {"description": "Application is not in pending state"},
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Application not found"},
    },
)
async def reject_club_application(
    application_id: UUID,
    payload: ClubApplicationRejectRequest = ClubApplicationRejectRequest(),
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationResponse:
    """Reject a pending club application."""
    return await ClubApplicationService(db).platform_reject_application(
        application_id=application_id,
        platform_owner_id=current_platform_owner.id,
        rejection_reason=payload.rejection_reason,
    )
