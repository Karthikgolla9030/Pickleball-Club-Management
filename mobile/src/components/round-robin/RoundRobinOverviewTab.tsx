/**
 * Aught2 Pickleball — RoundRobinOverviewTab
 *
 * Tab 1 (Overview) for Round Robin Tournament Mode:
 * Provides a concise operational summary answering "How is my tournament progressing?":
 * - Tournament Progress card:
 *   - "X of Y matches completed" & percentage progress bar
 *   - 4-metric grid: PARTICIPANTS, ROUNDS, COMPLETED, REMAINING
 *   - Operational info strip: "Every player/team plays every other once in an intra-division round robin."
 *   - Contextual next action button (View Results, Enter Scores, or Review Participants)
 *
 * Detailed configuration fields have been cleanly moved into the Settings tab.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
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
  tournament: _tournament,
  matches: _matches,
  progress,
  onNavigateTab,
  teamSize = 2,
  participantsCount = 0,
}: RoundRobinOverviewTabProps) {
  const isSingles = teamSize === 1;
  const participantLabel = isSingles ? 'PLAYERS' : 'TEAMS';

  const isCompleted = progress.isCompleted || (progress.totalMatches > 0 && progress.completedMatches === progress.totalMatches);
  const remainingMatches = Math.max(0, progress.totalMatches - progress.completedMatches);
  const totalRounds = Math.max(1, participantsCount > 0 ? (isSingles ? participantsCount - 1 : Math.max(1, participantsCount - 1)) : 1);

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
            <AppText style={styles.statTileNum}>{totalRounds}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>COMPLETED</AppText>
            <CheckCircle2 size={15} color="#0F766E" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{progress.completedMatches}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>REMAINING</AppText>
            <Clock size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{remainingMatches}</AppText>
          </View>
        </View>

        {/* Information Strip */}
        <View style={styles.infoStrip}>
          <Info size={14} color="#0284C7" />
          <AppText style={styles.infoStripText}>
            Every {isSingles ? 'player' : 'team'} plays every other once in an intra-division round robin.
          </AppText>
        </View>

        {/* Contextual Action Button */}
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            if (isCompleted) {
              onNavigateTab('results');
            } else if (progress.totalMatches > 0) {
              onNavigateTab('matchups');
            } else {
              onNavigateTab('participants');
            }
          }}
          activeOpacity={0.8}
        >
          <AppText style={styles.actionBtnText}>
            {isCompleted
              ? 'View Tournament Results →'
              : progress.totalMatches > 0
              ? 'View Match Schedule & Enter Scores →'
              : 'Review Registered Participants →'}
          </AppText>
        </TouchableOpacity>
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
    fontSize: 16,
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
    fontSize: 14,
    fontWeight: '700',
    color: '#0F766E',
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#E2E8F0',
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
    borderRadius: Radius.md,
    padding: 10,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statTileLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  statTileIcon: {
    marginVertical: 1,
  },
  statTileNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  infoStripText: {
    fontSize: 12,
    color: '#0369A1',
    flex: 1,
    lineHeight: 16,
  },
  actionBtn: {
    backgroundColor: '#0F766E',
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
