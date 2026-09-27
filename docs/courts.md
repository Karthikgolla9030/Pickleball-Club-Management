# Phase 10 — Courts & Court Management

## Overview

Phase 10 establishes the **Courts & Court Management** foundation for Aught2 Pickleball.

A **Court** represents a playable facility surface belonging strictly to a single Club (`Club -> Court`).
Courts are foundational infrastructure for upcoming phases (reservations, bookings, scheduling, open play, and clinics).

---

## Key Principles & Invariants

### 1. Scope Discipline
- **Strictly Phase 10**: No reservation system, booking calendars, payments, lessons, or notifications are implemented in this phase.
- Court availability metadata indicates whether a court is operationally active and available for use, **not** time-slot reservation availability.

### 2. Tenant Isolation
- Every court is bound to a single club (`club_id` non-nullable foreign key with cascade deletion).
- Staff can only view, manage, and reorder courts belonging to their authenticated club.
- Cross-club access returns `403 Forbidden` or `404 Not Found`.

### 3. Role-Based Access Control (RBAC)
- **Staff Operations (`club_owner`, `club_manager`)**:
  - Full CRUD permissions via `Permission.MANAGE_COURTS`.
  - Create courts, update court metadata, activate/deactivate, and reorder.
- **Tournament Directors & Players**:
  - `tournament_director` does NOT have `MANAGE_COURTS` permission; attempts to create, update, or reorder courts return `403 Forbidden`.
  - Players have read-only access to active courts via `/api/v1/clubs/{club_id}/courts/active`.
  - **Inactive courts are NEVER returned to players**.

### 4. Soft Deactivation Lifecycles
- Courts are not hard-deleted in normal operations to protect historical competition records and future booking relationships.
- Deactivating a court sets `is_active = False` and `status = "inactive"`.
- Reactivation restores `is_active = True` and `status = "active"`.

### 5. Deterministic Display Order
- Every court has a sequential `display_order` (0-indexed).
- New courts without an explicit `display_order` are automatically appended to the end of the club's sequence (`max(display_order) + 1`).
- Reordering is validated and executed transactionally:
  - Reorder list must contain all courts belonging to the club.
  - Reorder list must not contain duplicates or foreign court IDs.

### 6. Unique Constraints
- `court_number` is unique within a club (`(club_id, court_number)` unique constraint).
- `name` is unique within a club (`(club_id, name)` unique constraint).
- Different clubs may share the same court numbers (e.g. both Club A and Club B can have Court #1).

---

## Data Model

### Court Model (`courts` table)
- `id`: UUID (Primary Key, default uuid4)
- `club_id`: UUID (Foreign Key to `clubs.id`, indexed)
- `name`: String(100), non-null (e.g., "Court 1", "Stadium Court")
- `display_name`: String(100), nullable (e.g., "Center Court")
- `description`: Text, nullable
- `court_number`: SmallInteger, nullable, indexed
- `surface_type`: String(50), nullable (e.g., "Acrylic", "Sport Court", "Concrete")
- `indoor_outdoor`: Enum (`indoor`, `outdoor`, `covered`), default `indoor`
- `status`: Enum (`active`, `inactive`), default `active`, indexed
- `is_active`: Boolean, default `True`, indexed
- `display_order`: SmallInteger, non-null, default 0, indexed
- `created_at`: DateTime (UTC)
- `updated_at`: DateTime (UTC)

---

## API Endpoints

### Club Staff Endpoints (`/api/v1/clubs/{club_id}/courts`)
Requires `Permission.MANAGE_COURTS` (`club_owner` or `club_manager`):

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | List all courts for club (optional `?status=active\|inactive` filter) |
| `POST` | `/` | Create a new court in the club |
| `PATCH` | `/reorder` | Atomically reorder all courts for the club |
| `GET` | `/{court_id}` | Get full court details |
| `PATCH` | `/{court_id}` | Update court information |
| `POST` / `PATCH` | `/{court_id}/deactivate` | Soft-deactivate court (`is_active=False`, `status="inactive"`) |
| `POST` / `PATCH` | `/{court_id}/reactivate` | Reactivate court (`is_active=True`, `status="active"`) |
| `DELETE` | `/{court_id}` | Soft delete court (deactivation alias) |

### Player-Facing Endpoints (`/api/v1/clubs/{club_id}/courts`)
Available to all authenticated users:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/active` | Returns active courts only in deterministic `display_order` |

---

## Mobile Application

- **Staff Screen (`mobile/app/(club)/courts.tsx`)**:
  - Full courts overview with summary stats (Total, Active, Inactive).
  - Status tabs: All, Active, Inactive.
  - Interactive court cards with number badges, environment badges, surface badges, and status pills.
  - Add Court Modal with real-time validation.
  - Edit Court Modal for metadata updates.
  - Deactivation confirmation dialog to prevent accidental downtime.
  - One-click Move Up / Move Down deterministic reordering controls.
- **Player Screen (`mobile/app/(player)/courts.tsx`)**:
  - Read-only informational screen for enrolled club members.
  - Club switcher chips when enrolled in multiple clubs.
  - Active courts display with surface and environment badges.
  - Zero modification or administration controls.
- **Navigation Integration**:
  - `Courts` tab added to `(club)/_layout.tsx` (visible to users with `canManageCourts`).
  - `Courts` tab added to `(player)/_layout.tsx` (visible to all players).
