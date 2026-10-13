# Aught2 Pickleball — Multi-Club Image & Banner Customization System Audit

**Audit Date:** October 2026  
**Status:** Complete  
**Scope:** Full codebase audit covering frontend (React Native / Expo Web), backend (FastAPI / SQLAlchemy / Postgres), database schema, asset storage, authorization, and tenant isolation.

---

## 1. Executive Summary

A comprehensive repository inspection was conducted to identify all hardcoded, shared, or unconfigurable image assets across the application. 

### Key Findings
1. **Shared Promotional Carousel:** The primary player and club home screens utilize a client-side hardcoded array (`HERO_SLIDES` in `mobile/src/components/ClubHeroCarousel.tsx`) with bundled static photos (`pickleball_hero.jpg`, `hero_discover_banner.jpg`, `profile_hero_bg.jpg`). Different clubs render identical promotional slides, CTAs, and text.
2. **Hardcoded Entity Cards:** 
   - **Tournaments:** `TournamentCard.tsx` and `PlayerTournamentCard.tsx` assign banners (`banner1.jpg`..`banner3.jpg`) and cards (`card_pool_play.jpg`, `card_round_robin.jpg`, `card_bracket.jpg`) via keyword string matching on tournament title or format.
   - **Leagues:** `LeagueCard.tsx` cycles through `card1.jpg`..`card3.jpg` based on index modulo math.
   - **Lessons:** `ClubLessonsScreen` and `PlayerLessonsScreen` hardcode `card1.jpg`..`card3.jpg` based on title substring heuristics ("doubles", "beginner", "private").
   - **Events:** `ClubEventsScreen` and `PlayerEventsScreen` assign `card1_clean.jpg`..`card3_clean.jpg` by `event_type`.
   - **Courts:** `bookings.tsx` assigns `court_1.jpg`..`court_5.jpg` by court array index.
3. **Club Switcher & Header Logos:** `ClubSwitcher.tsx` unconditionally displays a static generic paddle icon (`paddle_icon.png`) for all clubs instead of the club's custom uploaded `logo_url`. `index.tsx` renders static `pickleball_logo.png`.
4. **Backend Schema Gaps:** 
   - The `Club` model only stores `logo_url`. It lacks `cover_image_url` and any carousel slides association.
   - `Tournament`, `League`, `Event`, `Court`, `LessonType`, and `Lesson` models lack image storage columns.
   - No table exists to track carousel slide ordering, banners, CTA links, or uploaded asset metadata.
5. **Storage Architecture:** Logo and avatar uploads write to local disk paths (`backend/uploads/logos` and `backend/uploads/avatars`), which do not persist across stateless server redeployments or container restarts.

---

## 2. Complete Inventory of Image-Bearing Surfaces

