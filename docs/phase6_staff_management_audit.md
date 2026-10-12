# Phase 6: Club Owner Dashboard, Staff Management & Role-Based Permissions — Audit & Implementation Report

## 1. Executive Summary

This document captures the codebase audit and implementation report for Phase 6 of the Aught2 Pickleball multi-club SaaS platform.

Phase 6 delivers a polished, production-oriented Club Owner Dashboard, club-scoped staff management, and consistent server-enforced role-based permissions across both the mobile application (Expo / React Native / TypeScript) and backend (FastAPI / SQLAlchemy 2.x async / PostgreSQL).

---

## 2. Existing Architecture & Components Discovered

### A. Data Models & Database Schema
1. **`Club` (`clubs` table)**:
   - Primary tenant root. Contains club metadata (`name`, `slug`, `logo_url`, `is_active`, `opening_time`, `closing_time`, etc.).
2. **`ClubMembership` (`club_memberships` table)**:
   - Represents staff membership in a club.
   - Unique constraint: `uq_club_memberships_user_club` on `(user_id, club_id)`.
   - **Crucial Architecture Rule**: The staff `role` belongs strictly to `ClubMembership.role`, NOT to the global `User` record. A user can have different staff roles in different clubs and can also be a player.
   - Valid roles:
     - `club_owner`
     - `club_manager`
     - `tournament_director`
   - Soft deactivation flag: `is_active: bool`.
3. **`ClubPlayerMembership` (`club_player_memberships` table)**:
   - Represents club player enrollment/facility roster membership (separate from administrative staff memberships).
4. **`ClubMembershipRequest` (`club_membership_requests` table)**:
   - Player membership approval/rejection lifecycle (`PENDING`, `APPROVED`, `REJECTED`).
5. **Operational Models**:
   - `Booking` (`bookings` table): court reservations (`status: confirmed, cancelled, completed`).
   - `Court` (`courts` table): court facility resources (`status: active, inactive`).
   - `Tournament` (`tournaments` table): tournament competitions (`status: draft, registration_open, in_progress, etc.`).
   - `League` (`leagues` table): league competitions (`status: draft, registration_open, in_progress, etc.`).
   - `Event` (`events` table): clinics, social mixers (`status: draft, published, cancelled, completed`).
   - `Lesson` (`lessons` table): coaching sessions (`status: draft, published, cancelled, completed`).
   - `Payment` (`payments` table): internal transaction domain (`status: pending, succeeded, failed, cancelled`).

### B. Centralized Permission System
- Location: `backend/app/permissions/__init__.py`.
- **FastAPI Dependencies** (`backend/app/api/deps.py`):
  - `get_club_membership`: Resolves user's membership for target `club_id`. Returns 404 if club not found, 403 if user is not an active member.
  - `require_permission(permission: Permission)`: Validates that `membership.role` has the required permission via `has_permission(membership.role, permission)` or returns `403 Forbidden`.

### C. Existing Staff Management Endpoints & Service
- In `backend/app/api/v1/clubs.py` & `ClubService`:
  - `GET /{club_id}/members`: Lists staff members (requires `MANAGE_MEMBERS`).
  - `POST /{club_id}/members`: Adds staff member (requires `MANAGE_ROLES`, Club Owner only).
  - `PATCH /{club_id}/members/{membership_id}`: Updates staff role or active status (requires `MANAGE_ROLES`). Enforces Owner Safety Rules (cannot demote or deactivate final active owner).
  - `DELETE /{club_id}/members/{membership_id}`: Soft-deactivates staff member (requires `MANAGE_ROLES`). Enforces Owner Safety Rules.

### D. Existing Mobile Implementation
- `mobile/app/(club)/index.tsx`:
  - Club home screen displaying hero carousel, quick actions grid, today's schedule, and 4 stat cards.
  - Prior implementation loaded entire arrays into memory from 4 separate queries (`useClubPlayerMembers`, `useClubStaffBookings`, `useClubEvents`, `useClubTournaments`) to compute `.length`, and hardcoded greeting text.
- `mobile/app/(club)/members.tsx`:
  - Rich member management screen with tab toggle between Players and Staff.
  - Staff tab supports search, role badge display, Add Staff modal, Edit Role modal, and Disable/Enable button.
- `mobile/src/hooks/useActiveClub.ts` & `usePermission.ts`:
  - Manages active club selection in Zustand (`useAuthStore`).
  - Automatically derives permissions from active club role.
  - Supports switching clubs and invalidating TanStack Query cache.

---

## 3. Gap Analysis & What Was Missing

