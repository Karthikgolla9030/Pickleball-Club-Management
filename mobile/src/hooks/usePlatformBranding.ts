/**
 * usePlatformBranding Hook
 *
 * Provides reactive access to runtime global platform branding configured
 * by the Platform Administrator:
 * - platformName: e.g. "Picklora" (dynamically configured in Platform Admin Settings)
 * - supportEmail: global platform support email
 * - maintenanceMode: whether maintenance mode is active
 *
 * Guarantees zero-flicker instant hydration from persistent storage on reload.
 */

import { useQuery } from '@tanstack/react-query';
import { platformBannersApi } from '@/services/api';
import {
  getCachedPlatformBranding,
  setCachedPlatformBranding,
} from '@/services/platformBrandingStorage';
import type { PlatformPublicBranding } from '@/types';

export const PLATFORM_BRANDING_QUERY_KEY = ['platform', 'branding'] as const;

export function usePlatformBranding() {
  const cached = getCachedPlatformBranding();

  const query = useQuery<PlatformPublicBranding>({
    queryKey: PLATFORM_BRANDING_QUERY_KEY,
    queryFn: async () => {
      const data = await platformBannersApi.getBranding();
      if (data && data.platform_name && data.platform_name.trim().length > 0) {
        setCachedPlatformBranding(data);
      }
      return data;
    },
    initialData: cached ?? undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  const active = query.data || cached;
  const isLoaded = Boolean(active?.platform_name && active.platform_name.trim().length > 0);

  return {
    platformName: active?.platform_name || '',
    supportEmail: active?.platform_support_email || 'support@pickleball.com',
    maintenanceMode: active?.maintenance_mode ?? false,
    isLoaded,
    isLoading: query.isLoading && !isLoaded,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    data: active,
  };
}
