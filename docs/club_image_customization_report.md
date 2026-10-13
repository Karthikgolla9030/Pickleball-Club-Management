# Aught2 Pickleball / Pickleball SaaS — Complete Multi-Club Image and Banner Customization Report

## 1. Executive Summary

Prior to this implementation, the Aught2 Pickleball platform utilized shared, hardcoded pickleball action photography and static banners across all player and club staff screens. This caused every tenant club (e.g. Aught2 Pickleball, Austin Pickle Club, Lone Star Courts) to look identical.

We have designed, engineered, migrated, and verified an end-to-end **Multi-Tenant Image and Banner Customization System** that provides:
1. **Strict Multi-Tenant Scoping**: All visual brand assets and hero slides are owned by the specific club.
2. **Three-Tier Fallback Hierarchy**:
   $$\text{Entity-Specific Custom Image} \longrightarrow \text{Club-Specific Custom Cover / Logo} \longrightarrow \text{Neutral Product Fallback}$$
3. **Pillow Magic-Bytes Verification**: Uploaded binary validation ensuring genuine JPEG, PNG, or WebP formats, dimension clamping (max 4096px), size enforcement (max 5 MB), EXIF metadata stripping, and cryptographic UUID storage.
4. **Staff Self-Service Branding UI**: A complete management suite integrated directly into `Club Details -> Branding & Assets`, permitting Club Owners and authorized Staff to configure logos, covers, and reorderable hero carousel slides.
5. **Entity-Level Customization**: Direct API and model support for tournaments, leagues, events, courts, and coaching lessons.

---

## 2. Full Audit Findings & Catalog

The repository audit covered the web/mobile React Native codebase, backend models, schemas, and public assets.

| Scope | Location / Component | Legacy State | Implemented State | Authorization Required |
| :--- | :--- | :--- | :--- | :--- |
| **Club Home** | `ClubHeroCarousel.tsx` | Fixed 3-slide mock array of Unsplash URLs | Dynamic club carousel slides from backend API (`/api/v1/clubs/{id}/carousel-slides`), falling back to club cover, then neutral graphic | Staff: `MANAGE_CLUB` for management; Players: public read |
| **Club Header** | `ClubSwitcher.tsx`, Player Home Header | Generic paddle icon | Displays custom `club.logo_url` badge next to the platform app logo | Staff: `MANAGE_CLUB` |
| **Club Profile** | `club-details.tsx` | Static cover photo | Custom `club.cover_image_url` and `club.logo_url` with interactive upload / preview / restore | Staff: `MANAGE_CLUB` |
| **Tournaments** | `TournamentCard.tsx`, `PlayerTournamentCard.tsx` | Hardcoded Unsplash court / paddle photo based on format | `tournament.banner_image_url` $\rightarrow$ `club.cover_image_url` $\rightarrow$ format neutral fallback | Staff: `MANAGE_TOURNAMENTS` |
| **Leagues** | `LeagueCard.tsx` | Fixed 3 Unsplash URLs indexed modulo id | `league.banner_image_url` $\rightarrow$ `club.cover_image_url` $\rightarrow$ neutral league court photo | Staff: `MANAGE_LEAGUES` |
| **Lessons & Coaching**| `lessons.tsx` (Staff & Player) | Fixed hero photo banner + static coaching card thumbnails | Hero uses `club.cover_image_url`; Session/type uses `lesson.image_url` $\rightarrow$ `lesson_type.image_url` $\rightarrow$ `club.cover_image_url` $\rightarrow$ fallback | Staff: `MANAGE_LESSONS` |
| **Events** | `events.tsx` (Staff & Player) | Static `HERO_IMAGE` banner + gradient card thumbnails | Hero uses `club.cover_image_url`; Cards use `event.cover_image_url` $\rightarrow$ `club.cover_image_url` $\rightarrow$ fallback | Staff: `MANAGE_EVENTS` |
| **Courts & Bookings** | `courts.tsx`, `bookings.tsx` | Fixed Unsplash court URLs modulo id | `court.photo_url` $\rightarrow$ `club.cover_image_url` $\rightarrow$ neutral court photo | Staff: `MANAGE_COURTS` |
| **Player Welcome** | `(player)/index.tsx` | Fixed action pickleball banner | Dynamic welcome card utilizing current `activeClub.cover_image_url` with smooth gradient overlay | Public read |

