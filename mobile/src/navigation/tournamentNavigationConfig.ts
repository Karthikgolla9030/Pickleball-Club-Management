/**
 * Aught2 Pickleball — Tournament Navigation Configuration
 *
 * Centralized navigation resolver that dynamically generates tournament
 * management pages based on:
 *   1. tournament_format ('bracket' | 'scramble' | 'round_robin' | 'pool_play')
 *   2. competition_category ('singles' vs 'doubles' / teamSize 1 vs 2)
 *
 * Strict specification mappings:
 *   - Bracket + Singles    → Overview, Players, Bracket, Matches, Standings, Results, Settings
 *   - Bracket + Doubles    → Overview, Teams, Bracket, Matches, Standings, Results, Settings
 *   - Scramble             → Overview, Players, Rounds, Standings, Results, Settings
 *   - Round Robin + Singles → Overview, Players, Matchups, Standings, Results, Settings
 *   - Round Robin + Doubles → Overview, Teams, Matchups, Standings, Results, Settings
 *   - Pool Play + Singles   → Overview, Players & Pools, Matchups, Standings, Championship Bracket, Setup & Courts, Results, Settings
 *   - Pool Play + Doubles   → Overview, Teams & Pools, Matchups, Standings, Championship Bracket, Setup & Courts, Results, Settings
 */

import type { Tournament, TournamentFormat } from '../types';
import { parseTournamentConfig } from '../utils/tournamentCapacity';

export type TournamentTabKey =
  | 'overview'
  | 'participants' // displays as 'Players' | 'Teams' | 'Players & Pools' | 'Teams & Pools'
  | 'bracket'
  | 'matches'
  | 'rounds'
  | 'matchups'
  | 'standings'
  | 'championship'
  | 'setup_courts'
  | 'results'
  | 'settings';

export interface TournamentNavTabItem {
  id: TournamentTabKey;
  label: string;
  iconName: 'LayoutDashboard' | 'Users' | 'GitFork' | 'Swords' | 'Layers' | 'Award' | 'Trophy' | 'SlidersHorizontal' | 'CheckCircle2' | 'Settings';
  badge?: number | string;
  isCompetitionTab?: boolean;
}

export interface TournamentCounts {
  participantsCount?: number;
  teamsCount?: number;
  matchesCount?: number;
  roundsCount?: number;
  poolsCount?: number;
}

/**
 * Normalizes tournament format to a recognized enum string.
 * Defaults to 'bracket' if missing or unrecognized.
 */
export function normalizeTournamentFormat(format?: string | null): TournamentFormat {
  if (!format) return 'bracket';
  const clean = format.toLowerCase().trim();
  if (clean.includes('scramble')) return 'scramble';
  if (clean.includes('round_robin') || clean.includes('round robin') || clean.includes('roundrobin')) return 'round_robin';
  if (clean.includes('pool_play') || clean.includes('pool play') || clean.includes('poolplay')) return 'pool_play';
  return 'bracket';
}

/**
 * Checks whether a tournament is a singles competition.
 * Scramble is always player-based.
 */
export function isSinglesTournament(tournament?: Tournament | null): boolean {
  if (!tournament) return false;
  const format = normalizeTournamentFormat(tournament.format);
  if (format === 'scramble') return true;

  const config = parseTournamentConfig(tournament);
  if (config.teamSize > 1) return false;
  if (config.teamSize === 1) return true;
  return config.isSingles;
}

/**
 * Returns the exact list of standardized tabs for a tournament based on
 * tournament_format and competition_category.
 */
