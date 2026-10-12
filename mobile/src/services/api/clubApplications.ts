/**
 * Aught2 Pickleball — Club Applications API Service
 * Handles pre-login club registration submissions, public status checks,
 * and platform owner application management.
 */

import { apiClient } from './client';

export interface SubmitClubApplicationPayload {
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string;
  applicant_password: string;
  club_name: string;
  slug?: string;
  short_description?: string;
  description?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  established_year?: number;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  operating_days?: string;
  opening_time?: string;
  closing_time?: string;
  timezone?: string;
  facilities_summary?: string;
}

export interface ClubApplicationResponse {
  id: string;
  reference_number: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone?: string;
  user_id?: string;
  club_name: string;
  slug: string;
  short_description?: string;
  description?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  established_year?: number;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country: string;
  operating_days?: string;
  opening_time: string;
  closing_time: string;
  timezone: string;
  facilities_summary?: string;
  status: 'pending' | 'approved' | 'rejected';
  status_label: string;
  rejection_reason?: string;
  reviewed_by_id?: string;
  reviewed_at?: string;
  club_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ClubApplicationStatusLookupResponse {
  reference_number: string;
  club_name: string;
  applicant_name: string;
  status: 'pending' | 'approved' | 'rejected';
  status_label: string;
  message: string;
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface PlatformOwnerProfile {
  id: string;
  email: string;
  full_name: string | null;
  is_platform_owner: boolean;
}

export interface PlatformClubItem {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  city?: string;
  state?: string;
  country: string;
  contact_email?: string;
  contact_phone?: string;
  created_at?: string;
  active_members_count: number;
}

export const clubApplicationsApi = {
  /** Submit a new club application without requiring an active club-owner session */
  submit: (payload: SubmitClubApplicationPayload): Promise<ClubApplicationResponse> => {
    return apiClient.post<ClubApplicationResponse>('/api/v1/club-applications', payload, false);
  },

  /** Look up application status safely by reference number and applicant email */
  getStatus: (referenceNumber: string, email: string): Promise<ClubApplicationStatusLookupResponse> => {
    const query = new URLSearchParams();
    query.append('reference_number', referenceNumber.trim().toUpperCase());
    query.append('email', email.trim().toLowerCase());
    return apiClient.get<ClubApplicationStatusLookupResponse>(
      `/api/v1/club-applications/status?${query.toString()}`,
      false
    );
  },

  /** List applications submitted by the current authenticated user */
  getMyApplications: (): Promise<ClubApplicationResponse[]> => {
    return apiClient.get<ClubApplicationResponse[]>('/api/v1/club-applications/my-applications');
  },
};

export const platformApplicationsApi = {
  /** List applications for platform owner review */
  listApplications: (
    statusFilter?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{
    items: ClubApplicationResponse[];
    total: number;
    page: number;
    page_size: number;
  }> => {
    const query = new URLSearchParams();
    if (statusFilter) query.append('status', statusFilter);
    query.append('page', String(page));
    query.append('page_size', String(pageSize));
    return apiClient.get<{
      items: ClubApplicationResponse[];
      total: number;
      page: number;
      page_size: number;
    }>(`/api/v1/platform/club-applications?${query.toString()}`);
  },

  /** Retrieve full application details */
  getApplication: (applicationId: string): Promise<ClubApplicationResponse> => {
    return apiClient.get<ClubApplicationResponse>(`/api/v1/platform/club-applications/${applicationId}`);
  },

  /** Atomically approve a pending application */
  approveApplication: (applicationId: string): Promise<ClubApplicationResponse> => {
    return apiClient.post<ClubApplicationResponse>(
      `/api/v1/platform/club-applications/${applicationId}/approve`,
      {}
    );
  },

  /** Atomically reject a pending application */
  rejectApplication: (
    applicationId: string,
    rejectionReason?: string
  ): Promise<ClubApplicationResponse> => {
    return apiClient.post<ClubApplicationResponse>(
      `/api/v1/platform/club-applications/${applicationId}/reject`,
      {
        rejection_reason: rejectionReason || undefined,
      }
    );
  },

  /** Verify platform owner session */
  getPlatformMe: (): Promise<PlatformOwnerProfile> => {
    return apiClient.get<PlatformOwnerProfile>('/api/v1/platform/me');
  },

  /** List all registered clubs on the platform */
  listClubs: (): Promise<{ items: PlatformClubItem[]; total: number }> => {
    return apiClient.get<{ items: PlatformClubItem[]; total: number }>('/api/v1/platform/clubs');
  },
};
