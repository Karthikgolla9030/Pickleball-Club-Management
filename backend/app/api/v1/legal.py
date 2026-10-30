"""
Aught2 Pickleball — Legal Documents Public & Authenticated Endpoints
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.legal_and_help import (
    LegalAcceptanceCreateRequest,
    LegalAcceptanceResponse,
    LegalDocumentVersionResponse,
    PendingAcceptancesResponse,
)
from app.services.legal_and_help_service import LegalAndHelpService

router = APIRouter(prefix="/legal", tags=["Legal Management"])


@router.get(
    "/documents/{document_type}",
    response_model=LegalDocumentVersionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get published legal document",
    description="Public endpoint to read current published version of Player Terms, Club Terms, Privacy Policy, or Club Agreement.",
)
async def get_published_legal_document(
    document_type: str,
    version: str | None = Query(default=None, description="Optional specific version number (e.g. 1.0)"),
    db: AsyncSession = Depends(get_db),
) -> LegalDocumentVersionResponse:
    """Retrieve published legal document for public or in-app viewing."""
    return await LegalAndHelpService(db).get_published_document(
        document_type=document_type,
        version=version,
    )


@router.get(
    "/documents/{document_type}/versions/{version}",
    response_model=LegalDocumentVersionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get specific historical version of a legal document",
)
async def get_specific_version_document(
    document_type: str,
    version: str,
    db: AsyncSession = Depends(get_db),
) -> LegalDocumentVersionResponse:
    return await LegalAndHelpService(db).get_published_document(
        document_type=document_type,
        version=version,
    )


@router.get(
    "/pending-acceptances",
    response_model=PendingAcceptancesResponse,
    status_code=status.HTTP_200_OK,
    summary="Check pending legal document acceptances for user",
    description="Checks whether current authenticated user has unaccepted terms or updated policies requiring renewed acceptance.",
)
async def get_pending_acceptances(
    club_id: UUID | None = Query(default=None, description="Optional club context for club staff"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PendingAcceptancesResponse:
    return await LegalAndHelpService(db).list_pending_acceptances(
        user=current_user,
        club_id=club_id,
    )


@router.post(
    "/acceptances",
    response_model=LegalAcceptanceResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record user acceptance of a legal document",
    description="Persists compliance acceptance record with timestamp, version, and client metadata.",
)
async def record_legal_acceptance(
    payload: LegalAcceptanceCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LegalAcceptanceResponse:
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return await LegalAndHelpService(db).record_acceptance(
        user=current_user,
        payload=payload,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.get(
    "/my-acceptances",
    response_model=list[LegalAcceptanceResponse],
    status_code=status.HTTP_200_OK,
    summary="List acceptance records for current user",
)
async def list_my_acceptances(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LegalAcceptanceResponse]:
    return await LegalAndHelpService(db).list_user_acceptances(user=current_user)

