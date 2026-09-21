/**
 * Aught2 Pickleball — Typography Design System
 */

export const Typography = {
  // ─── Font Families ─────────────────────────────────────────────────────────
  // React Native uses system fonts by default.
  // For production, add custom fonts via expo-font.
  family: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
    mono: 'Courier',
  },

  // ─── Font Sizes ────────────────────────────────────────────────────────────
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 40,
  },

  // ─── Font Weights ──────────────────────────────────────────────────────────
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },

  // ─── Line Heights ──────────────────────────────────────────────────────────
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },

  // ─── Letter Spacing ────────────────────────────────────────────────────────
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 2,
  },
} as const;
