/**
 * Aught2 Pickleball — Tournament Capacity & Configuration Engine
 *
 * Centralized single source of truth for:
 * - Competition categories (Singles, Men's Doubles, Women's Doubles, Mixed Doubles)
 * - Skill levels (2.5, 3.0, 3.5, 4.0, 4.5, 5.0)
 * - Gender eligibility (Any, Male, Female)
 * - Capacity, team size, entry & player count calculations
 * - Age restriction formatting and validation
 * - Tournament metadata parsing from format_configuration or description
 */

import type { Tournament } from '../types';

export const COMPETITION_CATEGORIES = [
  'Singles',
  "Men's Doubles",
  "Women's Doubles",
  'Mixed Doubles',
] as const;

export type CompetitionCategory = (typeof COMPETITION_CATEGORIES)[number];

export const SKILL_LEVEL_OPTIONS = [
  '2.5',
  '3.0',
  '3.5',
  '4.0',
  '4.5',
  '5.0',
] as const;

export type SkillLevel = (typeof SKILL_LEVEL_OPTIONS)[number];

export const GENDER_ELIGIBILITY_OPTIONS = [
  'Any',
  'Male',
  'Female',
] as const;

export type GenderEligibility = (typeof GENDER_ELIGIBILITY_OPTIONS)[number];

export interface CapacityInfo {
  category: string;
  format?: string;
  isSingles: boolean;
  registrationType: 'individual' | 'team';
  teamSize: number;
  entryCount: number;
  playerCount: number;
  entryLabel: string; // 'Players' or 'Teams'
  entrySingularLabel: string; // 'Player' or 'Team'
  inputLabel: string; // 'Number of Players *' or 'Number of Teams *'
  minInputLabel: string; // 'Min Players *' or 'Min Teams *'
  helperText: string; // '8 players' or '8 teams • 16 players'
  structureLabel: string; // '1 player per team' or '2 players per team' or 'Individual players (rotating partners)'
  reviewTeamsText: string; // '8 one-player entries' or '8 teams'
  reviewPlayersText: string; // '8 players' or '16 players'
}

export const SCRAMBLE_DIVISIONS = [
  'Open Scramble',
  "Men's Scramble",
  "Women's Scramble",
  'Mixed Scramble',
] as const;

export type ScrambleDivision = (typeof SCRAMBLE_DIVISIONS)[number];

export function isScrambleDivision(category?: string | null): boolean {
  if (!category) return false;
  return (
    category === 'Open Scramble' ||
    category === "Men's Scramble" ||
    category === "Women's Scramble" ||
    category === 'Mixed Scramble' ||
    category.toLowerCase().includes('scramble')
  );
}

/**
 * Checks whether a competition category represents singles (1-player entries).
 */
export function isSinglesCategory(category?: string | null): boolean {
  if (!category) return false;
  const normalized = category.trim().toLowerCase();
  return normalized === 'singles' || normalized.includes('singles');
}

/**
 * Returns registration type based on format and category.
 * Scramble and Singles are always individual.
 * Other formats with doubles are team-based.
 */
export function getRegistrationType(
  format?: string | null,
  category?: string | null
): 'individual' | 'team' {
  if (format === 'scramble' || isScrambleDivision(category)) return 'individual';
  if (isSinglesCategory(category)) return 'individual';
  return 'team';
}

/**
 * Returns the required number of players per team/entry for a given category.
 * For Scramble, each entry is 1 individual player.
 * For other formats: Singles = 1, Doubles = 2.
 */
export function getTeamSize(category?: string | null, format?: string | null): number {
  if (format === 'scramble' || isScrambleDivision(category)) return 1;
  return isSinglesCategory(category) ? 1 : 2;
}

/**
 * Calculates all capacity, entry, player count, labels, and helper strings
 * from the category, count input, and format.
 */
