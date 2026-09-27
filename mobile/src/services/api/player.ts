/**
 * Aught2 Pickleball — Player API Service
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  CreatePlayerProfilePayload,
  PlayerActivityItem,
  PlayerClub,
  PlayerClubDetail,
  PlayerProfile,
  UpdatePlayerProfilePayload,
} from '@/types';

export const playerApi = {
  /**
   * Get the current user's player profile.
   * Throws 404 if profile has not been initialized.
   */
  getProfile(): Promise<PlayerProfile> {
    return apiClient.get<PlayerProfile>(API_ENDPOINTS.PLAYER_PROFILE);
  },

  /**
   * Initialize a new player profile for the authenticated user.
   */
  createProfile(payload: CreatePlayerProfilePayload): Promise<PlayerProfile> {
    return apiClient.post<PlayerProfile>(API_ENDPOINTS.PLAYER_PROFILE, payload);
  },

  /**
   * Update fields on the authenticated user's player profile.
   */
  updateProfile(payload: UpdatePlayerProfilePayload): Promise<PlayerProfile> {
    return apiClient.patch<PlayerProfile>(API_ENDPOINTS.PLAYER_PROFILE, payload);
  },

  /**
   * Upload or change the authenticated user's profile photo.
   */
  uploadPhoto(imageData: string): Promise<PlayerProfile> {
    return apiClient.post<PlayerProfile>(`${API_ENDPOINTS.PLAYER_PROFILE}/photo`, {
      image_data: imageData,
    });
  },

  /**
   * Remove the authenticated user's profile photo.
   */
  deletePhoto(): Promise<PlayerProfile> {
    return apiClient.delete<PlayerProfile>(`${API_ENDPOINTS.PLAYER_PROFILE}/photo`);
  },

  /**
   * Get all clubs where the user has a player membership.
   */
  getClubs(): Promise<PlayerClub[]> {
    return apiClient.get<PlayerClub[]>(API_ENDPOINTS.PLAYER_CLUBS);
  },

  /**
   * Get detail for a player's membership in a specific club.
   */
  getClubDetail(clubId: string): Promise<PlayerClubDetail> {
    return apiClient.get<PlayerClubDetail>(`${API_ENDPOINTS.PLAYER_CLUBS}/${clubId}`);
  },

  /**
   * Get recent chronological activity for the authenticated player.
   */
  getActivity(): Promise<PlayerActivityItem[]> {
    return apiClient.get<PlayerActivityItem[]>(API_ENDPOINTS.PLAYER_ACTIVITY);
  },
};