---

## 3. Image Ownership and Fallback Hierarchy

### A. Platform-Level Assets
- **Application Logo & Favicon**: Aught2 platform branding preserved in the application header bar and authentication screens (`/assets/images/logo.png`, `icon.png`).
- **Default Fallback Graphics**: Curated, neutral assets stored in `mobile/src/constants/images.ts` and `mobile/src/utils/media.ts`.

### B. Club-Level Assets
- **`club.logo_url`**: Primary club mark / insignia, rendered in club switchers, member badges, and club detail hero header.
- **`club.cover_image_url`**: Primary brand photography for club hero cards, headers, and the default fallback for all entity cards belonging to that club.
- **`club_carousel_slides`**: Up to 10 promotional slides per club with custom slide images, titles, subtitles, call-to-action text, route destinations, display ordering, and active/inactive toggles.

### C. Entity-Level Assets
- **`tournaments.banner_image_url`**: Banner and card graphic for individual tournaments.
- **`leagues.banner_image_url`**: Banner and card graphic for individual leagues.
- **`events.cover_image_url`**: Event card thumbnail and header cover.
- **`courts.photo_url`**: Specific court facility photo.
- **`lessons.image_url` & `lesson_types.image_url`**: Coaching session and clinic graphics.

### Fallback Logic:
```typescript
function resolveMediaUrl(customUrl?: string | null, fallbackUrl?: string | null): string {
  if (customUrl && typeof customUrl === 'string' && customUrl.trim() !== '') {
    return customUrl.trim();
  }
  if (fallbackUrl && typeof fallbackUrl === 'string' && fallbackUrl.trim() !== '') {
    return fallbackUrl.trim();
  }
  return FALLBACK_IMAGES.COURT_DEFAULT;
}
```

---

## 4. Database Schema & Alembic Migration

### Migration Identifier:
- **Revision ID**: `6b0b14a41963`
- **File**: `backend/alembic/versions/6b0b14a41963_add_club_branding_and_entity_images.py`
- **Applied Status**: Successfully applied to database (`head`).

### Schema Alterations:
1. **New Table `club_carousel_slides`**:
   - `id`: UUID (Primary Key)
   - `club_id`: UUID (Foreign Key $\rightarrow$ `clubs.id`, `ondelete="CASCADE"`, Indexed)
   - `title`: String(255), Nullable
   - `subtitle`: String(500), Nullable
   - `image_url`: String(1000), Not Null
   - `cta_label`: String(100), Nullable
   - `cta_url`: String(500), Nullable
   - `display_order`: Integer, Default 0
   - `is_active`: Boolean, Default True
   - `created_at`, `updated_at`: DateTime(timezone=True)
2. **New Table `club_media_assets`**:
   - `id`: UUID (Primary Key)
   - `club_id`: UUID (Foreign Key $\rightarrow$ `clubs.id`, `ondelete="CASCADE"`, Indexed)
   - `uploaded_by_user_id`: UUID (Foreign Key $\rightarrow$ `users.id`, Nullable)
   - `asset_type`: Enum (`club_logo`, `club_cover`, `carousel_slide`, `tournament_banner`, `league_banner`, `event_cover`, `court_photo`, `lesson_image`, `general`)
   - `storage_path`: String(1000), Not Null
   - `public_url`: String(1000), Not Null
   - `file_name`: String(255), Not Null
   - `file_size_bytes`: Integer, Not Null
   - `mime_type`: String(100), Not Null
   - `width`: Integer, Nullable
   - `height`: Integer, Nullable
   - `entity_type`: String(100), Nullable
   - `entity_id`: UUID, Nullable
   - `created_at`, `updated_at`: DateTime(timezone=True)
3. **Columns Added to Existing Tables**:
   - `clubs.cover_image_url`: String(1000), Nullable
   - `tournaments.banner_image_url`: String(1000), Nullable
   - `leagues.banner_image_url`: String(1000), Nullable
   - `events.cover_image_url`: String(1000), Nullable
   - `courts.photo_url`: String(1000), Nullable
   - `lesson_types.image_url`: String(1000), Nullable
   - `lessons.image_url`: String(1000), Nullable

