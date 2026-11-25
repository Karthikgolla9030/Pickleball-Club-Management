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
  Info,
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
  tournament,
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

  // Check if pools and schedule have actually been generated
  const isPoolsGenerated =
    matches.length > 0 ||
    Boolean((tournament?.format_configuration as any)?.is_format_configured) ||
    Boolean((tournament?.format_configuration as any)?.is_generated) ||
    Boolean((tournament?.format_configuration as any)?.pools_generated) ||
    tournament?.status === 'in_progress' ||
    tournament?.status === 'completed';

  const isRegistrationClosed = tournament?.status === 'registration_closed';
  const hasMinTeams = teams.length >= 4;
  const isAwaitingFormatSetup = isRegistrationClosed && !isPoolsGenerated;

  let currentStageText = 'Registration / Setup';
  let ctaLabel = 'Review ' + (isSingles ? 'Players' : 'Teams') + ' →';
  let targetTab: string = 'participants';

  if (isAwaitingFormatSetup) {
    if (!hasMinTeams) {
      currentStageText = 'Waiting for Teams';
      ctaLabel = 'Review Confirmed ' + (isSingles ? 'Players' : 'Teams') + ' →';
      targetTab = 'participants';
    } else {
      currentStageText = 'Awaiting Format Setup';
      ctaLabel = 'Configure Pool Play in Setup & Courts →';
      targetTab = 'setup_courts';
    }
  } else if (isPoolsGenerated && !isPoolPlayComplete) {
    currentStageText = 'Pool Stage In Progress';
    ctaLabel = totalPoolMatches > 0 ? 'Enter Pool Match Scores →' : 'View Schedule in Setup & Courts →';
    targetTab = totalPoolMatches > 0 ? 'matchups' : 'setup_courts';
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
              {!isPoolsGenerated
                ? isRegistrationClosed
                  ? hasMinTeams
                    ? 'Roster locked • Configure pools in Setup & Courts to schedule matches'
                    : `Roster locked • Requires at least 4 confirmed teams (${teams.length} confirmed)`
                  : 'Registration open • Teams will be configured after registration closes'
                : `${completedPoolMatches} of ${totalPoolMatches} pool matches completed${
                    totalChampMatches > 0 ? ` • ${completedChampMatches}/${totalChampMatches} bracket` : ''
                  }`}
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
            <AppText style={styles.statTileNum}>
              {isPoolsGenerated && pools.length > 0 ? pools.length : 'Pending'}
            </AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>MATCHES</AppText>
            <CheckCircle2 size={15} color="#0F766E" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>
              {!isPoolsGenerated || totalPoolMatches === 0
                ? 'Pending'
                : `${completedPoolMatches}/${totalPoolMatches}`}
            </AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>QUALIFIERS</AppText>
            <Trophy size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>
              {isPoolsGenerated ? config.qualifierCount : 'Pending'}
            </AppText>
          </View>
        </View>

        {/* Information Strip */}
        <View style={styles.infoStrip}>
          <Info size={14} color="#0284C7" />
          <AppText style={styles.infoStripText}>
            {!isPoolsGenerated
              ? isRegistrationClosed
                ? hasMinTeams
                  ? 'Registration is closed. Configure pool count and playoff qualifiers in Setup & Courts to generate schedule.'
                  : `Registration is closed. Pool Play requires at least 4 confirmed teams (currently ${teams.length} confirmed).`
                : 'Registration is open. Pool count, distribution, and qualifiers will be configured after registration closes.'
              : `Intra-pool round robin stage. Top ${Math.max(
                  1,
                  Math.floor(config.qualifierCount / Math.max(1, pools.length || config.numPools))
                )} per pool advance to championship bracket.`}
          </AppText>
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

        {isPoolsGenerated && pools.length > 0 ? (
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
                    {pool.avgTeamRating > 0
                      ? `Avg Rating: ${pool.avgTeamRating.toFixed(2)}`
                      : 'Avg Rating: —'}
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
          </View>
        ) : (
          <View style={styles.emptyPoolsNoticeBox}>
            <AppText style={styles.emptyPoolsNoticeTitle}>
              {!isRegistrationClosed
                ? 'Pools Configured Post-Registration'
                : !hasMinTeams
                ? 'Waiting for Confirmed Teams'
                : 'Pools Awaiting Generation'}
            </AppText>
            <AppText style={styles.emptyPoolsNoticeDesc}>
              {!isRegistrationClosed
                ? 'Pools and team assignments will be configured in Setup & Courts after registration closes and confirmed participants are known.'
                : !hasMinTeams
                ? `Pool Play requires at least 4 confirmed teams (currently ${teams.length} confirmed). Pools cannot be configured until the minimum requirement is met.`
                : 'Confirmed teams are ready. Go to Setup & Courts to configure pool distribution and generate the tournament schedule.'}
            </AppText>
            {isRegistrationClosed && hasMinTeams && (
              <TouchableOpacity
                style={styles.emptyPoolsActionBtn}
                onPress={() => onNavigateTab('setup_courts')}
                activeOpacity={0.8}
              >
                <AppText style={styles.emptyPoolsActionBtnText}>
                  Configure in Setup & Courts →
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2.5],
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
    gap: 8,
  },
  progressSubText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flex: 1,
    flexShrink: 1,
  },
  percentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
    flexShrink: 0,
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
    flexWrap: 'wrap',
    gap: 8,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
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
  emptyPoolsNoticeBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    padding: Spacing[3.5],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  emptyPoolsNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyPoolsNoticeDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  emptyPoolsActionBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#0F766E',
    borderRadius: Radius.sm,
  },
  emptyPoolsActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoList: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 0,
    maxWidth: '48%',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    flexShrink: 1,
    textAlign: 'right',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
});
