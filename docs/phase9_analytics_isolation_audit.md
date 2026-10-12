# Phase 9: Reports, Analytics & Platform-Wide Data Isolation — Audit & Architecture Specification

## 1. Executive Summary

Phase 9 establishes an enterprise-grade reporting and analytics engine for the Aught2 Pickleball multi-club SaaS platform. This phase:
1. Provides server-aggregated, high-performance operational, membership, competition, and financial metrics across configurable date ranges.
2. Enforces strict multi-tenant data isolation across all queries, aggregations, and export endpoints.
3. Implements role-based metric visibility according to existing centralized permissions (`MANAGE_REPORTS` and `MANAGE_PAYMENTS`).
4. Hardens cross-club boundary checks to eliminate tenant leakage or cross-user visibility.
5. Introduces a comprehensive mobile analytics interface integrated into the existing club navigation.

---

## 2. Codebase Audit & Existing Capabilities

### 2.1 Existing Dashboard Aggregation
- **Location**: `ClubService.get_dashboard_summary` in `backend/app/services/club_service.py` (lines 549–795).
- **Endpoint**: `GET /api/v1/clubs/{club_id}/dashboard` in `backend/app/api/v1/clubs.py`.
- **Current Behavior**:
  - Computes point-in-time and "today" metrics (memberships, today's confirmed bookings, upcoming tournaments/leagues/events/lessons, and total staff).
  - Conditionally includes `payments` summary only if `has_permission(caller_role, Permission.MANAGE_PAYMENTS)`.
  - Uses database-level SQL `func.count` and `func.coalesce(func.sum(...), 0)`.
- **Gaps**:
  - Fixed time window ("today" or "upcoming") with no historical date range filtering (7d, 30d, 90d, custom).
  - No court utilization percentage calculation (does not account for court counts or operating hours).
  - No cancellation rate or status-by-status booking distributions.
  - No membership plan enrollment breakdown or historical growth metrics.
  - No payment method breakdowns or daily revenue time-series.
  - No CSV data export capability.

### 2.2 Domain Models & Status Enums
- **Bookings (`Booking`)**:
  - Statuses: `CONFIRMED`, `CANCELLED`, `COMPLETED` (`BookingStatus`).
  - Timestamps: `start_at` (timestamptz), `end_at` (timestamptz), `created_at` (timestamptz), `cancelled_at` (timestamptz).
  - Financials: `price_per_hour` (Numeric(10,2)), `total_price` (Numeric(10,2)), `currency`.
  - Scoping: `club_id` (UUID, indexed).
- **Courts (`Court`)**:
  - Status: `ACTIVE`, `INACTIVE` (`CourtStatus`).
  - Scoping: `club_id` (UUID, indexed).
- **Clubs (`Club`)**:
  - Operating fields: `opening_time` (Time), `closing_time` (Time), `timezone` (String, default "UTC"), `operating_hours` (JSON).
- **Player Memberships (`ClubPlayerMembership`)**:
  - Statuses: `ACTIVE`, `INACTIVE`, `SUSPENDED`, `EXPIRED` (`PlayerMembershipStatus`).
  - Timestamps: `joined_at`, `expires_at`, `created_at`.
  - Scoping: `club_id` (UUID, indexed).
- **Membership Requests (`ClubMembershipRequest`)**:
  - Statuses: `PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN` (`MembershipRequestStatus`).
  - Scoping: `club_id` (UUID, compound index with status).
- **Subscriptions & Plans (`MemberSubscription`, `MembershipPlan`)**:
  - Plan statuses: `ACTIVE`, `INACTIVE` (`PlanStatus`).
  - Subscription statuses: `SCHEDULED`, `ACTIVE`, `EXPIRED`, `CANCELLED` (`SubscriptionStatus`).
  - Scoping: `club_id` (UUID, indexed).
- **Payments (`Payment`)**:
  - Statuses: `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED` (`PaymentStatus`).
  - Methods: `CASH`, `BANK_TRANSFER`, `ONLINE`, `OTHER` (`PaymentMethod`).
  - Money: `amount` (Numeric(10, 2) — strictly Decimal), `currency` (String(3)).
  - Scoping: `club_id` (UUID, indexed).
- **Competitions (`Tournament`, `League`)**:
  - Tournament formats: `round_robin`, `pool_play`, `scramble`, `bracket` (strictly 4 formats).
  - Tournament statuses: `DRAFT`, `REGISTRATION_OPEN`, `REGISTRATION_CLOSED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
  - League statuses: `DRAFT`, `REGISTRATION_OPEN`, `REGISTRATION_CLOSED`, `IN_PROGRESS`, `PLAYOFFS`, `COMPLETED`, `CANCELLED`.
- **Community Activities (`Event`, `Lesson`)**:
  - Event statuses: `DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED`.
  - Lesson statuses: `DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED`.

### 2.3 Role & Permission Definitions
- **Staff Roles**: Strictly three roles: `club_owner`, `club_manager`, `tournament_director`.
- **Permissions**:
  - `Permission.MANAGE_REPORTS`: Granted to `club_owner` and `club_manager`. Denied to `tournament_director`.
  - `Permission.MANAGE_PAYMENTS`: Granted to `club_owner` and `club_manager`. Denied to `tournament_director`.
  - `tournament_director`: Only granted competition management (`MANAGE_TOURNAMENTS`, `MANAGE_LEAGUES`, matches, scores, standings, results, schedules). Cannot access club reports, member lists, or payments.
  - Players: No staff permissions. Direct API calls to staff endpoints yield `403 Forbidden`.

### 2.4 Platform Administration Audit
- **Audit Result**: Inspection of `User` model (`app/models/user.py`), permissions (`app/permissions/__init__.py`), and route dependencies reveals **no** platform administrator role, superuser flag, or global administration interface.
- **Architecture Mandate**: Per Section 6, we do NOT invent a platform administrator role or grant platform-wide access to any club staff role. Platform-wide private analytics are formally documented as deferred.

### 2.5 Database Query Performance & Indexes
- All core reporting entities contain B-tree indexes on `club_id` and timestamp columns (`created_at`, `start_at`).
- Aggregations leverage PostgreSQL/SQLite native `COUNT()`, `SUM()`, and conditional filtering `CASE WHEN ...` or `.filter(...)` to compute metrics inside the database engine without fetching large record sets into application memory.

---

## 3. Metric Definitions & Timestamp Semantics

### 3.1 Date Boundaries & Timezone Semantics
- **Supported Ranges**:
  - `7d`: Today minus 6 days through end of today (7 full calendar days).
  - `30d`: Today minus 29 days through end of today (30 full calendar days).
  - `90d`: Today minus 89 days through end of today (90 full calendar days).
  - `custom`: Client-specified `start_date` and `end_date` (ISO `YYYY-MM-DD`).
- **Validation**:
  - `start_date <= end_date`.
  - Maximum window size: 366 days (prevents denial-of-service via unbounded date scans).
  - Reject future start dates where end date is in the past.
- **Club Timezone Normalization**:
  - Club configured timezone string (e.g. `"America/New_York"`, `"Asia/Kolkata"`, fallback `"UTC"`).
  - Start boundary: `start_date` at `00:00:00.000000` in club's timezone, converted to UTC `datetime`.
  - End boundary: `end_date` at `23:59:59.999999` in club's timezone, converted to UTC `datetime`.
  - Inclusion is strictly `[start_datetime_utc, end_datetime_utc]`.

### 3.2 Bookings & Court Utilization
- **Total Bookings**: Count of bookings with `start_at >= start_utc` and `start_at <= end_utc`.
- **Status Counts**:
  - `confirmed_count`: `status == BookingStatus.CONFIRMED` and `end_at >= now`.
  - `completed_count`: `status == BookingStatus.COMPLETED` or (`status == BookingStatus.CONFIRMED` and `end_at < now`).
  - `cancelled_count`: `status == BookingStatus.CANCELLED`.
- **Upcoming Bookings**: Confirmed bookings where `start_at >= now`.
- **Court Utilization Rate**:
  - **Denominator**: Total available court minutes in the period = `(number_of_active_courts) * (daily_operating_minutes) * (number_of_days_in_period)`.
    - Daily operating minutes calculated from club `opening_time` and `closing_time` (e.g. 06:00 to 22:00 = 16 hours = 960 minutes/day). Fallback to 16 hours/day if times are identical or unavailable.
  - **Numerator**: Total booked minutes of confirmed and completed bookings within the period.
  - **Formula**: `min(100.0, round((booked_minutes / available_minutes) * 100, 1))` if `available_minutes > 0` else `0.0%`.
- **Cancellation Rate**:
  - **Formula**: `round((cancelled_count / total_bookings) * 100, 1)` if `total_bookings > 0` else `0.0%`.

### 3.3 Memberships & Subscriptions
- **Total Player Memberships**: Count of all `ClubPlayerMembership` records in the club.
- **Status Breakdown**: Counts for `active`, `inactive`, `suspended`, `expired`.
- **New Memberships**: Count of memberships where `joined_at >= start_utc` and `joined_at <= end_utc`.
- **Subscriptions**:
  - `active_subscriptions`: `MemberSubscription.status == SubscriptionStatus.ACTIVE`.
  - `expired_subscriptions`: `MemberSubscription.status == SubscriptionStatus.EXPIRED`.
- **Plan Enrollments**: Distribution of active subscriptions by `MembershipPlan.name`.
- **Pending Membership Requests**: Count of `ClubMembershipRequest.status == MembershipRequestStatus.PENDING`.

### 3.4 Payments & Financial Summaries
- **Access Rule**: Requires `Permission.MANAGE_PAYMENTS`. Omitted / 403 for unauthorized users.
- **Timestamp Filter**: Evaluated on `Payment.created_at >= start_utc` and `Payment.created_at <= end_utc`.
- **Arithmetic**: Python `Decimal` and SQL `Numeric(10, 2)` throughout. Zero binary floating-point conversions.
- **Metrics**:
  - `total_collected_amount`: SQL `SUM(Payment.amount)` for `Payment.status == PaymentStatus.SUCCEEDED`.
  - `succeeded_count`: Count of succeeded payments.
  - `pending_amount`: SQL `SUM(Payment.amount)` for `Payment.status == PaymentStatus.PENDING`.
  - `pending_count`: Count of pending payments.
  - `failed_amount`: SQL `SUM(Payment.amount)` for `Payment.status == PaymentStatus.FAILED`.
  - `failed_count`: Count of failed payments.
  - `by_method`: Succeeded amount and count grouped by `PaymentMethod` (`cash`, `bank_transfer`, `online`, `other`).
- **Revenue Invariants**:
  - Pending, failed, or cancelled payments are NEVER counted as collected revenue.
  - Subscription payments are atomic records in `payments`; no double-counting occurs.

### 3.5 Competitions & Community Activities
- **Tournaments**:
  - Upcoming / in-progress vs completed vs cancelled.
  - Total registrations across club tournaments.
- **Leagues**:
  - Upcoming / in-progress vs completed vs cancelled.
  - Registered teams count.
- **Events & Lessons**:
  - Published upcoming vs completed vs cancelled.
  - Registrations count.

---

## 4. Tenant-Isolation Hardening Strategy

1. **Club Scope Enforcement**:
   - Every analytics and export query explicitly filters on `Entity.club_id == authorized_club_id`.
   - Never trust client-supplied filter parameters for tenant context.
2. **Centralized Membership Dependency**:
   - Every endpoint uses `Depends(require_permission(Permission.MANAGE_REPORTS))`.
   - Payment-specific reports and export endpoints additionally require `Depends(require_permission(Permission.MANAGE_PAYMENTS))`.
3. **Cross-Tenant Attack Prevention**:
   - Attempting to access Club B data while authenticated as Club A staff returns `403 Forbidden` ("You are not a member of this club").
   - Querying another club's `court_id` or `plan_id` in filters produces empty/zero results scoped only to the authorized club, never leaking foreign records.
4. **Formula Injection Defense in CSV Exports**:
   - Any cell value beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` is sanitized by prepending `'` (single quote) to prevent spreadsheet code execution.

---

## 5. API Endpoint Architecture

All reporting endpoints live under `/api/v1/clubs/{club_id}/analytics`:

1. `GET /api/v1/clubs/{club_id}/analytics/summary`
   - Returns aggregated overview containing bookings, memberships, competitions, community, optional payments (if permitted), and daily time series.
2. `GET /api/v1/clubs/{club_id}/analytics/bookings`
   - Detailed court utilization, status distribution, day-of-week breakdown.
3. `GET /api/v1/clubs/{club_id}/analytics/memberships`
   - Detailed player membership status, new member growth, plan enrollment distribution.
4. `GET /api/v1/clubs/{club_id}/analytics/competitions`
   - Detailed tournament and league participation and outcomes.
5. `GET /api/v1/clubs/{club_id}/analytics/payments`
   - Detailed financial metrics and payment method aggregations (requires `MANAGE_PAYMENTS`).
6. `GET /api/v1/clubs/{club_id}/analytics/export`
   - Streams CSV files for `report_type` (`bookings`, `memberships`, `payments`).

---

## 6. Mobile Analytics UI Specification

- **Screen**: `mobile/app/(club)/analytics.tsx`
- **Layout Registration**: `mobile/app/(club)/_layout.tsx`
- **Drawer Menu**: Added under `MANAGEMENT` in `mobile/src/navigation/navigationConfig.ts` with permission `canManageReports`.
- **UI Elements**:
  - Active club header with timezone indicator.
  - Date preset selector: `7 Days`, `30 Days`, `90 Days`, `Custom`.
  - KPI Summary Cards:
    - Total Bookings & Court Utilization %.
    - Active Members & New Members Joined.
    - Competitions & Events.
    - Financial Card (only rendered when `canManagePayments` is true).
  - Tabbed detail views: Overview, Bookings, Memberships, Competitions, Financials.
  - CSV Export trigger button.
  - Immediate refetch and state reset when active club changes.

---

## 7. Validation & Verification Results

### 7.1 Dedicated Phase 9 Automated Test Suite
- **File**: `backend/tests/test_phase9_analytics.py`
- **Command**: `venv\Scripts\python.exe -m pytest tests/test_phase9_analytics.py -v`
- **Result**: **14 passed** in 7.52 seconds.
- **Scenarios Verified**:
  - `test_cross_club_isolation_on_summary`: Verified Club B owner cannot retrieve Club A analytics (HTTP 403).
  - `test_manager_can_access_summary_td_denied`: Verified Manager can access reports while Tournament Director is denied (HTTP 403).
  - `test_regular_player_cannot_access_analytics`: Verified player role receives HTTP 403.
  - `test_unauthenticated_cannot_access_analytics`: Verified unauthenticated caller receives HTTP 401.
  - `test_payment_analytics_strictly_requires_manage_payments`: Verified payment report permission gating.
  - `test_booking_metrics_accuracy_and_isolation`: Verified booking counts and isolation across clubs.
  - `test_membership_metrics_accuracy_and_isolation`: Verified membership/subscription calculations and zero cross-club leakage.
  - `test_payment_metrics_decimal_accuracy_and_revenue_invariants`: Verified Decimal arithmetic and pending/failed exclusions.
  - `test_competition_and_community_metrics`: Verified tournament, league, event, and lesson status aggregations.
  - `test_export_csv_bookings_and_isolation`: Verified CSV export structure, streaming, and isolation.
  - `test_export_csv_payments_requires_manage_payments`: Verified payment export permission checking.
  - `test_export_formula_injection_defense`: Verified CSV values starting with `=cmd|` are sanitized to `'=cmd|`.
  - `test_custom_date_range_validation`: Verified boundary checks (rejecting `start_date > end_date` with HTTP 422).
  - `test_summary_payment_field_conditional_rendering`: Verified payments omitted for roles without payment access.

### 7.2 Full Repository Regression Test Suite
- **Command**: `venv\Scripts\python.exe -m pytest tests`
- **Result**: **846 passed, 0 failed, 11 deprecation warnings** in 2896.11s.
- **Regression Verification**: 100% pass rate across all existing domains (bookings, tournaments, round-robin, scramble, pool play, brackets, leagues, memberships, payments, websockets, and scheduling).

### 7.3 Database Migrations Check
- **Command**: `venv\Scripts\python.exe -m alembic check`
- **Result**: Clean (`No new upgrade operations detected. Current head revision: becbd8891115`).

### 7.4 Mobile Static Analysis & Linting
- **TypeScript**: `npx tsc --noEmit` -> **0 errors**.
- **ESLint**: `npm run lint` -> **0 errors** (575 preexisting warnings, 0 in Phase 9 files).

---

## 8. Scope Boundaries & Deferred Features

- **Platform-Wide Administration**: Verified that the platform does not possess a global admin/superuser model. Per Phase 9 specifications, platform-wide private administrative analytics are formally deferred rather than inventing an artificial role.
- **External Payment Gateways**: Internal payment records remain the sole basis for internal payment tracking. External payment gateway integration and automatic recurring billing remain outside Phase 9 scope.
- **Future Phases**: Phase 10 and subsequent phases remain untouched.

