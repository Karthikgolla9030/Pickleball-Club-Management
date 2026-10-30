/**
 * Aught2 Pickleball — BracketStandingsTab
 *
 * Standardized Standings tab for Bracket Tournament Mode:
 * - Tournament Placements podium card for top finishers (Champion, Runner-Up, 3rd Place)
 * - Standardized table layout matching other tournament formats:
 *   # | Player (or Team) | P | W | L | Diff | PF | PA | Status
 * - Medals for Top 3 (🥇 1, 🥈 2, 🥉 3) and seed badges
 * - Official elimination bracket ranking rules card at the bottom
 */

import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Award, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Match, StandingRow, Team } from '@/types';
import type { BracketProgress } from '@/types/bracket';

export interface BracketStandingsTabProps {
  standings: StandingRow[];
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  teamSize?: number;
  teams?: Team[];
  matches?: Match[];
  progress?: BracketProgress;
  isTournamentCompleted?: boolean;
}

function formatCleanStatus(
  statusStr?: string | null,
  losses = 0
): { label: string; variant: 'success' | 'warning' | 'info' | 'default' } {
  if (!statusStr) {
    return losses > 0
      ? { label: 'Eliminated', variant: 'default' }
      : { label: 'Active', variant: 'info' };
  }

  const s = statusStr.toLowerCase();
  if (s.includes('champion') || s === '1st') {
    return { label: 'Champion 🏆', variant: 'success' };
  }
  if (s.includes('runner') || s === '2nd') {
    return { label: 'Runner-Up 🥈', variant: 'warning' };
  }
  if (s.includes('3rd') || s.includes('third')) {
    return { label: '3rd Place 🥉', variant: 'info' };
  }
  if (s.includes('semi')) {
    return { label: 'Semifinalist', variant: 'info' };
  }
  if (s.includes('quarter')) {
    return { label: 'Quarterfinalist', variant: 'default' };
  }
  if (s.includes('eliminated')) {
    return { label: 'Eliminated', variant: 'default' };
  }
  if (s.includes('active')) {
    return { label: 'Active', variant: 'info' };
  }
  return { label: statusStr, variant: 'default' };
}

