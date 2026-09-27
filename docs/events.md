# Events & Event Management (Phase 14)

This document describes the club event management foundation for Aught2 Pickleball established in Phase 14.

Events are distinct from tournaments, leagues, and open play. They represent club gatherings, clinics, socials, community days, and member appreciation events.

---

## 1. Domain Models

### Event Schema (`events` table)

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key (UUIDv4) |
| `club_id` | `UUID` | No | Foreign key -> `clubs.id` (ON DELETE CASCADE), indexed |
| `title` | `VARCHAR(255)` | No | Name of event |
| `description` | `TEXT` | Yes | Event description, rules, schedule |
| `event_type` | `VARCHAR(32)` | No | Type of event (`social`, `clinic`, `community`, `special`, `other`) |
| `status` | `VARCHAR(24)` | No | Lifecycle status (`draft`, `published`, `cancelled`, `completed`), indexed |
| `visibility` | `VARCHAR(24)` | No | Access scope (`public`, `members_only`, `private`), indexed |
| `start_at` | `TIMESTAMPTZ` | No | Start timestamp (UTC), indexed |
| `end_at` | `TIMESTAMPTZ` | No | End timestamp (UTC) |
| `location` | `VARCHAR(255)` | Yes | Specific location / court identifiers |
| `capacity` | `INTEGER` | Yes | Maximum active registrations (null = unlimited) |
| `registration_required` | `BOOLEAN` | No | Whether registration is required (defaults to `True`) |
| `registration_opens_at` | `TIMESTAMPTZ` | Yes | Optional registration opening window (UTC) |
| `registration_closes_at` | `TIMESTAMPTZ` | Yes | Optional registration closing window (UTC) |
| `registration_fee` | `NUMERIC(10, 2)` | No | Entry fee (defaults to `0.00`) |
| `currency` | `VARCHAR(3)` | No | Currency code (defaults to `INR`) |
| `created_by_user_id` | `UUID` | Yes | Foreign key -> `users.id` (SET NULL) |
| `created_at` | `TIMESTAMPTZ` | No | Timestamp of record creation (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | Timestamp of last record update (UTC) |

### Event Registration Schema (`event_registrations` table)

| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | `UUID` | No | Primary key (UUIDv4) |
| `event_id` | `UUID` | No | Foreign key -> `events.id` (CASCADE), indexed |
| `user_id` | `UUID` | No | Foreign key -> `users.id` (CASCADE), indexed |
| `status` | `VARCHAR(24)` | No | Registration state (`registered`, `waitlisted`, `cancelled`, `attended`, `no_show`), indexed |
| `registered_at` | `TIMESTAMPTZ` | No | Registration timestamp (determines FIFO waitlist order) |
| `cancelled_at` | `TIMESTAMPTZ` | Yes | Cancellation timestamp |
| `notes` | `TEXT` | Yes | Optional registration remarks |
| `created_at` | `TIMESTAMPTZ` | No | Timestamp created (UTC) |
| `updated_at` | `TIMESTAMPTZ` | No | Timestamp updated (UTC) |

**Constraints & Indexes**:
- Partial unique index: `(event_id, user_id)` where `status != 'CANCELLED'`. A user may only have one active (non-cancelled) registration per event. If cancelled, they may re-register historically.

---

## 2. Event Types & Visibility

### Supported Event Types
- `social`: Social mixer, open play gathering, evening club social.
- `clinic`: Coaching session, drills clinic, beginner instruction.
- `community`: Community open house, charity event.
- `special`: Club anniversary, holiday tournament party, exhibition.
- `other`: Any club-organized gathering not fitting above.

### Visibility & Eligibility Matrix
- `public`: Any registered user on the platform can discover and register.
- `members_only`: Only active club player members (`ClubPlayerMembership` with `ACTIVE` status) can discover and register. Non-members or inactive members are denied with HTTP 403.
- `private`: Hidden from player discovery. Registration is restricted to staff manual invitation/registration only.

---

## 3. Lifecycle State Machine

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

### Lifecycle Rules
1. **Creation**: All events start in `draft` status.
2. **Publishing**: Only `draft` events can be published. Validates that `end_at` is in the future.
3. **Completion**: Only `published` events can be marked `completed`.
4. **Cancellation**: Events in `draft` or `published` can be cancelled.
5. **Modification**: Only `draft` and `published` events can be edited. `completed` and `cancelled` events are immutable.
6. **Registration restriction**: Players may only register for `published` events within active registration windows.

---

## 4. Capacity, Waitlist & Deterministic Promotion

1. **Capacity calculation**:
   - `registered_count` = sum of registrations with `status` IN (`registered`, `attended`, `no_show`).
   - `available_spots` = `capacity - registered_count` (or `null` if unlimited capacity).
2. **Auto-Waitlisting**:
   - If `capacity` is set and `registered_count >= capacity`, incoming registrations are assigned `status = waitlisted`.
3. **Deterministic FIFO Auto-Promotion**:
   - When a `registered` spot is cancelled (either by the player themselves or by staff), the system automatically queries the earliest waitlisted participant:
     `ORDER BY registered_at ASC, id ASC LIMIT 1`
   - The selected waitlisted participant is automatically transitioned to `status = registered`.
   - If a waitlisted registration is cancelled, no promotion is needed.
4. **Attendance**:
   - Staff can mark `attended` or `no_show` only on participants with `status = registered`. Waitlisted or cancelled registrations cannot be marked for attendance.

---

## 5. Permissions & Authorization

Phase 14 introduces the centralized permission `Permission.MANAGE_EVENTS = "manage_events"`.

- **Club Owner**: `manage_events` ✅ (Allowed)
- **Club Manager**: `manage_events` ✅ (Allowed)
- **Tournament Director**: `manage_events` ❌ (Denied with 403)
- **Player (Regular User)**: Staff endpoints denied with 403. Player endpoints allow self-registration and personal history.

---

## 6. API Reference

### Staff Endpoints (`/api/v1/clubs/{club_id}/events`)
Requires `manage_events` permission on target club.

- `GET /`: List events with optional filters (`status`, `event_type`, `visibility`, `date_from`, `date_to`).
- `POST /`: Create draft event.
- `GET /{event_id}`: Get detailed event metrics (capacity, registered, waitlisted, attended, spots).
- `PATCH /{event_id}`: Update event fields.
- `POST /{event_id}/publish`: Publish draft event.
- `POST /{event_id}/cancel`: Cancel event.
- `POST /{event_id}/complete`: Mark event as completed.
- `GET /{event_id}/registrations`: List event registrations with optional `?status=` filter.
- `POST /{event_id}/registrations`: Staff manually registers player (`{"user_id": "...", "notes": "..."}`).
- `POST /{event_id}/registrations/{registration_id}/cancel`: Staff cancels registration (promotes next waitlisted).
- `POST /{event_id}/registrations/{registration_id}/attend`: Staff marks participant as attended.
- `POST /{event_id}/registrations/{registration_id}/no-show`: Staff marks participant as no-show.
- `POST /{event_id}/registrations/{registration_id}/promote`: Staff manually promotes waitlisted player.

### Player Endpoints
Requires authenticated player user (`Bearer token`).

- `GET /api/v1/clubs/{club_id}/events/discover`: Discover published events eligible for player.
- `GET /api/v1/players/me/events`: List player's registrations across all clubs.
- `GET /api/v1/players/me/events/{event_id}`: View event details with current player's registration status.
- `POST /api/v1/players/me/events/{event_id}/register`: Register for event (or join waitlist).
- `POST /api/v1/players/me/events/{event_id}/cancel`: Cancel registration (triggers waitlist auto-promotion).
