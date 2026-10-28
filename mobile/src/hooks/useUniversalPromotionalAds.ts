/**
 * Aught2 Pickleball — useUniversalPromotionalAds Hook
 *
 * Fetches the universal aggregation of active, eligible promotional advertisements
 * across all participating active clubs for the Player App Home page.
 */

import { useQuery } from '@tanstack/react-query';
import { clubAssetsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { UniversalPromotionalAd } from '@/types';

export function useUniversalPromotionalAds() {
  const query = useQuery<UniversalPromotionalAd[]>({
    queryKey: QUERY_KEYS.UNIVERSAL_PROMOTIONAL_ADS,
    queryFn: async () => {
      try {
        return await clubAssetsApi.getUniversalPromotionalAds();
      } catch (err) {
        console.warn('[PROMOTIONAL ADS] Failed to fetch universal ads:', err);
        return [];
      }
    },
    staleTime: 1000 * 60 * 3, // 3 minutes
    retry: 1,
  });

  return {
    ads: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
