/**
 * Aught2 Pickleball — PoolPlayConfig (Step 2)
 *
 * Master UI format card for Pool Play:
 * - Blue border & badge
 * - Clear, non-technical explanation
 * - Displays inherited club engine configuration (pools, advancement, bracket)
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

interface PoolPlayConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  club?: Club | null;
  errors?: Record<string, string>;
}

export function PoolPlayConfig({ state, club }: PoolPlayConfigProps) {
  const clubConfig = club?.tournament_configuration?.pool_play || {};
  const poolCount = clubConfig.pool_count || state.poolCount || 2;
  const qualifiers = clubConfig.qualifiers_per_pool || state.qualifiersPerPool || 2;
  const targetScore = clubConfig.target_score || 11;
  const winBy = clubConfig.win_by || 2;

  return (
    <View style={styles.card}>
      {/* Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="POOL PLAY FORMAT" variant="info" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          Pool Stages → Championship Playoff
        </AppText>
      </View>

      <AppText variant="bodySmall" color="secondary" style={styles.explanationText}>
        Participants are divided into groups. The best performers move to the next stage.
      </AppText>

      {/* Applied Club Configuration Summary Box */}
      <View style={styles.appliedConfigBox}>
        <View style={styles.appliedHeaderRow}>
          <CheckCircle2 size={15} color="#2563EB" />
          <AppText variant="caption" bold style={styles.appliedHeaderLabel}>
            APPLIED FROM CLUB CONFIGURATION
          </AppText>
        </View>

        <View style={styles.rulesList}>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#2563EB" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Pool Structure: {poolCount} round-robin pools with balanced group allocation
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#2563EB" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Advancement: Top {qualifiers} entries from each pool advance to Championship Bracket
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#2563EB" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Championship Stage: Single Elimination seeded knockout playoff
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#2563EB" />
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
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
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
    color: '#2563EB',
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
