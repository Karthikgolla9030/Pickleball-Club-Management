"""
Aught2 Pickleball — Help & Support Public/Portal API Endpoints
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.legal_and_help import (
    FAQsListResponse,
    HelpArticlesListResponse,
    HelpArticleResponse,
    HelpCategoryResponse,
)
from app.services.legal_and_help_service import LegalAndHelpService

router = APIRouter(prefix="/help", tags=["Help & Support"])


@router.get(
    "/categories",
    response_model=list[HelpCategoryResponse],
    status_code=status.HTTP_200_OK,
    summary="List published help categories",
    description="Returns published help categories filtered by audience (player, club, all).",
)
async def list_help_categories(
    audience: str | None = Query(default=None, description="Filter audience: player, club, all"),
    db: AsyncSession = Depends(get_db),
) -> list[HelpCategoryResponse]:
    return await LegalAndHelpService(db).list_categories(target_audience=audience)


@router.get(
    "/faqs",
    response_model=FAQsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List published FAQs",
    description="Returns published FAQs with optional category, audience, and keyword filtering.",
)
async def list_faqs(
    audience: str | None = Query(default=None, description="player, club, all"),
    category_id: UUID | None = Query(default=None, description="Optional category UUID"),
    search: str | None = Query(default=None, description="Keyword search"),
    db: AsyncSession = Depends(get_db),
) -> FAQsListResponse:
    return await LegalAndHelpService(db).list_faqs(
        target_audience=audience,
        category_id=category_id,
        search=search,
    )


@router.get(
    "/articles",
    response_model=HelpArticlesListResponse,
    status_code=status.HTTP_200_OK,
    summary="List published help articles",
    description="Returns published help articles with optional category, audience, and keyword filtering.",
)
async def list_help_articles(
    audience: str | None = Query(default=None, description="player, club, all"),
    category_id: UUID | None = Query(default=None, description="Optional category UUID"),
    search: str | None = Query(default=None, description="Keyword search"),
    db: AsyncSession = Depends(get_db),
) -> HelpArticlesListResponse:
    return await LegalAndHelpService(db).list_articles(
        target_audience=audience,
        category_id=category_id,
        search=search,
    )


@router.get(
    "/articles/{slug_or_id}",
    response_model=HelpArticleResponse,
    status_code=status.HTTP_200_OK,
    summary="Get single help article detail",
)
async def get_help_article(
    slug_or_id: str,
    db: AsyncSession = Depends(get_db),
) -> HelpArticleResponse:
    return await LegalAndHelpService(db).get_article(slug_or_id=slug_or_id)

