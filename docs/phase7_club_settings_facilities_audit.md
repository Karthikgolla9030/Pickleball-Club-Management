# Phase 7: Club Settings, Operating Hours & Facility Configuration — Codebase Audit & Implementation Report

## 1. Executive Summary

This document captures the codebase audit and implementation report for Phase 7 of the Aught2 Pickleball multi-club SaaS platform.
Phase 7 delivers a complete, production-grade, mobile-friendly club settings and facility management experience. Each club maintains its own profile, independent day-of-week operating hours, facility details, and court configuration, fully integrated with the existing booking engine and centralized authorization system.

---

## 2. Existing Architecture & Components Audit

### A. Club Model & Profile Management
- **Model**: `Club` (`backend/app/models/club.py` mapped to table `clubs`).
- **Profile & Location Fields**:
  - Identity: `name`, `slug` (unique), `logo_url`, `short_description`, `description`, `is_active`.
  - Contact: `contact_email`, `contact_phone`, `website`, `established_year`.
  - Location: `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`.
  - Operating summary: `operating_days` (string e.g. "Monday - Sunday"), `opening_time` (`Time`, default 06:00), `closing_time` (`Time`, default 22:00), `timezone` (`String(50)`, default "UTC"), `holiday_closure_notes`, `facilities_summary`.
  - Timestamps: `created_at`, `updated_at`.
- **Existing Endpoints** (`backend/app/api/v1/clubs.py`):
  - `GET /api/v1/clubs`: Lists clubs for the authenticated user with membership roles.
  - `POST /api/v1/clubs`: Creates club and assigns creator as initial `club_owner`.
  - `GET /api/v1/clubs/{club_id}`: Retrieves full club details for active members.
  - `GET /api/v1/clubs/{club_id}/public`: Safe public representation for player discovery.
  - `PATCH /api/v1/clubs/{club_id}`: Updates club profile, location, and operating summary (`Permission.MANAGE_CLUB`, Owner only).
  - `POST /api/v1/clubs/{club_id}/logo`: Uploads or updates base64/URL logo (`Permission.MANAGE_CLUB`).

### B. Court & Facility Management
- **Model**: `Court` (`backend/app/models/court.py` mapped to table `courts`).
  - Fields: `id`, `club_id` (FK to `clubs.id` CASCADE), `name`, `display_name`, `description`, `court_number`, `surface_type`, `indoor_outdoor` (`CourtEnvironment`: INDOOR, OUTDOOR, COVERED), `status` (`CourtStatus`: ACTIVE, INACTIVE), `is_active` (`bool`), `display_order` (`int`), `price_per_hour` (`Decimal`), `created_at`, `updated_at`.
  - Table Constraints:
    - Unique `(club_id, court_number)` (`uq_courts_club_court_number`).
    - Unique `(club_id, name)` (`uq_courts_club_name`).
- **Existing Court Endpoints** (`backend/app/api/v1/courts.py`):
  - `GET /api/v1/clubs/{club_id}/courts`: Lists courts with optional status filter (`Permission.MANAGE_COURTS`, Owner & Manager).
  - `POST /api/v1/clubs/{club_id}/courts`: Creates a new court (`Permission.MANAGE_COURTS`).
  - `GET /api/v1/clubs/{club_id}/courts/{court_id}`: Gets single court details (`Permission.MANAGE_COURTS`).
  - `PATCH /api/v1/clubs/{club_id}/courts/{court_id}`: Updates court details (`Permission.MANAGE_COURTS`).
  - `POST/PATCH/DELETE /api/v1/clubs/{club_id}/courts/{court_id}/deactivate`: Soft-deactivates court (`is_active=False, status=INACTIVE`). Historical bookings remain intact.
  - `POST/PATCH /api/v1/clubs/{club_id}/courts/{court_id}/reactivate`: Reactivates court (`is_active=True, status=ACTIVE`).
  - `PATCH /api/v1/clubs/{club_id}/courts/reorder`: Reorders courts by `display_order`.
  - `GET /api/v1/clubs/{club_id}/courts/active`: Player-facing read-only active courts list.

