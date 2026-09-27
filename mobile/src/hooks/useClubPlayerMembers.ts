/**
 * useClubPlayerMembers — TanStack Query hook for club-side player membership management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  AddClubPlayerMemberPayload,
  ClubPlayerMember,
  UpdateClubPlayerMemberPayload,
} from '@/types';

export function useClubPlayerMembers(clubId: string | null) {
  const queryClient = useQueryClient();

  const playerMembersQuery = useQuery<ClubPlayerMember[], Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_PLAYER_MEMBERS(clubId) : ['clubs', 'none', 'player-memberships'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.getClubPlayerMembers(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 60 * 1000,
  });

  const addPlayerMemberMutation = useMutation({
    mutationFn: (payload: AddClubPlayerMemberPayload) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.addClubPlayerMember(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_PLAYER_MEMBERS(clubId) });
      }
    },
  });

  const updatePlayerMemberMutation = useMutation({
    mutationFn: ({
      membershipId,
      payload,
    }: {
      membershipId: string;
      payload: UpdateClubPlayerMemberPayload;
    }) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.updateClubPlayerMember(clubId, membershipId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_PLAYER_MEMBERS(clubId) });
      }
    },
  });

  return {
    ...playerMembersQuery,
    playerMembers: playerMembersQuery.data ?? [],
    addPlayerMember: addPlayerMemberMutation.mutateAsync,
    isAddingPlayerMember: addPlayerMemberMutation.isPending,
    addPlayerMemberError: addPlayerMemberMutation.error,
    updatePlayerMember: updatePlayerMemberMutation.mutateAsync,
    isUpdatingPlayerMember: updatePlayerMemberMutation.isPending,
    updatePlayerMemberError: updatePlayerMemberMutation.error,
  };
}
