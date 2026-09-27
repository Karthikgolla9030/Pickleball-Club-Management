/**
 * Aught2 Pickleball — ReviewSummary
 *
 * Renders the structured tournament review table matching Step 5 specification:
 * - Tournament Name & Venue
 * - Date Range
 * - Competition Format (highlighted)
 * - Category, Skill Level, Gender, Age
 * - Registration Type & Participant Capacity (format-dependent)
 * - For Scramble:
 *     - "Individual Player Registration"
 *     - "Partners rotate automatically during each round."
 *     - "4-player court: 3 games per group."
 *     - "5-player court: 5 games per group."
 * - Match Scoring & Tiebreaker rules
 * - Entry Fee & Registration status
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import { TOURNAMENT_FORMAT_LABELS } from '@/types';
import {
  calculateCapacity,
  formatAgeRestriction,
  getRegistrationType,
} from '@/utils/tournamentCapacity';
import type { TournamentWizardState } from '../types';

interface ReviewSummaryProps {
  state: TournamentWizardState;
  clubName?: string;
}

interface SummaryRowProps {
  label: string;
  value: string;
  isFormat?: boolean;
}

function SummaryRow({ label, value, isFormat }: SummaryRowProps) {
  return (
    <View style={styles.row}>
      <AppText variant="bodySmall" color="tertiary" style={styles.labelCol}>
        {label}:
      </AppText>
      <AppText
        variant="bodySmall"
        bold
        style={[styles.valueCol, isFormat && styles.formatValue]}
        numberOfLines={2}
      >
        {value}
      </AppText>
    </View>
  );
}

export function ReviewSummary({ state, clubName }: ReviewSummaryProps) {
  const isScramble = state.format === 'scramble';
  const cap = calculateCapacity(state.category, state.maxParticipants, state.format);
  const regType = getRegistrationType(state.format, state.category);
  const ageDisplay = formatAgeRestriction(state.minAge, state.maxAge);

  const feeText =
    state.entryFee && parseFloat(state.entryFee) > 0
      ? `$${state.entryFee} / player`
      : 'Free entry';

  const dateRangeText =
    state.startDate && state.endDate
      ? `${state.startDate} to ${state.endDate}`
      : state.startDate || 'Unscheduled';

  const venueText = state.locationName || clubName || 'Main Courts';

  // Format-specific details text
  let formatDetails = '';
  if (state.format === 'round_robin') {
    formatDetails = `${state.rrCourts || '3'} active courts`;
  } else if (state.format === 'pool_play') {
    formatDetails = `${state.poolCount || '2'} pools • ${state.teamsPerPool || '4'} teams/pool • Top ${state.qualifiersPerPool || '2'} advance • ${state.poolCourts || '4'} courts`;
  } else if (state.format === 'scramble') {
    formatDetails = `${state.scrambleCourts || '4'} courts • ${state.scrambleRounds || '5'} planned rounds • ${state.scrambleRotationRule}`;
  } else if (state.format === 'bracket') {
    formatDetails = `${state.bracketType || 'Single Elimination'} • ${state.bracketCourts || '3'} courts • ${state.bracketSeedingMethod}`;
  }

  return (
    <Card style={styles.card}>
      <SummaryRow label="Tournament" value={state.name || 'Untitled Tournament'} />
      <SummaryRow label="Date" value={dateRangeText} />
      <SummaryRow label="Venue" value={venueText} />

      {/* Format */}
      <SummaryRow label="Format" value={TOURNAMENT_FORMAT_LABELS[state.format]} isFormat />
      {formatDetails ? <SummaryRow label="Format Setup" value={formatDetails} /> : null}

      {/* Category / Division & Eligibility */}
      <SummaryRow
        label={isScramble ? 'Division' : 'Category'}
        value={state.category || (isScramble ? 'Open Scramble' : 'Singles')}
      />
      {state.skillLevelMode === 'range' ? (
        <SummaryRow
          label="Eligible Rating Range"
          value={`${state.minSkillLevel || '3.5'}–${state.maxSkillLevel || '4.5'}`}
        />
      ) : (
        <SummaryRow label="Skill Level" value={state.skillLevel || '3.5'} />
      )}
      <SummaryRow label="Gender" value={state.genderCategory || 'Any'} />
      <SummaryRow label="Age" value={ageDisplay} />

      {/* Format-Dependent Registration & Capacity */}
      {isScramble ? (
        <>
          <SummaryRow label="Registration" value="Individual Player Registration" />
          <SummaryRow
            label="Player Capacity"
            value={`${cap.entryCount} Players (Min: ${state.minParticipants || 4})`}
          />
          <SummaryRow
            label="Planned Rounds"
            value={`${state.scrambleRounds || '5'} rounds (confirm or adjust prior to Round 1)`}
          />
          <SummaryRow
            label="Partner Rotation"
            value="Teammates rotate each match; scheduler aims to minimize repeat partners and vary opponents."
          />
          {state.category === 'Mixed Scramble' ? (
            <SummaryRow
              label="Court Structure"
              value="Strictly 4-player balanced courts (2 men + 2 women, 100% mixed-gender teams)"
            />
          ) : (
            <>
              <SummaryRow label="4-Player Court" value="3 games per group (0 sit-outs)" />
              <SummaryRow label="5-Player Court" value="5 games per group (1 sit-out each)" />
            </>
          )}
        </>
      ) : regType === 'individual' ? (
        <>
          <SummaryRow label="Registration" value="Individual Player Registration" />
          <SummaryRow
            label="Player Capacity"
            value={`${cap.entryCount} Players (Min: ${state.minParticipants || 2})`}
          />
        </>
      ) : (
        <>
          <SummaryRow label="Registration" value="Fixed Team Registration" />
          <SummaryRow
            label="Team Capacity"
            value={`${cap.entryCount} Teams • ${cap.playerCount} Players (Min: ${state.minParticipants || 2} Teams)`}
          />
          <SummaryRow label="Team Structure" value="2 players per team" />
        </>
      )}

      {/* Rules */}
      <SummaryRow label="Match Scoring" value="First to 11, win by 2 (No ties)" />
      <SummaryRow label="Tiebreaker" value="Points Differential" />
      <SummaryRow label="Entry Fee" value={feeText} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: Spacing[1],
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.surface.borderLight,
  },
  labelCol: {
    width: '38%',
    fontSize: 12,
  },
  valueCol: {
    flex: 1,
    textAlign: 'right',
    color: Colors.text.primary,
    fontSize: 12,
  },
  formatValue: {
    color: Colors.brand.primary,
    fontWeight: '800',
  },
});
