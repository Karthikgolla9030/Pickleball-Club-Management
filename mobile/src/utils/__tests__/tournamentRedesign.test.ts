/**
 * Aught2 Pickleball — Tournament Redesign & Configuration Unit Tests
 *
 * Verifies:
 * 1. parseTournamentConfig extraction of entry fee, skill level, gender, age restrictions
 * 2. Proper handling of range and single skill levels
 * 3. Fallback extraction of legacy tournament description metadata
 * 4. Format-specific configuration extraction (Round Robin, Scramble, Bracket, Pool Play)
 * 5. Free fee ($0.00) vs paid fee ($55/player) vs unconfigured fee (null)
 * 6. Capacity calculations and entry/player labels
 */

import {
  parseTournamentConfig,
  calculateCapacity,
  formatAgeRestriction,
} from '../tournamentCapacity';
import type { Tournament } from '../../types';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Test failed: ${msg}`);
  }
}

export function runTournamentRedesignTests(): void {
  console.log('Running tournament redesign tests...');

  // Test 1: Entry fee extraction from format_configuration
  const tWithFee: Partial<Tournament> = {
    id: 'test-1',
    name: 'Illinois Pickleball Tournament',
    format: 'round_robin',
    status: 'completed',
    start_date: '2026-11-02T08:00:00Z',
    end_date: '2026-11-03T18:00:00Z',
    registration_open_at: '2026-10-01T00:00:00Z',
    registration_close_at: '2026-11-01T23:59:59Z',
    max_participants: 8,
    format_configuration: {
      category: 'Singles',
      skill_level_mode: 'range',
      min_skill_level: '3.5',
      max_skill_level: '4.5',
      gender_eligibility: 'Any',
      min_age: 20,
      max_age: 30,
      entry_fee: 55,
      courts_count: 3,
    },
  };

  const p1 = parseTournamentConfig(tWithFee as Tournament);
  assert(p1.entryFee === 55, 'Should parse entryFee 55 from format_configuration');
  assert(p1.entryFeeDisplay === '$55 / player', `entryFeeDisplay should be "$55 / player", got "${p1.entryFeeDisplay}"`);
  assert(p1.skillLevelDisplay === '3.5–4.5', `skillLevelDisplay should be "3.5–4.5", got "${p1.skillLevelDisplay}"`);
  assert(p1.genderEligibility === 'Any', 'genderEligibility should be "Any"');
  assert(p1.minAge === 20 && p1.maxAge === 30, 'Age range should be 20-30');
  assert(p1.ageRestrictionText === '20–30', `ageRestrictionText should be "20–30", got "${p1.ageRestrictionText}"`);
  assert(p1.isSingles === true, 'Category Singles should be isSingles = true');

  // Test 2: Legacy fallback fee and metadata extraction from description
  const tLegacy: Partial<Tournament> = {
    id: 'test-legacy',
    name: 'Bracket Championship',
    format: 'bracket',
    status: 'completed',
    description: '[Singles • Skill: 3.5–4.5 • Any • Age: 20–30 • Fee: $65/player]\n\nAnnual open tournament.',
    start_date: '2026-11-05T08:00:00Z',
    end_date: '2026-11-06T18:00:00Z',
    registration_open_at: '2026-10-01T00:00:00Z',
    registration_close_at: '2026-11-04T23:59:59Z',
    max_participants: 10,
    format_configuration: {},
  };

  const pLegacy = parseTournamentConfig(tLegacy as Tournament);
  assert(pLegacy.entryFee === 65, 'Should extract entryFee 65 from legacy description');
  assert(pLegacy.entryFeeDisplay === '$65 / player', `entryFeeDisplay should be "$65 / player", got "${pLegacy.entryFeeDisplay}"`);
  assert(pLegacy.skillLevelDisplay === '3.5–4.5', `skillLevelDisplay should be "3.5–4.5", got "${pLegacy.skillLevelDisplay}"`);

  // Test 3: Free tournament ($0 fee)
  const tFree: Partial<Tournament> = {
    id: 'test-free',
    name: 'Community Open Scramble',
    format: 'scramble',
    status: 'registration_open',
    max_participants: 16,
    format_configuration: {
      category: 'Open Scramble',
      skill_level: '3.0',
      entry_fee: 0,
    },
  };

  const pFree = parseTournamentConfig(tFree as Tournament);
  assert(pFree.entryFee === 0, 'entryFee should be 0');
  assert(pFree.entryFeeDisplay === 'Free ($0.00)', `Free entry fee display should be "Free ($0.00)", got "${pFree.entryFeeDisplay}"`);

  // Test 4: Unconfigured fee (null)
  const tNoFee: Partial<Tournament> = {
    id: 'test-no-fee',
    name: 'Club Friendly Round Robin',
    format: 'round_robin',
    status: 'draft',
    max_participants: 8,
    format_configuration: {
      category: "Men's Doubles",
      skill_level: '4.0',
    },
  };

  const pNoFee = parseTournamentConfig(tNoFee as Tournament);
  assert(pNoFee.entryFee === null, 'entryFee should be null when not configured');
  assert(pNoFee.entryFeeDisplay === null, 'entryFeeDisplay should be null when not configured');
  assert(pNoFee.isSingles === false, "Men's Doubles should not be isSingles");
  assert(pNoFee.teamSize === 2, "Men's Doubles teamSize should be 2");

  // Test 5: Scramble capacity and labels
  const capScramble = calculateCapacity('Open Scramble', 16, 'scramble');
  assert(capScramble.entryLabel === 'Players', 'Scramble entries should be labeled Players');
  assert(capScramble.teamSize === 1, 'Scramble team size should be 1');
  assert(capScramble.playerCount === 16, '16 scramble entries = 16 players');

  // Test 6: Doubles capacity and labels
  const capDoubles = calculateCapacity("Mixed Doubles", 8, 'round_robin');
  assert(capDoubles.entryLabel === 'Teams', 'Doubles entries should be labeled Teams');
  assert(capDoubles.teamSize === 2, 'Doubles team size should be 2');
  assert(capDoubles.playerCount === 16, '8 doubles teams = 16 players');

  // Test 7: Age restriction formatting
  assert(formatAgeRestriction(18, 65) === '18–65', 'Age 18 to 65 formatted as 18–65');
  assert(formatAgeRestriction(50, null) === '50+', 'Age 50+ formatted as 50+');
  assert(formatAgeRestriction(null, 18) === 'Under 18', 'Under 18 formatted correctly');
  assert(formatAgeRestriction(null, null) === 'None', 'No age restriction returns None');

  console.log('All tournament redesign tests passed successfully!');
}

runTournamentRedesignTests();
