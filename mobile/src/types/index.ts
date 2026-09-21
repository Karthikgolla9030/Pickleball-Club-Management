/**
 * Aught2 Pickleball — Shared TypeScript Types
 * Single source of truth for all domain types on the mobile side.
 */

// ─── Club Role ───────────────────────────────────────────────────────────────

export type ClubRole = 'club_owner' | 'club_manager' | 'tournament_director';

export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  club_owner: 'Club Owner',
  club_manager: 'Club Manager',
  tournament_director: 'Tournament Director',
} as const;

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Club ────────────────────────────────────────────────────────────────────

export interface Club {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Club Membership ─────────────────────────────────────────────────────────

export interface MembershipInfo {
  membership_id: string;
  club_id: string;
  club_name: string;
  club_slug: string;
  role: ClubRole;
  role_label: string;
  is_active: boolean;
}

// ─── Authentication ──────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
  memberships: MembershipInfo[];
}

export interface TokenRefreshResponse {
  access_token: string;
  token_type: string;
}

// ─── Auth Session State ──────────────────────────────────────────────────────
// Stored in Zustand (non-sensitive metadata only).
// Tokens are stored in SecureStore, not here.

export interface AuthSession {
  user: User | null;
  memberships: MembershipInfo[];
  activeMembership: MembershipInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ─── API Error ───────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string | ApiValidationError[];
  status?: number;
}

export interface ApiValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export type ApiErrorType =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';
