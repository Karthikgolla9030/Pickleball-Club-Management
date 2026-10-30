/**
 * Aught2 Pickleball — TournamentConfigurationCard Component
 *
 * Displays the complete, saved configuration of a tournament inside
 * the Tournament Management page's Overview tab:
 *
 * Core saved fields:
 * - Tournament Format (Singles / Doubles / Rotating Scramble / Bracket / Pool Play / Round Robin)
 * - Skill Level (Configured rating range or single level)
 * - Gender Eligibility (Configured eligibility, e.g. Any, Male, Female, Mixed)
 * - Age Group (Configured age restriction range or None)
 * - Entry Fee (Actual fee per player/team with currency)
 * - Scoring Format (Existing scoring rules: target score, win by)
 * - Tournament Dates (Start and end dates)
 * - Registration Deadline (Actual configured deadline, if available)
 * - Capacity (Actual player/team capacity registered vs max)
 *
 * Format-specific configuration rows:
 * - Scramble: Rotation rule, Planned rounds, Courts assigned, Leaderboard metric
 * - Bracket: Bracket type (Single/Double Elimination), Seeding method, Byes, Courts assigned
 * - Pool Play: Pool structure, Advancement rule, Championship bracket, Courts assigned
 * - Round Robin: Scheduling engine (Berger tables), Courts assigned
 *
 * Only displays fields applicable and configured for that tournament.
 * Uses clean information rows with consistent labels and values.
 */

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SlidersHorizontal } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export interface ExtraConfigField {
  label: string;
  value: string | number | null | undefined;
}

export interface TournamentConfigurationCardProps {
  tournament: Tournament;
  title?: string;
  style?: StyleProp<ViewStyle>;
  extraFields?: ExtraConfigField[];
  // Format-specific contextual values that may come from component states:
  plannedRounds?: number;
  byesCount?: number;
  bracketSize?: number;
  poolCount?: number;
  teamsPerPool?: number;
  qualifiersPerPool?: number;
  courtCount?: number;
}

function formatTournamentDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function formatTournamentDateRange(startStr?: string | null, endStr?: string | null): string {
  if (!startStr) return '';
  const startFmt = formatTournamentDate(startStr);
  if (!endStr || startStr === endStr) return startFmt;
  const endFmt = formatTournamentDate(endStr);
  return `${startFmt} – ${endFmt}`;
}

function formatTournamentDeadline(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const dateFormatted = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    const minuteStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    // If exact midnight, show date only; else show time
    if (hours === 0 && minutes === 0) {
      return dateFormatted;
    }
    return `${dateFormatted}, ${hour12}:${minuteStr} ${ampm}`;
  } catch {
    return dateStr;
  }
}

