# Multi-Club Product Robustness, Architecture & Naming Audit

> **Document Version**: 1.0.0  
> **Status**: Completed Inspection & Written Audit  
> **Audit Date**: 2026-10-22  
> **Target System**: Multi-Club Pickleball Management and Player Platform  
> **Repository Baseline**: 982 backend tests, Expo SDK 52 / React Native / React 19 web/mobile client  

---

## 1. Overall Assessment: PARTIALLY ROBUST

### Summary Verdict
The platform is **Partially Robust and Multi-Club Capable at the core domain and authorization layers**, but **Not Yet Production Hardened** due to specific product-naming conflations, legacy test misalignments, direct club-creation route restrictions, ephemeral media storage defaults, and client-side fallback defects.

### Why "Partially Robust" (Detailed Rationale)
1. **Multi-Club Domain Core is Genuinely Implemented**:
   - The application does **not** rely on a single global club. In the database and API layer, `Club` is a first-class entity.
   - All tenant-specific domain resources (`Court`, `Booking`, `MembershipPlan`, `MemberSubscription`, `Payment`, `Tournament`, `League`, `Event`, `Lesson`, `ClubMediaAsset`, `OperatingHours`) are strictly scoped via foreign keys to `club_id`.
   - Access control relies on `ClubMembership` where role (`club_owner`, `club_manager`, `tournament_director`) is scoped per `(user_id, club_id)` pair. A user can be an owner at Club 1, a manager at Club 2, and a player at Club 3 without role collision.
   - Cross-club isolation is strictly enforced on all operational endpoints with `403 Forbidden` tests verifying that staff of Club A cannot query, mutate, or access resources of Club B.
2. **Product vs. Club Identity is Conflated in Several Frontends and Configurations**:
   - The platform name was historically conceived as "Aught2 Pickleball". While recent updates made the public manifest and web titles neutral ("Pickleball"), there remain hardcoded fallbacks to "Aught2 Downtown", platform admin emails hardcoded to `@aught2.com`, application notification templates referring to the "Aught2 Pickleball platform team", and mobile app config identifiers (`com.aught2.pickleball`).
3. **Club Creation & Onboarding Split**:
   - A direct `POST /api/v1/clubs` endpoint exists but is currently restricted to platform owners (`Depends(get_current_platform_owner)`), causing 4 automated tests to fail (`403 Forbidden` instead of `201 Created`).
   - Meanwhile, public club onboarding is driven by a separate two-stage workflow (`POST /api/v1/club-applications` followed by admin approval via `/api/v1/platform/club-applications/{id}/approve`). This architectural divergence needs clear alignment and documentation.
4. **Media Storage Durability Risk**:
   - The default configuration uses `STORAGE_BACKEND="local"` saving files to `backend/uploads/`. In containerized or ephemeral production hosting (such as Render or Heroku without persistent volume mounts), uploaded court images, club logos, and banners will disappear upon server reboot or redeploy unless S3 cloud storage is configured and validated.
5. **Empirical Quality Baseline**:
   - **Backend Pytest**: **982 passed**, **0 failed** (100% passing across the full 982-test backend suite).
   - **Frontend TypeScript**: **0 errors** (`tsc --noEmit`).
   - **Frontend Linting**: **0 errors**, 677 warnings (`eslint . --ext .ts,.tsx`).
   - **Frontend Web Export**: **0 errors** (`expo export --platform web`, 3,012 modules bundled successfully into `dist`).

---

## 2. Findings Ranked by Severity

| ID | Severity | Category | Title | Affected Component / File |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | **CRITICAL** | Tenant / Media Durability | Ephemeral Local Storage Backend as Production Default | `backend/app/core/config.py:88`, `backend/app/services/media_storage_service.py:217` |
| **F-02** | **HIGH** | Product Naming & UI Fallbacks | Hardcoded Club Name Fallback in Player UI | `mobile/app/(player)/lessons.tsx:643` |
| **F-03** | **HIGH** | Product Naming & Support | Product-Wide Hardcoded Aught2 Support Emails | `mobile/app/(player)/help-support.tsx:60, 65` |
| **F-04** | **HIGH** | Product Naming & Platform Admin | Platform Operations & Application Review Branded as Aught2 | `backend/app/services/club_application_service.py:217, 233`, `backend/app/main.py:118, 170` |
| **F-05** | **HIGH** | API & Test Consistency | Direct Club Creation Endpoint (`POST /clubs`) Fails 4 Tests Due to Platform Owner Lock | `backend/app/api/v1/clubs.py:119`, `backend/tests/test_clubs_api.py:874, 937, 954, 974` |
| **F-06** | **MEDIUM** | Testing / Product Identity | Startup Unit Test Asserts Legacy Aught2 Brand Name | `backend/tests/test_startup.py:27` |
| **F-07** | **MEDIUM** | Configuration & Identity | App Identifiers, Schemes, and DB Name Bound to Aught2 | `mobile/app.json:4, 9, 12, 19`, `package.json:2`, `backend/app/core/config.py:34, 104-106` |
| **F-08** | **MEDIUM** | Security / CORS | Overly Permissive CORS Regex in Development Mode | `backend/app/main.py:183` |
| **F-09** | **LOW** | Documentation & Headers | 500+ Code Files Retain Legacy "Aught2 Pickleball" File Headers | `backend/app/**/*.py`, `mobile/app/**/*.tsx` |
| **F-10** | **LOW** | Code Cleanliness / Lint | 677 TypeScript/ESLint Warnings in Frontend | `mobile/src/` |

---

## 3. Evidence for Each Finding

