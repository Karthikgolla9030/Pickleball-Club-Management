/**
 * Aught2 Pickleball — Bracket Tournament Types
 *
 * Types for the standalone Bracket tournament mode workspace:
 * - Sub-tabs navigation
 * - Round grouping models
 * - Score validation state
 * - Progress indicators
 */

import type { Match } from './index';

export type BracketSubTab = 'overview' | 'players' | 'teams' | 'bracket' | 'matches' | 'standings' | 'results';

export type BracketSectionType = 'all' | 'winners' | 'losers' | 'finals';

export interface BracketRoundGroup {
  roundNumber: number;
  roundName: string;
  section?: 'winners' | 'losers' | 'finals';
  matches: Match[];
  completedCount: number;
  totalCount: number;
  isRoundComplete: boolean;
}

export interface BracketScoreValidation {
  isValid: boolean;
  error: string | null;
  winnerSide: 'a' | 'b' | null;
}

export interface BracketProgress {
  totalMatches: number;
  completedMatches: number;
  remainingMatches: number;
  percentComplete: number;
  isFinished: boolean;
  championName: string | null;
  currentRound: number | null;
}
