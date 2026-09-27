/**
 * Aught2 Pickleball — Scramble Tournament Workspace Types
 *
 * Types for the individual rotate-partner Scramble tournament mode workspace:
 * - Sub-tabs navigation
 * - Authoritative round lifecycle state
 * - Court partitioning & assignments
 * - Score validation
 * - Individual standings
 */

export type ScrambleSubTab = 'overview' | 'players' | 'rounds' | 'standings' | 'results';

export type ScrambleRoundStatus = 'setup' | 'matchups_created' | 'in_progress' | 'completed';

export interface ScrambleCourtPlayerInfo {
  id: string;
  display_name: string;
  seed?: number | null;
  rating?: number | null;
}

export interface ScrambleCourtInfo {
  court_number: number;
  court_id: string | null;
  court_name: string;
  player_count: number;
  players: ScrambleCourtPlayerInfo[];
}

export interface ScrambleState {
  tournament_id: string;
  tournament_status: string;
  current_round: number;
  round_status: ScrambleRoundStatus;
  planned_rounds?: number;
  is_final_round?: boolean;
  registered_players_count: number;
  available_players_count: number;
  available_player_ids: string[];
  courts_count: number;
  games_completed: number;
  games_remaining: number;
  total_games: number;
  round_games_completed?: number;
  round_games_remaining?: number;
  round_games_total?: number;
  tournament_games_completed?: number;
  expected_total_games?: number;
  recommended_rounds?: number | null;
  recommendation_reason?: string | null;
  current_leader: string | null;
  champion_player_id: string | null;
  champion_player_name: string | null;
  courts: ScrambleCourtInfo[];
  valid_actions: string[];
  quality_summary?: any;
  coverage_summary?: any;
}

export interface ScrambleAvailabilityPayload {
  player_membership_ids: string[];
}

export interface ScrambleMatchupGeneratePayload {
  court_ids?: string[];
}

export interface ScrambleStandingRow {
  rank: number;
  player_membership_id: string;
  user_id: string | null;
  display_name: string;
  wins: number;
  losses: number;
  matches_played: number;
  points_scored: number;
  points_allowed: number;
  points_differential: number;
  skill_rating?: number | null;
}

export interface ScrambleStandingsResponse {
  tournament_id: string;
  standings: ScrambleStandingRow[];
}

export interface CourtPartition {
  c4: number;
  c5: number;
  totalCourts: number;
  isValid: boolean;
  description: string;
}

export interface ScrambleScoreValidation {
  isValid: boolean;
  errorMessage?: string;
  winnerSide?: 'side_a' | 'side_b';
  margin?: number;
}