| Page / Component | Current Image Source | Scope | Upload / Config Exists? | Required Implementation Change | Storage & Auth Implications |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Club Home Carousel**<br>`ClubHeroCarousel.tsx` | Local static bundle:<br>`pickleball_hero.jpg`<br>`hero_discover_banner.jpg`<br>`profile_hero_bg.jpg` | Global / Hardcoded | **No** | Replace hardcoded `HERO_SLIDES` with dynamic query to `GET /api/v1/clubs/{club_id}/carousel-slides`. Add club cover fallback. | Scoped to `club_id`. Only Club Owner / authorized Manager can create, update, reorder, or toggle slides. |
| **Club Home Header**<br>`mobile/app/(club)/index.tsx` | `assets/pickleball_logo.png` | Global | Partial (`logo_url` exists on Club) | Render `club.logo_url` when configured, fallback to platform logo. | Public club branding. Authorized owner updates via club profile. |
| **Player Home Header**<br>`mobile/app/(player)/index.tsx` | `assets/pickleball_logo_transparent.png` | Global | **No** | Display active club logo when enrolled/selected; preserve platform logo for app discovery. | Public club branding scoped to active club context. |
| **Player Welcome Hero**<br>`mobile/app/(player)/index.tsx` | `assets/events/pickleball_hero.jpg` | Global / Hardcoded | **No** | Display active club cover image (`club.cover_image_url`) or first active carousel slide; fallback to platform banner. | Read-only for players; configurable by club owner. |
| **Home Event Thumbnail**<br>`mobile/app/(club)/index.tsx` | `assets/events/clinic_thumbnail.jpg` | Entity / Hardcoded | **No** | Bind to `event.cover_image_url` with fallback. | Inherits event entity access. |
| **Tournament Card (Owner)**<br>`TournamentCard.tsx` | `banner1.jpg`, `banner2.jpg`, `banner3.jpg` (Title/format match) | Entity / Hardcoded | **No** | Check `tournament.banner_image_url` → Club tournament banner fallback → Neutral format fallback. | Scoped to `tournament.club_id`. Manageable by Club Owner, Manager, or Tournament Director. |
| **Tournament Card (Player)**<br>`PlayerTournamentCard.tsx` | `card_pool_play.jpg`, `card_round_robin.jpg`, `card_bracket.jpg`, `banner2.jpg` | Entity / Hardcoded | **No** | Check `tournament.banner_image_url` → Club fallback → Format fallback. | Read-only for players. |
| **Tournament Discovery Banner**<br>`mobile/app/(player)/tournaments.tsx` | `assets/tournaments/hero_discover_banner.jpg` | Global / Hardcoded | **No** | Display club-configured tournament banner or club cover fallback. | Scoped to active club context. |
| **Tournament Live & Results Views**<br>`LiveTournamentView.tsx`<br>`CompletedRoundRobinView.tsx`<br>`CompletedBracketView.tsx`<br>`CompletedPoolPlayView.tsx`<br>`CompletedScrambleView.tsx` | Hardcoded `banner2.jpg`, `banner1.jpg`, `banner3.jpg` | Entity / Hardcoded | **No** | Render `tournament.banner_image_url` with fallback. | Inherits tournament viewer permissions. |
| **League Cards**<br>`LeagueCard.tsx` | `card1.jpg`, `card2.jpg`, `card3.jpg`, `card1_crop.jpg` (Array modulo) | Entity / Hardcoded | **No** | Check `league.banner_image_url` → Club league banner fallback → Neutral card fallback. | Scoped to `league.club_id`. Manageable by Owner/Manager. |
| **Club Lessons Screen**<br>`mobile/app/(club)/lessons.tsx` | Hero: `hero_decor.jpg`<br>Cards: `card1.jpg`..`card3.jpg` (Keyword matching) | Entity / Hardcoded | **No** | Hero: club coaching banner.<br>Cards: `lesson.image_url` or `lesson_type.image_url` → Club fallback → Neutral fallback. | Scoped to `club_id`. Manageable by Owner/Manager with lesson permissions. |
| **Player Lessons Screen**<br>`mobile/app/(player)/lessons.tsx` | Cards: `card1.jpg`..`card3.jpg` | Entity / Hardcoded | **No** | Render dynamic lesson image or fallback. | Read-only for players. |
| **Club Events Screen**<br>`mobile/app/(club)/events.tsx` | Hero: `hero_decor.jpg`<br>Cards: `card1_clean.jpg`..`card3_clean.jpg` (Type matching) | Entity / Hardcoded | **No** | Hero: club event banner.<br>Cards: `event.cover_image_url` → Club event fallback → Neutral type fallback. | Scoped to `event.club_id`. Manageable by Owner/Manager. |
| **Player Events Screen**<br>`mobile/app/(player)/events.tsx` | Hero: `hero_events_banner.png`<br>Cards: `card1_clean.jpg`..`card3_clean.jpg` | Entity / Hardcoded | **No** | Hero: active club event banner.<br>Cards: `event.cover_image_url` → fallback. | Read-only for players. |
| **Courts / Bookings**<br>`mobile/app/(player)/bookings.tsx`<br>`mobile/app/(club)/courts.tsx` | `court_1.jpg` .. `court_5.jpg` (Index modulo) | Entity / Hardcoded | **No** | Render `court.photo_url` → Club court fallback → Neutral court fallback. | Scoped to `court.club_id`. Manageable by Owner/Manager. |
| **Club Switcher**<br>`ClubSwitcher.tsx` | `assets/lessons/paddle_icon.png` (Uniform placeholder) | Club / Hardcoded | **No** | Render each club's distinct `logo_url` in both compact bar and selector modal list. Fallback to initials badge. | Read-only for selector; club branding derived from club record. |
| **Memberships Screen**<br>`mobile/app/(club)/memberships.tsx` | `assets/memberships/hero_banner.jpg` | Club / Hardcoded | **No** | Render club cover/membership banner or club branding fallback. | Scoped to `club_id`. |
| **Player Profile Header**<br>`mobile/app/(player)/profile.tsx` | `assets/profile_hero_bg.jpg` | Global / Hardcoded | **No** | Retain as neutral player profile background or allow player custom banner. | User private asset. |
| **Club Details / Profile**<br>`mobile/app/(club)/club-details.tsx` | Club logo upload exists (`club.logo_url`) | Club-specific | Logo upload exists | Add Cover Image upload, Carousel Slides manager, and Entity Branding section. | Owner-only write permissions. |
| **App Navigation Drawer**<br>`AppDrawer.tsx` | `assets/pickleball_logo_transparent.png` | Global | **No** | Keep platform brand logo, with club badge when in club context. | Global product asset. |
| **Auth / Onboarding**<br>`login.tsx`, `platform/login.tsx` | `assets/pickleball_logo_transparent.png` | Global | **No** | Legitimate global platform asset. Retain. | No change needed. |

