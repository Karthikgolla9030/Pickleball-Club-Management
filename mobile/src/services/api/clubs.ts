/**
 * Aught2 Pickleball — Club & Member API Service
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  AddClubPlayerMemberPayload,
  AddMemberPayload,
  Club,
  ClubMember,
  ClubMembershipDetail,
  ClubPlayerMember,
  UpdateClubPlayerMemberPayload,
  UpdateMemberPayload,
  UserClubItem,
} from '@/types';

export const clubsApi = {
  /**
   * Get all clubs the authenticated user belongs to.
   */
  getClubs(): Promise<UserClubItem[]> {
    return apiClient.get<UserClubItem[]>(API_ENDPOINTS.CLUBS);
  },

  /**
   * Get detailed info for a club accessible to the user.
   */
  getClub(clubId: string): Promise<Club> {
    return apiClient.get<Club>(`${API_ENDPOINTS.CLUBS}/${clubId}`);
  },

  /**
   * Get the current user's membership in the specified club.
   */
  getClubMembership(clubId: string): Promise<ClubMembershipDetail> {
    return apiClient.get<ClubMembershipDetail>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/membership`,
    );
  },

  /**
   * Get all members of the club.
   * Allowed for Club Owner and Club Manager. DENIED for Tournament Director.
   */
  getClubMembers(clubId: string): Promise<ClubMember[]> {
    return apiClient.get<ClubMember[]>(`${API_ENDPOINTS.CLUBS}/${clubId}/members`);
  },

  /**
   * Add a member to the club with a role.
   * Club Owner only.
   */
  addClubMember(clubId: string, payload: AddMemberPayload): Promise<ClubMember> {
    return apiClient.post<ClubMember>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/members`,
      payload,
    );
  },

  /**
   * Update a member's role or status.
   * Enforces Owner Safety Rules server-side. Club Owner only.
   */
  updateClubMember(
    clubId: string,
    membershipId: string,
    payload: UpdateMemberPayload,
  ): Promise<ClubMember> {
    return apiClient.patch<ClubMember>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/members/${membershipId}`,
      payload,
    );
  },

  /**
   * Soft-deactivate a member.
   * Enforces Owner Safety Rules server-side. Club Owner only.
   */
  deactivateClubMember(
    clubId: string,
    membershipId: string,
  ): Promise<ClubMember> {
    return apiClient.delete<ClubMember>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/members/${membershipId}`,
    );
  },

  // ─── Club Player Memberships (Facility Player Management) ──────────────────────

  /**
   * Get all player members registered in this club.
   * Allowed for Club Owner and Club Manager (MANAGE_MEMBERS).
   */
  getClubPlayerMembers(clubId: string): Promise<ClubPlayerMember[]> {
    return apiClient.get<ClubPlayerMember[]>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/player-memberships`,
    );
  },

  /**
   * Enroll / add a player to this club.
   * Allowed for Club Owner and Club Manager (MANAGE_MEMBERS).
   */
  addClubPlayerMember(
    clubId: string,
    payload: AddClubPlayerMemberPayload,
  ): Promise<ClubPlayerMember> {
    return apiClient.post<ClubPlayerMember>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/player-memberships`,
      payload,
    );
  },

  /**
   * Update a club player's membership (status, expiry, membership number).
   * Allowed for Club Owner and Club Manager (MANAGE_MEMBERS).
   */
  updateClubPlayerMember(
    clubId: string,
    membershipId: string,
    payload: UpdateClubPlayerMemberPayload,
  ): Promise<ClubPlayerMember> {
    return apiClient.patch<ClubPlayerMember>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/player-memberships/${membershipId}`,
      payload,
    );
  },
};
