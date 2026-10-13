# Pickleball Multi-Club Platform — Comprehensive UI Consistency & Responsive Design Audit

**Date:** October 2026  
**Status:** Audit Completed / Implementation Plan  
**Target:** React Native (Expo) Universal Web & Mobile Client (`mobile/`)  
**Scope:** Player, Club Owner, Club Manager, Tournament Director, and Platform Owner experiences.

---

## 1. Executive Summary

This audit assesses the visual design, responsive layout, component consistency, and typography scaling across all modules of the Pickleball application. While the core brand palette (forest green `#176B57`, mint tint `#E5F6EC`, off-white surface `#F4F8F5`) is well-established, multiple screens exhibit diverging styling patterns, ad-hoc button implementations, colliding page headers, navigation drawer scroll/reachability constraints, and awkward text truncation on mobile screens.

This document identifies the root causes of these inconsistencies and establishes the blueprint for systematic standardization across tokens, reusable components, and role-specific screens without altering business logic, authentication, or tenant permissions.

---

## 2. Inconsistencies by Category

### A. Navigation Drawer (Club Owner & Player) — `AppDrawer.tsx`
1. **Header & Profile Section Layout**:
   - The top header row (`logoImage` + `closeBtn`) and the user identity block (`profileSection`) are rendered statically outside the `ScrollView`.
   - On compact mobile viewports (e.g. 320px–390px widths, and devices with bottom navigation/bars), this fixed top section consumes approximately 148px of vertical screen real estate, leaving only constrained space for the 16+ navigation links, group dividers, Sign Out button, and version footer.
   - Profile name and email lack `minWidth: 0`, which risks pushing the avatar on very narrow viewports (320px).
2. **Navigation Item Sizing & Alignment**:
   - `navRowLeft` lacks `flex: 1` or `minWidth: 0`. For longer navigation labels (e.g., `"Subscription & Billing"`, `"Lessons & Coaching"`), the label can collide with or push the trailing `ChevronRight` icon against the edge.
   - Inconsistent icon stroke weights (`isActive ? 2.3 : 1.9`) and varying vertical padding (`paddingVertical: 9` vs standard 11–12px touch targets) cause row heights to feel uneven.
3. **Scrolling & Reachability of Final Items**:
   - The final navigation items (`Settings`, `Help & Support`, `Privacy Policy`, `Terms of Service`, `Sign Out`, and footer version) require extensive scrolling and can be cut off or obscured by device safe areas and mobile browser toolbars.

### B. Page Headers & Action Collisions
1. **Header Truncation on Mobile (`AppHeader.tsx`)**:
   - When screens pass both a descriptive title, subtitle, and a primary action button (e.g., `+ Schedule` in `lessons.tsx`, `+ Create` in `tournaments.tsx`, `+ Create League` in `leagues.tsx`), the horizontal `inner` row (`minHeight: 52`, `flexDirection: 'row'`) severely compresses `titleBlock`.
   - On screens with longer titles (e.g., `Lessons & Coaching` in `(club)/lessons.tsx`), titles and subtitles are truncated with awkward ellipses: `"Lessons & Coachi..."` and `"Book and manage coaching sess..."` (captured in `media_1791873201809.jpg`).
   - On React Native Web, `adjustsFontSizeToFit` is ignored by the browser DOM, causing immediate overflow when horizontal space is constrained.
2. **Action Placement Inconsistency**:
   - Some pages use `AppHeader`'s `rightElement`, others define custom header rows inside their scroll views (`courts.tsx`, `members.tsx`), and others use `ScreenHeader.tsx`.
   - Action buttons in headers have inconsistent border radii (some `17px`, some `12px`, some `8px`) and heights (`34px`, `38px`, `42px`, `48px`).

### C. Button Standardization
1. **Divergent Heights & Padding**:
   - Central token in `theme/spacing.ts` defines `Dimensions.buttonHeight` as `{ sm: 40, md: 48, lg: 48 }` (both `md` and `lg` share `48px`).
   - Screen-level buttons frequently bypass `Button.tsx` and implement custom `TouchableOpacity` with disparate heights (34px, 36px, 38px, 40px, 44px, 48px, 52px).
2. **Variant & Radius Inconsistency**:
   - `Button.tsx` uses `Radius.lg` (12px), while modal buttons and drawer buttons use `14px`, `16px`, or pill `Radius.full` (999px).
   - Secondary and ghost buttons sometimes use 1px borders, sometimes 1.5px or 2px borders, with different border colors (`#E2EAE6` vs `#D0EADB` vs `#176F5B`).
3. **Compact Card Actions**:
   - Card buttons (e.g. `"View Results →"`, `"Manage League"`, `"Edit Status"`, `"Roster →"`) have divergent heights (30px–38px), inconsistent font weights (600 vs 700 vs 800), and differing padding.

