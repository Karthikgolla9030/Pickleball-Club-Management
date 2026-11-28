/**
 * Aught2 Pickleball — Tournament Hooks
 * TanStack Query hooks for club tournament management, lifecycle actions,
 * participant administration, and player discovery/registration.
 */

import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tournamentApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  CreateTournamentPayload,
  EligiblePartnerItem,
  PlayerRegistrationResponse,
  PlayerSelfRegistrationPayload,
  PlayerTournamentRegistrationStatus,
  Tournament,
  TournamentDiscoveryItem,
  TournamentFormat,
  TournamentRegistrationItem,
  TournamentStatus,
  UpdateRegistrationPayload,
  UpdateTournamentPayload,
} from '@/types';

/**
 * Apply authoritative backend registration counts (and optional status/registration flags)
 * immediately across all tournament caches so Player Side and Club Side stay in lockstep.
 */
export function syncTournamentCountInCaches(
  queryClient: QueryClient,
  tournamentId: string,
  patch: {
    participant_count?: number | null;
    teams_count?: number | null;
    confirmed_players_count?: number | null;
    status?: TournamentStatus | string | null;
    workflow_state?: string | null;
    workflow_state_label?: string | null;
    configuration_saved?: boolean;
    configuration_saved_at?: string | null;
    structure_generated?: boolean;
    is_registered?: boolean;
    my_registration_id?: string | null;
    my_registration_status?: string | null;
  }
) {
  const applyPatch = <T extends Record<string, any>>(item: T): T => {
    if (!item || item.id !== tournamentId) return item;
    const next: Record<string, any> = { ...item };
    if (patch.participant_count !== undefined && patch.participant_count !== null) {
      next.participant_count = patch.participant_count;
    }
    if (patch.teams_count !== undefined) {
      next.teams_count = patch.teams_count;
    }
    if (patch.confirmed_players_count !== undefined) {
      next.confirmed_players_count = patch.confirmed_players_count;
    }
    if (patch.status) {
      next.status = patch.status;
    }
    if (patch.workflow_state !== undefined) {
      next.workflow_state = patch.workflow_state;
    }
    if (patch.workflow_state_label !== undefined) {
      next.workflow_state_label = patch.workflow_state_label;
    }
    if (patch.configuration_saved !== undefined) {
      next.configuration_saved = patch.configuration_saved;
    }
    if (patch.configuration_saved_at !== undefined) {
      next.configuration_saved_at = patch.configuration_saved_at;
    }
    if (patch.structure_generated !== undefined) {
      next.structure_generated = patch.structure_generated;
    }
    if (patch.is_registered !== undefined) {
      next.is_registered = patch.is_registered;
    }
    if (patch.my_registration_id !== undefined) {
      next.my_registration_id = patch.my_registration_id;
    }
    if (patch.my_registration_status !== undefined) {
      next.my_registration_status = patch.my_registration_status;
    }
    return next as T;
  };

  queryClient.setQueryData<Tournament>(QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId), (old) =>
    old ? applyPatch(old) : old
  );

  queryClient.setQueriesData<TournamentDiscoveryItem[]>(
    { queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS },
    (old) => (Array.isArray(old) ? old.map((t) => applyPatch(t)) : old)
  );

  queryClient.setQueriesData<any>(
    { queryKey: ['clubs'] },
    (old: any) => {
      if (Array.isArray(old)) {
        return old.map((item) => (item && item.id === tournamentId ? applyPatch(item) : item));
      }
      if (old && typeof old === 'object' && old.id === tournamentId) {
        return applyPatch(old);
      }
      return old;
    }
  );
}

/**
 * Invalidate all tournament, club, competition, and player queries affected by registration changes.
 */
