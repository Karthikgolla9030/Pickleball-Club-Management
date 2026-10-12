# Aught2 Pickleball — Platform Owner, Club Owner, and Player Authentication Architecture Audit

## 1. Executive Summary & Root Cause Analysis

### Background & Observed Symptoms
In the prior UI build, logging in with owner credentials (`owner@demo.local`) yielded a confusing hybrid state:
- The logged-in drawer menu presented club operational options alongside **"Club Details"**, **"Apply for New Club"**, and **"Platform Applications"**.
- The public login page displayed both Club Staff and Player tabs alongside public **"Quick Fill Demo Account"** buttons (`👑 Owner`, `🛡️ Manager`, `🏆 Director`) directly in production builds (`https://pickleball-club-management.vercel.app`).
- It was unclear whether the demo account was an omnipotent platform owner or an individual club owner, and whether club owners were inadvertently granted cross-club or platform-approval privileges.

### Root Causes Identified
1. **Frontend Menu Bloat**:
   - In `mobile/src/components/AppDrawer.tsx` (lines 200–225) and `mobile/src/navigation/navigationConfig.ts`, items for `register_club` ("Apply for New Club") and `platform_applications` ("Platform Applications") were statically placed under `role === 'club_owner'` condition inside the club-scoped drawer.
   - Ordinary club owners were shown platform application review links in their club drawer navigation even though backend endpoints properly guarded platform access.
2. **Ungated Demo Credentials UI**:
   - `mobile/app/(auth)/login.tsx` rendered the demo account quick-fill row (`👑 Owner`, `🛡️ Manager`, `🏆 Director`) unconditionally without verifying environment flags (`__DEV__` or environment variables). Consequently, production web builds leaked demo credentials directly into the public interface.
3. **Absence of Dedicated Platform Administrative Experience**:
   - The platform review screen had previously been mounted inside the club routing group (`(club)/platform-applications.tsx`), sharing club tab navigation, drawer layout, and auth context with ordinary club management.
   - Platform administration lacked an isolated entry point (`/platform/login`) and dedicated layouts decoupled from club multi-tenant session state.

---

## 2. Verified Identity & Permissions of the Demo Owner

We traced `owner@demo.local` through the backend database models, migrations, and seed scripts (`backend/scripts/seed.py` lines 150–225):

| Attribute | Verified Value | Meaning & Scope |
| :--- | :--- | :--- |
| **User ID** | Deterministic UUID | Standard User record in `users` table |
| **Email** | `owner@demo.local` | Seeded demo user |
| **Club Memberships** | Exactly 1 membership (`aught2-pickleball`) | Scoped strictly to `Aught2 Pickleball Club` |
| **Club Role** | `ClubRole.CLUB_OWNER` (`club_owner`) | Authorized club administrator for single club |
| **Player Profile** | Linked player profile (`AUG-P-002`) | Allows recreational participation |
| **Platform Owner Authorization** | **False** (Not in `PLATFORM_OWNER_EMAILS`) | **Not a Platform Owner** |
| **Attempt to access `/api/v1/platform/*`** | **HTTP 403 Forbidden** | Server-side rejected |

### Key Conclusion
`owner@demo.local` is **an ordinary Club Owner for a single club**. It is **not** a platform owner. It must never see platform application review screens or "Apply for New Club" in its primary management navigation.

---

## 3. Implemented Platform Authorization Model

To ensure strict separation without corrupting the domain model:
1. **Preserved Club Roles**:
   - `ClubRole` enum strictly remains:
     - `club_owner`
     - `club_manager`
     - `tournament_director`
   - **No** `platform_admin` or `super_admin` was added to `ClubRole`.
2. **Explicit Platform Authorization Mechanism**:
   - Platform authorization is configured via `PLATFORM_OWNER_EMAILS` in `Settings` (`backend/app/core/config.py`).
   - Server-side dependency `get_current_platform_owner` in `backend/app/api/deps.py` enforces:
     - Valid JWT authentication.
     - Active user account status.
     - Verification that `user.email.lower()` is in configured `PLATFORM_OWNER_EMAILS`.
     - Returns HTTP 403 Forbidden for any unauthorized user (including club owners).
