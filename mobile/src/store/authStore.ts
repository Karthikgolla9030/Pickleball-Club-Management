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
// Tokens are stored in memory for instant synchronous access, and persisted to
// SecureStore on native or localStorage on Web.

let _memoryAccessToken: string | null = null;
let _memoryRefreshToken: string | null = null;
const memoryStorage: Record<string, string> = {};

function getWebStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  _memoryAccessToken = accessToken;
  _memoryRefreshToken = refreshToken;
  memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN] = accessToken;
  memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN] = refreshToken;

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        storage.setItem(SECURE_STORE_KEYS.ACCESS_TOKEN, accessToken);
        storage.setItem(SECURE_STORE_KEYS.REFRESH_TOKEN, refreshToken);
      } catch (err) {
        console.warn('[AUTH] Failed to write tokens to localStorage:', err);
      }
    }
    return;
  }

  try {
    await Promise.all([
      SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, accessToken),
      SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refreshToken),
    ]);
  } catch (err) {
    console.warn('[AUTH] Failed to write tokens to SecureStore:', err);
  }
}

export async function clearTokens(): Promise<void> {
  _memoryAccessToken = null;
  _memoryRefreshToken = null;
  delete memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN];
  delete memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN];

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        storage.removeItem(SECURE_STORE_KEYS.ACCESS_TOKEN);
        storage.removeItem(SECURE_STORE_KEYS.REFRESH_TOKEN);
      } catch {}
    }
    return;
  }

  try {
    await Promise.all([
      SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN),
    ]);
  } catch {}
}

export async function getStoredAccessToken(): Promise<string | null> {
  if (_memoryAccessToken) return _memoryAccessToken;

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        const val = storage.getItem(SECURE_STORE_KEYS.ACCESS_TOKEN);
        if (val) {
          _memoryAccessToken = val;
          memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN] = val;
          return val;
        }
      } catch {}
    }
    return memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN] ?? null;
  }

  try {
    const val = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    if (val) {
      _memoryAccessToken = val;
      return val;
    }
  } catch {}
  return memoryStorage[SECURE_STORE_KEYS.ACCESS_TOKEN] ?? null;
}

export async function getStoredRefreshToken(): Promise<string | null> {
  if (_memoryRefreshToken) return _memoryRefreshToken;

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        const val = storage.getItem(SECURE_STORE_KEYS.REFRESH_TOKEN);
        if (val) {
          _memoryRefreshToken = val;
          memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN] = val;
          return val;
        }
      } catch {}
    }
    return memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN] ?? null;
  }

  try {
    const val = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    if (val) {
      _memoryRefreshToken = val;
      return val;
    }
  } catch {}
  return memoryStorage[SECURE_STORE_KEYS.REFRESH_TOKEN] ?? null;
}

// Register SecureStore / Memory provider for the API client
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
  } catch (err) {
    console.warn('[AUTH] Token refresh handler failed:', err);
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
   * Tries to restore session using stored access token or refresh token.
   */
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      let accessToken = await getStoredAccessToken();
      if (!accessToken) {
        // Attempt refresh if access token is missing but refresh token exists
        const refreshToken = await getStoredRefreshToken();
        if (refreshToken) {
          try {
            const refreshRes = await authApi.refreshToken(refreshToken);
            const newRefreshToken = (refreshRes as any).refresh_token || refreshToken;
            await saveTokens(refreshRes.access_token, newRefreshToken);
            accessToken = refreshRes.access_token;
          } catch {
            accessToken = null;
          }
        }
      }

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
      // Token invalid or expired and refresh failed — clear and force re-login
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