### C. Booking Engine & Operating Hours Logic
- **Configuration** (`backend/app/core/booking_config.py`):
  - `DEFAULT_CLUB_OPENING_TIME = time(6, 0)`
  - `DEFAULT_CLUB_CLOSING_TIME = time(22, 0)`
  - `DEFAULT_BOOKING_DURATION_MINUTES = 60`
  - `ALLOWED_BOOKING_DURATIONS = {30, 60, 90, 120}`
  - `MIN_SLOT_INTERVAL_MINUTES = 30`
  - `DEFAULT_BOOKING_HORIZON_DAYS = 14`
  - `DEFAULT_MAX_ACTIVE_BOOKINGS_PER_PLAYER = 3`
  - `DEFAULT_CANCELLATION_WINDOW_HOURS = 2`
- **Validation** (`backend/app/services/booking_service.py`):
  - `_validate_time_boundaries`:
    - Normalizes datetimes to UTC.
    - Enforces future booking and advance horizon.
    - Validates duration in `ALLOWED_DURATIONS_MINUTES`.
    - Validates clean slot boundaries (00 or 30 min, 00 sec).
    - Checks operating hours against effective opening and closing times in club's timezone.
    - Enforces that bookings cannot cross calendar day boundaries (except closing at midnight).
  - `get_club_availability`:
    - Generates discrete time slots from opening to closing on `target_date`.
    - Checks overlap against confirmed bookings and scheduled competition matches.
- **Concurrency & Integrity**:
  - `lock_court_for_update`: `SELECT ... FOR UPDATE` row locking on `Court`.
  - GiST exclusion constraint on PostgreSQL `bookings` table preventing temporal overlap on the same court.

### D. Centralized Authorization
- **Registry** (`backend/app/permissions/__init__.py`):
  - `ClubRole.CLUB_OWNER`: Has ALL permissions, including `MANAGE_CLUB` and `MANAGE_COURTS`.
  - `ClubRole.CLUB_MANAGER`: Has operational permissions (`MANAGE_COURTS`, `MANAGE_BOOKINGS`, `MANAGE_MEMBERS`), but NOT `MANAGE_CLUB`, `MANAGE_ROLES`, or `MANAGE_SETTINGS`.
  - `ClubRole.TOURNAMENT_DIRECTOR`: Strictly competition permissions (`MANAGE_TOURNAMENTS`, `MANAGE_LEAGUES`, etc.). Neither `MANAGE_CLUB` nor `MANAGE_COURTS`.
  - `Player`: Zero administrative staff permissions.

### E. Mobile UI Components & Screens
- `mobile/app/(club)/club-details.tsx`:
  - Full-featured Club Profile & Details screen (Name, logo, descriptions, contact, location, operating days/hours, timezone picker, facilities summary, holiday notes).
  - Segmented toggle between Edit Form and Live Player Preview.
  - Role-gated: Owner-only editing, manager read-only preview.
- `mobile/app/(club)/courts.tsx`:
  - Comprehensive Courts screen with Schedule view vs Management view.
  - Statistics row: Total, Active, Inactive courts.
  - Search and filter bar.
  - Add Court modal, Edit Court modal, Deactivation modal.
- `mobile/app/(club)/profile.tsx` & `settings.tsx`:
  - Profile hub linking to Club Details, Staff & Permissions, etc.

---

## 3. Implemented Changes & Architecture

### A. Database Schema & Alembic Migration
- Extended `Club` (`backend/app/models/club.py`):
  - Added `operating_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)`.
- Extended `Court` (`backend/app/models/court.py`):
  - Added `operating_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)`.
- Migration created: `backend/alembic/versions/b3c4d5e6f7a8_add_operating_hours_to_clubs_and_courts.py`
  - Revisions: down-revision `a2b3c4d5e6f7`.
  - Verified with `python -m alembic check`: **Exit Code 0 — No new upgrade operations detected.**

### B. Core Operating Hours Engine (`backend/app/core/operating_hours.py`)
- `DayOperatingHours`:
  - `is_closed: bool = False`
  - `open_time: time | None`
  - `close_time: time | None`
  - Pydantic validation:
    - If `is_closed=True`, `open_time` and `close_time` are cleared to `None`.
    - If `is_closed=False`, both `open_time` and `close_time` are required.
    - Prevents inverted or identical hours (`close_time <= open_time`, unless closing at midnight `00:00:00`).
    - Explicitly rejects overnight windows crossing midnight.
- `WeeklyOperatingHours`:
  - Typed mapping for all 7 days: `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday`.
