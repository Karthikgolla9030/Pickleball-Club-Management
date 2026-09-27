/**
 * Aught2 Pickleball — Color Design System
 *
 * Premium light-theme palette: soft off-white backgrounds, deep forest green
 * brand accents, muted status colors with tinted backgrounds.
 * All colors are defined as constants — never use raw hex values in components.
 */

export const Colors = {
  // ─── Brand ─────────────────────────────────────────────────────────────────
  brand: {
    primary: '#176B57',      // Dark forest green
    primaryDark: '#104A3C',  // Hover / pressed state
    primaryLight: '#E5F6EC', // Soft pale green tint
    accent: '#2E8069',       // Secondary green
    accentDark: '#176B57',
  },

  // ─── Backgrounds ────────────────────────────────────────────────────────────
  background: {
    primary: '#F4F8F5',    // Page background (soft light green-gray)
    secondary: '#FFFFFF',  // Card background
    tertiary: '#EDF2F7',
    overlay: 'rgba(0, 0, 0, 0.4)',
  },

  // ─── Surface / Cards ─────────────────────────────────────────────────────────
  surface: {
    default: '#FFFFFF',
    elevated: '#F4F8F5',
    border: '#E2EAE6',
    borderLight: '#EDF2F7',
  },

  // ─── Text ──────────────────────────────────────────────────────────────────
  text: {
    primary: '#102B2A',    // Dark navy/forest green
    secondary: '#667776',  // Muted gray-green
    tertiary: '#9CA3AF',
    inverse: '#FFFFFF',
    link: '#176B57',
  },

  // ─── Status (tinted bg + solid text — never solid fill blocks) ─────────────
  status: {
    // In Progress / Bracket / Pool Play
    inProgressBg: '#E7F0FB',
    inProgress: '#2563A8',
    // Completed
    completedBg: '#E7F0FB',
    completed: '#2563A8',
    // Cancelled
    cancelledBg: '#FDE8E8',
    cancelled: '#B42318',
    // Draft
    draftBg: '#FFF5D8',
    draft: '#9A6B00',
    // Active / Registration Open
    registrationOpenBg: '#E5F6EC',
    registrationOpen: '#18794E',
    // Playoffs
    playoffsBg: '#E9D7FE',
    playoffs: '#6941C6',
    // Generic success / warning / error / info
    success: '#18794E',
    successBg: '#E5F6EC',
    warning: '#9A6B00',
    warningBg: '#FFF5D8',
    error: '#B42318',
    errorBg: '#FDE8E8',
    info: '#2563A8',
    infoBg: '#E7F0FB',
  },

  // ─── Role Colors ───────────────────────────────────────────────────────────
  roles: {
    clubOwner: '#B45309',          // Amber — ownership (dark enough for light bg)
    clubManager: '#1D4ED8',        // Blue — operations
    tournamentDirector: '#7C3AED', // Purple — competition
    player: '#1B6B45',             // Green — player
  },

  // ─── Drawer Navigation ─────────────────────────────────────────────────────
  drawer: {
    background: '#FFFFFF',
    itemHover: '#F7F8FA',
    itemActive: '#E7F5EC',
    sectionLabel: '#9CA3AF',
    separator: '#E5E7EB',
  },

  // ─── Transparent ───────────────────────────────────────────────────────────
  transparent: 'transparent',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type ColorKey = keyof typeof Colors;