1. **Missing Backend Dashboard Summary Endpoint**:
   - There was NO dedicated server-side aggregation endpoint for club metrics.
   - The mobile dashboard was performing 4 heavy sequential/parallel queries that downloaded all records over the network just to count them.
   - Missing metrics: Active players vs total players, pending membership requests, today's vs upcoming bookings, upcoming leagues, upcoming lessons, pending payment amount/count, staff count.
   - Solution: Implement `GET /api/v1/clubs/{club_id}/dashboard` returning `ClubDashboardResponse` with high-performance SQL `func.count()` and `func.sum()` queries scoped to `club_id`.

2. **Missing Individual Staff Detail Endpoint**:
   - There was no `GET /api/v1/clubs/{club_id}/members/{membership_id}` endpoint to fetch a single staff member's details.
   - Solution: Implement `GET /api/v1/clubs/{club_id}/members/{membership_id}` returning `MemberResponse`.

3. **Filtering & Search on Staff Listing**:
   - `GET /api/v1/clubs/{club_id}/members` did not accept optional `role`, `search`, or `is_active` query filters.
   - Solution: Add optional query params `role`, `search`, `is_active` to `list_club_members`.

4. **Mobile Dashboard Integration**:
   - Update `mobile/app/(club)/index.tsx` to consume the single server-aggregated `useClubDashboard` hook.
   - Replace hardcoded greetings with active club name (`clubName`).
   - Add rich operational metric cards for Memberships (with pending request indicator), Bookings, Competitions, Community, Payments (permission-gated), and Staff.
   - Ensure clean empty states and zero-value handling for newly created clubs.

5. **Confirmation Dialogs & Final Owner Safety UI**:
   - Ensure role changes in `members.tsx` require an explicit confirmation alert before executing mutations.

---

## 4. Role and Permission Matrix

| Capability / Resource | Club Owner (`club_owner`) | Club Manager (`club_manager`) | Tournament Director (`tournament_director`) |
| :--- | :---: | :---: | :---: |
| **Club Dashboard Summary** | Full (including Payments) | Full (including Payments) | Competitions & Operations (Payments hidden) |
| **View Staff Members** | Allowed (`MANAGE_MEMBERS`) | Allowed (`MANAGE_MEMBERS`) | Denied (403) |
| **View Single Staff Detail** | Allowed (`MANAGE_MEMBERS`) | Allowed (`MANAGE_MEMBERS`) | Denied (403) |
| **Add / Invite Staff** | Allowed (`MANAGE_ROLES`) | Denied (403) | Denied (403) |
| **Change Staff Roles** | Allowed (`MANAGE_ROLES`) | Denied (403) | Denied (403) |
| **Deactivate / Remove Staff** | Allowed (`MANAGE_ROLES`) | Denied (403) | Denied (403) |
| **Protect Final Owner** | Server-enforced (400) | N/A (Cannot edit roles) | N/A (Cannot edit roles) |
| **Court Bookings Management** | Allowed | Allowed | Denied |
| **Payment Summaries** | Allowed (`MANAGE_PAYMENTS`) | Allowed (`MANAGE_PAYMENTS`) | Denied (Omitted from Dashboard) |
| **Tournament / League Mgmt** | Allowed | Allowed | Allowed (`MANAGE_TOURNAMENTS`) |
| **Cross-Club Tenant Isolation** | Strict (404/403) | Strict (404/403) | Strict (404/403) |

---

## 5. Implemented Changes

### A. Backend Schemas (`backend/app/schemas/club.py` & `__init__.py`)
Added high-performance typed Pydantic models for dashboard aggregation:
- `DashboardMembershipsSummary`: `total_players`, `active_players`, `pending_requests`.
- `DashboardBookingsSummary`: `today_count`, `upcoming_count`.
- `DashboardCompetitionsSummary`: `active_tournaments`, `active_leagues`.
- `DashboardTodayScheduleItem`: `id`, `court_name`, `start_time`, `end_time`, `player_name`, `booking_type`.
- `DashboardEventsLessonsSummary`: `upcoming_events`, `upcoming_lessons`.
- `DashboardPaymentsSummary`: `pending_count`, `pending_amount`, `currency`.
- `DashboardStaffSummary`: `total_staff`, `active_staff`.
- `ClubDashboardResponse`: Aggregated response envelope containing `club_id`, `club_name`, timestamps, and all sub-summaries.

### B. Backend Services (`backend/app/services/club_service.py`)
- **`get_dashboard_summary(club_id, caller_role)`**:
  - Implemented single-club scoped aggregation using SQLAlchemy `func.count()` and `func.sum()`.
  - Zero N+1 queries: performs targeted aggregate queries directly in the database.
  - Role-scoped data projection: If the caller role does not possess `Permission.MANAGE_PAYMENTS` (e.g., `tournament_director`), `payments` is safely returned as `None`.
  - Zero-state resilience: Returns clean zeros and empty schedule lists for newly registered clubs.
