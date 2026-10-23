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
  short_description?: string;
  description?: string;
  city?: string;
  state?: string;
  country: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  established_year?: number;
  operating_days?: string;
  opening_time?: string;
  closing_time?: string;
  timezone?: string;
  created_at?: string;
  active_members_count: number;
}

export interface SystemHealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  database: string;
}

export interface PlatformUserStaffMembership {
  id: string;
  club_id: string;
  club_name: string;
  club_slug: string;
  role: string;
  role_label: string;
  is_active: boolean;
  created_at: string;
}

export interface PlatformUserPlayerMembership {
  id: string;
  club_id: string;
  club_name: string;
  club_slug: string;
  status: string;
  status_label: string;
  membership_number?: string;
  joined_at: string;
}

export interface PlatformPlayerProfile {
  display_name?: string;
  skill_rating?: number;
}

export interface PlatformUserItem {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  player_profile?: PlatformPlayerProfile;
  club_memberships: PlatformUserStaffMembership[];
  club_player_memberships: PlatformUserPlayerMembership[];
  total_memberships_count: number;
}

export interface PlatformUsersListResponse {
  items: PlatformUserItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface PlatformClubStatusUpdateResponse {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  reason: string;
  updated_at: string;
}

export interface PlatformAuditLogItem {
  id: string;
  created_at: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_name?: string | null;
  action: string;
  action_label: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
  outcome: string;
  reason?: string | null;
  details?: Record<string, any> | null;
  ip_address?: string | null;
}

export interface PlatformAuditLogsListResponse {
  items: PlatformAuditLogItem[];
  total: number;
  page: number;
  page_size: number;
  action_counts: Record<string, number>;
}

export interface PlatformSupportTicketMessageItem {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_email: string;
  sender_name?: string | null;
  sender_role: 'requester' | 'platform_admin' | string;
  message: string;
  created_at: string;
}

export interface PlatformSupportTicketItem {
  id: string;
  reference_number: string;
  subject: string;
  description: string;
  category: string;
  category_label: string;
  priority: string;
  priority_label: string;
  status: 'open' | 'in_progress' | 'waiting_for_requester' | 'resolved' | 'closed' | string;
  status_label: string;
  requester_id: string;
  requester_email: string;
  requester_name?: string | null;
  club_id?: string | null;
  club_name?: string | null;
  club_slug?: string | null;
  assigned_admin_id?: string | null;
  assigned_admin_email?: string | null;
  assigned_admin_name?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  messages_count: number;
}

export interface PlatformSupportTicketDetailResponse extends PlatformSupportTicketItem {
  messages: PlatformSupportTicketMessageItem[];
}

export interface PlatformSupportTicketsListResponse {
  items: PlatformSupportTicketItem[];
  total: number;
  page: number;
  page_size: number;
  status_counts: Record<string, number>;
  priority_counts?: Record<string, number>;
}

export interface PlatformTicketUpdateRequest {
  status?: string;
  priority?: string;
  assigned_admin_id?: string | null;
  reason?: string;
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
    counts?: {
      pending: number;
      approved: number;
      rejected: number;
      all: number;
    };
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
      counts?: {
        pending: number;
        approved: number;
        rejected: number;
        all: number;
      };
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

  /** Retrieve live backend & database system health */
  getSystemHealth: (): Promise<SystemHealthResponse> => {
    return apiClient.get<SystemHealthResponse>('/api/v1/health', false);
  },

