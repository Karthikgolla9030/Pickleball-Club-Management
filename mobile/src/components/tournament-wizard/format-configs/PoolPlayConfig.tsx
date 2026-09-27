/**
 * Aught2 Pickleball — PoolPlayConfig
 *
 * Format configuration card for Pool Play:
 * - Blue border & badge: Pool Stage → Championship Bracket
 * - Number of Pools
 * - Teams per Pool (derives total teams and max participants)
 * - Qualifiers per Pool
 * - Championship Bracket type (Single Elimination)
 * - Available Courts
 * - Read-only Match Scoring: First to 11, win by 2
 * - Read-only Tiebreaker: Points Differential
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Input';
import { Radius, Spacing } from '@/theme';
import { getTeamSize, isSinglesCategory } from '@/utils/tournamentCapacity';
import type { TournamentWizardState } from '../types';

interface PoolPlayConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function PoolPlayConfig({ state, onChange, errors }: PoolPlayConfigProps) {
  const isSingles = isSinglesCategory(state.category);
  const teamSize = getTeamSize(state.category);


  return (
    <View style={styles.card}>
      {/* Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="POOL PLAY FORMAT" variant="info" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          {isSingles ? 'Singles Pool Stage → Championship Bracket' : 'Pool Stage → Championship Bracket'}
        </AppText>
      </View>

      <AppText variant="caption" color="tertiary" style={styles.explanationText}>
        {isSingles
          ? 'Players compete round-robin inside assigned pools. Top qualifiers advance to a single-elimination championship bracket.'
          : 'Teams play round-robin inside assigned pools. Top teams advance to a single-elimination championship bracket.'}
      </AppText>

      {/* Fields */}
      <View style={styles.fieldsGrid}>
        <View style={styles.fieldCol}>
          <Input
            label="Championship Bracket"
            value="Single Elimination (deterministic pool seeds)"
            editable={false}
            style={styles.readOnlyInput}
          />
        </View>

        <View style={styles.fieldCol}>
          <Input
            label="Available Courts"
            placeholder="e.g. 4"
            value={state.poolCourts}
            onChangeText={(poolCourts) => onChange({ poolCourts })}
            keyboardType="number-pad"
            error={errors?.poolCourts}
            hint="Parallel pool scheduling"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
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
