"""
Aught2 Pickleball — Analytics & Reporting Schemas (Phase 9)

Pydantic v2 schemas for club operational reporting, court utilization,
memberships, competitions, payments, and data exports.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class AnalyticsPeriodInfo(BaseModel):
    """Normalized period metadata for reports."""
    start_date: date = Field(..., description="Inclusive start calendar date")
    end_date: date = Field(..., description="Inclusive end calendar date")
    preset: str = Field(..., description="Preset identifier (7d, 30d, 90d, custom)")
    timezone: str = Field(..., description="Club timezone used for boundaries")
    days_count: int = Field(..., description="Total days included in the range")

    model_config = {"from_attributes": True}


# ─── Bookings & Court Utilization ─────────────────────────────────────────────

class CourtUtilizationItem(BaseModel):
    """Utilization breakdown per individual court."""
    court_id: UUID
    court_name: str
    court_number: int | None = None
    booking_count: int = 0
    booked_minutes: int = 0
    utilization_rate: float = Field(0.0, description="Percentage of available operating hours booked")

    model_config = {"from_attributes": True}


class DailyBookingTrend(BaseModel):
    """Time-series daily booking counts."""
    date: str = Field(..., description="ISO calendar date YYYY-MM-DD")
    day_name: str = Field(..., description="Day name abbreviation (Mon, Tue, etc.)")
    count: int = 0
    booked_minutes: int = 0

    model_config = {"from_attributes": True}


class BookingAnalyticsSummary(BaseModel):
    """Aggregate court reservation and utilization metrics."""
    total_bookings: int = 0
    confirmed_count: int = 0
    completed_count: int = 0
    cancelled_count: int = 0
    upcoming_count: int = 0
    court_utilization_rate: float = Field(0.0, description="Percentage utilization of operating minutes")
    cancellation_rate: float = Field(0.0, description="Cancelled bookings as percentage of total bookings")
    total_booked_minutes: int = 0
    total_operating_minutes: int = 0
    active_courts_count: int = 0

    model_config = {"from_attributes": True}


# ─── Memberships & Subscriptions ──────────────────────────────────────────────

class PlanEnrollmentItem(BaseModel):
    """Subscription enrollment count per membership plan."""
    plan_id: UUID
    plan_name: str
    active_subscribers: int = 0
    price: Decimal = Decimal("0.00")
    currency: str = "INR"

    model_config = {"from_attributes": True}


class MembershipAnalyticsSummary(BaseModel):
    """Aggregate player membership and plan subscription metrics."""
    total_player_memberships: int = 0
    active_count: int = 0
    inactive_count: int = 0
    suspended_count: int = 0
    expired_count: int = 0
    new_members_in_period: int = 0
    pending_requests_count: int = 0
    active_subscriptions_count: int = 0
    expired_subscriptions_count: int = 0

    model_config = {"from_attributes": True}


# ─── Payments & Financial Summaries ───────────────────────────────────────────

class PaymentMethodBreakdown(BaseModel):
    """Financial breakdown grouped by payment method."""
    method: str = Field(..., description="Payment method (cash, bank_transfer, online, other)")
    method_label: str = Field(..., description="Human-readable label")
    count: int = 0
    amount: Decimal = Decimal("0.00")

    model_config = {"from_attributes": True}


class DailyRevenueTrend(BaseModel):
    """Time-series daily collected revenue."""
    date: str = Field(..., description="ISO calendar date YYYY-MM-DD")
    amount: Decimal = Decimal("0.00")
    succeeded_count: int = 0

    model_config = {"from_attributes": True}


class PaymentAnalyticsSummary(BaseModel):
    """
    Aggregate financial figures for authorized staff (MANAGE_PAYMENTS).
    Strict Decimal arithmetic; pending/failed are never counted as revenue.
    """
    total_recorded_count: int = 0
    total_recorded_amount: Decimal = Decimal("0.00")
    succeeded_count: int = 0
    total_collected_amount: Decimal = Decimal("0.00")
    pending_count: int = 0
    pending_amount: Decimal = Decimal("0.00")
    failed_count: int = 0
    failed_amount: Decimal = Decimal("0.00")
    cancelled_count: int = 0
    cancelled_amount: Decimal = Decimal("0.00")
    currency: str = "INR"
    by_method: list[PaymentMethodBreakdown] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ─── Competitions & Community ─────────────────────────────────────────────────

class CompetitionAnalyticsSummary(BaseModel):
    """Aggregate tournament and league activity."""
    total_tournaments: int = 0
    upcoming_tournaments: int = 0
    completed_tournaments: int = 0
    cancelled_tournaments: int = 0
    total_tournament_registrations: int = 0
    total_leagues: int = 0
    active_leagues: int = 0
    completed_leagues: int = 0
    total_league_teams: int = 0

    model_config = {"from_attributes": True}


class CommunityAnalyticsSummary(BaseModel):
    """Aggregate club event and coaching session activity."""
    total_events: int = 0
    upcoming_events: int = 0
    completed_events: int = 0
    total_event_registrations: int = 0
    total_lessons: int = 0
    upcoming_lessons: int = 0
    completed_lessons: int = 0
    total_lesson_registrations: int = 0

    model_config = {"from_attributes": True}


# ─── Comprehensive Top-Level Responses ────────────────────────────────────────

class ClubAnalyticsSummaryResponse(BaseModel):
    """Comprehensive club analytics summary containing all operational dimensions."""
    club_id: UUID
    club_name: str
    period: AnalyticsPeriodInfo
    bookings: BookingAnalyticsSummary
    memberships: MembershipAnalyticsSummary
    competitions: CompetitionAnalyticsSummary
    community: CommunityAnalyticsSummary
    payments: PaymentAnalyticsSummary | None = Field(
        default=None,
        description="Populated only when caller has MANAGE_PAYMENTS permission, otherwise null",
    )
    daily_bookings: list[DailyBookingTrend] = Field(default_factory=list)
    daily_revenue: list[DailyRevenueTrend] | None = Field(
        default=None,
        description="Populated only when caller has MANAGE_PAYMENTS permission, otherwise null",
    )

    model_config = {"from_attributes": True}


class BookingsReportResponse(BaseModel):
    """Detailed booking report with court utilization and trends."""
    club_id: UUID
    club_name: str
    period: AnalyticsPeriodInfo
    summary: BookingAnalyticsSummary
    by_court: list[CourtUtilizationItem] = Field(default_factory=list)
    daily_trend: list[DailyBookingTrend] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class MembershipsReportResponse(BaseModel):
    """Detailed membership report with plan breakdowns."""
    club_id: UUID
    club_name: str
    period: AnalyticsPeriodInfo
    summary: MembershipAnalyticsSummary
    plan_enrollments: list[PlanEnrollmentItem] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class CompetitionsReportResponse(BaseModel):
    """Detailed competition, event, and coaching metrics."""
    club_id: UUID
    club_name: str
    period: AnalyticsPeriodInfo
    competitions: CompetitionAnalyticsSummary
    community: CommunityAnalyticsSummary

    model_config = {"from_attributes": True}


class PaymentsReportResponse(BaseModel):
    """Detailed payment metrics for authorized staff."""
    club_id: UUID
    club_name: str
    period: AnalyticsPeriodInfo
    summary: PaymentAnalyticsSummary
    daily_trend: list[DailyRevenueTrend] = Field(default_factory=list)

    model_config = {"from_attributes": True}
