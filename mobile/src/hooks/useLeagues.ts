/**
 * Aught2 Pickleball — League Hooks (Phase 9)
 * TanStack Query hooks for League competition management:
 * leagues, weeks, matches, scores, standings, snapshots, and playoffs.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leagueApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  CreateLeaguePayload,
  CreateLeagueTeamPayload,
  LeagueMatch,
  LeaguePlayoffsResponse,
  LeagueStandingsResponse,
  LeagueStatus,
  LeagueSummary,
  LeagueTeam,
  LeagueWeek,
  LeagueWeeklyStandingSnapshot,
  LeagueEligiblePartner,
  PlayerLeagueRegisterPayload,
} from '@/types';

// ─── Club Staff Hooks ────────────────────────────────────────────────────────

export function useClubLeagues(clubId: string | null, status?: LeagueStatus) {
  const queryClient = useQueryClient();

  const leaguesQuery = useQuery<LeagueSummary[], Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_LEAGUES(clubId) : ['clubs', 'none', 'leagues'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return leagueApi.listClubLeagues(clubId, status);
    },
    enabled: Boolean(clubId),
    staleTime: 30 * 1000,
  });

  const createLeagueMutation = useMutation({
    mutationFn: (payload: CreateLeaguePayload) => {
      if (!clubId) throw new Error('Club ID required');
      return leagueApi.createLeague(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_LEAGUES(clubId) });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_LEAGUES });
    },
  });

  return {
    ...leaguesQuery,
    createLeague: createLeagueMutation.mutateAsync,
    isCreating: createLeagueMutation.isPending,
  };
}

export function useLeagueDetails(clubId: string | null, leagueId: string | null) {
  const queryClient = useQueryClient();

  const leagueQuery = useQuery<LeagueSummary, Error>({
    queryKey: clubId && leagueId
      ? QUERY_KEYS.CLUB_LEAGUE_DETAIL(clubId, leagueId)
      : ['clubs', 'none', 'leagues', 'none'],
    queryFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.getClubLeague(clubId, leagueId);
    },
    enabled: Boolean(clubId && leagueId),
    staleTime: 15 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: LeagueStatus) => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.updateLeagueStatus(clubId, leagueId, status);
    },
    onSuccess: () => {
      if (clubId && leagueId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_DETAIL(clubId, leagueId),
        });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_LEAGUES(clubId) });
      }
    },
  });

  const generateScheduleMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.generateSchedule(clubId, leagueId);
    },
    onSuccess: () => {
      if (clubId && leagueId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_DETAIL(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_WEEKS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_MATCHES(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_STANDINGS(clubId, leagueId),
        });
      }
    },
  });

  const generatePlayoffsMutation = useMutation({
    mutationFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.generatePlayoffs(clubId, leagueId);
    },
    onSuccess: () => {
      if (clubId && leagueId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_DETAIL(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_WEEKS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_PLAYOFFS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_MATCHES(clubId, leagueId),
        });
      }
    },
  });

  return {
    ...leagueQuery,
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    generateSchedule: generateScheduleMutation.mutateAsync,
    isGeneratingSchedule: generateScheduleMutation.isPending,
    generatePlayoffs: generatePlayoffsMutation.mutateAsync,
    isGeneratingPlayoffs: generatePlayoffsMutation.isPending,
  };
}

export function useLeagueTeams(clubId: string | null, leagueId: string | null) {
  const queryClient = useQueryClient();

  const teamsQuery = useQuery<LeagueTeam[], Error>({
    queryKey: clubId && leagueId
      ? QUERY_KEYS.CLUB_LEAGUE_TEAMS(clubId, leagueId)
      : ['clubs', 'none', 'leagues', 'none', 'teams'],
    queryFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.listTeams(clubId, leagueId);
    },
    enabled: Boolean(clubId && leagueId),
    staleTime: 15 * 1000,
  });

  const createTeamMutation = useMutation({
    mutationFn: (payload: CreateLeagueTeamPayload) => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.createTeam(clubId, leagueId, payload);
    },
    onSuccess: () => {
      if (clubId && leagueId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_TEAMS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_DETAIL(clubId, leagueId),
        });
      }
    },
  });

  return {
    ...teamsQuery,
    createTeam: createTeamMutation.mutateAsync,
    isCreatingTeam: createTeamMutation.isPending,
  };
}

export function useLeagueWeeks(clubId: string | null, leagueId: string | null) {
  return useQuery<LeagueWeek[], Error>({
    queryKey: clubId && leagueId
      ? QUERY_KEYS.CLUB_LEAGUE_WEEKS(clubId, leagueId)
      : ['clubs', 'none', 'leagues', 'none', 'weeks'],
    queryFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.listWeeks(clubId, leagueId);
    },
    enabled: Boolean(clubId && leagueId),
    staleTime: 30 * 1000,
  });
}

export function useLeagueMatches(
  clubId: string | null,
  leagueId: string | null,
  weekId?: string
) {
  const queryClient = useQueryClient();

  const matchesQuery = useQuery<LeagueMatch[], Error>({
    queryKey: clubId && leagueId
      ? QUERY_KEYS.CLUB_LEAGUE_MATCHES(clubId, leagueId, weekId)
      : ['clubs', 'none', 'leagues', 'none', 'matches'],
    queryFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.listMatches(clubId, leagueId, weekId);
    },
    enabled: Boolean(clubId && leagueId),
    staleTime: 10 * 1000,
  });

  const recordScoreMutation = useMutation({
    mutationFn: ({
      matchId,
      score_a,
      score_b,
    }: {
      matchId: string;
      score_a: number;
      score_b: number;
    }) => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.recordScore(clubId, leagueId, matchId, score_a, score_b);
    },
    onSuccess: () => {
      if (clubId && leagueId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_MATCHES(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_STANDINGS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_PLAYOFFS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_DETAIL(clubId, leagueId),
        });
      }
    },
  });

  const correctScoreMutation = useMutation({
    mutationFn: ({
      matchId,
      score_a,
      score_b,
    }: {
      matchId: string;
      score_a: number;
      score_b: number;
    }) => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.correctScore(clubId, leagueId, matchId, score_a, score_b);
    },
    onSuccess: () => {
      if (clubId && leagueId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_MATCHES(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_STANDINGS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_PLAYOFFS(clubId, leagueId),
        });
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_DETAIL(clubId, leagueId),
        });
      }
    },
  });

  return {
    ...matchesQuery,
    recordScore: recordScoreMutation.mutateAsync,
    isRecordingScore: recordScoreMutation.isPending,
    correctScore: correctScoreMutation.mutateAsync,
    isCorrectingScore: correctScoreMutation.isPending,
  };
}

export function useLeagueStandings(clubId: string | null, leagueId: string | null) {
  return useQuery<LeagueStandingsResponse, Error>({
    queryKey: clubId && leagueId
      ? QUERY_KEYS.CLUB_LEAGUE_STANDINGS(clubId, leagueId)
      : ['clubs', 'none', 'leagues', 'none', 'standings'],
    queryFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.getStandings(clubId, leagueId);
    },
    enabled: Boolean(clubId && leagueId),
    staleTime: 15 * 1000,
  });
}

export function useLeagueSnapshots(
  clubId: string | null,
  leagueId: string | null,
  weekNumber?: number
) {
  const queryClient = useQueryClient();

  const snapshotsQuery = useQuery<LeagueWeeklyStandingSnapshot[], Error>({
    queryKey: clubId && leagueId
      ? QUERY_KEYS.CLUB_LEAGUE_SNAPSHOTS(clubId, leagueId)
      : ['clubs', 'none', 'leagues', 'none', 'snapshots'],
    queryFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.listSnapshots(clubId, leagueId, weekNumber);
    },
    enabled: Boolean(clubId && leagueId),
    staleTime: 30 * 1000,
  });

  const snapshotMutation = useMutation({
    mutationFn: (weekId: string) => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.snapshotStandings(clubId, leagueId, weekId);
    },
    onSuccess: () => {
      if (clubId && leagueId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.CLUB_LEAGUE_SNAPSHOTS(clubId, leagueId),
        });
      }
    },
  });

  return {
    ...snapshotsQuery,
    snapshotStandings: snapshotMutation.mutateAsync,
    isSnapshotting: snapshotMutation.isPending,
  };
}

export function useLeaguePlayoffs(clubId: string | null, leagueId: string | null) {
  return useQuery<LeaguePlayoffsResponse, Error>({
    queryKey: clubId && leagueId
      ? QUERY_KEYS.CLUB_LEAGUE_PLAYOFFS(clubId, leagueId)
      : ['clubs', 'none', 'leagues', 'none', 'playoffs'],
    queryFn: () => {
      if (!clubId || !leagueId) throw new Error('Club ID and League ID required');
      return leagueApi.getPlayoffs(clubId, leagueId);
    },
    enabled: Boolean(clubId && leagueId),
    staleTime: 15 * 1000,
  });
}

// ─── Player Read Hooks ────────────────────────────────────────────────────────

export function usePlayerLeagues(status?: LeagueStatus) {
  return useQuery<LeagueSummary[], Error>({
    queryKey: [...QUERY_KEYS.PLAYER_LEAGUES, status ?? 'all'],
    queryFn: () => leagueApi.listPlayerLeagues(status),
    staleTime: 30 * 1000,
  });
}

export function usePlayerLeagueDetails(leagueId: string | null) {
  return useQuery<LeagueSummary, Error>({
    queryKey: leagueId ? QUERY_KEYS.PLAYER_LEAGUE_DETAIL(leagueId) : ['leagues', 'none'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getPlayerLeague(leagueId);
    },
    enabled: Boolean(leagueId),
    staleTime: 15 * 1000,
  });
}

export function usePlayerLeagueStandings(leagueId: string | null) {
  return useQuery<LeagueStandingsResponse, Error>({
    queryKey: leagueId ? QUERY_KEYS.PLAYER_LEAGUE_STANDINGS(leagueId) : ['leagues', 'none', 'standings'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getPlayerStandings(leagueId);
    },
    enabled: Boolean(leagueId),
    staleTime: 15 * 1000,
  });
}

export function usePlayerLeagueSnapshots(leagueId: string | null, weekNumber?: number) {
  return useQuery<LeagueWeeklyStandingSnapshot[], Error>({
    queryKey: leagueId ? QUERY_KEYS.PLAYER_LEAGUE_SNAPSHOTS(leagueId) : ['leagues', 'none', 'snapshots'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getPlayerSnapshots(leagueId, weekNumber);
    },
    enabled: Boolean(leagueId),
    staleTime: 30 * 1000,
  });
}

export function usePlayerLeagueWeeks(leagueId: string | null) {
  return useQuery<LeagueWeek[], Error>({
    queryKey: leagueId ? QUERY_KEYS.PLAYER_LEAGUE_WEEKS(leagueId) : ['leagues', 'none', 'weeks'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getPlayerWeeks(leagueId);
    },
    enabled: Boolean(leagueId),
    staleTime: 30 * 1000,
  });
}

export function usePlayerLeagueMatches(leagueId: string | null, weekId?: string) {
  return useQuery<LeagueMatch[], Error>({
    queryKey: leagueId ? QUERY_KEYS.PLAYER_LEAGUE_MATCHES(leagueId, weekId) : ['leagues', 'none', 'matches'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getPlayerMatches(leagueId, weekId);
    },
    enabled: Boolean(leagueId),
    staleTime: 10 * 1000,
  });
}

export function usePlayerLeaguePlayoffs(leagueId: string | null) {
  return useQuery<LeaguePlayoffsResponse, Error>({
    queryKey: leagueId ? QUERY_KEYS.PLAYER_LEAGUE_PLAYOFFS(leagueId) : ['leagues', 'none', 'playoffs'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getPlayerPlayoffs(leagueId);
    },
    enabled: Boolean(leagueId),
    staleTime: 15 * 1000,
  });
}

export function usePlayerLeagueRegistrationStatus(leagueId: string | null) {
  return useQuery<{ is_registered: boolean; team?: LeagueTeam | null }, Error>({
    queryKey: leagueId ? ['leagues', leagueId, 'my-registration'] : ['leagues', 'none', 'my-registration'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getPlayerRegistrationStatus(leagueId);
    },
    enabled: Boolean(leagueId),
    staleTime: 15 * 1000,
  });
}

export function usePlayerRegisterLeague(leagueId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PlayerLeagueRegisterPayload | {
      teamName: string;
      partnerMembershipId?: string | null;
      partnerName?: string | null;
    }) => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.registerPlayerLeague(leagueId, payload);
    },
    onSuccess: () => {
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'my-registration'] });
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'eligible-partners'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_LEAGUES });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_LEAGUE_DETAIL(leagueId) });
      }
    },
  });
}

export function useLeagueEligiblePartners(leagueId: string | null, searchQuery?: string) {
  return useQuery<LeagueEligiblePartner[], Error>({
    queryKey: leagueId
      ? ['leagues', leagueId, 'eligible-partners', searchQuery ?? '']
      : ['leagues', 'none', 'eligible-partners'],
    queryFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.getEligiblePartners(leagueId, searchQuery);
    },
    enabled: Boolean(leagueId),
    staleTime: 30 * 1000,
  });
}

export function usePlayerCancelLeagueRegistration(leagueId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!leagueId) throw new Error('League ID required');
      return leagueApi.cancelPlayerRegistration(leagueId);
    },
    onSuccess: () => {
      if (leagueId) {
        queryClient.invalidateQueries({ queryKey: ['leagues', leagueId, 'my-registration'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_LEAGUES });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_LEAGUE_DETAIL(leagueId) });
      }
    },
  });
}