export function getTournamentNavigationTabs(
  tournament?: Tournament | null,
  counts?: TournamentCounts
): TournamentNavTabItem[] {
  if (!tournament) {
    return [
      { id: 'overview', label: 'Overview', iconName: 'LayoutDashboard' },
      { id: 'participants', label: 'Participants', iconName: 'Users' },
      { id: 'settings', label: 'Settings', iconName: 'Settings' },
    ];
  }

  const format = normalizeTournamentFormat(tournament.format);
  const isSingles = isSinglesTournament(tournament);

  switch (format) {
    // ─── A. BRACKET TOURNAMENT ──────────────────────────────────────────────
    case 'bracket':
      return [
        { id: 'overview', label: 'Overview', iconName: 'LayoutDashboard' },
        {
          id: 'participants',
          label: isSingles ? 'Players' : 'Teams',
          iconName: 'Users',
          badge: isSingles ? counts?.participantsCount : counts?.teamsCount,
        },
        { id: 'bracket', label: 'Bracket', iconName: 'GitFork', isCompetitionTab: true },
        {
          id: 'matches',
          label: 'Matches',
          iconName: 'Swords',
          badge: counts?.matchesCount,
          isCompetitionTab: true,
        },
        { id: 'standings', label: 'Standings', iconName: 'Award' },
        { id: 'results', label: 'Results', iconName: 'Trophy' },
        { id: 'settings', label: 'Settings', iconName: 'Settings' },
      ];

    // ─── B. SCRAMBLE TOURNAMENT ─────────────────────────────────────────────
    case 'scramble':
      return [
        { id: 'overview', label: 'Overview', iconName: 'LayoutDashboard' },
        {
          id: 'participants',
          label: 'Players',
          iconName: 'Users',
          badge: counts?.participantsCount,
        },
        {
          id: 'rounds',
          label: 'Rounds',
          iconName: 'Layers',
          badge: counts?.roundsCount,
          isCompetitionTab: true,
        },
        { id: 'standings', label: 'Standings', iconName: 'Award' },
        { id: 'results', label: 'Results', iconName: 'Trophy' },
        { id: 'settings', label: 'Settings', iconName: 'Settings' },
      ];

    // ─── C. ROUND ROBIN TOURNAMENT ──────────────────────────────────────────
    case 'round_robin':
      return [
        { id: 'overview', label: 'Overview', iconName: 'LayoutDashboard' },
        {
          id: 'participants',
          label: isSingles ? 'Players' : 'Teams',
          iconName: 'Users',
          badge: isSingles ? counts?.participantsCount : counts?.teamsCount,
        },
        {
          id: 'matchups',
          label: 'Matchups',
          iconName: 'Swords',
          badge: counts?.matchesCount,
          isCompetitionTab: true,
        },
        { id: 'standings', label: 'Standings', iconName: 'Award' },
        { id: 'results', label: 'Results', iconName: 'Trophy' },
        { id: 'settings', label: 'Settings', iconName: 'Settings' },
      ];

    // ─── D. POOL PLAY TOURNAMENT ────────────────────────────────────────────
    case 'pool_play':
      return [
        { id: 'overview', label: 'Overview', iconName: 'LayoutDashboard' },
        {
          id: 'participants',
          label: isSingles ? 'Players & Pools' : 'Teams & Pools',
          iconName: 'Users',
          badge: isSingles ? counts?.participantsCount : counts?.teamsCount,
        },
        {
          id: 'matchups',
          label: 'Matchups',
          iconName: 'Swords',
          badge: counts?.matchesCount,
          isCompetitionTab: true,
        },
        { id: 'standings', label: 'Standings', iconName: 'Award' },
        {
          id: 'championship',
          label: 'Championship Bracket',
          iconName: 'Trophy',
          isCompetitionTab: true,
        },
        {
          id: 'setup_courts',
          label: 'Setup & Courts',
          iconName: 'SlidersHorizontal',
          badge: counts?.poolsCount ? `${counts.poolsCount} Pools` : undefined,
        },
        { id: 'results', label: 'Results', iconName: 'CheckCircle2' },
        { id: 'settings', label: 'Settings', iconName: 'Settings' },
      ];

    default:
      return [
        { id: 'overview', label: 'Overview', iconName: 'LayoutDashboard' },
        { id: 'participants', label: isSingles ? 'Players' : 'Teams', iconName: 'Users' },
        { id: 'standings', label: 'Standings', iconName: 'Award' },
        { id: 'results', label: 'Results', iconName: 'Trophy' },
        { id: 'settings', label: 'Settings', iconName: 'Settings' },
      ];
  }
}

/**
 * Returns human-readable format label.
 */
export function getFormatDisplayLabel(format?: string | null): string {
  const norm = normalizeTournamentFormat(format);
  switch (norm) {
    case 'bracket':
      return 'Bracket';
    case 'scramble':
      return 'Scramble';
    case 'round_robin':
      return 'Round Robin';
    case 'pool_play':
      return 'Pool Play';
    default:
      return 'Tournament';
  }
}