3. **Independent Platform Login Endpoint**:
   - `POST /api/v1/auth/platform/login`:
     - Verifies credentials.
     - Checks user active state.
     - Checks `PLATFORM_OWNER_EMAILS` authorization.
     - Emits JWT access token with an empty `memberships` list (`memberships=[]`), isolating platform sessions from club tenant scopes.
4. **Dedicated Platform Endpoints**:
   - `GET /api/v1/platform/me`: Returns platform identity details (`email`, `full_name`, `is_platform_owner: true`).
   - `GET /api/v1/platform/clubs`: Returns platform-wide directory of all registered clubs with active status and membership totals.
   - `GET /api/v1/platform/club-applications`: Lists paginated club registration requests.
   - `POST /api/v1/platform/club-applications/{id}/approve`: Approves application transactionally and provisions initial club & owner.
   - `POST /api/v1/platform/club-applications/{id}/reject`: Rejects application with reason.

---

## 4. Experiences & Navigation Architecture

Three cleanly separated experiences are now established:

```
                                 [ Aught2 Pickleball ]
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
[ 1. Player Experience ]        [ 2. Club Management ]          [ 3. Platform Administration ]
  - Login: /login (Player tab)     - Login: /login (Staff tab)     - Login: /platform/login
  - Register: /register            - Register: /register-club      - Portal: /platform/applications
  - Discovery & Court Booking      - Status: /application-status   - Directory: /platform/clubs
  - Tournaments & Leagues          - Scoped to active club         - Review & Approvals only
  - No club staff access           - Role: owner/mgr/director      - No club private data access
```

### Experience A: Platform Owner (`/platform/login` & `/platform/applications`)
- **Entry Point**: Discreet link on sign-in screen or direct URL `/platform/login`.
- **Navigation**:
  - Platform Applications Review (`/(platform)/applications`).
  - Registered Clubs Directory (`/(platform)/clubs`).
- **Isolation**:
  - Protected by frontend route layout guard (`mobile/app/(platform)/_layout.tsx`) that verifies platform access via `platformApplicationsApi.getPlatformMe()`.
  - Backed by server-side `get_current_platform_owner` on every API route.
  - Cannot access private club bookings, court logs, or member financials without explicit club authorization.

### Experience B: Club Owner & Club Staff (`/(club)/*`)
- **Entry Point**: Public Sign In → **Club Staff** tab.
- **Drawer Menu Corrections**:
  - Removed "Apply for New Club".
  - Removed "Platform Applications".
  - "Club Details" strictly navigates to the selected club's profile.
- **Tenant Scope & Club Switcher**:
  - When user has multiple memberships, `ClubSwitcher` allows switching only among authorized clubs.
  - Removed "Apply for New Club" button from the club switcher modals.
  - All club operations pass `clubId` belonging to the user's active membership.

### Experience C: Player Experience (`/(player)/*`)
- **Entry Point**: Public Sign In → **Player** tab or registration (`/register`).
- **Isolation**:
  - Self-registration creates `User` + `PlayerProfile`. Does **not** create `ClubMembership` or `Club`.
  - Denied access to `/api/v1/auth/club/login` and club management endpoints.
  - Dual-role support: If a user has both a player profile and a staff membership, they can switch contexts by logging in to the respective portal cleanly without data pollution.

---

## 5. API Authorization Changes

| Endpoint | Method | Previous Status | Corrected Authorization |
| :--- | :---: | :--- | :--- |
| `/api/v1/auth/platform/login` | `POST` | *Did not exist* | Requires valid user in `PLATFORM_OWNER_EMAILS`. Returns platform auth token. |
| `/api/v1/platform/me` | `GET` | *Did not exist* | Restricted to `get_current_platform_owner`. Returns platform profile. |
| `/api/v1/platform/clubs` | `GET` | *Did not exist* | Restricted to `get_current_platform_owner`. Returns list of all registered clubs. |
| `/api/v1/platform/club-applications` | `GET` | Club owner could view | Restricted to `get_current_platform_owner`. |
| `/api/v1/platform/club-applications/{id}/approve` | `POST` | Unscoped | Restricted to `get_current_platform_owner`. Transactionally creates club & owner membership. |
| `/api/v1/platform/club-applications/{id}/reject` | `POST` | Unscoped | Restricted to `get_current_platform_owner`. |
| `/api/v1/clubs` | `POST` | Ambiguous | Restricted to `get_current_platform_owner`. Public applicants use `/api/v1/club-applications`. |

