/**
 * Aught2 Pickleball — Notifications API Service
 */
import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';

export interface NotificationItem {
  id: string;
  user_id: string;
  club_id: string | null;
  club_name?: string | null;
  category: string;
  title: string;
  message: string;
  is_read: boolean;
  read_at?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  action_url?: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
}

export interface NotificationUnreadCountResponse {
  unread_count: number;
}

export interface NotificationPreference {
  user_id: string;
  booking_notifications: boolean;
  membership_notifications: boolean;
  tournament_notifications: boolean;
  event_notifications: boolean;
  payment_notifications: boolean;
  administrative_notifications: boolean;
}

export const notificationsApi = {
  async getNotifications(params?: {
    category?: string;
    club_id?: string;
    date?: string;
    unread_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationListResponse> {
    const query = new URLSearchParams();
    if (params?.category && params.category !== 'all') query.append('category', params.category);
    if (params?.club_id) query.append('club_id', params.club_id);
    if (params?.date) query.append('date', params.date);
    if (params?.unread_only) query.append('unread_only', 'true');
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset) query.append('offset', String(params.offset));

    const qs = query.toString();
    const url = `${API_ENDPOINTS.NOTIFICATIONS}${qs ? `?${qs}` : ''}`;
    return apiClient.get<NotificationListResponse>(url);
  },

  async getUnreadCount(): Promise<NotificationUnreadCountResponse> {
    return apiClient.get<NotificationUnreadCountResponse>(API_ENDPOINTS.NOTIFICATIONS_UNREAD_COUNT);
  },

  async markAsRead(notificationId: string): Promise<{ status: string; id: string }> {
    return apiClient.post<{ status: string; id: string }>(
      API_ENDPOINTS.NOTIFICATION_MARK_READ(notificationId),
      {}
    );
  },

  async markAllAsRead(): Promise<{ status: string; marked_read_count: number }> {
    return apiClient.post<{ status: string; marked_read_count: number }>(
      API_ENDPOINTS.NOTIFICATIONS_MARK_ALL_READ,
      {}
    );
  },

  async deleteNotification(notificationId: string): Promise<{ status: string; id: string }> {
    return apiClient.delete<{ status: string; id: string }>(
      `${API_ENDPOINTS.NOTIFICATIONS}/${notificationId}`
    );
  },

  async getPreferences(): Promise<NotificationPreference> {
    return apiClient.get<NotificationPreference>(`${API_ENDPOINTS.NOTIFICATIONS}/preferences`);
  },

  async updatePreferences(updates: Partial<NotificationPreference>): Promise<NotificationPreference> {
    return apiClient.put<NotificationPreference>(`${API_ENDPOINTS.NOTIFICATIONS}/preferences`, updates);
  },
};
