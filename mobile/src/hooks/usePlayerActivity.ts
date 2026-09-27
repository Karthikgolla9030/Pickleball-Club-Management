/**
 * usePlayerActivity — TanStack Query hook for player recent activity.
 */

import { useQuery } from '@tanstack/react-query';
import { playerApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { PlayerActivityItem } from '@/types';

export function usePlayerActivity() {
  const query = useQuery<PlayerActivityItem[], Error>({
    queryKey: QUERY_KEYS.PLAYER_ACTIVITY,
    queryFn: async () => {
      try {
        return await playerApi.getActivity();
      } catch {
        return [];
      }
    },
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    activities: query.data ?? [],
    hasActivity: (query.data?.length ?? 0) > 0,
  };
}
