/**
 * useClubMembership — Retrieve the authenticated user's membership for a specific club.
 */

import { useQuery } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { ClubMembershipDetail } from '@/types';

export function useClubMembership(clubId: string | null) {
  return useQuery<ClubMembershipDetail, Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_MEMBERSHIP(clubId) : ['clubs', 'none', 'membership'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.getClubMembership(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 5 * 60 * 1000,
  });
}
