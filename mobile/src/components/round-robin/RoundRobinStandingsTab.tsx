/**
 * Aught2 Pickleball — RoundRobinStandingsTab (Live Standings Screen)
 *
 * Screen 3 for Round Robin Tournament Mode — Master Reference:
 * - Heading: Live Standings with status badge (Official / Live / Scheduled)
 * - Clear subtitle explaining purpose
 * - Empty state: Trophy card explaining rankings are calculated automatically
 * - Populated state: Standings table displaying Rank, Team / Players, P, W, L, Diff, PF, PA
 * - Official tiebreaker order card: Always displayed with 4-level hierarchy:
 *   1. Wins, 2. Point differential, 3. Total points scored, 4. Team name (A-Z)
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
  const { isCompleted, completedMatches } = progress;
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

  const tableRows: StandingsTableRowData[] = standings.map((row) => ({
    id: row.team_id,
    rank: row.rank,
    name: row.team_name,
    subtitle: teamSize > 1 ? getTeamMembersText(row.team_id) : null,
    played: row.matches_played,
    won: row.wins,
    lost: row.losses,
    differential: row.points_differential,
    pointsFor: row.points_scored,
    pointsAgainst: row.points_allowed,
  }));

  return (
    <View style={styles.container}>
      {/* Header Row: Title & Status Badge */}
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

      {/* Standings Subtitle */}
      <AppText style={styles.progressSubtitle}>
        {isCompleted
          ? 'Final tournament rankings determined by official tiebreaker rules.'
          : inProgress
          ? 'Provisional rankings updated live as match scores are entered.'
          : 'Rankings will calculate automatically once matches begin.'}
      </AppText>

      {/* Empty State vs Standings Table */}
      {standings.length === 0 || completedMatches === 0 ? (
        <TournamentEmptyCard
          icon={<Trophy size={30} color="#94A3B8" />}
          title="Standings will appear here"
          description="Record match results to calculate rankings automatically."
        />
      ) : (
        /* Populated Standings Table */
        <TournamentStandingsTable
          entityLabel={teamSize > 1 ? 'Team / Players' : 'Player'}
          rows={tableRows}
        />
      )}

      {/* Official Tiebreaker Order Card (Always Visible) */}
      <TournamentTiebreakerCard
        title="Official tiebreaker order"
        subtitle="Standings are calculated using the following priority order:"
        rules={tiebreakers}
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
