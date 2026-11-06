/**
 * usePlatformBranding Hook
 *
 * Provides reactive access to runtime global platform branding configured
 * by the Platform Administrator:
 * - platformName: e.g. "Aught2 Pickleball" (or custom brand name set in Platform Admin Settings)
 * - supportEmail: global platform support email
 * - maintenanceMode: whether maintenance mode is active
 */

import { useQuery } from '@tanstack/react-query';
import { platformBannersApi } from '@/services/api';

export const PLATFORM_BRANDING_QUERY_KEY = ['platform', 'branding'] as const;

export function usePlatformBranding() {
  const query = useQuery({
    queryKey: PLATFORM_BRANDING_QUERY_KEY,
    queryFn: () => platformBannersApi.getBranding(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  return {
    platformName: query.data?.platform_name || 'Pickleball',
    supportEmail: query.data?.platform_support_email || 'support@pickleball.com',
    maintenanceMode: query.data?.maintenance_mode ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

