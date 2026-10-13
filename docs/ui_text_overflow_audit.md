# Aught2 Pickleball / Pickleball — Global Text Overflow, Typography and Responsive UI Audit Report

**Date:** October 2026  
**Scope:** Global frontend audit of React Native / Expo Web application across all roles (Player, Club Owner, Club Manager, Tournament Director, Platform Administrator) and viewports (320px – 1280px+).

---

## 1. Executive Summary

A comprehensive audit was performed across the entire codebase to identify truncated headings, text overflows, awkward line wrapping, clipped action buttons, and responsive layout defects.

The primary defect triggering this audit is on the **Club Owner Dashboard** (`mobile/app/(club)/index.tsx`), where the heading reads:
> **"Let's make today amazing at A..."**

This occurs because:
1. The greeting string concatenates the full club name (`Let's make today amazing at {clubName || 'your club'}.`).
2. The `<AppText>` element specifies `numberOfLines={1}`.
3. The greeting sits in an unyielding flex row alongside the right-hand location pill badge (`Good People Great Games`, ~120px wide).
4. On standard mobile screens (360px – 390px), the greeting container has only ~190px–220px of width, forcing truncation.

Beyond this greeting, the audit uncovered similar typography scaling and layout truncation issues across cards, headers, buttons, metric grids, and modal footers.

---

## 2. Component-by-Component Audit Findings

| Component / Screen | File Path | Current Defect | Impact |
| :--- | :--- | :--- | :--- |
| **Club Owner Dashboard Greeting** | `mobile/app/(club)/index.tsx` | `welcomeMain` has `numberOfLines={1}` and concatenates club name into greeting text; competes with `locationPill` in same horizontal row. | Truncates to `"Let's make today amazing at A..."` on mobile viewports. |
| **Club Quick Actions Grid** | `mobile/app/(club)/index.tsx` | `quickCard` has fixed `width: '31%'` with horizontal chevron next to label; labels like "Memberships" and "Tournaments" collide with chevrons. | Labels touch or overlap chevrons on 320px–360px screens. |
| **Club Operational Stat Cards** | `mobile/app/(club)/index.tsx` | `statsRow` renders 4 cards in a single row (`flex: 1` each); labels like "4 Active Players" and "Staff Active" have `numberOfLines={1}`. | Labels truncate into `...` on mobile viewports. |
| **Player Hero Banner** | `mobile/app/(player)/index.tsx` | `heroContent` has fixed `width: '74%'` with large 25px font for `Hello,\n{displayName}`; long player names overflow or push CTA down. | Long player names collide with court background image or wrap awkwardly. |
| **Club Hero Banner Carousel** | `mobile/src/components/ClubHeroCarousel.tsx` | `heroSupportingText` has hardcoded `maxWidth: 240`; `heroScriptMotto` sits on bottom right without collision protection against pagination dots and CTA button. | Text overflows banner edges or overlaps pagination dots on 320px screens. |
| **Global App Header** | `mobile/src/components/AppHeader.tsx` | Header `title` has hardcoded `numberOfLines={1}` with no 2-line wrap or auto-sizing. | Longer titles ("Tournament Management", "Membership Subscriptions") truncate. |
| **Global Button Component** | `mobile/src/components/Button.tsx` | Label has `numberOfLines={1}` and `adjustsFontSizeToFit={false}`. | Multi-word action labels in flex row containers ("Register Now", "Confirm Booking") get clipped. |
| **Filter Chips** | `mobile/src/components/FilterChips.tsx` | Equal-width inline row mode (`equalWidth`) forces 4 chips into `flex: 1` with `numberOfLines={1}` without font auto-scaling. | Chip labels ("Registered", "Cancelled") truncate to "Regis..." on 320px–360px widths. |
| **Segmented Tabs** | `mobile/src/components/SegmentedTabs.tsx` | Non-scrollable mode applies `flex: 1` per tab with `numberOfLines={1}` and no `adjustsFontSizeToFit`. | 3–4 tabs on narrow devices clip tab text. |
| **Metric Grid** | `mobile/src/components/MetricGrid.tsx` | Values and labels have hardcoded `numberOfLines={1}` with fixed widths in 3- and 4-column configurations. | Formatted currency values (`$12,450.00`) and metric labels clip into ellipses. |
| **Modal Sheet Footers** | `mobile/src/components/ModalSheet.tsx` | Action buttons in `footerActions` use `numberOfLines={1}` without font auto-scaling. | Action text like "Confirm and Pay $45.00" clips. |
| **Tournament Card (Club)** | `mobile/src/components/competition/TournamentCard.tsx` | `heroBanner` has rigid `minHeight: 142, maxHeight: 142` with `overflow: 'hidden'`. | 2-line title + 2-line description overflows and gets cut off at bottom of banner. |
| **Player Tournament Card** | `mobile/src/components/competition/PlayerTournamentCard.tsx` | `titleRow` places tournament title and `skillPill` in rigid horizontal row without wrapping. | Skill pill ("Skill Level: 3.5 - 4.0") squashes long tournament names into 1–2 cramped words. |
| **League Card** | `mobile/src/components/competition/LeagueCard.tsx` | `subtitleText` ("12 Weeks • 12 Teams • Doubles") and live match progress texts use rigid horizontal lines. | Progress percentage and match counts collide on narrow mobile widths. |
| **Club Switcher Compact Card** | `mobile/src/components/ClubSwitcher.tsx` | `compactClubName` lacks `flexShrink: 1` inside `compactLeft`. | Long club names push chevron and role badge off the right screen edge. |