export function TournamentConfigurationCard({
  tournament,
  title = 'Tournament Configuration',
  style,
  extraFields,
  plannedRounds: plannedRoundsProp,
  byesCount: byesCountProp,
  poolCount: poolCountProp,
  teamsPerPool: teamsPerPoolProp,
  qualifiersPerPool: qualifiersPerPoolProp,
  courtCount: courtCountProp,
}: TournamentConfigurationCardProps) {
  const parsed = parseTournamentConfig(tournament);
  const fc = (tournament.format_configuration || {}) as Record<string, any>;
  const formatKey = String(tournament.format || '').toLowerCase();

  // ─── 1. Determine Format Label ──────────────────────────────────────────────
  let formatDisplay = '';
  if (formatKey.includes('scramble')) {
    formatDisplay = `Rotating Scramble • ${parsed.category || 'Open'}`;
  } else if (formatKey.includes('bracket')) {
    const bType = fc.bracket_type || fc.bracket_format || 'Single Elimination';
    const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
    formatDisplay = `${bType} • ${pStructure}`;
  } else if (formatKey.includes('pool')) {
    const pStructure = parsed.isSingles ? 'Singles' : 'Doubles';
    formatDisplay = `Pool Play • ${pStructure}`;
  } else if (formatKey.includes('round_robin') || formatKey.includes('round robin')) {
    const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
    formatDisplay = `Round Robin • ${pStructure}`;
  } else {
    formatDisplay = `${tournament.format_label || 'Tournament'} • ${parsed.category}`;
  }

  // ─── 2. Age Group ───────────────────────────────────────────────────────────
  let ageDisplay = '';
  if (parsed.minAge && parsed.maxAge) {
    ageDisplay = `${parsed.minAge}–${parsed.maxAge} years`;
  } else if (parsed.minAge && !parsed.maxAge) {
    ageDisplay = `${parsed.minAge}+ years`;
  } else if (!parsed.minAge && parsed.maxAge) {
    ageDisplay = `Under ${parsed.maxAge} years`;
  } else if (parsed.ageRestrictionText && parsed.ageRestrictionText !== 'None') {
    ageDisplay = parsed.ageRestrictionText.includes('year')
      ? parsed.ageRestrictionText
      : `${parsed.ageRestrictionText} years`;
  }

  // ─── 3. Dates & Deadline ────────────────────────────────────────────────────
  const datesDisplay = formatTournamentDateRange(tournament.start_date, tournament.end_date);
  const deadlineDisplay = formatTournamentDeadline(tournament.registration_close_at);

  // ─── 4. Capacity ────────────────────────────────────────────────────────────
  const count = tournament.teams_count ?? tournament.participant_count ?? 0;
  let capacityDisplay = '';
  if (tournament.max_participants) {
    const entrySingular = parsed.capacity?.entrySingularLabel || 'Entry';
    const entryPlural = parsed.capacity?.entryLabel || 'Entries';
    const label = tournament.max_participants === 1 ? entrySingular : entryPlural;
    const minStr = tournament.min_participants ? ` (Min: ${tournament.min_participants})` : '';
    capacityDisplay = `${count} / ${tournament.max_participants} ${label.toLowerCase()} registered${minStr}`;
  } else if (tournament.min_participants) {
    capacityDisplay = `Minimum ${tournament.min_participants} ${parsed.capacity?.entryLabel?.toLowerCase() || 'participants'}`;
  }

  // ─── 5. Scoring Format ──────────────────────────────────────────────────────
  const scoringRules = (tournament.scoring_rules || {}) as Record<string, any>;
  const targetScore = scoringRules.target_score ?? parsed.targetScore ?? 11;
  const winBy = scoringRules.win_by ?? parsed.winBy ?? 2;
  const scoringDisplay = `First to ${targetScore} (win by ${winBy})`;

  // ─── 6. Format-Specific Attributes ──────────────────────────────────────────
  const formatRows: { label: string; value: string }[] = [];

  // Scramble specifics
  if (formatKey.includes('scramble')) {
    const rounds = plannedRoundsProp ?? fc.planned_rounds ?? fc.rounds;
    if (rounds) {
      formatRows.push({ label: 'Planned Rounds', value: `${rounds} rounds` });
    }
    formatRows.push({
      label: 'Rotation Rule',
      value: fc.rotation_rule || 'Individual rotation (new partner every round)',
    });
    if (fc.leaderboard_metric) {
      formatRows.push({ label: 'Leaderboard Metric', value: String(fc.leaderboard_metric) });
    }
  }

  // Bracket specifics
  if (formatKey.includes('bracket')) {
    const bType = fc.bracket_type || fc.bracket_format;
    if (bType) {
      formatRows.push({ label: 'Bracket Type', value: String(bType) });
    }
    const seeding = fc.seeding_method || 'Deterministic Power-of-Two Seeding';
    formatRows.push({ label: 'Seeding Method', value: String(seeding) });
    const byes = byesCountProp ?? fc.byes_count;
    if (typeof byes === 'number' && byes > 0) {
      formatRows.push({ label: 'First-Round Byes', value: `${byes} team${byes > 1 ? 's' : ''}` });
    }
  }

  // Pool Play specifics
  if (formatKey.includes('pool')) {
    const pools = poolCountProp ?? fc.pool_count ?? fc.number_of_pools;
    const teamsPool = teamsPerPoolProp ?? fc.teams_per_pool;
    if (pools) {
      const detail = teamsPool ? ` (${teamsPool} per pool)` : '';
      formatRows.push({ label: 'Pools Configured', value: `${pools} pools${detail}` });
    }
    const qualifiers = qualifiersPerPoolProp ?? fc.qualifiers_per_pool;
    if (qualifiers) {
      formatRows.push({
        label: 'Advancement Rule',
        value: `Top ${qualifiers} per pool advance to Championship`,
      });
    }
    if (fc.bracket_type) {
      formatRows.push({ label: 'Championship Bracket', value: String(fc.bracket_type) });
    }
  }

  // Round Robin specifics
  if (formatKey.includes('round_robin') || formatKey.includes('round robin')) {
    formatRows.push({
      label: 'Scheduling Engine',
      value: 'Round-Robin Berger Tables (All-play-all)',
    });
  }

  // Courts assigned across any format
  const courts = courtCountProp ?? fc.courts_count ?? fc.court_count;
  if (courts) {
    formatRows.push({ label: 'Courts Assigned', value: `${courts} courts` });
  }

  // ─── 7. Assemble Ordered Information Rows ───────────────────────────────────
  const rows: { label: string; value: string }[] = [];

  // 1. Tournament Format
  if (formatDisplay) {
    rows.push({ label: 'Tournament Format', value: formatDisplay });
  }

  // 2. Skill Level
  if (parsed.skillLevelDisplay) {
    rows.push({ label: 'Skill Level', value: parsed.skillLevelDisplay });
  }

  // 3. Gender Eligibility
  if (parsed.genderEligibility) {
    rows.push({ label: 'Gender Eligibility', value: parsed.genderEligibility });
  }

  // 4. Age Group
  if (ageDisplay) {
    rows.push({ label: 'Age Group', value: ageDisplay });
  }

  // 5. Entry Fee
  if (parsed.entryFeeDisplay) {
    rows.push({ label: 'Entry Fee', value: parsed.entryFeeDisplay });
  }

  // 6. Scoring Format
  if (scoringDisplay) {
    rows.push({ label: 'Scoring Format', value: scoringDisplay });
  }

  // 7. Tournament Dates
  if (datesDisplay) {
    rows.push({ label: 'Tournament Dates', value: datesDisplay });
  }

  // 8. Registration Deadline
  if (deadlineDisplay) {
    rows.push({ label: 'Registration Deadline', value: deadlineDisplay });
  }

  // 9. Capacity
  if (capacityDisplay) {
    rows.push({ label: 'Capacity', value: capacityDisplay });
  }

  // 10. Format-Specific rows
  formatRows.forEach((r) => rows.push(r));

  // 11. Extra custom fields passed from callers
  if (extraFields && extraFields.length > 0) {
    extraFields.forEach((ef) => {
      if (ef.value !== null && ef.value !== undefined && String(ef.value).trim() !== '') {
        rows.push({ label: ef.label, value: String(ef.value) });
      }
    });
  }

  if (rows.length === 0) return null;

  return (
    <Card style={[styles.card, style]}>
      {/* Section Header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerIconWrap}>
          <SlidersHorizontal size={17} color="#087A60" />
        </View>
        <AppText style={styles.cardHeaderTitle}>{title}</AppText>
      </View>

      {/* Structured Clean Information Rows */}
      <View style={styles.infoList}>
        {rows.map((row, index) => (
          <React.Fragment key={`${row.label}-${index}`}>
            {index > 0 && <View style={styles.divider} />}
            <View style={styles.infoRow}>
              <AppText style={styles.infoLabel}>{row.label}</AppText>
              <AppText style={styles.infoVal} numberOfLines={2}>
                {row.value}
              </AppText>
            </View>
          </React.Fragment>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoList: {
    gap: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 0,
  },
  infoVal: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
});

