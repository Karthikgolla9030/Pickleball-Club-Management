/**
 * Aught2 Pickleball — useImageResolution Hook
 *
 * Provides reactive image resolution honoring the strict 3-level hierarchy:
 * 1. Individual Custom Image
 * 2. Club Default Image
 * 3. Platform Admin Default Image
 * 4. Clean neutral null fallback
 */

import { useMemo } from 'react';
import { useClubBranding } from './useClubBranding';
import { usePlatformBanners } from './usePlatformBanners';
import {
  resolveTournamentBanner,
  resolveTournamentBannerDetails,
  resolveLeaguePicture,
  resolveEventPicture,
  resolveLessonPicture,
  resolveCourtPicture,
  resolveClubLogo,
  resolveClubCover,
  ImageResolutionOptions,
  ImageResolutionDetails,
} from '@/utils/imageResolution';

export function useImageResolution(clubId?: string | null) {
  const { branding: clubBranding, isLoading: isBrandingLoading } = useClubBranding(clubId);
  const { banners: platformBanners, isLoading: isBannersLoading } = usePlatformBanners();

  const isLoading = isBrandingLoading || isBannersLoading;

  return useMemo(
    () => ({
      clubBranding,
      platformBanners,
      isLoading,
      resolveTournament: (
        tournament?: { banner_image_url?: string | null; resolved_banner_url?: string | null; format?: string | null } | null,
        options?: ImageResolutionOptions
      ) => resolveTournamentBanner(tournament, clubBranding, platformBanners, options),
      resolveTournamentDetails: (
        tournament?: { banner_image_url?: string | null; resolved_banner_url?: string | null; format?: string | null } | null
      ): ImageResolutionDetails => resolveTournamentBannerDetails(tournament, clubBranding, platformBanners),
      resolveLeague: (
        league?: { banner_image_url?: string | null; resolved_banner_url?: string | null } | string | null,
        options?: ImageResolutionOptions
      ) => resolveLeaguePicture(league, clubBranding, platformBanners, options),
      resolveEvent: (
        event?: { cover_image_url?: string | null; resolved_cover_image_url?: string | null } | string | null,
        options?: ImageResolutionOptions
      ) => resolveEventPicture(event, clubBranding, platformBanners, options),
      resolveLesson: (
        lesson?: { image_url?: string | null; resolved_image_url?: string | null; lesson_type?: { image_url?: string | null } | null } | string | null,
        options?: ImageResolutionOptions
      ) => resolveLessonPicture(lesson, clubBranding, platformBanners, options),
      resolveCourt: (court?: { image_url?: string | null } | string | null) => resolveCourtPicture(court),
      resolveClubLogo: () => resolveClubLogo(clubBranding),
      resolveClubCover: () => resolveClubCover(clubBranding),
    }),
    [clubBranding, platformBanners, isLoading]
  );
}