---

## 3. Image Ownership & Scoping Model

```mermaid
graph TD
    subgraph Platform Scope [Platform-Level Assets]
        P1[Generic Pickleball Logo]
        P2[Platform Navigation Icons]
        P3[Neutral Neutral Fallbacks]
    end

    subgraph Club Scope [Club-Level Assets]
        C1[Club Logo - logo_url]
        C2[Club Cover / Banner - cover_image_url]
        C3[Club Carousel Slides - club_carousel_slides]
        C4[Club Default Fallbacks]
    end

    subgraph Entity Scope [Entity-Level Assets]
        E1[Tournament Banners - banner_image_url]
        E2[League Banners / Cards - banner_image_url]
        E3[Event Cover Photos - cover_image_url]
        E4[Lesson & Type Images - image_url]
        E5[Court Photos - photo_url]
    end

    Platform Scope -->|Fallback Level 3| Entity Scope
    Club Scope -->|Fallback Level 2| Entity Scope
    Entity Scope -->|Primary Asset Level 1| UI[Rendered Card / Banner]
```

### Fallback Hierarchy Rules
1. **Entity-Specific Level (Level 1):** If the tournament, league, event, lesson, or court has a custom uploaded `image_url` / `banner_image_url`, render it.
2. **Club Fallback Level (Level 2):** If the entity has no custom image, use the club's cover image (`club.cover_image_url`) or club logo.
3. **Platform Fallback Level (Level 3):** If neither exists, render a clean, neutral, static format/type fallback.
4. **Strict Isolation:** Club A's images and entities can NEVER be accessed, overwritten, or displayed as fallbacks for Club B.

---

## 4. Backend Database Schema Changes Required

1. **`clubs` Table:**
   - Add `cover_image_url: VARCHAR(500) NULL` (alongside existing `logo_url`).
2. **`club_carousel_slides` Table (New):**
   - `id`: UUID (Primary Key)
   - `club_id`: UUID (FK `clubs.id` ON DELETE CASCADE, Indexed)
   - `title`: VARCHAR(255) NULL
   - `subtitle`: VARCHAR(500) NULL
   - `tag`: VARCHAR(50) NULL (e.g., 'PICKLEBALL', 'MEMBER PERKS')
   - `image_url`: VARCHAR(1000) NOT NULL
   - `cta_text`: VARCHAR(100) NULL (e.g., 'Book a Court')
   - `cta_route`: VARCHAR(255) NULL (e.g., '/(club)/bookings')
   - `script_lines`: JSON NULL (e.g., `["Same", "Game", "Bigger", "Community"]`)
   - `display_order`: INTEGER NOT NULL DEFAULT 0
   - `is_active`: BOOLEAN NOT NULL DEFAULT TRUE
   - `created_at`, `updated_at`: TIMESTAMP WITH TIME ZONE NOT NULL
