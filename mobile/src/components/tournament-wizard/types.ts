/**
 * Aught2 Pickleball — Tournament Creation Wizard Types
 *
 * Defines the state and configuration contracts for the 5-step tournament wizard.
 */

import type { TournamentFormat, TournamentVisibility } from '@/types';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface TournamentWizardState {
  // ─── Step 1: Basic Details ──────────────────────────────
  name: string;
  description: string;
  locationName: string;

  // ─── Step 3: Category & Eligibility ────────────────────
  category: string;
  skillLevelMode: 'single' | 'range';
  skillLevel: string;
  minSkillLevel: string;
  maxSkillLevel: string;
  minAge: string;
  maxAge: string;
  genderCategory: string;
  minParticipants: string;
  maxParticipants: string;
  visibility: TournamentVisibility;

  // ─── Step 3: Format & Scoring ───────────────────────────
  format: TournamentFormat;

  // Round Robin
  rrTeams: string;
  rrCourts: string;

  // Pool Play
  poolCount: string;
  teamsPerPool: string;
  qualifiersPerPool: string;
  poolCourts: string;
  poolBracketType: string;

  // Scramble
  scramblePlayers: string;
  scrambleCourts: string;
  scrambleRounds: string;
  scrambleRotationRule: string;
  scrambleLeaderboardMetric: string;

  // Bracket
  bracketType: string;
  bracketTeams: string;
  bracketCourts: string;
  bracketSeedingMethod: string;
  bracketByeRule: string;

  // ─── Step 4: Schedule & Registration ───────────────────
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  checkInTime: string; // HH:mm
  entryFee: string; // numeric string e.g. "65"
  regOpenDate: string; // YYYY-MM-DD
  regCloseDate: string; // YYYY-MM-DD
  regMethod: string;

  // ─── Step 5: Publication ───────────────────────────────
  publishImmediately: boolean;
}

export interface StepValidationResult {
  isValid: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export const CATEGORY_OPTIONS = [
  'Singles',
  "Men's Doubles",
  "Women's Doubles",
  'Mixed Doubles',
] as const;

export const SCRAMBLE_DIVISION_OPTIONS = [
  'Open Scramble',
  "Men's Scramble",
  "Women's Scramble",
  'Mixed Scramble',
] as const;

export type ScrambleDivision = (typeof SCRAMBLE_DIVISION_OPTIONS)[number];

export const SCRAMBLE_DIVISION_DESCRIPTIONS: Record<ScrambleDivision, string> = {
  'Open Scramble': 'Any eligible player can register; no gender restriction',
  "Men's Scramble": 'Men register individually; teammates rotate every match',
  "Women's Scramble": 'Women register individually; teammates rotate every match',
  'Mixed Scramble': 'Individual registrations with balanced 4-player courts forming 100% mixed-gender teams',
};

export const SKILL_LEVEL_OPTIONS = [
  '2.5',
  '3.0',
  '3.5',
  '4.0',
  '4.5',
  '5.0',
] as const;

export const GENDER_CATEGORY_OPTIONS = [
  'Any',
  'Male',
  'Female',
] as const;

export const REGISTRATION_METHOD_OPTIONS = [
  'Both (Player App + Staff)',
  'Player App Only',
  'Staff Only',
];

export const SCRAMBLE_ROTATION_OPTIONS = [
  'Full Rotation (no repeating partners)',
  'Random Balanced (min repeats)',
];

export const SCRAMBLE_LEADERBOARD_OPTIONS = [
  'Win Percentage (Wins / Played) • Avg Point Diff',
  'Total Points Scored • Differential',
];

export const BRACKET_SEEDING_OPTIONS = [
  'Team Average Rating (Highest = Seed #1)',
  'Random Seeding',
  'Manual Assignment',
];

export const BRACKET_BYE_OPTIONS = [
  'Automatic BYEs awarded to top seeds',
  'Random BYE placement',
];

export const BRACKET_TYPE_OPTIONS = [
  'Single Elimination',
  'Double Elimination',
] as const;