export function BracketStandingsTab({
  standings,
  isLoading = false,
  teamSize = 1,
  teams = [],
  progress,
  isTournamentCompleted = false,
}: BracketStandingsTabProps) {
  if (isLoading && standings.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F766E" />
        <AppText style={styles.loadingText}>Loading standings...</AppText>
      </View>
    );
  }

  if (standings.length === 0) {
    return (
      <View style={styles.container}>
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Trophy size={32} color="#102F2B" />
          </View>
          <AppText style={styles.emptyTitle}>Standings will appear here</AppText>
          <AppText style={styles.emptySubtitle}>
            Standings and tournament placements will be calculated as bracket matches are completed.
          </AppText>
        </Card>
      </View>
    );
  }

  const champion = standings.find(
    (s) => s.status?.toLowerCase().includes('champion') || (s.rank === 1 && s.status !== 'Active')
  );
  const runnerUp = standings.find((s) => s.status?.toLowerCase().includes('runner') || s.rank === 2);
  const thirdPlace = standings.find((s) => s.status?.toLowerCase().includes('3rd') || s.rank === 3);

  const getTeamMembersText = (teamId?: string | null) => {
    if (!teamId || teams.length === 0) return null;
    const found = teams.find((t) => t.id === teamId);
    if (!found || found.members.length === 0) return null;
    const m1 = found.members[0];
    const m2 = found.members[1];
    const n1 = m1?.display_name || m1?.user_email || 'Player 1';
    if (!m2) return n1;
    const n2 = m2.display_name || m2.user_email || 'Player 2';
    return `${n1} & ${n2}`;
  };

  const rankingRules = [
    { num: 1, title: 'Round Reached', desc: 'Furthest bracket round advanced (Finals, Semifinals, etc.)' },
    { num: 2, title: 'Match Victories', desc: 'Total match wins earned throughout the tournament' },
    { num: 3, title: 'Point Differential', desc: 'Points scored minus points allowed across all matches' },
    { num: 4, title: 'Total Points Scored', desc: 'Total points scored across all played matches' },
    { num: 5, title: 'Tournament Seed', desc: 'Initial seeded position assigned prior to bracket generation' },
  ];

  const inProgress = progress && progress.completedMatches > 0 && !isTournamentCompleted;

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Placements Podium Card ─────────────────────────── */}
      {champion && (
        <Card style={styles.podiumCard}>
          <View style={styles.podiumHeader}>
            <Award size={20} color="#D97706" />
            <AppText style={styles.podiumTitle}>Tournament Placements</AppText>
          </View>

          <View style={styles.podiumRows}>
            <View style={styles.podiumRow}>
              <View style={[styles.placePill, { backgroundColor: '#FEF3C7' }]}>
                <AppText style={[styles.placePillText, { color: '#B45309' }]}>🥇 1st</AppText>
              </View>
              <AppText style={styles.podiumTeamName} numberOfLines={1}>
                {champion.team_name}
              </AppText>
              <Badge label="CHAMPION" variant="success" />
            </View>

            {runnerUp && (
              <View style={styles.podiumRow}>
                <View style={[styles.placePill, { backgroundColor: '#F1F5F9' }]}>
                  <AppText style={[styles.placePillText, { color: '#475569' }]}>🥈 2nd</AppText>
                </View>
                <AppText style={styles.podiumTeamName} numberOfLines={1}>
                  {runnerUp.team_name}
                </AppText>
                <Badge label="RUNNER-UP" variant="warning" />
              </View>
            )}

            {thirdPlace && (
              <View style={styles.podiumRow}>
                <View style={[styles.placePill, { backgroundColor: '#FFEDD5' }]}>
                  <AppText style={[styles.placePillText, { color: '#C2410C' }]}>🥉 3rd</AppText>
                </View>
                <AppText style={styles.podiumTeamName} numberOfLines={1}>
                  {thirdPlace.team_name}
                </AppText>
                <Badge label="3RD PLACE" variant="info" />
              </View>
            )}
          </View>
        </Card>
      )}

      {/* ─── 2. Header Row: Title & Completion Status ───────────────────────── */}
      <View style={styles.headerRow}>
        <AppText style={styles.headingTitle}>
          Tournament Standings ({standings.length})
        </AppText>
        <View
          style={[
            styles.statusBadge,
            isTournamentCompleted
              ? styles.statusBadgeCompleted
              : inProgress
              ? styles.statusBadgeProgress
              : styles.statusBadgeNotStarted,
          ]}
        >
          <AppText
            style={[
              styles.statusBadgeText,
              isTournamentCompleted
                ? styles.statusBadgeTextCompleted
                : inProgress
                ? styles.statusBadgeTextProgress
                : styles.statusBadgeTextNotStarted,
            ]}
          >
            {isTournamentCompleted ? 'Completed' : inProgress ? 'IN PROGRESS' : 'Not started'}
          </AppText>
        </View>
      </View>

      {progress && (
        <AppText style={styles.progressSubtitle}>
          {progress.completedMatches} of {progress.totalMatches} matches completed ({progress.percentComplete}%)
        </AppText>
      )}

      {/* ─── 3. Standardized Standings Table Card ───────────────────────────── */}
      <Card style={styles.tableCard}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tableScrollContent}
        >
          <View style={styles.tableInnerContainer}>
            {/* Table Header Row */}
            <View style={styles.tableHeader}>
              <AppText style={[styles.colHeader, styles.colRank]}>#</AppText>
              <AppText style={[styles.colHeader, styles.colTeam]}>
                {teamSize > 1 ? 'Team / Players' : 'Player'}
              </AppText>
              <AppText style={[styles.colHeader, styles.colStat]}>P</AppText>
              <AppText style={[styles.colHeader, styles.colStat]}>W</AppText>
              <AppText style={[styles.colHeader, styles.colStat]}>L</AppText>
              <AppText style={[styles.colHeader, styles.colStat]}>Diff</AppText>
              <AppText style={[styles.colHeader, styles.colStat]}>PF</AppText>
              <AppText style={[styles.colHeader, styles.colStat]}>PA</AppText>
              <AppText style={[styles.colHeader, styles.colStatus]}>Status</AppText>
            </View>

            {/* Table Data Rows */}
            {standings.map((row, idx) => {
              const isDiffPositive = row.points_differential > 0;
              const isDiffNegative = row.points_differential < 0;
              const statusConfig = formatCleanStatus(row.status, row.losses);
              const membersText = getTeamMembersText(row.team_id);
              const isTop1 = row.rank === 1;
              const isTop2 = row.rank === 2;
              const isTop3 = row.rank === 3;

              return (
                <View
                  key={row.team_id || `bracket-standing-${idx}`}
                  style={[
                    styles.tableRow,
                    isTop1 && styles.tableRowTop1,
                    idx === standings.length - 1 && styles.tableRowLast,
                  ]}
                >
                  {/* Rank Column with Medals for Top 3 */}
                  <View style={[styles.colRank, styles.rankCenter]}>
                    {isTop1 ? (
                      <View style={[styles.rankMedal, { backgroundColor: '#FEF3C7' }]}>
                        <AppText style={[styles.rankMedalText, { color: '#B45309' }]}>1</AppText>
                      </View>
                    ) : isTop2 ? (
                      <View style={[styles.rankMedal, { backgroundColor: '#F1F5F9' }]}>
                        <AppText style={[styles.rankMedalText, { color: '#475569' }]}>2</AppText>
                      </View>
                    ) : isTop3 ? (
                      <View style={[styles.rankMedal, { backgroundColor: '#FFEDD5' }]}>
                        <AppText style={[styles.rankMedalText, { color: '#C2410C' }]}>3</AppText>
                      </View>
                    ) : (
                      <AppText style={[styles.cellText, styles.rankNum]}>
                        {row.rank}
                      </AppText>
                    )}
                  </View>

                  {/* Player / Team Column */}
                  <View style={styles.colTeam}>
                    <View style={styles.teamTitleRow}>
                      {row.team_seed !== null && row.team_seed !== undefined && (
                        <View style={styles.seedBadge}>
                          <AppText style={styles.seedBadgeText}>#{row.team_seed}</AppText>
                        </View>
                      )}
                      <AppText style={styles.teamNameText} numberOfLines={1}>
                        {row.team_name}
                      </AppText>
                    </View>
                    {teamSize > 1 && membersText && (
                      <AppText style={styles.teamMembersSub} numberOfLines={1}>
                        {membersText}
                      </AppText>
                    )}
                  </View>

                  {/* Matches Played (P) */}
                  <AppText style={[styles.cellText, styles.colStat]}>
                    {row.matches_played}
                  </AppText>

                  {/* Wins (W) */}
                  <AppText style={[styles.cellText, styles.colStat, styles.boldStat]}>
                    {row.wins}
                  </AppText>

                  {/* Losses (L) */}
                  <AppText style={[styles.cellText, styles.colStat]}>
                    {row.losses}
                  </AppText>

                  {/* Points Differential (Diff) */}
                  <AppText
                    style={[
                      styles.cellText,
                      styles.colStat,
                      isDiffPositive && styles.positiveDiff,
                      isDiffNegative && styles.negativeDiff,
                    ]}
                  >
                    {isDiffPositive ? `+${row.points_differential}` : row.points_differential}
                  </AppText>

                  {/* Points For (PF) */}
                  <AppText style={[styles.cellText, styles.colStat]}>
                    {row.points_scored}
                  </AppText>

                  {/* Points Allowed (PA) */}
                  <AppText style={[styles.cellText, styles.colStat]}>
                    {row.points_allowed}
                  </AppText>

                  {/* Status Badge */}
                  <View style={styles.colStatus}>
                    <Badge label={statusConfig.label} variant={statusConfig.variant} />
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </Card>

      {/* ─── 4. Official Ranking Rules Card ────────────────────────────────── */}
      <Card style={styles.tiebreakerCard}>
        <View style={styles.tiebreakerHeader}>
          <Award size={18} color="#EA580C" />
          <AppText style={styles.tiebreakerHeading}>
            Official elimination bracket ranking rules
          </AppText>
        </View>

        <AppText style={styles.tiebreakerSubtitle}>
          Standings and final tournament placements are determined by:
        </AppText>

        <View style={styles.tiebreakerList}>
          {rankingRules.map((item) => (
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
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  loadingContainer: {
    padding: Spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
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
    maxWidth: 280,
    lineHeight: 18,
  },
  podiumCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: Spacing[4],
    gap: Spacing[3],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  podiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  podiumTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  podiumRows: {
    gap: 8,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  placePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placePillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  podiumTeamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102F2B',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusBadgeNotStarted: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeProgress: {
    backgroundColor: '#EAF6EF',
  },
  statusBadgeCompleted: {
    backgroundColor: '#EAF6EF',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusBadgeTextNotStarted: {
    color: '#D97706',
  },
  statusBadgeTextProgress: {
    color: '#087A60',
  },
  statusBadgeTextCompleted: {
    color: '#087A60',
  },
  progressSubtitle: {
    fontSize: 12,
    color: '#71817E',
    marginTop: -4,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    padding: Spacing[3],
    gap: Spacing[2],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tableScrollContent: {
    paddingHorizontal: 0,
  },
  tableInnerContainer: {
    minWidth: 540,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#DDE8E2',
  },
  colHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71817E',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAF9',
  },
  tableRowTop1: {
    backgroundColor: '#FCFDFB',
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  cellText: {
    fontSize: 12,
    color: '#102F2B',
  },
  colRank: {
    width: 28,
  },
  rankCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontWeight: '700',
    textAlign: 'center',
  },
  rankMedal: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMedalText: {
    fontSize: 11,
    fontWeight: '800',
  },
  colTeam: {
    flex: 1,
    paddingHorizontal: Spacing[2],
    gap: 1,
    minWidth: 150,
  },
  teamTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: Radius.sm,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 10,
    lineHeight: 12,
  },
  teamNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2B',
    flexShrink: 1,
  },
  teamMembersSub: {
    fontSize: 10,
    color: '#64748B',
  },
  colStat: {
    width: 38,
    textAlign: 'center',
  },
  boldStat: {
    fontWeight: '700',
    color: '#087A60',
  },
  positiveDiff: {
    color: '#087A60',
    fontWeight: '700',
  },
  negativeDiff: {
    color: '#DC2626',
    fontWeight: '700',
  },
  colStatus: {
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 6,
  },
  tiebreakerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    padding: Spacing[4],
    gap: 10,
    marginTop: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
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
    lineHeight: 15,
  },
});
