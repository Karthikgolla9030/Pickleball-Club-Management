/**
 * Aught2 Pickleball — Bracket Pure Domain Logic
 *
 * Client-side presentation helpers, round grouping, BYE detection,
 * and official pickleball single-game score validation:
 * - Scoring: >= 11 points, win by >= 2 margin, no ties.
 * - Round names: Standard tournament round names (Final, Semifinals, Quarterfinals, etc.)
 * - BYE recognition: Clean separation of auto-resolved BYE matches vs real played matches.
 */

import type { Match, BracketSummaryResponse } from '@/types';
import type {
  BracketProgress,
  BracketRoundGroup,
  BracketScoreValidation,
} from '@/types/bracket';

/**
 * Validates a pickleball score pair according to official competition rules:
 * 1. Both scores must be non-negative integers.
 * 2. Scores cannot be equal (no ties).
 * 3. The winning score must be >= 11 points.
 * 4. The winner must lead by >= 2 points.
 */
export function validateBracketScore(
  scoreA: number,
  scoreB: number
): BracketScoreValidation {
  if (isNaN(scoreA) || isNaN(scoreB)) {
    return {
      isValid: false,
      error: 'Scores must be valid numbers',
      winnerSide: null,
    };
  }

  if (scoreA < 0 || scoreB < 0) {
    return {
      isValid: false,
      error: 'Scores cannot be negative',
      winnerSide: null,
    };
  }

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return {
      isValid: false,
      error: 'Scores must be whole integers',
      winnerSide: null,
    };
  }

  if (scoreA === scoreB) {
    return {
      isValid: false,
      error: 'Pickleball games cannot end in a tie',
      winnerSide: null,
    };
  }

  const maxScore = Math.max(scoreA, scoreB);
  const minScore = Math.min(scoreA, scoreB);
  const margin = maxScore - minScore;

  if (maxScore < 11) {
    return {
      isValid: false,
      error: 'Winning score must be at least 11 points',
      winnerSide: null,
    };
  }

  if (margin < 2) {
    return {
      isValid: false,
      error: 'Winner must lead by at least 2 points (win by 2)',
      winnerSide: null,
    };
  }

  const winnerSide: 'a' | 'b' = scoreA > scoreB ? 'a' : 'b';

  return {
    isValid: true,
    error: null,
    winnerSide,
  };
}

/**
 * Returns the human-readable standard sports round name.
 * e.g., for a 3-round bracket:
 *   Round 3 -> "Final"
 *   Round 2 -> "Semifinals"
 *   Round 1 -> "Quarterfinals"
 */
export function getBracketRoundName(roundNumber: number, totalRounds: number): string {
  if (roundNumber >= totalRounds) {
    return 'Final';
  }
  if (roundNumber === totalRounds - 1) {
    return 'Semifinals';
  }
  if (roundNumber === totalRounds - 2) {
    return 'Quarterfinals';
  }
  if (roundNumber === totalRounds - 3) {
    return 'Round of 16';
  }
  return `Round ${roundNumber}`;
}

/**
 * Detects if a match is an auto-advanced BYE match.
 * BYE matches have no playable opponent, status="completed", scores=null, and winner_team_id set.
 */
export function isMatchBye(match: Match): boolean {
  if (match.status === 'completed' && match.score_a === null && match.score_b === null && match.winner_team_id) {
    return true;
  }
  if (match.status === 'completed' && (!match.team_a_id || !match.team_b_id)) {
    return true;
  }
  return false;
}

/**
 * Detects if a match is ready to play (both teams known, status pending, not a bye).
 */
export function isMatchReady(match: Match): boolean {
  if (match.status !== 'pending') return false;
  if (!match.team_a_id || !match.team_b_id) return false;
  return !isMatchBye(match);
}

/**
 * Detects if a match is waiting for previous round winners to be decided.
 */
export function isMatchWaiting(match: Match): boolean {
  if (match.status === 'cancelled') return false;
  if (match.status === 'waiting') return true;
  if (match.status !== 'pending') return false;
  return !match.team_a_id || !match.team_b_id;
}

/**
 * Returns human-readable round name for a specific section and round number.
 */
export function getSectionRoundName(
  section: 'winners' | 'losers' | 'finals',
  roundNumber: number,
  totalRounds: number
): string {
  if (section === 'winners') {
    if (roundNumber >= totalRounds) return 'Winners Final';
    if (roundNumber === totalRounds - 1) return 'Winners Semifinals';
    if (roundNumber === totalRounds - 2) return 'Winners Quarterfinals';
    return `Winners Round ${roundNumber}`;
  }
  if (section === 'losers') {
    if (roundNumber >= totalRounds) return 'Losers Final';
    if (roundNumber === totalRounds - 1 && totalRounds >= 3) return 'Losers Semifinal';
    return `Losers Round ${roundNumber}`;
  }
  return 'Championship Finals';
}

