/**
 * Aught2 Pickleball — Scramble Tournament Logic & Partition Utilities
 *
 * Client-side utilities for Scramble tournament calculations,
 * deterministic court partitioning validation, scoring rules,
 * and display helpers.
 */

import type {
  Match,
  MatchParticipant,
  CourtPartition,
  ScrambleCourtInfo,
  ScrambleRoundStatus,
  ScrambleScoreValidation,
} from '../types';

/**
 * Deterministically partition player count N into c4 courts of 4 and c5 courts of 5:
 *   N = 4 * c4 + 5 * c5  (c4, c5 >= 0)
 * Minimizes total courts, and when equal, maximizes 4-player courts.
 */
export function validateCourtPartition(playerCount: number, isMixed = false): CourtPartition {
  if (!playerCount || playerCount < 4) {
    return {
      c4: 0,
      c5: 0,
      totalCourts: 0,
      isValid: false,
      description: playerCount === 0
        ? 'No players selected'
        : `${playerCount} player${playerCount === 1 ? '' : 's'} is not enough (minimum 4 players needed)`,
    };
  }

  if (isMixed) {
    if (playerCount % 4 !== 0) {
      return {
        c4: 0,
        c5: 0,
        totalCourts: 0,
        isValid: false,
        description: `${playerCount} players cannot be divided into balanced 4-player mixed courts (2 men + 2 women). Player count must be a multiple of 4 (e.g. 4, 8, 12, 16, 20).`,
      };
    }
    const c4 = playerCount / 4;
    return {
      c4,
      c5: 0,
      totalCourts: c4,
      isValid: true,
      description: `${c4} Balanced Mixed Court${c4 > 1 ? 's' : ''} of 4 (${playerCount} Players)`,
    };
  }

  // Find non-negative integers (c4, c5) satisfying 4 * c4 + 5 * c5 == playerCount
  let bestC4 = -1;
  let bestC5 = -1;
  let minTotalCourts = Infinity;

  const maxC5 = Math.floor(playerCount / 5);
  for (let c5 = 0; c5 <= maxC5; c5++) {
    const rem = playerCount - 5 * c5;
    if (rem % 4 === 0) {
      const c4 = rem / 4;
      const total = c4 + c5;
      if (total < minTotalCourts || (total === minTotalCourts && c4 > bestC4)) {
        minTotalCourts = total;
        bestC4 = c4;
        bestC5 = c5;
      }
    }
  }

  if (bestC4 === -1) {
    return {
      c4: 0,
      c5: 0,
      totalCourts: 0,
      isValid: false,
      description: `${playerCount} players cannot be divided into courts of 4 or 5. Valid counts: 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18...`,
    };
  }

  const parts: string[] = [];
  if (bestC4 > 0) {
    parts.push(`${bestC4} Court${bestC4 > 1 ? 's' : ''} of 4`);
  }
  if (bestC5 > 0) {
    parts.push(`${bestC5} Court${bestC5 > 1 ? 's' : ''} of 5`);
  }

  return {
    c4: bestC4,
    c5: bestC5,
    totalCourts: bestC4 + bestC5,
    isValid: true,
    description: `${parts.join(' + ')} (${playerCount} Players)`,
  };
}

/**
 * Single-game pickleball score validation:
 * - First to 11 win by 2
 * - No ties
 * - Non-negative integers
 */
