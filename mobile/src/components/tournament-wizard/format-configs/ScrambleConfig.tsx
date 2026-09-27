/**
 * Aught2 Pickleball — ScrambleConfig
 *
 * Format configuration card for Scramble:
 * - Amber border & badge: Rotate-Partner play • 4-5 players per court • Individual leaderboard
 * - Total Players (individual player count, min 4)
 * - Active Courts
 * - Partner Rotation Rule selector
 * - Leaderboard Metric selector
 * - Read-only Match Scoring: First to 11, win by 2
 * - Read-only Tiebreaker: Points Differential
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Input } from '@/components/Input';
import { Colors, Radius, Spacing } from '@/theme';
import {
  SCRAMBLE_LEADERBOARD_OPTIONS,
  SCRAMBLE_ROTATION_OPTIONS,
  type TournamentWizardState,
} from '../types';

interface ScrambleConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function ScrambleConfig({ state, onChange, errors }: ScrambleConfigProps) {


  return (
    <View style={styles.card}>
      {/* Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="SCRAMBLE FORMAT" variant="warning" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          Rotate-Partner play • Individual leaderboard
        </AppText>
      </View>

      <AppText variant="bodySmall" style={styles.explanationText}>
        Players register individually. The system automatically rotates partners across games in each round.
      </AppText>

      {/* Rules list */}
      <View style={styles.rulesList}>
        {state.category === 'Mixed Scramble' ? (
          <>
            <AppText variant="caption" color="secondary" style={styles.ruleItem}>
              • Mixed Scramble: balanced 4-player courts (2 men, 2 women) forming 100% mixed-gender teams.
            </AppText>
            <AppText variant="caption" color="secondary" style={styles.ruleItem}>
              • 2 games per court block (both possible mixed partner combinations; no men-only/women-only pairs).
            </AppText>
          </>
        ) : (
          <>
            <AppText variant="caption" color="secondary" style={styles.ruleItem}>
              • 4-player court: 3 games, every player partners each other player in that court group.
            </AppText>
            <AppText variant="caption" color="secondary" style={styles.ruleItem}>
              • 5-player court: 5 games, every player sits out exactly once and plays 4 games.
            </AppText>
          </>
        )}
        <AppText variant="caption" color="secondary" style={styles.ruleItem}>
          • Full-field rotation regrouping across courts between rounds to minimize repeat partners and vary opponents.
        </AppText>
        <AppText variant="caption" color="secondary" style={styles.ruleItem}>
          • Finite tournament: manager confirms planned rounds; tournament ends after the final planned round.
        </AppText>
      </View>

      {/* Fields */}
      <View style={styles.fieldsGrid}>
        <View style={styles.fieldCol}>
          <Input
            label="Active Courts"
            placeholder="e.g. 4"
            value={state.scrambleCourts}
            onChangeText={(scrambleCourts) => onChange({ scrambleCourts })}
            keyboardType="number-pad"
            error={errors?.scrambleCourts}
            hint="For court distribution"
          />
        </View>

        <View style={styles.fieldCol}>
          <Input
            label="Planned Rotation Rounds"
            placeholder="e.g. 5"
            value={state.scrambleRounds}
            onChangeText={(scrambleRounds) => onChange({ scrambleRounds })}
            keyboardType="number-pad"
            error={errors?.scrambleRounds}
            hint="Tentative round count (recommended: 4-5). Confirmed before Round 1."
          />
        </View>

        {/* Partner Rotation Rule */}
        <View style={styles.fieldCol}>
          <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
            PARTNER ROTATION RULE
          </AppText>
          <View style={styles.chipRow}>
            {SCRAMBLE_ROTATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => onChange({ scrambleRotationRule: opt })}
                style={[
                  styles.optionChip,
                  state.scrambleRotationRule === opt && styles.optionChipActive,
                ]}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.optionChipText,
                    state.scrambleRotationRule === opt && styles.optionChipTextActive,
                  ]}
                >
                  {opt}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Leaderboard Metric */}
        <View style={styles.fieldCol}>
          <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
            LEADERBOARD METRIC
          </AppText>
          <View style={styles.chipRow}>
            {SCRAMBLE_LEADERBOARD_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => onChange({ scrambleLeaderboardMetric: opt })}
                style={[
                  styles.optionChip,
                  state.scrambleLeaderboardMetric === opt && styles.optionChipActive,
                ]}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.optionChipText,
                    state.scrambleLeaderboardMetric === opt && styles.optionChipTextActive,
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
    backgroundColor: 'rgba(245, 158, 11, 0.04)',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
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
    marginBottom: Spacing[2],
  },
  rulesList: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    marginBottom: Spacing[3],
    gap: 4,
  },
  ruleItem: {
    fontSize: 11,
    lineHeight: 16,
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
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  optionChipText: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  optionChipTextActive: {
    color: '#F59E0B',
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