/**
 * Returns human-readable placeholder for an unassigned team slot based on authoritative feeder metadata.
 */
export function getFeederPlaceholder(match: Match, slot: 'team_a' | 'team_b', allMatches?: Match[]): string {
  if (slot === 'team_a') {
    if (match.feeder_a_label) return match.feeder_a_label;
    if (allMatches && allMatches.length > 0) {
      let up = allMatches.find(
        (m) =>
          (m.next_match_id === match.id && (m.next_match_slot === 'team_a' || (!m.next_match_slot && (m.bracket_position ?? 1) % 2 === 1))) ||
          (m.loser_next_match_id === match.id && m.loser_next_match_slot === 'team_a')
      );
      if (!up && match.bracket_round && match.bracket_round > 1) {
        const prevRound = match.bracket_round - 1;
        const targetPos = (match.bracket_position ?? 1) * 2 - 1;
        up = allMatches.find((m) => m.bracket_round === prevRound && m.bracket_position === targetPos);
      }
      if (up) {
        const isLoser = up.loser_next_match_id === match.id && up.loser_next_match_slot === 'team_a';
        const num = up.match_number ?? up.bracket_position ?? '?';
        return isLoser ? `Loser of Match #${num}` : `Winner of Match #${num}`;
      }
    }
    if (match.bracket_section === 'grand_final') return 'Winner of Winners Final (Undefeated)';
    if (match.bracket_section === 'reset_final') return 'Winner of Grand Final';
    return 'Waiting on upstream match';
  } else {
    if (match.feeder_b_label) return match.feeder_b_label;
    if (allMatches && allMatches.length > 0) {
      let up = allMatches.find(
        (m) =>
          (m.next_match_id === match.id && (m.next_match_slot === 'team_b' || (!m.next_match_slot && (m.bracket_position ?? 1) % 2 === 0))) ||
          (m.loser_next_match_id === match.id && m.loser_next_match_slot === 'team_b')
      );
      if (!up && match.bracket_round && match.bracket_round > 1) {
        const prevRound = match.bracket_round - 1;
        const targetPos = (match.bracket_position ?? 1) * 2;
        up = allMatches.find((m) => m.bracket_round === prevRound && m.bracket_position === targetPos);
      }
      if (up) {
        const isLoser = up.loser_next_match_id === match.id && up.loser_next_match_slot === 'team_b';
        const num = up.match_number ?? up.bracket_position ?? '?';
        return isLoser ? `Loser of Match #${num}` : `Winner of Match #${num}`;
      }
    }
    if (match.bracket_section === 'grand_final') return 'Winner of Losers Final';
    if (match.bracket_section === 'reset_final') return 'Loser of Grand Final (if LB won)';
    return 'Waiting on upstream match';
  }
}

/**
 * Returns advancement route details for winners and losers of a match.
 */
export function getAdvancementRoute(match: Match): {
  winnerBadge: string | null;
  loserBadge: string | null;
} {
  let winnerBadge: string | null = null;
  let loserBadge: string | null = null;

  if (match.bracket_section === 'grand_final') {
    winnerBadge = 'If WB Wins: 🏆 Champion';
    loserBadge = 'If LB Wins: 🔁 Reset Final (#15)';
  } else if (match.bracket_section === 'reset_final') {
    winnerBadge = 'Winner ➔ 🏆 Champion';
    loserBadge = 'Loser ➔ 🥈 Runner-Up';
  } else {
    if (match.winner_next_match_number) {
      winnerBadge = `Winner ➔ Match #${match.winner_next_match_number}`;
    } else if (match.next_match_id === null && match.bracket_round !== null) {
      winnerBadge = 'Winner ➔ 🏆 Champion';
    }

    if (match.loser_next_match_number) {
      loserBadge = `Loser ➔ Match #${match.loser_next_match_number}`;
    } else if (match.bracket_section === 'losers') {
      loserBadge = 'Loser ➔ ❌ Eliminated';
    }
  }

  return { winnerBadge, loserBadge };
}

/**
 * Describes the state of a Reset Final match.
 */
