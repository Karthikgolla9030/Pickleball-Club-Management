# Aught2 Pickleball — Player & Club Member Architecture

This document describes the Player & Club Member Foundation implemented in Phase 3.

---

## 1. Domain Separation Principles

A fundamental principle of the Aught2 Pickleball architecture is the strict separation between **Staff Roles** (facility management) and **Player Memberships** (playing participation):

| Dimension | Staff Membership (`ClubMembership`) | Player Profile (`PlayerProfile`) | Club Player Membership (`ClubPlayerMembership`) |
| :--- | :--- | :--- | :--- |
| **Domain** | Facility Administration | Individual Identity | Playing Participation |
| **Cardinality** | M:N (`users` ↔ `clubs`) | 1:1 (`users` ↔ `player_profiles`) | M:N (`users` ↔ `clubs`) |
| **Roles / Status** | `club_owner`, `club_manager`, `tournament_director` | N/A (Identity fields) | `active`, `inactive`, `suspended`, `expired` |
| **Permissions** | Granular system capabilities (`MANAGE_MEMBERS`, etc.) | None | None (Subject of club enrollment) |
| **Dual Identity** | Allowed: Staff can also be enrolled as active players | Yes | Allowed: Players can belong to multiple clubs |

> [!IMPORTANT]
> A player is **NOT** a staff role. `PlayerProfile` is not an entry in `ClubRole`. The backend never uses checks like `if role == "player"`.

---

## 2. Relational Schema Architecture

```
User (id, email, full_name, ...)
  │
  ├── 1:1 ──→ PlayerProfile (id, user_id, display_name, phone, date_of_birth, bio, ...)
  │
  ├── 1:N ──→ ClubMembership (id, user_id, club_id, role, is_active)
  │              └── Staff administration at Club A (club_owner)
  │
  └── 1:N ──→ ClubPlayerMembership (id, user_id, club_id, status, membership_number, ...)
                 ├── Enrolled player at Club A (status: active, #AUG-P-001)
                 └── Enrolled player at Club B (status: active, #AUG-DT-001)
```

### Constraints & Indexes
- `uq_player_profiles_user_id`: Unique index enforcing exactly one player profile per user.
- `uq_club_player_memberships_user_club`: Unique constraint enforcing at most one player membership record per user per club.
- Reactivation: If a player was previously expired or inactive, enrolling them reactivates their existing membership record in-place, preserving data integrity.

---

## 3. Centralized Permission Integration

Administration of club-side player memberships is governed strictly by the centralized permission registry:

| Endpoint | Required Permission | Allowed Staff Roles | Denied Roles / Users |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/clubs/{club_id}/player-memberships` | `Permission.MANAGE_MEMBERS` | `club_owner`, `club_manager` | `tournament_director`, non-staff users (403) |
| `POST /api/v1/clubs/{club_id}/player-memberships` | `Permission.MANAGE_MEMBERS` | `club_owner`, `club_manager` | `tournament_director`, non-staff users (403) |
| `PATCH /api/v1/clubs/{club_id}/player-memberships/{id}` | `Permission.MANAGE_MEMBERS` | `club_owner`, `club_manager` | `tournament_director`, non-staff users (403) |

Tournament Directors are strictly forbidden from viewing or modifying club player memberships (`403 Forbidden`).

---

## 4. REST API Specification

### Player Identity Endpoints
- `GET /api/v1/player/profile`: Returns authenticated user's player profile (404 if not yet created).
- `POST /api/v1/player/profile`: Initializes player profile for caller (400 if already exists, 422 if validation fails).
- `PATCH /api/v1/player/profile`: Updates caller's player profile (sanitizes strings, checks birth date in past).
- `GET /api/v1/player/clubs`: Lists all clubs where caller is enrolled as a player.
- `GET /api/v1/player/clubs/{club_id}`: Retrieves caller's player membership record for a specific club (404 if not enrolled).

### Club Player Administration Endpoints
- `GET /api/v1/clubs/{club_id}/player-memberships`: Lists player memberships for the club (filter by status optional).
- `POST /api/v1/clubs/{club_id}/player-memberships`: Enrolls user by email. Reactivates if previously deactivated.
- `PATCH /api/v1/clubs/{club_id}/player-memberships/{membership_id}`: Updates status, membership number, or expiry date. Enforces `expires_at >= joined_at`.

---

## 5. Mobile Experience Architecture

The mobile layer mirrors the backend's strict separation:

1. **Player Experience (`app/(player)`)**:
   - `app/(player)/_layout.tsx`: Tab navigation for `Home`, `My Clubs`, `Events`, and `Profile`.
   - `app/(player)/index.tsx`: Central dashboard showing welcome banner, profile completion card, and enrolled clubs preview.
   - `app/(player)/clubs.tsx`: Displays list of enrolled clubs with status badges, membership numbers, and joined/expiry dates.
   - `app/(player)/profile.tsx`: View and edit player profile with field validation and immediate React Query cache sync.

2. **Club Administration (`app/(club)/members.tsx`)**:
   - Segmented tab control: **Club Players** vs **Staff Roles**.
   - Club staff with `MANAGE_MEMBERS` can enroll new players and edit player membership status.
   - Only `club_owner` can access staff role modifications (enforced by `MANAGE_ROLES` and backend safety rules).
   - Zero hardcoded client role checks: backend is always authoritative.