---

## 5. API Endpoints Specification

All endpoints are mounted under `/api/v1/clubs/{club_id}` in `backend/app/api/v1/club_assets.py`.

### A. Club Branding
- `GET /api/v1/clubs/{club_id}/branding`: Returns `{ id, name, slug, logo_url, cover_image_url }`.
- `PUT /api/v1/clubs/{club_id}/branding`: Updates logo and/or cover image URL. Requires `Permission.MANAGE_CLUB`.

### B. Media Upload
- `POST /api/v1/clubs/{club_id}/media/upload`: Multipart upload with `file`, `asset_type`, optional `entity_type` & `entity_id`.
  - Verifies Pillow magic bytes and dimensions.
  - Strips EXIF location data.
  - Saves file under `<upload_dir>/<club_id>/<safe_uuid>.<ext>`.
  - Records metadata in `club_media_assets`.
  - Returns `{ asset_id, public_url, file_name, file_size_bytes, mime_type, width, height }`.

### C. Hero Carousel Slides
- `GET /api/v1/clubs/{club_id}/carousel-slides?active_only=true`: Lists slides sorted by `display_order`.
- `POST /api/v1/clubs/{club_id}/carousel-slides`: Creates a new slide. Requires `MANAGE_CLUB`.
- `PUT /api/v1/clubs/{club_id}/carousel-slides/{slide_id}`: Updates slide details/active flag. Requires `MANAGE_CLUB`.
- `DELETE /api/v1/clubs/{club_id}/carousel-slides/{slide_id}`: Removes slide. Requires `MANAGE_CLUB`.
- `POST /api/v1/clubs/{club_id}/carousel-slides/reorder`: Reorders slides given `{"slide_ids": [...]}`. Requires `MANAGE_CLUB`.

### D. Entity Image Mutations
- `PUT /api/v1/clubs/{club_id}/tournaments/{tournament_id}/image`: Requires `MANAGE_TOURNAMENTS`.
- `PUT /api/v1/clubs/{club_id}/leagues/{league_id}/image`: Requires `MANAGE_LEAGUES`.
- `PUT /api/v1/clubs/{club_id}/events/{event_id}/image`: Requires `MANAGE_EVENTS`.
- `PUT /api/v1/clubs/{club_id}/courts/{court_id}/image`: Requires `MANAGE_COURTS`.
- `PUT /api/v1/clubs/{club_id}/lessons/{lesson_id}/image`: Requires `MANAGE_LESSONS`.
- `PUT /api/v1/clubs/{club_id}/lesson-types/{lesson_type_id}/image`: Requires `MANAGE_LESSONS`.

---

## 6. Storage Provider, Security, & Upload Validation

### Secure Media Storage (`MediaStorageService`)
- **Backend Directory**: `/uploads/<club_id>/<uuid>.<ext>`, persisted on disk and mounted via FastAPI `StaticFiles`.
- **S3 Compatibility**: Designed with hook `s3_client.upload_fileobj` when `AWS_S3_BUCKET` is configured in production environment variables.
- **Pillow Magic Header Inspection**: The file binary is loaded into PIL.Image. If image headers are invalid, corrupted, or disguised executable/HTML, it is rejected immediately with HTTP 400 (`"Invalid image file or corrupt image data"`).
- **EXIF Stripping**: Image pixels are saved directly into a clean buffer, stripping GPS metadata and sensitive camera tags before writing to disk.
- **Dimension & File Size Limits**:
  - Max file size: 5,242,880 bytes (5 MB).
  - Max pixel dimensions: 4096 $\times$ 4096 px (auto-downscaled while preserving aspect ratio if exceeding).
- **Safe Filename Generation**: The client-provided filename is completely discarded for storage; a collision-free UUIDv4 is generated with standard extension (`.jpg`, `.png`, `.webp`).
- **Path Traversal Protection**: Relative paths (`../../`) are impossible because storage filenames are pure UUIDs.
- **Access Restrictions**: No S3 secrets or storage keys are sent to the client. All public URLs are clean HTTP relative/CDN paths (`/uploads/<club_id>/<uuid>.<ext>`).

