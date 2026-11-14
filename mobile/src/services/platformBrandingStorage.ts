/**
 * Platform Branding Storage & Synchronous Hydration Cache
 *
 * Provides instant, synchronous hydration of the global platform branding
 * (Platform Display Name, support email, maintenance mode) and platform banners
 * on app reload (Web localStorage / Native SecureStore & Memory Cache).
 *
 * This completely eliminates initial-render flickering across all login portals
 * where default fallback strings (e.g. "Welcome to Pickleball") were momentarily
 * rendered before the backend API responded.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { PlatformBanner, PlatformPublicBranding } from '@/types';

export const PLATFORM_BRANDING_STORAGE_KEY = 'pb_platform_branding_cache';
export const PLATFORM_BANNER_STORAGE_PREFIX = 'pb_platform_banner_cache_';

export interface CachedPlatformBranding extends PlatformPublicBranding {
  cached_at?: number;
}

let _memoryBrandingCache: CachedPlatformBranding | null = null;
const _memoryBannerCache: Record<string, PlatformBanner> = {};
let _isInitializedNative = false;

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

// ─── Synchronously seed memory cache on bundle load (Web) ────────────────────
if (Platform.OS === 'web') {
  try {
    const storage = getWebStorage();
    if (storage) {
      const raw = storage.getItem(PLATFORM_BRANDING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.platform_name === 'string' && parsed.platform_name.trim().length > 0) {
          _memoryBrandingCache = parsed;
        }
      }
    }
  } catch {
    // Non-fatal if localStorage access fails or is blocked
  }
}

/**
 * Synchronous read of cached platform branding.
 * Available immediately from the very first frame on Web reload.
 */
export function getCachedPlatformBranding(): CachedPlatformBranding | null {
  if (_memoryBrandingCache) {
    return _memoryBrandingCache;
  }

  if (Platform.OS === 'web') {
    try {
      const storage = getWebStorage();
      if (storage) {
        const raw = storage.getItem(PLATFORM_BRANDING_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.platform_name === 'string' && parsed.platform_name.trim().length > 0) {
            _memoryBrandingCache = parsed;
            return parsed;
          }
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Asynchronously initialize native storage for iOS/Android on startup.
 */
export async function initPlatformBrandingStorage(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (_isInitializedNative && _memoryBrandingCache) return;

  try {
    const raw = await SecureStore.getItemAsync(PLATFORM_BRANDING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.platform_name === 'string') {
        _memoryBrandingCache = parsed;
      }
    }
  } catch (err) {
    console.warn('[Branding] Failed to read branding from SecureStore:', err);
  } finally {
    _isInitializedNative = true;
  }
}

/**
 * Persist platform branding to memory, localStorage, and SecureStore.
 */
export async function setCachedPlatformBranding(
  branding: PlatformPublicBranding
): Promise<void> {
  const payload: CachedPlatformBranding = {
    ...branding,
    cached_at: Date.now(),
  };

  _memoryBrandingCache = payload;

  if (Platform.OS === 'web') {
    try {
      const storage = getWebStorage();
      if (storage) {
        storage.setItem(PLATFORM_BRANDING_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (err) {
      console.warn('[Branding] Failed to write branding to localStorage:', err);
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(
      PLATFORM_BRANDING_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch (err) {
    console.warn('[Branding] Failed to write branding to SecureStore:', err);
  }
}

/**
 * Synchronous read of cached platform banner by bannerType ('owner_home', 'player_home', etc.)
 */
export function getCachedPlatformBanner(bannerType: string): PlatformBanner | null {
  if (_memoryBannerCache[bannerType]) {
    return _memoryBannerCache[bannerType];
  }

  if (Platform.OS === 'web') {
    try {
      const storage = getWebStorage();
      if (storage) {
        const raw = storage.getItem(PLATFORM_BANNER_STORAGE_PREFIX + bannerType);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.banner_type === bannerType || parsed.id)) {
            _memoryBannerCache[bannerType] = parsed;
            return parsed;
          }
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Persist platform banner to memory, localStorage, and SecureStore.
 */
export async function setCachedPlatformBanner(
  bannerType: string,
  banner: PlatformBanner
): Promise<void> {
  _memoryBannerCache[bannerType] = banner;

  if (Platform.OS === 'web') {
    try {
      const storage = getWebStorage();
      if (storage) {
        storage.setItem(
          PLATFORM_BANNER_STORAGE_PREFIX + bannerType,
          JSON.stringify(banner)
        );
      }
    } catch (err) {
      console.warn('[Branding] Failed to cache platform banner to localStorage:', err);
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(
      PLATFORM_BANNER_STORAGE_PREFIX + bannerType,
      JSON.stringify(banner)
    );
  } catch (err) {
    console.warn('[Branding] Failed to cache platform banner to SecureStore:', err);
  }
}