---

## 6. Database & Migration Safety

- **Zero Breaking Schema Changes**:
  - Reused existing `User`, `Club`, `ClubMembership`, `ClubApplication`, and `PlayerProfile` models.
  - Preserved all foreign keys, uniqueness constraints, and indices.
- **No Role Enum Changes**:
  - Preserved `ClubRole` as `('club_owner', 'club_manager', 'tournament_director')`.
- **Application Transition Idempotency**:
  - Applications transition from `pending` to `approved` or `rejected`.
  - Transactional lock ensures concurrent approval requests are rejected with `409 Conflict` or `400 Bad Request`.
  - Approving creates exactly 1 `club_owner` membership.

---

## 7. Demo Credential Security Findings & Remediation

### Finding
In `mobile/app/(auth)/login.tsx`, the demo quick-fill buttons (`👑 Owner`, `🛡️ Manager`, `🏆 Director`) were displayed unconditionally, allowing any visitor to the Vercel production URL to click and inspect demo accounts.

### Remediation Applied
1. Gated demo buttons with:
   ```typescript
   const SHOW_DEMO_CREDENTIALS = Boolean(
     __DEV__ || process.env.EXPO_PUBLIC_SHOW_DEMO_CREDENTIALS === 'true'
   );
   ```
2. In production builds (`npm run build` / `npx expo export`), `__DEV__` evaluates to `false` and `EXPO_PUBLIC_SHOW_DEMO_CREDENTIALS` is undefined, suppressing demo account quick-fill completely.
3. Added a visual `DEV ONLY` badge in development mode so developers are clearly aware of its scope.

---

## 8. Tests Executed & Actual Results

All tests below were **actually executed** in the local environment and passed cleanly:

### 1. Platform Owner Architecture Suite
**Command**: `.\venv\Scripts\python.exe -m pytest tests/test_platform_owner_architecture.py -v`
**Output**: `5 passed in 4.73s`
- `test_platform_owner_login_success`: PASSED (Platform owner logs in with isolated memberships)
- `test_club_owner_cannot_login_to_platform_endpoint`: PASSED (Ordinary club owner denied platform login with 403)
- `test_platform_me_and_clubs_directory`: PASSED (Platform owner fetches `/platform/me` and `/platform/clubs`)
- `test_club_owner_denied_platform_endpoints`: PASSED (Club owner denied `/platform/me`, `/platform/clubs`, and `/platform/club-applications`)
- `test_dual_role_user_player_and_staff`: PASSED (Dual user accesses player and club staff APIs independently)

### 2. Club Registration Approval Suite
**Command**: `.\venv\Scripts\python.exe -m pytest tests/test_club_registration_approval.py -v`
**Output**: `14 passed in 9.31s`
- `test_01_public_applicant_submits_valid_application`: PASSED
- `test_02_invalid_input_rejected`: PASSED
- `test_03_duplicate_applications_prevented`: PASSED
- `test_05_and_06_submission_does_not_grant_owner_membership_or_session`: PASSED
- `test_07_pending_applicant_cannot_access_owner_dashboard`: PASSED
- `test_08_rejected_applicant_cannot_access_owner_dashboard`: PASSED
- `test_09_unauthorized_user_cannot_approve_or_reject`: PASSED
- `test_10_11_12_authorized_platform_owner_approves_application`: PASSED
- `test_15_repeated_approval_rejected`: PASSED
- `test_17_18_existing_owners_and_managers_retain_permissions`: PASSED
- `test_21_status_lookup_requires_matching_email`: PASSED
- `test_16_concurrent_approval_defense`: PASSED
- `test_19_and_20_multi_club_and_cross_club_isolation`: PASSED
- `test_22_existing_data_remains_unaffected`: PASSED

