/**
 * Aught2 Pickleball — Tournament Hooks
 * TanStack Query hooks for club tournament management, lifecycle actions,
 * participant administration, and player discovery/registration.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tournamentApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  CreateTournamentPayload,
  EligiblePartnerItem,
  PlayerSelfRegistrationPayload,
  PlayerTournamentRegistrationStatus,
  Tournament,
  TournamentDiscoveryItem,
  TournamentRegistrationItem,
  TournamentStatus,
  UpdateRegistrationPayload,
  UpdateTournamentPayload,
} from '@/types';

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
    staleTime: 30 * 1000,
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
    onSuccess: (_data, tournamentId) => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
    },
  });

  const closeRegistrationMutation = useMutation({
    mutationFn: (tournamentId: string) => {
      if (!clubId) throw new Error('Club ID required');
      return tournamentApi.closeRegistration(clubId, tournamentId);
    },
    onSuccess: (_data, tournamentId) => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
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
      // Only poll when the tournament is actively in progress — and at a reasonable rate
      if (status === 'in_progress') {
        return 15000; // 15s is sufficient; avoids hammering the server
      }
      return false;
    },
  });

  const invalidateTournament = () => {
    if (tournamentId) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      queryClient.invalidateQueries({ queryKey: ['scramble', 'state', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-registrations', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['scramble', 'matches', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['scramble', 'standings', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['matches', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['standings', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['bracket', tournamentId] });
    }
    if (clubId) {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
  };

  const updateTournamentMutation = useMutation({
    mutationFn: (payload: UpdateTournamentPayload) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.updateTournament(clubId, tournamentId, payload);
    },
    onSuccess: invalidateTournament,
  });

  const openRegistrationMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.openRegistration(clubId, tournamentId);
    },
    onSuccess: invalidateTournament,
  });

  const closeRegistrationMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.closeRegistration(clubId, tournamentId);
    },
    onSuccess: invalidateTournament,
  });

  const cancelTournamentMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return tournamentApi.cancelTournament(clubId, tournamentId);
    },
    onSuccess: invalidateTournament,
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
    staleTime: 15 * 1000,
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
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      }
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
export function usePlayerTournaments() {
  const playerTournamentsQuery = useQuery<TournamentDiscoveryItem[], Error>({
    queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS,
    queryFn: () => tournamentApi.discoverTournaments(),
    staleTime: 30 * 1000,
    // No automatic polling — data is invalidated by mutations (register, close-reg, etc.)
    // The short staleTime ensures data is refetched when the screen is re-focused.
    refetchInterval: false,
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
    onSuccess: () => {
      if (tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'my-registration'] });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return tournamentApi.cancelRegistration(tournamentId);
    },
    onSuccess: () => {
      if (tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'my-registration'] });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
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
    staleTime: 15 * 1000,
  });

  return { ...query, registrations: query.data ?? [] };
}

