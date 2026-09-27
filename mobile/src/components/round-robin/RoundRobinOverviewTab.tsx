/**
 * Aught2 Pickleball — RoundRobinOverviewTab
 *
 * Standardized Tab 1 (Overview) for Round Robin Tournament Mode:
 * - Tournament Progress card:
 *   - "X of Y matches completed" & percentage bar
 *   - 4-metric grid: PARTICIPANTS (Players/Teams), TOTAL ROUNDS, COMPLETED, REMAINING
 *   - Info strip: "All-play-all round robin schedule"
 *   - Quick action: "View Matchups & Schedule →"
 * - Format & Structure card:
 *   - Competition Format, Participant Structure, Scheduling Engine
 * - Official Scoring & Tiebreakers card:
 *   - Target Score, Win Margin, 4-level Tiebreaker hierarchy
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Layers,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';
import type { Tournament, Match } from '@/types';
import type { RoundRobinProgress } from '@/types/roundRobin';

interface RoundRobinOverviewTabProps {
  tournament: Tournament;
  matches: Match[];
  progress: RoundRobinProgress;
  onNavigateTab: (tab: string) => void;
  teamSize?: number;
  participantsCount?: number;
}

export function RoundRobinOverviewTab({
  tournament,
  matches: _matches,
  progress,
  onNavigateTab,
  teamSize = 2,
  participantsCount = 0,
}: RoundRobinOverviewTabProps) {
  const isSingles = teamSize === 1;
  const participantLabel = isSingles ? 'PLAYERS' : 'TEAMS';

  const scoringRules = (tournament.scoring_rules as unknown as Record<string, unknown>) || {};
  const targetScore: number = typeof scoringRules.target_score === 'number' ? scoringRules.target_score : 11;
  const winBy: number = typeof scoringRules.win_by === 'number' ? scoringRules.win_by : 2;

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Progress Card ───────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <BarChart2 size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Tournament Progress</AppText>
        </View>

        {/* Progress Bar & Summary */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTopRow}>
            <AppText style={styles.progressSubText}>
              {progress.completedMatches} of {progress.totalMatches} matches completed
            </AppText>
            <AppText style={styles.percentText}>
              {progress.completionPercentage}%
            </AppText>
          </View>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, Math.max(0, progress.completionPercentage))}%` },
              ]}
            />
          </View>
        </View>

        {/* 4-Stat Metric Tiles */}
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>{participantLabel}</AppText>
            <Users size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{participantsCount}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>ROUNDS</AppText>
            <Calendar size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{Math.max(1, participantsCount - 1)}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>COMPLETED</AppText>
            <CheckCircle2 size={15} color="#0F766E" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{progress.completedMatches}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>REMAINING</AppText>
            <Clock size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{Math.max(0, progress.totalMatches - progress.completedMatches)}</AppText>
          </View>
        </View>

        {/* Information Strip */}
        <View style={styles.infoStrip}>
          <Info size={14} color="#0284C7" />
          <AppText style={styles.infoStripText}>
            Every {isSingles ? 'player' : 'team'} plays every other once in an intra-division round robin.
          </AppText>
        </View>

        {/* View Matchups Button */}
        <TouchableOpacity
          style={styles.viewMatchupsBtn}
          onPress={() => onNavigateTab('matchups')}
          activeOpacity={0.8}
        >
          <AppText style={styles.viewMatchupsBtnText}>
            View Match Schedule & Enter Scores →
          </AppText>
        </TouchableOpacity>
      </Card>

      {/* ─── 2. Format & Structure Card ────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Layers size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Format & Structure</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Competition Format</AppText>
            <AppText style={styles.infoVal}>Round Robin</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Participant Structure</AppText>
            <AppText style={styles.infoVal}>
              {isSingles ? 'Individual Singles' : 'Fixed Partner Doubles'}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Scheduling Engine</AppText>
            <AppText style={styles.infoVal}>Round-Robin Berger Tables</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 3. Official Scoring Rules Card ─────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldCheck size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Official Scoring Rules</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Game Format</AppText>
            <AppText style={styles.infoVal}>Single Game to {targetScore}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Win Margin</AppText>
            <AppText style={styles.infoVal}>Win by {winBy} points</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Tiebreaker Hierarchy</AppText>
            <AppText style={styles.infoVal}>1. Wins  2. H2H  3. Diff  4. Pts</AppText>
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressContainer: {
    gap: 6,
  },
  progressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressSubText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  percentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statTileLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  statTileIcon: {
    marginVertical: 2,
  },
  statTileNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  infoStripText: {
    fontSize: 12,
    color: '#0369A1',
    flex: 1,
    lineHeight: 16,
    fontWeight: '500',
  },
  viewMatchupsBtn: {
    backgroundColor: '#0F766E',
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  viewMatchupsBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoList: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
});
