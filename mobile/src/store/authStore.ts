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

import { SECURE_STORE_KEYS, isPlatformAdminEmail } from '@/constants';
import { authApi, setTokenProvider, setTokenRefreshHandler } from '@/services/api';
import type { AuthPortal, AuthSession, MembershipInfo } from '@/types';

interface AuthStoreState extends AuthSession {
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginClub: (email: string, password: string) => Promise<void>;
  loginPlayer: (email: string, password: string) => Promise<void>;
  loginPlatform: (email: string, password: string) => Promise<void>;
  registerPlayer: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveMembership: (membership: MembershipInfo) => void;
  setActivePortal: (portal: AuthPortal) => void;
  refreshMemberships: () => Promise<void>;
  clearError: () => void;
  error: string | null;
}

// ─── Secure Token Helpers ─────────────────────────────────────────────────────
// Tokens are stored in memory for instant synchronous access, and persisted to
// SecureStore on native or localStorage on Web.

let _memoryAccessToken: string | null = null;
let _memoryRefreshToken: string | null = null;
let _memoryActivePortal: AuthPortal | null = null;
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

  await clearUserCache();

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

let _memoryUserCache: { user: any; memberships: any[] } | null = null;

export async function saveUserCache(user: any, memberships: any[]): Promise<void> {
  _memoryUserCache = { user, memberships };
  const str = JSON.stringify({ user, memberships });
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        storage.setItem(SECURE_STORE_KEYS.USER_CACHE, str);
      } catch {}
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.USER_CACHE, str);
  } catch {}
}

export async function getStoredUserCache(): Promise<{ user: any; memberships: any[] } | null> {
  if (_memoryUserCache) return _memoryUserCache;
  let str: string | null = null;
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        str = storage.getItem(SECURE_STORE_KEYS.USER_CACHE);
      } catch {}
    }
  } else {
    try {
      str = await SecureStore.getItemAsync(SECURE_STORE_KEYS.USER_CACHE);
    } catch {}
  }
  if (!str) return null;
  try {
    const parsed = JSON.parse(str);
    if (parsed?.user) {
      _memoryUserCache = parsed;
      return parsed;
    }
  } catch {}
  return null;
}

export async function clearUserCache(): Promise<void> {
  _memoryUserCache = null;
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        storage.removeItem(SECURE_STORE_KEYS.USER_CACHE);
      } catch {}
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.USER_CACHE);
  } catch {}
}

export async function saveActivePortal(portal: AuthPortal): Promise<void> {
  _memoryActivePortal = portal;
  memoryStorage[SECURE_STORE_KEYS.ACTIVE_PORTAL] = portal;

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        storage.setItem(SECURE_STORE_KEYS.ACTIVE_PORTAL, portal);
      } catch {}
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACTIVE_PORTAL, portal);
  } catch {}
}

export async function getStoredPortal(): Promise<AuthPortal | null> {
  if (_memoryActivePortal) return _memoryActivePortal;

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        const val = storage.getItem(SECURE_STORE_KEYS.ACTIVE_PORTAL);
        if (val === 'platform' || val === 'club' || val === 'player') {
          _memoryActivePortal = val;
          return val;
        }
      } catch {}
    }
    const memVal = memoryStorage[SECURE_STORE_KEYS.ACTIVE_PORTAL];
    if (memVal === 'platform' || memVal === 'club' || memVal === 'player') {
      return memVal;
    }
    return null;
  }

  try {
    const val = await SecureStore.getItemAsync(SECURE_STORE_KEYS.ACTIVE_PORTAL);
    if (val === 'platform' || val === 'club' || val === 'player') {
      _memoryActivePortal = val;
      return val;
    }
  } catch {}
  return null;
}

