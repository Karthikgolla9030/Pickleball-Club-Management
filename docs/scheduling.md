# Phase 17 — Competition Scheduling & Court Assignment

## Overview

Phase 17 delivers the production-ready **Competition Scheduling & Court Assignment** operational layer for Aught2 Pickleball.

It integrates seamlessly with existing competition formats (Tournaments: Round Robin, Pool Play, Scramble, Standalone Bracket; Leagues: Regular Season & Playoffs) and physical facilities (Courts and Bookings). It provides staff with comprehensive scheduling capabilities—assigning physical courts and start/end times to generated competition matches—while protecting courts with bidirectional conflict detection and giving players a unified view of their upcoming competition matches.

---

## Key Principles & Invariants

### 1. Separation of Concerns & Scope Discipline
- **Operational Layer Only**: Phase 17 does NOT create or alter match generation engines, standings algorithms, bracket progressions, or league scoring.
- **Pure Operational Assignment**: Scheduling operates on existing `Match` records by populating `court_id`, `scheduled_start_at`, and `scheduled_end_at`.
- **Open Play Deferred**: Phase 16 (Open Play) is intentionally skipped and untouched.

### 2. Match Invariants & Validation
- **Completed Match Immutability**: Matches with `status == "COMPLETED"` have immutable schedules. They cannot be scheduled, rescheduled, or unscheduled (`400 Bad Request`).
- **Complete Competitor Requirement**: Incomplete matches or matches with BYEs where both competitors are not yet determined cannot be scheduled (`400 Bad Request`).
  - Tournament matches must have both `team1_id` and `team2_id` assigned.
  - Scramble matches must have all 4 players assigned (`p1_user_id`, `p2_user_id`, `p3_user_id`, `p4_user_id`).
  - League matches must have both participants assigned.
- **Active Physical Courts**: Matches may only be assigned to courts where `is_active == True` belonging to the same club hosting the competition (`400 Bad Request`).
- **Duration Boundaries**: Match durations must be between 15 and 240 minutes (default 60 minutes). `scheduled_end_at` must strictly be greater than `scheduled_start_at`.

### 3. Bidirectional Concurrency & Conflict Prevention
- **Court Conflict Prevention**:
  - A competition match cannot be scheduled on a court with an overlapping active regular player or staff court booking (`409 Conflict`).
  - A competition match cannot be scheduled on a court with another overlapping scheduled competition match (`409 Conflict`).
  - Conversely, regular player and staff court bookings in `booking_service` check for overlapping scheduled competition matches on that court; overlapping slots are rendered unavailable in the availability matrix and blocked with `409 Conflict`.
- **Competitor Conflict Prevention**:
  - A team or individual player cannot be scheduled for two concurrent matches across any tournament or league (`409 Conflict`).
- **Pessimistic Row-Level Locking**: High-concurrency operations acquire `SELECT ... FOR UPDATE` row locks via `with_for_update()` on target match and court records to eliminate race conditions.
- **PostgreSQL Exclusion Constraint**: On PostgreSQL, a GiST exclusion constraint on `(court_id WITH =, tstzrange(scheduled_start_at, scheduled_end_at, '[)') WITH =)` provides engine-level double-assignment prevention for active matches.

### 4. Role-Based Access Control (RBAC)
- **Centralized Permission**: `Permission.MANAGE_SCHEDULES = "manage_schedules"`.
- **Allowed Roles**:
  - `club_owner`: Full management (`True`).
  - `club_manager`: Full management (`True`).
  - `tournament_director`: Full management (`True`).
- **Denied Roles**:
  - Players and unauthenticated users cannot manage schedules (`403 Forbidden`).
  - Players have read-only access to their personal competition match schedules via `/api/v1/players/me/matches`.

---

## Data Model Extensions

### Match Model Extensions (`matches` table)

The existing `Match` model (`backend/app/models/competition.py`) is extended with the following nullable columns:

| Column | Type | Nullable | Description |
|---|---|---|---|
| `court_id` | UUID | Yes | Foreign Key to `courts.id` (ondelete="SET NULL", indexed) |
| `scheduled_start_at` | DateTime (UTC) | Yes | Scheduled match start timestamp (indexed) |
| `scheduled_end_at` | DateTime (UTC) | Yes | Scheduled match end timestamp (indexed) |

### Court Relationship (`courts` table)

The `Court` model (`backend/app/models/court.py`) includes a reciprocal relationship:
- `matches`: `relationship("Match", back_populates="court", cascade="all, delete-orphan")`

### Database Indexes & Constraints
- Index on `court_id`: `ix_matches_court_id`
- Index on `scheduled_start_at`: `ix_matches_scheduled_start_at`
- Composite index on `(court_id, scheduled_start_at, scheduled_end_at)`: `ix_matches_scheduled_range`
- Database GiST exclusion constraint on active matches on PostgreSQL.

---

## API Endpoints

### Club Staff Scheduling Endpoints (`Permission.MANAGE_SCHEDULES`)

Mounted under `/api/v1/clubs/{club_id}/`:

| Method | Path | Auth / Role | Description |
|---|---|---|---|
| `POST` | `/matches/{match_id}/schedule` | Owner, Manager, TD | Schedule a match to a court, start time, and duration |
| `PUT` | `/matches/{match_id}/reschedule` | Owner, Manager, TD | Reschedule an already-scheduled match (new court, time, or duration) |
| `DELETE` | `/matches/{match_id}/unschedule` | Owner, Manager, TD | Clear court assignment and schedule timestamps from a match |
| `GET` | `/matches/unscheduled` | Owner, Manager, TD | List unscheduled matches across tournaments and leagues (optional filters: `tournament_id`, `league_id`) |
| `GET` | `/courts/schedule` | Owner, Manager, TD | Get comprehensive day schedule of all courts with both matches and bookings for `date` (`YYYY-MM-DD`) |
| `GET` | `/courts/availability` | Owner, Manager, TD | Get court slot availability matrix across facility operating hours for `date` (`YYYY-MM-DD`) |

> [!IMPORTANT]
> The `club_scheduling_router` is mounted before the `club_competition_router` in `backend/app/api/v1/__init__.py` to prevent route collision between `/matches/unscheduled` and the parameterized `/matches/{match_id}` endpoint.

### Player Personal Match Schedule Endpoint

Mounted under `/api/v1/players/me/matches`:

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Authenticated Player | List current player's scheduled and unscheduled competition matches (filters: `from_date`, `to_date`, `status`) |

---

## Mobile Application Implementation

### 1. Staff Competition Schedule Screen (`mobile/app/(club)/competition-schedule.tsx`)
- **Role Gating**: Protected by `canManageSchedules` permission check.
- **Date Navigation**: Horizontal scrollable date pills covering +/- 14 days around today with "Today" shortcut.
- **Court Schedule Timeline**: Displays daily schedule for all active courts, detailing both scheduled competition matches and player/staff court bookings.
- **Unscheduled Matches Drawer / Panel**: Lists all pending tournament and league matches that require court assignment, with tournament/round/competitor metadata.
- **Interactive Schedule & Reschedule Modal**: Allows selecting target court, start time (hour & minute), and match duration (15 to 240 minutes) with instant validation.
- **Conflict Feedback**: Live error banner and alerts for overlapping court bookings or concurrent team/player conflicts.
- **Unschedule Action**: Confirmation prompt to clear court assignments and return matches to the unscheduled pool.

### 2. Player Competition Schedule Screen (`mobile/app/(player)/competition-schedule.tsx`)
- **Segmented Tabs**: `Today` | `Upcoming` | `Past`.
- **Match Cards**:
  - Displays competition type badge (Tournament Round Robin / Pool Play / Scramble / Bracket or League).
  - Assigned court badge and formatted start/end time.
  - Competitor pairings (opponent team or scramble partner/opponents).
  - Unscheduled indicator banner if match has not yet been assigned a court.
- **Pull-to-refresh**: TanStack Query refetching.

### 3. Layout Navigation
- **Club Layout (`mobile/app/(club)/_layout.tsx`)**: Added `competition-schedule` tab with `calendar` icon, visible when `canManageSchedules` is true.
- **Player Layout (`mobile/app/(player)/_layout.tsx`)**: Added `competition-schedule` tab labeled `Matches` with `trophy-outline` icon for quick player access.

---

## Verification & Test Coverage

### Automated Backend Tests
- **Scheduling Suite**: `backend/tests/test_scheduling_api.py` (13 tests):
  - `test_schedule_match_success`: Valid assignment to court and time.
  - `test_schedule_match_court_conflict_with_match`: Overlapping match returns `409 Conflict`.
  - `test_schedule_match_court_conflict_with_booking`: Overlapping court booking returns `409 Conflict`.
  - `test_booking_conflict_with_competition_match`: Booking attempt on scheduled match court slot returns `409 Conflict`.
  - `test_schedule_match_team_conflict`: Concurrent match for same team returns `409 Conflict`.
  - `test_schedule_match_invalid_duration`: Durations < 15 min or > 240 min return `400 Bad Request`.
  - `test_schedule_match_inactive_court`: Assigning to inactive court returns `400 Bad Request`.
  - `test_schedule_completed_match_rejected`: Modifying completed match returns `400 Bad Request`.
  - `test_reschedule_match_success`: Updating court and time slots.
  - `test_unschedule_match_success`: Resetting court and timestamps.
  - `test_unscheduled_matches_list`: Filtering unscheduled competition matches.
  - `test_club_court_schedule_day`: Retrieving daily court schedule with matches and bookings.
  - `test_player_competition_matches`: Player retrieving their tournament/league match schedule.
- **Permission Tests**: `backend/tests/test_permissions.py` verifies `manage_schedules` permission across Owner, Manager, TD, and Player roles.
- **Full Platform Regression**: 596 tests passed cleanly across all 15 phases with 0 failures and 0 regressions.

### Schema Drift & Migration Verification
- `alembic upgrade head`: Applied migration cleanly.
- `alembic check`: Verified 0 schema drift.

### Frontend TypeScript & Linting
- `npx tsc --noEmit` in `mobile/`: 0 errors.
- `npm run lint` in `mobile/`: 0 errors/warnings on all Phase 17 files.