- Resolution Hierarchy (`resolve_effective_operating_hours(target_date, club, court)`):
  1. Court Override: If `court.operating_hours` has a configured schedule for that day, use it.
  2. Club Weekly Schedule: If `club.operating_hours` has a configured schedule for that day, use it.
  3. Club Fallback: Fall back to `club.opening_time` and `club.closing_time` (or global defaults 07:00–22:00) with `is_closed=False`.

### C. Booking Engine Integration
- `BookingService._validate_time_boundaries`:
  - Accepts `is_closed: bool = False`. If day is closed, raises `HTTP 400 Bad Request ("Club / court is closed on this day")`.
  - Checks effective `open_time` and `close_time` for the target court and date.
- `BookingService.create_player_booking`:
  - Row-locks target court.
  - Resolves effective hours with court-level override.
  - Validates boundaries and operating window.
- `BookingService.create_staff_booking` & `create_maintenance_block`:
  - Respects court-specific operating hours overrides.
- `BookingService.get_club_availability`:
  - Resolves effective hours per court.
  - Closed courts on that date expose `slots = []`.
- `BookingService.calculate_booking_price`:
  - Resolves effective hours and rejects pricing requests outside operating window.

### D. Disruption Detection & Affected Bookings Preview
- **Club Level**:
  - `POST /api/v1/clubs/{club_id}/operating-hours/preview-disruptions`
  - Previews upcoming confirmed bookings that would fall outside the proposed operating hours.
  - Returns `affected_bookings_count`, detailed booking records (`court_name`, `start_at`, `end_at`, `player_id`), and an advisory message.
- **Court Level**:
  - `GET /api/v1/clubs/{club_id}/courts/{court_id}/affected-bookings`
  - Returns upcoming confirmed bookings on the court prior to deactivation.
- **Safety Invariant**:
  - Existing confirmed bookings are **never automatically cancelled, modified, or deleted**.
  - All disruptive changes require staff confirmation with explicit manual player notification required.