- **`get_member(club_id, membership_id)`**:
  - Fetches a single staff membership strictly scoped to `club_id`.
  - Raises 404 if the membership belongs to another club.
- **`list_members(club_id, role, search, is_active)`**:
  - Updated to support optional query filtering by role (`ClubRole`), case-insensitive email search, and active status.

### C. Backend API Routes (`backend/app/api/v1/clubs.py`)
- `GET /api/v1/clubs/{club_id}/dashboard`:
  - Protected by `get_club_membership` and active membership checks.
  - Returns `ClubDashboardResponse`.
- `GET /api/v1/clubs/{club_id}/members/{membership_id}`:
  - Protected by `require_permission(Permission.MANAGE_MEMBERS)`.
  - Returns `MemberResponse`.
- `GET /api/v1/clubs/{club_id}/members`:
  - Added query parameters: `role: ClubRole | None`, `search: str | None`, `is_active: bool | None`.

### D. Mobile Frontend (`mobile/`)
- **Types** (`mobile/src/types/index.ts`):
  - Defined TypeScript interfaces for `ClubDashboardResponse` and all sub-metrics.
- **Endpoints & Query Keys** (`mobile/src/constants/index.ts`):
  - Added `API_ENDPOINTS.CLUB_DASHBOARD` and `API_ENDPOINTS.CLUB_MEMBER_DETAIL`.
  - Added `QUERY_KEYS.CLUB_DASHBOARD` and `QUERY_KEYS.CLUB_MEMBER_DETAIL`.
- **API Services** (`mobile/src/services/api/clubs.ts`):
  - Added `getClubDashboard(clubId)` and `getClubMemberDetail(clubId, membershipId)`.
- **TanStack Query Hooks** (`mobile/src/hooks/useClubDashboard.ts` & `hooks/index.ts`):
  - Added `useClubDashboard(clubId)` with stale time, refetch, and error handling.
