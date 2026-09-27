/**
 * Aught2 Pickleball — Notifications Hook (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type NotificationItem, type NotificationListResponse } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import { useAuthStore } from '@/store';

export function useNotifications(
  category: string = 'all',
  unreadOnly: boolean = false,
  date?: string,
  clubId?: string
) {
  const { isAuthenticated } = useAuthStore();

  return useQuery<NotificationListResponse, Error>({
    queryKey: [
      ...QUERY_KEYS.NOTIFICATIONS(category),
      unreadOnly ? 'unread' : 'all',
      date || 'all_dates',
      clubId || 'all_clubs',
    ],
    queryFn: () =>
      notificationsApi.getNotifications({
        category,
        unread_only: unreadOnly,
        date,
        club_id: clubId,
      }),
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });
}

export function useUnreadNotificationCount() {
  const { isAuthenticated } = useAuthStore();

  return useQuery<number, Error>({
    queryKey: QUERY_KEYS.NOTIFICATIONS_UNREAD_COUNT,
    queryFn: async () => {
      const res = await notificationsApi.getUnreadCount();
      return res.unread_count;
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS_UNREAD_COUNT });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NOTIFICATIONS_UNREAD_COUNT });
    },
  });
}
