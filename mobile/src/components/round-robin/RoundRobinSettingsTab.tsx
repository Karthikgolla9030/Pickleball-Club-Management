/**
 * Aught2 Pickleball — RoundRobinSettingsTab (Settings Screen)
 *
 * Screen 5 for Round Robin Tournament Mode:
 * - Heading: Tournament Settings
 * - Card 1: Format & Structure (Format: Round Robin, Structure: Fixed partner teams · All-play-all, Engine: Deterministic Berger / Circle Rotation)
 * - Card 2: Scoring Rules (Game format: Single game, Target score: First to 11 points, Win margin: Win by 2 or more, Ties: Not allowed)
 * - Card 3: Standings Tiebreakers (1. Wins, 2. Point differential, 3. Total points scored, 4. Team name (A-Z))
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Layers, ShieldCheck, Award } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Court, Tournament } from '@/types';

interface RoundRobinSettingsTabProps {
  courts?: Court[];
  tournament?: Tournament | null;
  teamSize?: number;
}

export function RoundRobinSettingsTab({
  tournament,
  teamSize = 1,
}: RoundRobinSettingsTabProps) {
  const scoringRules = (tournament?.scoring_rules as Record<string, any>) || {};
  const targetScore = scoringRules.target_score ?? 11;
  const winBy = scoringRules.win_by ?? 2;

  const tiebreakers = [
    { num: 1, title: 'Wins', desc: 'Total match victories (Descending)' },
    { num: 2, title: 'Point differential', desc: 'Points scored minus points allowed (Descending)' },
    { num: 3, title: 'Total points scored', desc: 'Total points scored (Descending)' },
    { num: 4, title: 'Team name (A–Z)', desc: 'Alphabetical order (Ascending, case-insensitive)' },
  ];

  return (
    <View style={styles.container}>
      {/* Heading */}
      <AppText style={styles.headingTitle}>Tournament Settings</AppText>

      {/* Card 1: Format & Structure */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Layers size={18} color="#087A60" />
          <AppText style={styles.cardHeaderTitle}>Format & Structure</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Format</AppText>
            <AppText style={styles.valCol}>Round Robin</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Structure</AppText>
            <AppText style={styles.valCol}>
              {teamSize === 1
                ? 'Individual singles · All-play-all'
                : 'Fixed partner teams · All-play-all'}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Engine</AppText>
            <AppText style={styles.valCol}>
              Deterministic Berger / Circle Rotation
            </AppText>
          </View>
        </View>
      </Card>

      {/* Card 2: Scoring Rules */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldCheck size={18} color="#0284C7" />
          <AppText style={styles.cardHeaderTitle}>Scoring Rules</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Game format</AppText>
            <AppText style={styles.valCol}>Single game</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Target score</AppText>
            <AppText style={styles.valCol}>First to {targetScore} points</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Win margin</AppText>
            <AppText style={styles.valCol}>Win by {winBy} or more</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Ties</AppText>
            <AppText style={styles.valCol}>Not allowed</AppText>
          </View>
        </View>
      </Card>

      {/* Card 3: Standings Tiebreakers */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Award size={18} color="#EA580C" />
          <AppText style={styles.cardHeaderTitle}>Standings Tiebreakers</AppText>
        </View>

        <AppText style={styles.tiebreakerSubtitle}>
          Standings are calculated using the following priority order:
        </AppText>

        <View style={styles.tiebreakerList}>
          {tiebreakers.map((item) => (
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    gap: Spacing[3],
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102F2B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    padding: Spacing[4],
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102F2B',
  },
  infoList: {
    gap: 10,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  labelCol: {
    fontSize: 13,
    color: '#71817E',
  },
  valCol: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2B',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
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
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2B',
  },
  stepDesc: {
    fontSize: 11,
    color: '#71817E',
    marginTop: 1,
  },
});
