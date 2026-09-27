/**
 * Aught2 Pickleball — Competition Hooks (Phase 5)
 * TanStack Query hooks for Round Robin competition management:
 * teams, match generation, score recording, and standings.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { competitionApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  AllPoolsStandingsResponse,
  CreateTeamPayload,
  Match,
  MatchResultPayload,
  Pool,
  PoolConfigureRequest,
  PoolManualAssignRequest,
  ScrambleAvailabilityPayload,
  ScrambleConfigureRequest,
  ScrambleMatchupGeneratePayload,
  ScrambleStandingRow,
  ScrambleStandingsResponse,
  ScrambleState,
  StandingsResponse,
  Team,
  UpdateTeamPayload,
} from '@/types';


/**
 * Hook for managing teams within a tournament.
 */
export function useTeams(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const teamsQuery = useQuery<Team[], Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_TEAMS(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'teams'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.listTeams(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 15 * 1000,
  });

  const createTeamMutation = useMutation({
    mutationFn: (payload: CreateTeamPayload) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.createTeam(clubId, tournamentId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_TEAMS(clubId, tournamentId),
        });
      }
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ teamId, payload }: { teamId: string; payload: UpdateTeamPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.updateTeam(clubId, tournamentId, teamId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_TEAMS(clubId, tournamentId),
        });
      }
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (teamId: string) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.deleteTeam(clubId, tournamentId, teamId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_TEAMS(clubId, tournamentId),
        });
      }
    },
  });

  return {
    ...teamsQuery,
    teams: teamsQuery.data ?? [],
    createTeam: createTeamMutation.mutateAsync,
    isCreatingTeam: createTeamMutation.isPending,
    createTeamError: createTeamMutation.error,
    updateTeam: updateTeamMutation.mutateAsync,
    isUpdatingTeam: updateTeamMutation.isPending,
    updateTeamError: updateTeamMutation.error,
    deleteTeam: deleteTeamMutation.mutateAsync,
    isDeletingTeam: deleteTeamMutation.isPending,
    deleteTeamError: deleteTeamMutation.error,
  };
}

/**
 * Hook for managing matches, generation, and score recording.
 */
export function useMatches(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const matchesQuery = useQuery<Match[], Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_MATCHES(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'matches'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.listMatches(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.generateRoundRobin(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_MATCHES(clubId, tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_STANDINGS(clubId, tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId),
        });
      }
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.regenerateRoundRobin(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_MATCHES(clubId, tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_STANDINGS(clubId, tournamentId),
        });
      }
    },
  });

  const startMatchMutation = useMutation({
    mutationFn: (matchId: string) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.startMatch(clubId, tournamentId, matchId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_MATCHES(clubId, tournamentId),
        });
      }
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.recordMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_MATCHES(clubId, tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_STANDINGS(clubId, tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS,
      });
    },
  });

  const correctResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.correctMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_MATCHES(clubId, tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_STANDINGS(clubId, tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId),
        });
      }
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS,
      });
    },
  });

  return {
    ...matchesQuery,
    matches: matchesQuery.data ?? [],
    generateRoundRobin: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generateError: generateMutation.error,
    regenerateRoundRobin: regenerateMutation.mutateAsync,
    isRegenerating: regenerateMutation.isPending,
    regenerateError: regenerateMutation.error,
    startMatch: startMatchMutation.mutateAsync,
    isStartingMatch: startMatchMutation.isPending,
    recordResult: recordResultMutation.mutateAsync,
    isRecordingResult: recordResultMutation.isPending,
    recordResultError: recordResultMutation.error,
    correctResult: correctResultMutation.mutateAsync,
    isCorrectingResult: correctResultMutation.isPending,
    correctResultError: correctResultMutation.error,
  };
}

/**
 * Hook for tournament standings.
 */