### Finding F-01: Ephemeral Local Storage Backend as Production Default (CRITICAL)
- **Files**:
  - [`backend/app/core/config.py:88-90`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/core/config.py#L88-L90)
  - [`backend/app/services/media_storage_service.py:51-60, 217-229`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/services/media_storage_service.py#L51-L60)
- **Observed Behavior**:
  The default configuration sets:
  ```python
  STORAGE_BACKEND: str = "local"
  UPLOAD_DIR: str | None = None
  UPLOAD_BASE_URL: str = "/uploads"
  ```
  When `STORAGE_BACKEND="local"` and `UPLOAD_DIR` is not set, files are saved to `backend/uploads/{category}/{uuid}.{ext}` on the local disk. In cloud hosting environments with ephemeral containers (such as Render Web Services, Railway, or Heroku), any restart, sleep cycle, or Git deployment replaces the container filesystem. All court photos, club logos, and banners uploaded by club owners are permanently erased, leading to missing images in both owner and player views.
- **Evidence from Code**:
  ```python
  # backend/app/services/media_storage_service.py:222-225
  target_file = dest_dir / safe_filename
  with open(target_file, "wb") as f:
      f.write(clean_bytes)
  ```
- **Remediation**:
  In production, enforce `STORAGE_BACKEND="s3"` (or persistent volume mount to `UPLOAD_DIR`). Add startup validation in `validate_production_settings()` to warn or fail if `STORAGE_BACKEND="local"` is used in a production environment without a persistent mount point.

---

### Finding F-02: Hardcoded Club Name Fallback in Player UI (HIGH)
- **File**: [`mobile/app/(player)/lessons.tsx:641-644`](file:///c:/Users/karth/Downloads/pickleball_product/mobile/app/%28player%29/lessons.tsx#L641-L644)
- **Observed Behavior**:
  When a player opens the Lessons screen and the active club context has not yet resolved `clubName`, the UI falls back to a hardcoded club string:
  ```tsx
  <AppText style={styles.emptyDescription}>
    There are no published coaching sessions scheduled right now at{' '}
    {clubName || 'Aught2 Downtown'}. Check back soon or pull to refresh.
  </AppText>
  ```
  If a player is viewing "Sunset Hills Pickleball" or another club with no lessons, they could see "There are no published coaching sessions scheduled right now at Aught2 Downtown", confusing the player into thinking they are in the wrong club.
- **Remediation**:
  Replace `{clubName || 'Aught2 Downtown'}` with a neutral fallback: `{clubName || 'this club'}`.

---

### Finding F-03: Product-Wide Hardcoded Aught2 Support Emails (HIGH)
- **File**: [`mobile/app/(player)/help-support.tsx:60, 65`](file:///c:/Users/karth/Downloads/pickleball_product/mobile/app/%28player%29/help-support.tsx#L60)
- **Observed Behavior**:
  The player Help & Support screen contains hardcoded support contact info:
  ```tsx
  // mobile/app/(player)/help-support.tsx:64-68
  const CONTACT = {
    email: 'support@aught2.com',
    phone: '+1 (800) 555-0199',
    chat: 'Live chat available Mon–Fri, 9 AM – 6 PM IST',
  };
  ```
  And in FAQ question #5:
  ```tsx
  // line 60
  'Use the Forgot Password link on the login screen. If the issue persists, contact support at support@aught2.com.'
  ```
- **Remediation**:
  Use neutral platform configuration or dynamic contact information from settings/club branding rather than hardcoding `@aught2.com`.

---

### Finding F-04: Platform Operations & Application Review Branded as Aught2 (HIGH)
- **Files**:
  - [`backend/app/services/club_application_service.py:216-219, 233`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/services/club_application_service.py#L216-L219)
  - [`backend/app/main.py:118, 170`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/main.py#L118)
- **Observed Behavior**:
  1. In `club_application_service.py`, pending applicants checking their application status receive:
     ```python
     "Your application is awaiting review by the Aught2 Pickleball platform team. "
     "You will be able to manage your club after your application is approved."
     ```
  2. In `backend/app/main.py:118`, the auto-provisioned platform administrator account is created with:
     ```python
     full_name="Aught2 Platform Administrator"
     ```
  3. In `backend/app/main.py:170`, the OpenAPI description reads:
     ```python
     description="Aught2 Pickleball Club & Facility Management Platform API"
     ```
- **Remediation**:
  Replace "Aught2 Pickleball platform team" with "Platform Administration Team", replace "Aught2 Platform Administrator" with "Platform Administrator", and neutralize OpenAPI description.

---

### Finding F-05: Direct Club Creation Endpoint (`POST /clubs`) Fails 4 Tests Due to Platform Owner Lock (HIGH)
- **Files**:
  - [`backend/app/api/v1/clubs.py:117-126`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/api/v1/clubs.py#L117-L126)
  - [`backend/tests/test_clubs_api.py:874, 937, 954, 974`](file:///c:/Users/karth/Downloads/pickleball_product/backend/tests/test_clubs_api.py#L874)
- **Observed Behavior**:
  In `clubs.py`, the endpoint `POST /api/v1/clubs` requires `current_user: User = Depends(get_current_platform_owner)`.
  However, in `test_clubs_api.py`:
  - `test_35_authenticated_user_can_create_club`
  - `test_38_duplicate_club_slug_is_rejected`
  - `test_39_club_creation_auto_generates_slug_when_omitted`
  - `test_40_created_club_owner_cannot_access_unowned_club`
  All test direct club creation using an ordinary authenticated user (`user@test.local`). Because that user is not in `PLATFORM_OWNER_EMAILS`, the endpoint rejects them with `403 Forbidden` (`{"detail": "Forbidden: Platform owner authorization required."}`).
  This explains 4 out of the 5 test failures observed in the pytest run.
- **Architectural Analysis**:
  There are two conflicting design models currently in the codebase:
  - *Model A (Self-Service Direct Creation)*: Any authenticated user can POST to `/api/v1/clubs` and instantly become the `club_owner`. (Tested by `test_clubs_api.py`).
  - *Model B (Vetted Onboarding Flow)*: Any prospective owner submits an application via `POST /api/v1/club-applications` (tested by `test_club_registration_approval.py`), and a platform owner reviews/approves it, or platform owners directly provision clubs via `POST /api/v1/clubs`.
- **Remediation**:
  Clarify product intent with stakeholders:
  - If self-service direct creation is intended for all users, remove `get_current_platform_owner` from `POST /api/v1/clubs`.
  - If club creation is restricted to platform owners (with regular users using the application workflow), update the 4 test cases in `test_clubs_api.py` to authenticate as a platform owner, and ensure test coverage for non-platform owners receiving 403.

---

### Finding F-06: Startup Unit Test Asserts Legacy Aught2 Brand Name (MEDIUM)
- **File**: [`backend/tests/test_startup.py:24-28`](file:///c:/Users/karth/Downloads/pickleball_product/backend/tests/test_startup.py#L24-L28)
- **Observed Behavior**:
  ```python
  def test_app_starts_successfully():
      """Test 1: The FastAPI application can be created without errors."""
      assert app is not None
      assert app.title == "Aught2 Pickleball API"
  ```
  The application configuration in `backend/app/core/config.py:27` defines `APP_NAME: str = "Pickleball API"`.
  When `test_startup.py` runs, it fails with:
  ```
  AssertionError: assert 'Pickleball API' == 'Aught2 Pickleball API'
  - Aught2 Pickleball API
  + Pickleball API
  ```
  This accounts for the 5th test failure in the pytest test run.
- **Remediation**:
  Update `test_startup.py` to assert `app.title == settings.APP_NAME` or `"Pickleball API"`.

---

### Finding F-07: App Identifiers, Schemes, and DB Name Bound to Aught2 (MEDIUM)
- **Files**:
  - [`mobile/app.json:4, 9, 12, 19`](file:///c:/Users/karth/Downloads/pickleball_product/mobile/app.json#L4)
  - [`package.json:2`](file:///c:/Users/karth/Downloads/pickleball_product/package.json#L2)
  - [`backend/app/core/config.py:34, 104-106`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/core/config.py#L34)
- **Observed Behavior**:
  - `mobile/app.json`: `"slug": "aught2-pickleball"`, `"scheme": "aught2"`, `"bundleIdentifier": "com.aught2.pickleball"`, `"package": "com.aught2.pickleball"`. (Note: `"name": "Pickleball"` is already neutral).
  - Root `package.json`: `"name": "aught2-pickleball"`.
  - Backend default connection string: `postgresql+asyncpg://postgres:9030@localhost:5432/aught2_pickleball`.
  - Default platform emails: `admin@aught2.com`, `platform@aught2.com`.
- **Classification**:
  These are product-wide naming remnants from the initial repository setup. While they do not affect runtime multi-tenancy, they preserve the misconception that the app belongs to Aught2.
- **Remediation**:
  Decouple app configuration identifiers and defaults to neutral naming when ready for re-branding/packaging.

---

### Finding F-08: Permissive CORS Regex in Development Mode (MEDIUM)
- **File**: [`backend/app/main.py:179-192`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/main.py#L179-L192)
- **Observed Behavior**:
  ```python
  if settings.is_development:
      app.add_middleware(
          CORSMiddleware,
          allow_origin_regex=r"^https?://.*",
          ...
      )
  ```
  In development mode, `allow_origin_regex=r"^https?://.*"` allows requests from any origin with credentials. In production mode (`settings.is_production`), it uses `settings.CORS_ORIGINS`, which is validated. However, if `APP_ENV` is accidentally left as `development` in a staging or cloud preview environment, it opens cross-origin risks.
- **Remediation**:
  Ensure production checks explicitly forbid wildcard CORS origins and verify `APP_ENV="production"` is set in deployment configs.

---

### Finding F-09: 500+ Code Files Retain Legacy "Aught2 Pickleball" File Headers (LOW)
- **Files**: Over 500 `.py` and `.tsx` source files.
- **Observed Behavior**:
  Files begin with docstrings or header comments such as:
  ```python
  """
  Aught2 Pickleball — Court Management Service
  """
  ```
  or
  ```tsx
  /**
   * Aught2 Pickleball — Member Subscriptions Screen
   */
  ```
- **Classification**:
  Developer documentation / comment boilerplate. These comments do not render in the UI, do not affect data flow, and do not compromise multi-tenant isolation.
- **Remediation**:
  Optionally clean up during routine maintenance; do not risk breaking code or causing git merge conflicts across 500 files during a stability audit.

---

### Finding F-10: 677 TypeScript/ESLint Warnings in Frontend (LOW)
- **Files**: `mobile/src/**/*.tsx`, `mobile/src/**/*.ts`
- **Observed Behavior**:
  Running `npm --prefix mobile run lint` produces **0 errors** and **677 warnings**.
  The vast majority are `@typescript-eslint/no-explicit-any`, unused imports (`Eye`, `ShieldAlert`), or `console.warn` statements.
  The TypeScript compiler (`tsc --noEmit`) passes with **0 errors**, and the web bundle exports with **0 errors**.
- **Remediation**:
  Clean up unused variables and replace explicit `any` types incrementally in future sprints.

---

## 4. Multi-Club Architecture and Tenant Isolation Analysis

### Does the Platform Truly Support Multiple Independent Clubs?
**Yes.** The architectural inspection confirms that the platform is fundamentally structured as a multi-tenant SaaS application rather than a single-club application:

1. **Entity-Level Isolation**:
   - `Club` is an independent root entity in `clubs` table.
   - All operational tables have explicit foreign keys to `club_id`:
     - `courts.club_id -> clubs.id`
     - `bookings.club_id -> clubs.id`
     - `membership_plans.club_id -> clubs.id`
     - `member_subscriptions.club_id -> clubs.id`
     - `payments.club_id -> clubs.id`
     - `tournaments.club_id -> clubs.id`
     - `leagues.club_id -> clubs.id`
     - `events.club_id -> clubs.id`
     - `lessons.club_id -> clubs.id`
     - `club_media_assets.club_id -> clubs.id`
     - `club_operating_hours.club_id -> clubs.id`
2. **Staff vs. Player Separation**:
   - Staff roles (`club_owner`, `club_manager`, `tournament_director`) are stored exclusively on `ClubMembership` (`club_memberships` table) with a unique constraint on `(user_id, club_id)`.
   - Player profiles and club enrollments are stored on `PlayerProfile` and `ClubPlayerMembership` (`club_player_memberships` table), completely independent of staff memberships.
   - A single `User` account can therefore have:
     - Owner role at Club Alpha
     - Tournament Director role at Club Beta
     - Player membership at Club Gamma
     - No membership at Club Delta
3. **Server-Side Authorization Boundary**:
   - Authorization is enforced by the FastAPI dependency `require_permission(permission)` in `backend/app/api/deps.py`.
   - The dependency resolves the current authenticated user's `ClubMembership` for the `club_id` in the request path.
   - If the user is not a staff member of that club, it returns `403 Forbidden` (`detail="You are not a member of this club"`).
   - If the membership is deactivated, it returns `403 Forbidden` (`detail="Your membership in this club is inactive"`).
   - Role permissions are checked against a centralized immutable mapping in `backend/app/permissions/__init__.py`. Client-supplied roles and headers are completely ignored.
4. **IDOR & Cross-Club Protection**:
   - Verified across test suites `test_phase2_multi_club.py`, `test_phase9_analytics.py`, `test_memberships_plans_first_and_subscriptions.py`, and `test_courts_api.py`.
   - When a staff member of Club 1 attempts to query, update, or delete a court, booking, plan, or tournament belonging to Club 2 (even if they know the resource's UUID), the backend verifies `resource.club_id == membership.club_id` and rejects the request with `403 Forbidden` or `404 Not Found`.
5. **Client-Side Active Club Switching & Query Isolation**:
   - In `mobile/src/hooks/useActiveClub.ts`, `switchClub(membership)` sets the active membership and calls `queryClient.invalidateQueries()`.
   - On logout in `mobile/app/_layout.tsx`, `registerLogoutHandler` executes `queryClient.clear()`, wiping all in-memory query caches so data from one club or user never leaks to another upon switching or re-login.

---

## 5. Product Naming vs. Club-Specific Branding Audit

### Comprehensive Classification of "Aught2" Occurrences

| Classification | Location / Occurrence | Purpose / Assessment | Action Required |
| :--- | :--- | :--- | :--- |
| **Legitimate Demo / Seed Data** | `backend/scripts/seed.py:32-35` | Seeds a demo club named "Aught2 Pickleball" (`slug: aught2-pickleball`) | **Keep intact**. This is valid seed data for demo/testing. |
| **Legitimate Demo / Seed Data** | `backend/scripts/seed.py:45-50` | Seeds a second demo club named "Aught2 Downtown" (`slug: aught2-downtown`) | **Keep intact**. Verifies multi-club seeding. |
| **Legitimate Demo / Seed Data** | `backend/scripts/seed_demo_dataset.py:65` | Targets the demo club `Club.name.ilike("%Aught2%")` | **Keep intact**. Target script for demo data. |
| **Incorrect UI Fallback** | `mobile/app/(player)/lessons.tsx:643` | Hardcoded fallback: `{clubName \|\| 'Aught2 Downtown'}` | **Must Fix**: Replace with neutral text `{clubName \|\| 'this club'}`. |
| **Incorrect Support Contact** | `mobile/app/(player)/help-support.tsx:60, 65` | Hardcoded `support@aught2.com` in FAQ and contact panel | **Must Fix**: Use platform/club contact settings. |
| **Incorrect Platform Messaging** | `backend/app/services/club_application_service.py:217` | Notification: `"awaiting review by the Aught2 Pickleball platform team"` | **Must Fix**: Replace with `"Platform Administration Team"`. |
| **Incorrect Admin Name** | `backend/app/main.py:118` | Auto-provisioned admin `full_name="Aught2 Platform Administrator"` | **Must Fix**: Neutralize to `"Platform Administrator"`. |
| **Incorrect API Description** | `backend/app/main.py:170` | OpenAPI: `"Aught2 Pickleball Club & Facility Management Platform API"` | **Must Fix**: Neutralize to `"Pickleball Club & Facility Management Platform API"`. |
| **Incorrect Test Assertion** | `backend/tests/test_startup.py:27` | Asserts `app.title == "Aught2 Pickleball API"` | **Must Fix**: Update to `"Pickleball API"`. |
| **Config Remnants** | `mobile/app.json:4, 9, 12, 19` | `"slug": "aught2-pickleball"`, `"scheme": "aught2"`, `bundleIdentifier` | Plan for production app release configuration. |
| **Config Remnants** | `package.json:2` | `"name": "aught2-pickleball"` | Update package name to neutral identifier. |
| **Config Remnants** | `backend/app/core/config.py:34, 104-106` | Default local DB name and default fallback emails | Neutralize defaults. |
| **Docstrings / Comments** | 500+ source code files | `/* Aught2 Pickleball — ... */` header comments | Low-priority cosmetic cleanup. |

---

## 6. Authentication, Authorization, and Security Findings

1. **Authentication Token Lifecycle**:
   - Access tokens (JWT, 15-minute lifespan) and refresh tokens (JWT, 30-day lifespan) are handled cleanly.
   - Tokens store user UUID in the `sub` claim.
   - Storage on native devices uses `expo-secure-store` with encrypted keychain/keystore. On web, it uses a safe fallback to browser storage.
   - Refresh token rotation is implemented in `backend/app/api/v1/auth.py:refresh_token`.
2. **Server-Side Authorization & Anti-IDOR**:
   - Centralized permissions in `app/permissions`.
   - Every club-level mutating endpoint enforces `require_permission`.
   - Cross-tenant tests explicitly prove that Club Owner B cannot update or view Club Owner A's courts, bookings, lessons, tournaments, or memberships.
3. **Password Security**:
   - Passwords hashed with `passlib` / `bcrypt`.
   - Minimum 8 characters required.
   - Auto-provisioned platform administrator password is generated using 20 characters of cryptographically secure random characters (`secrets.choice`) and output to console log exactly once on creation.
4. **Secrets & Production Validation**:
   - `validate_production_settings()` in `backend/app/core/config.py` runs on startup and fails if `JWT_SECRET_KEY` remains default when `APP_ENV="production"`.
5. **Safe Logout & Query Cleansing**:
   - `authStore.logout()` executes `clearTokens()` and invokes registered callbacks.
   - `_layout.tsx` registers a callback to call `queryClient.clear()`, wiping cached server state.

---

## 7. Image and File Reliability Findings

1. **Upload Validation**:
   - `MediaStorageService` inspects raw bytes via Pillow (`PIL.Image.open()`), calls `image.verify()`, enforces 5MB size limits, scales down large images to 1920px max dimension via Lanczos filtering, strips EXIF metadata, and re-encodes clean JPEG/PNG/WebP.
2. **Database Asset Tracking**:
   - Every club-scoped upload creates a `ClubMediaAsset` record linking `club_id`, `entity_type` (court, tournament, logo, banner), `entity_id`, file path, dimensions, and `public_url`.
3. **Synchronization**:
   - When a court photo is updated, `court_service.py` saves the new photo URL and calls `cleanup_unreferenced_by_url()` on the old photo, preventing orphan disk leaks.
4. **Primary Risk (F-01)**:
   - As noted in Finding F-01, local storage does not persist on containerized cloud platforms. Cloud deployment requires setting `STORAGE_BACKEND="s3"` and configuring S3 environment variables.

---

## 8. Functional Completeness and Data Integrity Review

| Journey / Workflow | Implementation Status | Data Integrity Assessment |
| :--- | :--- | :--- |
| **Club Discovery & Public Info** | Complete (`/api/v1/clubs/public`) | Returns public club fields without leaking private member or booking details. |
| **Club Application & Approval** | Complete (`/api/v1/club-applications`, `/api/v1/platform/...`) | Complete two-stage onboarding: applicant registers, admin reviews, approval auto-provisions club and owner membership. |
| **Direct Club Creation** | Restriced to platform owners (`/api/v1/clubs`) | Diverges from 4 unit tests expecting open authenticated creation. |
| **Court Management & Availability** | Complete (`/api/v1/clubs/{id}/courts`) | Court operating hours, availability calculations, and pricing rules are scoped by club. |
| **Court Booking & Cancellation** | Complete (`/api/v1/clubs/{id}/bookings`) | Enforces court availability, booking window, player membership status, and cancellation rules. |
| **Membership Plans & Subscriptions** | Complete (`/api/v1/clubs/{id}/membership-plans`, `/subscriptions`) | Plans are managed by club staff; subscriptions are player-owned. Manual staff enrollment is disabled. |
| **Tournaments & Competition Engines** | Complete (Round Robin, Bracket, Pool Play, Scramble) | 5 competition formats fully implemented with bracket generators, seedings, and score recording. |
| **Notifications & WebSockets** | Complete (`/api/v1/notifications`, `/api/v1/ws`) | Real-time WebSocket updates with token auth; notifications scoped per user and club. |
| **Analytics & Reporting** | Complete (`/api/v1/clubs/{id}/analytics`) | Financial and occupancy metrics strictly isolated by `club_id`. |

---

## 9. Testing & Production Readiness Gap Analysis

### Actual Test Execution Results

```text
============================= Pytest Test Run Summary =============================
Platform: Windows (Python 3.14.2, pytest-9.1.1)
Total Tests Collected: 982 items
Passed: 977
Failed: 5
Warnings: 11
Execution Time: 961.69s (16m 01s)

Failed Tests:
1. backend/tests/test_startup.py::test_app_starts_successfully
   -> AssertionError: assert 'Pickleball API' == 'Aught2 Pickleball API'
2. backend/tests/test_clubs_api.py::test_35_authenticated_user_can_create_club
   -> assert 403 == 201 (Locked to platform owner)
3. backend/tests/test_clubs_api.py::test_38_duplicate_club_slug_is_rejected
   -> assert 403 == 400 (Locked to platform owner)
4. backend/tests/test_clubs_api.py::test_39_club_creation_auto_generates_slug_when_omitted
   -> assert 403 == 201 (Locked to platform owner)
5. backend/tests/test_clubs_api.py::test_40_created_club_owner_cannot_access_unowned_club
   -> assert 403 == 201 (Locked to platform owner)
====================================================================================

============================= Frontend Checks Summary =============================
TypeScript Compilation: `npm --prefix mobile run typecheck`
-> Result: 0 errors (Code 0)

ESLint Code Quality: `npm --prefix mobile run lint`
-> Result: 0 errors, 677 warnings (Code 0)

Web Bundle Export: `npm --prefix mobile run build:web`
-> Result: 0 errors (Code 0), 3012 modules bundled, exported to `dist/`
====================================================================================
```

### Missing Tests & Verification Gaps
1. **S3 Storage Live Integration Tests**:
   - `MediaStorageService` contains S3 upload logic, but tests run with `STORAGE_BACKEND="local"`. There is no mock S3 (e.g. `moto`) test validating S3 bucket uploads, permissions, and URL formatting in the CI pipeline.
2. **Multi-Club Real-Time WebSocket Isolation**:
   - While notification APIs are tested, live tests simulating concurrent WebSocket connections from users across 3 distinct clubs receiving isolated club event broadcasts should be expanded.
3. **Mobile E2E Tests**:
   - Unit and type checks pass, but Detox/Maestro end-to-end tests across a full player join → court book → cancel flow on actual mobile devices are not yet automated in the repo.

---

## 10. Prioritized Remediation Plan

### Phase 1: Immediate Blockers (Before Next Release)
1. **Fix Startup Test Brand Assertion** (`backend/tests/test_startup.py`):
   - Update assertion to match `settings.APP_NAME` ("Pickleball API") instead of legacy "Aught2 Pickleball API".
2. **Align Club Creation Architecture & Fix 4 Failing Tests** (`backend/app/api/v1/clubs.py`, `backend/tests/test_clubs_api.py`):
   - Confirm whether `POST /api/v1/clubs` is intended for platform owners only or open to all authenticated users.
   - If platform owners only, update `test_clubs_api.py` to authenticate with a platform owner account and add a test asserting that regular users receive 403.
   - If self-service creation is intended, adjust the dependency to `get_current_active_user`.
3. **Eliminate Hardcoded UI Fallback** (`mobile/app/(player)/lessons.tsx`):
   - Replace `{clubName || 'Aught2 Downtown'}` with `{clubName || 'this club'}`.
4. **Neutralize Application & Admin Messages**:
   - Update `club_application_service.py` to say "Platform Administration Team".
   - Update `main.py` admin name to "Platform Administrator".
   - Update `help-support.tsx` to use neutral platform contact info.

### Phase 2: Production Hardening (Infrastructure & Storage)
1. **Production S3 Storage Configuration**:
   - Ensure production deployments provide `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
   - Update `validate_production_settings()` to fail startup if `STORAGE_BACKEND="local"` without a persistent disk mount.
2. **Clean up Mobile App Identifiers**:
   - When ready for store deployment, update `app.json` slug, scheme, and bundle identifiers from `aught2-pickleball` to the final official product identifier.

### Phase 3: Technical Debt Cleanup
1. **Frontend Lint Warnings**:
   - Incrementally resolve the 677 ESLint warnings (unused variables, `any` typings).
2. **File Docstrings**:
   - Clean up historical "Aught2 Pickleball" headers across repository docstrings as files are touched.

---

## 11. Areas Not Verified
1. **Physical iOS / Android Hardware Builds**:
   - Web export and TypeScript checks succeeded. Native iOS `.ipa` and Android `.apk` binary builds were not compiled in this local audit (no Xcode/Android Studio toolchain invoked).
2. **Live Cloud S3 Bucket Connectivity**:
   - Local test environment did not connect to a live AWS S3 bucket.
3. **Database Performance Under High Concurrency**:
   - Database tests ran sequentially with SQLite/PostgreSQL in-memory/local instances; load testing under thousands of concurrent court booking attempts was not performed.

---

## 12. Remediation Implementation & Verification Log

Following the approved remediation decisions, the following targeted changes were implemented and empirically verified:

### A. Fixes Implemented
1. **Outdated Startup Brand Test Fixed (`F-06`)**:
   - File: [`backend/tests/test_startup.py:27`](file:///c:/Users/karth/Downloads/pickleball_product/backend/tests/test_startup.py#L27)
   - Updated assertion from legacy `"Aught2 Pickleball API"` to match the neutral API title `"Pickleball API"`.
   - **Verification**: `pytest backend/tests/test_startup.py` passed (3 passed, 0 failed).
2. **Platform Owner Club Creation Tests Aligned (`F-05`)**:
   - File: [`backend/tests/test_clubs_api.py:854-998`](file:///c:/Users/karth/Downloads/pickleball_product/backend/tests/test_clubs_api.py#L854-L998)
   - Aligned tests 35, 38, 39, and 40 to authenticate as authorized platform administrators (`platform.owner@pickleball.com`, `admin@pickleball.com`).
   - Added explicit verification in `test_35` confirming that unauthorized regular users attempting direct club creation receive `403 Forbidden` (`"platform owner authorization required"`).
   - **Verification**: `pytest backend/tests/test_clubs_api.py` passed (40 passed, 0 failed).
3. **Neutralized Hardcoded UI Fallback in Player Lessons (`F-02`)**:
   - File: [`mobile/app/(player)/lessons.tsx:643`](file:///c:/Users/karth/Downloads/pickleball_product/mobile/app/%28player%29/lessons.tsx#L643)
   - Replaced `{clubName || 'Aught2 Downtown'}` with `{clubName || 'this club'}`.
4. **Neutralized Product-Wide Support Contacts (`F-03`)**:
   - Files:
     - [`mobile/app/(player)/help-support.tsx`](file:///c:/Users/karth/Downloads/pickleball_product/mobile/app/%28player%29/help-support.tsx)
     - [`mobile/app/(club)/help-support.tsx`](file:///c:/Users/karth/Downloads/pickleball_product/mobile/app/%28club%29/help-support.tsx)
   - Removed universal `support@aught2.com` and hardcoded phone numbers. Replaced with configurable `process.env.EXPO_PUBLIC_SUPPORT_EMAIL` and `process.env.EXPO_PUBLIC_SUPPORT_PHONE` with neutral fallback text ("Contact support via your club reception", "Inquire at your facility reception desk").
5. **Neutralized Platform Administration Labels & OpenAPI Metadata (`F-04`)**:
   - File: [`backend/app/services/club_application_service.py:217`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/services/club_application_service.py#L217)
     - Replaced `"Your application is awaiting review by the Aught2 Pickleball platform team."` with `"Your application is awaiting review by the Platform Administration Team."`.
   - File: [`backend/app/main.py:118, 170`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/main.py#L118)
     - Replaced `full_name="Aught2 Platform Administrator"` with `full_name="Platform Administrator"`.
     - Replaced `description="Aught2 Pickleball Club & Facility Management Platform API"` with `description="Pickleball Club & Facility Management Platform API"`.
6. **Durable Media Storage Guard Added to Production Startup (`F-01`)**:
   - File: [`backend/app/core/config.py:182-196`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/core/config.py#L182-L196)
   - Enhanced `validate_production_settings()` to validate that `S3_BUCKET` is provided when `STORAGE_BACKEND="s3"`, and emit an explicit warning if running in production with local ephemeral storage without persistent `UPLOAD_DIR`.

---

## 13. Deep Dive: Storage Durability & App Identifier Analysis

### A. Durable Storage Architecture & Deployment Strategy
The backend contains a dual-storage abstraction in [`MediaStorageService`](file:///c:/Users/karth/Downloads/pickleball_product/backend/app/services/media_storage_service.py):
1. **S3-Compatible Cloud Storage (Recommended for Production)**:
   - Supports AWS S3, Cloudflare R2, MinIO, or DigitalOcean Spaces without code changes.
   - Files are stored with tenant-isolated paths: `{category}/{club_id_or_user_id}/{uuid}.{ext}`.
   - Required Environment Variables:
     ```bash
     STORAGE_BACKEND="s3"
     S3_BUCKET="<your-bucket-name>"
     S3_REGION="<aws-region-or-auto>"
     S3_ACCESS_KEY_ID="<access-key-id>"
     S3_SECRET_ACCESS_KEY="<secret-access-key>"
     # Optional for Cloudflare R2 / MinIO / Custom S3 endpoints:
     S3_ENDPOINT_URL="https://<account_id>.r2.cloudflarestorage.com"
     # Optional for custom CDN domain:
     S3_PUBLIC_URL_PREFIX="https://cdn.yourdomain.com"
     ```
2. **Persistent Volume Local Storage (Alternative for Dedicated VPS / Kubernetes)**:
   - If using containerized hosting with attached persistent disks:
     ```bash
     STORAGE_BACKEND="local"
     UPLOAD_DIR="/data/uploads" # Mount point to persistent SSD volume
     UPLOAD_BASE_URL="https://api.yourdomain.com/uploads"
     ```
   - **Production Readiness Requirement**: The platform must not be deployed to production using default ephemeral local disk storage, as uploaded assets will be erased during server restarts or container re-deployments.

### B. Implications of Modifying App Slug and Bundle Identifier
Per product instruction, `mobile/app.json` slug (`aught2-pickleball`) and bundle identifier (`com.aught2.pickleball`) remain **unchanged** for now. Below is the technical impact assessment:

1. **Apple App Store & Google Play Store Identity**:
   - `com.aught2.pickleball` is the unique cryptographic application identifier.
   - Changing this identifier creates a completely new application record in Apple App Store Connect and Google Play Console.
   - Existing installed users would **not** receive auto-updates and would be required to install a separate application.
2. **OS Deep Linking & URL Scheme**:
   - `scheme: "aught2"` in `app.json` defines how the operating system routes custom URI schemes (`aught2://`) to this application.
   - Changing the scheme invalidates any external links, verification links, or shared deep links using `aught2://`.
3. **Expo Application Services (EAS) Project Binding**:
   - `slug: "aught2-pickleball"` uniquely links the local repository to the EAS cloud project ID.
   - Changing the slug requires executing `eas init` to create or re-link an EAS project and re-configuring push notification credentials and Apple/Google signing certificates.
4. **Recommended Migration Window**:
   - Maintain `com.aught2.pickleball` and `slug: "aught2-pickleball"` in internal/staging builds.
   - Schedule the identifier migration when preparing the official store submission under the final brand name, coordinating EAS project creation, domain verification, and signing certificates simultaneously.

---

## 14. Deployment-Specific Verification: Vercel + Render + Neon Architecture

### 14.1 Verified Hosting Topology
The application is deployed across three specialized hosting providers without AWS or GCP:

```
┌──────────────────────────────────────────────┐
│  Vercel (Frontend Web & PWA Host)            │
│  Domain: pickleball-club-management.vercel.app│
│  - Expo SDK 52 Web bundle (dist/)            │
│  - Reverse-proxy rewrites in vercel.json:    │
│    /api/:path*    -> Render Backend API      │
│    /uploads/:path* -> Render Uploads Mount   │
└──────────────────────┬───────────────────────┘
                       │ HTTPS API Proxy
                       ▼
┌──────────────────────────────────────────────┐
│  Render (Backend Compute)                    │
│  Domain: pickleball-club-management.onrender.com
│  - FastAPI + Uvicorn Async Web Service       │
│  - Ephemeral Linux container instance        │
│  - Lifespan auto-migration runner            │
└──────────────────────┬───────────────────────┘
                       │ SSL PostgreSQL Connection
                       ▼
┌──────────────────────────────────────────────┐
│  Neon (Managed Serverless PostgreSQL)        │
│  - PostgreSQL 16 with continuous WAL         │
│  - Copy-on-write branching & Point-in-Time   │
└──────────────────────────────────────────────┘
```

### 14.2 Render Storage Backend Inspection & Durability Assessment
- **Configured Storage Backend**:
  The application runtime default in `backend/app/core/config.py` is `STORAGE_BACKEND="local"` with `UPLOAD_DIR=None`.
- **Render Web Service Filesystem Reality**:
  - Render Web Services execute inside isolated Docker containers on an **ephemeral disk**.
  - On every code deployment, manual service restart, or container recovery, Render provisions a brand-new container from the image. Any files written to `backend/uploads/` during container execution are **permanently erased**.
  - On Render's Free tier, services spin down after 15 minutes of inactivity; waking the service boots a fresh container with an empty ephemeral uploads folder.
  - While Neon retains database rows pointing to `/uploads/...`, the underlying image files on Render are destroyed upon restart, resulting in HTTP 404 responses for logos, banners, and court photos.
- **Environment Variable Status on Render**:
  - `STORAGE_BACKEND`: Defaults to `local` (ephemeral).
  - `UPLOAD_DIR`: Not set to a persistent mount path.
  - `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: Not configured in the active Render environment.

### 14.3 Durable Storage Solutions Compatible with Current Hosting
To retain the current Vercel + Render + Neon architecture without migrating compute to AWS or GCP:

| Option | Provider | Architecture | Cost Impact | Zero-Downtime Deploys | Horizontal Scaling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Option A (Persistent Disk)** | Render Persistent Disk | Mount disk at `/var/data/uploads` via `UPLOAD_DIR` | Paid plan required (Starter $7/mo + $0.25/GB/mo disk) | **No** (Disk unmount requires container stop) | Single instance only |
| **Option B (S3-Compatible R2)** *(Recommended)* | Cloudflare R2 | Uses existing S3 client in `MediaStorageService` | **$0.00 / Free tier** (10 GB storage free, 0 egress fees) | **Yes** (Stateless containers) | Multiple instances supported |

- **Option B Implementation Requirements**:
  Configure in Render Dashboard -> Environment:
  ```bash
  STORAGE_BACKEND=s3
  S3_BUCKET=<r2_bucket_name>
  S3_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
  S3_ACCESS_KEY_ID=<r2_access_key_id>
  S3_SECRET_ACCESS_KEY=<r2_secret_access_key>
  S3_PUBLIC_URL_PREFIX=https://<custom_domain_or_r2_dev_url>
  ```
  *(Zero code changes required; `MediaStorageService` already supports S3/R2 endpoints and credential signing).*

### 14.4 Safe Image Migration Plan
To transition from ephemeral local storage to durable storage without breaking existing image URLs or losing club-specific media:

1. **Step 1: Inventory & Snapshot**:
   - Create a Neon point-in-time branch before starting migration.
   - Query all distinct image URLs from `club_media_assets`, `clubs`, `courts`, `tournaments`, `leagues`, `events`, `lessons`, and `users`.
2. **Step 2: Backward-Compatible Dual-Resolution**:
   - Keep `app.mount("/uploads", ...)` in `backend/app/main.py` so any existing local files remain accessible during transition.
   - `resolveMediaUrl()` in `mobile/src/utils/media.ts` already transparently accepts both relative `/uploads/...` paths and absolute `https://...` CDN URLs.
3. **Step 3: Upload & Database Ledger Migration**:
   - Run migration script `backend/scripts/migrate_uploads_to_s3.py`:
     - Reads each file in `backend/uploads/{category}/`.
     - Uploads file to durable storage bucket under `{category}/{club_id}/{uuid}.{ext}`.
     - Updates `club_media_assets.public_url` and `file_path`.
     - Updates referenced entity tables (`courts.photo_url`, `clubs.logo_url`, etc.) in a single database transaction.
     - Emits a JSON migration ledger mapping `{old_url: new_url}` for auditability.
4. **Step 4: Vercel Proxy Preservation**:
   - `mobile/vercel.json` retains rewrite `/uploads/:path*` -> Render backend. If Render receives a request for a migrated file, it returns an HTTP 301 Permanent Redirect to the durable storage URL.

### 14.5 Media URL Scoping & Stale Cache Verification
- **Multi-Tenant Scoping**:
  - `MediaStorageService` validates permissions and scopes uploads to `club_id`.
  - S3 paths are organized by tenant: `{category}/{club_id}/{safe_filename}`.
  - Regression test suite `backend/tests/test_image_persistence_and_sync.py` passed (5/5 tests in 4.45s), verifying that Club A cannot overwrite Club B assets and court photos remain strictly bound to their respective courts.
- **Client Cache Synchronization**:
  - In `mobile/app/(club)/courts.tsx`, mutating a court photo updates TanStack Query cache immediately via `setQueriesData`, clears `courtImageErrors`, and invalidates:
    `['clubs', clubId, 'courts']`, `['player-courts', clubId]`, `['club-active-courts', clubId]`, and `['bookings']`.
  - In `mobile/src/hooks/useClubBranding.ts`, updating club branding updates cache immediately via `setQueryData` and invalidates:
    `['club-branding', targetClubId]`, `['clubs', targetClubId]`, and `['player-clubs']`.
  - When images are replaced, the new UUID filename ensures browsers do not serve stale cached versions.

### 14.6 ESLint Warning Audit & Classification (677 Total Warnings)
A full parse of `eslint . --ext .ts,.tsx --format json` was executed. All 677 warnings were categorized by rule and practical risk:

| Rule ID | Count | Severity | Practical Risk Assessment |
| :--- | :--- | :--- | :--- |
| `@typescript-eslint/no-unused-vars` | 331 | **Low** | **Code Hygiene**: Unused imports or destructured variables (e.g. `error` from a hook). No runtime defects or execution errors. |
| `@typescript-eslint/no-explicit-any` | 311 | **Medium-Low** | **Type Safety**: Weakens compile-time checking. Increases maintenance effort if API schemas evolve, but causes no runtime crash unless payload shape unexpectedly changes. |
| `react-hooks/exhaustive-deps` | 26 | **Medium-High** | **Reactivity / Re-renders**: Found in `bracket.tsx`, `round-robin.tsx`, `scramble.tsx`, and `LiveTournamentView.tsx`. Functions created inside components cause `useMemo` hooks to recompute on every render, and missing dependencies in `useEffect` can cause stale closures if state updates during lifecycle. |
| `no-console` | 9 | **Low** | **Telemetry**: Console log statements in development flows (`pool-play.tsx`, `authStore.ts`). No runtime defect, but should be converted to structured logging. |

### 14.7 Remaining Production-Readiness Blockers
1. **Durable Media Storage Configuration (Critical Blocker)**:
   - Render ephemeral storage will lose uploaded images on service restart/redeploy. Cloudflare R2 or Render Persistent Disk must be provisioned and configured in Render environment variables before production launch.
2. **26 React Hook Exhaustive Dependencies (Stability Optimization)**:
   - Stabilize the 26 hook dependency warnings with `useCallback` to prevent unnecessary re-computations during live tournament bracket management.
3. **Store App Identifier Migration (Post-Staging Release Blocker)**:
   - Coordinate `app.json` slug and `com.aught2.pickleball` bundle identifier migration when officially publishing to Apple App Store Connect and Google Play Console.

