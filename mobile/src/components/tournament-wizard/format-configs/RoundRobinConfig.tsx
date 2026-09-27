/**
 * Aught2 Pickleball — RoundRobinConfig
 *
 * Format configuration card for Round Robin:
 * - Green border & badge
 * - Number of Teams (maps to participants)
 * - Available Courts
 * - Read-only Match Scoring: First to 11, win by 2
 * - Read-only Tiebreaker Method: Points Differential
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Input';
import { Radius, Spacing } from '@/theme';
import { calculateCapacity } from '@/utils/tournamentCapacity';
import type { TournamentWizardState } from '../types';

interface RoundRobinConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function RoundRobinConfig({ state, onChange, errors }: RoundRobinConfigProps) {
  const cap = calculateCapacity(state.category, state.rrTeams);



  return (
    <View style={styles.card}>
      {/* Format Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="ROUND ROBIN FORMAT" variant="success" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          {cap.isSingles ? '1-Player Entries • All Players Play' : 'Fixed Partner Teams • All Teams Play'}
        </AppText>
      </View>

      <AppText variant="caption" color="tertiary" style={styles.explanationText}>
        {cap.isSingles
          ? 'Every player plays every other player once as individual entries.'
          : 'Every team plays every other team once. Standings ranked deterministically.'}
      </AppText>

      {/* Fields */}
      <View style={styles.fieldsGrid}>


        <View style={styles.fieldCol}>
          <Input
            label="Available Courts"
            placeholder="e.g. 3"
            value={state.rrCourts}
            onChangeText={(rrCourts) => onChange({ rrCourts })}
            keyboardType="number-pad"
            error={errors?.rrCourts}
            hint="For court allocation"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(34, 197, 94, 0.04)',
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
    marginBottom: Spacing[1],
  },
  badgeSubtitle: {
    fontSize: 12,
  },
  explanationText: {
    fontSize: 12,
    marginBottom: Spacing[3],
  },
  fieldsGrid: {
    gap: Spacing[3],
    marginBottom: Spacing[2],
  },
  fieldCol: {
    width: '100%',
  },
  readOnlyRow: {
    gap: Spacing[3],
  },
  readOnlyCol: {
    width: '100%',
  },
  readOnlyInput: {
    opacity: 0.85,
  },
});
