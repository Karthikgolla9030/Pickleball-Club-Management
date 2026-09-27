/**
 * Aught2 Pickleball — Pool Play Domain & Mathematical Engine
 *
 * Implements:
 * 1. Live team & pool calculations (Team Avg, Spread, Pool Avg, Diff, Tolerance)
 * 2. Snake-draft auto-balancing across N pools
 * 3. Intra-pool Round Robin matchup generator (n*(n-1)/2 per pool)
 * 4. Pickleball score validation (>= 11, win by 2, no ties)
 * 5. Standings calculation with strict tiebreaker hierarchy (Wins -> Diff -> Pts For)
 * 6. Championship knockout bracket generation with automatic BYE allocation
 * 7. Interactive winner progression engine
 * 8. Auto-play simulation for testing
 */

import type {
  BracketType,
  ChampionshipMatch,
  CourtConfig,
  Match,
  Player,
  PoolPlayConfig,
  PoolStat,
  PoolStandingRow,
  Team,
} from '@/types/poolPlay';

const POOL_KEYS = ['A', 'B', 'C', 'D'];

export const DEFAULT_COURTS: CourtConfig[] = [
  { id: 'c1', name: 'Center Court' },
  { id: 'c2', name: 'Court A' },
  { id: 'c3', name: 'Court B' },
];

export const TOLERANCE_OPTIONS = [
  { value: 0.3, label: '±0.30 Strict' },
  { value: 0.5, label: '±0.50 Fair (Default)' },
  { value: 0.75, label: '±0.75 Relaxed' },
  { value: 1.0, label: '±1.00 Wide' },
];

// ─── A. Live Calculations (recalculateStats) ──────────────────────────────────

export function recalculateStats(
  teams: Team[],
  config: PoolPlayConfig
): {
  updatedTeams: Team[];
  pools: PoolStat[];
  poolDiff: number;
  isWithinTolerance: boolean;
} {
  // Update team stats
  const updatedTeams: Team[] = teams.map((t) => {
    const avgRating = Number(((t.p1.rating + t.p2.rating) / 2).toFixed(2));
    const spread = Number(Math.abs(t.p1.rating - t.p2.rating).toFixed(2));
    return {
      ...t,
      avgRating,
      spread,
    };
  });

  // Group teams by pool
  const pools: PoolStat[] = [];
  const numPools = Math.min(config.numPools, POOL_KEYS.length);

  for (let i = 0; i < numPools; i++) {
    const key = POOL_KEYS[i];
    const poolTeams = updatedTeams.filter((t) => t.pool === key);
    const teamsCount = poolTeams.length;
    const playerCount = teamsCount * 2;
    const sumAvg = poolTeams.reduce((acc, t) => acc + t.avgRating, 0);
    const avgTeamRating = teamsCount > 0 ? Number((sumAvg / teamsCount).toFixed(2)) : 0;

    pools.push({
      key,
      name: `Pool ${key}`,
      teamsCount,
      playerCount,
      avgTeamRating,
      teams: poolTeams,
    });
  }

  // Calculate pool difference
  let poolDiff = 0;
  if (pools.length >= 2) {
    const avgs = pools.map((p) => p.avgTeamRating);
    const maxAvg = Math.max(...avgs);
    const minAvg = Math.min(...avgs);
    poolDiff = Number((maxAvg - minAvg).toFixed(2));
  }

  const isWithinTolerance = poolDiff <= config.balanceTolerance;

  return {
    updatedTeams,
    pools,
    poolDiff,
    isWithinTolerance,
  };
}

// ─── B. Auto-Balance Algorithm (balancePools) ─────────────────────────────────

export function balancePools(teams: Team[], numPools: number): Team[] {
  if (teams.length === 0) return [];
  const safePoolCount = Math.max(2, Math.min(numPools, POOL_KEYS.length));

  // Sort teams descending by avgRating
  const sorted = [...teams].sort((a, b) => b.avgRating - a.avgRating);

  // Snake draft sequence across pools
  // For 2 pools: 0, 1, 1, 0, 0, 1, 1, 0 ...
  // For N pools: 0..N-1, then N-1..0 ...
  const poolAssignments: string[] = [];
  let forward = true;
  let idx = 0;

  for (let i = 0; i < sorted.length; i++) {
    poolAssignments.push(POOL_KEYS[idx]);
    if (forward) {
      if (idx === safePoolCount - 1) {
        forward = false;
      } else {
        idx++;
      }
    } else {
      if (idx === 0) {
        forward = true;
      } else {
        idx--;
      }
    }
  }

  return sorted.map((team, i) => ({
    ...team,
    pool: poolAssignments[i],
  }));
}

