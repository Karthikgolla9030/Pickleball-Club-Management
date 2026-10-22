/**
 * Aught2 Pickleball — Court API Service (Phase 10)
 *
 * Typed wrappers for all Court management and player-facing court endpoints.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  Court,
  CourtAffectedBookingsResponse,
  CourtCreateRequest,
  CourtOperatingHoursResponse,
  CourtReorderRequest,
  CourtStatus,
  CourtUpdateRequest,
  PlayerCourt,
  WeeklyOperatingHoursMap,
} from '@/types';

const clubCourtBase = (clubId: string) => `${API_ENDPOINTS.CLUBS}/${clubId}/courts`;

export const courtApi = {
  // ─── Club Staff Court Management ──────────────────────────────────────────

  listClubCourts(clubId: string, status?: CourtStatus): Promise<Court[]> {
    const url = status
      ? `${clubCourtBase(clubId)}?status=${status}`
      : clubCourtBase(clubId);
    return apiClient.get<Court[]>(url);
  },

  getCourtDetails(clubId: string, courtId: string): Promise<Court> {
    return apiClient.get<Court>(`${clubCourtBase(clubId)}/${courtId}`);
  },

  createCourt(clubId: string, payload: CourtCreateRequest): Promise<Court> {
    return apiClient.post<Court>(clubCourtBase(clubId), payload);
  },

  updateCourt(
    clubId: string,
    courtId: string,
    payload: CourtUpdateRequest
  ): Promise<Court> {
    return apiClient.patch<Court>(`${clubCourtBase(clubId)}/${courtId}`, payload);
  },

  deactivateCourt(clubId: string, courtId: string): Promise<Court> {
    return apiClient.post<Court>(`${clubCourtBase(clubId)}/${courtId}/deactivate`, {});
  },

  reactivateCourt(clubId: string, courtId: string): Promise<Court> {
    return apiClient.post<Court>(`${clubCourtBase(clubId)}/${courtId}/reactivate`, {});
  },

  reorderCourts(clubId: string, payload: CourtReorderRequest): Promise<Court[]> {
    return apiClient.patch<Court[]>(`${clubCourtBase(clubId)}/reorder`, payload);
  },

  // ─── Player Active Courts ──────────────────────────────────────────────────

  getPlayerCourts(clubId: string): Promise<PlayerCourt[]> {
    return apiClient.get<PlayerCourt[]>(API_ENDPOINTS.PLAYER_COURTS(clubId));
  },

  // ─── Phase 7: Court Operating Hours & Affected Bookings ───────────────────

  getCourtOperatingHours(clubId: string, courtId: string): Promise<CourtOperatingHoursResponse> {
    return apiClient.get<CourtOperatingHoursResponse>(API_ENDPOINTS.COURT_OPERATING_HOURS(clubId, courtId));
  },

  updateCourtOperatingHours(
    clubId: string,
    courtId: string,
    operatingHours: WeeklyOperatingHoursMap | null
  ): Promise<CourtOperatingHoursResponse> {
    return apiClient.put<CourtOperatingHoursResponse>(API_ENDPOINTS.COURT_OPERATING_HOURS(clubId, courtId), {
      operating_hours: operatingHours,
    });
  },

  getCourtAffectedBookings(clubId: string, courtId: string): Promise<CourtAffectedBookingsResponse> {
    return apiClient.get<CourtAffectedBookingsResponse>(API_ENDPOINTS.COURT_AFFECTED_BOOKINGS(clubId, courtId));
  },
};