export function validateScrambleScore(
  scoreA: number,
  scoreB: number,
  targetPoints = 11,
  winBy = 2,
): ScrambleScoreValidation {
  if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
    return { isValid: false, errorMessage: 'Scores must be non-negative integers' };
  }

  if (scoreA === scoreB) {
    return { isValid: false, errorMessage: 'Pickleball games cannot end in a tie' };
  }

  const winnerScore = Math.max(scoreA, scoreB);
  const loserScore = Math.min(scoreA, scoreB);
  const margin = winnerScore - loserScore;

  if (winnerScore < targetPoints) {
    return {
      isValid: false,
      errorMessage: `Winner must reach at least ${targetPoints} points`,
    };
  }

  if (margin < winBy) {
    return {
      isValid: false,
      errorMessage: `Winner must lead by at least ${winBy} point${winBy > 1 ? 's' : ''}`,
    };
  }

  if (winnerScore > targetPoints && margin > winBy) {
    return {
      isValid: false,
      errorMessage: `Scores above ${targetPoints} must win by exactly ${winBy} points (e.g. 12-10, 13-11)`,
    };
  }

  return {
    isValid: true,
    winnerSide: scoreA > scoreB ? 'side_a' : 'side_b',
    margin,
  };
}

/**
 * Group round matches by their court.
 */
export function groupMatchesByCourt(
  matches: Match[],
  courts: ScrambleCourtInfo[],
): { court: ScrambleCourtInfo; matches: Match[] }[] {
  if (!courts || courts.length === 0) {
    if (matches.length === 6) {
      return [
        {
          court: { court_number: 1, court_id: null, court_name: 'Court 1', player_count: 4, players: [] },
          matches: matches.slice(0, 3),
        },
        {
          court: { court_number: 2, court_id: null, court_name: 'Court 2', player_count: 4, players: [] },
          matches: matches.slice(3, 6),
        },
      ];
    }
    if (matches.length === 10) {
      return [
        {
          court: { court_number: 1, court_id: null, court_name: 'Court 1', player_count: 5, players: [] },
          matches: matches.slice(0, 5),
        },
        {
          court: { court_number: 2, court_id: null, court_name: 'Court 2', player_count: 5, players: [] },
          matches: matches.slice(5, 10),
        },
      ];
    }
    return [{
      court: {
        court_number: 1,
        court_id: null,
        court_name: 'Court 1',
        player_count: 4,
        players: [],
      },
      matches,
    }];
  }

  return courts.map((court, idx) => {
    // Each 4-player court has 3 matches, 5-player has 5 matches
    const matchesPerCourt = court.player_count === 5 ? 5 : 3;
    let courtMatches = matches.filter(
      (m) => court.court_id && m.court_id === court.court_id,
    );

    if (courtMatches.length === 0) {
      let startIdx = 0;
      for (let i = 0; i < idx; i++) {
        startIdx += courts[i].player_count === 5 ? 5 : 3;
      }
      courtMatches = matches.slice(startIdx, startIdx + matchesPerCourt);
    }

    return {
      court,
      matches: courtMatches,
    };
  });
}

/**
 * Extract the sit-out participant from a match if present.
 */
export function getSitOutParticipant(match: Match): MatchParticipant | null {
  if (match.sit_out_participant) {
    return match.sit_out_participant;
  }
  const allParticipants = [
    ...(match.side_a_participants || []),
    ...(match.side_b_participants || []),
  ];
  return allParticipants.find((p) => p.side === 'sit_out') || null;
}

/**
 * Format participant names as "Alice & Bob".
 */
export function formatPartnerNames(participants?: MatchParticipant[]): string {
  if (!participants || participants.length === 0) {
    return 'TBD';
  }
  return participants
    .map((p) => p.display_name || 'Player')
    .join(' & ');
}

/**
 * Round status badge display properties.
 */
export function getScrambleRoundStatusBadge(status: ScrambleRoundStatus): {
  label: string;
  variant: 'warning' | 'info' | 'success' | 'default';
} {
  switch (status) {
    case 'setup':
      return { label: 'Setup (Check Availability)', variant: 'warning' };
    case 'matchups_created':
      return { label: 'Matchups Ready', variant: 'info' };
    case 'in_progress':
      return { label: 'Round In Progress', variant: 'info' };
    case 'completed':
      return { label: 'Round Completed', variant: 'success' };
    default:
      return { label: status, variant: 'info' };
  }
}