// ─── C. Intra-Pool Round-Robin Matchups (createMatchups) ──────────────────────

export function createMatchups(pools: PoolStat[], courts: CourtConfig[]): Match[] {
  const matches: Match[] = [];
  let matchCounter = 1;
  const courtList = courts.length > 0 ? courts : DEFAULT_COURTS;
  let courtIndex = 0;

  for (const pool of pools) {
    const poolTeams = pool.teams;
    const n = poolTeams.length;
    if (n < 2) continue;

    let roundCounter = 1;
    // Every team plays every other team in its pool: n*(n-1)/2
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        matches.push({
          id: `PPM-${matchCounter}`,
          stage: 'pool',
          pool: pool.key,
          round: `Round ${roundCounter}`,
          t1: poolTeams[i],
          t2: poolTeams[j],
          court: courtList[courtIndex % courtList.length].name,
          status: 'upcoming',
          score1: null,
          score2: null,
          winner: null,
        });
        courtIndex++;
        matchCounter++;
        roundCounter++;
      }
    }
  }

  return matches;
}

// ─── D. Pickleball Score Validation Rules ─────────────────────────────────────

export function validatePickleballScore(
  score1: number,
  score2: number
): { isValid: boolean; error?: string } {
  if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
    return { isValid: false, error: 'Scores must be non-negative numbers.' };
  }

  if (score1 === score2) {
    return { isValid: false, error: 'Ties are not allowed in Pickleball.' };
  }

  const winningScore = Math.max(score1, score2);
  const losingScore = Math.min(score1, score2);

  if (winningScore < 11) {
    return {
      isValid: false,
      error: `Winning score must be at least 11 points (currently ${winningScore}).`,
    };
  }

  if (winningScore - losingScore < 2) {
    return {
      isValid: false,
      error: `Winner must lead by at least 2 points (margin is ${winningScore - losingScore}).`,
    };
  }

  return { isValid: true };
}

// ─── E. Standings & Tie-Breaking Hierarchy ───────────────────────────────────

export function calculatePoolStandings(
  pools: PoolStat[],
  matches: Match[],
  qualifierCountPerPool: number = 2
): Record<string, PoolStandingRow[]> {
  const standingsByPool: Record<string, PoolStandingRow[]> = {};

  for (const pool of pools) {
    const statsMap: Record<
      string,
      {
        team: Team;
        played: number;
        won: number;
        lost: number;
        pointsFor: number;
        pointsAgainst: number;
      }
    > = {};

    for (const team of pool.teams) {
      statsMap[team.id] = {
        team,
        played: 0,
        won: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      };
    }

    // Process matches
    const allPoolMatches = matches.filter((m) => m.pool === pool.key);
    const completedPoolMatches = allPoolMatches.filter((m) => m.status === 'completed');
    const isPoolComplete =
      allPoolMatches.length > 0 && completedPoolMatches.length === allPoolMatches.length;

    for (const m of completedPoolMatches) {
      if (m.score1 === null || m.score2 === null) continue;
      const s1 = statsMap[m.t1.id];
      const s2 = statsMap[m.t2.id];

      if (s1 && s2) {
        s1.played += 1;
        s2.played += 1;
        s1.pointsFor += m.score1;
        s1.pointsAgainst += m.score2;
        s2.pointsFor += m.score2;
        s2.pointsAgainst += m.score1;

        if (m.score1 > m.score2) {
          s1.won += 1;
          s2.lost += 1;
        } else if (m.score2 > m.score1) {
          s2.won += 1;
          s1.lost += 1;
        }
      }
    }

    // Convert to array and sort by tiebreaker hierarchy:
    // 1. Wins (DESC)
    // 2. Point Differential (DESC)
    // 3. Points For (DESC)
    // 4. Team Name (ASC deterministic fallback)
    const rows: PoolStandingRow[] = Object.values(statsMap).map((item) => {
      const differential = item.pointsFor - item.pointsAgainst;
      return {
        rank: 0,
        team: item.team,
        played: item.played,
        won: item.won,
        lost: item.lost,
        pointsFor: item.pointsFor,
        pointsAgainst: item.pointsAgainst,
        differential,
        qualifies: false,
      };
    });

    rows.sort((a, b) => {
      if (b.won !== a.won) return b.won - a.won;
      if (b.differential !== a.differential) return b.differential - a.differential;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.team.name.localeCompare(b.team.name);
    });

    // Assign rank and qualifiers.
    // Teams are ONLY marked as qualified if all required pool matches are completed.
    rows.forEach((row, idx) => {
      row.rank = idx + 1;
      row.qualifies = isPoolComplete && idx < qualifierCountPerPool;
    });

    standingsByPool[pool.key] = rows;
  }

  return standingsByPool;
}

