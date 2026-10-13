/**
 * Aught2 Pickleball — useClubBranding & useClubCarousel Hook
 *
 * Provides query and mutation hooks for:
 * - Club branding (logo, cover)
 * - Hero carousel slides (player display & staff editing/reordering)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubAssetsApi } from '@/services/api';
import type { ClubBranding, ClubCarouselSlide } from '@/types';

export function useClubBranding(clubId?: string | null) {
  const query = useQuery<ClubBranding | null>({
    queryKey: ['club-branding', clubId],
    queryFn: async () => {
      if (!clubId) return null;
      try {
        return await clubAssetsApi.getClubBranding(clubId);
      } catch (err) {
        return null;
      }
    },
    enabled: Boolean(clubId),
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  return {
    data: query.data ?? null,
    branding: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useUpdateClubBranding(clubIdParam?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      clubId?: string;
      logo_url?: string | null;
      cover_image_url?: string | null;
      logoUrl?: string | null;
      coverImageUrl?: string | null;
    }) => {
      const targetClubId = payload.clubId || clubIdParam;
      if (!targetClubId) throw new Error('clubId is required');
      const logo = payload.logo_url !== undefined ? payload.logo_url : payload.logoUrl;
      const cover = payload.cover_image_url !== undefined ? payload.cover_image_url : payload.coverImageUrl;
      return clubAssetsApi.updateClubBranding(targetClubId, {
        logo_url: logo,
        cover_image_url: cover,
      });
    },
    onSuccess: (_, vars) => {
      const targetClubId = vars.clubId || clubIdParam;
      if (targetClubId) {
        queryClient.invalidateQueries({ queryKey: ['club-branding', targetClubId] });
        queryClient.invalidateQueries({ queryKey: ['club-details', targetClubId] });
      }
      queryClient.invalidateQueries({ queryKey: ['user-clubs'] });
      queryClient.invalidateQueries({ queryKey: ['player-clubs'] });
    },
  });
}

export function useClubCarouselSlides(clubId?: string | null, activeOnly: boolean = true) {
  const query = useQuery<ClubCarouselSlide[]>({
    queryKey: ['club-carousel-slides', clubId, activeOnly],
    queryFn: async () => {
      if (!clubId) return [];
      try {
        return await clubAssetsApi.getCarouselSlides(clubId, activeOnly);
      } catch (err) {
        return [];
      }
    },
    enabled: Boolean(clubId),
    staleTime: 1000 * 60 * 3, // 3 minutes
    retry: 1,
  });

  return {
    data: query.data ?? [],
    slides: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCarouselMutations(clubId?: string | null) {
  const queryClient = useQueryClient();

  const invalidateSlides = () => {
    if (clubId) {
      queryClient.invalidateQueries({ queryKey: ['club-carousel-slides', clubId] });
    }
  };

  const createSlide = useMutation({
    mutationFn: (payload: {
      title?: string | null;
      subtitle?: string | null;
      tag?: string | null;
      image_url: string;
      cta_text?: string | null;
      cta_route?: string | null;
      display_order?: number;
      is_active?: boolean;
    }) => {
      if (!clubId) throw new Error('clubId is required');
      return clubAssetsApi.createCarouselSlide(clubId, payload);
    },
    onSuccess: invalidateSlides,
  });

  const updateSlide = useMutation({
    mutationFn: ({
      slideId,
      payload,
    }: {
      slideId: string;
      payload: {
        title?: string | null;
        subtitle?: string | null;
        tag?: string | null;
        image_url?: string | null;
        cta_text?: string | null;
        cta_route?: string | null;
        display_order?: number;
        is_active?: boolean;
      };
    }) => {
      if (!clubId) throw new Error('clubId is required');
      return clubAssetsApi.updateCarouselSlide(clubId, slideId, payload);
    },
    onSuccess: invalidateSlides,
  });

  const deleteSlide = useMutation({
    mutationFn: (slideId: string) => {
      if (!clubId) throw new Error('clubId is required');
      return clubAssetsApi.deleteCarouselSlide(clubId, slideId);
    },
    onSuccess: invalidateSlides,
  });

  const reorderSlides = useMutation({
    mutationFn: (slideIds: string[]) => {
      if (!clubId) throw new Error('clubId is required');
      return clubAssetsApi.reorderCarouselSlides(clubId, slideIds);
    },
    onSuccess: invalidateSlides,
  });

  return {
    createSlide,
    updateSlide,
    deleteSlide,
    reorderSlides,
  };
}
