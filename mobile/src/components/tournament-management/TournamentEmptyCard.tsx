/**
 * Aught2 Pickleball — TournamentEmptyCard
 *
 * Master standardized Empty State Card component across all tournament formats:
 * - Round Robin
 * - Bracket
 * - Pool Play
 * - Scramble
 *
 * Visual Reference: Round Robin master UI:
 * - White card with 1px border (#DDE8E2) and 16px radius
 * - Centered circular icon container (64px, #F1F5F9)
 * - Bold title (16px, 700 weight, #102F2B)
 * - Subtitle description (13px, #71817E, max width 280-320px)
 * - Optional centered action button
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';

export interface TournamentEmptyCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionButton?: React.ReactNode;
}

export function TournamentEmptyCard({
  icon,
  title,
  description,
  actionButton,
}: TournamentEmptyCardProps) {
  return (
    <Card style={styles.emptyCard}>
      <View style={styles.emptyIconCircle}>
        {icon}
      </View>
      <AppText style={styles.emptyHeading}>
        {title}
      </AppText>
      <AppText style={styles.emptySubtitle}>
        {description}
      </AppText>
      {actionButton ? (
        <View style={styles.actionWrapper}>
          {actionButton}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102F2B',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#71817E',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 300,
    lineHeight: 18,
  },
  actionWrapper: {
    marginTop: 16,
  },
});
