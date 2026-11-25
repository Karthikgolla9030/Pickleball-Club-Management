/**
 * useUpcomingActivities — TanStack Query hook for discovering upcoming activities across clubs.
 */

import { useQuery } from '@tanstack/react-query';
import { playerApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { UpcomingActivitiesResponse, UpcomingActivityItem } from '@/types';

export interface UseUpcomingActivitiesParams {
  activity_type?: string;
  club_id?: string;
  limit?: number;
  offset?: number;
}

export function useUpcomingActivities(params?: UseUpcomingActivitiesParams) {
  const query = useQuery<UpcomingActivitiesResponse, Error>({
    queryKey: QUERY_KEYS.PLAYER_UPCOMING_ACTIVITIES(params),
    queryFn: async () => {
      try {
        return await playerApi.getUpcomingActivities(params);
      } catch (err: any) {
        if (
          err?.status === 401 ||
          err?.type === 'AUTH_ERROR' ||
          err?.status === 404 ||
          err?.type === 'NOT_FOUND' ||
          err?.status === 502 ||
          err?.type === 'NETWORK_ERROR' ||
          err?.type === 'TIMEOUT' ||
          err?.message?.includes('Not authenticated') ||
          err?.message?.includes('taking longer than expected')
        ) {
          // Gracefully handle unauthenticated sessions, cold start, or network delay
          return {
            items: [],
            total: 0,
            has_more: false,
          };
        }
        console.warn('[useUpcomingActivities] Failed to fetch upcoming activities:', err);
        return {
          items: [],
          total: 0,
          has_more: false,
        };
      }
    },
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    activities: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    hasMore: query.data?.has_more ?? false,
  };
}