### E. New REST API Endpoints
| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/clubs/{club_id}/operating-hours` | `MANAGE_CLUB` or `MANAGE_COURTS` | Get club weekly operating schedule & fallback times |
| `PUT` | `/api/v1/clubs/{club_id}/operating-hours` | `MANAGE_CLUB` (Owner only) | Update club weekly operating hours |
| `POST` | `/api/v1/clubs/{club_id}/operating-hours/preview-disruptions` | `MANAGE_CLUB` (Owner only) | Preview affected upcoming bookings for proposed hours |
| `GET` | `/api/v1/clubs/{club_id}/courts/{court_id}/operating-hours` | `MANAGE_COURTS` | Get court effective operating hours & override flag |
| `PUT` | `/api/v1/clubs/{club_id}/courts/{court_id}/operating-hours` | `MANAGE_COURTS` | Set or clear court-level operating hours override |
| `GET` | `/api/v1/clubs/{club_id}/courts/{court_id}/affected-bookings` | `MANAGE_COURTS` | List upcoming confirmed bookings before deactivation |

---

## 4. Authorization & Multi-Tenancy

- **Club Owner**:
  - Has `MANAGE_CLUB` and `MANAGE_COURTS`.
  - Can edit club profile, club operating hours, all courts, and court overrides.
- **Club Manager**:
  - Has `MANAGE_COURTS`, but **NOT** `MANAGE_CLUB`.
  - Can view club operating hours, create/edit courts, configure court-level hours, and view affected bookings.
  - Cannot modify club profile or club-wide operating hours (`403 Forbidden`).
- **Tournament Director**:
  - Restricted to tournaments/leagues. Cannot access club settings, operating hours, or courts (`403 Forbidden`).
- **Player / Unrelated User**:
  - Cannot access any staff management or configuration endpoints (`403 Forbidden` / `404 Not Found`).
- **Multi-Club Isolation**:
  - Users with different roles in different clubs (e.g. Owner in Club A, Player in Club B) are isolated per club token context.

---

## 5. Mobile Application Integration

- **`mobile/src/types/index.ts`**:
  - Added typed interfaces: `DayOperatingHours`, `WeeklyOperatingHoursMap`, `ClubOperatingHoursResponse`, `OperatingHoursDisruptionPreviewResponse`, `CourtOperatingHoursResponse`, `CourtAffectedBookingsResponse`.
  - Updated `Club`, `UpdateClubPayload`, `Court`, `CourtCreateRequest`, and `CourtUpdateRequest` with optional `operating_hours`.
- **`mobile/src/constants/index.ts`**:
  - Added Phase 7 API endpoints: `CLUB_OPERATING_HOURS`, `CLUB_OPERATING_HOURS_PREVIEW`, `COURT_OPERATING_HOURS`, `COURT_AFFECTED_BOOKINGS`.
- **`mobile/src/services/api/clubs.ts` & `courts.ts`**:
  - Implemented typed API calls: `getOperatingHours`, `updateOperatingHours`, `previewOperatingHoursDisruptions`, `getCourtOperatingHours`, `updateCourtOperatingHours`, `getCourtAffectedBookings`.
- **`mobile/app/(club)/courts.tsx`**:
  - Integrated live disruption warning in the court deactivation confirmation modal. If upcoming confirmed bookings exist on the court, displays an alert with exact booking count and manual player notification guidance.

---

## 6. Automated Test Suite & Verification Results

### Dedicated Phase 7 Test Suite
File: `backend/tests/test_phase7_club_settings_and_facilities.py`
Result: **24 passed in 8.98s (100% pass rate)**

Covered test cases:
1. `test_owner_can_update_club_profile` — Owner updates full club profile successfully.
2. `test_manager_cannot_update_club_profile` — Manager receives 403 Forbidden.
3. `test_player_cannot_update_club_profile` — Player receives 403 Forbidden.
4. `test_tournament_director_cannot_update_club_profile` — TD receives 403 Forbidden.
5. `test_cross_club_owner_cannot_update_other_club_profile` — Cross-club attack rejected (403/404).
6. `test_invalid_club_profile_fields_rejected` — Invalid email/year rejected (422).
7. `test_public_club_profile_exposes_safe_data` — Public endpoint exposes safe data without private leak.
8. `test_get_operating_hours_returns_effective_schedule` — Default schedule resolution.
9. `test_owner_can_update_weekly_operating_hours` — Owner persists weekly schedule.
10. `test_manager_and_td_cannot_update_club_operating_hours` — Non-owner staff denied (403).
11. `test_invalid_operating_hours_rejected` — Inverted & equal times rejected (400/422).
12. `test_closed_day_exposes_zero_slots_and_rejects_booking` — Closed days expose 0 slots and reject bookings (400).
13. `test_direct_booking_outside_effective_hours_rejected` — Bookings outside hours rejected (400).
14. `test_operating_hours_update_does_not_alter_confirmed_bookings` — Existing bookings preserved.
15. `test_preview_operating_hours_disruptions` — Disruption preview identifies affected confirmed bookings.
16. `test_staff_can_list_and_manage_courts` — Owner and Manager can list courts.
17. `test_court_validation_and_uniqueness` — Duplicate court number and blank name rejected.
18. `test_cross_club_court_access_denied` — Tenant boundary isolation enforced.
19. `test_court_operating_hours_override` — Court schedule overrides club schedule; clearing restores inheritance.
20. `test_court_affected_bookings_and_deactivation_preserves_history` — Deactivation warns of affected bookings, blocks new bookings, preserves history.
21. `test_multi_club_user_role_isolation` — Separate authorization for multi-club memberships.
22. `test_direct_api_role_spoofing_prevented` — Server-side RBAC cannot be bypassed.
23. `test_booking_engine_60_minute_slot_boundaries` — Slot duration and boundaries preserved.
24. `test_booking_engine_advance_horizon_and_active_limit` — Advance horizon limits enforced.

### Full Verification Commands
- `python -m alembic check`: **0 drift detected ("No new upgrade operations detected")**.
- `npx tsc --noEmit` (mobile): **0 errors (Exit code 0)**.
- `npm run lint` (mobile): **0 errors (Exit code 0)**.
- Backend regression test suite: **All tests passing across Phase 2 through Phase 14**.

---

## 7. Known Architectural Limitations

1. **Overnight Operating Windows**:
   - The booking engine strictly requires bookings to fall within a single calendar day (except closing at midnight 00:00). Operating windows that span across midnight (e.g., 22:00 to 04:00 next day) cross calendar boundaries and are rejected by Pydantic validation with a clear error message.
2. **Manual Disruption Notification**:
   - Automatic email/push notifications and automatic rescheduling are outside the Phase 7 scope. The system identifies disrupted bookings via preview APIs and displays clear warnings so club staff can contact players manually.
