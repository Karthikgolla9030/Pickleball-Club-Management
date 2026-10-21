/**
 * Aught2 Pickleball — Club Assets & Media API Service
 *
 * Provides typed methods for:
 * - Getting and updating club branding (logo & cover)
 * - CRUD & reordering for club hero promotional carousel slides
 * - Uploading image assets with tenant scoping
 * - Updating entity banners and photos (tournaments, leagues, events, courts, lessons)
 */

import { Platform } from 'react-native';
import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  ClubBranding,
  ClubCarouselSlide,
  ClubEvent,
  Court,
  LeagueSummary,
  Tournament,
} from '@/types';

export const clubAssetsApi = {
  // ─── Club Branding ──────────────────────────────────────────────────────────

  getClubBranding(clubId: string): Promise<ClubBranding> {
    return apiClient.get<ClubBranding>(API_ENDPOINTS.CLUB_BRANDING(clubId), false);
  },

  updateClubBranding(
    clubId: string,
    payload: { logo_url?: string | null; cover_image_url?: string | null }
  ): Promise<ClubBranding> {
    return apiClient.put<ClubBranding>(API_ENDPOINTS.CLUB_BRANDING(clubId), payload);
  },

  // ─── Carousel Slides ────────────────────────────────────────────────────────

  getCarouselSlides(clubId: string, activeOnly: boolean = true): Promise<ClubCarouselSlide[]> {
    const url = `${API_ENDPOINTS.CLUB_CAROUSEL_SLIDES(clubId)}?active_only=${activeOnly}`;
    return apiClient.get<ClubCarouselSlide[]>(url, false);
  },

  createCarouselSlide(
    clubId: string,
    payload: {
      title?: string | null;
      subtitle?: string | null;
      tag?: string | null;
      image_url: string;
      cta_text?: string | null;
      cta_route?: string | null;
      display_order?: number;
      is_active?: boolean;
    }
  ): Promise<ClubCarouselSlide> {
    return apiClient.post<ClubCarouselSlide>(API_ENDPOINTS.CLUB_CAROUSEL_SLIDES(clubId), payload);
  },

  updateCarouselSlide(
    clubId: string,
    slideId: string,
    payload: {
      title?: string | null;
      subtitle?: string | null;
      tag?: string | null;
      image_url?: string | null;
      cta_text?: string | null;
      cta_route?: string | null;
      display_order?: number;
      is_active?: boolean;
    }
  ): Promise<ClubCarouselSlide> {
    return apiClient.put<ClubCarouselSlide>(
      API_ENDPOINTS.CLUB_CAROUSEL_SLIDE_DETAIL(clubId, slideId),
      payload
    );
  },

  deleteCarouselSlide(clubId: string, slideId: string): Promise<void> {
    return apiClient.delete<void>(API_ENDPOINTS.CLUB_CAROUSEL_SLIDE_DETAIL(clubId, slideId));
  },

  reorderCarouselSlides(clubId: string, slideIds: string[]): Promise<ClubCarouselSlide[]> {
    return apiClient.post<ClubCarouselSlide[]>(API_ENDPOINTS.CLUB_CAROUSEL_REORDER(clubId), {
      slide_ids: slideIds,
    });
  },

  // ─── Media Upload ───────────────────────────────────────────────────────────

  async uploadClubMedia(
    clubId: string,
    fileInput: { uri: string; name?: string; type?: string; blob?: Blob },
    assetType: string,
    entityType?: string,
    entityId?: string
  ): Promise<{ asset_id: string; public_url: string; width?: number; height?: number }> {
    const formData = new FormData();
    const fileName = fileInput.name || 'upload.jpg';
    const mimeType = fileInput.type || 'image/jpeg';

    if (fileInput.blob) {
      formData.append('file', fileInput.blob, fileName);
    } else if (
      Platform.OS === 'web' ||
      (typeof window !== 'undefined' &&
        (fileInput.uri.startsWith('blob:') ||
          fileInput.uri.startsWith('data:') ||
          fileInput.uri.startsWith('http://') ||
          fileInput.uri.startsWith('https://')))
    ) {
      // Browser/Web environment: convert uri (blob:, data:, or http URL) to Blob
      const res = await fetch(fileInput.uri);
      const blob = await res.blob();
      formData.append('file', blob, fileName);
    } else {
      // React Native native mobile environment (iOS / Android)
      formData.append('file', {
        uri: fileInput.uri,
        name: fileName,
        type: mimeType,
      } as any);
    }

    formData.append('asset_type', assetType);
    if (entityType) formData.append('entity_type', entityType);
    if (entityId) formData.append('entity_id', entityId);

    const uploadUrl = API_ENDPOINTS.CLUB_MEDIA_UPLOAD(clubId);
    return apiClient.upload<{ asset_id: string; public_url: string; width?: number; height?: number }>(
      uploadUrl,
      formData,
      true
    );
  },

  // ─── Entity Image Updaters ──────────────────────────────────────────────────

  updateTournamentImage(
    clubId: string,
    tournamentId: string,
    imageUrl: string | null
  ): Promise<Tournament> {
    return apiClient.put<Tournament>(
      API_ENDPOINTS.CLUB_TOURNAMENT_IMAGE(clubId, tournamentId),
      { image_url: imageUrl }
    );
  },

  updateLeagueImage(
    clubId: string,
    leagueId: string,
    imageUrl: string | null
  ): Promise<LeagueSummary> {
    return apiClient.put<LeagueSummary>(
      API_ENDPOINTS.CLUB_LEAGUE_IMAGE(clubId, leagueId),
      { image_url: imageUrl }
    );
  },

  updateEventImage(
    clubId: string,
    eventId: string,
    imageUrl: string | null
  ): Promise<ClubEvent> {
    return apiClient.put<ClubEvent>(
      API_ENDPOINTS.CLUB_EVENT_IMAGE(clubId, eventId),
      { image_url: imageUrl }
    );
  },

  updateCourtImage(
    clubId: string,
    courtId: string,
    imageUrl: string | null
  ): Promise<Court> {
    return apiClient.put<Court>(
      API_ENDPOINTS.CLUB_COURT_IMAGE(clubId, courtId),
      { image_url: imageUrl }
    );
  },

  updateLessonImage(
    clubId: string,
    lessonId: string,
    imageUrl: string | null
  ): Promise<any> {
    return apiClient.put(
      API_ENDPOINTS.CLUB_LESSON_IMAGE(clubId, lessonId),
      { image_url: imageUrl }
    );
  },

  updateLessonTypeImage(
    clubId: string,
    lessonTypeId: string,
    imageUrl: string | null
  ): Promise<any> {
    return apiClient.put(
      API_ENDPOINTS.CLUB_LESSON_TYPE_IMAGE(clubId, lessonTypeId),
      { image_url: imageUrl }
    );
  },
};
