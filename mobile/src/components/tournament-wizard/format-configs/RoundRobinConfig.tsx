/**
 * Aught2 Pickleball — RoundRobinConfig (Step 2)
 *
 * Clean, compact configuration summary:
 * - Round Robin Settings header with "Using club settings" badge
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

interface RoundRobinConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  club?: Club | null;
  errors?: Record<string, string>;
}

export function RoundRobinConfig({ club }: RoundRobinConfigProps) {
  const clubConfig = club?.tournament_configuration?.round_robin || {};
  const targetScore = clubConfig.target_score || 11;
  const winBy = clubConfig.win_by || 2;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <AppText variant="bodySmall" bold style={styles.cardTitle}>
          Round Robin Settings
        </AppText>
        <Badge label="Using club settings" variant="success" />
      </View>

      <View style={styles.bulletsList}>
        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <AppText variant="caption" style={styles.bulletText}>
            Match scoring: First to <AppText variant="caption" bold>{targetScore}</AppText> (win by <AppText variant="caption" bold>{winBy}</AppText>)
          </AppText>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <AppText variant="caption" style={styles.bulletText}>
            Standings: <AppText variant="caption" bold>Total wins & point differential</AppText>
          </AppText>
        </View>

        <View style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <AppText variant="caption" style={styles.bulletText}>
            Courts: <AppText variant="caption" bold>Allocated across available courts</AppText>
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
