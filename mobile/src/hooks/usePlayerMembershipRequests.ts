/**
 * Aught2 Pickleball — usePlayerMembershipRequests Hook (Player)
 * Allows players to submit, view, and withdraw club membership applications.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playerApi } from '@/services/api';
import type { CreateMembershipRequestPayload, MembershipRequest } from '@/types';

export function usePlayerMembershipRequests() {
  const queryClient = useQueryClient();

  const {
    data: requests = [],
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery<MembershipRequest[], Error>({
    queryKey: ['player-membership-requests'],
    queryFn: () => playerApi.getMembershipRequests(),
    staleTime: 30 * 1000,
  });

  const submitMutation = useMutation({
    mutationFn: ({ clubId, payload }: { clubId: string; payload?: CreateMembershipRequestPayload }) =>
      playerApi.submitMembershipRequest(clubId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['player-membership-requests'] });
      queryClient.invalidateQueries({
        queryKey: ['player-club-membership-request', variables.clubId],
      });
      queryClient.invalidateQueries({ queryKey: ['player-clubs'] });
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (requestId: string) =>
      playerApi.withdrawMembershipRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player-membership-requests'] });
      queryClient.invalidateQueries({ queryKey: ['player-club-membership-request'] });
    },
  });

  return {
    requests,
    isLoading,
    isRefetching,
    error,
    refetch,
    submitRequest: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
    withdrawRequest: withdrawMutation.mutateAsync,
    isWithdrawing: withdrawMutation.isPending,
  };
}

export function usePlayerClubMembershipRequest(clubId: string | null | undefined) {
  const validClubId = clubId ?? '';

  const {
    data: request,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery<MembershipRequest | null, Error>({
    queryKey: ['player-club-membership-request', validClubId],
    queryFn: () => playerApi.getClubMembershipRequest(validClubId),
    enabled: Boolean(validClubId),
    staleTime: 30 * 1000,
  });

  return {
    request,
    isLoading,
    isRefetching,
    error,
    refetch,
  };
}
