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
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { SECURE_STORE_KEYS } from '@/constants';
import { authApi, setTokenProvider, setTokenRefreshHandler } from '@/services/api';
import type { AuthSession, MembershipInfo } from '@/types';

interface AuthStoreState extends AuthSession {
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginClub: (email: string, password: string) => Promise<void>;
  loginPlayer: (email: string, password: string) => Promise<void>;
  registerPlayer: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveMembership: (membership: MembershipInfo) => void;
  refreshMemberships: () => Promise<void>;
  clearError: () => void;
  error: string | null;
}

// ─── Secure Token Helpers ─────────────────────────────────────────────────────
// Tokens are stored in SecureStore on native, and localStorage on Web.

const memoryStorage: Record<string, string> = {};

function getWebStorage() {
  const g = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : {};
  const win = g.window as { localStorage?: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void } } | undefined;
  if (win && typeof win !== 'undefined' && 'localStorage' in win) {
    try {
      return win.localStorage;
    } catch {
      return null;
    }
  }
  return null;
}

async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      storage.setItem(SECURE_STORE_KEYS.ACCESS_TOKEN, accessToken);
      storage.setItem(SECURE_STORE_KEYS.REFRESH_TOKEN, refreshToken);
    } else {
      memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN] = accessToken;
      memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN] = refreshToken;
    }
    return;
  }
  await Promise.all([
    SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refreshToken),
  ]);
}

async function clearTokens(): Promise<void> {
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      storage.removeItem(SECURE_STORE_KEYS.ACCESS_TOKEN);
      storage.removeItem(SECURE_STORE_KEYS.REFRESH_TOKEN);
    } else {
      delete memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN];
      delete memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN];
    }
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN),
  ]);
}

async function getStoredAccessToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    return storage ? storage.getItem(SECURE_STORE_KEYS.ACCESS_TOKEN) : (memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN] ?? null);
  }
  return SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
}

async function getStoredRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    return storage ? storage.getItem(SECURE_STORE_KEYS.REFRESH_TOKEN) : (memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN] ?? null);
  }
  return SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
}

// Register SecureStore as the token provider for the API client
setTokenProvider(getStoredAccessToken);

// Register token refresh interceptor for 401 recovery
setTokenRefreshHandler(async () => {
  try {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      await useAuthStore.getState().logout();
      return null;
    }
    const response = await authApi.refreshToken(refreshToken);
    const newRefreshToken = (response as any).refresh_token || refreshToken;
    await saveTokens(response.access_token, newRefreshToken);
    return response.access_token;
  } catch {
    await useAuthStore.getState().logout();
    return null;
  }
});

// Logout hook registry for flushing TanStack query caches
let _onLogoutCallbacks: Array<() => void> = [];

export function registerLogoutHandler(cb: () => void): () => void {
  _onLogoutCallbacks.push(cb);
  return () => {
    _onLogoutCallbacks = _onLogoutCallbacks.filter((c) => c !== cb);
  };
}

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
      const currentActive = get().activeMembership;
      const validActive =
        currentActive && response.memberships.some((m) => m.membership_id === currentActive.membership_id)
          ? currentActive
          : response.memberships[0] ?? null;

      set({
        user: response.user,
        memberships: response.memberships,
        activeMembership: validActive,
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

      const activeMembership = response.memberships[0] ?? null;

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
   * Club Staff Login: backend automatically determines role from ClubMembership.
   * Rejects non-staff or disabled accounts with explicit messages.
   */
  loginClub: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.loginClub(email, password);
      await saveTokens(response.access_token, response.refresh_token);
      const activeMembership = response.memberships[0] ?? null;

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
        error instanceof Error ? error.message : 'Club login failed';
      set({ isLoading: false, error: message, isAuthenticated: false });
      throw error;
    }
  },

  /**
   * Player Login: authenticates player account for player portal only.
   */
  loginPlayer: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.loginPlayer(email, password);
      await saveTokens(response.access_token, response.refresh_token);

      set({
        user: response.user,
        memberships: [],
        activeMembership: null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Player login failed';
      set({ isLoading: false, error: message, isAuthenticated: false });
      throw error;
    }
  },

  /**
   * Player Self-Registration.
   */
  registerPlayer: async (fullName: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.registerPlayer(email, password, fullName);
      await saveTokens(response.access_token, response.refresh_token);

      set({
        user: response.user,
        memberships: [],
        activeMembership: null,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Registration failed';
      set({ isLoading: false, error: message, isAuthenticated: false });
      throw error;
    }
  },

  /**
   * Logout: clear tokens, flush query cache, and reset session state.
   */
  logout: async () => {
    await clearTokens();
    _onLogoutCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Error during logout callback:', e);
      }
    });
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

  refreshMemberships: async () => {
    try {
      const response = await authApi.getMe();
      const currentActive = get().activeMembership;
      const validActive =
        currentActive && response.memberships.some((m) => m.membership_id === currentActive.membership_id)
          ? currentActive
          : response.memberships[0] ?? null;

      set({
        memberships: response.memberships,
        activeMembership: validActive,
      });
    } catch {
      // Ignore background refresh errors
    }
  },

  clearError: () => set({ error: null }),

}));
