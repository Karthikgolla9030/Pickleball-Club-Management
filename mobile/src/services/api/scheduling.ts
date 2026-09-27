/**
 * Aught2 Pickleball — Competition Scheduling API Service (Phase 17)
 *
 * Typed API client for court assignments, time scheduling, conflict detection,
 * daily court timelines, and player personal competition schedules.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  CourtAvailabilityResponse,
  CourtScheduleResponse,
  PlayerMatchScheduleResponse,
  RescheduleMatchRequest,
  ScheduleMatchRequest,
  ScheduledMatch,
} from '@/types';

export const schedulingApi = {
  // ─── Club Schedule & Availability ──────────────────────────────────────────

  /**
   * Get daily club schedule grouped by court for staff operations.
   */
  getClubDailySchedule(clubId: string, date?: string): Promise<CourtScheduleResponse[]> {
    return apiClient.get<CourtScheduleResponse[]>(
      API_ENDPOINTS.CLUB_COMPETITION_SCHEDULE(clubId, date)
    );
  },

  /**
   * Get 30-minute interval availability grid across active courts.
   */
  getClubCourtAvailability(clubId: string, date?: string): Promise<CourtAvailabilityResponse[]> {
    return apiClient.get<CourtAvailabilityResponse[]>(
      API_ENDPOINTS.CLUB_COMPETITION_COURT_AVAILABILITY(clubId, date)
    );
  },

  // ─── Tournament Scheduling ─────────────────────────────────────────────────

  /**
   * Get all scheduled matches for a tournament.
   */
  getTournamentSchedule(clubId: string, tournamentId: string): Promise<ScheduledMatch[]> {
    return apiClient.get<ScheduledMatch[]>(
      API_ENDPOINTS.CLUB_TOURNAMENT_SCHEDULE(clubId, tournamentId)
    );
  },

  /**
   * Get unscheduled matches for a tournament.
   */
  getTournamentUnscheduled(clubId: string, tournamentId: string): Promise<ScheduledMatch[]> {
    return apiClient.get<ScheduledMatch[]>(
      API_ENDPOINTS.CLUB_TOURNAMENT_UNSCHEDULED(clubId, tournamentId)
    );
  },

  /**
   * Assign court and schedule start time for a tournament match.
   */
  scheduleTournamentMatch(
    clubId: string,
    tournamentId: string,
    matchId: string,
    payload: ScheduleMatchRequest
  ): Promise<ScheduledMatch> {
    return apiClient.post<ScheduledMatch>(
      API_ENDPOINTS.CLUB_TOURNAMENT_MATCH_SCHEDULE(clubId, tournamentId, matchId),
      payload
    );
  },

  /**
   * Reschedule or reassign court for a tournament match.
   */
  rescheduleTournamentMatch(
    clubId: string,
    tournamentId: string,
    matchId: string,
    payload: RescheduleMatchRequest
  ): Promise<ScheduledMatch> {
    return apiClient.patch<ScheduledMatch>(
      API_ENDPOINTS.CLUB_TOURNAMENT_MATCH_SCHEDULE(clubId, tournamentId, matchId),
      payload
    );
  },

  /**
   * Remove schedule and court assignment from a tournament match.
   */
  unscheduleTournamentMatch(
    clubId: string,
    tournamentId: string,
    matchId: string
  ): Promise<ScheduledMatch> {
    return apiClient.delete<ScheduledMatch>(
      API_ENDPOINTS.CLUB_TOURNAMENT_MATCH_SCHEDULE(clubId, tournamentId, matchId)
    );
  },

  // ─── League Scheduling ─────────────────────────────────────────────────────

  /**
   * Get all scheduled matches for a league.
   */
  getLeagueSchedule(clubId: string, leagueId: string): Promise<ScheduledMatch[]> {
    return apiClient.get<ScheduledMatch[]>(
      API_ENDPOINTS.CLUB_LEAGUE_SCHEDULE(clubId, leagueId)
    );
  },

  /**
   * Get unscheduled matches for a league.
   */
  getLeagueUnscheduled(clubId: string, leagueId: string): Promise<ScheduledMatch[]> {
    return apiClient.get<ScheduledMatch[]>(
      API_ENDPOINTS.CLUB_LEAGUE_UNSCHEDULED(clubId, leagueId)
    );
  },

  /**
   * Assign court and schedule start time for a league match.
   */
  scheduleLeagueMatch(
    clubId: string,
    leagueId: string,
    matchId: string,
    payload: ScheduleMatchRequest
  ): Promise<ScheduledMatch> {
    return apiClient.post<ScheduledMatch>(
      API_ENDPOINTS.CLUB_LEAGUE_MATCH_SCHEDULE(clubId, leagueId, matchId),
      payload
    );
  },

  /**
   * Reschedule or reassign court for a league match.
   */
  rescheduleLeagueMatch(
    clubId: string,
    leagueId: string,
    matchId: string,
    payload: RescheduleMatchRequest
  ): Promise<ScheduledMatch> {
    return apiClient.patch<ScheduledMatch>(
      API_ENDPOINTS.CLUB_LEAGUE_MATCH_SCHEDULE(clubId, leagueId, matchId),
      payload
    );
  },

  /**
   * Remove schedule and court assignment from a league match.
   */
  unscheduleLeagueMatch(
    clubId: string,
    leagueId: string,
    matchId: string
  ): Promise<ScheduledMatch> {
    return apiClient.delete<ScheduledMatch>(
      API_ENDPOINTS.CLUB_LEAGUE_MATCH_SCHEDULE(clubId, leagueId, matchId)
    );
  },

  // ─── Player Personal Schedule ──────────────────────────────────────────────

  /**
   * Get authenticated player's personal schedule across tournaments and leagues.
   */
  getPlayerSchedule(
    clubId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<PlayerMatchScheduleResponse[]> {
    return apiClient.get<PlayerMatchScheduleResponse[]>(
      API_ENDPOINTS.PLAYER_COMPETITION_SCHEDULE(clubId, startDate, endDate)
    );
  },
};
