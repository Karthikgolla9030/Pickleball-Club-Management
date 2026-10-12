/**
 * Aught2 Pickleball — useMembershipRequests Hook (Staff)
 * Allows Club Owner and Club Manager to list, approve, and reject player membership requests.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import type { MembershipRequest } from '@/types';

export function useMembershipRequests(clubId: string | null | undefined, statusFilter?: string) {
  const queryClient = useQueryClient();
  const validClubId = clubId ?? '';

  const queryKey = ['clubs', validClubId, 'membership-requests', statusFilter ?? 'all'];

  const {
    data: requests = [],
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery<MembershipRequest[], Error>({
    queryKey,
    queryFn: () => clubsApi.getClubMembershipRequests(validClubId, statusFilter),
    enabled: Boolean(validClubId),
    staleTime: 30 * 1000,
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      clubsApi.approveMembershipRequest(validClubId, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', validClubId, 'membership-requests'] });
      queryClient.invalidateQueries({ queryKey: ['club-player-members', validClubId] });
      queryClient.invalidateQueries({ queryKey: ['club-members', validClubId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      clubsApi.rejectMembershipRequest(validClubId, requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', validClubId, 'membership-requests'] });
    },
  });

  return {
    requests,
    isLoading,
    isRefetching,
    error,
    refetch,
    approveRequest: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    rejectRequest: rejectMutation.mutateAsync,
    isRejecting: rejectMutation.isPending,
  };
}
