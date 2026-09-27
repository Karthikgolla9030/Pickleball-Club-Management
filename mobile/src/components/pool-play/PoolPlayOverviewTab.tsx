/**
 * Aught2 Pickleball — PoolPlayOverviewTab
 *
 * Standardized Tab 1 (Overview) for Pool Play Tournament Mode:
 * - Tournament Progress card:
 *   - Current stage indicator (Pool Play vs Championship Bracket)
 *   - Match completion metrics & progress bar
 *   - 4-metric grid: PARTICIPANTS, POOLS, POOL MATCHES, QUALIFIERS
 *   - Contextual CTA leading to active stage
 * - Pools Overview card:
 *   - Pool breakdown with team count & average rating
 * - Structure & Advancement card:
 *   - Pool size, advancement rules, championship elimination format
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Layers,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';
import type { ChampionshipMatch, Match, PoolStat, PoolPlayConfig, Team } from '@/types/poolPlay';

interface PoolPlayOverviewTabProps {
  tournament: Tournament;
  teams: Team[];
  matches: Match[];
  championshipMatches: ChampionshipMatch[];
  pools: PoolStat[];
  config: PoolPlayConfig;
  isPoolPlayComplete: boolean;
  isChampionshipComplete: boolean;
  isSingles?: boolean;
  onNavigateTab: (tab: string) => void;
}

export function PoolPlayOverviewTab({
  tournament: _tournament,
  teams,
  matches,
  championshipMatches,
  pools,
  config,
  isPoolPlayComplete,
  isChampionshipComplete,
  isSingles = false,
  onNavigateTab,
}: PoolPlayOverviewTabProps) {
  const completedPoolMatches = matches.filter((m) => m.status === 'completed').length;
  const totalPoolMatches = matches.length;
  const completedChampMatches = championshipMatches.filter((m) => m.status === 'completed').length;
  const totalChampMatches = championshipMatches.length;

  const totalMatchesAll = totalPoolMatches + totalChampMatches;
  const completedMatchesAll = completedPoolMatches + completedChampMatches;
  const poolPercent =
    totalMatchesAll > 0 ? Math.round((completedMatchesAll / totalMatchesAll) * 100) : 0;

  const participantLabel = isSingles ? 'PLAYERS' : 'TEAMS';

  // Determine stage title and button CTA
  let currentStageText = 'Registration / Setup';
  let ctaLabel = 'Review ' + (isSingles ? 'Players & Pools' : 'Teams & Pools') + ' →';
  let targetTab: string = 'participants';

  if (matches.length > 0 && !isPoolPlayComplete) {
    currentStageText = 'Pool Stage In Progress';
    ctaLabel = 'Enter Pool Match Scores →';
    targetTab = 'matchups';
  } else if (isPoolPlayComplete && championshipMatches.length === 0) {
    currentStageText = 'Pool Stage Complete — Ready for Bracket';
    ctaLabel = 'Open Championship Bracket →';
    targetTab = 'championship';
  } else if (championshipMatches.length > 0 && !isChampionshipComplete) {
    currentStageText = 'Championship Bracket In Progress';
    ctaLabel = 'View Championship Bracket →';
    targetTab = 'championship';
  } else if (isChampionshipComplete) {
    currentStageText = 'Tournament Completed';
    ctaLabel = 'View Final Results & Podium →';
    targetTab = 'results';
  }

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Progress Card ───────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <BarChart2 size={18} color="#0F766E" />
          <View style={styles.headerTitleWrap}>
            <AppText style={styles.cardHeaderTitle}>Tournament Progress</AppText>
            <View style={styles.stagePill}>
              <AppText style={styles.stagePillText}>{currentStageText}</AppText>
            </View>
          </View>
        </View>

        {/* Progress Bar & Summary */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTopRow}>
            <AppText style={styles.progressSubText}>
              {completedPoolMatches} of {totalPoolMatches} pool matches completed
              {totalChampMatches > 0 ? ` • ${completedChampMatches}/${totalChampMatches} bracket` : ''}
            </AppText>
            <AppText style={styles.percentText}>{poolPercent}%</AppText>
          </View>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(100, Math.max(0, poolPercent))}%` },
              ]}
            />
          </View>
        </View>

        {/* 4-Stat Metric Tiles */}
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>{participantLabel}</AppText>
            <Users size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{teams.length}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>POOLS</AppText>
            <Layers size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{pools.length || config.numPools}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>MATCHES</AppText>
            <CheckCircle2 size={15} color="#0F766E" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{completedPoolMatches}/{totalPoolMatches}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>QUALIFIERS</AppText>
            <Trophy size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{config.qualifierCount}</AppText>
          </View>
        </View>

        {/* Quick Action Button */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => onNavigateTab(targetTab)}
          activeOpacity={0.8}
        >
          <AppText style={styles.ctaBtnText}>{ctaLabel}</AppText>
        </TouchableOpacity>
      </Card>

      {/* ─── 2. Pools Breakdown Card ───────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Layers size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Pools Configuration</AppText>
        </View>

        <View style={styles.poolsList}>
          {pools.map((pool) => (
            <View key={pool.key} style={styles.poolRow}>
              <View style={styles.poolKeyBadge}>
                <AppText style={styles.poolKeyText}>Pool {pool.key}</AppText>
              </View>
              <View style={styles.poolDetails}>
                <AppText style={styles.poolTeamCount}>
                  {pool.teams.length} {isSingles ? 'Players' : 'Teams'}
                </AppText>
                <AppText style={styles.poolRating}>
                  Avg Rating: {pool.avgTeamRating ? pool.avgTeamRating.toFixed(2) : '4.00'}
                </AppText>
              </View>
              <TouchableOpacity
                style={styles.poolActionBtn}
                onPress={() => onNavigateTab('participants')}
              >
                <ChevronRight size={16} color="#64748B" />
              </TouchableOpacity>
            </View>
          ))}
          {pools.length === 0 && (
            <AppText style={styles.emptyPoolsText}>
              No teams assigned to pools yet. Configure pools in the {isSingles ? 'Players & Pools' : 'Teams & Pools'} tab.
            </AppText>
          )}
        </View>
      </Card>

      {/* ─── 3. Structure & Advancement Card ───────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldCheck size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Format & Rules</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Tournament Stage</AppText>
            <AppText style={styles.infoVal}>Round Robin Pools + Championship</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Advancement Rule</AppText>
            <AppText style={styles.infoVal}>
              Top {Math.max(1, Math.floor(config.qualifierCount / config.numPools))} per pool advance
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Championship Bracket</AppText>
            <AppText style={styles.infoVal}>{config.bracketType}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Courts Assigned</AppText>
            <AppText style={styles.infoVal}>{config.courts.length} Courts</AppText>
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
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  stagePill: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stagePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F766E',
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
    paddingHorizontal: 4,
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
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  ctaBtn: {
    backgroundColor: '#0F766E',
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ctaBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  poolsList: {
    gap: 8,
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    padding: 10,
    gap: 12,
  },
  poolKeyBadge: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  poolKeyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  poolDetails: {
    flex: 1,
    gap: 2,
  },
  poolTeamCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  poolRating: {
    fontSize: 12,
    color: '#64748B',
  },
  poolActionBtn: {
    padding: 4,
  },
  emptyPoolsText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
    paddingVertical: 8,
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
