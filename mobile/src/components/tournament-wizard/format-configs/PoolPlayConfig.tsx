/**
 * Aught2 Pickleball — PoolPlayConfig (Step 2)
 *
 * Clean, compact configuration summary:
 * - Pool Play Settings header with "Using club settings" badge
 * - Simple, readable bullets using actual saved configuration
 * - No technical backend names, no duplicate format descriptions
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
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
      <View style={styles.headerRow}>
        <AppText variant="bodySmall" bold style={styles.cardTitle}>
          Pool Play Settings
        </AppText>
        <Badge label="Configured post-registration" variant="info" />
      </View>

      <View style={styles.bulletsList}>
        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <AppText variant="caption" style={styles.bulletText}>
            Pool allocation: <AppText variant="caption" bold>Configured post-registration based on confirmed teams</AppText>
          </AppText>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <AppText variant="caption" style={styles.bulletText}>
            Advancement & bracket: <AppText variant="caption" bold>Qualifiers and playoff bracket selected post-registration</AppText>
          </AppText>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <AppText variant="caption" style={styles.bulletText}>
            Playoff format: <AppText variant="caption" bold>Single or Double Elimination championship</AppText>
          </AppText>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <AppText variant="caption" style={styles.bulletText}>
            Match scoring: First to <AppText variant="caption" bold>{targetScore}</AppText> (win by <AppText variant="caption" bold>{winBy}</AppText>)
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 13,
  },
  bulletsList: {
    gap: 6,
    paddingLeft: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.brand.primary,
  },
  bulletText: {
    color: Colors.text.secondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