export function calculateCapacity(
  category: string = 'Singles',
  countInput: number | string = 8,
  format?: string | null
): CapacityInfo {
  const parsedCount = typeof countInput === 'string' ? parseInt(countInput, 10) : countInput;
  const entryCount = isNaN(parsedCount) || parsedCount < 0 ? 0 : parsedCount;
  const isScramble = format === 'scramble' || isScrambleDivision(category);
  const isSingles = isSinglesCategory(category) || isScramble;
  const registrationType = getRegistrationType(format, category);
  const teamSize = getTeamSize(category, format);
  const playerCount = entryCount * teamSize;

  if (isScramble) {
    return {
      category,
      format: 'scramble',
      isSingles: true,
      registrationType: 'individual',
      teamSize: 1,
      entryCount,
      playerCount: entryCount,
      entryLabel: 'Players',
      entrySingularLabel: 'Player',
      inputLabel: 'Maximum Players *',
      minInputLabel: 'Minimum Players *',
      helperText: `${entryCount} individual player${entryCount === 1 ? '' : 's'}`,
      structureLabel: 'Individual players (rotating partners)',
      reviewTeamsText: 'N/A (Individual)',
      reviewPlayersText: `${entryCount} player${entryCount === 1 ? '' : 's'}`,
    };
  }

  if (isSingles) {
    return {
      category,
      format: format || undefined,
      isSingles: true,
      registrationType: 'individual',
      teamSize: 1,
      entryCount,
      playerCount,
      entryLabel: 'Players',
      entrySingularLabel: 'Player',
      inputLabel: 'Number of Players *',
      minInputLabel: 'Min Players *',
      helperText: `${entryCount} player${entryCount === 1 ? '' : 's'}`,
      structureLabel: '1 player per team',
      reviewTeamsText: `${entryCount} one-player entr${entryCount === 1 ? 'y' : 'ies'}`,
      reviewPlayersText: `${entryCount} player${entryCount === 1 ? '' : 's'}`,
    };
  }

  return {
    category,
    format: format || undefined,
    isSingles: false,
    registrationType: 'team',
    teamSize: 2,
    entryCount,
    playerCount,
    entryLabel: 'Teams',
    entrySingularLabel: 'Team',
    inputLabel: 'Number of Teams *',
    minInputLabel: 'Min Teams *',
    helperText: `${entryCount} team${entryCount === 1 ? '' : 's'} • ${playerCount} player${playerCount === 1 ? '' : 's'}`,
    structureLabel: '2 players per team',
    reviewTeamsText: `${entryCount} team${entryCount === 1 ? '' : 's'}`,
    reviewPlayersText: `${playerCount} player${playerCount === 1 ? '' : 's'}`,
  };
}

/**
 * Format minimum and maximum age into a clean human-readable restriction string.
 */
export function formatAgeRestriction(
  minAge?: number | string | null,
  maxAge?: number | string | null
): string {
  const min = minAge !== undefined && minAge !== null && minAge !== '' ? Number(minAge) : null;
  const max = maxAge !== undefined && maxAge !== null && maxAge !== '' ? Number(maxAge) : null;

  if (min !== null && !isNaN(min) && max !== null && !isNaN(max)) {
    return `${min}–${max}`;
  }
  if (min !== null && !isNaN(min)) {
    return `${min}+`;
  }
  if (max !== null && !isNaN(max)) {
    return `Under ${max}`;
  }
  return 'None';
}

export interface ParsedTournamentConfig {
  category: string;
  skillLevelMode: 'single' | 'range';
  skillLevel: string;
  minSkillLevel: string;
  maxSkillLevel: string;
  skillLevelDisplay: string;
  genderEligibility: string;
  minAge: number | null;
  maxAge: number | null;
  ageRestrictionText: string;
  teamSize: number;
  isSingles: boolean;
  capacity: CapacityInfo;
  targetScore: number;
  winBy: number;
  rulesSummary: string;
}

/**
 * Parse tournament metadata from tournament.format_configuration or tournament.description.
 * Provides resilient fallbacks for older tournaments.
 */
