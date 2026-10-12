"""
Aught2 Pickleball — Club Application Public & Applicant API Endpoints

Public entry points for:
- Submitting a new club facility registration request
- Safely looking up application status by reference number & email
- Checking current user's submitted applications
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_optional_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.club_application import (
    ClubApplicationResponse,
    ClubApplicationStatusLookupResponse,
    ClubApplicationSubmitRequest,
)
from app.services.club_application_service import ClubApplicationService

router = APIRouter(prefix="/club-applications", tags=["Club Applications"])


@router.post(
    "",
    response_model=ClubApplicationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a new club registration application",
    description="Public entry point for prospective club owners to apply. Creates a pending application without granting club management permissions.",
    responses={
        400: {"description": "Validation error, slug conflict, or existing pending application"},
        401: {"description": "Existing account password verification failed"},
    },
)
async def submit_club_application(
    payload: ClubApplicationSubmitRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationResponse:
    """Submit a club registration application for platform owner review."""
    user_id = current_user.id if current_user else None
    return await ClubApplicationService(db).submit_application(
        payload=payload,
        current_user_id=user_id,
    )


@router.get(
    "/status",
    response_model=ClubApplicationStatusLookupResponse,
    summary="Check club application status",
    description="Safe status check requiring both reference number and applicant email. Protects other applicants' private data.",
    responses={
        404: {"description": "No application found matching reference number and email"},
    },
)
async def get_application_status(
    reference_number: str = Query(..., description="Application reference code (e.g. APP-XXXXXXXX)"),
    email: str = Query(..., description="Applicant email address for verification"),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationStatusLookupResponse:
    """Look up the status of a submitted club application safely."""
    return await ClubApplicationService(db).get_application_status(
        reference_number=reference_number,
        email=email,
    )


@router.get(
    "/my-applications",
    response_model=list[ClubApplicationResponse],
    summary="List current user's club applications",
    description="Returns all club registration applications submitted by the authenticated user.",
)
async def list_my_applications(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[ClubApplicationResponse]:
    """Retrieve all club registration applications for the authenticated user."""
    return await ClubApplicationService(db).list_my_applications(user_id=current_user.id)
