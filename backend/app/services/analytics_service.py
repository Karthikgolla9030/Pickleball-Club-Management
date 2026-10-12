"""
Aught2 Pickleball — Analytics Service (Phase 9)

High-performance, secure reporting layer enforcing strict multi-tenant boundaries.
Provides database-aggregated metrics for bookings, court utilization, memberships,
competitions, events, coaching, financial records, and CSV exports.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID
import zoneinfo

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import Booking, BookingStatus
from app.models.club import Club
from app.models.club_membership import ClubRole
from app.models.club_membership_request import ClubMembershipRequest, MembershipRequestStatus
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Team
from app.models.court import Court, CourtStatus
from app.models.event import Event, EventRegistration, EventStatus
from app.models.league import League, LeagueStatus
from app.models.lesson import Lesson, LessonRegistration, LessonStatus
from app.models.membership import MemberSubscription, MembershipPlan, SubscriptionStatus
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tournament import Tournament, TournamentStatus
from app.models.tournament_registration import TournamentRegistration
from app.permissions import Permission, has_permission
from app.repositories.club_repository import ClubRepository
from app.schemas.analytics import (
    AnalyticsPeriodInfo,
    BookingAnalyticsSummary,
    BookingsReportResponse,
    ClubAnalyticsSummaryResponse,
    CommunityAnalyticsSummary,
    CompetitionAnalyticsSummary,
    CourtUtilizationItem,
    DailyBookingTrend,
    DailyRevenueTrend,
    MembershipAnalyticsSummary,
    MembershipsReportResponse,
    PaymentAnalyticsSummary,
    PaymentMethodBreakdown,
    PaymentsReportResponse,
    PlanEnrollmentItem,
)


def _sanitize_csv_cell(value: Any) -> str:
    """
    Sanitize CSV field to prevent CSV/formula injection attacks in spreadsheets.
    If value begins with =, +, -, @, tab, or carriage return, prepend a single quote.
    """
    if value is None:
        return ""
    str_val = str(value)
    if str_val and str_val[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{str_val}"
    return str_val


class AnalyticsService:
    """Service layer for multi-tenant analytics, reporting, and data export."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.club_repo = ClubRepository(db)

    # ─── Date & Timezone Utilities ────────────────────────────────────────────

    def _get_club_timezone(self, club: Club) -> zoneinfo.ZoneInfo:
        """Resolve club timezone with safe fallback to UTC."""
        tz_name = (club.timezone or "UTC").strip()
        try:
            return zoneinfo.ZoneInfo(tz_name)
        except Exception:
            return zoneinfo.ZoneInfo("UTC")

    def resolve_date_boundaries(
        self,
        club: Club,
        preset: str | None = "30d",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> tuple[datetime, datetime, AnalyticsPeriodInfo]:
        """
        Derive inclusive UTC datetime boundaries from preset or custom dates.
        Normalizes against the club's configured local timezone.
        """
        tz = self._get_club_timezone(club)
        now_local = datetime.now(tz)
        today_local = now_local.date()

        preset_key = (preset or "").lower().strip()

        if preset_key == "7d":
            resolved_end = today_local
            resolved_start = today_local - timedelta(days=6)
            preset_name = "7d"
        elif preset_key == "90d":
            resolved_end = today_local
            resolved_start = today_local - timedelta(days=89)
            preset_name = "90d"
        elif preset_key == "30d" or (not start_date and not end_date):
            resolved_end = today_local
            resolved_start = today_local - timedelta(days=29)
            preset_name = "30d"
        else:
            if not start_date or not end_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Both start_date and end_date are required for custom ranges",
                )
            if start_date > end_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="start_date must be earlier than or equal to end_date",
                )
            if (end_date - start_date).days > 366:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Date range cannot exceed 366 days",
                )
            resolved_start = start_date
            resolved_end = end_date
            preset_name = "custom"

        # Calculate exact inclusive boundaries in local time
        start_local_dt = datetime.combine(resolved_start, time.min, tzinfo=tz)
        end_local_dt = datetime.combine(resolved_end, time.max, tzinfo=tz)

        # Convert to timezone-aware UTC datetimes
        start_utc_dt = start_local_dt.astimezone(timezone.utc)
        end_utc_dt = end_local_dt.astimezone(timezone.utc)

        days_count = (resolved_end - resolved_start).days + 1

        period_info = AnalyticsPeriodInfo(
            start_date=resolved_start,
            end_date=resolved_end,
            preset=preset_name,
            timezone=str(tz),
            days_count=days_count,
        )

        return start_utc_dt, end_utc_dt, period_info

    # ─── Operational Metrics Computation ──────────────────────────────────────

    async def _compute_bookings_summary(
        self,
        club_id: UUID,
        club: Club,
        start_utc: datetime,
        end_utc: datetime,
        days_count: int,
    ) -> tuple[BookingAnalyticsSummary, list[DailyBookingTrend]]:
        """Compute booking and court utilization aggregates."""
        now_utc = datetime.now(timezone.utc)

        # 1. Booking counts by status
        status_stmt = (
            select(Booking.status, func.count(Booking.id))
            .where(
                Booking.club_id == club_id,
                Booking.start_at >= start_utc,
                Booking.start_at <= end_utc,
            )
            .group_by(Booking.status)
        )
        status_res = await self.db.execute(status_stmt)
        status_counts = dict(status_res.all())

        raw_confirmed = status_counts.get(BookingStatus.CONFIRMED, 0)
        raw_completed = status_counts.get(BookingStatus.COMPLETED, 0)
        cancelled_count = status_counts.get(BookingStatus.CANCELLED, 0)
        total_bookings = sum(status_counts.values())

        # Upcoming confirmed bookings
        upcoming_stmt = select(func.count(Booking.id)).where(
            Booking.club_id == club_id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.start_at >= now_utc,
        )
        upcoming_count = (await self.db.scalar(upcoming_stmt)) or 0

        # Confirmed past bookings count as completed
        completed_past_stmt = select(func.count(Booking.id)).where(
            Booking.club_id == club_id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.start_at >= start_utc,
            Booking.start_at <= end_utc,
            Booking.end_at < now_utc,
        )
        completed_past_count = (await self.db.scalar(completed_past_stmt)) or 0

        completed_count = raw_completed + completed_past_count
        confirmed_count = max(0, raw_confirmed - completed_past_count)

        # 2. Court capacity & available operating minutes
        active_courts_stmt = select(func.count(Court.id)).where(
            Court.club_id == club_id,
            Court.status == CourtStatus.ACTIVE,
            Court.is_active.is_(True),
        )
        active_courts_count = (await self.db.scalar(active_courts_stmt)) or 0

        open_time = club.opening_time or time(6, 0)
        close_time = club.closing_time or time(22, 0)
        daily_open_minutes = (close_time.hour * 60 + close_time.minute) - (open_time.hour * 60 + open_time.minute)
        if daily_open_minutes <= 0:
            daily_open_minutes = 960  # Fallback to 16 hours (06:00 to 22:00)

        total_operating_minutes = active_courts_count * daily_open_minutes * days_count

        # 3. Booked minutes of non-cancelled bookings
        bookings_stmt = select(Booking.start_at, Booking.end_at).where(
            Booking.club_id == club_id,
            Booking.status != BookingStatus.CANCELLED,
            Booking.start_at >= start_utc,
            Booking.start_at <= end_utc,
        )
        bookings_rows = (await self.db.execute(bookings_stmt)).all()

        total_booked_minutes = 0
        tz = self._get_club_timezone(club)
        daily_minutes_map: dict[str, int] = {}
        daily_counts_map: dict[str, int] = {}

        for b_start, b_end in bookings_rows:
            duration = int((b_end - b_start).total_seconds() / 60)
            if duration > 0:
                total_booked_minutes += duration
            # Group into day in club local timezone
            b_date_str = b_start.astimezone(tz).strftime("%Y-%m-%d")
            daily_minutes_map[b_date_str] = daily_minutes_map.get(b_date_str, 0) + max(0, duration)
            daily_counts_map[b_date_str] = daily_counts_map.get(b_date_str, 0) + 1

        # Court utilization rate
        if total_operating_minutes > 0:
            court_utilization_rate = round(min(100.0, (total_booked_minutes / total_operating_minutes) * 100), 1)
        else:
            court_utilization_rate = 0.0

        # Cancellation rate
        if total_bookings > 0:
            cancellation_rate = round((cancelled_count / total_bookings) * 100, 1)
        else:
            cancellation_rate = 0.0

        summary = BookingAnalyticsSummary(
            total_bookings=total_bookings,
            confirmed_count=confirmed_count,
            completed_count=completed_count,
            cancelled_count=cancelled_count,
            upcoming_count=upcoming_count,
            court_utilization_rate=court_utilization_rate,
            cancellation_rate=cancellation_rate,
            total_booked_minutes=total_booked_minutes,
            total_operating_minutes=total_operating_minutes,
            active_courts_count=active_courts_count,
        )

        # 4. Complete continuous daily time-series
        start_date = start_utc.astimezone(tz).date()
        daily_trends: list[DailyBookingTrend] = []
        for i in range(days_count):
            cur_date = start_date + timedelta(days=i)
            cur_str = cur_date.strftime("%Y-%m-%d")
            day_name = cur_date.strftime("%a")
            daily_trends.append(
                DailyBookingTrend(
                    date=cur_str,
                    day_name=day_name,
                    count=daily_counts_map.get(cur_str, 0),
                    booked_minutes=daily_minutes_map.get(cur_str, 0),
                )
            )

        return summary, daily_trends

    async def _compute_memberships_summary(
        self,
        club_id: UUID,
        start_utc: datetime,
        end_utc: datetime,
    ) -> MembershipAnalyticsSummary:
        """Compute player memberships and plan subscription aggregates."""
        # Status distribution of club player memberships
        status_stmt = (
            select(ClubPlayerMembership.status, func.count(ClubPlayerMembership.id))
            .where(ClubPlayerMembership.club_id == club_id)
            .group_by(ClubPlayerMembership.status)
        )
        status_res = await self.db.execute(status_stmt)
        status_map = dict(status_res.all())

        total_players = sum(status_map.values())
        active_count = status_map.get(PlayerMembershipStatus.ACTIVE, 0)
        inactive_count = status_map.get(PlayerMembershipStatus.INACTIVE, 0)
        suspended_count = status_map.get(PlayerMembershipStatus.SUSPENDED, 0)
        expired_count = status_map.get(PlayerMembershipStatus.EXPIRED, 0)

        # New members in window
        new_members_stmt = select(func.count(ClubPlayerMembership.id)).where(
            ClubPlayerMembership.club_id == club_id,
            ClubPlayerMembership.joined_at >= start_utc,
            ClubPlayerMembership.joined_at <= end_utc,
        )
        new_members_in_period = (await self.db.scalar(new_members_stmt)) or 0

        # Pending membership requests
        pending_requests_stmt = select(func.count(ClubMembershipRequest.id)).where(
            ClubMembershipRequest.club_id == club_id,
            ClubMembershipRequest.status == MembershipRequestStatus.PENDING,
        )
        pending_requests_count = (await self.db.scalar(pending_requests_stmt)) or 0

        # Subscriptions breakdown
        sub_status_stmt = (
            select(MemberSubscription.status, func.count(MemberSubscription.id))
            .where(MemberSubscription.club_id == club_id)
            .group_by(MemberSubscription.status)
        )
        sub_res = await self.db.execute(sub_status_stmt)
        sub_map = dict(sub_res.all())

        active_subs = sub_map.get(SubscriptionStatus.ACTIVE, 0)
        expired_subs = sub_map.get(SubscriptionStatus.EXPIRED, 0)

        return MembershipAnalyticsSummary(
            total_player_memberships=total_players,
            active_count=active_count,
            inactive_count=inactive_count,
            suspended_count=suspended_count,
            expired_count=expired_count,
            new_members_in_period=new_members_in_period,
            pending_requests_count=pending_requests_count,
            active_subscriptions_count=active_subs,
            expired_subscriptions_count=expired_subs,
        )

    async def _compute_payments_summary(
        self,
        club_id: UUID,
        club: Club,
        start_utc: datetime,
        end_utc: datetime,
        days_count: int,
    ) -> tuple[PaymentAnalyticsSummary, list[DailyRevenueTrend]]:
        """
        Compute financial aggregates for authorized staff (MANAGE_PAYMENTS).
        Zero floating-point arithmetic; strictly Decimal and SQL Numeric.
        """
        # Group payments by status within the period
        status_stmt = (
            select(
                Payment.status,
                func.count(Payment.id),
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .where(
                Payment.club_id == club_id,
                Payment.created_at >= start_utc,
                Payment.created_at <= end_utc,
            )
            .group_by(Payment.status)
        )
        res = (await self.db.execute(status_stmt)).all()

        counts_map: dict[PaymentStatus, int] = {}
        amounts_map: dict[PaymentStatus, Decimal] = {}
        total_count = 0
        total_amount = Decimal("0.00")

        for st, c, amt in res:
            dec_amt = Decimal(str(amt or 0))
            counts_map[st] = c
            amounts_map[st] = dec_amt
            total_count += c
            total_amount += dec_amt

        succeeded_count = counts_map.get(PaymentStatus.SUCCEEDED, 0)
        succeeded_amount = amounts_map.get(PaymentStatus.SUCCEEDED, Decimal("0.00"))

        pending_count = counts_map.get(PaymentStatus.PENDING, 0)
        pending_amount = amounts_map.get(PaymentStatus.PENDING, Decimal("0.00"))

        failed_count = counts_map.get(PaymentStatus.FAILED, 0)
        failed_amount = amounts_map.get(PaymentStatus.FAILED, Decimal("0.00"))

        cancelled_count = counts_map.get(PaymentStatus.CANCELLED, 0)
        cancelled_amount = amounts_map.get(PaymentStatus.CANCELLED, Decimal("0.00"))

        # Breakdown by payment method for succeeded payments
        method_stmt = (
            select(
                Payment.payment_method,
                func.count(Payment.id),
                func.coalesce(func.sum(Payment.amount), 0),
            )
            .where(
                Payment.club_id == club_id,
                Payment.status == PaymentStatus.SUCCEEDED,
                Payment.created_at >= start_utc,
                Payment.created_at <= end_utc,
            )
            .group_by(Payment.payment_method)
        )
        method_res = (await self.db.execute(method_stmt)).all()

        method_items: list[PaymentMethodBreakdown] = []
        for m, c, amt in method_res:
            m_label = m.display_label if hasattr(m, "display_label") else str(m).title()
            method_items.append(
                PaymentMethodBreakdown(
                    method=m.value if hasattr(m, "value") else str(m),
                    method_label=m_label,
                    count=c,
                    amount=Decimal(str(amt or 0)),
                )
            )

        summary = PaymentAnalyticsSummary(
            total_recorded_count=total_count,
            total_recorded_amount=total_amount,
            succeeded_count=succeeded_count,
            total_collected_amount=succeeded_amount,
            pending_count=pending_count,
            pending_amount=pending_amount,
            failed_count=failed_count,
            failed_amount=failed_amount,
            cancelled_count=cancelled_count,
            cancelled_amount=cancelled_amount,
            currency="INR",
            by_method=method_items,
        )

        # Daily revenue time-series
        daily_stmt = select(Payment.created_at, Payment.amount).where(
            Payment.club_id == club_id,
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.created_at >= start_utc,
            Payment.created_at <= end_utc,
        )
        daily_rows = (await self.db.execute(daily_stmt)).all()

        tz = self._get_club_timezone(club)
        daily_rev_map: dict[str, Decimal] = {}
        daily_succ_cnt: dict[str, int] = {}
        for p_dt, p_amt in daily_rows:
            p_date_str = p_dt.astimezone(tz).strftime("%Y-%m-%d")
            daily_rev_map[p_date_str] = daily_rev_map.get(p_date_str, Decimal("0.00")) + Decimal(str(p_amt or 0))
            daily_succ_cnt[p_date_str] = daily_succ_cnt.get(p_date_str, 0) + 1

        start_date = start_utc.astimezone(tz).date()
        daily_trends: list[DailyRevenueTrend] = []
        for i in range(days_count):
            cur_date = start_date + timedelta(days=i)
            cur_str = cur_date.strftime("%Y-%m-%d")
            daily_trends.append(
                DailyRevenueTrend(
                    date=cur_str,
                    amount=daily_rev_map.get(cur_str, Decimal("0.00")),
                    succeeded_count=daily_succ_cnt.get(cur_str, 0),
                )
            )

        return summary, daily_trends

    async def _compute_competitions_summary(
        self,
        club_id: UUID,
    ) -> CompetitionAnalyticsSummary:
        """Compute tournament and league metrics for the club."""
        # Tournaments
        t_stmt = (
            select(Tournament.status, func.count(Tournament.id))
            .where(Tournament.club_id == club_id)
            .group_by(Tournament.status)
        )
        t_res = await self.db.execute(t_stmt)
        t_map = dict(t_res.all())

        total_tournaments = sum(t_map.values())
        upcoming_tournaments = (
            t_map.get(TournamentStatus.REGISTRATION_OPEN, 0)
            + t_map.get(TournamentStatus.REGISTRATION_CLOSED, 0)
            + t_map.get(TournamentStatus.IN_PROGRESS, 0)
        )
        completed_tournaments = t_map.get(TournamentStatus.COMPLETED, 0)
        cancelled_tournaments = t_map.get(TournamentStatus.CANCELLED, 0)

        t_reg_stmt = select(func.count(TournamentRegistration.id)).join(
            Tournament, TournamentRegistration.tournament_id == Tournament.id
        ).where(Tournament.club_id == club_id)
        total_t_registrations = (await self.db.scalar(t_reg_stmt)) or 0

        # Leagues
        l_stmt = (
            select(League.status, func.count(League.id))
            .where(League.club_id == club_id)
            .group_by(League.status)
        )
        l_res = await self.db.execute(l_stmt)
        l_map = dict(l_res.all())

        total_leagues = sum(l_map.values())
        active_leagues = (
            l_map.get(LeagueStatus.REGISTRATION_OPEN, 0)
            + l_map.get(LeagueStatus.REGISTRATION_CLOSED, 0)
            + l_map.get(LeagueStatus.IN_PROGRESS, 0)
            + l_map.get(LeagueStatus.PLAYOFFS, 0)
        )
        completed_leagues = l_map.get(LeagueStatus.COMPLETED, 0)

        team_stmt = select(func.count(Team.id)).join(
            League, Team.league_id == League.id
        ).where(League.club_id == club_id)
        total_league_teams = (await self.db.scalar(team_stmt)) or 0

        return CompetitionAnalyticsSummary(
            total_tournaments=total_tournaments,
            upcoming_tournaments=upcoming_tournaments,
            completed_tournaments=completed_tournaments,
            cancelled_tournaments=cancelled_tournaments,
            total_tournament_registrations=total_t_registrations,
            total_leagues=total_leagues,
            active_leagues=active_leagues,
            completed_leagues=completed_leagues,
            total_league_teams=total_league_teams,
        )

    async def _compute_community_summary(
        self,
        club_id: UUID,
    ) -> CommunityAnalyticsSummary:
        """Compute event and lesson coaching metrics."""
        now_utc = datetime.now(timezone.utc)

        # Events
        e_stmt = (
            select(Event.status, func.count(Event.id))
            .where(Event.club_id == club_id)
            .group_by(Event.status)
        )
        e_res = await self.db.execute(e_stmt)
        e_map = dict(e_res.all())

        total_events = sum(e_map.values())
        completed_events = e_map.get(EventStatus.COMPLETED, 0)

        upcoming_events_stmt = select(func.count(Event.id)).where(
            Event.club_id == club_id,
            Event.status == EventStatus.PUBLISHED,
            Event.end_at >= now_utc,
        )
        upcoming_events = (await self.db.scalar(upcoming_events_stmt)) or 0

        e_reg_stmt = select(func.count(EventRegistration.id)).join(
            Event, EventRegistration.event_id == Event.id
        ).where(Event.club_id == club_id)
        total_event_registrations = (await self.db.scalar(e_reg_stmt)) or 0

        # Lessons
        ls_stmt = (
            select(Lesson.status, func.count(Lesson.id))
            .where(Lesson.club_id == club_id)
            .group_by(Lesson.status)
        )
        ls_res = await self.db.execute(ls_stmt)
        ls_map = dict(ls_res.all())

        total_lessons = sum(ls_map.values())
        completed_lessons = ls_map.get(LessonStatus.COMPLETED, 0)

        upcoming_lessons_stmt = select(func.count(Lesson.id)).where(
            Lesson.club_id == club_id,
            Lesson.status == LessonStatus.PUBLISHED,
            Lesson.end_at >= now_utc,
        )
        upcoming_lessons = (await self.db.scalar(upcoming_lessons_stmt)) or 0

        ls_reg_stmt = select(func.count(LessonRegistration.id)).join(
            Lesson, LessonRegistration.lesson_id == Lesson.id
        ).where(Lesson.club_id == club_id)
        total_lesson_registrations = (await self.db.scalar(ls_reg_stmt)) or 0

        return CommunityAnalyticsSummary(
            total_events=total_events,
            upcoming_events=upcoming_events,
            completed_events=completed_events,
            total_event_registrations=total_event_registrations,
            total_lessons=total_lessons,
            upcoming_lessons=upcoming_lessons,
            completed_lessons=completed_lessons,
            total_lesson_registrations=total_lesson_registrations,
        )

    # ─── Public Reporting API ─────────────────────────────────────────────────

    async def get_club_summary(
        self,
        club_id: UUID,
        caller_role: ClubRole,
        preset: str | None = "30d",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> ClubAnalyticsSummaryResponse:
        """
        Return comprehensive operational analytics summary for the authorized club.
        Payments are included only if caller has MANAGE_PAYMENTS permission.
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        start_utc, end_utc, period = self.resolve_date_boundaries(
            club=club,
            preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

        bookings_summary, daily_bookings = await self._compute_bookings_summary(
            club_id=club_id,
            club=club,
            start_utc=start_utc,
            end_utc=end_utc,
            days_count=period.days_count,
        )

        memberships_summary = await self._compute_memberships_summary(
            club_id=club_id,
            start_utc=start_utc,
            end_utc=end_utc,
        )

        competitions_summary = await self._compute_competitions_summary(club_id=club_id)
        community_summary = await self._compute_community_summary(club_id=club_id)

        payments_summary = None
        daily_revenue = None
        if has_permission(caller_role, Permission.MANAGE_PAYMENTS):
            payments_summary, daily_revenue = await self._compute_payments_summary(
                club_id=club_id,
                club=club,
                start_utc=start_utc,
                end_utc=end_utc,
                days_count=period.days_count,
            )

        return ClubAnalyticsSummaryResponse(
            club_id=club.id,
            club_name=club.name,
            period=period,
            bookings=bookings_summary,
            memberships=memberships_summary,
            competitions=competitions_summary,
            community=community_summary,
            payments=payments_summary,
            daily_bookings=daily_bookings,
            daily_revenue=daily_revenue,
        )

    async def get_bookings_report(
        self,
        club_id: UUID,
        preset: str | None = "30d",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> BookingsReportResponse:
        """Detailed booking analytics including individual court utilization breakdown."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        start_utc, end_utc, period = self.resolve_date_boundaries(
            club=club,
            preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

        summary, daily_trend = await self._compute_bookings_summary(
            club_id=club_id,
            club=club,
            start_utc=start_utc,
            end_utc=end_utc,
            days_count=period.days_count,
        )

        # Court-by-court breakdown
        courts_stmt = (
            select(Court)
            .where(
                Court.club_id == club_id,
                Court.status == CourtStatus.ACTIVE,
                Court.is_active.is_(True),
            )
            .order_by(Court.court_number.asc().nulls_last(), Court.name.asc())
        )
        courts = (await self.db.scalars(courts_stmt)).all()

        open_time = club.opening_time or time(6, 0)
        close_time = club.closing_time or time(22, 0)
        daily_open_minutes = (close_time.hour * 60 + close_time.minute) - (open_time.hour * 60 + open_time.minute)
        if daily_open_minutes <= 0:
            daily_open_minutes = 960
        single_court_available_minutes = daily_open_minutes * period.days_count

        court_items: list[CourtUtilizationItem] = []
        for court in courts:
            c_bookings_stmt = select(Booking.start_at, Booking.end_at).where(
                Booking.club_id == club_id,
                Booking.court_id == court.id,
                Booking.status != BookingStatus.CANCELLED,
                Booking.start_at >= start_utc,
                Booking.start_at <= end_utc,
            )
            c_rows = (await self.db.execute(c_bookings_stmt)).all()
            c_booked_minutes = sum(int((b_end - b_start).total_seconds() / 60) for b_start, b_end in c_rows)
            c_booked_count = len(c_rows)

            util_rate = (
                round(min(100.0, (c_booked_minutes / single_court_available_minutes) * 100), 1)
                if single_court_available_minutes > 0
                else 0.0
            )

            court_items.append(
                CourtUtilizationItem(
                    court_id=court.id,
                    court_name=court.name,
                    court_number=court.court_number,
                    booking_count=c_booked_count,
                    booked_minutes=c_booked_minutes,
                    utilization_rate=util_rate,
                )
            )

        return BookingsReportResponse(
            club_id=club.id,
            club_name=club.name,
            period=period,
            summary=summary,
            by_court=court_items,
            daily_trend=daily_trend,
        )

    async def get_memberships_report(
        self,
        club_id: UUID,
        preset: str | None = "30d",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> MembershipsReportResponse:
        """Detailed membership report with membership-plan subscription enrollments."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        start_utc, end_utc, period = self.resolve_date_boundaries(
            club=club,
            preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

        summary = await self._compute_memberships_summary(
            club_id=club_id,
            start_utc=start_utc,
            end_utc=end_utc,
        )

        # Plan enrollments
        plans_stmt = select(
            MembershipPlan.id,
            MembershipPlan.name,
            MembershipPlan.price,
            MembershipPlan.currency,
            func.count(MemberSubscription.id).label("sub_count"),
        ).join(
            MemberSubscription,
            (MemberSubscription.membership_plan_id == MembershipPlan.id)
            & (MemberSubscription.status == SubscriptionStatus.ACTIVE),
            isouter=True,
        ).where(
            MembershipPlan.club_id == club_id,
        ).group_by(
            MembershipPlan.id,
            MembershipPlan.name,
            MembershipPlan.price,
            MembershipPlan.currency,
        ).order_by(
            MembershipPlan.name.asc()
        )
        plan_rows = (await self.db.execute(plans_stmt)).all()

        plan_items = [
            PlanEnrollmentItem(
                plan_id=row[0],
                plan_name=row[1],
                price=Decimal(str(row[2] or 0)),
                currency=row[3] or "INR",
                active_subscribers=row[4] or 0,
            )
            for row in plan_rows
        ]

        return MembershipsReportResponse(
            club_id=club.id,
            club_name=club.name,
            period=period,
            summary=summary,
            plan_enrollments=plan_items,
        )

    async def get_competitions_report(
        self,
        club_id: UUID,
        preset: str | None = "30d",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> CompetitionsReportResponse:
        """Detailed competition, tournament, league, event, and coaching analytics."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        start_utc, end_utc, period = self.resolve_date_boundaries(
            club=club,
            preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

        competitions = await self._compute_competitions_summary(club_id=club_id)
        community = await self._compute_community_summary(club_id=club_id)

        return CompetitionsReportResponse(
            club_id=club.id,
            club_name=club.name,
            period=period,
            competitions=competitions,
            community=community,
        )

    async def get_payments_report(
        self,
        club_id: UUID,
        caller_role: ClubRole,
        preset: str | None = "30d",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> PaymentsReportResponse:
        """
        Detailed payment and revenue report.
        Requires Permission.MANAGE_PAYMENTS. Tournament Director is rejected with 403.
        """
        if not has_permission(caller_role, Permission.MANAGE_PAYMENTS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: manage_payments required",
            )

        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        start_utc, end_utc, period = self.resolve_date_boundaries(
            club=club,
            preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

        summary, daily_trend = await self._compute_payments_summary(
            club_id=club_id,
            club=club,
            start_utc=start_utc,
            end_utc=end_utc,
            days_count=period.days_count,
        )

        return PaymentsReportResponse(
            club_id=club.id,
            club_name=club.name,
            period=period,
            summary=summary,
            daily_trend=daily_trend,
        )

    # ─── Data Export (CSV) ────────────────────────────────────────────────────

    async def export_report_csv(
        self,
        club_id: UUID,
        caller_role: ClubRole,
        report_type: str,
        preset: str | None = "30d",
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> tuple[str, str]:
        """
        Generate sanitized CSV export for the specified report type.
        Escapes formula characters to protect against spreadsheet injection.
        Returns: (csv_content, filename).
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        report_type_clean = (report_type or "").lower().strip()
        if report_type_clean not in ("bookings", "memberships", "payments"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="report_type must be one of: bookings, memberships, payments",
            )

        if report_type_clean == "payments" and not has_permission(caller_role, Permission.MANAGE_PAYMENTS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: manage_payments required for payment exports",
            )

        start_utc, end_utc, period = self.resolve_date_boundaries(
            club=club,
            preset=preset,
            start_date=start_date,
            end_date=end_date,
        )

        output = io.StringIO()
        writer = csv.writer(output, lineterminator="\n")
        tz = self._get_club_timezone(club)

        if report_type_clean == "bookings":
            # Bookings export
            stmt = (
                select(
                    Booking.id,
                    Booking.start_at,
                    Booking.end_at,
                    Booking.status,
                    Court.name.label("court_name"),
                    Court.court_number,
                    Booking.total_price,
                    Booking.currency,
                )
                .join(Court, Booking.court_id == Court.id)
                .where(
                    Booking.club_id == club_id,
                    Booking.start_at >= start_utc,
                    Booking.start_at <= end_utc,
                )
                .order_by(Booking.start_at.desc())
                .limit(5000)
            )
            rows = (await self.db.execute(stmt)).all()

            writer.writerow([
                "Booking ID",
                "Start Time (Local)",
                "End Time (Local)",
                "Duration (Minutes)",
                "Court Name",
                "Court Number",
                "Status",
                "Total Price",
                "Currency",
            ])

            for row in rows:
                b_id, b_start, b_end, b_status, c_name, c_num, price, curr = row
                duration = int((b_end - b_start).total_seconds() / 60)
                start_local_str = b_start.astimezone(tz).strftime("%Y-%m-%d %H:%M")
                end_local_str = b_end.astimezone(tz).strftime("%Y-%m-%d %H:%M")
                st_label = b_status.display_label if hasattr(b_status, "display_label") else str(b_status).title()

                writer.writerow([
                    _sanitize_csv_cell(str(b_id)),
                    _sanitize_csv_cell(start_local_str),
                    _sanitize_csv_cell(end_local_str),
                    _sanitize_csv_cell(duration),
                    _sanitize_csv_cell(c_name),
                    _sanitize_csv_cell(c_num or ""),
                    _sanitize_csv_cell(f"{price:.2f}" if price is not None else "0.00"),
                    _sanitize_csv_cell(curr or "INR"),
                ])

        elif report_type_clean == "memberships":
            # Player memberships export
            stmt = (
                select(
                    ClubPlayerMembership.id,
                    ClubPlayerMembership.membership_number,
                    ClubPlayerMembership.status,
                    ClubPlayerMembership.joined_at,
                    ClubPlayerMembership.expires_at,
                )
                .where(ClubPlayerMembership.club_id == club_id)
                .order_by(ClubPlayerMembership.joined_at.desc())
                .limit(5000)
            )
            rows = (await self.db.execute(stmt)).all()

            writer.writerow([
                "Membership ID",
                "Membership Number",
                "Status",
                "Joined Date",
                "Expiration Date",
            ])

            for row in rows:
                m_id, m_num, m_status, m_joined, m_exp = row
                joined_str = m_joined.astimezone(tz).strftime("%Y-%m-%d") if m_joined else ""
                exp_str = m_exp.astimezone(tz).strftime("%Y-%m-%d") if m_exp else ""
                st_label = m_status.display_label if hasattr(m_status, "display_label") else str(m_status).title()

                writer.writerow([
                    _sanitize_csv_cell(str(m_id)),
                    _sanitize_csv_cell(m_num or ""),
                    _sanitize_csv_cell(st_label),
                    _sanitize_csv_cell(joined_str),
                    _sanitize_csv_cell(exp_str),
                ])

        elif report_type_clean == "payments":
            # Payments export (strictly requires MANAGE_PAYMENTS)
            stmt = (
                select(
                    Payment.id,
                    Payment.reference,
                    Payment.created_at,
                    Payment.status,
                    Payment.payment_method,
                    Payment.purpose,
                    Payment.amount,
                    Payment.currency,
                )
                .where(
                    Payment.club_id == club_id,
                    Payment.created_at >= start_utc,
                    Payment.created_at <= end_utc,
                )
                .order_by(Payment.created_at.desc())
                .limit(5000)
            )
            rows = (await self.db.execute(stmt)).all()

            writer.writerow([
                "Payment ID",
                "Reference",
                "Created At (Local)",
                "Status",
                "Method",
                "Purpose",
                "Amount",
                "Currency",
            ])

            for row in rows:
                p_id, ref, p_created, p_status, p_method, p_purpose, amount, curr = row
                created_str = p_created.astimezone(tz).strftime("%Y-%m-%d %H:%M")
                st_label = p_status.display_label if hasattr(p_status, "display_label") else str(p_status).title()
                meth_label = p_method.display_label if hasattr(p_method, "display_label") else str(p_method).title()
                purp_label = p_purpose.display_label if hasattr(p_purpose, "display_label") else str(p_purpose).title()

                writer.writerow([
                    _sanitize_csv_cell(str(p_id)),
                    _sanitize_csv_cell(ref),
                    _sanitize_csv_cell(created_str),
                    _sanitize_csv_cell(st_label),
                    _sanitize_csv_cell(meth_label),
                    _sanitize_csv_cell(purp_label),
                    _sanitize_csv_cell(f"{amount:.2f}"),
                    _sanitize_csv_cell(curr),
                ])

        filename = f"club_{club.slug}_{report_type_clean}_{period.start_date}_{period.end_date}.csv"
        return output.getvalue(), filename