export function invalidateAllTournamentQueries(
  queryClient: QueryClient,
  tournamentId?: string | null,
  clubId?: string | null
) {
  if (tournamentId) {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'my-registration'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'player-registrations'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'teams'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'registrations'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'eligible-partners'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'pools'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'standings'] });
    queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'matches'] });
    queryClient.invalidateQueries({ queryKey: ['tournament-registrations', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['scramble', 'state', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['scramble', 'matches', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['scramble', 'standings', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['matches', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['standings', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['bracket', tournamentId] });
  }
  if (clubId) {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
    queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments'] });
    queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'analytics'] });
  }
  queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
  queryClient.invalidateQueries({ queryKey: ['tournaments'] });
  queryClient.invalidateQueries({ queryKey: ['clubs'] });
  queryClient.invalidateQueries({ queryKey: ['player', 'upcoming-activities'] });
  queryClient.invalidateQueries({ queryKey: ['player', 'activity'] });
  queryClient.invalidateQueries({ queryKey: ['player', 'my-bookings'] });
}

/**
 * Hook for club staff listing and creating tournaments.
 */
export function useClubTournaments(clubId: string | null, status?: TournamentStatus) {
  const queryClient = useQueryClient();

  const tournamentsQuery = useQuery<Tournament[], Error>({
    queryKey: clubId
      ? [...QUERY_KEYS.CLUB_TOURNAMENTS(clubId), status ?? 'all']
      : ['clubs', 'none', 'tournaments'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return tournamentApi.listClubTournaments(clubId, status);
    },
    enabled: Boolean(clubId),
    staleTime: 10 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const createTournamentMutation = useMutation({
    mutationFn: (payload: CreateTournamentPayload) => {
      if (!clubId) throw new Error('Club ID required');
      return tournamentApi.createTournament(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
    },
  });

  const openRegistrationMutation = useMutation({
    mutationFn: (tournamentId: string) => {
      if (!clubId) throw new Error('Club ID required');
      return tournamentApi.openRegistration(clubId, tournamentId);
    },
    onSuccess: (updated: Tournament, tournamentId: string) => {
      if (clubId) {
        queryClient.setQueriesData<Tournament[]>(
          { queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) },
          (old) => (Array.isArray(old) ? old.map((t) => (t.id === tournamentId ? { ...t, ...updated } : t)) : old)
        );
      }
      queryClient.setQueryData(QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId), updated);
      invalidateAllTournamentQueries(queryClient, tournamentId, clubId);
    },
  });

  const closeRegistrationMutation = useMutation({
    mutationFn: (tournamentId: string) => {
      if (!clubId) throw new Error('Club ID required');
      return tournamentApi.closeRegistration(clubId, tournamentId);
    },
    onSuccess: (updated: Tournament, tournamentId: string) => {
      if (clubId) {
        queryClient.setQueriesData<Tournament[]>(
          { queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) },
          (old) => (Array.isArray(old) ? old.map((t) => (t.id === tournamentId ? { ...t, ...updated } : t)) : old)
        );
      }
      queryClient.setQueryData(QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId), updated);
      invalidateAllTournamentQueries(queryClient, tournamentId, clubId);
    },
  });

  const cancelTournamentMutation = useMutation({
    mutationFn: (tournamentId: string) => {
      if (!clubId) throw new Error('Club ID required');
      return tournamentApi.cancelTournament(clubId, tournamentId);
    },
    onSuccess: (_data, tournamentId) => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
    },
  });

  return {
    ...tournamentsQuery,
    tournaments: tournamentsQuery.data ?? [],
    createTournament: createTournamentMutation.mutateAsync,
    isCreatingTournament: createTournamentMutation.isPending,
    createTournamentError: createTournamentMutation.error,
    openRegistration: openRegistrationMutation.mutateAsync,
    isOpenRegistrationPending: openRegistrationMutation.isPending,
    closeRegistration: closeRegistrationMutation.mutateAsync,
    isCloseRegistrationPending: closeRegistrationMutation.isPending,
    cancelTournament: cancelTournamentMutation.mutateAsync,
    isCancelTournamentPending: cancelTournamentMutation.isPending,
  };
}

/**
 * Hook for managing a single tournament's details and lifecycle actions.
 */
