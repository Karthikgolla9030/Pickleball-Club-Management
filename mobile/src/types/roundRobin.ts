/**
 * Aught2 Pickleball — Round Robin Tournament Types
 *
 * Types for the Round Robin tournament mode workspace:
 * - Sub-tabs navigation
 * - Round grouping models
 * - Score validation state
 */

import type { Match, StandingRow } from './index';

export type RoundRobinSubTab = 'players' | 'teams' | 'matchups' | 'standings' | 'results' | 'settings';

export interface RoundGroup {
  roundNumber: number;
  matches: Match[];
  completedCount: number;
  totalCount: number;
  isRoundComplete: boolean;
}

export interface ScoreValidationResult {
  isValid: boolean;
  errorMessage?: string;
  winnerSide?: 'a' | 'b';
  margin?: number;
}

export interface RoundRobinProgress {
  totalMatches: number;
  completedMatches: number;
  isCompleted: boolean;
  completionPercentage: number;
  champion: StandingRow | null;
}