export function useStandings(clubId: string | null, tournamentId: string | null) {
  const standingsQuery = useQuery<StandingsResponse, Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_STANDINGS(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'standings'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.getStandings(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  return {
    ...standingsQuery,
    standings: standingsQuery.data?.standings ?? [],
  };
}

/**
 * Player read-only hooks.
 */
export function usePlayerTeams(tournamentId: string | null) {
  const query = useQuery<Team[], Error>({
    queryKey: tournamentId ? QUERY_KEYS.PLAYER_TEAMS(tournamentId) : ['tournaments', 'none', 'teams'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerListTeams(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 30 * 1000,
  });

  return { ...query, teams: query.data ?? [] };
}

export function usePlayerMatches(tournamentId: string | null) {
  const query = useQuery<Match[], Error>({
    queryKey: tournamentId ? QUERY_KEYS.PLAYER_MATCHES(tournamentId) : ['tournaments', 'none', 'matches'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerListMatches(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  return { ...query, matches: query.data ?? [] };
}

export function usePlayerStandings(tournamentId: string | null) {
  const query = useQuery<StandingsResponse, Error>({
    queryKey: tournamentId ? QUERY_KEYS.PLAYER_STANDINGS(tournamentId) : ['tournaments', 'none', 'standings'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerGetStandings(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  return { ...query, standings: query.data?.standings ?? [] };
}

// ─── Phase 6: Pool Play & Championship Hooks ─────────────────────────────────

export function usePools(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const poolsQuery = useQuery<Pool[], Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_POOLS(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'pools'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.listPools(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 15 * 1000,
  });

  const configurePoolsMutation = useMutation({
    mutationFn: (payload: PoolConfigureRequest) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.configurePools(clubId, tournamentId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOLS(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOL_STANDINGS(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      }
    },
  });

  const assignSerpentineMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.assignTeamsSerpentine(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOLS(clubId, tournamentId) });
      }
    },
  });

  const assignManualMutation = useMutation({
    mutationFn: (payload: PoolManualAssignRequest) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.assignTeamsManual(clubId, tournamentId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOLS(clubId, tournamentId) });
      }
    },
  });

  const generatePoolPlayMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.generatePoolPlay(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOL_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOL_STANDINGS(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
    },
  });

  const regeneratePoolPlayMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.regeneratePoolPlay(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOL_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_POOL_STANDINGS(clubId, tournamentId) });
      }
    },
  });

  return {
    ...poolsQuery,
    pools: poolsQuery.data ?? [],
    configurePools: configurePoolsMutation.mutateAsync,
    isConfiguringPools: configurePoolsMutation.isPending,
    configurePoolsError: configurePoolsMutation.error,
    assignSerpentine: assignSerpentineMutation.mutateAsync,
    isAssigningSerpentine: assignSerpentineMutation.isPending,
    assignSerpentineError: assignSerpentineMutation.error,
    assignManual: assignManualMutation.mutateAsync,
    isAssigningManual: assignManualMutation.isPending,
    assignManualError: assignManualMutation.error,
    generatePoolPlay: generatePoolPlayMutation.mutateAsync,
    isGeneratingPoolPlay: generatePoolPlayMutation.isPending,
    generatePoolPlayError: generatePoolPlayMutation.error,
    regeneratePoolPlay: regeneratePoolPlayMutation.mutateAsync,
    isRegeneratingPoolPlay: regeneratePoolPlayMutation.isPending,
    regeneratePoolPlayError: regeneratePoolPlayMutation.error,
  };
}

export function usePoolMatches(
  clubId: string | null,
  tournamentId: string | null,
  poolId?: string
) {
  const queryClient = useQueryClient();

  const matchesQuery = useQuery<Match[], Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_POOL_MATCHES(clubId, tournamentId, poolId)
      : ['clubs', 'none', 'tournaments', 'none', 'pools', 'matches'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.listPoolMatches(clubId, tournamentId, poolId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  const recordResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.recordMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments', tournamentId, 'pools'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CHAMPIONSHIP_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      }
    },
  });

  const correctResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.correctMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments', tournamentId, 'pools'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CHAMPIONSHIP_MATCHES(clubId, tournamentId) });
      }
    },
  });

  return {
    ...matchesQuery,
    matches: matchesQuery.data ?? [],
    recordResult: recordResultMutation.mutateAsync,
    isRecordingResult: recordResultMutation.isPending,
    recordResultError: recordResultMutation.error,
    correctResult: correctResultMutation.mutateAsync,
    isCorrectingResult: correctResultMutation.isPending,
    correctResultError: correctResultMutation.error,
  };
}

export function usePoolStandings(
  clubId: string | null,
  tournamentId: string | null,
  poolId?: string
) {
  const standingsQuery = useQuery<AllPoolsStandingsResponse, Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_POOL_STANDINGS(clubId, tournamentId, poolId)
      : ['clubs', 'none', 'tournaments', 'none', 'pools', 'standings'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.getPoolStandings(clubId, tournamentId, poolId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  return {
    ...standingsQuery,
    poolsStandings: standingsQuery.data?.pools ?? [],
  };
}

export function useChampionship(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const championshipMatchesQuery = useQuery<Match[], Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_CHAMPIONSHIP_MATCHES(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'championship', 'matches'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.listChampionshipMatches(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  const generateChampionshipMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.generateChampionship(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CHAMPIONSHIP_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      }
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.recordMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CHAMPIONSHIP_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
    },
  });

  const correctResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.correctMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CHAMPIONSHIP_MATCHES(clubId, tournamentId) });
      }
    },
  });

  return {
    ...championshipMatchesQuery,
    matches: championshipMatchesQuery.data ?? [],
    generateChampionship: generateChampionshipMutation.mutateAsync,
    isGeneratingChampionship: generateChampionshipMutation.isPending,
    generateChampionshipError: generateChampionshipMutation.error,
    recordResult: recordResultMutation.mutateAsync,
    isRecordingResult: recordResultMutation.isPending,
    recordResultError: recordResultMutation.error,
    correctResult: correctResultMutation.mutateAsync,
    isCorrectingResult: correctResultMutation.isPending,
    correctResultError: correctResultMutation.error,
  };
}