  /** List platform users with pagination and search/role/club filters */
  listUsers: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    isActive?: boolean;
    clubId?: string;
    role?: string;
  }): Promise<PlatformUsersListResponse> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.pageSize) query.append('page_size', String(params.pageSize));
    if (params?.search && params.search.trim()) query.append('search', params.search.trim());
    if (params?.isActive !== undefined) query.append('is_active', String(params.isActive));
    if (params?.clubId) query.append('club_id', params.clubId);
    if (params?.role) query.append('role', params.role);
    return apiClient.get<PlatformUsersListResponse>(`/api/v1/platform/users?${query.toString()}`);
  },

  /** Retrieve full user profile with all cross-club memberships */
  getUser: (userId: string): Promise<PlatformUserItem> => {
    return apiClient.get<PlatformUserItem>(`/api/v1/platform/users/${userId}`);
  },

  /** Administratively suspend or reactivate a club facility */
  updateClubStatus: (
    clubId: string,
    isActive: boolean,
    reason: string
  ): Promise<PlatformClubStatusUpdateResponse> => {
    return apiClient.patch<PlatformClubStatusUpdateResponse>(
      `/api/v1/platform/clubs/${clubId}/status`,
      {
        is_active: isActive,
        reason: reason.trim(),
      }
    );
  },

  /** List platform audit logs with pagination, search, action, and date filters */
  listAuditLogs: (params?: {
    page?: number;
    pageSize?: number;
    action?: string;
    entityType?: string;
    entityId?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<PlatformAuditLogsListResponse> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.pageSize) query.append('page_size', String(params.pageSize));
    if (params?.action && params.action.trim()) query.append('action', params.action.trim());
    if (params?.entityType && params.entityType.trim()) query.append('entity_type', params.entityType.trim());
    if (params?.entityId && params.entityId.trim()) query.append('entity_id', params.entityId.trim());
    if (params?.search && params.search.trim()) query.append('search', params.search.trim());
    if (params?.fromDate) query.append('from_date', params.fromDate);
    if (params?.toDate) query.append('to_date', params.toDate);
    return apiClient.get<PlatformAuditLogsListResponse>(`/api/v1/platform/audit-logs?${query.toString()}`);
  },

  /** Retrieve full details of a specific audit log record */
  getAuditLog: (logId: string): Promise<PlatformAuditLogItem> => {
    return apiClient.get<PlatformAuditLogItem>(`/api/v1/platform/audit-logs/${logId}`);
  },

  /** List platform support tickets with pagination, status, category, priority, and search */
  listSupportTickets: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    category?: string;
    priority?: string;
    clubId?: string;
    search?: string;
  }): Promise<PlatformSupportTicketsListResponse> => {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.pageSize) query.append('page_size', String(params.pageSize));
    if (params?.status && params.status !== 'all') query.append('status_filter', params.status);
    if (params?.category && params.category !== 'all') query.append('category_filter', params.category);
    if (params?.priority && params.priority !== 'all') query.append('priority_filter', params.priority);
    if (params?.clubId) query.append('club_id', params.clubId);
    if (params?.search && params.search.trim()) query.append('search', params.search.trim());
    return apiClient.get<PlatformSupportTicketsListResponse>(`/api/v1/platform/support/tickets?${query.toString()}`);
  },

  /** Retrieve full ticket conversation thread for platform owner review */
  getSupportTicket: (ticketId: string): Promise<PlatformSupportTicketDetailResponse> => {
    return apiClient.get<PlatformSupportTicketDetailResponse>(`/api/v1/platform/support/tickets/${ticketId}`);
  },

  /** Update ticket status, priority, or assignment */
  updateSupportTicket: (
    ticketId: string,
    payload: PlatformTicketUpdateRequest
  ): Promise<PlatformSupportTicketDetailResponse> => {
    return apiClient.patch<PlatformSupportTicketDetailResponse>(
      `/api/v1/platform/support/tickets/${ticketId}`,
      payload
    );
  },

  /** Post platform admin reply to support ticket thread */
  replySupportTicket: (
    ticketId: string,
    message: string
  ): Promise<PlatformSupportTicketDetailResponse> => {
    return apiClient.post<PlatformSupportTicketDetailResponse>(
      `/api/v1/platform/support/tickets/${ticketId}/replies`,
      { message: message.trim() }
    );
  },
};


