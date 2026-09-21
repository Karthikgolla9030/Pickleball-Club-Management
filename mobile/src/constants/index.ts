/**
 * Aught2 Pickleball — Application Constants
 */

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const API_ENDPOINTS = {
  BASE: API_BASE,

  // Auth
  AUTH_LOGIN: `${API_BASE}/api/v1/auth/login`,
  AUTH_REFRESH: `${API_BASE}/api/v1/auth/refresh`,
  AUTH_ME: `${API_BASE}/api/v1/auth/me`,

  // Clubs (Phase 2+)
  CLUBS: `${API_BASE}/api/v1/clubs`,

  // Tournaments (Phase 2+)
  TOURNAMENTS: `${API_BASE}/api/v1/tournaments`,

  // Leagues (Phase 2+)
  LEAGUES: `${API_BASE}/api/v1/leagues`,
} as const;

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'aught2_access_token',
  REFRESH_TOKEN: 'aught2_refresh_token',
} as const;

export const QUERY_KEYS = {
  ME: ['auth', 'me'] as const,
  CLUBS: ['clubs'] as const,
  TOURNAMENTS: (clubId: string) => ['tournaments', clubId] as const,
  LEAGUES: (clubId: string) => ['leagues', clubId] as const,
} as const;

export const APP_CONFIG = {
  NAME: 'Aught2 Pickleball',
  VERSION: '1.0.0',
  API_TIMEOUT_MS: 10000,
  TOKEN_REFRESH_BUFFER_MS: 60 * 1000, // Refresh 60s before expiry
} as const;
