# Aught2 Pickleball — Club & Membership Architecture

This document describes the complete Club & Membership Core architecture implemented in Phase 2.

---

## 1. Core Architecture Principles

1. **Role Belongs to Membership, NOT to User**:
   There is no `role` column on the `users` table. The role is stored on `club_memberships`.
   A single user may belong to multiple clubs and hold different roles in each club.

2. **Strict Three-Role Model**:
   There are exactly three club management roles:
   - `club_owner`: Full club control, member administration, role assignments, financial management.
   - `club_manager`: Day-to-day operations, member viewing, court bookings, tournaments, leagues. Cannot assign roles or manage users.
   - `tournament_director`: Tournament and league management only. No member management access.

3. **Database Is Authoritative**:
   Client requests NEVER supply or dictate roles or permissions. The backend verifies the authenticated user (`get_current_user`), resolves their active membership for the requested club (`get_club_membership`), and checks the centralized permission registry (`has_permission`).

---

## 2. Multi-Club Data Model

```
User (id, email, ...)
  ├── ClubMembership A (club_id=A, role=club_owner) ───────→ Club A (Aught2 Pickleball)
  └── ClubMembership B (club_id=B, role=club_manager) ─────→ Club B (Aught2 Downtown)
```

- Schema constraint: `uq_club_memberships_user_club` ensures a user has at most one membership record per club.
- Reactivation: Deactivated memberships (`is_active = False`) are reactivated in-place when re-added, maintaining historical referential integrity.

---

## 3. Active Club Concept (Mobile)

- **Client-Side Session Context Only**:
  The active club selection is stored in Zustand (`activeMembership`) and does NOT grant authorization.
- **Security Guarantee**:
  Any API request targeting a club must supply the club ID in the URL path. The backend independently validates that the caller holds an active membership and sufficient permissions for that specific club.
- **Session Persistence**:
  When a user logs in or launches the app:
  1. `POST /auth/login` or `GET /auth/me` returns `memberships: MembershipInfo[]`.
  2. The mobile app sets `activeMembership` to the first available membership.
  3. The user can switch active club at any time using the `ClubSwitcher` component.
  4. Changing active club triggers automatic query invalidation via TanStack Query, refreshing club-scoped data.

---

## 4. Owner Safety Rules

A club must never be left without an active owner. The backend enforces this invariant on all member mutation endpoints:

1. **Rule**: A club must always have at least one active owner (`is_active = True` and `role = club_owner`).
2. **Demotion Protection**: When modifying a member's role via `PATCH /clubs/{club_id}/members/{membership_id}`, if the target is currently an active owner and the new role is not `club_owner`, the system verifies `count_active_owners(club_id) > 1`. If not, returns `400 Bad Request` with:
   `"Cannot change role: club must have at least one active owner"`.
3. **Deactivation Protection**: When deactivating a member via `DELETE /clubs/{club_id}/members/{membership_id}` or `PATCH` with `is_active: false`, if the target is currently an active owner, the system verifies `count_active_owners(club_id) > 1`. If not, returns `400 Bad Request` with:
   `"Cannot deactivate the final active owner of the club"`.

---

## 5. API Flow & Endpoints

Base: `/api/v1`

### 1. `GET /clubs`
- **Caller**: Any authenticated user.
- **Returns**: List of clubs the user belongs to (`id`, `name`, `slug`, `role`, `role_label`, `membership_is_active`).
- **Isolation**: Never returns clubs the caller does not belong to.

### 2. `GET /clubs/{club_id}`
- **Caller**: Active member of `club_id`.
- **Returns**: Club details (`id`, `name`, `slug`, `description`, `is_active`).
- **Security**: Unknown clubs return `404`. Inactive memberships or non-members receive `403`.

### 3. `GET /clubs/{club_id}/membership`
- **Caller**: Active member of `club_id`.
- **Returns**: Caller's own membership record in `club_id`.

### 4. `GET /clubs/{club_id}/members`
- **Authorization**: Requires `manage_members` permission.
  - `club_owner`: Allowed.
  - `club_manager`: Allowed.
  - `tournament_director`: 403 Forbidden.
- **Returns**: List of all club members with user details and roles.

### 5. `POST /clubs/{club_id}/members`
- **Authorization**: Requires `manage_roles` permission (`club_owner` only).
- **Body**: `{ email: string, role: ClubRole }`.
- **Validation**:
  - Target user must exist (404 if not found).
  - Target user must not already be an active member (400 if already active).
  - If previously deactivated, reactivates membership and updates role.
  - Role must be one of `club_owner`, `club_manager`, `tournament_director` (422 if invalid).

### 6. `PATCH /clubs/{club_id}/members/{membership_id}`
- **Authorization**: Requires `manage_roles` permission (`club_owner` only).
- **Body**: `{ role?: ClubRole, is_active?: boolean }`.
- **Validation**:
  - Enforces Owner Safety Rules.
  - Does not allow changing `user_id` or `club_id`.

### 7. `DELETE /clubs/{club_id}/members/{membership_id}`
- **Authorization**: Requires `manage_roles` permission (`club_owner` only).
- **Behavior**: Soft-deactivates member (`is_active = False`).
- **Validation**: Enforces Owner Safety Rules.

---

## 6. Mobile Components & Hooks

- `useActiveClub()`: Provides current active club ID, name, role, role label, and `switchClub(membership)` method.
- `usePermission()`: UX helper providing `canManageMembers`, `canManageRoles`, `canManageTournaments`, `canManageSettings`.
- `useClubMembers(clubId)`: TanStack Query hook managing member lists, `addMember`, `updateMember`, and `deactivateMember` mutations.
- `ClubSwitcher`: Reusable header component displaying current club and role badge, with an interactive modal for multi-club switching.
- `members.tsx`: Role-aware member directory screen. Club Owners can add members, change roles, and deactivate memberships. Club Managers have read-only access. Tournament Directors are restricted.
