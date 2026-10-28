/**
 * Aught2 Pickleball — useClubBranding & useClubCarousel Hook
 *
 * Provides query and mutation hooks for:
 * - Club branding (logo, cover)
 * - Hero carousel slides (player display & staff editing/reordering)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubAssetsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
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
      owner_banner_url?: string | null;
      default_tournament_round_robin_url?: string | null;
      default_tournament_scramble_url?: string | null;
      default_tournament_pool_play_url?: string | null;
      default_tournament_bracket_url?: string | null;
      default_league_banner_url?: string | null;
      default_event_banner_url?: string | null;
      default_lesson_banner_url?: string | null;
      logoUrl?: string | null;
      coverImageUrl?: string | null;
    }) => {
      const targetClubId = payload.clubId || clubIdParam;
      if (!targetClubId) throw new Error('clubId is required');
      const logo = payload.logo_url !== undefined ? payload.logo_url : payload.logoUrl;
      const cover = payload.cover_image_url !== undefined ? payload.cover_image_url : payload.coverImageUrl;

      const updateData: Record<string, any> = {};
      if (logo !== undefined) updateData.logo_url = logo;
      if (cover !== undefined) updateData.cover_image_url = cover;
      if (payload.owner_banner_url !== undefined) updateData.owner_banner_url = payload.owner_banner_url;
      if (payload.default_tournament_round_robin_url !== undefined) updateData.default_tournament_round_robin_url = payload.default_tournament_round_robin_url;
      if (payload.default_tournament_scramble_url !== undefined) updateData.default_tournament_scramble_url = payload.default_tournament_scramble_url;
      if (payload.default_tournament_pool_play_url !== undefined) updateData.default_tournament_pool_play_url = payload.default_tournament_pool_play_url;
      if (payload.default_tournament_bracket_url !== undefined) updateData.default_tournament_bracket_url = payload.default_tournament_bracket_url;
      if (payload.default_league_banner_url !== undefined) updateData.default_league_banner_url = payload.default_league_banner_url;
      if (payload.default_event_banner_url !== undefined) updateData.default_event_banner_url = payload.default_event_banner_url;
      if (payload.default_lesson_banner_url !== undefined) updateData.default_lesson_banner_url = payload.default_lesson_banner_url;

      return clubAssetsApi.updateClubBranding(targetClubId, updateData);
    },
    onSuccess: (updatedBranding, vars) => {
      const targetClubId = vars.clubId || clubIdParam;
      if (targetClubId) {
        queryClient.setQueryData(['club-branding', targetClubId], updatedBranding);
        queryClient.invalidateQueries({ queryKey: ['club-branding', targetClubId] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_DETAIL(targetClubId) });
        queryClient.invalidateQueries({ queryKey: ['public-club', targetClubId] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_CLUB_DETAIL(targetClubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUBS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_CLUBS });
      queryClient.invalidateQueries({ queryKey: ['public-clubs-discovery'] });
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_PROMOTIONAL_ADS(clubId) });
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.UNIVERSAL_PROMOTIONAL_ADS });
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
      start_date?: string | null;
      end_date?: string | null;
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
        start_date?: string | null;
        end_date?: string | null;
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

// Aliases for clear promotional ads naming
export const useClubPromotionalAds = useClubCarouselSlides;
export const useClubPromotionalAdMutations = useCarouselMutations;
