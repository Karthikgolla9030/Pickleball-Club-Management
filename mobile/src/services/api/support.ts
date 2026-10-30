/**
 * Aught2 Pickleball — Requester Support Tickets API Service
 * Authenticated endpoints for players and club staff to submit,
 * track, and reply to support inquiries.
 */

import { apiClient } from './client';
import {
  PlatformSupportTicketDetailResponse,
  PlatformSupportTicketsListResponse,
} from './clubApplications';

export interface CreateSupportTicketPayload {
  subject: string;
  description: string;
  category?: 'general' | 'billing' | 'account' | 'technical' | 'club_operations' | 'tournament' | string;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | string;
  club_id?: string | null;
  source_portal?: 'player' | 'club' | string;
}

export const supportApi = {
  /** Create a new support ticket submitted by the current user */
  createTicket: (payload: CreateSupportTicketPayload): Promise<PlatformSupportTicketDetailResponse> => {
    return apiClient.post<PlatformSupportTicketDetailResponse>('/api/v1/support/tickets', payload);
  },

  /** List tickets submitted by current user (or scoped to club for staff) */
  listMyTickets: (params?: {
    status?: string;
    club_id?: string | null;
    page?: number;
    pageSize?: number;
  }): Promise<PlatformSupportTicketsListResponse> => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'all') {
      query.append('status', params.status);
      query.append('status_filter', params.status);
    }
    if (params?.club_id) {
      query.append('club_id', params.club_id);
    }
    if (params?.page) query.append('page', String(params.page));
    if (params?.pageSize) query.append('page_size', String(params.pageSize));
    return apiClient.get<PlatformSupportTicketsListResponse>(`/api/v1/support/tickets?${query.toString()}`);
  },

  /** Get single ticket detail and conversation history owned by current user */
  getMyTicket: (ticketId: string): Promise<PlatformSupportTicketDetailResponse> => {
    return apiClient.get<PlatformSupportTicketDetailResponse>(`/api/v1/support/tickets/${ticketId}`);
  },

  /** Reply to a ticket thread owned by current user */
  replyToTicket: (ticketId: string, message: string): Promise<PlatformSupportTicketDetailResponse> => {
    return apiClient.post<PlatformSupportTicketDetailResponse>(`/api/v1/support/tickets/${ticketId}/replies`, {
      message: message.trim(),
    });
  },
};
