/**
 * Aught2 Pickleball — Competition API Service (Phase 5)
 *
 * Typed wrappers for all Round Robin competition endpoints.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  AllPoolsStandingsResponse,
  BracketGenerationResponse,
  BracketSummaryResponse,
  ChampionshipGenerationResponse,
  CreateTeamPayload,
  GenerationResponse,
  Match,
  MatchResultPayload,
  Pool,
  PoolConfigureRequest,
  PoolManualAssignRequest,
  PoolPlayGenerationResponse,
  ScrambleAvailabilityPayload,
  ScrambleConfigureRequest,
  ScrambleGenerationResponse,
  ScrambleMatchupGeneratePayload,
  ScrambleStandingsResponse,
  ScrambleState,
  StandingsResponse,
  Team,
  UpdateTeamPayload,
} from '@/types';


const competitionBase = (clubId: string, tournamentId: string) =>
  `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}`;

export const competitionApi = {
  // ─── Teams (Staff) ──────────────────────────────────────────────────────────

  listTeams(clubId: string, tournamentId: string): Promise<Team[]> {
    return apiClient.get<Team[]>(`${competitionBase(clubId, tournamentId)}/teams`);
  },

  createTeam(clubId: string, tournamentId: string, payload: CreateTeamPayload): Promise<Team> {
    return apiClient.post<Team>(`${competitionBase(clubId, tournamentId)}/teams`, payload);
  },

  updateTeam(
    clubId: string,
    tournamentId: string,
    teamId: string,
    payload: UpdateTeamPayload
  ): Promise<Team> {
    return apiClient.patch<Team>(
      `${competitionBase(clubId, tournamentId)}/teams/${teamId}`,
      payload
    );
  },

  deleteTeam(clubId: string, tournamentId: string, teamId: string): Promise<void> {
    return apiClient.delete<void>(
      `${competitionBase(clubId, tournamentId)}/teams/${teamId}`
    );
  },

  // ─── Match Generation ────────────────────────────────────────────────────────

  generateRoundRobin(clubId: string, tournamentId: string): Promise<GenerationResponse> {
    return apiClient.post<GenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/generate-round-robin`,
      {}
    );
  },

  regenerateRoundRobin(clubId: string, tournamentId: string): Promise<GenerationResponse> {
    return apiClient.post<GenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/regenerate-round-robin`,
      {}
    );
  },

  // ─── Matches (Staff) ─────────────────────────────────────────────────────────

  listMatches(clubId: string, tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(`${competitionBase(clubId, tournamentId)}/matches`);
  },

  getMatch(clubId: string, tournamentId: string, matchId: string): Promise<Match> {
    return apiClient.get<Match>(`${competitionBase(clubId, tournamentId)}/matches/${matchId}`);
  },

  startMatch(clubId: string, tournamentId: string, matchId: string): Promise<Match> {
    return apiClient.post<Match>(
      `${competitionBase(clubId, tournamentId)}/matches/${matchId}/start`,
      {}
    );
  },

  recordMatchResult(
    clubId: string,
    tournamentId: string,
    matchId: string,
    payload: MatchResultPayload
  ): Promise<Match> {
    return apiClient.post<Match>(
      `${competitionBase(clubId, tournamentId)}/matches/${matchId}/result`,
      payload
    );
  },

  correctMatchResult(
    clubId: string,
    tournamentId: string,
    matchId: string,
    payload: MatchResultPayload
  ): Promise<Match> {
    return apiClient.patch<Match>(
      `${competitionBase(clubId, tournamentId)}/matches/${matchId}/result`,
      payload
    );
  },

  // ─── Standings (Staff) ───────────────────────────────────────────────────────

  getStandings(clubId: string, tournamentId: string): Promise<StandingsResponse> {
    return apiClient.get<StandingsResponse>(
      `${competitionBase(clubId, tournamentId)}/standings`
    );
  },

  // ─── Phase 6: Pool Play (Staff) ─────────────────────────────────────────────

  configurePools(
    clubId: string,
    tournamentId: string,
    payload: PoolConfigureRequest
  ): Promise<Pool[]> {
    return apiClient.post<Pool[]>(
      `${competitionBase(clubId, tournamentId)}/pools/configure`,
      payload
    );
  },

  listPools(clubId: string, tournamentId: string): Promise<Pool[]> {
    return apiClient.get<Pool[]>(`${competitionBase(clubId, tournamentId)}/pools`);
  },

  assignTeamsSerpentine(clubId: string, tournamentId: string): Promise<Pool[]> {
    return apiClient.post<Pool[]>(
      `${competitionBase(clubId, tournamentId)}/pools/assign-serpentine`,
      {}
    );
  },

  assignTeamsManual(
    clubId: string,
    tournamentId: string,
    payload: PoolManualAssignRequest
  ): Promise<Pool[]> {
    return apiClient.post<Pool[]>(
      `${competitionBase(clubId, tournamentId)}/pools/assign-manual`,
      payload
    );
  },

  generatePoolPlay(
    clubId: string,
    tournamentId: string
  ): Promise<PoolPlayGenerationResponse> {
    return apiClient.post<PoolPlayGenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/generate-pool-play`,
      {}
    );
  },

  regeneratePoolPlay(
    clubId: string,
    tournamentId: string
  ): Promise<PoolPlayGenerationResponse> {
    return apiClient.post<PoolPlayGenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/regenerate-pool-play`,
      {}
    );
  },

  listPoolMatches(
    clubId: string,
    tournamentId: string,
    poolId?: string
  ): Promise<Match[]> {
    const query = poolId ? `?pool_id=${encodeURIComponent(poolId)}` : '';
    return apiClient.get<Match[]>(
      `${competitionBase(clubId, tournamentId)}/pools/matches${query}`
    );
  },

  getPoolStandings(
    clubId: string,
    tournamentId: string,
    poolId?: string
  ): Promise<AllPoolsStandingsResponse> {
    const query = poolId ? `?pool_id=${encodeURIComponent(poolId)}` : '';
    return apiClient.get<AllPoolsStandingsResponse>(
      `${competitionBase(clubId, tournamentId)}/pools/standings${query}`
    );
  },

  generateChampionship(
    clubId: string,
    tournamentId: string
  ): Promise<ChampionshipGenerationResponse> {
    return apiClient.post<ChampionshipGenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/generate-championship`,
      {}
    );
  },

  listChampionshipMatches(clubId: string, tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(
      `${competitionBase(clubId, tournamentId)}/championship/matches`
    );
  },

  // ─── Scramble Competition (Staff - Phase 7) ──────────────────────────────────

  generateScramble(
    clubId: string,
    tournamentId: string,
    payload?: ScrambleConfigureRequest
  ): Promise<ScrambleGenerationResponse> {
    return apiClient.post<ScrambleGenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/generate-scramble`,
      payload || {}
    );
  },

  regenerateScramble(
    clubId: string,
    tournamentId: string,
    payload?: ScrambleConfigureRequest
  ): Promise<ScrambleGenerationResponse> {
    return apiClient.post<ScrambleGenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/regenerate-scramble`,
      payload || {}
    );
  },

  listScrambleMatches(clubId: string, tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(
      `${competitionBase(clubId, tournamentId)}/scramble/matches`
    );
  },

  getScrambleStandings(
    clubId: string,
    tournamentId: string
  ): Promise<ScrambleStandingsResponse> {
    return apiClient.get<ScrambleStandingsResponse>(
      `${competitionBase(clubId, tournamentId)}/scramble/standings`
    );
  },

  getScrambleState(
    clubId: string,
    tournamentId: string
  ): Promise<ScrambleState> {
    return apiClient.get<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/state`
    );
  },

  setScrambleAvailability(
    clubId: string,
    tournamentId: string,
    payload: ScrambleAvailabilityPayload
  ): Promise<ScrambleState> {
    return apiClient.post<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/availability`,
      payload
    );
  },

  createScrambleMatchups(
    clubId: string,
    tournamentId: string,
    payload?: ScrambleMatchupGeneratePayload
  ): Promise<ScrambleState> {
    return apiClient.post<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/matchups`,
      payload || {}
    );
  },

  startScrambleRound(
    clubId: string,
    tournamentId: string
  ): Promise<ScrambleState> {
    return apiClient.post<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/start-round`,
      {}
    );
  },

  finishScrambleRound(
    clubId: string,
    tournamentId: string
  ): Promise<ScrambleState> {
    return apiClient.post<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/finish-round`,
      {}
    );
  },

  startScrambleNextRound(
    clubId: string,
    tournamentId: string
  ): Promise<ScrambleState> {
    return apiClient.post<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/next-round`,
      {}
    );
  },

  endScrambleTournament(
    clubId: string,
    tournamentId: string
  ): Promise<ScrambleState> {
    return apiClient.post<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/end-tournament`,
      {}
    );
  },

  setScramblePlannedRounds(
    clubId: string,
    tournamentId: string,
    plannedRounds: number
  ): Promise<ScrambleState> {
    return apiClient.post<ScrambleState>(
      `${competitionBase(clubId, tournamentId)}/scramble/planned-rounds`,
      { planned_rounds: plannedRounds }
    );
  },

  // ─── Standalone Bracket (Staff — Phase 8) ─────────────────────────────────────────────────────────

  generateBracket(
    clubId: string,
    tournamentId: string
  ): Promise<BracketGenerationResponse> {
    return apiClient.post<BracketGenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/generate-bracket`,
      {}
    );
  },

  regenerateBracket(
    clubId: string,
    tournamentId: string
  ): Promise<BracketGenerationResponse> {
    return apiClient.post<BracketGenerationResponse>(
      `${competitionBase(clubId, tournamentId)}/regenerate-bracket`,
      {}
    );
  },

  getBracketSummary(
    clubId: string,
    tournamentId: string
  ): Promise<BracketSummaryResponse> {
    return apiClient.get<BracketSummaryResponse>(
      `${competitionBase(clubId, tournamentId)}/bracket`
    );
  },

  listBracketMatches(clubId: string, tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(
      `${competitionBase(clubId, tournamentId)}/bracket/matches`
    );
  },

    // ─── Player Read-Only ────────────────────────────────────────────────────────

  playerListTeams(tournamentId: string): Promise<Team[]> {
    return apiClient.get<Team[]>(`${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/teams`);
  },

  playerListMatches(tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(`${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/matches`);
  },

  playerGetStandings(tournamentId: string): Promise<StandingsResponse> {
    return apiClient.get<StandingsResponse>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/standings`
    );
  },

  playerListPools(tournamentId: string): Promise<Pool[]> {
    return apiClient.get<Pool[]>(`${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/pools`);
  },

  playerListPoolMatches(tournamentId: string, poolId?: string): Promise<Match[]> {
    const query = poolId ? `?pool_id=${encodeURIComponent(poolId)}` : '';
    return apiClient.get<Match[]>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/pools/matches${query}`
    );
  },

  playerGetPoolStandings(
    tournamentId: string,
    poolId?: string
  ): Promise<AllPoolsStandingsResponse> {
    const query = poolId ? `?pool_id=${encodeURIComponent(poolId)}` : '';
    return apiClient.get<AllPoolsStandingsResponse>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/pools/standings${query}`
    );
  },

  playerListChampionshipMatches(tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/championship/matches`
    );
  },

  playerListScrambleMatches(tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/scramble/matches`
    );
  },

  playerGetScrambleStandings(tournamentId: string): Promise<ScrambleStandingsResponse> {
    return apiClient.get<ScrambleStandingsResponse>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/scramble/standings`
    );
  },

  playerGetScrambleState(tournamentId: string): Promise<ScrambleState> {
    return apiClient.get<ScrambleState>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/scramble/state`
    );
  },
  // ─── Player Read-Only Bracket (Phase 8) ──────────────────────────────────────────────────────

  playerGetBracketSummary(tournamentId: string): Promise<BracketSummaryResponse> {
    return apiClient.get<BracketSummaryResponse>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/bracket`
    );
  },

  playerListBracketMatches(tournamentId: string): Promise<Match[]> {
    return apiClient.get<Match[]>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/bracket/matches`
    );
  },

};


