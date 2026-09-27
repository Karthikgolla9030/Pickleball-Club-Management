/**
 * Aught2 Pickleball — Court Hooks (Phase 10)
 * TanStack Query hooks for Court management and player-facing court data.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { courtApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  Court,
  CourtCreateRequest,
  CourtReorderRequest,
  CourtStatus,
  CourtUpdateRequest,
  PlayerCourt,
} from '@/types';

// ─── Club Staff Hooks ────────────────────────────────────────────────────────

export function useClubCourts(clubId: string | null, status?: CourtStatus) {
  const queryClient = useQueryClient();

  const courtsQuery = useQuery<Court[], Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_COURTS(clubId, status) : ['clubs', 'none', 'courts', 'none'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return courtApi.listClubCourts(clubId, status);
    },
    enabled: Boolean(clubId),
    staleTime: 30 * 1000,
  });

  const createCourtMutation = useMutation({
    mutationFn: (payload: CourtCreateRequest) => {
      if (!clubId) throw new Error('Club ID required');
      return courtApi.createCourt(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      }
    },
  });

  const reorderCourtsMutation = useMutation({
    mutationFn: (payload: CourtReorderRequest) => {
      if (!clubId) throw new Error('Club ID required');
      return courtApi.reorderCourts(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      }
    },
  });

  return {
    ...courtsQuery,
    courts: courtsQuery.data ?? [],
    createCourt: createCourtMutation.mutateAsync,
    isCreating: createCourtMutation.isPending,
    reorderCourts: reorderCourtsMutation.mutateAsync,
    isReordering: reorderCourtsMutation.isPending,
  };
}

export function useCourtDetails(clubId: string | null, courtId: string | null) {
  const queryClient = useQueryClient();

  const courtQuery = useQuery<Court, Error>({
    queryKey: clubId && courtId
      ? QUERY_KEYS.CLUB_COURT_DETAILS(clubId, courtId)
      : ['clubs', 'none', 'courts', 'none'],
    queryFn: () => {
      if (!clubId || !courtId) throw new Error('Club ID and Court ID required');
      return courtApi.getCourtDetails(clubId, courtId);
    },
    enabled: Boolean(clubId && courtId),
    staleTime: 15 * 1000,
  });

  const updateCourtMutation = useMutation({
    mutationFn: (payload: CourtUpdateRequest) => {
      if (!clubId || !courtId) throw new Error('Club ID and Court ID required');
      return courtApi.updateCourt(clubId, courtId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      }
    },
  });

  const deactivateCourtMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !courtId) throw new Error('Club ID and Court ID required');
      return courtApi.deactivateCourt(clubId, courtId);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      }
    },
  });

  const reactivateCourtMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !courtId) throw new Error('Club ID and Court ID required');
      return courtApi.reactivateCourt(clubId, courtId);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      }
    },
  });

  return {
    ...courtQuery,
    court: courtQuery.data,
    updateCourt: updateCourtMutation.mutateAsync,
    isUpdating: updateCourtMutation.isPending,
    deactivateCourt: deactivateCourtMutation.mutateAsync,
    isDeactivating: deactivateCourtMutation.isPending,
    reactivateCourt: reactivateCourtMutation.mutateAsync,
    isReactivating: reactivateCourtMutation.isPending,
  };
}

// ─── Player Active Courts Hook ────────────────────────────────────────────────

export function usePlayerCourts(clubId: string | null) {
  const courtsQuery = useQuery<PlayerCourt[], Error>({
    queryKey: clubId ? QUERY_KEYS.PLAYER_COURTS(clubId) : ['clubs', 'none', 'player-courts'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return courtApi.getPlayerCourts(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 30 * 1000,
  });

  return {
    ...courtsQuery,
    courts: courtsQuery.data ?? [],
  };
}
