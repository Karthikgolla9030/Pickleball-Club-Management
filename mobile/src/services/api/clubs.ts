/**
 * Aught2 Pickleball — Club & Member API Service
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  AddMemberPayload,
  Club,
  ClubDashboardResponse,
  ClubMember,
  ClubMembershipDetail,
  ClubOperatingHoursResponse,
  ClubPlayerMember,
  CreateClubPayload,
  DiscoverClubsParams,
  MembershipPlan,
  MembershipRequest,
  OperatingHoursDisruptionPreviewResponse,
  PublicClubDiscoveryResponse,
  UpdateClubPayload,
  UpdateClubPlayerMemberPayload,
  UpdateMemberPayload,
  UserClubItem,
  WeeklyOperatingHoursMap,
} from '@/types';

export const clubsApi = {
  /**
   * Public club discovery with search, city/state filtering, and pagination.
   */
  discoverPublicClubs(params?: DiscoverClubsParams): Promise<PublicClubDiscoveryResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.city) query.append('city', params.city);
    if (params?.state) query.append('state', params.state);
    if (params?.page) query.append('page', String(params.page));
    if (params?.page_size) query.append('page_size', String(params.page_size));
    const qs = query.toString();
    const url = qs ? `${API_ENDPOINTS.CLUBS}/public?${qs}` : `${API_ENDPOINTS.CLUBS}/public`;
    return apiClient.get<PublicClubDiscoveryResponse>(url);
  },

  /**
   * Register a new club. Authenticated caller becomes initial Club Owner.
   */
  createClub(payload: CreateClubPayload): Promise<UserClubItem> {
    return apiClient.post<UserClubItem>(API_ENDPOINTS.CLUBS, payload);
  },

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
   * Get public profile info for a club (accessible without club membership).
   */
  getPublicClub(clubId: string): Promise<Club> {
    return apiClient.get<Club>(`${API_ENDPOINTS.CLUBS}/${clubId}/public`);
  },

  /**
   * Update club profile and location settings.
   * Allowed for Club Owner only (MANAGE_CLUB).
   */
  updateClub(clubId: string, payload: UpdateClubPayload): Promise<Club> {
    return apiClient.patch<Club>(`${API_ENDPOINTS.CLUBS}/${clubId}`, payload);
  },

  /**
   * Upload club logo (base64 image data).
   * Allowed for Club Owner only (MANAGE_CLUB).
   */
  uploadClubLogo(clubId: string, imageData: string): Promise<Club> {
    return apiClient.post<Club>(`${API_ENDPOINTS.CLUBS}/${clubId}/logo`, {
      image_data: imageData,
    });
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
   * Get server-aggregated operational dashboard summary for a club.
   */
  getClubDashboard(clubId: string): Promise<ClubDashboardResponse> {
    return apiClient.get<ClubDashboardResponse>(API_ENDPOINTS.CLUB_DASHBOARD(clubId));
  },

  /**
   * Get all members of the club.
   * Allowed for Club Owner and Club Manager. DENIED for Tournament Director.
   */
  getClubMembers(clubId: string): Promise<ClubMember[]> {
    return apiClient.get<ClubMember[]>(`${API_ENDPOINTS.CLUBS}/${clubId}/members`);
  },

  /**
   * Get an individual staff member's details.
   */
  getClubMemberDetail(clubId: string, membershipId: string): Promise<ClubMember> {
    return apiClient.get<ClubMember>(
      API_ENDPOINTS.CLUB_MEMBER_DETAIL(clubId, membershipId),
    );
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

  /**
   * Get active membership plans for a club for public player display.
   */
  getPublicMembershipPlans(clubId: string): Promise<MembershipPlan[]> {
    return apiClient.get<MembershipPlan[]>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/membership-plans/public`,
    );
  },

  // ─── Membership Requests (Staff Management) ────────────────────────────────

  /**
   * Get membership requests for a club.
   * Allowed for Club Owner and Club Manager (MANAGE_MEMBERS).
   */
  getClubMembershipRequests(
    clubId: string,
    status?: string,
  ): Promise<MembershipRequest[]> {
    const url = status
      ? `${API_ENDPOINTS.CLUBS}/${clubId}/membership-requests?status=${encodeURIComponent(status)}`
      : `${API_ENDPOINTS.CLUBS}/${clubId}/membership-requests`;
    return apiClient.get<MembershipRequest[]>(url);
  },

  /**
   * Approve a player's membership request.
   * Allowed for Club Owner and Club Manager (MANAGE_MEMBERS).
   */
  approveMembershipRequest(
    clubId: string,
    requestId: string,
  ): Promise<MembershipRequest> {
    return apiClient.post<MembershipRequest>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/membership-requests/${requestId}/approve`,
      {},
    );
  },

  /**
   * Reject a player's membership request with optional reason.
   * Allowed for Club Owner and Club Manager (MANAGE_MEMBERS).
   */
  rejectMembershipRequest(
    clubId: string,
    requestId: string,
    rejectionReason?: string,
  ): Promise<MembershipRequest> {
    return apiClient.post<MembershipRequest>(
      `${API_ENDPOINTS.CLUBS}/${clubId}/membership-requests/${requestId}/reject`,
      { rejection_reason: rejectionReason },
    );
  },

  // ─── Phase 7: Club Operating Hours ─────────────────────────────────────────

  getOperatingHours(clubId: string): Promise<ClubOperatingHoursResponse> {
    return apiClient.get<ClubOperatingHoursResponse>(API_ENDPOINTS.CLUB_OPERATING_HOURS(clubId));
  },

  updateOperatingHours(
    clubId: string,
    operatingHours: WeeklyOperatingHoursMap
  ): Promise<ClubOperatingHoursResponse> {
    return apiClient.put<ClubOperatingHoursResponse>(API_ENDPOINTS.CLUB_OPERATING_HOURS(clubId), {
      operating_hours: operatingHours,
    });
  },

  previewOperatingHoursDisruptions(
    clubId: string,
    operatingHours: WeeklyOperatingHoursMap
  ): Promise<OperatingHoursDisruptionPreviewResponse> {
    return apiClient.post<OperatingHoursDisruptionPreviewResponse>(
      API_ENDPOINTS.CLUB_OPERATING_HOURS_PREVIEW(clubId),
      { operating_hours: operatingHours }
    );
  },
};

