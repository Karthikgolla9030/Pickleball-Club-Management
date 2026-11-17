/**
 * Aught2 Pickleball — BracketStandingsTab
 *
 * Standardized Standings tab for Bracket Tournament Mode:
 * Master Reference: Follows Round Robin visual structure and components:
 * - Header Row: Final Standings / Live Standings with status badge (Official / Live / Scheduled)
 * - Clear subtitle explaining purpose
 * - Standard TournamentEmptyCard when no completed matches exist
 * - Standard TournamentStandingsTable with Rank, Team/Player, P, W, L, Diff, PF, PA, and Status badge
 * - Standard TournamentTiebreakerCard detailing official elimination ranking criteria
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import {
  TournamentEmptyCard,
  TournamentStandingsTable,
  TournamentTiebreakerCard,
  type StandingsTableRowData,
} from '@/components/tournament-management';
import { Radius, Spacing } from '@/theme';
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

  const inProgress = progress && progress.completedMatches > 0 && !isTournamentCompleted;

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

  const tableRows: StandingsTableRowData[] = standings.map((row) => ({
    id: row.team_id,
    rank: row.rank,
    name: row.team_name,
    seed: row.team_seed,
    subtitle: teamSize > 1 ? getTeamMembersText(row.team_id) : null,
    played: row.matches_played,
    won: row.wins,
    lost: row.losses,
    differential: row.points_differential,
    pointsFor: row.points_scored,
    pointsAgainst: row.points_allowed,
    statusBadge: formatCleanStatus(row.status, row.losses),
  }));

  return (
    <View style={styles.container}>
      {/* ─── 1. Header Row: Title & Status Badge ────────────────────────────── */}
      <View style={styles.headerRow}>
        <AppText style={styles.headingTitle}>
          {isTournamentCompleted ? 'Final Standings' : inProgress ? 'Live Standings' : 'Standings'}
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
            {isTournamentCompleted ? 'Official' : inProgress ? 'Live' : 'Scheduled'}
          </AppText>
        </View>
      </View>

      {/* ─── 2. Progress Subtitle ──────────────────────────────────────────── */}
      <AppText style={styles.progressSubtitle}>
        {isTournamentCompleted
          ? 'Final elimination rankings based on bracket progression and tiebreakers.'
          : inProgress
          ? 'Provisional rankings updated live as bracket match results are entered.'
          : 'Rankings will calculate automatically as bracket matches are played.'}
      </AppText>

      {/* ─── 3. Empty State vs Standardized Table ──────────────────────────── */}
      {standings.length === 0 ? (
        <TournamentEmptyCard
          icon={<Trophy size={30} color="#94A3B8" />}
          title="Standings will appear here"
          description="Standings and tournament placements will be calculated as bracket matches are completed."
        />
      ) : (
        <TournamentStandingsTable
          entityLabel={teamSize > 1 ? 'Team / Players' : 'Player'}
          rows={tableRows}
          showStatusColumn={true}
          minTableWidth={520}
        />
      )}

      {/* ─── 4. Standardized Elimination Ranking Rules Card ────────────────── */}
      <TournamentTiebreakerCard
        title="Official elimination ranking rules"
        subtitle="Standings are determined by bracket advancement and the following rules:"
        rules={rankingRules}
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
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
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
