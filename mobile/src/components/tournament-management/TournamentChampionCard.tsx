/**
 * Aught2 Pickleball — TournamentChampionCard
 *
 * Master standardized Tournament Champion celebration card across all formats:
 * - Round Robin
 * - Bracket (Single / Double Elimination)
 * - Pool Play
 * - Scramble
 *
 * Visual Reference: Round Robin master UI:
 * - Amber/cream card (#FFFBEB) with gold border (#FDE68A)
 * - Rounded corners (Radius 16)
 * - Pill trophy badge (#FEF3C7) with amber text (#B45309)
 * - Large bold champion title (#1E293B)
 * - Subtitle with player names / partners (#64748B)
 * - Achievement stat pills row with white background, subtle border, and icons
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';

export interface ChampionStatPill {
  icon?: React.ReactNode;
  text: string;
}

export interface TournamentChampionCardProps {
  badgeLabel?: string;
  championName: string;
  subtitle?: string | null;
  statPills?: ChampionStatPill[];
  footer?: React.ReactNode;
}

export function TournamentChampionCard({
  badgeLabel = 'TOURNAMENT CHAMPION',
  championName,
  subtitle,
  statPills = [],
  footer,
}: TournamentChampionCardProps) {
  return (
    <Card style={styles.championCard}>
      {/* Trophy Badge */}
      <View style={styles.championBadge}>
        <Trophy size={20} color="#D97706" />
        <AppText style={styles.championBadgeText}>{badgeLabel}</AppText>
      </View>

      {/* Champion Name */}
      <AppText style={styles.championTeamName}>
        {championName}
      </AppText>

      {/* Subtitle / Members */}
      {subtitle ? (
        <AppText style={styles.championMembersText}>
          {subtitle}
        </AppText>
      ) : null}

      {/* Achievement Stat Pills Row */}
      {statPills.length > 0 && (
        <View style={styles.championStatsRow}>
          {statPills.map((pill, idx) => (
            <View key={`champ-stat-${idx}`} style={styles.championStatPill}>
              {pill.icon}
              <AppText style={styles.championStatText}>{pill.text}</AppText>
            </View>
          ))}
        </View>
      )}

      {/* Optional Custom Footer (e.g. Double Elimination decider note) */}
      {footer}
    </Card>
  );
}

const styles = StyleSheet.create({
  championCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  championBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  championBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  championTeamName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  championMembersText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  championStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  championStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  championStatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
});
