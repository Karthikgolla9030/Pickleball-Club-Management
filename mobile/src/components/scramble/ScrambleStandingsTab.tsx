/**
 * Aught2 Pickleball — ScrambleStandingsTab
 *
 * Standardized Standings tab for Scramble Tournament Workspace:
 * Master Reference: Follows Round Robin visual structure and components:
 * - Header Row: Final Standings / Live Standings with status badge (Official / Live / Scheduled)
 * - Clear subtitle explaining purpose
 * - Standard TournamentEmptyCard when no games have been completed
 * - Standard TournamentStandingsTable displaying individual player rank, record, diff, PF, and PA
 * - Standard TournamentTiebreakerCard detailing official scramble ranking priority
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import {
  TournamentEmptyCard,
  TournamentStandingsTable,
  TournamentTiebreakerCard,
  type StandingsTableRowData,
} from '@/components/tournament-management';
import { Radius, Spacing } from '@/theme';
import type { ScrambleStandingRow, ScrambleState } from '@/types/scramble';

interface ScrambleStandingsTabProps {
  state: ScrambleState | null;
  standings: ScrambleStandingRow[];
  isLoading?: boolean;
}

export function ScrambleStandingsTab({
  state,
  standings,
  isLoading: _isLoading = false,
}: ScrambleStandingsTabProps) {
  const isCompleted = state?.tournament_status === 'completed';
  const hasResults =
    standings.length > 0 &&
    standings.some((s) => s.matches_played > 0 || s.wins > 0 || s.losses > 0);
  const inProgress = hasResults && !isCompleted;

  const scrambleTiebreakers = [
    { num: 1, title: 'Match Victories (Wins)', desc: 'Total match wins earned across all scramble rounds' },
    { num: 2, title: 'Point Differential', desc: 'Cumulative points scored minus points allowed' },
    { num: 3, title: 'Total Points Scored (PS)', desc: 'Total points scored across all played rounds' },
    { num: 4, title: 'Fewest Points Allowed (PA)', desc: 'Fewest points conceded to opponents' },
    { num: 5, title: 'Initial Seed / Alphabetical', desc: 'Initial player seed or alphabetical order (A–Z)' },
  ];

  const tableRows: StandingsTableRowData[] = standings.map((item) => ({
    id: item.player_membership_id,
    rank: item.rank,
    name: item.display_name,
    played: item.matches_played,
    won: item.wins,
    lost: item.losses,
    differential: item.points_differential,
    pointsFor: item.points_scored,
    pointsAgainst: item.points_allowed,
  }));

  return (
    <View style={styles.container}>
      {/* ─── 1. Header Row: Title & Status Badge ────────────────────────────── */}
      <View style={styles.headerRow}>
        <AppText style={styles.headingTitle}>
          {isCompleted ? 'Final Standings' : inProgress ? 'Live Standings' : 'Standings'}
        </AppText>
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
            {isCompleted ? 'Official' : inProgress ? 'Live' : 'Scheduled'}
          </AppText>
        </View>
      </View>

      {/* ─── 2. Progress Subtitle ──────────────────────────────────────────── */}
      <AppText style={styles.progressSubtitle}>
        {isCompleted
          ? 'Final individual player rankings based on completed game results.'
          : inProgress
          ? 'Provisional individual rankings updated live as match results are recorded.'
          : 'Rankings will calculate automatically in real-time as match scores are entered.'}
      </AppText>

      {/* ─── 3. Empty State vs Standardized Table ──────────────────────────── */}
      {!hasResults ? (
        <TournamentEmptyCard
          icon={<Trophy size={30} color="#94A3B8" />}
          title="Standings will appear here"
          description="Individual player rankings will calculate automatically as match results are recorded."
        />
      ) : (
        <TournamentStandingsTable
          entityLabel="Player"
          rows={tableRows}
          minTableWidth={460}
        />
      )}

      {/* ─── 4. Standardized Tiebreaker Card ───────────────────────────────── */}
      <TournamentTiebreakerCard
        title="Official scramble ranking order"
        subtitle="Individual standings are determined using the official scramble priority order:"
        rules={scrambleTiebreakers}
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
});