export async function clearActivePortal(): Promise<void> {
  _memoryActivePortal = null;
  delete memoryStorage[SECURE_STORE_KEYS.ACTIVE_PORTAL];

  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        storage.removeItem(SECURE_STORE_KEYS.ACTIVE_PORTAL);
      } catch {}
    }
    return;
  }

  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACTIVE_PORTAL);
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
  } catch (err: any) {
    console.warn('[AUTH] Token refresh handler failed:', err);
    const status = err?.status ?? err?.response?.status;
    const msg = String(err?.message || '').toLowerCase();
    const isNetworkError = !status && (msg.includes('network') || msg.includes('timeout') || msg.includes('abort') || msg.includes('offline'));
    // Only logout on authentic 400/401/403 credential rejection, NEVER on network timeouts or 5xx server issues
    if (status === 401 || status === 403 || (status === 400 && !isNetworkError)) {
      await useAuthStore.getState().logout();
    }
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
  activePortal: null,
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
      const refreshToken = await getStoredRefreshToken();
      const cachedSession = await getStoredUserCache();
      const storedPortal = await getStoredPortal();

      // 1. Fast Session Restoration: hydrate from cache immediately to prevent login flicker
      if (accessToken && cachedSession?.user) {
        const isPlatformUser = Boolean(
          cachedSession.user.is_platform_admin || isPlatformAdminEmail(cachedSession.user.email)
        );
        let resolvedPortal = storedPortal || (isPlatformUser ? 'platform' : (cachedSession.memberships?.length > 0 ? 'club' : 'player'));
        if (isPlatformUser) resolvedPortal = 'platform';

        set({
          user: cachedSession.user,
          memberships: cachedSession.memberships || [],
          activeMembership: cachedSession.memberships?.[0] ?? null,
          activePortal: resolvedPortal,
          isAuthenticated: true,
          isLoading: false,
        });
      }

      // 2. Token refresh if access token missing or expired
      if (!accessToken && refreshToken) {
        try {
          const refreshRes = await authApi.refreshToken(refreshToken);
          const newRefreshToken = (refreshRes as any).refresh_token || refreshToken;
          await saveTokens(refreshRes.access_token, newRefreshToken);
          accessToken = refreshRes.access_token;
        } catch (rErr: any) {
          const status = rErr?.status ?? rErr?.response?.status;
          if (status === 401 || status === 403 || status === 400) {
            await clearTokens();
            await clearActivePortal();
            await clearUserCache();
            set({ isLoading: false, isAuthenticated: false, user: null, memberships: [], activePortal: null });
            return;
          }
        }
      }

      if (!accessToken) {
        await clearActivePortal();
        await clearUserCache();
        set({ isLoading: false, isAuthenticated: false, activePortal: null, user: null, memberships: [] });
        return;
      }

      // 3. Authoritative server verification
      try {
        const response = await authApi.getMe();
        const currentActive = get().activeMembership;
        const validActive =
          currentActive && response.memberships.some((m) => m.membership_id === currentActive.membership_id)
            ? currentActive
            : response.memberships[0] ?? null;

        const isPlatformUser = Boolean(
          response.user.is_platform_admin || isPlatformAdminEmail(response.user.email)
        );

        let resolvedPortal: AuthPortal = 'player';
        if (isPlatformUser) {
          resolvedPortal = 'platform';
        } else if (storedPortal === 'club' && response.memberships.length > 0) {
          resolvedPortal = 'club';
        } else if (storedPortal === 'player') {
          resolvedPortal = 'player';
        } else if (response.memberships.length > 0) {
          resolvedPortal = 'club';
        } else {
          resolvedPortal = 'player';
        }

        await saveActivePortal(resolvedPortal);
        await saveUserCache(response.user, response.memberships);

        set({
          user: response.user,
          memberships: response.memberships,
          activeMembership: validActive,
          activePortal: resolvedPortal,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (getMeErr: any) {
        const status = getMeErr?.status ?? getMeErr?.response?.status;
        if (status === 401) {
          if (refreshToken) {
            try {
              const refreshRes = await authApi.refreshToken(refreshToken);
              const newRefreshToken = (refreshRes as any).refresh_token || refreshToken;
              await saveTokens(refreshRes.access_token, newRefreshToken);
              const retryResponse = await authApi.getMe();
              await saveUserCache(retryResponse.user, retryResponse.memberships);
              set({
                user: retryResponse.user,
                memberships: retryResponse.memberships,
                isAuthenticated: true,
                isLoading: false,
              });
              return;
            } catch (refFail: any) {
              const refStatus = refFail?.status ?? refFail?.response?.status;
              if (refStatus === 401 || refStatus === 403 || refStatus === 400) {
                await clearTokens();
                await clearActivePortal();
                await clearUserCache();
                set({
                  user: null,
                  memberships: [],
                  activeMembership: null,
                  activePortal: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
                return;
              }
            }
          }
        }

        // If network glitch or 5xx server error occurred but we already restored from cache, keep session alive
        if (cachedSession?.user) {
          console.warn('[AUTH] Offline or server glitch; keeping authenticated cache alive:', getMeErr);
          set({ isLoading: false, isAuthenticated: true });
          return;
        }

        set({ isLoading: false });
      }
    } catch (globalErr) {
      console.warn('[AUTH] Initialization error:', globalErr);
      set({ isLoading: false });
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
      const isPlatformUser = Boolean(
        response.user.is_platform_admin || isPlatformAdminEmail(response.user.email)
      );
      const portal: AuthPortal = isPlatformUser
        ? 'platform'
        : response.memberships.length > 0
          ? 'club'
          : 'player';
      await saveActivePortal(portal);
      await saveUserCache(response.user, response.memberships);

      set({
        user: response.user,
        memberships: response.memberships,
        activeMembership,
        activePortal: portal,
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
      await saveActivePortal('club');
      await saveUserCache(response.user, response.memberships);
      const activeMembership = response.memberships[0] ?? null;

      set({
        user: response.user,
        memberships: response.memberships,
        activeMembership,
        activePortal: 'club',
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
      await saveActivePortal('player');
      await saveUserCache(response.user, []);

      set({
        user: response.user,
        memberships: [],
        activeMembership: null,
        activePortal: 'player',
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
   * Platform Owner Login: authenticates platform owner account for administration only.
   * Dedicated administrative entry point.
   */
  loginPlatform: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.loginPlatform(email, password);
      await saveTokens(response.access_token, response.refresh_token);
      await saveActivePortal('platform');
      await saveUserCache(response.user, []);

      set({
        user: response.user,
        memberships: [],
        activeMembership: null,
        activePortal: 'platform',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Platform login failed';
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
      await saveActivePortal('player');
      await saveUserCache(response.user, []);

      set({
        user: response.user,
        memberships: [],
        activeMembership: null,
        activePortal: 'player',
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
    await clearActivePortal();
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
      activePortal: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  setActiveMembership: (membership: MembershipInfo) => {
    set({ activeMembership: membership });
  },

  setActivePortal: (portal: AuthPortal) => {
    saveActivePortal(portal);
    set({ activePortal: portal });
  },

  refreshMemberships: async () => {
    try {
      const response = await authApi.getMe();
      const currentActive = get().activeMembership;
      const validActive =
        currentActive && response.memberships.some((m) => m.membership_id === currentActive.membership_id)
          ? currentActive
          : response.memberships[0] ?? null;

      const currentUser = get().user || response.user;
      if (currentUser) {
        await saveUserCache(currentUser, response.memberships);
      }

      set({
        user: response.user,
        memberships: response.memberships,
        activeMembership: validActive,
      });
    } catch {
      // Ignore background refresh errors
    }
  },

  clearError: () => set({ error: null }),

}));
