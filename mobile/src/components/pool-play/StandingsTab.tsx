/**
 * Aught2 Pickleball — StandingsTab (Tab 3 for Pool Play)
 *
 * Master Reference: Follows Round Robin visual structure and components:
 * - Header Row: Final Standings / Live Standings with status badge (Official / Live / Scheduled)
 * - Clear subtitle explaining purpose
 * - Standard TournamentEmptyCard when no matchups / results exist
 * - Per-pool standings using standard TournamentRoundHeading and TournamentStandingsTable
 * - Standard TournamentTiebreakerCard detailing official tiebreaker rules (Wins -> Diff -> PF -> Head-to-Head)
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import {
  TournamentEmptyCard,
  TournamentRoundHeading,
  TournamentStandingsTable,
  TournamentTiebreakerCard,
  type StandingsTableRowData,
} from '@/components/tournament-management';
import { Radius, Spacing } from '@/theme';
import type { Match, PoolStandingRow, PoolStat } from '@/types/poolPlay';

interface StandingsTabProps {
  pools: PoolStat[];
  standingsByPool: Record<string, PoolStandingRow[]>;
  isPoolPlayComplete: boolean;
  onAdvanceToBracket: () => void;
  hasMatchups?: boolean;
  matches?: Match[];
  qualifierCountPerPool?: number;
  onGoToMatchups?: () => void;
  hasChampionshipBracket?: boolean;
  isTournamentCompleted?: boolean;
  onNavigateToBracket?: () => void;
}

export function StandingsTab({
  pools,
  standingsByPool,
  isPoolPlayComplete,
  onAdvanceToBracket,
  hasMatchups = false,
  matches,
  onGoToMatchups,
  hasChampionshipBracket = false,
  isTournamentCompleted = false,
  onNavigateToBracket,
}: StandingsTabProps) {
  // Empty State before matchups are generated
  if (!hasMatchups) {
    return (
      <View style={styles.container}>
        <TournamentEmptyCard
          icon={<Trophy size={30} color="#94A3B8" />}
          title="Standings will appear here"
          description="Generate pool matchups and record match results to see live standings."
          actionButton={
            onGoToMatchups ? (
              <Button
                label="Go to Matchups ➔"
                variant="primary"
                size="sm"
                onPress={onGoToMatchups}
              />
            ) : undefined
          }
        />
      </View>
    );
  }

  const poolMatches = matches || [];
  const completedMatchesCount = poolMatches.filter((m) => m.status === 'completed').length;
  const inProgress = completedMatchesCount > 0 && !isPoolPlayComplete && !isTournamentCompleted;
  const isFinal = isTournamentCompleted || isPoolPlayComplete;

  const poolTiebreakers = [
    { num: 1, title: 'Match Victories (Wins)', desc: 'Total intra-pool match victories (Descending)' },
    { num: 2, title: 'Point Differential', desc: 'Points scored minus points allowed across all pool matches' },
    { num: 3, title: 'Total Points Scored', desc: 'Total points scored across all played pool matches' },
    { num: 4, title: 'Head-to-Head Result', desc: 'Direct match outcome between tied teams if applicable' },
  ];

  return (
    <View style={styles.container}>
      {/* ─── 1. Header Row: Title & Status Badge ────────────────────────────── */}
      <View style={styles.headerRow}>
        <AppText style={styles.headingTitle}>
          {isFinal ? 'Final Standings' : inProgress ? 'Live Standings' : 'Standings'}
        </AppText>
        <View
          style={[
            styles.statusBadge,
            isFinal
              ? styles.statusBadgeCompleted
              : inProgress
              ? styles.statusBadgeProgress
              : styles.statusBadgeNotStarted,
          ]}
        >
          <AppText
            style={[
              styles.statusBadgeText,
              isFinal
                ? styles.statusBadgeTextCompleted
                : inProgress
                ? styles.statusBadgeTextProgress
                : styles.statusBadgeTextNotStarted,
            ]}
          >
            {isFinal ? 'Official' : inProgress ? 'Live' : 'Scheduled'}
          </AppText>
        </View>
      </View>

      {/* ─── 2. Progress Subtitle ──────────────────────────────────────────── */}
      <AppText style={styles.progressSubtitle}>
        {isFinal
          ? 'Final pool rankings and qualification seeds determined by official tiebreaker rules.'
          : inProgress
          ? 'Provisional pool rankings updated live as match results are entered.'
          : 'Rankings will calculate automatically as pool matches are played.'}
      </AppText>

      {/* ─── 3. Per-Pool Standings Tables ──────────────────────────────────── */}
      {pools.map((pool) => {
        const rows = standingsByPool[pool.key] || [];
        const poolSpecificMatches = poolMatches.filter((m) => m.pool === pool.key);
        const completedPoolCount = poolSpecificMatches.filter((m) => m.status === 'completed').length;
        const isPoolComplete =
          poolSpecificMatches.length > 0 && completedPoolCount === poolSpecificMatches.length;

        const tableRows: StandingsTableRowData[] = rows.map((r) => {
          const membersSub = r.team ? `${r.team.p1.name} & ${r.team.p2.name}` : undefined;
          return {
            id: r.team.id,
            rank: r.rank,
            name: r.team.name,
            subtitle: membersSub,
            played: r.played,
            won: r.won,
            lost: r.lost,
            differential: r.differential,
            pointsFor: r.pointsFor,
            pointsAgainst: r.pointsAgainst,
            statusBadge: r.qualifies
              ? { label: 'Qualified', variant: 'success' }
              : null,
          };
        });

        return (
          <View key={pool.key} style={styles.poolSection}>
            {/* Standard Round / Section Header */}
            <TournamentRoundHeading
              title={`POOL ${pool.key} STANDINGS`}
              badgeLabel={isPoolComplete ? 'Final' : completedPoolCount > 0 ? 'Live' : 'Scheduled'}
              badgeVariant={isPoolComplete ? 'success' : 'default'}
            />

            {/* Standardized Standings Table */}
            <TournamentStandingsTable
              entityLabel="Team / Players"
              rows={tableRows}
              showStatusColumn={true}
              minTableWidth={520}
            />
          </View>
        );
      })}

      {/* ─── 4. Standardized Tiebreaker Card ───────────────────────────────── */}
      <TournamentTiebreakerCard
        title="Official pool tiebreaker order"
        subtitle="Pool rankings and championship bracket qualifications are determined by:"
        rules={poolTiebreakers}
      />
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
  poolSection: {
    gap: Spacing[2],
  },
});