### D. Typography & Scaling
1. **Hierarchy Discrepancies**:
   - Screen titles range from 21px (`courts.tsx`), 22px (`AppHeader.tsx`), 24px (`index.tsx`), to 28px (`tournaments.tsx`).
   - Subtitles fluctuate between 11.5px and 14px with varying line heights.
2. **Text Wrapping & Clamping**:
   - Variable text in cards (descriptions, club names, member names) frequently uses rigid `numberOfLines={1}` or `numberOfLines={2}` without fallback font scaling or flexible container wrapping, causing essential details to be clipped.

### E. Cards, Forms & Modals
1. **Card Padding & Elevation**:
   - Card padding alternates between 12px, 13px, 14px, 16px, and 20px.
   - Elevation and shadow styles differ between Android and Web (some use `elevation: 1`, others `elevation: 3` or `shadowRadius: 10`).
2. **Segmented Tabs & Filter Chips**:
   - In `tournaments.tsx` and `lessons.tsx`, filter chips in horizontal rows without scroll containers risk overflowing viewport edges on 320px–360px screens.
   - In `members.tsx`, top tabs (`Players`, `Staff`, `Enroll`) compete with secondary filter chips below them.

---

## 3. Scope of Affected Modules

| Experience | Screens / Components Audited | Key Issues Identified |
| :--- | :--- | :--- |
| **Shared Navigation** | `AppDrawer.tsx`, `AppHeader.tsx`, `AppBottomNav.tsx` | Fixed header height limits scroll area; drawer label collision with chevron; header title ellipsis truncation (`Lessons & Coachi...`); bottom safe area padding. |
| **Design Tokens** | `mobile/src/theme/spacing.ts`, `colors.ts`, `typography.ts` | `buttonHeight.lg` redundancy (48px vs 48px); missing compact action height token; missing drawer spacing tokens. |
| **Shared Components** | `Button.tsx`, `Card.tsx`, `ScreenHeader.tsx`, `SegmentedTabs.tsx`, `FilterChips.tsx` | Inconsistent button sizing; card radius variance; non-wrapping headers; tab chip horizontal squeeze. |
| **Club Owner & Manager** | `(club)/index.tsx`, `(club)/lessons.tsx`, `(club)/tournaments.tsx`, `(club)/leagues.tsx`, `(club)/members.tsx`, `(club)/courts.tsx`, `(club)/bookings.tsx`, `(club)/memberships.tsx`, `(club)/events.tsx`, `(club)/club-details.tsx` | Header action collision (`lessons.tsx`); filter row overflow; card action button height discrepancies; greeting wrapping. |
| **Player** | `(player)/index.tsx`, `(player)/tournaments.tsx`, `(player)/leagues.tsx`, `(player)/events.tsx`, `(player)/bookings.tsx`, `(player)/lessons.tsx`, `(player)/profile.tsx` | Static hero card typography; tab padding consistency; profile action button standardization. |
| **Platform Owner** | `platform/applications.tsx`, `platform/clubs.tsx`, `platform/login.tsx` | Admin table action button sizing; status pill color alignment. |

---

## 4. Remediation Plan

1. **Tokens (`theme/spacing.ts`, `typography.ts`)**:
   - Refine `Dimensions.buttonHeight`: `sm: 36`, `md: 44`, `lg: 50`.
   - Add `Dimensions.cardActionHeight: 34`, `inputHeight: 48`.
   - Standardize responsive typography scale for mobile and desktop.
2. **Shared Components**:
   - **`AppDrawer.tsx`**: Allow header/profile to sit harmoniously; add `flex: 1` and `minWidth: 0` to `navRowLeft`; standardize icon sizes (18px) and row padding (11px); ensure bottom padding guarantees `Settings` and `Sign Out` are completely reachable and unobstructed.
   - **`AppHeader.tsx`**: Update layout to prevent title and subtitle truncation; gracefully adjust typography and allow stacking or compact header actions on compact viewports; ensure `Lessons & Coaching` never truncates.
   - **`Button.tsx`**: Standardize sizing, padding, corner radii, and compact action support.
   - **`ScreenHeader.tsx` / `SegmentedTabs.tsx` / `FilterChips.tsx`**: Ensure horizontal scrollers prevent edge-cutting on narrow viewports.
3. **Screen Refinements**:
   - Standardize buttons across `(club)/lessons.tsx`, `(club)/tournaments.tsx`, `(club)/leagues.tsx`, `(club)/members.tsx`, `(club)/courts.tsx`, and player screens.
4. **Validation**:
   - Run typecheck, web build, and visual inspection via browser subagent across 320px, 360px, 375px, 390px, 430px, 768px, and 1024px widths.
