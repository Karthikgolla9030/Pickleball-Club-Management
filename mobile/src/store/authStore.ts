/**
 * Aught2 Pickleball — Auth Store (Zustand)
 *
 * Stores NON-SENSITIVE session metadata only:
 *   - User identity info
 *   - Club memberships
 *   - Active membership selection
 *
 * IMPORTANT: Tokens (access/refresh) are NEVER stored here.
 * Tokens live in expo-secure-store only.
 *
 * This store is NOT persisted to AsyncStorage or any other storage.
 * Session is restored via SecureStore → API call on app launch.
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

import { SECURE_STORE_KEYS } from '@/constants';
import { authApi, setTokenProvider } from '@/services/api';
import type { AuthSession, MembershipInfo } from '@/types';

interface AuthStoreState extends AuthSession {
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveMembership: (membership: MembershipInfo) => void;
  clearError: () => void;
  error: string | null;
}

// ─── Secure Token Helpers ─────────────────────────────────────────────────────
// Tokens are ONLY stored in SecureStore — never in Zustand state.

async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refreshToken),
  ]);
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN),
  ]);
}

async function getStoredAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
}

// Register SecureStore as the token provider for the API client
// This allows the client to always get the latest token without circular deps
setTokenProvider(getStoredAccessToken);

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  // Initial state
  user: null,
  memberships: [],
  activeMembership: null,
  isAuthenticated: false,
  isLoading: true, // Start loading until initialize() completes
  error: null,

  /**
   * Called once on app launch.
   * Tries to restore session using stored access token.
   */
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const accessToken = await getStoredAccessToken();
      if (!accessToken) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      const response = await authApi.getMe();
      const activeMembership =
        response.memberships.length === 1
          ? response.memberships[0]
          : (get().activeMembership ?? null);

      set({
        user: response.user,
        memberships: response.memberships,
        activeMembership,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Token invalid or expired — clear and force re-login
      await clearTokens();
      set({
        user: null,
        memberships: [],
        activeMembership: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  /**
   * Login: authenticate with email and password.
   * Stores tokens securely, updates session state.
   */
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.login(email, password);

      // Tokens go to SecureStore ONLY
      await saveTokens(response.access_token, response.refresh_token);

      const activeMembership =
        response.memberships.length === 1 ? response.memberships[0] : null;

      set({
        user: response.user,
        memberships: response.memberships,
        activeMembership,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Login failed';
      set({ isLoading: false, error: message, isAuthenticated: false });
      throw error;
    }
  },

  /**
   * Logout: clear tokens and session state.
   */
  logout: async () => {
    await clearTokens();
    set({
      user: null,
      memberships: [],
      activeMembership: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  setActiveMembership: (membership: MembershipInfo) => {
    set({ activeMembership: membership });
  },

  clearError: () => set({ error: null }),
}));