---

## 7. Multi-Tenant Isolation Controls

1. **URL & Tenant Context Validation**:
   `require_permission(...)` extracts the authenticated JWT user and retrieves their `ClubMembership` for the `{club_id}` path parameter. If the user is not a staff member of that club, FastAPI raises HTTP 403 Forbidden.
2. **Entity Ownership Check**:
   When updating an entity image (e.g. `update_tournament_image`), the service query verifies `tournament.club_id == club_id`. If an attacker attempts to supply a Tournament belonging to Club B in a request to Club A, it raises HTTP 404 Not Found.
3. **Cross-Tenant Mutation Defense**:
   Owner A cannot update Club B's branding, cannot upload media to Club B's directory, and cannot modify Club B's carousel slides or tournaments.
4. **Active Club Switching Invalidation**:
   In the mobile frontend, `useClubBranding(clubId)` and `useClubCarouselSlides(clubId)` query keys include `clubId`. Switching the active club in `ClubSwitcher` triggers an automatic React Query cache refetch, immediately displaying the newly selected club's logo, cover, and hero slides without stale cache bleeding.

---

## 8. Frontend Components & Management UI

### `ClubBrandingSection.tsx` (`Club Details -> Branding & Assets`)
- **Club Logo & Cover Management**:
  - Live preview with aspect ratio indicators (Square 1:1 for Logo, 16:9 for Cover).
  - "Change Image" triggers browser file selection with instant validation.
  - "Restore Default" resets custom URL back to null, seamlessly restoring the platform fallback.
- **Interactive Carousel Manager**:
  - Slide cards displaying title, subtitle, CTA text, destination route, and image preview.
  - "Add Slide" modal allowing staff to specify an image URL, title, subtitle, and CTA.
  - Active toggle switch allowing promotional slides to be hidden without deletion.
  - Reorder buttons (▲ Up / ▼ Down) that immediately persist updated display order via backend `/reorder` API.
  - "Delete" button with confirmation prompt.
- **Visual Entity Directory**:
  - Clean cards linking directly to Tournaments, Leagues, Events, Lessons, and Courts for entity-level photography management.

### Component Updates:
- `ClubHeroCarousel.tsx`: Fetches slides via `useClubCarouselSlides`. If none exist or disabled, renders a single high-resolution slide using `club.cover_image_url`, or the platform neutral fallback.
- `TournamentCard.tsx` & `PlayerTournamentCard.tsx`: Evaluates `tournament.banner_image_url || activeClub?.cover_image_url || FORMAT_FALLBACKS[format]`.
- `LeagueCard.tsx`: Evaluates `league.banner_image_url || activeClub?.cover_image_url || LEAGUE_DEFAULT`.
- `courts.tsx` & `bookings.tsx`: Evaluates `court.photo_url || activeClub?.cover_image_url || COURT_DEFAULT`.
- `lessons.tsx`: Evaluates `item.image_url || item.lesson_image_url || activeClub?.cover_image_url || LESSON_DEFAULT`.
- `events.tsx`: Evaluates `event.cover_image_url || activeClub?.cover_image_url || EVENT_DEFAULT`.

---

## 9. Automated Testing & Verification Results

### Backend Automated Test Suite:
Run via:
```bash
.\.venv\Scripts\python.exe -m pytest tests/test_club_image_customization.py -v
```

**Results (100% Pass Rate)**:
```
tests/test_club_image_customization.py::test_club_branding_isolation_between_club_a_and_b PASSED [ 20%]
tests/test_club_image_customization.py::test_carousel_slides_crud_ordering_and_isolation PASSED [ 40%]
tests/test_club_image_customization.py::test_entity_specific_images_and_isolation PASSED [ 60%]
tests/test_club_image_customization.py::test_rbac_and_cross_tenant_security PASSED [ 80%]
tests/test_club_image_customization.py::test_media_upload_validation_and_storage PASSED [100%]

======================== 5 passed, 2 warnings in 4.65s ========================
```

