/**
 * Aught2 Pickleball — Step 3: Format & Scoring
 *
 * Primary competition engine configuration step:
 * - Exactly 4 formats: Round Robin, Pool Play, Scramble, Bracket
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
import { getTeamSize } from '@/utils/tournamentCapacity';
import { BracketConfig } from '../format-configs/BracketConfig';
import { PoolPlayConfig } from '../format-configs/PoolPlayConfig';
import { RoundRobinConfig } from '../format-configs/RoundRobinConfig';
import { ScrambleConfig } from '../format-configs/ScrambleConfig';
import type { TournamentWizardState } from '../types';

const FORMAT_LIST: TournamentFormat[] = [
  'round_robin',
  'pool_play',
  'scramble',
  'bracket',
];

const FORMAT_SUBTITLES: Record<TournamentFormat, string> = {
  round_robin:
    'Round Robin: Every team or player plays every other participant once.',
  pool_play:
    'Pool Play: Pool stage round-robin with qualification into a single-elimination championship bracket.',
  scramble:
    'Scramble: Rotate-partner play with 4-5 players per court and individual leaderboard.',
  bracket:
    'Bracket: Seeded knockout tournament with single or double elimination.',
};

interface Step3FormatScoringProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function Step3FormatScoring({
  state,
  onChange,
  errors,
}: Step3FormatScoringProps) {
  const currentFormat = state.format;
  const teamSize = getTeamSize(state.category);

  const handleFormatChange = (fmt: TournamentFormat) => {
    onChange({ format: fmt });
  };

  return (
    <View style={styles.container}>
      {/* Format Selector */}
      <View style={styles.selectorSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          COMPETITION FORMAT *
        </AppText>
        <View style={styles.formatChips}>
          {FORMAT_LIST.map((fmt) => (
            <TouchableOpacity
              key={fmt}
              onPress={() => handleFormatChange(fmt)}
              style={[
                styles.formatChip,
                currentFormat === fmt && styles.formatChipActive,
              ]}
            >
              <AppText
                variant="bodySmall"
                style={[
                  styles.formatChipText,
                  currentFormat === fmt && styles.formatChipTextActive,
                ]}
              >
                {TOURNAMENT_FORMAT_LABELS[fmt]}
              </AppText>
            </TouchableOpacity>
          ))}
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
          Standings tiebreaker hierarchy: 1. Wins → 2. Points Differential → 3. Total Points Scored → 4. Team Name (deterministic)
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
  },
  selectorSection: {
    marginBottom: Spacing[2],
  },
  sectionLabel: {
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
  },
  formatChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  formatChip: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.elevated,
  },
  formatChipActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: '#E7F5EC',
  },
  formatChipText: {
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  formatChipTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  formatSubtitle: {
    marginTop: Spacing[2],
    fontSize: 12,
    lineHeight: 16,
  },
  scoringSummaryContainer: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: Spacing[2],
  },
  scoringSummaryHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  scoringSummaryRow: {
    gap: Spacing[3],
  },
  scoringCol: {
    width: '100%',
  },
  readOnlyInput: {
    opacity: 0.85,
  },
  tiebreakerList: {
    fontSize: 11,
    lineHeight: 15,
  },
});