// ─── F. Championship Bracket & BYE Engine ─────────────────────────────────────

export function generateChampionshipBracket(
  standingsByPool: Record<string, PoolStandingRow[]>,
  qualifierCount: number,
  bracketType: BracketType,
  courts: CourtConfig[]
): ChampionshipMatch[] {
  const courtList = courts.length > 0 ? courts : DEFAULT_COURTS;

  // Collect qualified teams in cross-pool seeding order
  // Seed #1: Best #1 team, Seed #2: Other pool's #1 team, Seed #3: Best #2 team, Seed #4: Other #2 team
  const poolKeys = Object.keys(standingsByPool).sort();
  const qualifiedTeams: { team: Team; seed: number; poolOrigin: string }[] = [];

  const maxRank = Math.max(1, Math.ceil(qualifierCount / Math.max(1, poolKeys.length)));

  let seedCounter = 1;
  for (let rank = 1; rank <= maxRank; rank++) {
    // Collect all teams of this rank across pools and sort by wins / diff
    const rankTeams: { team: Team; row: PoolStandingRow; pool: string }[] = [];
    for (const p of poolKeys) {
      const row = standingsByPool[p]?.find((r) => r.rank === rank && r.qualifies);
      if (row) {
        rankTeams.push({ team: row.team, row, pool: p });
      }
    }

    rankTeams.sort((a, b) => {
      if (b.row.won !== a.row.won) return b.row.won - a.row.won;
      return b.row.differential - a.row.differential;
    });

    for (const item of rankTeams) {
      if (qualifiedTeams.length < qualifierCount) {
        qualifiedTeams.push({
          team: item.team,
          seed: seedCounter++,
          poolOrigin: item.pool,
        });
      }
    }
  }

  const actualQualifiers = qualifiedTeams.length;
  if (actualQualifiers < 2) return [];

  // Bracket size is next power of 2: 4, 8, 16...
  let bracketSize = 2;
  while (bracketSize < actualQualifiers) {
    bracketSize *= 2;
  }
  if (bracketSize < 4) bracketSize = 4;

  const matches: ChampionshipMatch[] = [];

  if (bracketSize === 4) {
    // 4-team bracket: 2 Semifinals, 1 Final, optional 3rd Place
    // SF1: Seed 1 vs Seed 4 (or Pool B #2)
    // SF2: Seed 2 vs Seed 3 (or Pool A #2)
    const t1 = qualifiedTeams.find((t) => t.seed === 1)?.team ?? null;
    const t2 = qualifiedTeams.find((t) => t.seed === 4)?.team ?? null;
    const t3 = qualifiedTeams.find((t) => t.seed === 2)?.team ?? null;
    const t4 = qualifiedTeams.find((t) => t.seed === 3)?.team ?? null;

    matches.push({
      id: 'CB-SF1',
      roundIndex: 1,
      roundName: 'Semifinals',
      matchNum: 1,
      t1,
      t2,
      t1Seed: 1,
      t2Seed: 4,
      score1: null,
      score2: null,
      status: 'upcoming',
      winner: null,
      court: courtList[0]?.name ?? 'Center Court',
      nextMatchId: 'CB-FINALS',
      nextMatchSlot: 1,
      bracketSection: 'main',
    });

    matches.push({
      id: 'CB-SF2',
      roundIndex: 1,
      roundName: 'Semifinals',
      matchNum: 2,
      t1: t3,
      t2: t4,
      t1Seed: 2,
      t2Seed: 3,
      score1: null,
      score2: null,
      status: 'upcoming',
      winner: null,
      court: courtList[1]?.name ?? 'Court A',
      nextMatchId: 'CB-FINALS',
      nextMatchSlot: 2,
      bracketSection: 'main',
    });

    // Championship Finals
    matches.push({
      id: 'CB-FINALS',
      roundIndex: 2,
      roundName: 'Finals',
      matchNum: 1,
      t1: null,
      t2: null,
      score1: null,
      score2: null,
      status: 'upcoming',
      winner: null,
      court: courtList[0]?.name ?? 'Center Court',
      bracketSection: 'main',
    });

    // Consolation 3rd Place Match if enabled
    if (bracketType.includes('Consolation')) {
      matches.push({
        id: 'CB-3RD',
        roundIndex: 2,
        roundName: '3rd Place',
        matchNum: 2,
        t1: null,
        t2: null,
        score1: null,
        score2: null,
        status: 'upcoming',
        winner: null,
        court: courtList[1]?.name ?? 'Court A',
        bracketSection: 'consolation',
      });
    }
  } else if (bracketSize === 8) {
    // 8-team bracket: 4 QFs, 2 SFs, 1 Final
    // Automatic BYEs for top seeds if actualQualifiers < 8
    const seedPairs = [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ];

    seedPairs.forEach((pair, idx) => {
      const s1 = pair[0];
      const s2 = pair[1];
      const team1 = qualifiedTeams.find((t) => t.seed === s1)?.team ?? null;
      const team2 = qualifiedTeams.find((t) => t.seed === s2)?.team ?? null;
      const isT2Bye = !team2 && s2 > actualQualifiers;

      const matchId = `CB-QF${idx + 1}`;
      const nextMatchId = idx < 2 ? 'CB-SF1' : 'CB-SF2';
      const nextMatchSlot = (idx % 2 === 0 ? 1 : 2) as 1 | 2;

      matches.push({
        id: matchId,
        roundIndex: 1,
        roundName: 'Quarterfinals',
        matchNum: idx + 1,
        t1: team1,
        t2: isT2Bye ? null : team2,
        t1Seed: s1,
        t2Seed: s2,
        isT2Bye,
        score1: isT2Bye ? 11 : null,
        score2: isT2Bye ? 0 : null,
        status: isT2Bye ? 'completed' : 'upcoming',
        winner: isT2Bye ? team1 : null,
        court: courtList[idx % courtList.length]?.name ?? 'Court 1',
        nextMatchId,
        nextMatchSlot,
        bracketSection: 'main',
      });
    });

    // SF 1 & SF 2
    matches.push({
      id: 'CB-SF1',
      roundIndex: 2,
      roundName: 'Semifinals',
      matchNum: 1,
      t1: matches.find((m) => m.id === 'CB-QF1')?.winner ?? null,
      t2: matches.find((m) => m.id === 'CB-QF2')?.winner ?? null,
      score1: null,
      score2: null,
      status: 'upcoming',
      winner: null,
      court: courtList[0]?.name ?? 'Center Court',
      nextMatchId: 'CB-FINALS',
      nextMatchSlot: 1,
      bracketSection: 'main',
    });

    matches.push({
      id: 'CB-SF2',
      roundIndex: 2,
      roundName: 'Semifinals',
      matchNum: 2,
      t1: matches.find((m) => m.id === 'CB-QF3')?.winner ?? null,
      t2: matches.find((m) => m.id === 'CB-QF4')?.winner ?? null,
      score1: null,
      score2: null,
      status: 'upcoming',
      winner: null,
      court: courtList[1]?.name ?? 'Court A',
      nextMatchId: 'CB-FINALS',
      nextMatchSlot: 2,
      bracketSection: 'main',
    });

    // Finals
    matches.push({
      id: 'CB-FINALS',
      roundIndex: 3,
      roundName: 'Finals',
      matchNum: 1,
      t1: null,
      t2: null,
      score1: null,
      score2: null,
      status: 'upcoming',
      winner: null,
      court: courtList[0]?.name ?? 'Center Court',
      bracketSection: 'main',
    });
  }

  return matches;
}

