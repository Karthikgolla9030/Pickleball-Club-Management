/**
 * Aught2 Pickleball — ScrambleConfig (Step 2)
 *
 * Master UI format card for Scramble:
 * - Amber border & badge
 * - Clear explanation: "Players rotate partners across rounds and compete individually."
 * - Displays inherited club engine configuration (planned rounds, rotation rule, leaderboard metric)
 * - Zero technical questions asked during tournament creation
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, CheckCircle2 } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Colors, Radius, Spacing } from '@/theme';
import type { Club } from '@/types';
import type { TournamentWizardState } from '../types';

interface ScrambleConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  club?: Club | null;
  errors?: Record<string, string>;
}

export function ScrambleConfig({ state, club }: ScrambleConfigProps) {
  const clubConfig = club?.tournament_configuration?.scramble || {};
  const rounds = clubConfig.planned_rounds || state.scrambleRounds || 5;
  const rotationRule = clubConfig.rotation_rule || state.scrambleRotationRule || 'Full Rotation (no repeating partners)';
  const leaderboardMetric = clubConfig.leaderboard_metric || state.scrambleLeaderboardMetric || 'Win Percentage (Wins / Played) • Avg Point Diff';
  const targetScore = clubConfig.target_score || 11;
  const winBy = clubConfig.win_by || 2;

  return (
    <View style={styles.card}>
      {/* Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="SCRAMBLE FORMAT" variant="warning" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          Rotate-Partner Play • Individual Leaderboard
        </AppText>
      </View>

      <AppText variant="bodySmall" color="secondary" style={styles.explanationText}>
        Players rotate partners across rounds and compete individually.
      </AppText>

      {/* Applied Club Configuration Summary Box */}
      <View style={styles.appliedConfigBox}>
        <View style={styles.appliedHeaderRow}>
          <CheckCircle2 size={15} color="#D97706" />
          <AppText variant="caption" bold style={styles.appliedHeaderLabel}>
            APPLIED FROM CLUB CONFIGURATION
          </AppText>
        </View>

        <View style={styles.rulesList}>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#D97706" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Tournament Rounds: {rounds} planned rotation rounds
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#D97706" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Partner Rotation: {rotationRule}
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#D97706" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Leaderboard Metric: {leaderboardMetric}
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#D97706" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Court Distribution: Automatically calculated from registered players and active courts
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#D97706" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Match Scoring: First to {targetScore} points, win by {winBy} (Single Game)
            </AppText>
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
    gap: Spacing[3],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  badgeSubtitle: {
    fontSize: 12,
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 18,
  },
  appliedConfigBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  appliedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedHeaderLabel: {
    color: '#D97706',
    letterSpacing: 0.5,
  },
  rulesList: {
    gap: 6,
  },
  ruleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleItemText: {
    color: Colors.text.secondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
});
