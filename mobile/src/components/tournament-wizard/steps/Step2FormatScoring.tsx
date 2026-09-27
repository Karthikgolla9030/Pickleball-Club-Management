/**
 * Aught2 Pickleball — Step 2: Format & Scoring
 *
 * Primary competition engine configuration step (Moved to Step 2):
 * - Exactly 4 formats: Round Robin, Pool Play, Scramble, Bracket
 * - Cards styling & selected-state appearance preserved
 * - Dynamic format-specific configuration card
 * - Fixed read-only Match Scoring (First to 11, win by 2)
 * - Fixed read-only Tiebreakers (Wins -> Diff -> Points -> Deterministic)
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { Colors, Radius, Spacing } from '@/theme';
import { TOURNAMENT_FORMAT_LABELS, type TournamentFormat } from '@/types';
import { BracketConfig } from '../format-configs/BracketConfig';
import { PoolPlayConfig } from '../format-configs/PoolPlayConfig';
import { RoundRobinConfig } from '../format-configs/RoundRobinConfig';
import { ScrambleConfig } from '../format-configs/ScrambleConfig';
import { SCRAMBLE_DIVISION_OPTIONS, type TournamentWizardState } from '../types';

const FORMAT_LIST: TournamentFormat[] = [
  'round_robin',
  'pool_play',
  'scramble',
  'bracket',
];

const FORMAT_SUBTITLES: Record<TournamentFormat, string> = {
  round_robin:
    'Round Robin: Every participant plays every other participant once. Supports individual or team entries.',
  pool_play:
    'Pool Play: Pool stage round-robin with qualification into a single-elimination championship bracket.',
  scramble:
    'Scramble: Individual player registration with rotating partners across games in each round.',
  bracket:
    'Bracket: Seeded knockout tournament with single or double elimination.',
};

interface Step2FormatScoringProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function Step2FormatScoring({
  state,
  onChange,
  errors,
}: Step2FormatScoringProps) {
  const currentFormat = state.format;

  const handleFormatChange = (fmt: TournamentFormat) => {
    const patch: Partial<TournamentWizardState> = { format: fmt };

    // Migrate/validate participant counts and categories safely when switching format
    if (fmt === 'scramble') {
      const minP = parseInt(state.minParticipants, 10);
      const maxP = parseInt(state.maxParticipants, 10);
      if (isNaN(minP) || minP < 4) {
        patch.minParticipants = '4';
      }
      if (isNaN(maxP) || maxP < 4) {
        patch.maxParticipants = '16';
      }
      if (!SCRAMBLE_DIVISION_OPTIONS.includes(state.category as any)) {
        patch.category = 'Open Scramble';
        patch.genderCategory = 'Any';
      }
    } else {
      const minP = parseInt(state.minParticipants, 10);
      if (isNaN(minP) || minP < 2) {
        patch.minParticipants = '2';
      }
      if (SCRAMBLE_DIVISION_OPTIONS.includes(state.category as any)) {
        if (state.category === "Men's Scramble") {
          patch.category = "Men's Doubles";
          patch.genderCategory = 'Male';
        } else if (state.category === "Women's Scramble") {
          patch.category = "Women's Doubles";
          patch.genderCategory = 'Female';
        } else {
          patch.category = 'Mixed Doubles';
          patch.genderCategory = 'Any';
        }
      }
    }

    onChange(patch);
  };

  return (
    <View style={styles.container}>
      {/* Format Selector */}
      <View style={styles.selectorSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          COMPETITION FORMAT *
        </AppText>
        <View style={styles.formatChips}>
          {FORMAT_LIST.map((fmt) => {
            const isSelected = currentFormat === fmt;
            const label = TOURNAMENT_FORMAT_LABELS[fmt];

            return (
              <TouchableOpacity
                key={fmt}
                onPress={() => handleFormatChange(fmt)}
                style={[
                  styles.formatChip,
                  isSelected && styles.formatChipActive,
                ]}
                activeOpacity={0.7}
              >
                <AppText
                  variant="bodySmall"
                  style={[
                    styles.formatChipText,
                    isSelected && styles.formatChipTextActive,
                  ]}
                >
                  {label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
        <AppText variant="caption" color="secondary" style={styles.formatSubtitle}>
          {FORMAT_SUBTITLES[currentFormat]}
        </AppText>
      </View>

      {/* Dynamic Format Specific Card */}
      {currentFormat === 'round_robin' && (
        <RoundRobinConfig state={state} onChange={onChange} errors={errors} />
      )}

      {currentFormat === 'pool_play' && (
        <PoolPlayConfig state={state} onChange={onChange} errors={errors} />
      )}

      {currentFormat === 'scramble' && (
        <ScrambleConfig state={state} onChange={onChange} errors={errors} />
      )}

      {currentFormat === 'bracket' && (
        <BracketConfig state={state} onChange={onChange} errors={errors} />
      )}

      {/* Global Default Match Scoring & Tiebreaker Footer Summary */}
      <View style={styles.scoringSummaryContainer}>
        <AppText variant="caption" color="tertiary" style={styles.scoringSummaryHeader}>
          COMPETITION ENGINE RULES (BACKEND ENFORCED)
        </AppText>
        <View style={styles.scoringSummaryRow}>
          <View style={styles.scoringCol}>
            <Input
              label="Match Scoring"
              value="First to 11, win by 2"
              editable={false}
              style={styles.readOnlyInput}
            />
          </View>
          <View style={styles.scoringCol}>
            <Input
              label="Tiebreaker"
              value="Points Differential"
              editable={false}
              style={styles.readOnlyInput}
            />
          </View>
        </View>
        <AppText variant="caption" color="tertiary" style={styles.tiebreakerList}>
          Standings tiebreaker hierarchy: 1. Most Wins → 2. Point Differential → 3. Total Points Scored → 4. Player/Team Name (Deterministic)
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
  },
  selectorSection: {
    marginBottom: Spacing[1],
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
    fontWeight: '700',
  },
  formatChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  formatChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2] + 2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
  },
  formatChipActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  formatChipText: {
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  formatChipTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  formatSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  scoringSummaryContainer: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  scoringSummaryHeader: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  scoringSummaryRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  scoringCol: {
    flex: 1,
  },
  readOnlyInput: {
    opacity: 0.85,
    backgroundColor: Colors.surface.default,
  },
  tiebreakerList: {
    fontSize: 11,
    lineHeight: 16,
  },
});
