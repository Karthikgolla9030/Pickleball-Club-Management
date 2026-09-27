/**
 * Aught2 Pickleball — RoundRobinStandingsTab (Live Standings Screen)
 *
 * Screen 3 for Round Robin Tournament Mode:
 * - Heading: Live Standings with status badge (e.g. Not started / In Progress / Completed)
 * - Completion summary: X of Y matches completed (Z%)
 * - Empty state: Trophy card explaining rankings are calculated automatically
 * - Populated state: Standings table displaying Rank, Team / Players, P, W, L, Diff, PF, PA
 * - Official tiebreaker order card: Always displayed with 4-level hierarchy:
 *   1. Wins, 2. Point differential, 3. Total points scored, 4. Team name (A-Z)
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Trophy, Award } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { StandingRow, Team } from '@/types';
import type { RoundRobinProgress } from '@/types/roundRobin';

interface RoundRobinStandingsTabProps {
  standings: StandingRow[];
  progress: RoundRobinProgress;
  teams?: Team[];
  teamSize?: number;
}

export function RoundRobinStandingsTab({
  standings,
  progress,
  teams = [],
  teamSize = 1,
}: RoundRobinStandingsTabProps) {
  const { isCompleted, completedMatches, totalMatches, completionPercentage } = progress;
  const inProgress = completedMatches > 0 && !isCompleted;

  const tiebreakers = [
    { num: 1, title: 'Wins', desc: 'Total match victories (Descending)' },
    { num: 2, title: 'Point differential', desc: 'Points scored minus points allowed (Descending)' },
    { num: 3, title: 'Total points scored', desc: 'Total points scored (Descending)' },
    { num: 4, title: 'Team name (A–Z)', desc: 'Alphabetical order (Ascending, case-insensitive)' },
  ];

  const getTeamMembersText = (teamId?: string | null) => {
    if (!teamId) return null;
    const found = teams.find((t) => t.id === teamId);
    if (!found || found.members.length === 0) return null;
    const m1 = found.members[0];
    const m2 = found.members[1];
    const n1 = m1?.display_name || m1?.user_email || 'Player 1';
    if (!m2) return n1;
    const n2 = m2.display_name || m2.user_email || 'Player 2';
    return `${n1} & ${n2}`;
  };

  return (
    <View style={styles.container}>
      {/* Header Row: Title & Status Badge */}
      <View style={styles.headerRow}>
        <AppText style={styles.headingTitle}>Live Standings</AppText>
        <View
          style={[
            styles.statusBadge,
            isCompleted
              ? styles.statusBadgeCompleted
              : inProgress
              ? styles.statusBadgeProgress
              : styles.statusBadgeNotStarted,
          ]}
        >
          <AppText
            style={[
              styles.statusBadgeText,
              isCompleted
                ? styles.statusBadgeTextCompleted
                : inProgress
                ? styles.statusBadgeTextProgress
                : styles.statusBadgeTextNotStarted,
            ]}
          >
            {isCompleted ? 'Completed' : inProgress ? 'IN PROGRESS' : 'Not started'}
          </AppText>
        </View>
      </View>

      {/* Completion Subtitle */}
      <AppText style={styles.progressSubtitle}>
        {completedMatches} of {totalMatches} matches completed ({completionPercentage}%)
      </AppText>

      {/* Empty State vs Standings Table */}
      {standings.length === 0 || completedMatches === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Trophy size={30} color="#94A3B8" />
          </View>
          <AppText style={styles.emptyHeading}>
            Standings will appear here
          </AppText>
          <AppText style={styles.emptySubtitle}>
            Record match results to calculate rankings automatically.
          </AppText>
        </Card>
      ) : (
        /* Populated Standings Table */
        <Card style={styles.tableCard}>
          {/* Header Row */}
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
          </View>

          {/* Rows */}
          {standings.map((row) => {
            const isDiffPositive = row.points_differential > 0;
            const membersText = getTeamMembersText(row.team_id);

            return (
              <View key={row.team_id} style={styles.tableRow}>
                <AppText style={[styles.cellText, styles.colRank, styles.rankNum]}>
                  {row.rank}
                </AppText>

                <View style={styles.colTeam}>
                  <AppText style={styles.teamNameText} numberOfLines={1}>
                    {row.team_name}
                  </AppText>
                  {teamSize > 1 && membersText && (
                    <AppText style={styles.teamMembersSub} numberOfLines={1}>
                      {membersText}
                    </AppText>
                  )}
                </View>

                {/* Matches Played */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.matches_played}
                </AppText>

                {/* Wins */}
                <AppText style={[styles.cellText, styles.colStat, styles.boldStat]}>
                  {row.wins}
                </AppText>

                {/* Losses */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.losses}
                </AppText>

                {/* Points Differential */}
                <AppText
                  style={[
                    styles.cellText,
                    styles.colStat,
                    isDiffPositive && styles.positiveDiff,
                  ]}
                >
                  {isDiffPositive ? `+${row.points_differential}` : row.points_differential}
                </AppText>

                {/* Points For */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.points_scored}
                </AppText>

                {/* Points Allowed */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.points_allowed}
                </AppText>
              </View>
            );
          })}
        </Card>
      )}

      {/* Official Tiebreaker Order Card (Always Visible) */}
      <Card style={styles.tiebreakerCard}>
        <View style={styles.tiebreakerHeader}>
          <Award size={18} color="#EA580C" />
          <AppText style={styles.tiebreakerHeading}>
            Official tiebreaker order
          </AppText>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeading: {
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
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    padding: Spacing[3],
    gap: Spacing[2],
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
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAF9',
  },
  cellText: {
    fontSize: 12,
    color: '#102F2B',
  },
  colRank: {
    width: 22,
    textAlign: 'center',
  },
  rankNum: {
    fontWeight: '700',
  },
  colTeam: {
    flex: 1,
    paddingHorizontal: Spacing[2],
    gap: 1,
  },
  teamNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2B',
  },
  teamMembersSub: {
    fontSize: 10,
    color: '#64748B',
  },
  colStat: {
    width: 28,
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
