/**
 * Aught2 Pickleball — usePlatformBanners Hook
 *
 * Provides query and mutation hooks for Platform Administrators and Client Apps:
 * - usePlatformBanners(): Fetches all platform banners ('owner_home', 'player_home')
 * - usePlatformBanner(type): Fetches a single platform banner
 * - useUpdatePlatformBanner(): Admin mutation to update title, subtitle, CTA text/destination
 * - useUploadPlatformBannerImage(): Admin mutation to upload custom hero banner image
 * - useResetPlatformBanner(): Admin mutation to reset back to built-in fallback
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformBannersApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { PlatformBanner, UpdatePlatformBannerPayload } from '@/types';

export function usePlatformBanners() {
  const query = useQuery<Record<string, PlatformBanner>>({
    queryKey: QUERY_KEYS.PLATFORM_BANNERS,
    queryFn: () => platformBannersApi.getBanners(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  return {
    banners: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function usePlatformBanner(bannerType: 'owner_home' | 'player_home') {
  const query = useQuery<PlatformBanner | null>({
    queryKey: QUERY_KEYS.PLATFORM_BANNER(bannerType),
    queryFn: async () => {
      try {
        return await platformBannersApi.getBanner(bannerType);
      } catch (err) {
        return null;
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  return {
    banner: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function usePlatformBannerMutations(bannerType?: 'owner_home' | 'player_home') {
  const queryClient = useQueryClient();

  const invalidate = (type?: string) => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLATFORM_BANNERS });
    if (type) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLATFORM_BANNER(type as any) });
    }
  };

  const updateBanner = useMutation({
    mutationFn: ({
      type,
      payload,
    }: {
      type: 'owner_home' | 'player_home';
      payload: UpdatePlatformBannerPayload;
    }) => {
      return platformBannersApi.updateBanner(type, payload);
    },
    onSuccess: (data, vars) => {
      queryClient.setQueryData(QUERY_KEYS.PLATFORM_BANNER(vars.type), data);
      invalidate(vars.type);
    },
  });

  const uploadBannerImage = useMutation({
    mutationFn: ({
      type,
      fileInput,
    }: {
      type: 'owner_home' | 'player_home';
      fileInput: { uri: string; name?: string; type?: string; blob?: Blob };
    }) => {
      return platformBannersApi.uploadBannerImage(type, fileInput);
    },
    onSuccess: (data, vars) => {
      queryClient.setQueryData(QUERY_KEYS.PLATFORM_BANNER(vars.type), data);
      invalidate(vars.type);
    },
  });

  const resetBanner = useMutation({
    mutationFn: (type: 'owner_home' | 'player_home') => {
      return platformBannersApi.resetBanner(type);
    },
    onSuccess: (data, vars) => {
      queryClient.setQueryData(QUERY_KEYS.PLATFORM_BANNER(vars), data);
      invalidate(vars);
    },
  });

  return {
    updateBanner,
    uploadBannerImage,
    resetBanner,
  };
}
