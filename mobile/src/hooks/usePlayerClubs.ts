/**
 * usePlayerClubs — TanStack Query hook for clubs user belongs to as a player.
 */

import { useQuery } from '@tanstack/react-query';
import { playerApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { PlayerClub, PlayerClubDetail } from '@/types';

export function usePlayerClubs() {
  const clubsQuery = useQuery<PlayerClub[], Error>({
    queryKey: QUERY_KEYS.PLAYER_CLUBS,
    queryFn: () => playerApi.getClubs(),
    staleTime: 60 * 1000,
  });

  return {
    ...clubsQuery,
    clubs: clubsQuery.data ?? [],
  };
}

export function usePlayerClubDetail(clubId: string | null) {
  const detailQuery = useQuery<PlayerClubDetail, Error>({
    queryKey: clubId ? QUERY_KEYS.PLAYER_CLUB_DETAIL(clubId) : ['player', 'clubs', 'none'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return playerApi.getClubDetail(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 60 * 1000,
  });

  return {
    ...detailQuery,
    clubDetail: detailQuery.data ?? null,
  };
}
