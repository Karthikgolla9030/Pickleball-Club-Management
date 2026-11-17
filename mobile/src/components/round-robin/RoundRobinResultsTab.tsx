/**
 * Aught2 Pickleball — RoundRobinResultsTab (Results Screen)
 *
 * Screen 4 for Round Robin Tournament Mode — Master Reference:
 * - Heading: Results
 * - Tournament Champion Podium Card: Displays when all matches completed or tournament completed
 * - Empty state: When no results recorded yet
 * - Populated state: Completed match results grouped by round with scores, court info, and winner display
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FileText, Award } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import {
  TournamentChampionCard,
  TournamentEmptyCard,
  TournamentResultMatchCard,
  TournamentRoundHeading,
} from '@/components/tournament-management';
import { Spacing } from '@/theme';
import type { Court, Match, StandingRow, Team, Tournament } from '@/types';
import { groupMatchesByRound } from '@/utils/roundRobinLogic';
import { getCourtDisplayLabel } from '@/utils';

interface RoundRobinResultsTabProps {
  tournament?: Tournament | null;
  standings?: StandingRow[];
  teams?: Team[];
  matches: Match[];
  courts: Court[];
  canManage: boolean;
  onEditScore: (match: Match) => void;
}

export function RoundRobinResultsTab({
  tournament,
  standings = [],
  teams = [],
  matches,
  courts,
  canManage,
  onEditScore,
}: RoundRobinResultsTabProps) {
  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === 'completed'),
    [matches]
  );

  const completedRounds = useMemo(
    () => groupMatchesByRound(completedMatches),
    [completedMatches]
  );

  const isTournamentCompleted =
    tournament?.status === 'completed' ||
    (matches.length > 0 && completedMatches.length === matches.length);

  const championStanding = isTournamentCompleted && standings.length > 0 ? standings[0] : null;

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

  const getCourtName = (match: Match) => {
    const label = getCourtDisplayLabel(match, { unassignedLabel: '', unresolvedLabel: '' });
    if (label) return label;
    if (match.court_id) {
      const found = courts.find((c) => c.id === match.court_id);
      if (found) {
        const foundLabel = getCourtDisplayLabel(found, { unassignedLabel: '', unresolvedLabel: '' });
        if (foundLabel) return foundLabel;
      }
    }
    return 'Court';
  };

  return (
    <View style={styles.container}>
      {/* Heading */}
      <AppText style={styles.headingTitle}>Results</AppText>

      {/* Champion Podium Card when tournament completed */}
      {isTournamentCompleted && championStanding && (
        <TournamentChampionCard
          badgeLabel="TOURNAMENT CHAMPION"
          championName={championStanding.team_name}
          subtitle={getTeamMembersText(championStanding.team_id)}
          statPills={[
            {
              icon: <Award size={13} color="#087A60" />,
              text: `${championStanding.wins}W – ${championStanding.losses}L`,
            },
            {
              text: `Diff: ${championStanding.points_differential > 0 ? `+${championStanding.points_differential}` : championStanding.points_differential}`,
            },
            {
              text: `${championStanding.points_scored} Pts Scored`,
            },
          ]}
        />
      )}

      {/* Empty State vs Completed Results */}
      {completedMatches.length === 0 ? (
        <TournamentEmptyCard
          icon={<FileText size={30} color="#94A3B8" />}
          title="No results recorded yet"
          description="Completed matches and scores will appear here after results are entered in Matchups."
        />
      ) : (
        /* Populated Results List */
        <View style={styles.resultsContent}>
          {completedRounds.map((group) => (
            <View key={`results-round-${group.roundNumber}`} style={styles.roundSection}>
              {/* Round Header */}
              <TournamentRoundHeading
                title={`ROUND ${group.roundNumber}`}
                badgeLabel={`${group.matches.length} Finished`}
              />

              {/* Match Score Cards */}
              <View style={styles.matchesList}>
                {group.matches.map((match) => {
                  const teamAName = match.team_a?.name ?? 'Player A';
                  const teamBName = match.team_b?.name ?? 'Player B';
                  const aWon = match.winner_team_id === match.team_a_id;
                  const courtLabel = getCourtName(match);
                  const teamAMembers = getTeamMembersText(match.team_a_id);
                  const teamBMembers = getTeamMembersText(match.team_b_id);

                  return (
                    <TournamentResultMatchCard
                      key={match.id}
                      metaText={`Match #${match.match_number} · ${courtLabel}`}
                      statusLabel="Completed"
                      statusVariant="success"
                      sideAName={teamAName}
                      sideASubtitle={teamAMembers}
                      scoreA={match.score_a}
                      isWinnerA={aWon}
                      sideBName={teamBName}
                      sideBSubtitle={teamBMembers}
                      scoreB={match.score_b}
                      isWinnerB={!aWon}
                      winnerName={aWon ? teamAName : teamBName}
                      canEdit={canManage && !isTournamentCompleted}
                      onEdit={() => onEditScore(match)}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    gap: Spacing[3],
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102F2B',
  },
  resultsContent: {
    gap: Spacing[3],
  },
  roundSection: {
    gap: Spacing[2],
  },
  matchesList: {
    gap: Spacing[2],
  },
});