// ─── G. Winner Progression Engine ─────────────────────────────────────────────

export function advanceBracketWinner(
  matches: ChampionshipMatch[],
  matchId: string,
  score1: number,
  score2: number
): ChampionshipMatch[] {
  const matchIndex = matches.findIndex((m) => m.id === matchId);
  if (matchIndex === -1) return matches;

  const currentMatch = matches[matchIndex];
  if (!currentMatch.t1 || !currentMatch.t2) return matches;

  const winner = score1 > score2 ? currentMatch.t1 : currentMatch.t2;
  const loser = score1 > score2 ? currentMatch.t2 : currentMatch.t1;

  const updatedMatches = [...matches];
  updatedMatches[matchIndex] = {
    ...currentMatch,
    score1,
    score2,
    status: 'completed',
    winner,
  };

  // Advance winner to next match
  if (currentMatch.nextMatchId && currentMatch.nextMatchSlot) {
    const nextIdx = updatedMatches.findIndex((m) => m.id === currentMatch.nextMatchId);
    if (nextIdx !== -1) {
      const nextMatch = updatedMatches[nextIdx];
      updatedMatches[nextIdx] = {
        ...nextMatch,
        t1: currentMatch.nextMatchSlot === 1 ? winner : nextMatch.t1,
        t2: currentMatch.nextMatchSlot === 2 ? winner : nextMatch.t2,
      };
    }
  }

  // If this was a semifinal and there's a 3rd place consolation match, place loser
  if (currentMatch.roundName === 'Semifinals') {
    const thirdIdx = updatedMatches.findIndex((m) => m.id === 'CB-3RD');
    if (thirdIdx !== -1) {
      const thirdMatch = updatedMatches[thirdIdx];
      const slot = currentMatch.matchNum === 1 ? 1 : 2;
      updatedMatches[thirdIdx] = {
        ...thirdMatch,
        t1: slot === 1 ? loser : thirdMatch.t1,
        t2: slot === 2 ? loser : thirdMatch.t2,
      };
    }
  }

  return updatedMatches;
}

