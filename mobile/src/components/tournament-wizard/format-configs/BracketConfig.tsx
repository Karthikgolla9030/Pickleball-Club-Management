/**
 * Aught2 Pickleball — BracketConfig
 *
 * Format configuration card for Bracket:
 * - Purple border & badge: Fixed partner teams • Rating seeding • Court Optimizer
 * - Bracket Type (Single Elimination read-only)
 * - Number of Teams (derives max participants)
 * - Available Courts
 * - Seeding Method selector
 * - Non-Power-of-Two BYEs selector
 * - Read-only Match Scoring: First to 11, win by 2
 * - Read-only Tiebreaker: Points Differential
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Input';
import { Colors, Radius, Spacing } from '@/theme';
import { calculateCapacity } from '@/utils/tournamentCapacity';
import {
  BRACKET_BYE_OPTIONS,
  BRACKET_SEEDING_OPTIONS,
  BRACKET_TYPE_OPTIONS,
  type TournamentWizardState,
} from '../types';

interface BracketConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function BracketConfig({ state, onChange, errors }: BracketConfigProps) {
  const cap = calculateCapacity(state.category, state.bracketTeams);



  return (
    <View style={styles.card}>
      {/* Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="BRACKET FORMAT" variant="default" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          {cap.isSingles ? '1-Player Entries • Rating Seeding' : 'Fixed Partner Teams • Rating Seeding'}
        </AppText>
      </View>

      <AppText variant="caption" color="tertiary" style={styles.explanationText}>
        {cap.isSingles
          ? 'Standalone knockout tournament. Individual players seeded deterministically by rating.'
          : 'Standalone knockout tournament. Teams seeded deterministically by rating.'}
      </AppText>

      {/* Fields */}
      <View style={styles.fieldsGrid}>
        <View style={styles.fieldCol}>
          <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
            BRACKET TYPE
          </AppText>
          <View style={styles.chipRow}>
            {BRACKET_TYPE_OPTIONS.map((bType) => (
              <TouchableOpacity
                key={bType}
                onPress={() => onChange({ bracketType: bType })}
                style={[
                  styles.optionChip,
                  state.bracketType === bType && styles.optionChipActive,
                ]}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.optionChipText,
                    state.bracketType === bType && styles.optionChipTextActive,
                  ]}
                >
                  {bType}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>



        <View style={styles.fieldCol}>
          <Input
            label="Available Courts"
            placeholder="e.g. 3"
            value={state.bracketCourts}
            onChangeText={(bracketCourts) => onChange({ bracketCourts })}
            keyboardType="number-pad"
            error={errors?.bracketCourts}
            hint="For court optimizer"
          />
        </View>

        {/* Seeding Method */}
        <View style={styles.fieldCol}>
          <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
            SEEDING METHOD
          </AppText>
          <View style={styles.chipRow}>
            {BRACKET_SEEDING_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => onChange({ bracketSeedingMethod: opt })}
                style={[
                  styles.optionChip,
                  state.bracketSeedingMethod === opt && styles.optionChipActive,
                ]}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.optionChipText,
                    state.bracketSeedingMethod === opt && styles.optionChipTextActive,
                  ]}
                >
                  {opt}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Non-Power-of-Two BYEs */}
        <View style={styles.fieldCol}>
          <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
            NON-POWER-OF-TWO BYES
          </AppText>
          <View style={styles.chipRow}>
            {BRACKET_BYE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => onChange({ bracketByeRule: opt })}
                style={[
                  styles.optionChip,
                  state.bracketByeRule === opt && styles.optionChipActive,
                ]}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.optionChipText,
                    state.bracketByeRule === opt && styles.optionChipTextActive,
                  ]}
                >
                  {opt}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(139, 92, 246, 0.04)',
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
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
  fieldLabel: {
    marginBottom: Spacing[1],
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'column',
    gap: Spacing[2],
  },
  optionChip: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.elevated,
  },
  optionChipActive: {
    borderColor: '#8B5CF6',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  optionChipText: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  optionChipTextActive: {
    color: '#A78BFA',
    fontWeight: '600',
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
