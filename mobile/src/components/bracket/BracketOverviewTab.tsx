/**
 * Aught2 Pickleball — BracketOverviewTab
 *
 * Tab 1 (Overview) for Bracket Tournament Mode:
 * - Tournament Progress card:
 *   - Heading with activity/pulse icon
 *   - "0 of 0 matches completed" and "0%"
 *   - Horizontal progress bar
 *   - 4-metric grid: TEAMS, BRACKET, COMPLETED, REMAINING
 *   - Information strip: "2 teams receive a first-round BYE."
 *   - "View Interactive Bracket →" dark green button
 * - Format & Structure card:
 *   - COMPETITION FORMAT, TEAM STRUCTURE, BRACKET ENGINE
 * - Official Scoring Rules card:
 *   - GAME FORMAT, TARGET SCORE, WIN MARGIN, TIE RULES
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  BarChart2,
  Layers,
  ShieldCheck,
  Users,
  CheckCircle2,
  Clock,
  Info,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';
import type { Tournament, Match, BracketSummaryResponse } from '@/types';
import type { BracketProgress, BracketSubTab } from '@/types/bracket';

interface BracketOverviewTabProps {
  tournament: Tournament;
  summary: BracketSummaryResponse | null;
  matches: Match[];
  progress: BracketProgress;
  onNavigateTab: (tab: BracketSubTab) => void;
  teamSize?: number;
}

export function BracketOverviewTab({
  tournament,
  summary,
  matches,
  progress,
  onNavigateTab,
  teamSize = 2,
}: BracketOverviewTabProps) {
  const teamsCount = summary?.teams_count ?? tournament.participant_count ?? 0;
  const bracketSize = summary?.bracket_size ?? (teamsCount > 0 ? Math.pow(2, Math.ceil(Math.log2(Math.max(2, teamsCount)))) : 2);
  const byesCount = summary?.byes_count ?? Math.max(0, bracketSize - teamsCount);

  const formatConfig = (tournament.format_configuration || {}) as Record<string, any>;
  const bracketType =
    typeof formatConfig.bracket_type === 'string'
      ? formatConfig.bracket_type
      : typeof formatConfig.bracket_format === 'string'
      ? formatConfig.bracket_format
      : 'Single Elimination';

  const scoringRules = (tournament.scoring_rules as Record<string, any>) || {};
  const targetScore = scoringRules.target_score ?? 11;
  const winBy = scoringRules.win_by ?? 2;

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Progress Card ───────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <BarChart2 size={18} color="#10B981" />
          <AppText style={styles.cardHeaderTitle}>Tournament Progress</AppText>
        </View>

        {/* Progress Bar & Summary */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTopRow}>
            <AppText style={styles.progressSubText}>
              {progress.completedMatches} of {progress.totalMatches} matches completed
            </AppText>
            <AppText style={styles.percentText}>
              {progress.percentComplete}%
            </AppText>
          </View>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, Math.max(0, progress.percentComplete))}%` },
              ]}
            />
          </View>
        </View>

        {/* 4-Stat Metric Tiles */}
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>TEAMS</AppText>
            <Users size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{teamsCount}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>BRACKET</AppText>
            <Layers size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{bracketSize}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>COMPLETED</AppText>
            <CheckCircle2 size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{progress.completedMatches}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>REMAINING</AppText>
            <Clock size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{progress.remainingMatches}</AppText>
          </View>
        </View>

        {/* Information Strip */}
        <View style={styles.infoStrip}>
          <Info size={14} color="#0284C7" />
          <AppText style={styles.infoStripText}>
            {byesCount > 0
              ? `${byesCount} team${byesCount > 1 ? 's' : ''} receive a first-round BYE.`
              : 'Deterministic power-of-two bracket pairing.'}
          </AppText>
        </View>

        {/* View Interactive Bracket Button */}
        <TouchableOpacity
          style={styles.viewBracketBtn}
          onPress={() => onNavigateTab('bracket')}
          activeOpacity={0.8}
        >
          <AppText style={styles.viewBracketBtnText}>
            View Interactive Bracket →
          </AppText>
        </TouchableOpacity>
      </Card>

      {/* ─── 2. Format & Structure Card ────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Layers size={18} color="#10B981" />
          <AppText style={styles.cardHeaderTitle}>Format & Structure</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Competition Format</AppText>
            <AppText style={styles.infoVal}>{bracketType} Bracket</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Team Structure</AppText>
            <AppText style={styles.infoVal}>
              {teamSize === 1 ? 'Individual Singles' : 'Fixed Partner Doubles'}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Bracket Engine</AppText>
            <AppText style={styles.infoVal}>Power-of-Two Standard Seeding</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 3. Official Scoring Rules Card ─────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldCheck size={18} color="#10B981" />
          <AppText style={styles.cardHeaderTitle}>Official Scoring Rules</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Game Format</AppText>
            <AppText style={styles.infoVal}>Single Game</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Target Score</AppText>
            <AppText style={styles.infoVal}>First to {targetScore} points</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Win Margin</AppText>
            <AppText style={styles.infoVal}>Win by {winBy} or more</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Ties</AppText>
            <AppText style={styles.infoVal}>Not allowed</AppText>
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
    gap: Spacing[4],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    padding: Spacing[4],
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2B',
  },
  progressContainer: {
    gap: 6,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressSubText: {
    fontSize: 12,
    color: '#71817E',
  },
  percentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#087A60',
  },
  progressBarBackground: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#087A60',
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  statTile: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statTileNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102F2B',
  },
  statTileLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#71817E',
  },
  statTileIcon: {
    marginVertical: 2,
  },
  infoStrip: {
    backgroundColor: '#EAF2FC',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoStripText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '500',
    flex: 1,
  },
  viewBracketBtn: {
    backgroundColor: '#064E3B',
    borderRadius: Radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  viewBracketBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71817E',
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2B',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
});
