/**
 * Aught2 Pickleball — Spacing Design System
 * 4px base grid
 */

export const Spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  // Semantic aliases
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const Radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  full: 9999,
} as const;

export const Shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 8,
  },
  brand: {
    shadowColor: '#1B6B45',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;

export const Dimensions = {
  buttonHeight: {
    sm: 40,
    md: 48,
    lg: 48,
  },
  inputHeight: 52,
  headerHeight: 56,
  tabBarHeight: 64,
  borderWidth: {
    thin: 1,
    medium: 1.5,
    thick: 2,
  },
  iconSize: {
    xs: 14,
    sm: 18,
    md: 22,
    lg: 28,
    xl: 36,
  },
} as const;

export const Layout = {
  screenHorizontal: 16,     // 16dp
  sectionSpacing: 20,       // 20dp
  cardPadding: 20,          // 20px internal card padding (exact)
  cardGap: 16,              // 16px card-to-card gap
  cardTitleBadgeGap: 12,    // 12px between title and badges
  cardBadgeDescGap: 12,     // 12px between badges and description/divider
  cardDescDividerGap: 12,   // 12px
  cardDividerMetaGap: 12,   // 12px between divider and meta rows
  cardMetaRowGap: 12,       // 12px between meta rows
  headingGap: Spacing[1.5], // 6px
  labelGap: Spacing[1.5],   // 6px
  inputGap: Spacing[3],     // 12px
  buttonGap: 10,            // 10px
  badgeGap: Spacing[1.5],   // 6px
  bottomScrollPadding: 32, // Clean 32px breathing room (AppBottomNav is in-flow below Stack)
} as const;

/**
 * Bottom scroll padding helper that calculates clean clearance
 * considering device safe area insets.
 */
export function getBottomNavPadding(bottomInset: number = 0): number {
  return Math.max(bottomInset + 24, 32);
}