// ─── Player Read-Only Pool Play Hooks ────────────────────────────────────────

export function usePlayerPools(tournamentId: string | null) {
  const query = useQuery<Pool[], Error>({
    queryKey: tournamentId ? QUERY_KEYS.PLAYER_POOLS(tournamentId) : ['tournaments', 'none', 'pools'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerListPools(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 30 * 1000,
  });

  return { ...query, pools: query.data ?? [] };
}

export function usePlayerPoolMatches(tournamentId: string | null, poolId?: string) {
  const query = useQuery<Match[], Error>({
    queryKey: tournamentId ? QUERY_KEYS.PLAYER_POOL_MATCHES(tournamentId, poolId) : ['tournaments', 'none', 'pools', 'matches'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerListPoolMatches(tournamentId, poolId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  return { ...query, matches: query.data ?? [] };
}

export function usePlayerPoolStandings(tournamentId: string | null, poolId?: string) {
  const query = useQuery<AllPoolsStandingsResponse, Error>({
    queryKey: tournamentId ? QUERY_KEYS.PLAYER_POOL_STANDINGS(tournamentId, poolId) : ['tournaments', 'none', 'pools', 'standings'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerGetPoolStandings(tournamentId, poolId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  return { ...query, poolsStandings: query.data?.pools ?? [] };
}

export function usePlayerChampionshipMatches(tournamentId: string | null) {
  const query = useQuery<Match[], Error>({
    queryKey: tournamentId ? QUERY_KEYS.PLAYER_CHAMPIONSHIP_MATCHES(tournamentId) : ['tournaments', 'none', 'championship', 'matches'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerListChampionshipMatches(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  return { ...query, matches: query.data ?? [] };
}

// ─── Phase 7: Scramble Hooks ────────────────────────────────────────────────

export function useScramble(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const stateQuery = useQuery<ScrambleState, Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_SCRAMBLE_STATE(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'scramble', 'state'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.getScrambleState(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  const matchesQuery = useQuery<Match[], Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_SCRAMBLE_MATCHES(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'scramble', 'matches'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.listScrambleMatches(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  const standingsQuery = useQuery<ScrambleStandingsResponse, Error>({
    queryKey: clubId && tournamentId
      ? QUERY_KEYS.CLUB_SCRAMBLE_STANDINGS(clubId, tournamentId)
      : ['clubs', 'none', 'tournaments', 'none', 'scramble', 'standings'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.getScrambleStandings(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 15 * 1000,
  });

  const invalidateAll = () => {
    if (clubId && tournamentId) {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_SCRAMBLE_STATE(clubId, tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_SCRAMBLE_MATCHES(clubId, tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_SCRAMBLE_STANDINGS(clubId, tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_SCRAMBLE_STATE(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_SCRAMBLE_MATCHES(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_SCRAMBLE_STANDINGS(tournamentId),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS,
      });
    }
  };

  const setAvailabilityMutation = useMutation({
    mutationFn: (payload: ScrambleAvailabilityPayload) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.setScrambleAvailability(clubId, tournamentId, payload);
    },
    onSuccess: invalidateAll,
  });

  const createMatchupsMutation = useMutation({
    mutationFn: (payload?: ScrambleMatchupGeneratePayload) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.createScrambleMatchups(clubId, tournamentId, payload);
    },
    onSuccess: invalidateAll,
  });

  const startRoundMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.startScrambleRound(clubId, tournamentId);
    },
    onSuccess: invalidateAll,
  });

  const finishRoundMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.finishScrambleRound(clubId, tournamentId);
    },
    onSuccess: invalidateAll,
  });

  const startNextRoundMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.startScrambleNextRound(clubId, tournamentId);
    },
    onSuccess: invalidateAll,
  });

  const setPlannedRoundsMutation = useMutation({
    mutationFn: (plannedRounds: number) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.setScramblePlannedRounds(clubId, tournamentId, plannedRounds);
    },
    onSuccess: invalidateAll,
  });

  const endTournamentMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.endScrambleTournament(clubId, tournamentId);
    },
    onSuccess: invalidateAll,
  });

  const generateScrambleMutation = useMutation({
    mutationFn: (payload?: ScrambleConfigureRequest) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.generateScramble(clubId, tournamentId, payload);
    },
    onSuccess: invalidateAll,
  });

  const regenerateScrambleMutation = useMutation({
    mutationFn: (payload?: ScrambleConfigureRequest) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.regenerateScramble(clubId, tournamentId, payload);
    },
    onSuccess: invalidateAll,
  });

  const recordResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.recordMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: invalidateAll,
  });

  const correctResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.correctMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: invalidateAll,
  });

  return {
    state: stateQuery.data ?? null,
    isLoadingState: stateQuery.isLoading,
    stateError: stateQuery.error,
    refetchState: stateQuery.refetch,

    matches: matchesQuery.data ?? [],
    isLoadingMatches: matchesQuery.isLoading,
    matchesError: matchesQuery.error,
    refetchMatches: matchesQuery.refetch,

    standings: standingsQuery.data?.standings ?? [],
    isLoadingStandings: standingsQuery.isLoading,
    standingsError: standingsQuery.error,
    refetchStandings: standingsQuery.refetch,

    setAvailability: setAvailabilityMutation.mutateAsync,
    isSettingAvailability: setAvailabilityMutation.isPending,
    setAvailabilityError: setAvailabilityMutation.error,

    createMatchups: createMatchupsMutation.mutateAsync,
    isCreatingMatchups: createMatchupsMutation.isPending,
    createMatchupsError: createMatchupsMutation.error,

    startRound: startRoundMutation.mutateAsync,
    isStartingRound: startRoundMutation.isPending,
    startRoundError: startRoundMutation.error,

    finishRound: finishRoundMutation.mutateAsync,
    isFinishingRound: finishRoundMutation.isPending,
    finishRoundError: finishRoundMutation.error,

    startNextRound: startNextRoundMutation.mutateAsync,
    isStartingNextRound: startNextRoundMutation.isPending,
    startNextRoundError: startNextRoundMutation.error,

    setPlannedRounds: setPlannedRoundsMutation.mutateAsync,
    isSettingPlannedRounds: setPlannedRoundsMutation.isPending,
    setPlannedRoundsError: setPlannedRoundsMutation.error,

    endTournament: endTournamentMutation.mutateAsync,
    isEndingTournament: endTournamentMutation.isPending,
    endTournamentError: endTournamentMutation.error,

    generateScramble: generateScrambleMutation.mutateAsync,
    isGenerating: generateScrambleMutation.isPending,
    generateError: generateScrambleMutation.error,

    regenerateScramble: regenerateScrambleMutation.mutateAsync,
    isRegenerating: regenerateScrambleMutation.isPending,
    regenerateError: regenerateScrambleMutation.error,

    recordResult: recordResultMutation.mutateAsync,
    isRecordingResult: recordResultMutation.isPending,
    recordResultError: recordResultMutation.error,

    correctResult: correctResultMutation.mutateAsync,
    isCorrectingResult: correctResultMutation.isPending,
    correctResultError: correctResultMutation.error,
  };
}

export function usePlayerScramble(tournamentId: string | null) {
  const stateQuery = useQuery<ScrambleState, Error>({
    queryKey: tournamentId
      ? QUERY_KEYS.PLAYER_SCRAMBLE_STATE(tournamentId)
      : ['tournaments', 'none', 'scramble', 'state'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerGetScrambleState(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 10 * 1000,
  });

  const matchesQuery = useQuery<Match[], Error>({
    queryKey: tournamentId
      ? QUERY_KEYS.PLAYER_SCRAMBLE_MATCHES(tournamentId)
      : ['tournaments', 'none', 'scramble', 'matches'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerListScrambleMatches(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 10 * 1000,
  });

  const standingsQuery = useQuery<ScrambleStandingsResponse, Error>({
    queryKey: tournamentId
      ? QUERY_KEYS.PLAYER_SCRAMBLE_STANDINGS(tournamentId)
      : ['tournaments', 'none', 'scramble', 'standings'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerGetScrambleStandings(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  return {
    state: stateQuery.data ?? null,
    isLoadingState: stateQuery.isLoading,
    stateError: stateQuery.error,
    refetchState: stateQuery.refetch,

    matches: matchesQuery.data ?? [],
    isLoadingMatches: matchesQuery.isLoading,
    matchesError: matchesQuery.error,
    refetchMatches: matchesQuery.refetch,

    standings: standingsQuery.data?.standings ?? [],
    isLoadingStandings: standingsQuery.isLoading,
    standingsError: standingsQuery.error,
    refetchStandings: standingsQuery.refetch,
  };
}


// ─── Phase 8: Standalone Bracket Hooks ───────────────────────────────────────

/**
 * Staff hook for managing a standalone Bracket-format tournament.
 * Provides bracket generation, match listing, and bracket summary queries.
 */
export function useBracket(clubId: string | null, tournamentId: string | null) {
  const queryClient = useQueryClient();

  const matchesQuery = useQuery<Match[], Error>({
    queryKey:
      clubId && tournamentId
        ? QUERY_KEYS.CLUB_BRACKET_MATCHES(clubId, tournamentId)
        : ['clubs', 'none', 'tournaments', 'none', 'bracket', 'matches'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.listBracketMatches(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey:
      clubId && tournamentId
        ? QUERY_KEYS.CLUB_BRACKET_SUMMARY(clubId, tournamentId)
        : ['clubs', 'none', 'tournaments', 'none', 'bracket', 'summary'],
    queryFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.getBracketSummary(clubId, tournamentId);
    },
    enabled: Boolean(clubId && tournamentId),
    staleTime: 10 * 1000,
  });

  const generateBracketMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.generateBracket(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_SUMMARY(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
    },
  });

  const regenerateBracketMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.regenerateBracket(clubId, tournamentId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_SUMMARY(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.recordMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_SUMMARY(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
    },
  });

  const correctResultMutation = useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: MatchResultPayload }) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.correctMatchResult(clubId, tournamentId, matchId, payload);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_SUMMARY(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
      }
    },
  });

  const startMatchMutation = useMutation({
    mutationFn: (matchId: string) => {
      if (!clubId || !tournamentId) throw new Error('Club ID and Tournament ID required');
      return competitionApi.startMatch(clubId, tournamentId, matchId);
    },
    onSuccess: () => {
      if (clubId && tournamentId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_MATCHES(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_BRACKET_SUMMARY(clubId, tournamentId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournamentId) });
      }
    },
  });

  return {
    // Matches
    matches: matchesQuery.data ?? [],
    isLoadingMatches: matchesQuery.isLoading,
    matchesError: matchesQuery.error,
    refetchMatches: matchesQuery.refetch,

    // Summary
    summary: summaryQuery.data ?? null,
    isLoadingSummary: summaryQuery.isLoading,
    summaryError: summaryQuery.error,
    refetchSummary: summaryQuery.refetch,

    // Generation
    generateBracket: generateBracketMutation.mutateAsync,
    isGenerating: generateBracketMutation.isPending,
    generateError: generateBracketMutation.error,

    // Regeneration
    regenerateBracket: regenerateBracketMutation.mutateAsync,
    isRegenerating: regenerateBracketMutation.isPending,
    regenerateError: regenerateBracketMutation.error,

    // Match Start
    startMatch: startMatchMutation.mutateAsync,
    isStartingMatch: startMatchMutation.isPending,

    // Score Recording & Correction
    recordResult: recordResultMutation.mutateAsync,
    isRecordingResult: recordResultMutation.isPending,
    recordResultError: recordResultMutation.error,

    correctResult: correctResultMutation.mutateAsync,
    isCorrectingResult: correctResultMutation.isPending,
    correctResultError: correctResultMutation.error,
  };
}


/**
 * Player read-only hook for viewing a standalone Bracket-format tournament.
 */
export function usePlayerBracket(tournamentId: string | null) {
  const matchesQuery = useQuery<Match[], Error>({
    queryKey: tournamentId
      ? QUERY_KEYS.PLAYER_BRACKET_MATCHES(tournamentId)
      : ['tournaments', 'none', 'bracket', 'matches'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerListBracketMatches(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: tournamentId
      ? QUERY_KEYS.PLAYER_BRACKET_SUMMARY(tournamentId)
      : ['tournaments', 'none', 'bracket', 'summary'],
    queryFn: () => {
      if (!tournamentId) throw new Error('Tournament ID required');
      return competitionApi.playerGetBracketSummary(tournamentId);
    },
    enabled: Boolean(tournamentId),
    staleTime: 15 * 1000,
  });

  return {
    matches: matchesQuery.data ?? [],
    isLoadingMatches: matchesQuery.isLoading,
    matchesError: matchesQuery.error,
    refetchMatches: matchesQuery.refetch,

    summary: summaryQuery.data ?? null,
    isLoadingSummary: summaryQuery.isLoading,
    summaryError: summaryQuery.error,
    refetchSummary: summaryQuery.refetch,
  };
}


