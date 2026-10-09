/**
 * useClubDetails — Hook for managing club details, location, operating info, and logo.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import { useActiveClub } from './useActiveClub';
import type { Club, UpdateClubPayload } from '@/types';

export function useClubDetails(overrideClubId?: string | null) {
  const queryClient = useQueryClient();
  const { clubId: activeClubId, role } = useActiveClub();
  const clubId = overrideClubId ?? activeClubId;

  const clubQuery = useQuery<Club, Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_DETAIL(clubId) : ['clubs', 'none'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.getClub(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 30 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateClubPayload) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.updateClub(clubId, payload);
    },
    onSuccess: (updatedClub) => {
      if (clubId) {
        queryClient.setQueryData(QUERY_KEYS.CLUB_DETAIL(clubId), updatedClub);
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_DETAIL(clubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUBS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_CLUBS });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (imageData: string) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.uploadClubLogo(clubId, imageData);
    },
    onSuccess: (updatedClub) => {
      if (clubId) {
        queryClient.setQueryData(QUERY_KEYS.CLUB_DETAIL(clubId), updatedClub);
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_DETAIL(clubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUBS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_CLUBS });
    },
  });

  const isOwner = role === 'club_owner';

  return {
    club: clubQuery.data ?? null,
    isLoading: clubQuery.isLoading,
    isError: clubQuery.isError,
    error: clubQuery.error,
    refetch: clubQuery.refetch,
    isOwner,
    // Mutations
    updateClub: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    uploadLogo: uploadLogoMutation.mutateAsync,
    isUploadingLogo: uploadLogoMutation.isPending,
    uploadLogoError: uploadLogoMutation.error,
  };
}