### 3. Two-Sided Authentication & Role-Based Access Control Suite
**Command**: `.\venv\Scripts\python.exe -m pytest tests/test_two_sided_auth.py -v`
**Output**: `11 passed in 10.14s`
- `test_club_owner_login_success`: PASSED
- `test_club_manager_login_success`: PASSED
- `test_tournament_director_login_success`: PASSED
- `test_player_login_success`: PASSED
- `test_player_rejected_from_club_login`: PASSED
- `test_club_manager_cannot_manage_staff`: PASSED
- `test_tournament_director_cannot_view_members`: PASSED
- `test_owner_creates_staff_with_credentials`: PASSED
- `test_owner_updates_staff_role`: PASSED
- `test_disabled_staff_rejected_on_login`: PASSED
- `test_player_self_registration`: PASSED

### 4. Multi-Club, Staff Management & Permissions Suite
**Command**: `.\venv\Scripts\python.exe -m pytest tests/test_phase2_multi_club.py tests/test_phase6_staff_and_dashboard.py tests/test_permissions.py -v`
**Output**: `57 passed in 17.90s`
- 15 multi-club discovery & membership request isolation tests: PASSED
- 16 staff management, role immutability, and dashboard isolation tests: PASSED
- 26 granular permission checks for club owner, manager, and tournament director: PASSED

### 5. Frontend TypeScript Verification
**Command**: `npx tsc --noEmit` (in `mobile/`)
**Output**: Exited with code 0 (0 type errors).

### 6. Frontend Lint Verification
**Command**: `npm run lint` (in `mobile/`)
**Output**: Exited with code 0 (0 errors, 622 warnings).

### 7. Web Production Bundle Export
**Command**: `npx expo export --platform web` (in `mobile/`)
**Output**: Exited with code 0 (Successfully bundled 3,005 modules, generated static `dist/` bundle).

---

## 9. Manual Configuration Requirements

Before deploying to staging or production, ensure the following environment variables are securely configured:

1. **Backend Environment Variables (`.env`)**:
   ```bash
   # Comma-separated list of platform administrator emails
   PLATFORM_OWNER_EMAILS="platform@aught2.com,admin@aught2.com"

   # Secure JWT secret key
   JWT_SECRET_KEY="<cryptographically-secure-random-key>"

   # Database URL
   DATABASE_URL="postgresql+asyncpg://<user>:<password>@<host>:5432/<dbname>"
   ```
2. **Frontend Environment Variables (`.env`)**:
   ```bash
   EXPO_PUBLIC_API_URL="https://api.yourdomain.com"
   # Leave undefined in production to hide quick-fill demo buttons:
   # EXPO_PUBLIC_SHOW_DEMO_CREDENTIALS=false
   ```

---

## 10. Staging & Production Deployment Plan

1. **Pre-Deployment**:
   - Verify that `PLATFORM_OWNER_EMAILS` contains designated operators.
   - Run database migrations: `alembic upgrade head`.
   - Ensure seed data scripts (`seed.py`) are strictly disabled in production.
2. **Backend Deployment**:
   - Deploy backend container / service with `APP_ENV=production`.
   - Verify health checks at `/health`.
   - Test `POST /api/v1/auth/platform/login` with platform owner credentials.
   - Verify that random emails or club owners receive HTTP 403 on `/api/v1/auth/platform/login`.
3. **Frontend Deployment**:
   - Build web bundle: `npx expo export --platform web`.
   - Deploy build artifact to Vercel or static hosting.
   - Verify that the login page displays **Club Staff** and **Player** tabs without any "Quick Fill Demo Account" buttons.
   - Verify that accessing `/platform/login` displays the dedicated platform login portal.
   - Verify that logging in with Club Owner credentials does not show "Platform Applications" or "Apply for New Club" in the drawer menu.