- **Club Dashboard UI** (`mobile/app/(club)/index.tsx`):
  - Replaced client-side array-length counting with `useClubDashboard`.
  - Replaced hardcoded greetings with active club name (`clubName`).
  - Added Pending Membership Requests alert banner with direct navigation to requests.
  - Added Primary Metrics card grid (Active Players, Today's Bookings, Active Competitions, Community Events/Lessons).
  - Added Financial & Staff Overview card grid (Pending Payments, Active Staff Count).
  - Handles pull-to-refresh with query cache invalidation.
- **Staff Management UI** (`mobile/app/(club)/members.tsx`):
  - Added confirmation dialog (`Alert.alert`) prior to submitting staff role changes.

---

## 6. Endpoints Matrix

| HTTP Method | Route | Permission Required | Response Model | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/clubs/{club_id}/dashboard` | Active Club Member | `ClubDashboardResponse` | Server-aggregated metrics for active club |
| `GET` | `/api/v1/clubs/{club_id}/members` | `MANAGE_MEMBERS` | `list[MemberResponse]` | Lists staff with optional role/search filters |
| `GET` | `/api/v1/clubs/{club_id}/members/{membership_id}` | `MANAGE_MEMBERS` | `MemberResponse` | Single staff member detail |
| `POST` | `/api/v1/clubs/{club_id}/members` | `MANAGE_ROLES` (Owner) | `MemberResponse` | Adds staff member with role assignment |
| `PATCH` | `/api/v1/clubs/{club_id}/members/{membership_id}` | `MANAGE_ROLES` (Owner) | `MemberResponse` | Updates staff role or active state |
| `DELETE` | `/api/v1/clubs/{club_id}/members/{membership_id}` | `MANAGE_ROLES` (Owner) | `None` (204) | Soft-deactivates staff member |

---

## 7. Files Changed

### Backend
1. `backend/app/schemas/club.py`: Added dashboard Pydantic response models.
2. `backend/app/schemas/__init__.py`: Exported `ClubDashboardResponse`.
3. `backend/app/services/club_service.py`: Implemented `get_dashboard_summary`, `get_member`, and enhanced `list_members`.
4. `backend/app/api/v1/clubs.py`: Added dashboard and member detail endpoints; added filter parameters to `list_club_members`.
5. `backend/tests/test_phase6_staff_and_dashboard.py`: Comprehensive test suite with 16 integration tests.

### Mobile Frontend
1. `mobile/src/types/index.ts`: Added `ClubDashboardResponse` and sub-interfaces.
2. `mobile/src/constants/index.ts`: Added API endpoints and query keys for dashboard and member detail.
3. `mobile/src/services/api/clubs.ts`: Added `getClubDashboard` and `getClubMemberDetail`.
4. `mobile/src/hooks/useClubDashboard.ts`: Created TanStack Query hook for dashboard metrics.
5. `mobile/src/hooks/index.ts`: Re-exported `useClubDashboard`.
6. `mobile/app/(club)/index.tsx`: Updated dashboard home screen with server-aggregated metrics, dynamic club name, and pending request alert.
7. `mobile/app/(club)/members.tsx`: Added confirmation dialog for staff role edits.

### Documentation
1. `docs/phase6_staff_management_audit.md`: Created and updated audit and completion report.

---

## 8. Database & Migration Status

- **Database Changes**: No new tables or schema changes were required. All functionality reuses existing tables (`clubs`, `club_memberships`, `club_player_memberships`, `club_membership_requests`, `bookings`, `tournaments`, `leagues`, `events`, `lessons`, `payments`).
- **Alembic Drift Check**: Executed `python -m alembic check`.
  - Output: `No new upgrade operations detected.` (Exit Code 0).

---

## 9. Test Execution & Actual Results

### A. Phase 6 Dedicated Integration Suite
Command: `venv\Scripts\pytest tests/test_phase6_staff_and_dashboard.py -v`
Result: **16 passed in 7.25s (100% pass rate)**.
Covered:
- `test_club_owner_can_manage_staff_in_own_club`: Passed.
- `test_club_owner_cannot_manage_staff_in_another_club`: Passed.
- `test_club_manager_cannot_assign_roles_or_self_promote`: Passed.
- `test_tournament_director_cannot_manage_staff_or_payments`: Passed.
- `test_player_cannot_access_staff_endpoints`: Passed.
- `test_user_with_different_roles_in_different_clubs`: Passed.
- `test_invalid_role_rejected`: Passed.
- `test_duplicate_active_staff_rejected`: Passed.
- `test_final_owner_protection_against_demotion_and_deactivation`: Passed.
- `test_multiple_owners_allows_demoting_non_final_owner`: Passed.
- `test_get_single_staff_member_detail`: Passed.
- `test_staff_listing_filters_by_role_and_search`: Passed.
- `test_dashboard_metrics_aggregation_and_tenant_isolation`: Passed.
- `test_empty_club_returns_valid_zero_dashboard_summary`: Passed.
- `test_tournament_director_receives_dashboard_with_hidden_payments`: Passed.
- `test_unauthorized_user_cannot_access_club_dashboard`: Passed.

### B. Full Backend Test Suite
Command: `venv\Scripts\pytest tests`
Result: **800 passed, 0 failures, 11 warnings in 810.02s (13m 30s)**.
All 800 tests across all modules (auth, clubs, bookings, courts, competitions, brackets, scrambles, leagues, payments, websockets, startup) passed.

### C. Mobile TypeScript Compilation
Command: `npx tsc --noEmit`
Result: **Exit code 0. Zero errors.**

### D. Mobile Lint
Command: `npm run lint`
Result: **Exit code 0. Zero errors** (575 pre-existing warnings in unrelated files, 0 errors).

---

## 10. Security & Tenant-Isolation Verification

1. **Strict Tenant Isolation**:
   - Every database query for dashboard metrics filters strictly by `club_id`.
   - In cross-club integration tests, resources belonging to Club Beta (members, bookings, tournaments, payments) were verified to NEVER appear in Club Alpha's dashboard.
   - Non-members attempting to view another club's dashboard receive `403 Forbidden` or `404 Not Found`.

2. **Server-Side Role Authority**:
   - Roles and permissions are resolved server-side from `ClubMembership` associated with the JWT user ID and target `club_id`.
   - Mobile client-supplied parameters cannot bypass permission checks.

3. **Final-Owner Protection**:
   - The backend guarantees that an active club always retains at least one active `club_owner`.
   - Attempts by an owner to demote themselves or deactivate themselves when they are the sole owner are blocked with `400 Bad Request` ("Cannot remove or demote the only active club owner").

4. **Least Privilege Data Hiding**:
   - Roles lacking `MANAGE_PAYMENTS` (such as `tournament_director`) do not receive financial figures (`payments: null`) on the dashboard response.

---

## 11. Known Limitations & Deferred Work

1. **Ownership Transfer**:
   - Full legal club ownership transfer between distinct entities is deferred to a future billing/legal admin phase. Multi-owner support is supported safely within existing models.
2. **Advanced Analytics**:
   - Historical time-series charts, revenue retention cohorts, and utilization percentage analytics are deferred to future reporting phases in accordance with strict Phase 6 scope boundaries.
