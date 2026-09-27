/**
 * Aught2 Pickleball — Competition Scheduling Hooks (Phase 17)
 *
 * TanStack Query hooks for:
 *   - Staff: daily court timelines, court availability grid, tournament/league match scheduling, rescheduling, unscheduling
 *   - Player: personal competition match schedule across tournaments and leagues
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { schedulingApi } from '@/services/api';
import type {
  CourtAvailabilityResponse,
  CourtScheduleResponse,
  PlayerMatchScheduleResponse,
  RescheduleMatchRequest,
  ScheduleMatchRequest,
  ScheduledMatch,
} from '@/types';

// ─── Staff Schedule & Availability Hooks ─────────────────────────────────────

/**
 * Get daily schedule across all courts for staff timeline.
 */
export function useClubDailySchedule(clubId: string, date?: string) {
  return useQuery<CourtScheduleResponse[]>({
    queryKey: QUERY_KEYS.CLUB_COMPETITION_SCHEDULE(clubId, date),
    queryFn: () => schedulingApi.getClubDailySchedule(clubId, date),
    enabled: !!clubId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get court availability grid for competition scheduling.
 */
export function useCompetitionCourtAvailability(clubId: string, date?: string) {
  return useQuery<CourtAvailabilityResponse[]>({
    queryKey: QUERY_KEYS.CLUB_COMPETITION_COURT_AVAILABILITY(clubId, date),
    queryFn: () => schedulingApi.getClubCourtAvailability(clubId, date),
    enabled: !!clubId,
    staleTime: 30 * 1000,
  });
}

// ─── Tournament Scheduling Hooks ─────────────────────────────────────────────

/**
 * Get scheduled matches for a tournament.
 */
export function useTournamentSchedule(clubId: string, tournamentId: string) {
  return useQuery<ScheduledMatch[]>({
    queryKey: QUERY_KEYS.CLUB_TOURNAMENT_SCHEDULE(clubId, tournamentId),
    queryFn: () => schedulingApi.getTournamentSchedule(clubId, tournamentId),
    enabled: !!clubId && !!tournamentId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get unscheduled matches for a tournament.
 */
export function useTournamentUnscheduled(clubId: string, tournamentId: string) {
  return useQuery<ScheduledMatch[]>({
    queryKey: QUERY_KEYS.CLUB_TOURNAMENT_UNSCHEDULED(clubId, tournamentId),
    queryFn: () => schedulingApi.getTournamentUnscheduled(clubId, tournamentId),
    enabled: !!clubId && !!tournamentId,
    staleTime: 30 * 1000,
  });
}

/**
 * Schedule a tournament match.
 */
export function useScheduleTournamentMatch(clubId: string, tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: ScheduleMatchRequest }) =>
      schedulingApi.scheduleTournamentMatch(clubId, tournamentId, matchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'competition-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'court-availability'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments', tournamentId] });
    },
  });
}

/**
 * Reschedule a tournament match.
 */
export function useRescheduleTournamentMatch(clubId: string, tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: RescheduleMatchRequest }) =>
      schedulingApi.rescheduleTournamentMatch(clubId, tournamentId, matchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'competition-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'court-availability'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments', tournamentId] });
    },
  });
}

/**
 * Unschedule a tournament match.
 */
export function useUnscheduleTournamentMatch(clubId: string, tournamentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) =>
      schedulingApi.unscheduleTournamentMatch(clubId, tournamentId, matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'competition-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'court-availability'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'tournaments', tournamentId] });
    },
  });
}

// ─── League Scheduling Hooks ─────────────────────────────────────────────────

/**
 * Get scheduled matches for a league.
 */
export function useLeagueSchedule(clubId: string, leagueId: string) {
  return useQuery<ScheduledMatch[]>({
    queryKey: QUERY_KEYS.CLUB_LEAGUE_SCHEDULE(clubId, leagueId),
    queryFn: () => schedulingApi.getLeagueSchedule(clubId, leagueId),
    enabled: !!clubId && !!leagueId,
    staleTime: 30 * 1000,
  });
}

/**
 * Get unscheduled matches for a league.
 */
export function useLeagueUnscheduled(clubId: string, leagueId: string) {
  return useQuery<ScheduledMatch[]>({
    queryKey: QUERY_KEYS.CLUB_LEAGUE_UNSCHEDULED(clubId, leagueId),
    queryFn: () => schedulingApi.getLeagueUnscheduled(clubId, leagueId),
    enabled: !!clubId && !!leagueId,
    staleTime: 30 * 1000,
  });
}

/**
 * Schedule a league match.
 */
export function useScheduleLeagueMatch(clubId: string, leagueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: ScheduleMatchRequest }) =>
      schedulingApi.scheduleLeagueMatch(clubId, leagueId, matchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'competition-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'court-availability'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'leagues', leagueId] });
    },
  });
}

/**
 * Reschedule a league match.
 */
export function useRescheduleLeagueMatch(clubId: string, leagueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, payload }: { matchId: string; payload: RescheduleMatchRequest }) =>
      schedulingApi.rescheduleLeagueMatch(clubId, leagueId, matchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'competition-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'court-availability'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'leagues', leagueId] });
    },
  });
}

/**
 * Unschedule a league match.
 */
export function useUnscheduleLeagueMatch(clubId: string, leagueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) =>
      schedulingApi.unscheduleLeagueMatch(clubId, leagueId, matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'competition-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'court-availability'] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'leagues', leagueId] });
    },
  });
}

// ─── Player Personal Competition Schedule Hook ──────────────────────────────

/**
 * Get authenticated player's personal match schedule.
 */
export function usePlayerCompetitionSchedule(
  clubId?: string,
  startDate?: string,
  endDate?: string
) {
  return useQuery<PlayerMatchScheduleResponse[]>({
    queryKey: QUERY_KEYS.PLAYER_COMPETITION_SCHEDULE(clubId, startDate, endDate),
    queryFn: () => schedulingApi.getPlayerSchedule(clubId, startDate, endDate),
    staleTime: 30 * 1000,
  });
}
