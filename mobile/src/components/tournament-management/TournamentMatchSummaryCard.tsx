/**
 * Aught2 Pickleball — TournamentMatchSummaryCard
 *
 * Master standardized 3-column match progress statistics summary card:
 * - Total Matches
 * - Completed Matches
 * - Remaining Matches
 *
 * Visual Reference: Round Robin master UI:
 * - White card with subtle border (#DDE8E2) and 16px radius
 * - 3 equal columns with icon, large number, and label
 * - Subtle vertical dividers between columns
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Swords, CheckCircle2, Clock } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Colors } from '@/theme';

export interface TournamentMatchSummaryCardProps {
  totalMatches: number;
  completedMatches: number;
  remainingMatches: number;
  totalLabel?: string;
  completedLabel?: string;
  remainingLabel?: string;
}

export function TournamentMatchSummaryCard({
  totalMatches,
  completedMatches,
  remainingMatches,
  totalLabel = 'Total Matches',
  completedLabel = 'Completed',
  remainingLabel = 'Remaining',
}: TournamentMatchSummaryCardProps) {
  return (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryCol}>
        <Swords size={20} color={Colors.brand.primary} />
        <AppText style={styles.summaryNumber}>{totalMatches}</AppText>
        <AppText style={styles.summaryLabel}>{totalLabel}</AppText>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryCol}>
        <CheckCircle2 size={20} color="#0F766E" />
        <AppText style={[styles.summaryNumber, { color: '#0F766E' }]}>
          {completedMatches}
        </AppText>
        <AppText style={styles.summaryLabel}>{completedLabel}</AppText>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryCol}>
        <Clock size={20} color={Colors.text.secondary} />
        <AppText style={styles.summaryNumber}>{remainingMatches}</AppText>
        <AppText style={styles.summaryLabel}>{remainingLabel}</AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102F2B',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71817E',
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
  },
});
