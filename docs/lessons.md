# Lessons & Coaching Management (Phase 15)

This document describes the coaching and lesson management domain for Aught2 Pickleball established in Phase 15.

Lessons are strictly distinct from tournaments, leagues, events, and open play. They provide a dedicated system for clubs to manage coaching personnel, lesson type configurations, group clinics, private 1-on-1 instruction, capacity enforcement, schedule conflict prevention, and player attendance tracking.

---

## 1. Domain Architecture & Principles

### Domain Boundaries
- **Lessons are NOT Tournaments / Leagues**: Lessons do not feature brackets, standings, pools, rounds, scores, or playoffs.
- **Lessons are NOT Events**: Club events (Phase 14) are general gatherings (socials, open houses, club anniversaries). Lessons are instructional and tied to a designated coach and lesson type curriculum.
- **Lessons are NOT Open Play**: Open play sessions are drop-in casual play. Lessons are structured educational sessions with coaching supervision and attendance tracking.
- **Coach is NOT an RBAC Role**: `Coach` is an informational/personnel record belonging to a club (`club_id`). It optionally links to a `User` (`user_id`) for profile identification, but does NOT grant login administrative permissions. Coaching administration is governed by the centralized RBAC permission `manage_lessons`.

---

## 2. Domain Models & Schemas

