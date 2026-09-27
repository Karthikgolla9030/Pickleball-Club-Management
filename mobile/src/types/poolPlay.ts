/**
 * Aught2 Pickleball — Pool Play Tournament Mode Types
 *
 * Data models and configuration interfaces for Pool Play Mode:
 * Teams, Pools, Intra-pool Matchups, Standings, and Championship Bracket.
 */

export interface Player {
  id: string;
  name: string;
  rating: number; // e.g. 4.79
  avatar: string; // Initials e.g. "AM"
  color: string; // Hex color e.g. "#1E3A8A"
}

export interface Team {
  id: string;
  teamNum: number;
  name: string; // e.g. "Team 1"
  p1: Player;
  p2: Player;
  pool: string; // "A" | "B" | "C" | "D"
  avgRating: number; // (p1.rating + p2.rating) / 2
  spread: number; // Math.abs(p1.rating - p2.rating)
}

export interface PoolStat {
  key: string; // "A", "B"
  name: string;
  teamsCount: number;
  playerCount: number;
  avgTeamRating: number;
  teams: Team[];
}

export interface Match {
  id: string;
  stage: 'pool' | 'championship';
  pool?: string;
  round: string;
  t1: Team;
  t2: Team;
  court: string;
  status: 'upcoming' | 'playing' | 'completed';
  score1: number | null;
  score2: number | null;
  winner: Team | null;
}

export interface CourtConfig {
  id: string;
  name: string;
}

export type BracketType =
  | 'Single Elimination'
  | 'Single Elimination + Consolation'
  | 'Double Elimination';

export interface PoolPlayConfig {
  numPools: number; // default: 2
  numCourts: number; // default: 3
  courts: CourtConfig[];
  balanceTolerance: number; // default: 0.50 (options: 0.30, 0.50, 0.75, 1.00)
  qualifierCount: number; // default: 4 (Top 2 per pool)
  bracketType: BracketType;
  poolPlayCompleted: boolean;
}

export interface PoolStandingRow {
  rank: number;
  team: Team;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  qualifies: boolean;
}

export interface ChampionshipMatch {
  id: string;
  roundIndex: number;
  roundName: string; // e.g. "Quarterfinals", "Semifinals", "Finals", "3rd Place"
  matchNum: number;
  t1: Team | null;
  t2: Team | null;
  t1Seed?: number;
  t2Seed?: number;
  isT1Bye?: boolean;
  isT2Bye?: boolean;
  score1: number | null;
  score2: number | null;
  status: 'upcoming' | 'playing' | 'completed';
  winner: Team | null;
  court: string;
  nextMatchId?: string;
  nextMatchSlot?: 1 | 2;
  bracketSection?: 'main' | 'consolation';
}

export type PoolPlaySubTab =
  | 'teams_pools'
  | 'matchups'
  | 'standings'
  | 'championship';
