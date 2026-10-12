/**
 * useClubDashboard — TanStack Query hook for aggregated club operational metrics.
 */

import { useQuery } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { ClubDashboardResponse } from '@/types';

export function useClubDashboard(clubId: string | null) {
  const query = useQuery<ClubDashboardResponse, Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_DASHBOARD(clubId) : ['clubs', 'none', 'dashboard'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.getClubDashboard(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    dashboard: query.data ?? null,
  };
}