### Coach Schema (`coaches` table)

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key (UUIDv4) |
| `club_id` | `UUID` | No | Foreign key -> `clubs.id` (ON DELETE CASCADE), indexed |
| `user_id` | `UUID` | Yes | Foreign key -> `users.id` (ON DELETE SET NULL), indexed |
| `name` | `VARCHAR(255)` | No | Coach display name |
| `bio` | `TEXT` | Yes | Professional biography, certifications, playing history |
| `specialization` | `VARCHAR(255)` | Yes | Skill areas (e.g., Dinking, Third Shot Drops, Strategy) |
| `phone` | `VARCHAR(50)` | Yes | Direct contact number |
| `email` | `VARCHAR(255)` | Yes | Direct contact email |
| `is_active` | `BOOLEAN` | No | Active status toggle (defaults to `True`), indexed |
| `created_at` | `TIMESTAMPTZ` | No | Record creation timestamp (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | Record modification timestamp (UTC) |

### Lesson Type Schema (`lesson_types` table)

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key (UUIDv4) |
| `club_id` | `UUID` | No | Foreign key -> `clubs.id` (ON DELETE CASCADE), indexed |
| `name` | `VARCHAR(255)` | No | Title of lesson curriculum (e.g., Beginner Clinic, 1-on-1) |
| `description` | `TEXT` | Yes | Detailed curriculum and equipment requirements |
| `duration_minutes` | `INTEGER` | No | Session duration in minutes (must be > 0, defaults to 60) |
| `default_capacity` | `INTEGER` | Yes | Default participant capacity (> 0, null = variable) |
| `default_price` | `NUMERIC(10, 2)` | No | Baseline price (defaults to `0.00`) |
| `currency` | `VARCHAR(3)` | No | Currency code (defaults to `INR`) |
| `is_private` | `BOOLEAN` | No | Private lesson flag (defaults to `False`). If `True`, capacity is locked to 1 |
| `is_active` | `BOOLEAN` | No | Active status toggle (defaults to `True`), indexed |
| `created_at` | `TIMESTAMPTZ` | No | Record creation timestamp (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | Record modification timestamp (UTC) |

### Lesson Schema (`lessons` table)

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key (UUIDv4) |
| `club_id` | `UUID` | No | Foreign key -> `clubs.id` (CASCADE), indexed |
| `lesson_type_id` | `UUID` | No | Foreign key -> `lesson_types.id` (RESTRICT), indexed |
| `coach_id` | `UUID` | No | Foreign key -> `coaches.id` (RESTRICT), indexed |
| `court_id` | `UUID` | Yes | Foreign key -> `courts.id` (SET NULL), indexed |
| `title` | `VARCHAR(255)` | No | Scheduled lesson title |
| `description` | `TEXT` | Yes | Lesson-specific instructions or prerequisites |
| `start_at` | `TIMESTAMPTZ` | No | Session start timestamp (UTC), indexed |
| `end_at` | `TIMESTAMPTZ` | No | Session end timestamp (UTC) |
| `capacity` | `INTEGER` | Yes | Maximum active registrations (strictly 1 for private lessons) |
| `price` | `NUMERIC(10, 2)` | No | Session fee snapshot copied from lesson type at creation |
| `currency` | `VARCHAR(3)` | No | Currency code (defaults to `INR`) |
| `status` | `VARCHAR(24)` | No | Lifecycle status (`draft`, `published`, `cancelled`, `completed`), indexed |
| `registration_opens_at` | `TIMESTAMPTZ` | Yes | Optional registration opening window (UTC) |
| `registration_closes_at` | `TIMESTAMPTZ` | Yes | Optional registration closing window (UTC) |
| `created_by_user_id` | `UUID` | Yes | Foreign key -> `users.id` (SET NULL) |
| `created_at` | `TIMESTAMPTZ` | No | Record creation timestamp (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | Record modification timestamp (UTC) |

### Lesson Registration Schema (`lesson_registrations` table)

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key (UUIDv4) |
| `lesson_id` | `UUID` | No | Foreign key -> `lessons.id` (CASCADE), indexed |
| `user_id` | `UUID` | No | Foreign key -> `users.id` (CASCADE), indexed |
| `status` | `VARCHAR(24)` | No | Status (`registered`, `cancelled`, `attended`, `no_show`), indexed |
| `registered_at` | `TIMESTAMPTZ` | No | Registration timestamp (UTC) |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | Cancellation timestamp (UTC) |
| `attended_at` | `TIMESTAMPTZ` | Yes | Attendance marked timestamp (UTC) |
| `notes` | `TEXT` | Yes | Player or staff registration notes |
| `created_at` | `TIMESTAMPTZ` | No | Record creation timestamp (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | Record modification timestamp (UTC) |

**Constraints & Partial Unique Index**:
- `uq_lesson_registrations_one_active_per_user`: Unique index on `('lesson_id', 'user_id')` WHERE `status != 'CANCELLED'`.
- Enforces strictly at most one active registration per user per lesson.
- If a registration is cancelled, the user may re-register in the future if spots remain available.

---

## 3. Conflict Prevention & Schedule Validation

### Coach Conflict Detection
- A coach cannot be assigned to overlapping active lessons within the same or different clubs.
- Active lessons considered: status is `draft` or `published`.
- Overlap formula: `existing.start_at < new.end_at AND existing.end_at > new.start_at`.
- Violations return `HTTP 409 Conflict`.

### Court Conflict Detection
When a court is assigned to a lesson (`court_id != None`):
1. **Court Booking Overlap**: Checked against active court bookings (`Booking` with status `confirmed` or `pending`). If a booking overlaps the lesson time window, `HTTP 409 Conflict` is returned.
2. **Active Lesson Overlap**: Checked against other active lessons (`draft` or `published`) assigned to the same court. If an active lesson overlaps, `HTTP 409 Conflict` is returned.

### Inactive Resource Rejection
- Lessons cannot be scheduled or reassigned to an inactive coach (`is_active == False` -> `HTTP 400 Bad Request`).
- Lessons cannot be scheduled or reassigned to an inactive court (`is_active == False` -> `HTTP 400 Bad Request`).

---

## 4. Lifecycle State Machine

```
              ┌─────────┐
              │  DRAFT  │
              └────┬────┘
                   │ publish
                   ▼
             ┌───────────┐
      ┌─────►│ PUBLISHED │◄────┐
      │      └─────┬─────┘     │
      │            │           │
cancel│     complete│     cancel│
      ▼            ▼           ▼
┌───────────┐┌───────────┐┌───────────┐
│ CANCELLED ││ COMPLETED ││ CANCELLED │
└───────────┘└───────────┘└───────────┘
```

### Lifecycle Transition Rules
1. **Draft (`draft`)**: Default state on creation. Full editing of coach, lesson type, court, schedule, capacity, and price allowed.
2. **Publish (`published`)**: Requires `start_at > now()`. Validates coach and court are active and free of conflicts. Opens the lesson for player registration.
3. **Cancel (`cancelled`)**: Permitted from `draft` or `published`. When a published lesson with active registrations is cancelled, all active registrations are cascaded to `cancelled` with `cancelled_at` set.
4. **Complete (`completed`)**: Permitted from `published`. Marks the lesson finished. Roster remains accessible for historical records and attendance tracking.

---

## 5. Capacity & Concurrency Control

- **Concurrency-Safe Registration**: Registration locks the `Lesson` row using `SELECT ... FOR UPDATE` (`with_for_update()`) inside an atomic transaction.
- **Capacity Counting**: Active registrations (`status != 'cancelled'`) are counted under the row lock. If `capacity` is configured and `active_count >= capacity`, registration is rejected with `HTTP 400 Bad Request ("Lesson capacity has been reached")`.
- **Private Lesson Enforcement**: Lessons created from a private lesson type (`is_private == True`) have their capacity strictly locked to 1.
- **Registration Windows**:
  - Registration before `registration_opens_at` is rejected (`HTTP 400`).
  - Registration after `registration_closes_at` is rejected (`HTTP 400`).
  - Registration after `lesson.start_at` is rejected (`HTTP 400`).
- **Club Membership Eligibility**: Players must possess an `active` club player membership (`ClubPlayerMembership`) for the hosting club. Ineligible players receive `HTTP 403 Forbidden`.

---

## 6. Attendance Tracking

Staff can track participant attendance on lessons:
- **Attended**: Sets `status = attended` and `attended_at = now()`.
- **No-Show**: Sets `status = no_show` and clears `attended_at`.
- Attendance operations are strictly restricted to participants with `status == registered`. Attempting to mark attendance on cancelled participants returns `HTTP 400 Bad Request`.

---

## 7. Role-Based Access Control (RBAC)

Permission: `manage_lessons`

| Platform Role | `manage_lessons` Permission | Notes |
|---|---|---|
| `club_owner` | **Granted** (`True`) | Full management of coaches, lesson types, lessons, roster, and attendance |
| `club_manager` | **Granted** (`True`) | Full management of coaches, lesson types, lessons, roster, and attendance |
| `tournament_director` | **Denied** (`False`) | Cannot access or modify coaching/lesson configurations |
| `player` | **Denied** (`False`) | Discovery, registration, and personal registration cancellation only |

---

## 8. REST API Endpoints

### Staff Coach Endpoints
- `GET /api/v1/clubs/{club_id}/coaches` — List coaches (optional `?active_only=true`)
- `POST /api/v1/clubs/{club_id}/coaches` — Create coach record
- `GET /api/v1/clubs/{club_id}/coaches/{coach_id}` — Get coach details
- `PATCH /api/v1/clubs/{club_id}/coaches/{coach_id}` — Update coach profile
- `POST /api/v1/clubs/{club_id}/coaches/{coach_id}/deactivate` — Deactivate coach
- `POST /api/v1/clubs/{club_id}/coaches/{coach_id}/reactivate` — Reactivate coach

### Staff Lesson Type Endpoints
- `GET /api/v1/clubs/{club_id}/lesson-types` — List lesson types (optional `?active_only=true`)
- `POST /api/v1/clubs/{club_id}/lesson-types` — Create lesson type
- `GET /api/v1/clubs/{club_id}/lesson-types/{type_id}` — Get lesson type details
- `PATCH /api/v1/clubs/{club_id}/lesson-types/{type_id}` — Update lesson type
- `POST /api/v1/clubs/{club_id}/lesson-types/{type_id}/deactivate` — Deactivate lesson type
- `POST /api/v1/clubs/{club_id}/lesson-types/{type_id}/reactivate` — Reactivate lesson type

### Staff Lesson Endpoints
- `GET /api/v1/clubs/{club_id}/lessons` — List lessons with status/coach/type/court/date filters
- `POST /api/v1/clubs/{club_id}/lessons` — Create lesson (starts in `draft`)
- `GET /api/v1/clubs/{club_id}/lessons/{lesson_id}` — Get single lesson details
- `PATCH /api/v1/clubs/{club_id}/lessons/{lesson_id}` — Update mutable lesson fields
- `POST /api/v1/clubs/{club_id}/lessons/{lesson_id}/publish` — Publish draft lesson
- `POST /api/v1/clubs/{club_id}/lessons/{lesson_id}/cancel` — Cancel lesson & registrations
- `POST /api/v1/clubs/{club_id}/lessons/{lesson_id}/complete` — Complete published lesson

### Staff Registration & Attendance Endpoints
- `GET /api/v1/clubs/{club_id}/lessons/{lesson_id}/registrations` — List roster
- `POST /api/v1/clubs/{club_id}/lessons/{lesson_id}/registrations` — Staff manual player registration
- `POST /api/v1/clubs/{club_id}/lessons/{lesson_id}/registrations/{reg_id}/cancel` — Staff cancel registration
- `POST /api/v1/clubs/{club_id}/lessons/{lesson_id}/registrations/{reg_id}/attend` — Mark attended
- `POST /api/v1/clubs/{club_id}/lessons/{lesson_id}/registrations/{reg_id}/no-show` — Mark no-show

### Player Endpoints
- `GET /api/v1/clubs/{club_id}/lessons/discover` — Discover published lessons
- `GET /api/v1/players/me/lessons` — List authenticated player's registrations
- `GET /api/v1/players/me/lessons/{lesson_id}` — View player lesson detail
- `POST /api/v1/players/me/lessons/{lesson_id}/register` — Register for lesson
- `POST /api/v1/players/me/lessons/{lesson_id}/cancel` — Cancel own registration
