/**
 * Aught2 Pickleball — Player API Service
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  CreateMembershipRequestPayload,
  CreatePlayerProfilePayload,
  MembershipRequest,
  PlayerActivityItem,
  PlayerBookingsResponse,
  PlayerClub,
  PlayerClubDetail,
  PlayerProfile,
  UpcomingActivitiesResponse,
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
   * Directly join a club as an active player member.
   * Auto-activates player membership without manual staff approval.
   */
  joinClub(clubId: string): Promise<PlayerClub> {
    return apiClient.post<PlayerClub>(`${API_ENDPOINTS.PLAYER_CLUBS}/${clubId}/join`, {});
  },

  /**
   * Get recent chronological activity for the authenticated player.
   */
  getActivity(): Promise<PlayerActivityItem[]> {
    return apiClient.get<PlayerActivityItem[]>(API_ENDPOINTS.PLAYER_ACTIVITY);
  },

  /**
   * Discover upcoming activities (tournaments, leagues, events, lessons) across all active clubs.
   */
  getUpcomingActivities(params?: {
    activity_type?: string;
    club_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<UpcomingActivitiesResponse> {
    const query = new URLSearchParams();
    if (params?.activity_type && params.activity_type !== 'all') {
      query.append('activity_type', params.activity_type);
    }
    if (params?.club_id) {
      query.append('club_id', params.club_id);
    }
    if (params?.limit !== undefined) {
      query.append('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      query.append('offset', String(params.offset));
    }
    const qs = query.toString();
    const url = qs
      ? `${API_ENDPOINTS.PLAYER_UPCOMING_ACTIVITIES}?${qs}`
      : API_ENDPOINTS.PLAYER_UPCOMING_ACTIVITIES;
    return apiClient.get<UpcomingActivitiesResponse>(url);
  },

  // ─── Membership Requests ───────────────────────────────────────────────────

  /**
   * Submit a membership request for a club.
   */
  submitMembershipRequest(
    clubId: string,
    payload?: CreateMembershipRequestPayload,
  ): Promise<MembershipRequest> {
    return apiClient.post<MembershipRequest>(
      `${API_ENDPOINTS.PLAYER_CLUBS}/${clubId}/membership-requests`,
      payload || {},
    );
  },

  /**
   * Get all membership requests submitted by current player.
   */
  getMembershipRequests(): Promise<MembershipRequest[]> {
    return apiClient.get<MembershipRequest[]>(
      `${API_ENDPOINTS.BASE}/api/v1/player/membership-requests`,
    );
  },

  /**
   * Get latest request status for a specific club.
   */
  getClubMembershipRequest(clubId: string): Promise<MembershipRequest | null> {
    return apiClient.get<MembershipRequest | null>(
      `${API_ENDPOINTS.PLAYER_CLUBS}/${clubId}/membership-request`,
    );
  },

  /**
   * Withdraw a pending membership request.
   */
  withdrawMembershipRequest(requestId: string): Promise<MembershipRequest> {
    return apiClient.post<MembershipRequest>(
      `${API_ENDPOINTS.BASE}/api/v1/player/membership-requests/${requestId}/withdraw`,
      {},
    );
  },

  /**
   * Get caller's personal bookings and registrations across all activity types
   * (court bookings, tournaments, leagues, events, lessons).
   */
  getMyBookings(params?: {
    activity_type?: string;
    status?: string;
    club_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<PlayerBookingsResponse> {
    const query = new URLSearchParams();
    if (params?.activity_type && params.activity_type !== 'all') {
      query.append('activity_type', params.activity_type);
    }
    if (params?.status && params.status !== 'all') {
      query.append('status', params.status);
    }
    if (params?.club_id) {
      query.append('club_id', params.club_id);
    }
    if (params?.limit) {
      query.append('limit', String(params.limit));
    }
    if (params?.offset) {
      query.append('offset', String(params.offset));
    }
    const qs = query.toString();
    const url = qs ? `${API_ENDPOINTS.PLAYER_MY_BOOKINGS}?${qs}` : API_ENDPOINTS.PLAYER_MY_BOOKINGS;
    return apiClient.get<PlayerBookingsResponse>(url);
  },
};

