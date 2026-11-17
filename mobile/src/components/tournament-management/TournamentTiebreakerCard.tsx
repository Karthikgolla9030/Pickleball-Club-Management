/**
 * Aught2 Pickleball — TournamentTiebreakerCard
 *
 * Master standardized Tiebreaker / Official Ranking Rules card across all formats:
 * - Round Robin
 * - Bracket
 * - Pool Play
 * - Scramble
 *
 * Visual Reference: Round Robin master UI:
 * - White card with subtle border (#DDE8E2) and 16px radius
 * - Header with orange Award icon (#EA580C) and bold heading
 * - Subtitle explaining priority order
 * - Numbered steps with soft orange circular badges (#FFF7ED, #FFEDD5 border, #EA580C text)
 * - Step title and description
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Award } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Spacing } from '@/theme';

export interface TiebreakerRule {
  num: number;
  title: string;
  desc: string;
}

export interface TournamentTiebreakerCardProps {
  title?: string;
  subtitle?: string;
  rules: TiebreakerRule[];
  icon?: React.ReactNode;
}

export function TournamentTiebreakerCard({
  title = 'Official tiebreaker order',
  subtitle = 'Standings are calculated using the following priority order:',
  rules,
  icon,
}: TournamentTiebreakerCardProps) {
  return (
    <Card style={styles.tiebreakerCard}>
      <View style={styles.tiebreakerHeader}>
        {icon ?? <Award size={18} color="#EA580C" />}
        <AppText style={styles.tiebreakerHeading}>
          {title}
        </AppText>
      </View>

      <AppText style={styles.tiebreakerSubtitle}>
        {subtitle}
      </AppText>

      <View style={styles.tiebreakerList}>
        {rules.map((item) => (
          <View key={item.num} style={styles.tiebreakerItem}>
            <View style={styles.stepBadge}>
              <AppText style={styles.stepNum}>{item.num}</AppText>
            </View>
            <View style={styles.stepContent}>
              <AppText style={styles.stepTitle}>{item.title}</AppText>
              <AppText style={styles.stepDesc}>{item.desc}</AppText>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tiebreakerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    padding: Spacing[4],
    gap: 10,
    marginTop: 4,
  },
  tiebreakerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tiebreakerHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102F2B',
  },
  tiebreakerSubtitle: {
    fontSize: 12,
    color: '#71817E',
    marginTop: -4,
  },
  tiebreakerList: {
    gap: 12,
    marginTop: 4,
  },
  tiebreakerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
  },
  stepContent: {
    flex: 1,
    gap: 1,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  stepDesc: {
    fontSize: 11,
    color: '#64748B',
  },
});
