/**
 * Aught2 Pickleball — League API Service (Phase 9)
 *
 * Typed wrappers for all League competition endpoints.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
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
} from '@/types';

const clubLeagueBase = (clubId: string) => `${API_ENDPOINTS.CLUBS}/${clubId}/leagues`;
const playerLeagueBase = () => API_ENDPOINTS.LEAGUES;

export const leagueApi = {
  // ─── Club Staff League Management ──────────────────────────────────────────

  listClubLeagues(clubId: string, status?: LeagueStatus): Promise<LeagueSummary[]> {
    const url = status
      ? `${clubLeagueBase(clubId)}?status=${status}`
      : clubLeagueBase(clubId);
    return apiClient.get<LeagueSummary[]>(url);
  },

  getClubLeague(clubId: string, leagueId: string): Promise<LeagueSummary> {
    return apiClient.get<LeagueSummary>(`${clubLeagueBase(clubId)}/${leagueId}`);
  },

  createLeague(clubId: string, payload: CreateLeaguePayload): Promise<LeagueSummary> {
    return apiClient.post<LeagueSummary>(clubLeagueBase(clubId), payload);
  },

  updateLeague(
    clubId: string,
    leagueId: string,
    payload: Partial<CreateLeaguePayload>
  ): Promise<LeagueSummary> {
    return apiClient.patch<LeagueSummary>(`${clubLeagueBase(clubId)}/${leagueId}`, payload);
  },

  updateLeagueStatus(
    clubId: string,
    leagueId: string,
    status: LeagueStatus
  ): Promise<LeagueSummary> {
    if (status === 'registration_open') {
      return apiClient.post<LeagueSummary>(`${clubLeagueBase(clubId)}/${leagueId}/open-registration`, {});
    }
    if (status === 'registration_closed') {
      return apiClient.post<LeagueSummary>(`${clubLeagueBase(clubId)}/${leagueId}/close-registration`, {});
    }
    if (status === 'cancelled') {
      return apiClient.post<LeagueSummary>(`${clubLeagueBase(clubId)}/${leagueId}/cancel`, {});
    }
    return apiClient.post<LeagueSummary>(`${clubLeagueBase(clubId)}/${leagueId}/status`, {
      status,
    });
  },

  // ─── Teams (Staff) ──────────────────────────────────────────────────────────

  listTeams(clubId: string, leagueId: string): Promise<LeagueTeam[]> {
    return apiClient.get<LeagueTeam[]>(`${clubLeagueBase(clubId)}/${leagueId}/teams`);
  },

  createTeam(
    clubId: string,
    leagueId: string,
    payload: CreateLeagueTeamPayload
  ): Promise<LeagueTeam> {
    return apiClient.post<LeagueTeam>(
      `${clubLeagueBase(clubId)}/${leagueId}/teams`,
      payload
    );
  },

  // ─── Regular Season & Schedule (Staff) ──────────────────────────────────────

  generateSchedule(
    clubId: string,
    leagueId: string
  ): Promise<{ league_id: string; total_weeks: number; matches_generated: number; message: string }> {
    return apiClient.post(`${clubLeagueBase(clubId)}/${leagueId}/schedule`, {});
  },

  listWeeks(clubId: string, leagueId: string): Promise<LeagueWeek[]> {
    return apiClient.get<LeagueWeek[]>(`${clubLeagueBase(clubId)}/${leagueId}/weeks`);
  },

  listMatches(
    clubId: string,
    leagueId: string,
    weekId?: string,
    stage?: string
  ): Promise<LeagueMatch[]> {
    const params = new URLSearchParams();
    if (weekId) params.append('week_id', weekId);
    if (stage) params.append('stage', stage);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<LeagueMatch[]>(`${clubLeagueBase(clubId)}/${leagueId}/matches${qs}`);
  },

  recordScore(
    clubId: string,
    leagueId: string,
    matchId: string,
    score_a: number,
    score_b: number
  ): Promise<LeagueMatch> {
    return apiClient.post<LeagueMatch>(
      `${clubLeagueBase(clubId)}/${leagueId}/matches/${matchId}/score`,
      { score_a, score_b }
    );
  },

  correctScore(
    clubId: string,
    leagueId: string,
    matchId: string,
    score_a: number,
    score_b: number
  ): Promise<LeagueMatch> {
    return apiClient.patch<LeagueMatch>(
      `${clubLeagueBase(clubId)}/${leagueId}/matches/${matchId}/score`,
      { score_a, score_b }
    );
  },

  // ─── Standings & Snapshots (Staff) ──────────────────────────────────────────

  getStandings(clubId: string, leagueId: string): Promise<LeagueStandingsResponse> {
    return apiClient.get<LeagueStandingsResponse>(
      `${clubLeagueBase(clubId)}/${leagueId}/standings`
    );
  },

  listSnapshots(
    clubId: string,
    leagueId: string,
    weekNumber?: number
  ): Promise<LeagueWeeklyStandingSnapshot[]> {
    const qs = weekNumber !== undefined ? `?week_number=${weekNumber}` : '';
    return apiClient.get<LeagueWeeklyStandingSnapshot[]>(
      `${clubLeagueBase(clubId)}/${leagueId}/snapshots${qs}`
    );
  },

  snapshotStandings(
    clubId: string,
    leagueId: string,
    weekId: string
  ): Promise<{ league_id: string; week_id: string; week_number: number; count: number; message: string }> {
    return apiClient.post(`${clubLeagueBase(clubId)}/${leagueId}/weeks/${weekId}/snapshot`, {});
  },

  // ─── Playoffs (Staff) ───────────────────────────────────────────────────────

  generatePlayoffs(
    clubId: string,
    leagueId: string
  ): Promise<{ league_id: string; playoff_teams_count: number; matches_generated: number; rounds_count: number; message: string }> {
    return apiClient.post(`${clubLeagueBase(clubId)}/${leagueId}/playoffs/generate`, {});
  },

  getPlayoffs(clubId: string, leagueId: string): Promise<LeaguePlayoffsResponse> {
    return apiClient.get<LeaguePlayoffsResponse>(
      `${clubLeagueBase(clubId)}/${leagueId}/playoffs`
    );
  },

  // ─── Player Read Endpoints ──────────────────────────────────────────────────

  listPlayerLeagues(status?: LeagueStatus): Promise<LeagueSummary[]> {
    const url = status
      ? `${playerLeagueBase()}?status=${status}`
      : playerLeagueBase();
    return apiClient.get<LeagueSummary[]>(url);
  },

  getPlayerLeague(leagueId: string): Promise<LeagueSummary> {
    return apiClient.get<LeagueSummary>(`${playerLeagueBase()}/${leagueId}`);
  },

  getPlayerStandings(leagueId: string): Promise<LeagueStandingsResponse> {
    return apiClient.get<LeagueStandingsResponse>(`${playerLeagueBase()}/${leagueId}/standings`);
  },

  getPlayerSnapshots(
    leagueId: string,
    weekNumber?: number
  ): Promise<LeagueWeeklyStandingSnapshot[]> {
    const qs = weekNumber !== undefined ? `?week_number=${weekNumber}` : '';
    return apiClient.get<LeagueWeeklyStandingSnapshot[]>(
      `${playerLeagueBase()}/${leagueId}/snapshots${qs}`
    );
  },

  getPlayerWeeks(leagueId: string): Promise<LeagueWeek[]> {
    return apiClient.get<LeagueWeek[]>(`${playerLeagueBase()}/${leagueId}/weeks`);
  },

  getPlayerMatches(leagueId: string, weekId?: string): Promise<LeagueMatch[]> {
    const qs = weekId ? `?week_id=${weekId}` : '';
    return apiClient.get<LeagueMatch[]>(`${playerLeagueBase()}/${leagueId}/matches${qs}`);
  },

  getPlayerPlayoffs(leagueId: string): Promise<LeaguePlayoffsResponse> {
    return apiClient.get<LeaguePlayoffsResponse>(`${playerLeagueBase()}/${leagueId}/playoffs`);
  },
};
