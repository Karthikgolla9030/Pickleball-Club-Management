/**
 * Aught2 Pickleball — TournamentRoundHeading
 *
 * Master standardized section heading for rounds and tournament phases:
 * - ROUND 1, ROUND 2...
 * - QUARTERFINALS, SEMIFINALS, FINALS...
 * - POOL A, POOL B, CHAMPIONSHIP BRACKET...
 *
 * Visual Reference: Round Robin master UI:
 * - Teal/Green calendar icon (16px, #087A60)
 * - Bold uppercase title (14px, 800 weight, #102F2B, letterSpacing 0.5)
 * - Finished/Matches count pill badge
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';

export interface TournamentRoundHeadingProps {
  title: string;
  badgeLabel?: string;
  badgeVariant?: 'default' | 'success' | 'warning' | 'info';
  icon?: React.ReactNode;
}

export function TournamentRoundHeading({
  title,
  badgeLabel,
  badgeVariant = 'default',
  icon,
}: TournamentRoundHeadingProps) {
  return (
    <View style={styles.roundHeaderRow}>
      {icon ?? <Calendar size={16} color="#087A60" />}
      <AppText style={styles.roundHeading}>
        {title.toUpperCase()}
      </AppText>
      {badgeLabel ? (
        <Badge label={badgeLabel} variant={badgeVariant} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  roundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  roundHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102F2B',
    letterSpacing: 0.5,
  },
});