---

## 3. Typography Hierarchy Standardization Plan

The existing `Typography` tokens (`mobile/src/theme/typography.ts`) will be refined to establish consistent font size, weight, and line-height standards that prevent vertical clipping across Web, iOS, and Android:

| Typography Role | Desktop Size | Mobile Size | Weight | Line Height |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Hero Greeting** | 32 px | 24–26 px | Extrabold (800) | 1.25 (30–32 px) |
| **Main Page Title (Heading 1)** | 28 px | 24 px | Bold (700) | 1.3 (31 px) |
| **Section Heading (Heading 2)** | 22 px | 20 px | Bold (700) | 1.35 (27 px) |
| **Card Heading (Heading 3)** | 18 px | 16–17 px | Semibold (600) | 1.4 (22–24 px) |
| **Main Body Text** | 15 px | 15 px | Regular (400) | 1.5 (22 px) |
| **Supporting / Meta Text** | 13 px | 13 px | Regular (400) | 1.4 (18 px) |
| **Form Labels** | 14 px | 14 px | Medium (500) | 1.4 (20 px) |
| **Button Text** | 15 px | 14 px | Semibold (600) | 1.3 (18 px) |
| **Badge / Pill Text** | 11 px | 10.5 px | Bold (700) | 1.2 (13 px) |

---

## 4. Implementation Strategy

1. **Club Owner Dashboard**:
   - Change heading to clean, professional phrase: `"Let's make today amazing"`.
   - Keep `"Welcome back,"` as smaller supporting text above.
   - Adjust `welcomeMain` font size to 23–25px with natural 2-line wrap capability if needed.
   - Restructure `welcomeRow` to allow the greeting and `locationPill` to adapt gracefully (stacking or wrapping on viewports < 375px).
   - Convert `statsRow` to a responsive 2×2 grid on mobile viewports (< 480px) and 4-column row on tablet/desktop, eliminating label truncation.
   - Give `quickCard` adaptive width and prevent label/chevron overlap.
2. **Global Components & Theme**:
   - Update `Button.tsx` with `adjustsFontSizeToFit` and flexible content handling.
   - Update `AppHeader.tsx` to allow 2-line wrap with adaptive sizing.
   - Update `MetricGrid.tsx` with `adjustsFontSizeToFit` and multi-line label wrapping.
   - Update `FilterChips.tsx` and `SegmentedTabs.tsx` with auto-scaling to prevent label clipping.
   - Update `TournamentCard.tsx`, `PlayerTournamentCard.tsx`, and `LeagueCard.tsx` to remove rigid `maxHeight` clamping and enable responsive title/badge wrapping.
   - Fix `ClubSwitcher.tsx` with `flexShrink: 1` on `compactClubName`.
3. **Verification**:
   - Typecheck and build bundle.
   - Visual inspection via browser subagent across 360px, 390px, and 1024px viewports.
