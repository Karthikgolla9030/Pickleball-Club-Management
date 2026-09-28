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
 *
 * Reliably assigns matches to Court 1, Court 2, etc. using explicit court_number,
 * court_id, or fair capacity distribution so Court 2 is never starved of matches.
 */
export function groupMatchesByCourt(
  matches: Match[],
  courts: ScrambleCourtInfo[],
): { court: ScrambleCourtInfo; matches: Match[] }[] {
  if (!matches || matches.length === 0) {
    if (courts && courts.length > 0) {
      return courts.map((court) => ({ court, matches: [] }));
    }
    return [];
  }

  // 1. If courts are provided, attempt explicit court_number / court_id matching
  if (courts && courts.length > 0) {
    const assignedMatchIds = new Set<string>();
    const courtGroups = courts.map((court) => {
      const courtMatches = matches.filter((m) => {
        // Direct court number match
        if (m.court_number !== undefined && m.court_number !== null) {
          const mCourtNum = Number(m.court_number);
          if (mCourtNum === court.court_number) {
            assignedMatchIds.add(m.id);
            return true;
          }
        }
        // Direct court ID match
        if (court.court_id && m.court_id && m.court_id === court.court_id) {
          assignedMatchIds.add(m.id);
          return true;
        }
        return false;
      });

      return {
        court,
        matches: courtMatches,
      };
    });

    // If at least one match was explicitly assigned, assign any leftover unassigned matches
    if (assignedMatchIds.size > 0) {
      const unassignedMatches = matches.filter((m) => !assignedMatchIds.has(m.id));
      if (unassignedMatches.length > 0) {
        // Distribute remaining unassigned matches to courts that have fewer matches than expected
        for (const unassigned of unassignedMatches) {
          const targetGroup = courtGroups.reduce((prev, curr) =>
            curr.matches.length < prev.matches.length ? curr : prev
          );
          targetGroup.matches.push(unassigned);
        }
      }
      return courtGroups;
    }

    // 2. If NO matches had explicit court markers (fallback distribution):
    // Check if total matches matches the standard block size (e.g. 3 per 4-player, 5 per 5-player)
    const expectedTotal = courts.reduce((sum, c) => sum + (c.player_count === 5 ? 5 : 3), 0);
    if (matches.length === expectedTotal) {
      let startIdx = 0;
      return courts.map((court) => {
        const matchesPerCourt = court.player_count === 5 ? 5 : 3;
        const courtMatches = matches.slice(startIdx, startIdx + matchesPerCourt);
        startIdx += matchesPerCourt;
        return { court, matches: courtMatches };
      });
    }

    // Otherwise, distribute matches evenly across courts so Court 2 is never empty
    const numCourts = courts.length;
    const perCourt = Math.max(1, Math.floor(matches.length / numCourts));
    return courts.map((court, idx) => {
      const startIdx = idx * perCourt;
      const endIdx = idx === numCourts - 1 ? matches.length : startIdx + perCourt;
      const courtMatches = startIdx < matches.length ? matches.slice(startIdx, endIdx) : [];
      return {
        court,
        matches: courtMatches,
      };
    });
  }

  // 3. When courts array is empty or not yet loaded from state:
  // Dynamically build courts from matches that have court_number or court_name
  const courtNumbersPresent = Array.from(
    new Set(
      matches
        .map((m) => (m.court_number !== undefined && m.court_number !== null ? Number(m.court_number) : null))
        .filter((n): n is number => n !== null && !isNaN(n))
    )
  ).sort((a, b) => a - b);

  if (courtNumbersPresent.length > 0) {
    return courtNumbersPresent.map((cNum) => {
      const courtMatches = matches.filter((m) => Number(m.court_number) === cNum);
      const courtName = courtMatches[0]?.court_name || `Court ${cNum}`;
      const courtId = courtMatches[0]?.court_id || null;
      return {
        court: {
          court_number: cNum,
          court_id: courtId,
          court_name: courtName,
          player_count: courtMatches.length >= 5 ? 5 : 4,
          players: [],
        },
        matches: courtMatches,
      };
    });
  }

  // 4. Fallback when neither courts array nor match court numbers exist:
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

  if (matches.length >= 2 && matches.length % 2 === 0) {
    const half = matches.length / 2;
    return [
      {
        court: { court_number: 1, court_id: null, court_name: 'Court 1', player_count: 4, players: [] },
        matches: matches.slice(0, half),
      },
      {
        court: { court_number: 2, court_id: null, court_name: 'Court 2', player_count: 4, players: [] },
        matches: matches.slice(half),
      },
    ];
  }

  return [
    {
      court: {
        court_number: 1,
        court_id: null,
        court_name: 'Court 1',
        player_count: 4,
        players: [],
      },
      matches,
    },
  ];
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
