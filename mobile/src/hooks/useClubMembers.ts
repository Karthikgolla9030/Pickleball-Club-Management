/**
 * useClubMembers — TanStack Query hook for member management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type { AddMemberPayload, ClubMember, UpdateMemberPayload } from '@/types';

export function useClubMembers(clubId: string | null) {
  const queryClient = useQueryClient();

  const membersQuery = useQuery<ClubMember[], Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_MEMBERS(clubId) : ['clubs', 'none', 'members'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.getClubMembers(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 60 * 1000,
  });

  const addMemberMutation = useMutation({
    mutationFn: (payload: AddMemberPayload) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.addClubMember(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
      }
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({
      membershipId,
      payload,
    }: {
      membershipId: string;
      payload: UpdateMemberPayload;
    }) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.updateClubMember(clubId, membershipId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
      }
    },
  });

  const deactivateMemberMutation = useMutation({
    mutationFn: (membershipId: string) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.deactivateClubMember(clubId, membershipId);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
      }
    },
  });

  return {
    ...membersQuery,
    members: membersQuery.data ?? [],
    addMember: addMemberMutation.mutateAsync,
    isAddingMember: addMemberMutation.isPending,
    addMemberError: addMemberMutation.error,
    updateMember: updateMemberMutation.mutateAsync,
    isUpdatingMember: updateMemberMutation.isPending,
    updateMemberError: updateMemberMutation.error,
    deactivateMember: deactivateMemberMutation.mutateAsync,
    isDeactivatingMember: deactivateMemberMutation.isPending,
    deactivateMemberError: deactivateMemberMutation.error,
  };
}