export function useTournamentDetails(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const tournamentQuery = useQuery<Tournament, Error>({
    queryKey: tournamentId ? QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) : ['tournaments', 'none'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      if (clubId) {
        return tournamentApi.getClubTournament(clubId, tournamentId);
      }
      return tournamentApi.getTournament(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'in_progress') {
        return 15000;
      }
      if (status === 'registration_open') {
        return 10000;
      }
      return false;
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const invalidateTournament = () => {
    if (tournamentId) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['scramble', 'state', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-registrations', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['scramble', 'matches', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['scramble', 'standings', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['matches', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['standings', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['bracket', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'teams'] });
    }
    if (clubId) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments'] });
    }
    queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
  };

  const updateTournamentMutation = useMutation({
    mutationFn: (payload: UpdateTournamentPayload) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.updateTournament(clubId, tournamentId, payload);
    },
    onSuccess: (updated: Tournament) => {
      if (tournamentId) {
        queryClient.setQueryData(QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId), updated);
      }
      invalidateTournament();
    },
  });

  const openRegistrationMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.openRegistration(clubId, tournamentId);
    },
    onSuccess: (updated: Tournament) => {
      if (tournamentId) {
        queryClient.setQueryData(QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId), updated);
      }
      invalidateTournament();
    },
  });

  const closeRegistrationMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.closeRegistration(clubId, tournamentId);
    },
    onSuccess: (updated: Tournament) => {
      if (tournamentId) {
        queryClient.setQueryData(QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId), updated);
      }
      invalidateTournament();
    },
  });

  const cancelTournamentMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.cancelTournament(clubId, tournamentId);
    },
    onSuccess: invalidateTournament,
  });

  const startTournamentMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.startTournament(clubId, tournamentId);
    },
    onSuccess: (updated: Tournament) => {
      if (tournamentId) {
        queryClient.setQueryData(QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId), updated);
      }
      invalidateTournament();
    },
  });

  return {
    ...tournamentQuery,
    tournament: tournamentQuery.data,
    updateTournament: updateTournamentMutation.mutateAsync,
    isUpdatingTournament: updateTournamentMutation.isPending,
    openRegistration: openRegistrationMutation.mutateAsync,
    isOpenRegistrationPending: openRegistrationMutation.isPending,
    closeRegistration: closeRegistrationMutation.mutateAsync,
    isCloseRegistrationPending: closeRegistrationMutation.isPending,
    cancelTournament: cancelTournamentMutation.mutateAsync,
    isCancelTournamentPending: cancelTournamentMutation.isPending,
    startTournament: startTournamentMutation.mutateAsync,
    isStartingTournament: startTournamentMutation.isPending,
  };
}

/**
 * Hook for managing tournament registrations (participants).
 */