3. **`tournaments` Table:**
   - Add `banner_image_url: VARCHAR(1000) NULL`.
4. **`leagues` Table:**
   - Add `banner_image_url: VARCHAR(1000) NULL`.
5. **`events` Table:**
   - Add `cover_image_url: VARCHAR(1000) NULL`.
6. **`courts` Table:**
   - Add `photo_url: VARCHAR(1000) NULL`.
7. **`lesson_types` Table:**
   - Add `image_url: VARCHAR(1000) NULL`.
8. **`lessons` Table:**
   - Add `image_url: VARCHAR(1000) NULL`.
9. **`club_media_assets` Table (New - Audit & Storage Tracking):**
   - Tracks every uploaded asset, file size, MIME type, storage provider reference, and associated entity.

---

## 5. Storage & Upload Security Architecture

### Storage Provider Strategy
- **Local / Persistent Volume Storage (Default):** Configured via `STORAGE_DIR = "uploads"`. Serves public assets through FastAPI's `/uploads` static mount.
- **S3 / Cloud Object Storage (Cloudflare R2, AWS S3, MinIO):** Configured via environment variables (`STORAGE_BACKEND=s3`, `S3_BUCKET_NAME`, `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`).
- **Zero Exposed Credentials:** Storage keys remain strictly on the backend. Frontend only receives public/relative URLs.

### Security & Validation Controls
- **Magic Bytes Verification:** Binary inspection using `PIL.Image.open` to confirm genuine PNG, JPEG, or WebP format. Rejects forged file extensions, executables, and HTML/SVG polyglots.
- **Pixel & Size Limits:** Max 5MB file size, max 4096×4096 resolution.
- **EXIF Stripping:** Sanitizes location GPS coordinates and device camera metadata before storage.
- **Safe Filename Generation:** Cryptographically random UUID4 tokens (`{scope}_{uuid}_{timestamp}.{ext}`) preventing path traversal and name collisions.
- **Permission Enforcement:** Enforced at FastAPI dependency level (`require_role` / `ClubService` tenant checks).

---

## 6. Implementation Action Plan

1. **Database & Migrations (Phase 2 & 8):**
   - Create SQLAlchemy models for `ClubCarouselSlide` and `ClubMediaAsset`.
   - Add nullable image columns to `Club`, `Tournament`, `League`, `Event`, `Court`, `LessonType`, `Lesson`.
   - Generate and apply Alembic migration.
2. **Backend Services & API Endpoints (Phases 3, 4, 7):**
   - Build `MediaStorageService` with validation, EXIF stripping, and multi-backend storage support.
   - Implement `GET /api/v1/clubs/{club_id}/branding` and `PUT /api/v1/clubs/{club_id}/branding`.
   - Implement carousel slide CRUD: `GET/POST/PUT/DELETE /api/v1/clubs/{club_id}/carousel-slides` and `PUT /api/v1/clubs/{club_id}/carousel-slides/reorder`.
   - Implement entity image endpoints for tournaments, leagues, events, lessons, and courts.
3. **Frontend Branding & Management UI (Phases 3 & 5):**
   - Build reusable `ImageUploadModal` / `MediaUploadButton` with progress, error handling, and preview.
   - Create Club Branding Settings tab in `club-details.tsx` supporting Logo, Cover, and Carousel Slide management.
   - Update `ClubHeroCarousel.tsx` to consume dynamic API data with clean fallbacks.
4. **Update Image-Bearing Pages (Phase 6):**
   - Update `TournamentCard`, `PlayerTournamentCard`, `LeagueCard`, `lessons.tsx`, `events.tsx`, `bookings.tsx`, `ClubSwitcher.tsx`.
5. **Testing & Hardening (Phase 9):**
   - Write automated pytest tests verifying multi-tenant isolation, authorization, validation, slide ordering, and fallbacks.
   - Validate mobile typecheck, lint, and build.
