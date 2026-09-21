/**
 * Aught2 Pickleball — Color Design System
 *
 * Pickleball-inspired palette: court green accents, dark professional base.
 * All colors are defined as constants — never use raw hex values in components.
 */

export const Colors = {
  // ─── Brand ─────────────────────────────────────────────────────────────────
  brand: {
    primary: '#00C896',      // Pickleball court green — main CTA
    primaryDark: '#00A87C',  // Pressed / hover state
    primaryLight: '#33D4A9', // Light variant
    accent: '#F5A623',       // Warm amber — highlights, badges
    accentDark: '#D4891A',
  },

  // ─── Backgrounds ────────────────────────────────────────────────────────────
  background: {
    primary: '#0A0E1A',    // Deep navy — main app background
    secondary: '#111827',  // Slightly lighter — cards, panels
    tertiary: '#1A2235',   // Surface elevation
    overlay: 'rgba(10, 14, 26, 0.85)',
  },

  // ─── Surface / Cards ─────────────────────────────────────────────────────────
  surface: {
    default: '#141C2E',
    elevated: '#1E2A40',
    border: '#2A3650',
    borderLight: '#354060',
  },

  // ─── Text ──────────────────────────────────────────────────────────────────
  text: {
    primary: '#F0F4FF',    // Near-white, slight blue tint
    secondary: '#9BA8C0',  // Muted text
    tertiary: '#6B7A99',   // Placeholder, disabled
    inverse: '#0A0E1A',    // Text on light/brand backgrounds
    link: '#00C896',
  },

  // ─── Status ────────────────────────────────────────────────────────────────
  status: {
    success: '#22C55E',
    successBg: 'rgba(34, 197, 94, 0.12)',
    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.12)',
    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.12)',
    info: '#3B82F6',
    infoBg: 'rgba(59, 130, 246, 0.12)',
  },

  // ─── Role Colors ───────────────────────────────────────────────────────────
  roles: {
    clubOwner: '#F5A623',          // Amber — ownership
    clubManager: '#3B82F6',        // Blue — operations
    tournamentDirector: '#8B5CF6', // Purple — competition
    player: '#00C896',             // Green — player
  },

  // ─── Transparent ───────────────────────────────────────────────────────────
  transparent: 'transparent',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type ColorKey = keyof typeof Colors;