export function useTournamentRegistrations(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const registrationsQuery = useQuery<TournamentRegistrationItem[], Error>({
    queryKey:
      clubId && tournamentId
        ? QUERY_KEYS.TOURNAMENT_REGISTRATIONS(clubId, tournamentId)
        : ['clubs', 'none', 'tournaments', 'none', 'registrations'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.listRegistrations(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const updateRegistrationMutation = useMutation({
    mutationFn: ({
      registrationId,
      payload,
    }: {
      registrationId: string;
      payload: UpdateRegistrationPayload;
    }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.updateRegistration(clubId, tournamentId, registrationId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.TOURNAMENT_REGISTRATIONS(clubId, tournamentId),
        });
      }
      invalidateAllTournamentQueries(queryClient, tournamentId, clubId);
    },
  });

  return {
    ...registrationsQuery,
    registrations: registrationsQuery.data ?? [],
    updateRegistration: updateRegistrationMutation.mutateAsync,
    isUpdatingRegistration: updateRegistrationMutation.isPending,
    updateRegistrationError: updateRegistrationMutation.error,
  };
}

/**
 * Hook for player tournament discovery across active clubs.
 */
export function usePlayerTournaments(
  params?:
    | {
      clubId?: string;
      search?: string;
      format?: TournamentFormat;
      status?: TournamentStatus;
      startDateFrom?: string;
      startDateTo?: string;
      limit?: number;
      offset?: number;
    }
    | string
) {
  const clubId = typeof params === 'string' ? params : params?.clubId;
  const search = typeof params === 'object' ? params?.search : undefined;
  const format = typeof params === 'object' ? params?.format : undefined;
  const status = typeof params === 'object' ? params?.status : undefined;

  const playerTournamentsQuery = useQuery<TournamentDiscoveryItem[], Error>({
    queryKey: [
      ...QUERY_KEYS.PLAYER_TOURNAMENTS,
      clubId ?? 'all',
      search ?? '',
      format ?? 'all',
      status ?? 'all',
    ],
    queryFn: () => tournamentApi.discoverTournaments(params),
    staleTime: 5 * 1000,
    // The 5s staleTime ensures instant synchronization when switching between club and player views.
    refetchInterval: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return {
    ...playerTournamentsQuery,
    tournaments: playerTournamentsQuery.data ?? [],
  };
}

/**
 * Hook to retrieve eligible partners for a tournament.
 */
export function useEligiblePartners(tournamentId: string | null, search?: string) {
  const query = useQuery<EligiblePartnerItem[], Error>({
    queryKey: ['tournaments', tournamentId ?? 'none', 'eligible-partners', search ?? ''],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return tournamentApi.getEligiblePartners(tournamentId, search);
    },
    enabled: Boolean(tournamentId),
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    partners: query.data ?? [],
  };
}

/**
 * Hook for player self-registration and self-cancellation.
 */
export function usePlayerTournamentRegistration(tournamentId: string | null) {
  const queryClient = useQueryClient();

  const registerMutation = useMutation({
    mutationFn: (payload?: PlayerSelfRegistrationPayload) => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return tournamentApi.registerPlayer(tournamentId, payload);
    },
    onSuccess: (data: PlayerRegistrationResponse) => {
      if (tournamentId) {
        syncTournamentCountInCaches(queryClient, tournamentId, {
          participant_count: data.participant_count,
          teams_count: data.teams_count,
          confirmed_players_count: data.confirmed_players_count,
          is_registered: data.status !== 'cancelled',
          my_registration_id: data.id,
          my_registration_status: data.status,
        });
      }
      invalidateAllTournamentQueries(queryClient, tournamentId, null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return tournamentApi.cancelRegistration(tournamentId);
    },
    onSuccess: (data: PlayerRegistrationResponse) => {
      if (tournamentId) {
        syncTournamentCountInCaches(queryClient, tournamentId, {
          participant_count: data.participant_count,
          teams_count: data.teams_count,
          confirmed_players_count: data.confirmed_players_count,
          is_registered: false,
          my_registration_id: null,
          my_registration_status: null,
        });
      }
      invalidateAllTournamentQueries(queryClient, tournamentId, null);
    },
  });

  return {
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    cancelRegistration: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
    cancelError: cancelMutation.error,
  };
}

/**
 * Hook for checking authenticated player's registration status in a tournament.
 */
export function usePlayerMyRegistration(tournamentId: string | null) {
  const query = useQuery<PlayerTournamentRegistrationStatus, Error>({
    queryKey: ['tournaments', tournamentId ?? 'none', 'my-registration'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return tournamentApi.getMyRegistration(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 10 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (attempt) => Math.min(1500 * (attempt + 1), 4000),
  });

  return {
    ...query,
    isRegistered: query.data?.is_registered ?? false,
    registrationStatus: query.data?.status ?? null,
    registrationStatusLabel: query.data?.status_label ?? null,
    registration: query.data?.registration ?? null,
  };
}

/**
 * Hook for managing player tournament favorites with optimistic updates.
 */
export function useTournamentFavorites() {
  const queryClient = useQueryClient();

  const favoritesQuery = useQuery<string[], Error>({
    queryKey: ['player', 'tournaments', 'favorites'],
    queryFn: () => tournamentApi.getFavorites(),
    staleTime: 60 * 1000,
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ tournamentId, isFavorite }: { tournamentId: string; isFavorite: boolean }) => {
      if (isFavorite) {
        await tournamentApi.removeFavorite(tournamentId);
      } else {
        await tournamentApi.addFavorite(tournamentId);
      }
    },
    onMutate: async ({ tournamentId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: ['player', 'tournaments', 'favorites'] });
      const previousFavorites = queryClient.getQueryData<string[]>(['player', 'tournaments', 'favorites']) || [];
      const newFavorites = isFavorite
        ? previousFavorites.filter((id) => id !== tournamentId)
        : [...previousFavorites, tournamentId];
      queryClient.setQueryData(['player', 'tournaments', 'favorites'], newFavorites);
      return { previousFavorites };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousFavorites) {
        queryClient.setQueryData(['player', 'tournaments', 'favorites'], context.previousFavorites);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['player', 'tournaments', 'favorites'] });
    },
  });

  const favoriteIds = new Set(favoritesQuery.data || []);

  return {
    favoriteIds,
    isFavorite: (tournamentId: string) => favoriteIds.has(tournamentId),
    toggleFavorite: (tournamentId: string) => {
      const isFav = favoriteIds.has(tournamentId);
      return toggleFavoriteMutation.mutateAsync({ tournamentId, isFavorite: isFav });
    },
    isLoading: favoritesQuery.isLoading,
  };
}

/**
 * Hook for fetching confirmed tournament registrations for players.
 */
export function usePlayerTournamentRegistrations(tournamentId: string | null) {
  const query = useQuery<TournamentRegistrationItem[], Error>({
    queryKey: tournamentId
      ? ['tournaments', tournamentId, 'player-registrations']
      : ['tournaments', 'none', 'player-registrations'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return tournamentApi.getPlayerRegistrations(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 10 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return { ...query, registrations: query.data ?? [] };
}