export function parseTournamentConfig(
  tournament?: Partial<Tournament> | null
): ParsedTournamentConfig {
  if (!tournament) {
    const defaultCap = calculateCapacity('Singles', 8);
    return {
      category: 'Singles',
      skillLevelMode: 'single',
      skillLevel: '3.5',
      minSkillLevel: '3.5',
      maxSkillLevel: '3.5',
      skillLevelDisplay: '3.5',
      genderEligibility: 'Any',
      minAge: null,
      maxAge: null,
      ageRestrictionText: 'None',
      teamSize: 1,
      isSingles: true,
      capacity: defaultCap,
      targetScore: 11,
      winBy: 2,
      rulesSummary: 'To 11 pts (win by 2)',
    };
  }

  const formatConfig = (tournament.format_configuration || {}) as Record<string, unknown>;

  // Extract category: prioritize competition_category, then format_configuration, then name, then description
  let category = (
    tournament.competition_category ||
    formatConfig.category ||
    formatConfig.competition_category
  ) as string | undefined;

  if (!category && tournament.name) {
    for (const cat of [...SCRAMBLE_DIVISIONS, ...COMPETITION_CATEGORIES]) {
      if (tournament.name.toLowerCase().includes(cat.toLowerCase())) {
        category = cat;
        break;
      }
    }
  }

  if (!category && tournament.description) {
    for (const cat of [...SCRAMBLE_DIVISIONS, ...COMPETITION_CATEGORIES]) {
      if (tournament.description.toLowerCase().includes(cat.toLowerCase())) {
        category = cat;
        break;
      }
    }
  }

  if (!category) {
    category = tournament.format === 'scramble' ? 'Open Scramble' : 'Singles';
  }

  const isScramble = tournament.format === 'scramble' || isScrambleDivision(category);
  const isSingles = isSinglesCategory(category) || isScramble;
  const teamSize = isScramble ? 1 : formatConfig.team_size ? Number(formatConfig.team_size) : isSingles ? 1 : 2;

  // Extract skill level and range
  const rawMode = formatConfig.skill_level_mode as string | undefined;
  let minSkillLevel = (formatConfig.min_skill_level as string | undefined)?.trim();
  let maxSkillLevel = (formatConfig.max_skill_level as string | undefined)?.trim();
  let skillLevel = (formatConfig.skill_level || (tournament as any)?.skill_level) as string | undefined;

  let skillLevelMode: 'single' | 'range' = 'single';
  if (rawMode === 'range' || rawMode === 'RANGE') {
    skillLevelMode = 'range';
  } else if (!rawMode && minSkillLevel && maxSkillLevel && minSkillLevel !== maxSkillLevel) {
    skillLevelMode = 'range';
  } else if (!rawMode && skillLevel && (skillLevel.includes('-') || skillLevel.includes('–'))) {
    skillLevelMode = 'range';
  }

  if (skillLevelMode === 'range') {
    if (!minSkillLevel || !maxSkillLevel) {
      if (skillLevel && (skillLevel.includes('-') || skillLevel.includes('–'))) {
        const parts = skillLevel.replace('–', '-').split('-');
        minSkillLevel = minSkillLevel || parts[0]?.trim();
        maxSkillLevel = maxSkillLevel || parts[1]?.trim();
      }
    }
    minSkillLevel = minSkillLevel || '3.5';
    maxSkillLevel = maxSkillLevel || '4.5';
    skillLevel = `${minSkillLevel}-${maxSkillLevel}`;
  } else {
    // Single level
    if (!skillLevel && minSkillLevel) {
      skillLevel = minSkillLevel;
    }
    if (!skillLevel && tournament.description) {
      for (const lvl of SKILL_LEVEL_OPTIONS) {
        if (tournament.description.includes(lvl)) {
          skillLevel = lvl;
          break;
        }
      }
    }
    if (!skillLevel && tournament.name) {
      for (const lvl of SKILL_LEVEL_OPTIONS) {
        if (tournament.name.includes(lvl)) {
          skillLevel = lvl;
          break;
        }
      }
    }
    if (!skillLevel) {
      skillLevel = '3.5';
    }
    minSkillLevel = skillLevel;
    maxSkillLevel = skillLevel;
  }

  const skillLevelDisplay = skillLevelMode === 'range'
    ? `${minSkillLevel}–${maxSkillLevel}`
    : skillLevel;

  // Extract gender eligibility
  let genderEligibility = formatConfig.gender_eligibility as string | undefined;
  if (!genderEligibility && tournament.description) {
    for (const gen of GENDER_ELIGIBILITY_OPTIONS) {
      if (tournament.description.toLowerCase().includes(gen.toLowerCase())) {
        genderEligibility = gen;
        break;
      }
    }
  }
  if (!genderEligibility) {
    genderEligibility = 'Any';
  }

  // Extract age
  const minAge = formatConfig.min_age !== undefined && formatConfig.min_age !== null
    ? Number(formatConfig.min_age)
    : null;
  const maxAge = formatConfig.max_age !== undefined && formatConfig.max_age !== null
    ? Number(formatConfig.max_age)
    : null;
  const ageRestrictionText = formatAgeRestriction(minAge, maxAge);

  const entryCount = tournament.max_participants ?? 8;
  const capacity = calculateCapacity(category, entryCount, tournament.format);

  // Scoring rules
  const scoringRules = tournament.scoring_rules || (formatConfig.scoring_rules as any);
  const targetScore = scoringRules?.target_score ?? (formatConfig.points_to_win ? Number(formatConfig.points_to_win) : 11);
  const winBy = scoringRules?.win_by ?? (formatConfig.win_by ? Number(formatConfig.win_by) : 2);
  const rulesSummary = `To ${targetScore} pts (win by ${winBy})`;

  return {
    category,
    skillLevelMode,
    skillLevel,
    minSkillLevel,
    maxSkillLevel,
    skillLevelDisplay,
    genderEligibility,
    minAge,
    maxAge,
    ageRestrictionText,
    teamSize,
    isSingles,
    capacity,
    targetScore,
    winBy,
    rulesSummary,
  };
}
