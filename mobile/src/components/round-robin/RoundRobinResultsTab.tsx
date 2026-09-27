/**
 * Aught2 Pickleball — RoundRobinResultsTab (Results Screen)
 *
 * Screen 4 for Round Robin Tournament Mode:
 * - Heading: Results
 * - Tournament Champion Podium Card: Displays when all matches completed or tournament completed
 * - Empty state: When no results recorded yet
 * - Populated state: Completed match results grouped by round with scores, court info, and winner display
 */

import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { FileText, Trophy, Calendar, Award } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Court, Match, StandingRow, Team, Tournament } from '@/types';
import { groupMatchesByRound } from '@/utils/roundRobinLogic';

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

  const getCourtName = (courtId?: string | null) => {
    if (!courtId) return 'Court 1';
    const found = courts.find((c) => c.id === courtId);
    return found ? found.display_name || found.name : 'Court';
  };

  return (
    <View style={styles.container}>
      {/* Heading */}
      <AppText style={styles.headingTitle}>Results</AppText>

      {/* Champion Podium Card when tournament completed */}
      {isTournamentCompleted && championStanding && (
        <Card style={styles.championCard}>
          <View style={styles.championBadge}>
            <Trophy size={20} color="#D97706" />
            <AppText style={styles.championBadgeText}>TOURNAMENT CHAMPION</AppText>
          </View>

          <AppText style={styles.championTeamName}>
            {championStanding.team_name}
          </AppText>

          {getTeamMembersText(championStanding.team_id) && (
            <AppText style={styles.championMembersText}>
              {getTeamMembersText(championStanding.team_id)}
            </AppText>
          )}

          <View style={styles.championStatsRow}>
            <View style={styles.championStatPill}>
              <Award size={13} color="#087A60" />
              <AppText style={styles.championStatText}>
                {championStanding.wins}W – {championStanding.losses}L
              </AppText>
            </View>
            <View style={styles.championStatPill}>
              <AppText style={styles.championStatText}>
                Diff: {championStanding.points_differential > 0 ? `+${championStanding.points_differential}` : championStanding.points_differential}
              </AppText>
            </View>
            <View style={styles.championStatPill}>
              <AppText style={styles.championStatText}>
                {championStanding.points_scored} Pts Scored
              </AppText>
            </View>
          </View>
        </Card>
      )}

      {/* Empty State vs Completed Results */}
      {completedMatches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <FileText size={30} color="#94A3B8" />
          </View>
          <AppText style={styles.emptyHeading}>
            No results recorded yet
          </AppText>
          <AppText style={styles.emptySubtitle}>
            Completed matches and scores will appear here after results are entered in Matchups.
          </AppText>
        </Card>
      ) : (
        /* Populated Results List */
        <View style={styles.resultsContent}>
          {completedRounds.map((group) => (
            <View key={`results-round-${group.roundNumber}`} style={styles.roundSection}>
              {/* Round Header */}
              <View style={styles.roundHeaderRow}>
                <Calendar size={16} color="#087A60" />
                <AppText style={styles.roundHeading}>
                  ROUND {group.roundNumber}
                </AppText>
                <Badge label={`${group.matches.length} Finished`} variant="default" />
              </View>

              {/* Match Score Cards */}
              <View style={styles.matchesList}>
                {group.matches.map((match) => {
                  const teamAName = match.team_a?.name ?? 'Player A';
                  const teamBName = match.team_b?.name ?? 'Player B';
                  const aWon = match.winner_team_id === match.team_a_id;
                  const courtLabel = getCourtName(match.court_id);
                  const teamAMembers = getTeamMembersText(match.team_a_id);
                  const teamBMembers = getTeamMembersText(match.team_b_id);

                  return (
                    <Card key={match.id} style={styles.resultCard}>
                      <View style={styles.resultTopRow}>
                        <AppText style={styles.matchMetaText}>
                          Match #{match.match_number} · {courtLabel}
                        </AppText>
                        <Badge label="Completed" variant="success" />
                      </View>

                      {/* Scoreboard */}
                      <View style={styles.scoreboard}>
                        {/* Side A */}
                        <View style={[styles.scoreRow, aWon && styles.winningScoreRow]}>
                          <View style={styles.sideInfoCol}>
                            <AppText
                              style={[styles.teamNameText, aWon && styles.winningTeamName]}
                              numberOfLines={1}
                            >
                              {teamAName}
                            </AppText>
                            {teamAMembers && (
                              <AppText style={styles.teamMembersSub} numberOfLines={1}>
                                {teamAMembers}
                              </AppText>
                            )}
                          </View>
                          <AppText
                            style={[styles.scoreValue, aWon && styles.winningScoreValue]}
                          >
                            {match.score_a}
                          </AppText>
                        </View>

                        {/* Side B */}
                        <View style={[styles.scoreRow, !aWon && styles.winningScoreRow]}>
                          <View style={styles.sideInfoCol}>
                            <AppText
                              style={[styles.teamNameText, !aWon && styles.winningTeamName]}
                              numberOfLines={1}
                            >
                              {teamBName}
                            </AppText>
                            {teamBMembers && (
                              <AppText style={styles.teamMembersSub} numberOfLines={1}>
                                {teamBMembers}
                              </AppText>
                            )}
                          </View>
                          <AppText
                            style={[styles.scoreValue, !aWon && styles.winningScoreValue]}
                          >
                            {match.score_b}
                          </AppText>
                        </View>
                      </View>

                      {/* Footer: Winner & Edit */}
                      <View style={styles.resultFooter}>
                        <View style={styles.winnerTag}>
                          <Trophy size={14} color="#D97706" />
                          <AppText style={styles.winnerTagText}>
                            Winner: {aWon ? teamAName : teamBName}
                          </AppText>
                        </View>

                        {canManage && !isTournamentCompleted && (
                          <TouchableOpacity
                            onPress={() => onEditScore(match)}
                            style={styles.editBtn}
                            activeOpacity={0.7}
                          >
                            <AppText style={styles.editBtnText}>Edit Score</AppText>
                          </TouchableOpacity>
                        )}
                      </View>
                    </Card>
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
  championCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  championBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  championBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  championTeamName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  championMembersText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  championStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 4,
  },
  championStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  championStatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
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
  resultsContent: {
    gap: Spacing[3],
  },
  roundSection: {
    gap: Spacing[2],
  },
  roundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  roundHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102F2B',
    letterSpacing: 0.5,
  },
  matchesList: {
    gap: Spacing[2],
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71817E',
  },
  scoreboard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  winningScoreRow: {
    backgroundColor: '#F0FDF4',
  },
  sideInfoCol: {
    flex: 1,
    gap: 1,
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  teamMembersSub: {
    fontSize: 11,
    color: '#64748B',
  },
  winningTeamName: {
    fontWeight: '800',
    color: '#15803D',
  },
  scoreValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#64748B',
    minWidth: 24,
    textAlign: 'right',
  },
  winningScoreValue: {
    color: '#15803D',
    fontWeight: '800',
  },
  resultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  winnerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  winnerTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#DDE8E2',
    backgroundColor: '#FFFFFF',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2B',
  },
});