#### Detailed Test Coverage:
1. `test_club_branding_isolation_between_club_a_and_b`:
   - Configures logo and cover for Club A.
   - Configures distinct logo and cover for Club B.
   - Verifies that mutating Club A does not alter Club B.
2. `test_carousel_slides_crud_ordering_and_isolation`:
   - Creates 3 promotional slides for Club A.
   - Verifies Club B has 0 slides (strict cross-tenant isolation).
   - Reorders slides (`s3, s1, s2`) and verifies `display_order` persistence (0, 1, 2).
   - Toggles slide `is_active=False` and verifies filter `active_only=true`.
   - Deletes slide and verifies removal.
3. `test_entity_specific_images_and_isolation`:
   - Updates tournament banner on Tournament Alpha (Club A); verifies Tournament Beta (Club B) remains null.
   - Updates league banner on Winter Premier Doubles; verifies persistence.
   - Updates event cover on Social Night Mixer; verifies persistence.
   - Updates court photo on Championship Court 1; verifies persistence.
   - Updates lesson and lesson-type images; verifies persistence.
   - Clears tournament image (`image_url=None`); verifies null fallback restoration.
4. `test_rbac_and_cross_tenant_security`:
   - Unprivileged Player attempts to update club branding $\rightarrow$ Rejected with 403 Forbidden.
   - Unprivileged Player attempts to upload media $\rightarrow$ Rejected with 403 Forbidden.
   - Unprivileged Player attempts to create carousel slide $\rightarrow$ Rejected with 403 Forbidden.
   - Owner of Club A attempts to update Club B branding $\rightarrow$ Rejected with 403 Forbidden.
   - Owner of Club A attempts to upload media to Club B $\rightarrow$ Rejected with 403 Forbidden.
5. `test_media_upload_validation_and_storage`:
   - Fake text file disguised as `image/png` $\rightarrow$ Pillow rejects with 400 Bad Request.
   - Valid JPEG image bytes uploaded $\rightarrow$ Accepted with 200 OK, returns safe UUID URL, correct width & height, strips malicious traversal path.

### Mobile TypeScript Typecheck:
Run via:
```bash
npm run typecheck
```
**Result**:
```
> mobile@1.0.0 typecheck
> tsc --noEmit
# Exit code: 0 (Zero errors)
```

---

## 10. Remaining Static Assets & Rationale

During our audit, certain static assets were deliberately preserved as product-level constants rather than made club-configurable:
1. **Platform Application Logo**: `assets/images/logo.png` is the Aught2 Pickleball product brand. Clubs upload their own club logo, which is badged alongside the platform logo.
2. **Sport Category Icons**: Paddle icon, trophy icon, calendar icon, and weather icons in the UI are functional UX iconography, not club promotional imagery.
3. **Empty State & Placeholder Illustrations**: Neutral paddle and net graphics are maintained in `mobile/src/constants/images.ts` to ensure that newly created clubs without uploaded photos render an elegant fallback rather than a broken image link.

---

## 11. Deployment & Environment Configuration

### Environment Variables

#### Backend (`backend/.env`):
```ini
# Persistent upload directory on server or persistent container volume
UPLOAD_DIR="uploads"

# Optional: Cloud Object Storage (if transitioning to AWS S3 in multi-instance cluster)
AWS_S3_BUCKET=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION="us-east-1"
```

#### Frontend (`mobile/.env`):
```ini
EXPO_PUBLIC_API_URL="http://localhost:8001/api/v1"
```

### Production Deployment Steps:
1. **Apply Alembic Migration**:
   ```bash
   cd backend
   alembic upgrade head
   ```
2. **Mount Persistent Storage Volume**:
   Ensure `/uploads` directory is attached to a persistent container volume (e.g. AWS ECS EFS mount or Kubernetes PVC) so uploads survive redeployments.
3. **Static File Serving**:
   FastAPI mounts `/uploads` via `app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")`. In high-traffic environments, route `/uploads` through NGINX, Cloudflare, or an S3 CloudFront CDN.
4. **Deploy Frontend Web / Mobile**:
   Run `npm run build` or EAS build for mobile release.
