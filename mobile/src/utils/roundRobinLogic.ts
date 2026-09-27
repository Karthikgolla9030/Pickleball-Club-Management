/**
 * Aught2 Pickleball — Round Robin Pure Domain Logic
 *
 * Client-side presentation helpers and validators matching backend rules:
 * - Pickleball single-game score validation (>= 11, win by 2, no ties)
 * - Deterministic rounds & match counts estimation
 * - Round grouping & completion calculation
 */

import type { Match, StandingRow } from '@/types';
import type { RoundGroup, RoundRobinProgress, ScoreValidationResult } from '@/types/roundRobin';

/**
 * Validates a pickleball score pair according to official competition rules:
 * 1. Both scores must be non-negative integers.
 * 2. Scores cannot be equal (no ties).
 * 3. The winning score must be >= 11 points.
 * 4. The winner must lead by >= 2 points.
 */
export function validateRoundRobinScore(
  scoreA: number,
  scoreB: number
): ScoreValidationResult {
  if (isNaN(scoreA) || isNaN(scoreB)) {
    return { isValid: false, errorMessage: 'Scores must be valid numbers' };
  }

  if (scoreA < 0 || scoreB < 0) {
    return { isValid: false, errorMessage: 'Scores cannot be negative' };
  }

  if (scoreA === scoreB) {
    return { isValid: false, errorMessage: 'Scores cannot be equal — there must be a winner' };
  }

  const high = Math.max(scoreA, scoreB);
  const low = Math.min(scoreA, scoreB);
  const margin = high - low;

  if (high < 11) {
    return {
      isValid: false,
      errorMessage: `Winning score must be at least 11 (got ${high})`,
      margin,
    };
  }

  if (margin < 2) {
    return {
      isValid: false,
      errorMessage: `Winner must lead by at least 2 points (got ${high}–${low}, margin ${margin})`,
      margin,
    };
  }

  return {
    isValid: true,
    winnerSide: scoreA > scoreB ? 'a' : 'b',
    margin,
  };
}

/**
 * Calculates deterministic round robin match and round counts for N teams:
 * Total Matches = N * (N - 1) / 2
 * Rounds: even N -> N - 1 rounds; odd N -> N rounds (with 1 BYE per round)
 * Matches per round: Math.floor(N / 2)
 */
export function calculateExpectedRoundRobinSchedule(teamCount: number) {
  if (teamCount < 2) {
    return {
      totalMatches: 0,
      totalRounds: 0,
      matchesPerRound: 0,
      hasByes: false,
    };
  }

  const totalMatches = (teamCount * (teamCount - 1)) / 2;
  const isOdd = teamCount % 2 !== 0;
  const totalRounds = isOdd ? teamCount : teamCount - 1;
  const matchesPerRound = Math.floor(teamCount / 2);

  return {
    totalMatches,
    totalRounds,
    matchesPerRound,
    hasByes: isOdd,
  };
}

/**
 * Groups matches by round_number, sorted ascending.
 */
export function groupMatchesByRound(matches: Match[]): RoundGroup[] {
  const roundMap = new Map<number, Match[]>();

  for (const match of matches) {
    const roundNum = match.round_number ?? 1;
    const existing = roundMap.get(roundNum) ?? [];
    existing.push(match);
    roundMap.set(roundNum, existing);
  }

  const sortedRoundNumbers = Array.from(roundMap.keys()).sort((a, b) => a - b);

  return sortedRoundNumbers.map((roundNumber) => {
    const roundMatches = roundMap.get(roundNumber) ?? [];
    // Sort matches in round by match_number
    roundMatches.sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));

    const completedCount = roundMatches.filter((m) => m.status === 'completed').length;
    const totalCount = roundMatches.length;

    return {
      roundNumber,
      matches: roundMatches,
      completedCount,
      totalCount,
      isRoundComplete: totalCount > 0 && completedCount === totalCount,
    };
  });
}

/**
 * Calculates overall tournament completion progress and identifies champion from standings.
 */
export function calculateRoundRobinProgress(
  matches: Match[],
  standings: StandingRow[]
): RoundRobinProgress {
  const totalMatches = matches.length;
  const completedMatches = matches.filter((m) => m.status === 'completed').length;
  const isCompleted = totalMatches > 0 && completedMatches === totalMatches;
  const completionPercentage = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  // Champion is rank 1 team from standings when tournament is completed
  const champion = isCompleted && standings.length > 0 ? standings[0] : null;

  return {
    totalMatches,
    completedMatches,
    isCompleted,
    completionPercentage,
    champion,
  };
}