// ─── H. Auto-Play Simulation (for testing) ───────────────────────────────────

export function simulateAutoPlay(matches: Match[]): Match[] {
  const realisticScores = [
    [11, 7],
    [11, 9],
    [12, 10],
    [11, 8],
    [11, 5],
    [13, 11],
    [8, 11],
    [9, 11],
    [6, 11],
  ];

  return matches.map((match, idx) => {
    if (match.status === 'completed') return match;

    const pair = realisticScores[idx % realisticScores.length];
    const score1 = pair[0];
    const score2 = pair[1];
    const winner = score1 > score2 ? match.t1 : match.t2;

    return {
      ...match,
      score1,
      score2,
      status: 'completed',
      winner,
    };
  });
}

// ─── I. Starter Demo Roster ──────────────────────────────────────────────────

export function createDemoTeams(): Team[] {
  const demoPlayers: Player[] = [
    { id: 'p1', name: 'Alex Morgan', rating: 4.85, avatar: 'AM', color: '#1E3A8A' },
    { id: 'p2', name: 'Brad Cooper', rating: 4.25, avatar: 'BC', color: '#047857' },
    { id: 'p3', name: 'Chloe Davis', rating: 4.70, avatar: 'CD', color: '#B45309' },
    { id: 'p4', name: 'Derek Evans', rating: 4.10, avatar: 'DE', color: '#6D28D9' },
    { id: 'p5', name: 'Elena Fisher', rating: 4.55, avatar: 'EF', color: '#BE123C' },
    { id: 'p6', name: 'Felix Garcia', rating: 4.05, avatar: 'FG', color: '#0F766E' },
    { id: 'p7', name: 'Grace Hall', rating: 4.40, avatar: 'GH', color: '#4338CA' },
    { id: 'p8', name: 'Henry Jones', rating: 3.90, avatar: 'HJ', color: '#C2410C' },
    { id: 'p9', name: 'Iris Kim', rating: 4.35, avatar: 'IK', color: '#15803D' },
    { id: 'p10', name: 'Jack Lopez', rating: 3.80, avatar: 'JL', color: '#7E22CE' },
    { id: 'p11', name: 'Karen Miller', rating: 4.15, avatar: 'KM', color: '#0369A1' },
    { id: 'p12', name: 'Liam Nelson', rating: 3.75, avatar: 'LN', color: '#A16207' },
    { id: 'p13', name: 'Maya Ortiz', rating: 4.60, avatar: 'MO', color: '#4D7C0F' },
    { id: 'p14', name: 'Noah Perez', rating: 3.95, avatar: 'NP', color: '#991B1B' },
    { id: 'p15', name: 'Olivia Quinn', rating: 4.20, avatar: 'OQ', color: '#374151' },
    { id: 'p16', name: 'Parker Ross', rating: 3.70, avatar: 'PR', color: '#1D4ED8' },
  ];

  const teams: Team[] = [];
  for (let i = 0; i < demoPlayers.length; i += 2) {
    const p1 = demoPlayers[i];
    const p2 = demoPlayers[i + 1];
    const teamNum = i / 2 + 1;
    const avgRating = Number(((p1.rating + p2.rating) / 2).toFixed(2));
    const spread = Number(Math.abs(p1.rating - p2.rating).toFixed(2));
    // Initial draft: alternate between Pool A and Pool B
    const pool = teamNum % 2 === 1 ? 'A' : 'B';

    teams.push({
      id: `team-${teamNum}`,
      teamNum,
      name: `Team ${teamNum}`,
      p1,
      p2,
      pool,
      avgRating,
      spread,
    });
  }

  return teams;
}
