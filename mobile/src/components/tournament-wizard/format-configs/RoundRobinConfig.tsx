/**
 * Aught2 Pickleball — RoundRobinConfig (Step 2)
 *
 * Master UI format card for Round Robin:
 * - Green border & badge
 * - Clear, non-technical explanation
 * - Displays inherited club engine configuration (scoring, tiebreakers, courts)
 * - Zero technical questions asked during tournament creation
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, CheckCircle2, Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Colors, Radius, Spacing } from '@/theme';
import type { Club } from '@/types';
import type { TournamentWizardState } from '../types';

interface RoundRobinConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  club?: Club | null;
  errors?: Record<string, string>;
}

export function RoundRobinConfig({ state, club }: RoundRobinConfigProps) {
  const clubConfig = club?.tournament_configuration?.round_robin || {};
  const targetScore = clubConfig.target_score || 11;
  const winBy = clubConfig.win_by || 2;

  return (
    <View style={styles.card}>
      {/* Format Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="ROUND ROBIN FORMAT" variant="success" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          All Participants Play Each Other
        </AppText>
      </View>

      <AppText variant="bodySmall" color="secondary" style={styles.explanationText}>
        Everyone plays against the other participants. Final positions are based on results.
      </AppText>

      {/* Applied Club Configuration Summary Box */}
      <View style={styles.appliedConfigBox}>
        <View style={styles.appliedHeaderRow}>
          <CheckCircle2 size={15} color="#08785E" />
          <AppText variant="caption" bold style={styles.appliedHeaderLabel}>
            APPLIED FROM CLUB CONFIGURATION
          </AppText>
        </View>

        <View style={styles.rulesList}>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#08785E" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Match Scoring: First to {targetScore} points, win by {winBy} (Single Game)
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#08785E" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Standings Hierarchy: 1. Total Wins → 2. Point Differential → 3. Total Points Scored → 4. Team Name
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#08785E" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Court Allocation: Distributed across available active club courts
            </AppText>
          </View>
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
    color: '#08785E',
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
