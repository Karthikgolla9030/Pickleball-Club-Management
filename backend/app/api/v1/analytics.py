"""
Aught2 Pickleball — Analytics & Reporting Endpoints (Phase 9)

Club staff reporting endpoints providing operational, membership,
competition, and payment analytics, as well as sanitized CSV exports.
Enforces strict multi-tenancy and permission checks.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.permissions import Permission
from app.schemas.analytics import (
    BookingsReportResponse,
    ClubAnalyticsSummaryResponse,
    CompetitionsReportResponse,
    MembershipsReportResponse,
    PaymentsReportResponse,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(
    prefix="/clubs/{club_id}/analytics",
    tags=["Club Reports & Analytics"],
)


@router.get(
    "/summary",
    response_model=ClubAnalyticsSummaryResponse,
    summary="Get club analytics overview",
    description="Retrieve comprehensive operational metrics for the authorized club across the selected date range. Payments are included only if caller has MANAGE_PAYMENTS permission.",
    responses={
        400: {"description": "Invalid date range or parameters"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_reports required)"},
        404: {"description": "Club not found"},
    },
)
async def get_club_analytics_summary(
    club_id: UUID,
    preset: str = Query("30d", description="Preset range: 7d, 30d, 90d, custom"),
    start_date: date | None = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_REPORTS)),
    db: AsyncSession = Depends(get_db),
) -> ClubAnalyticsSummaryResponse:
    return await AnalyticsService(db).get_club_summary(
        club_id=club_id,
        caller_role=membership.role,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/bookings",
    response_model=BookingsReportResponse,
    summary="Get court booking and utilization analytics",
    description="Retrieve court reservation volumes, completion/cancellation rates, and utilization per individual court.",
    responses={
        400: {"description": "Invalid date range"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_reports required)"},
        404: {"description": "Club not found"},
    },
)
async def get_bookings_analytics(
    club_id: UUID,
    preset: str = Query("30d", description="Preset range: 7d, 30d, 90d, custom"),
    start_date: date | None = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_REPORTS)),
    db: AsyncSession = Depends(get_db),
) -> BookingsReportResponse:
    return await AnalyticsService(db).get_bookings_report(
        club_id=club_id,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/memberships",
    response_model=MembershipsReportResponse,
    summary="Get membership and subscription analytics",
    description="Retrieve player membership distributions, new joins during period, pending applications, and plan subscription enrollments.",
    responses={
        400: {"description": "Invalid date range"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_reports required)"},
        404: {"description": "Club not found"},
    },
)
async def get_memberships_analytics(
    club_id: UUID,
    preset: str = Query("30d", description="Preset range: 7d, 30d, 90d, custom"),
    start_date: date | None = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_REPORTS)),
    db: AsyncSession = Depends(get_db),
) -> MembershipsReportResponse:
    return await AnalyticsService(db).get_memberships_report(
        club_id=club_id,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/competitions",
    response_model=CompetitionsReportResponse,
    summary="Get tournament, league, and event analytics",
    description="Retrieve competition activity, registrations, active leagues, and community event metrics.",
    responses={
        400: {"description": "Invalid date range"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_reports required)"},
        404: {"description": "Club not found"},
    },
)
async def get_competitions_analytics(
    club_id: UUID,
    preset: str = Query("30d", description="Preset range: 7d, 30d, 90d, custom"),
    start_date: date | None = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_REPORTS)),
    db: AsyncSession = Depends(get_db),
) -> CompetitionsReportResponse:
    return await AnalyticsService(db).get_competitions_report(
        club_id=club_id,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/payments",
    response_model=PaymentsReportResponse,
    summary="Get financial and payment analytics",
    description="Retrieve financial metrics, collected revenue, failure counts, and method breakdowns. Requires MANAGE_PAYMENTS permission.",
    responses={
        400: {"description": "Invalid date range"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions (manage_payments required)"},
        404: {"description": "Club not found"},
    },
)
async def get_payments_analytics(
    club_id: UUID,
    preset: str = Query("30d", description="Preset range: 7d, 30d, 90d, custom"),
    start_date: date | None = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_PAYMENTS)),
    db: AsyncSession = Depends(get_db),
) -> PaymentsReportResponse:
    return await AnalyticsService(db).get_payments_report(
        club_id=club_id,
        caller_role=membership.role,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/export",
    summary="Export report data as sanitized CSV",
    description="Generates a downloadable CSV export for the specified report type (bookings, memberships, payments). Escapes spreadsheet formula injection.",
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "Sanitized CSV file attachment",
        },
        400: {"description": "Invalid report_type or date range"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Club not found"},
    },
)
async def export_analytics_csv(
    club_id: UUID,
    report_type: str = Query(..., description="Report type: bookings, memberships, payments"),
    preset: str = Query("30d", description="Preset range: 7d, 30d, 90d, custom"),
    start_date: date | None = Query(None, description="Start date for custom range (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="End date for custom range (YYYY-MM-DD)"),
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_REPORTS)),
    db: AsyncSession = Depends(get_db),
) -> Response:
    csv_content, filename = await AnalyticsService(db).export_report_csv(
        club_id=club_id,
        caller_role=membership.role,
        report_type=report_type,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )
