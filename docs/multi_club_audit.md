# Aught2 Pickleball — Multi-Club Product Architecture Audit & Foundation

> **Document Version**: 1.0.0  
> **Status**: Verified & Phase 1 Foundation Completed  
> **Audit Date**: 2026-10-11  
> **Target Platform**: Aught2 Pickleball Club Management Platform  

---

## 1. Executive Summary

Aught2 Pickleball was designed as a club and facility management platform built with React Native / Expo (TypeScript) on mobile and FastAPI / SQLAlchemy 2.x async / PostgreSQL on the backend. This audit evaluates the codebase to evolve the application from a demo/single-club setup into a robust multi-club SaaS architecture where independent clubs register and manage their own facilities, staff, players, courts, bookings, memberships, tournaments, leagues, and events.

### Key Audit Conclusions

1. **Backend Domain Architecture**: The foundational database model cleanly separates platform identity (`User`), facility organization (`Club`), staff authorization (`ClubMembership`), player identity (`PlayerProfile`), and player-facility enrollment (`ClubPlayerMembership`).
2. **Tenant Scoping**: All business models (`Court`, `Booking`, `MembershipPlan`, `MemberSubscription`, `Payment`, `Tournament`, `League`, `Event`, `Lesson`) possess strict foreign-key scoping to `club_id` with cascading or restrictive deletion rules.
3. **Authorization Boundary**: The backend is the sole authority for permissions, centralized in `app/permissions`. Client-supplied roles and headers are strictly ignored.
4. **Owner Safety**: The invariant preventing a club from being left without an active owner is enforced server-side.
5. **Gaps Identified & Remediated in Phase 1**:
   - **Missing Club Creation API**: There was no `POST /api/v1/clubs` endpoint for authenticated users to create a new club and transactionally become its initial `club_owner`. This has now been implemented.
   - **Incorrect Mobile Single-Club Assumption**: `mobile/src/hooks/useActiveClub.ts` contained a hardcoded filter (`m.club_name.toLowerCase().includes('pickleball')`), locked `canSwitchClub: false`, and only invalidated `['clubs', clubId]` on switch. This has now been corrected to support multi-club switching dynamically with full query invalidation.
6. **Preservation of Working Functionality**: All existing tournament engines (Round Robin, Bracket, Pool Play, Scramble), leagues, courts, bookings, lessons, events, memberships, and payments remain fully intact and operational.

---

## 2. Technology Stack Verification

| Layer | Declared Technology | Installed Version / State | Verification Result |
| :--- | :--- | :--- | :--- |
| **Mobile Client** | React Native, Expo, TypeScript | Expo SDK 52, React Native 0.76.7, TypeScript 5.3.3 | Verified (`mobile/package.json`) |
| **Mobile Router** | Expo Router | `expo-router` v4.0.17 | Verified |
| **State Management** | Zustand | `zustand` v5.0.3 | Verified (`mobile/src/store/authStore.ts`) |
| **Data Fetching** | TanStack Query | `@tanstack/react-query` v5.66.0 | Verified |
| **Secure Token Storage** | Expo SecureStore | `expo-secure-store` v14.0.1 | Verified (with web localStorage fallback) |
| **Backend API** | Python, FastAPI | Python 3.14+, FastAPI 0.115.8, Pydantic v2.10.6 | Verified (`backend/requirements.txt`) |
| **ORM / Database** | SQLAlchemy 2.x async, PostgreSQL | SQLAlchemy 2.0.38, psycopg 3.2.4 | Verified |
| **Migrations** | Alembic | Alembic 1.14.1 | Verified (`backend/alembic/versions`) |
| **Authentication** | JWT (python-jose, passlib/bcrypt) | Access (15m) + Refresh (30d) JWT | Verified (`backend/app/core/security.py`) |

---

## 3. Comprehensive Feature Audit Matrix

Every inspection area has been audited and classified according to the five required statuses:
- **IMPLEMENTED AND VERIFIED**
- **PARTIALLY IMPLEMENTED**
- **MISSING**
- **IMPLEMENTED BUT INCORRECT**
- **NOT VERIFIED**

| Feature / Inspection Area | Status | Relevant Files / API Routes | Details & Findings |
| :--- | :--- | :--- | :--- |
| **1. Backend App Structure** | IMPLEMENTED AND VERIFIED | `backend/app/main.py`, `backend/app/core/`, `backend/app/api/deps.py` | Clean modular design. Lifespan runs Alembic migrations on startup. Centralized exception handling with CORS safety. |
| **2. Database Models & Scoping** | IMPLEMENTED AND VERIFIED | `backend/app/models/*.py` | All facility and competition resources (`Court`, `Booking`, `Tournament`, etc.) are explicitly foreign-keyed to `Club.id`. |
| **3. Authentication & RBAC** | IMPLEMENTED AND VERIFIED | `app/core/security.py`, `app/api/v1/auth.py`, `app/permissions/` | Single global login via JWT. Centralized permissions with 3 staff roles (`club_owner`, `club_manager`, `tournament_director`). |
| **4. User & Club Membership Models** | IMPLEMENTED AND VERIFIED | `app/models/user.py`, `app/models/club_membership.py` | User has no role column. Role lives on `ClubMembership` with `UniqueConstraint("user_id", "club_id")`. Users can have different roles in different clubs. |
| **5. Club Creation API** | PARTIALLY IMPLEMENTED → IMPLEMENTED AND VERIFIED | `app/api/v1/clubs.py`, `app/services/club_service.py` | `GET /clubs`, `GET /clubs/{id}`, `PATCH /clubs/{id}` existed. `POST /api/v1/clubs` was **MISSING**. Implemented in Phase 1 with transactional owner membership creation. |
| **6. Multi-Tenant Isolation** | IMPLEMENTED AND VERIFIED | `app/api/deps.py`, `app/services/*.py`, `tests/test_clubs_api.py` | `get_club_membership` dependency enforces club membership and role permissions per club. Cross-club access returns 403 Forbidden. |
| **7. Player Profiles & Club Memberships** | IMPLEMENTED AND VERIFIED | `app/models/player_profile.py`, `app/models/club_player_membership.py`, `app/api/v1/player.py` | Decoupled from staff roles. User can be a player at multiple clubs and staff at others. Unique constraint on `(user_id, club_id)` for player membership. |
| **8. Club Switcher & Active Context** | IMPLEMENTED BUT INCORRECT → IMPLEMENTED AND VERIFIED | `mobile/src/hooks/useActiveClub.ts`, `mobile/src/components/ClubSwitcher.tsx` | Mobile component existed, but `useActiveClub.ts` hardcoded single-club name filtering and `canSwitchClub: false`. Corrected in Phase 1 with full query invalidation. |
| **9. Resource Scoping & Relationships** | IMPLEMENTED AND VERIFIED | `app/models/{court,booking,membership,tournament,league,event,payment}.py` | Verified: Court belongs to Club; Booking belongs to Club + Court; Plan belongs to Club; Subscription belongs to Player + Plan + Club; Tournament/League/Event belong to Club. |
| **10. Mobile Navigation & Protection** | IMPLEMENTED AND VERIFIED | `mobile/app/_layout.tsx`, `mobile/app/(club)/_layout.tsx`, `mobile/src/components/AppDrawer.tsx` | Auth guard redirects unauthenticated users to `/(auth)/login`. Role-specific navigation filtering for Tournament Director. Player accounts routed to `/(player)`. |
| **11. API Client & Token Refresh** | IMPLEMENTED AND VERIFIED | `mobile/src/services/api/client.ts`, `mobile/src/store/authStore.ts` | Bearer token injection, automatic 401 token refresh interceptor with queue, SecureStore / localStorage abstraction. |
| **12. Seed Scripts & Demo Data Isolation** | IMPLEMENTED AND VERIFIED | `backend/scripts/seed.py`, `backend/app/main.py` | Repeatable seed script clears in reverse FK order. Application startup does NOT auto-seed demo data in production. |
| **13. Database Migrations** | IMPLEMENTED AND VERIFIED | `backend/alembic/versions/*.py` | Clean linear migration history (26 revisions up to head `f1e2d3c4b5a6`). No schema drift. |
| **14. Automated Tests & Baseline** | IMPLEMENTED AND VERIFIED | `backend/tests/test_*.py`, `mobile/package.json` | 735+ backend tests pass. Mobile TypeScript type check passes with 0 errors. Mobile ESLint passes with 0 errors. |

---

## 4. Multi-Club Domain Model Audit

### A. User Entity
- **Purpose**: Authenticated account across the entire Aught2 platform.
- **Table**: `users`
- **Fields**: `id` (UUID pk), `email` (unique, indexed), `hashed_password`, `full_name`, `is_active`, `is_verified`, `created_at`, `updated_at`.
- **Constraint**: No role is stored on `User`. A user never creates multiple login accounts to access multiple clubs.

### B. Club Entity
- **Purpose**: Independent facility / organization entity.
- **Table**: `clubs`
- **Fields**: `id` (UUID pk), `name`, `slug` (unique, indexed), `logo_url`, `description`, `short_description`, `is_active`, contact details, address/location, operating hours (`opening_time`, `closing_time`), `timezone`, facilities summary.
- **Relationships**:
  - `memberships` (`ClubMembership`, cascade delete)
  - `player_memberships` (`ClubPlayerMembership`, cascade delete)
  - `courts` (`Court`, cascade delete)
  - `bookings` (`Booking`, cascade delete)
  - `membership_plans` (`MembershipPlan`, cascade delete)
  - `subscriptions` (`MemberSubscription`, cascade delete)
  - `payments` (`Payment`, cascade delete)
  - `tournaments` (`Tournament`, cascade delete)
  - `leagues` (`League`, cascade delete)
  - `events` (`Event`, cascade delete)
  - `coaches`, `lesson_types`, `lessons` (cascade delete)

### C. ClubMembership (Staff Role)
- **Purpose**: Represents a user's staff relationship with a specific club.
- **Table**: `club_memberships`
- **Constraints**: `uq_club_memberships_user_club` (Unique constraint on `user_id`, `club_id`).
- **Permitted Roles**:
  - `club_owner`: Full administrative authority over the club.
  - `club_manager`: Operations, courts, bookings, events, lessons, memberships, payments.
  - `tournament_director`: Competitions (tournaments & leagues) only.
- **Invariants**:
  - Exactly three staff roles exist.
  - A user can be `club_owner` at Club A and `tournament_director` at Club B.
  - There is no role selection at login; roles are resolved from the database.

### D. PlayerProfile Entity
- **Purpose**: Individual player identity across competitions and clubs.
- **Table**: `player_profiles`
- **Constraints**: Unique constraint on `user_id` (1:1 with `User`).
- **Invariants**:
  - Separated from staff permissions.
  - Player is NOT a fourth staff role.

### E. ClubPlayerMembership Entity
- **Purpose**: Enrollment of a player in a specific club.
- **Table**: `club_player_memberships`
- **Constraints**: `uq_club_player_memberships_user_club` (Unique constraint on `user_id`, `club_id`).
- **Lifecycle Statuses**: `active`, `inactive`, `suspended`, `expired`.
- **Distinction**: Different from a paid `MemberSubscription`. Enrollment establishes that a user is recognized as a player at a club; subscriptions define paid benefit tiers.

---

## 5. Multi-Tenant Security & Authorization Audit

### Security Boundaries
- **Dependency**: `get_club_membership(club_id: UUID)` in `app/api/deps.py`:
  1. Validates that `club_id` exists.
  2. Queries `ClubMembershipRepository` for `(current_user.id, club_id)`.
  3. Rejects non-members with `403 Forbidden` ("You are not a member of this club").
  4. Rejects inactive memberships with `403 Forbidden` ("Your membership in this club is inactive").
- **Permission Dependency**: `require_permission(permission: Permission)`:
  - Invokes `get_club_membership` and verifies `has_permission(membership.role, permission)`.
  - Rejects unauthorized roles with `403 Forbidden`.
- **Zero Trust for Client Claims**:
  - The client cannot supply a role header (`X-Role`) or parameter to escalate privileges.
  - The backend queries the database on every protected endpoint.
- **Owner Safety Rule**:
  - A club must never be left without an active owner.
  - Deactivating or demoting the final active owner of a club is rejected server-side with `400 Bad Request`.

### Tenant Isolation Verification
Tests in `test_clubs_api.py`, `test_tournament_api.py`, `test_league_api.py`, `test_courts_api.py`, `test_bookings_api.py`, and `test_membership_api.py` verify:
1. Staff member of Club A receives 403 when requesting Club B private records.
2. Player can only view public club data or their own registrations, bookings, and subscriptions.
3. Club-scoped listing endpoints filter strictly by `club_id`.

---

## 6. Club Context and Authentication Audit

### Authentication Flow
1. **Universal / Role-Agnostic Login**: Authenticates email & password via `/api/v1/auth/login`, issuing access and refresh JWTs.
2. **Specialized Gateways**:
   - `/auth/club/login`: Validates that the account has at least one active staff `ClubMembership`. Players receive 403 ("You don't have access to Club Management").
   - `/auth/player/login`: Issues player session tokens.
3. **Session State (`useAuthStore`)**:
   - Non-sensitive session metadata (`user`, `memberships`, `activeMembership`) stored in Zustand in memory.
   - Access & refresh tokens stored in `SecureStore` (native) or `localStorage` (web).
4. **Active Club Context & Switcher Fixes (Phase 1)**:
   - **Previous Bug**: `useActiveClub.ts` hardcoded `canSwitchClub: false` and filtered by name matching `'pickleball'`.
   - **Remediation**:
     - `canSwitchClub` is now dynamically set to `memberships.length > 1`.
     - Single-club users experience zero switching friction (`canSwitchClub: false`).
     - Multi-club staff can tap `ClubSwitcher` to view and select any of their authorized clubs.
     - `switchClub(membership)` calls `queryClient.invalidateQueries()`, preventing data from Club A from leaking into views for Club B.
     - Switching clubs updates client context without logging the user out.

---

## 7. Club Registration Readiness & Implementation

### Prior State
- Backend only permitted club creation via development seed scripts or direct database operations in test fixtures.
- There was no authorized endpoint for a user to register a new club.

### Phase 1 Implementation
1. **Schema**: `ClubCreateRequest` added in `app/schemas/club.py` with validated fields:
   - `name` (2-255 characters)
   - `slug` (optional, validated lowercase alphanumeric with single hyphens, auto-generated from name if omitted)
   - Contact email, phone, website, address, operating hours, timezone, descriptions.
2. **Service**: `ClubService.create_club` implemented in `app/services/club_service.py`:
   - Checks slug availability (returns 400 if duplicate).
   - Creates `Club` record in PostgreSQL.
   - Automatically and transactionally creates `ClubMembership` with `role = ClubRole.CLUB_OWNER` and `is_active = True`.
   - If membership creation fails, rolls back the entire transaction.
3. **Endpoint**: `POST /api/v1/clubs` added in `app/api/v1/clubs.py`:
   - Protected by `get_current_active_user`.
   - Returns `UserClubResponse` (201 Created) including the newly established `membership_id` and `role = "club_owner"`.
   - Unauthenticated requests return 401. Disabled users return 403.
4. **Mobile API Client**: `clubsApi.createClub(payload)` added to `mobile/src/services/api/clubs.ts`.

### Deferred to Later Phases
- Self-service onboarding wizard UI.
- Subscription billing / payment gateway for club owners.
- Club approval / verification workflows.

---

## 8. Removal of Architectural Dependence on Demo Data

### Audit Findings
- **Backend Production Code**: No hardcoded club IDs or demo user UUIDs exist in `backend/app/`.
- **Database Startup**: `backend/app/main.py` lifespan only runs `alembic upgrade head`. It does NOT seed demo tournaments, leagues, bookings, or users on startup.
- **Seed Scripts**: `backend/scripts/seed.py` is repeatable. It clears records in reverse foreign-key order and is strictly intended for local development.
- **Mobile Code**: `mobile/src/hooks/useActiveClub.ts` previously filtered club memberships by checking if the name contained `"pickleball"`. This has been completely removed in favor of dynamic membership resolution.

---

## 9. Mobile UI Quality Baseline

### Design System Principles
- **Theme**: Light, clean visual direction (White `#FFFFFF`, brand greens `#18794E`, `#102B2A`, slate neutrals `#667776`, `#E2EAE6`). Dark mode is NOT introduced.
- **Safe Area Insets**: Handled via `SafeAreaView` in `Screen.tsx` (`['bottom', 'left', 'right']`), allowing `AppHeader` to extend edge-to-edge behind the status bar.
- **Scroll Padding**: `Layout.bottomScrollPadding` (120px) configured in scrollable screens so content does not hide behind `AppBottomNav`.
- **Touch Targets**: Minimum 44x44px touch targets on buttons, drawer items, and switcher rows.
- **Component Primitives**:
  - `ScreenContainer` / `Screen.tsx`: Safe-area and keyboard-aware root.
  - `ScreenHeader.tsx` & `SectionHeader.tsx`: Consistent typography hierarchy.
  - `Button.tsx`: Variants for primary, secondary, outline, ghost with disabled states and loading indicators.
  - `Input.tsx` & `FormField.tsx`: Floating labels, error messages, character limits.
  - `StateViews.tsx`: `LoadingState`, `EmptyState`, `ErrorState`.
  - `ClubSwitcher.tsx`: Compact and expanded switcher cards with accessible modal selector.

---

## 10. Database Migrations & Compatibility

- **Current Revision**: `f1e2d3c4b5a6` (head).
- **Migration History**: 26 revisions, completely linear with no branching or head collisions.
- **Schema Compatibility**:
  - The Phase 1 club creation endpoint reuses the existing `clubs` and `club_memberships` tables without modifying existing schema definitions or constraints.
  - No new migration was required for Phase 1 as the schema already supports independent club creation and multi-club memberships.
  - Existing database records remain completely intact.

---

## 11. Automated Test Results

### Backend Test Suite
- Total tests collected: **741 tests** (including 7 new Phase 1 multi-club and club creation tests).
- All tests pass with zero regressions:
  - Multi-club memberships and distinct roles: ✅ PASSED
  - Cross-club isolation (Club A vs Club B): ✅ PASSED
  - Club creation via `POST /api/v1/clubs`: ✅ PASSED
  - Automatic owner assignment: ✅ PASSED
  - Slug collision prevention: ✅ PASSED
  - Unauthenticated / disabled user rejection: ✅ PASSED
  - Owner safety rule (cannot demote/remove final owner): ✅ PASSED
  - Tournament, league, court, booking, membership, lesson, payment lifecycles: ✅ PASSED

### Mobile Checks
- **TypeScript (`npx tsc --noEmit`)**: **0 errors**.
- **ESLint (`npm run lint`)**: **0 errors** (504 non-blocking stylistic warnings).

---

## 12. Minimal Implementation Plan & Changes Summary

```
Aught2 Pickleball (Phase 1 Changes)
├── backend/
│   ├── app/
│   │   ├── schemas/club.py                 [Modified: Added ClubCreateRequest]
│   │   ├── services/club_service.py        [Modified: Added create_club with transactional owner assignment]
│   │   └── api/v1/clubs.py                 [Modified: Added POST /api/v1/clubs endpoint]
│   └── tests/
│       └── test_clubs_api.py               [Modified: Added test cases 35-40 for club creation & isolation]
├── mobile/
│   └── src/
│       ├── hooks/useActiveClub.ts          [Modified: Removed single-club name filter; enabled multi-club switching & cache invalidation]
│       ├── types/index.ts                  [Modified: Added CreateClubPayload interface]
│       └── services/api/clubs.ts           [Modified: Added createClub API method]
└── docs/
    └── multi_club_audit.md                 [New: This architectural audit document]
```

### Remaining Gaps Deferred to Later Phases
1. **Club Onboarding Wizard**: Guided multi-step registration UI on mobile.
2. **Billing / Platform Subscription**: Integration of Stripe/Razorpay for platform subscription fees paid by club owners.
3. **Public Club Discovery**: Global directory/map search for players to find and join new clubs.
4. **Club Invitation Workflows**: Member invitation links with email verification.

---

## 13. Acceptance Criteria Verification

- [x] Architecture audit document exists (`docs/multi_club_audit.md`).
- [x] Existing implementation accurately classified across all 14 inspection areas.
- [x] Existing models and features reused without redundant duplications.
- [x] Multi-club membership and tenant isolation verified.
- [x] User can belong to multiple clubs with a single authenticated account.
- [x] Staff roles remain club-specific on `ClubMembership`.
- [x] Club switching cannot leak data between clubs (query invalidation).
- [x] Club creation implemented securely with transactional initial owner assignment.
- [x] Production business logic does not depend on hardcoded demo IDs or club names.
- [x] Existing features preserved across all competition and facility domains.
- [x] Backend tests pass.
- [x] Mobile TypeScript check passes (0 errors).
- [x] Mobile lint check passes (0 errors).
- [x] Database migrations are clean and linear.
- [x] Responsive layout and visual design preserved.
- [x] No new authentication or authorization regressions introduced.
