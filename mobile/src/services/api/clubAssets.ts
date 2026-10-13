/**
 * Aught2 Pickleball — Club Assets & Media API Service
 *
 * Provides typed methods for:
 * - Getting and updating club branding (logo & cover)
 * - CRUD & reordering for club hero promotional carousel slides
 * - Uploading image assets with tenant scoping
 * - Updating entity banners and photos (tournaments, leagues, events, courts, lessons)
 */

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

    if (fileInput.blob) {
      formData.append('file', fileInput.blob, fileInput.name || 'upload.jpg');
    } else if (typeof window !== 'undefined' && fileInput.uri.startsWith('data:')) {
      // Data URI in browser/web: convert to Blob
      const res = await fetch(fileInput.uri);
      const blob = await res.blob();
      formData.append('file', blob, fileInput.name || 'upload.jpg');
    } else {
      // React Native file object
      formData.append('file', {
        uri: fileInput.uri,
        name: fileInput.name || 'upload.jpg',
        type: fileInput.type || 'image/jpeg',
      } as any);
    }

    formData.append('asset_type', assetType);
    if (entityType) formData.append('entity_type', entityType);
    if (entityId) formData.append('entity_id', entityId);

    const token = await (apiClient as any)._getAccessToken?.() || null;
    const uploadUrl = API_ENDPOINTS.CLUB_MEDIA_UPLOAD(clubId);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMsg = `Upload failed (${response.status})`;
      try {
        const errJson = await response.json();
        errorMsg = errJson.detail || errorMsg;
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }

    return response.json();
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