export function getResetFinalStatus(match: Match): {
  isResetFinal: boolean;
  status: 'not_required' | 'conditional' | 'ready' | 'completed';
  badgeLabel: string;
  badgeVariant: 'default' | 'success' | 'warning' | 'info' | 'error';
  description: string;
} {
  const isReset = (match.bracket_section === 'reset_final') || (match.label?.toLowerCase().includes('reset match') ?? false);
  if (!isReset) {
    return {
      isResetFinal: false,
      status: 'conditional',
      badgeLabel: '',
      badgeVariant: 'default',
      description: '',
    };
  }

  if (match.status === 'cancelled') {
    return {
      isResetFinal: true,
      status: 'not_required',
      badgeLabel: 'Not Required',
      badgeVariant: 'default',
      description: 'Reset Match Not Required (Winners Bracket Champion remained undefeated)',
    };
  }

  if (match.status === 'completed') {
    return {
      isResetFinal: true,
      status: 'completed',
      badgeLabel: 'Completed',
      badgeVariant: 'success',
      description: 'Reset Match Completed',
    };
  }

  if (match.team_a_id && match.team_b_id && match.status === 'pending') {
    return {
      isResetFinal: true,
      status: 'ready',
      badgeLabel: 'Active: Reset Required',
      badgeVariant: 'warning',
      description: 'Losers Bracket finalist won Grand Final! Reset match decides the tournament champion.',
    };
  }

  return {
    isResetFinal: true,
    status: 'conditional',
    badgeLabel: 'Conditional',
    badgeVariant: 'default',
    description: 'Only played if the Losers Bracket finalist wins the Grand Final',
  };
}

/**
 * Groups bracket matches by section ('winners', 'losers', 'finals'),
 * and within each section, groups them by round so stages never collide.
 */
export function groupBracketMatchesBySection(
  matches: Match[]
): Record<'winners' | 'losers' | 'finals', BracketRoundGroup[]> {
  const result: Record<'winners' | 'losers' | 'finals', BracketRoundGroup[]> = {
    winners: [],
    losers: [],
    finals: [],
  };

  if (!matches || matches.length === 0) return result;

  const sectionMatches: Record<'winners' | 'losers' | 'finals', Match[]> = {
    winners: [],
    losers: [],
    finals: [],
  };

  for (const m of matches) {
    const sec = (m.bracket_section || '').toLowerCase();
    const lbl = (m.label || '').toLowerCase();

    if (sec === 'grand_final' || sec === 'reset_final' || lbl.includes('grand final')) {
      sectionMatches.finals.push(m);
    } else if (sec === 'losers' || sec === 'consolation' || lbl.includes('losers') || lbl.includes('consolation')) {
      sectionMatches.losers.push(m);
    } else {
      sectionMatches.winners.push(m);
    }
  }

  // Group each section by round
  for (const key of ['winners', 'losers', 'finals'] as const) {
    const list = sectionMatches[key];
    const roundMap = new Map<number, Match[]>();
    for (const m of list) {
      const r = m.bracket_round ?? m.round_number ?? 1;
      const existing = roundMap.get(r) || [];
      existing.push(m);
      roundMap.set(r, existing);
    }

    const sortedRounds = Array.from(roundMap.keys()).sort((a, b) => a - b);
    const totalRounds = sortedRounds.length > 0 ? Math.max(...sortedRounds) : 1;

    result[key] = sortedRounds.map((roundNumber) => {
      const roundMatches = (roundMap.get(roundNumber) || []).sort((a, b) => {
        const posA = a.bracket_position ?? a.match_number ?? 0;
        const posB = b.bracket_position ?? b.match_number ?? 0;
        return posA - posB;
      });

      const completedCount = roundMatches.filter(
        (m) => m.status === 'completed' || m.status === 'cancelled'
      ).length;
      const totalCount = roundMatches.length;

      let roundName = '';
      if (key === 'finals') {
        roundName = roundNumber === 1 ? 'Grand Final' : 'Reset Final';
      } else {
        roundName = roundMatches[0]?.label || getSectionRoundName(key, roundNumber, totalRounds);
      }

      return {
        roundNumber,
        roundName,
        section: key,
        matches: roundMatches,
        completedCount,
        totalCount,
        isRoundComplete: totalCount > 0 && completedCount === totalCount,
      };
    });
  }

  return result;
}

/**
 * Groups bracket matches by round and sorts them by bracket_position or match_number.
 */
