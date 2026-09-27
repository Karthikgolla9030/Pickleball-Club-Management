# Phase 11 — Court Booking & Reservation Engine

## Overview

Phase 11 delivers the complete, production-ready **Court Booking & Reservation Engine** for Aught2 Pickleball, building directly on the Court infrastructure established in Phase 10.

The engine provides time-slot reservation capabilities, dynamic availability schedules across facility operating hours, concurrency-safe double-booking prevention, player self-service booking lifecycles, and staff reservation management.

---

## Key Principles & Invariants

### 1. Scope Discipline
- **Strictly Phase 11**: Payments, billing, lessons/clinics, open play sessions, push notifications, and automated tournament court blockouts are deferred to future phases.
- Court availability in Phase 11 models confirmed reservations against active physical courts within the club's defined operating hours.

### 2. Time Slot & Operating Hours Rules
- **Operating Hours**: 07:00 to 22:00 daily (facility closes at 22:00; last bookable slot begins at 21:00).
- **Slot Duration**: Exactly 60 minutes per reservation.
- **Hourly Alignment**: All bookings must align to top-of-the-hour boundaries (e.g., 07:00, 08:00, ..., 21:00).
- **Booking Horizon**: Reservations can only be scheduled up to 14 days in advance. Bookings outside this horizon return `400 Bad Request`.
- **Past Bookings**: Cannot book slots in the past.

### 3. Concurrency & Double-Booking Prevention
- **Database GiST Exclusion Constraint**: The `bookings` table enforces `EXCLUDE USING gist (court_id WITH =, tstzrange(start_time, end_time, '[)') WITH =)` for `status = 'CONFIRMED'`. This renders double-booking a physical impossibility at the PostgreSQL database engine level.
- **Pessimistic Row-Level Locking**: High-concurrency application transactions execute `SELECT * FROM courts WHERE id = :court_id FOR UPDATE` inside an atomic transaction block before executing slot conflict queries.
- **Deterministic Conflict Handling**: Simultaneous booking attempts for the same court and slot result in the winning transaction securing the booking and the losing transaction receiving `409 Conflict`.

### 4. Player Self-Service Rules
- **Club Membership**: Players must hold an active membership in the target club to check court availability and book courts (`403 Forbidden` if not an active member).
- **Active Upcoming Booking Limit**: A player can have at most **3 concurrent active upcoming bookings** across all clubs (`400 Bad Request` if exceeded).
- **Self-Cancellation Window**: Players may cancel their own confirmed reservations up to **2 hours before start time** (`400 Bad Request` if less than 2 hours).
- **Ownership**: Players can only view their own bookings and cannot cancel other players' reservations (`403 Forbidden`).

### 5. Staff Management & Overrides
- **Permission**: Staff actions require `Permission.MANAGE_BOOKINGS` (`club_owner` or `club_manager`).
- **Staff Reservation on Behalf of Players**: Staff can create bookings for any active club member. Staff reservations bypass the player's 3-active-booking ceiling.
- **Staff Cancellations**: Staff can cancel any club booking at any time without the 2-hour restriction, with mandatory audit reason capture (`cancellation_reason`).
- **Role Enforcement**: `tournament_director` is strictly denied booking management (`403 Forbidden`).

---

## Data Model

### Booking Model (`bookings` table)

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | UUID | No | Primary key (default `uuid4`) |
| `club_id` | UUID | No | Foreign Key to `clubs.id` (indexed, cascade delete) |
| `court_id` | UUID | No | Foreign Key to `courts.id` (indexed, cascade delete) |
| `player_id` | UUID | No | Foreign Key to `users.id` (player who will use the court) |
| `booked_by_user_id` | UUID | No | Foreign Key to `users.id` (user who executed the booking) |
| `start_time` | DateTime (UTC) | No | Slot start timestamp (indexed) |
| `end_time` | DateTime (UTC) | No | Slot end timestamp (indexed) |
| `status` | Enum | No | `CONFIRMED`, `CANCELLED`, `COMPLETED` (default `CONFIRMED`) |
| `booking_type` | Enum | No | `PLAYER`, `STAFF` (default `PLAYER`) |
| `notes` | Text | Yes | Optional booking notes or special instructions |
| `cancelled_at` | DateTime (UTC) | Yes | Timestamp of cancellation |
| `cancelled_by_user_id`| UUID | Yes | Foreign Key to `users.id` who cancelled |
| `cancellation_reason` | Text | Yes | Reason for cancellation |
| `created_at` | DateTime (UTC) | No | Creation timestamp (UTC) |
| `updated_at` | DateTime (UTC) | No | Last update timestamp (UTC) |

### Indexes & Constraints
- Index on `(club_id, start_time)` for fast club calendar queries.
- Index on `(player_id, start_time)` for player dashboard and limit checks.
- Index on `(court_id, start_time)` for court availability checks.
- Partial GiST exclusion constraint on active confirmed bookings to prevent overlapping time ranges on the same court.

---

## API Endpoints

### Player Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/clubs/{club_id}/courts/availability` | Member | Get dynamic availability matrix for all active courts on a given `date` (`YYYY-MM-DD`) |
| `POST` | `/api/v1/clubs/{club_id}/bookings` | Member | Create self-booking (court, start_time, notes) |
| `GET` | `/api/v1/bookings` | Authenticated | List current player's bookings (filters: `upcoming=true\|false`, `status`, `club_id`) |
| `GET` | `/api/v1/bookings/{booking_id}` | Authenticated | Get detailed booking details (owner or club staff) |
| `POST` | `/api/v1/bookings/{booking_id}/cancel` | Owner | Cancel own eligible booking (>= 2 hours before start) |

### Staff Endpoints (`Permission.MANAGE_BOOKINGS`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/clubs/{club_id}/bookings` | Staff | List all club bookings (filters: `court_id`, `status`, `from_date`, `to_date`, `player_id`) |
| `POST` | `/api/v1/clubs/{club_id}/bookings/staff` | Staff | Create reservation on behalf of a club member (overriding player booking limits) |
| `POST` | `/api/v1/clubs/{club_id}/bookings/{booking_id}/cancel` | Staff | Cancel any club booking with audit `reason` |

---

## Mobile Application

### Player Bookings Screen (`mobile/app/(player)/bookings.tsx`)
- **Booking Flow**:
  - Date selector covering the 14-day booking horizon.
  - Court selector tabs for all active courts.
  - Interactive time slot grid: available slots, booked slots, and past slots.
  - Booking confirmation sheet displaying court details, time slot, and cancellation policy.
- **My Reservations View**:
  - Upcoming bookings list with countdown and status badges.
  - Past / history bookings list.
  - Self-service cancellation modal with 2-hour cutoff rule enforcement.

### Staff Bookings Screen (`mobile/app/(club)/bookings.tsx`)
- **Management Overview**:
  - KPI summary metrics (Total Club Bookings, Confirmed, Cancelled).
  - Status filter tabs: All, Confirmed, Cancelled.
  - Court filter chips to view bookings for a specific court.
- **Staff Reservation Engine**:
  - "New Reservation" modal allowing staff to select any active club player member.
  - Court and slot selector.
  - Staff notes input.
- **Staff Cancellation**:
  - One-tap cancellation modal with required cancellation reason.
  - Immediate optimistic cache invalidation and live status update.