export function groupBracketMatchesByRound(
  matches: Match[],
  totalRoundsInput?: number
): BracketRoundGroup[] {
  if (!matches || matches.length === 0) return [];

  // Check if we have multiple sections (Double Elimination)
  const hasMultipleSections = matches.some(
    (m) =>
      m.bracket_section === 'losers' ||
      m.bracket_section === 'grand_final' ||
      m.bracket_section === 'reset_final'
  );

  if (hasMultipleSections) {
    const sectionGroups = groupBracketMatchesBySection(matches);
    const flattened: BracketRoundGroup[] = [];
    if (sectionGroups.winners.length > 0) flattened.push(...sectionGroups.winners);
    if (sectionGroups.losers.length > 0) flattened.push(...sectionGroups.losers);
    if (sectionGroups.finals.length > 0) flattened.push(...sectionGroups.finals);
    return flattened;
  }

  const roundMap = new Map<number, Match[]>();

  for (const m of matches) {
    const r = m.bracket_round ?? m.round_number ?? 1;
    const existing = roundMap.get(r) || [];
    existing.push(m);
    roundMap.set(r, existing);
  }

  const sortedRoundNumbers = Array.from(roundMap.keys()).sort((a, b) => a - b);
  const totalRounds = totalRoundsInput || (sortedRoundNumbers.length > 0 ? Math.max(...sortedRoundNumbers) : 1);

  return sortedRoundNumbers.map((roundNumber) => {
    const roundMatches = (roundMap.get(roundNumber) || []).sort((a, b) => {
      const posA = a.bracket_position ?? a.match_number ?? 0;
      const posB = b.bracket_position ?? b.match_number ?? 0;
      return posA - posB;
    });

    const completedCount = roundMatches.filter((m) => m.status === 'completed').length;
    const totalCount = roundMatches.length;

    return {
      roundNumber,
      roundName: getBracketRoundName(roundNumber, totalRounds),
      matches: roundMatches,
      completedCount,
      totalCount,
      isRoundComplete: totalCount > 0 && completedCount === totalCount,
    };
  });
}

/**
 * Computes high-level tournament progression metrics from matches and summary.
 */
export function calculateBracketProgress(
  matches: Match[],
  summary: BracketSummaryResponse | null
): BracketProgress {
  if (summary) {
    const total = summary.matches_total ?? matches.length;
    const played = summary.matches_played;
    const remaining = summary.matches_remaining;
    const percent = total > 0 ? Math.round((played / total) * 100) : 0;
    const isFinished = Boolean(summary.champion_team_id);

    return {
      totalMatches: total,
      completedMatches: played,
      remainingMatches: remaining,
      percentComplete: percent,
      isFinished,
      championName: summary.champion_team_name ?? null,
      currentRound: summary.current_round ?? null,
    };
  }

  // Fallback from raw matches if summary not yet loaded
  const realPlayable = matches.filter((m) => !isMatchBye(m) && m.status !== 'cancelled');
  const completed = realPlayable.filter((m) => m.status === 'completed');
  const pending = realPlayable.filter((m) => m.status === 'pending');
  const total = realPlayable.length;
  const percent = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  // Final match check - handles both Single Elimination and Double Elimination
  const isDoubleElimination = matches.some(
    (m) =>
      m.bracket_section === 'losers' ||
      m.bracket_section === 'grand_final' ||
      m.bracket_section === 'reset_final'
  );

  let finalMatch: Match | undefined;
  if (isDoubleElimination) {
    const resetMatch = matches.find(
      (m) => m.bracket_section === 'reset_final' || m.label?.includes('Reset Match')
    );
    const grandMatch = matches.find(
      (m) => m.bracket_section === 'grand_final' || m.label === 'Grand Final'
    );
    if (resetMatch && resetMatch.status === 'completed' && resetMatch.winner_team_id) {
      finalMatch = resetMatch;
    } else if (
      grandMatch &&
      grandMatch.status === 'completed' &&
      grandMatch.winner_team_id &&
      (!resetMatch || resetMatch.status === 'cancelled')
    ) {
      finalMatch = grandMatch;
    } else if (resetMatch && resetMatch.status === 'pending') {
      finalMatch = resetMatch;
    } else {
      finalMatch = grandMatch;
    }
  } else {
    finalMatch = matches.find((m) => m.next_match_id === null && m.bracket_round !== null);
  }

  const isFinished = finalMatch?.status === 'completed' && Boolean(finalMatch.winner_team_id);
  const championName = isFinished
    ? (finalMatch?.winner_team?.name ??
       (finalMatch?.winner_team_id === finalMatch?.team_a_id ? finalMatch?.team_a?.name : finalMatch?.team_b?.name) ??
       null)
    : null;

  return {
    totalMatches: total,
    completedMatches: completed.length,
    remainingMatches: pending.length,
    percentComplete: percent,
    isFinished: Boolean(isFinished),
    championName,
    currentRound: pending.length > 0 ? Math.min(...pending.map((m) => m.bracket_round ?? 1)) : null,
  };
}
