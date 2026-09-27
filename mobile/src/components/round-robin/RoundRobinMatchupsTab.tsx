/**
 * Aught2 Pickleball — RoundRobinMatchupsTab (Matchups Screen)
 *
 * Screen 2 for Round Robin Tournament Mode:
 * - Heading: Matchups
 * - Round Robin setup card: 3 summary columns (Teams/Players, Total Matches, Rounds)
 * - Empty state:
 *   - When registration_open: "Registration Open", shows Close Registration button
 *   - When registration_closed: "Ready to Generate Matchups", shows Generate matchups button
 *   - When < 2 teams: Explains minimum participant requirement
 * - Populated state: Grouped schedule by round with court assignments, status, team/player names, and lifecycle actions:
 *   - Scheduled: [Start Match] and [Enter Score]
 *   - In Progress: [Enter Score]
 *   - Completed: Score display and [Edit Score]
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  Calendar,
  Users,
  Layers,
  Play,
  CheckCircle2,
  Lock,
  Clock,
  Check,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FilterChips } from '@/components/FilterChips';
import { Colors, Radius, Spacing } from '@/theme';
import type { Court, Match, Team, Tournament } from '@/types';
import {
  calculateExpectedRoundRobinSchedule,
  groupMatchesByRound,
} from '@/utils/roundRobinLogic';

interface RoundRobinMatchupsTabProps {
  tournament?: Tournament | null;
  matches: Match[];
  teams: Team[];
  courts: Court[];
  canManage: boolean;
  canGenerate: boolean;
  isGenerating?: boolean;
  onGenerate: () => void;
  onOpenScoreModal: (match: Match) => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  onCloseRegistration?: () => Promise<void>;
  isClosingRegistration?: boolean;
  onStartMatch?: (matchId: string) => Promise<void>;
  isStartingMatch?: boolean;
  teamSize?: number;
}

export function RoundRobinMatchupsTab({
  tournament,
  matches,
  teams,
  courts,
  canManage,
  canGenerate,
  isGenerating = false,
  onGenerate,
  onOpenScoreModal,
  onRegenerate,
  isRegenerating = false,
  onCloseRegistration,
  isClosingRegistration = false,
  onStartMatch,
  isStartingMatch = false,
  teamSize = 1,
}: RoundRobinMatchupsTabProps) {
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');
  const [startingMatchId, setStartingMatchId] = useState<string | null>(null);

  // Pre-generation schedule preview
  const schedulePreview = useMemo(
    () => calculateExpectedRoundRobinSchedule(teams.length),
    [teams.length]
  );

  const totalMatchesCount = matches.length > 0 ? matches.length : schedulePreview.totalMatches;
  const totalRoundsCount =
    matches.length > 0
      ? Math.max(...matches.map((m) => m.round_number ?? 1), 1)
      : schedulePreview.totalRounds;

  const isTournamentCompleted =
    tournament?.status === 'completed' ||
    (matches.length > 0 && matches.every((m) => m.status === 'completed'));

  // Grouped matches
  const roundGroups = useMemo(() => groupMatchesByRound(matches), [matches]);

  const filteredGroups = useMemo(() => {
    if (selectedRound === 'all') return roundGroups;
    return roundGroups.filter((rg) => rg.roundNumber === selectedRound);
  }, [roundGroups, selectedRound]);

  const roundChips: { key: string; label: string }[] = useMemo(
    () => [
      { key: 'all', label: `All Rounds (${matches.length})` },
      ...roundGroups.map((rg) => ({
        key: String(rg.roundNumber),
        label: `Round ${rg.roundNumber}`,
      })),
    ],
    [matches.length, roundGroups]
  );

  const getCourtName = (courtId?: string | null, matchIdx?: number) => {
    if (courtId) {
      const found = courts.find((c) => c.id === courtId);
      if (found) return found.display_name || found.name;
    }
    if (courts.length > 0 && typeof matchIdx === 'number') {
      const c = courts[matchIdx % courts.length];
      return c.display_name || c.name;
    }
    return `Court ${(matchIdx ?? 0) + 1}`;
  };

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

  const handleStartMatchPress = async (matchId: string) => {
    if (!onStartMatch) return;
    try {
      setStartingMatchId(matchId);
      await onStartMatch(matchId);
    } finally {
      setStartingMatchId(null);
    }
  };

  const isRegistrationOpen = tournament?.status === 'registration_open';
  const isRegistrationClosed = tournament?.status === 'registration_closed';

  return (
    <View style={styles.container}>
      {/* Heading */}
      <AppText style={styles.headingTitle}>Matchups</AppText>

      {/* Round Robin Setup Summary Card (3 Columns) */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryCol}>
          <Users size={20} color={Colors.brand.primary} />
          <AppText style={styles.summaryNumber}>{teams.length}</AppText>
          <AppText style={styles.summaryLabel}>
            {teamSize > 1 ? 'Teams' : 'Players'}
          </AppText>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryCol}>
          <Calendar size={20} color={Colors.text.secondary} />
          <AppText style={styles.summaryNumber}>{totalMatchesCount}</AppText>
          <AppText style={styles.summaryLabel}>Matches</AppText>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryCol}>
          <Layers size={20} color={Colors.brand.accent} />
          <AppText style={styles.summaryNumber}>{totalRoundsCount}</AppText>
          <AppText style={styles.summaryLabel}>Rounds</AppText>
        </View>
      </Card>

      {/* Empty State vs Generated Matches */}
      {matches.length === 0 ? (
        <Card style={styles.emptyCard}>
          {isRegistrationOpen ? (
            /* State 1: Registration Open - Action to close registration */
            <>
              <View style={[styles.emptyIconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Lock size={30} color="#D97706" />
              </View>
              <AppText style={styles.emptyHeading}>
                Registration is Open
              </AppText>
              <AppText style={styles.emptySubtitle}>
                {teamSize > 1
                  ? `${teams.length} teams registered (${teams.length * teamSize} players). Registration must be closed before generating the Round Robin schedule.`
                  : `${teams.length} players registered. Registration must be closed before generating the Round Robin schedule.`}
              </AppText>

              {canManage && onCloseRegistration && (
                <View style={styles.emptyActionWrapper}>
                  <Button
                    label={isClosingRegistration ? 'Closing registration...' : 'Close registration & prepare schedule'}
                    variant="primary"
                    size="md"
                    onPress={() => { void onCloseRegistration(); }}
                    disabled={isClosingRegistration}
                    loading={isClosingRegistration}
                  />
                </View>
              )}

              <AppText style={styles.requirementHint}>
                Once registration is closed, you can generate all {totalMatchesCount} matches across {totalRoundsCount} rounds.
              </AppText>
            </>
          ) : teams.length >= 2 ? (
            /* State 2: Ready to Generate Matchups */
            <>
              <View style={styles.emptyIconCircle}>
                <Calendar size={30} color={Colors.brand.primary} />
              </View>
              <AppText style={styles.emptyHeading}>
                Ready to Generate Matchups
              </AppText>
              <AppText style={styles.emptySubtitle}>
                {teamSize > 1
                  ? `${teams.length} registered teams ready • ${totalMatchesCount} matches across ${totalRoundsCount} rounds.`
                  : `${teams.length} players ready • ${totalMatchesCount} matches across ${totalRoundsCount} rounds.`}
              </AppText>

              {/* Generate Matchups Button */}
              <View style={styles.emptyActionWrapper}>
                <Button
                  label={isGenerating ? 'Generating schedule...' : 'Generate matchups'}
                  variant="primary"
                  size="md"
                  onPress={onGenerate}
                  disabled={!canGenerate || isGenerating}
                  loading={isGenerating}
                />
              </View>
            </>
          ) : (
            /* State 3: Less than 2 participants */
            <>
              <View style={styles.emptyIconCircle}>
                <Calendar size={30} color={Colors.text.tertiary} />
              </View>
              <AppText style={styles.emptyHeading}>
                Not Enough Participants
              </AppText>
              <AppText style={styles.emptySubtitle}>
                Register at least 2 {teamSize > 1 ? 'teams' : 'players'} to generate the round-robin schedule.
              </AppText>

              <View style={styles.emptyActionWrapper}>
                <Button
                  label="Generate matchups"
                  variant="outline"
                  size="md"
                  disabled
                  onPress={() => {}}
                />
              </View>

              <AppText style={styles.requirementHint}>
                You need at least 2 {teamSize > 1 ? 'teams' : 'players'} to generate matchups.
              </AppText>
            </>
          )}
        </Card>
      ) : (
        /* Populated Matchups View */
        <View style={styles.matchesContent}>
          {/* Round Filter Chips — shared FilterChips component */}
          <FilterChips<string>
            chips={roundChips}
            activeChip={String(selectedRound)}
            onChipPress={(chipKey) => {
              setSelectedRound(chipKey === 'all' ? 'all' : Number(chipKey));
            }}
          />

          {/* Grouped Match Cards */}
          {filteredGroups.map((rg) => (
            <View key={`rg-${rg.roundNumber}`} style={styles.roundSection}>
              <View style={styles.roundHeaderRow}>
                <AppText style={styles.roundHeading}>ROUND {rg.roundNumber}</AppText>
                <Badge
                  label={`${rg.completedCount}/${rg.totalCount} Done`}
                  variant={rg.isRoundComplete ? 'success' : 'default'}
                />
              </View>

              <View style={styles.matchesList}>
                {rg.matches.map((match, mIdx) => {
                  const isCompleted = match.status === 'completed';
                  const isInProgress = match.status === 'in_progress';
                  const isPending = match.status === 'pending';

                  const teamAName = match.team_a?.name ?? 'Player A';
                  const teamBName = match.team_b?.name ?? 'Player B';
                  const teamAMembers = getTeamMembersText(match.team_a_id);
                  const teamBMembers = getTeamMembersText(match.team_b_id);

                  const aWon = isCompleted && match.winner_team_id === match.team_a_id;
                  const bWon = isCompleted && match.winner_team_id === match.team_b_id;
                  const courtLabel = getCourtName(match.court_id, mIdx);

                  const statusLabel =
                    isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Scheduled';
                  const statusVariant =
                    isCompleted ? 'success' : isInProgress ? 'warning' : 'default';

                  const isThisStarting = startingMatchId === match.id;

                  return (
                    <Card key={match.id} style={styles.matchCard}>
                      <View style={styles.matchMetaRow}>
                        <AppText style={styles.matchMetaText}>
                          Match #{match.match_number} · {courtLabel}
                        </AppText>
                        <Badge label={statusLabel} variant={statusVariant} />
                      </View>

                      {/* Opponents & Score */}
                      <View style={styles.matchScoresContainer}>
                        {/* Side A */}
                        <View style={[styles.sideRow, aWon && styles.winningSide]}>
                          <View style={styles.sideInfoCol}>
                            <AppText
                              style={[styles.teamNameText, aWon && styles.winningTeamText]}
                              numberOfLines={1}
                            >
                              {teamAName}
                            </AppText>
                            {teamSize > 1 && teamAMembers && (
                              <AppText style={styles.teamMembersSub} numberOfLines={1}>
                                {teamAMembers}
                              </AppText>
                            )}
                          </View>
                          <AppText
                            style={[styles.scoreText, aWon && styles.winningScoreText]}
                          >
                            {match.score_a !== null ? match.score_a : '-'}
                          </AppText>
                        </View>

                        {/* Side B */}
                        <View style={[styles.sideRow, bWon && styles.winningSide]}>
                          <View style={styles.sideInfoCol}>
                            <AppText
                              style={[styles.teamNameText, bWon && styles.winningTeamText]}
                              numberOfLines={1}
                            >
                              {teamBName}
                            </AppText>
                            {teamSize > 1 && teamBMembers && (
                              <AppText style={styles.teamMembersSub} numberOfLines={1}>
                                {teamBMembers}
                              </AppText>
                            )}
                          </View>
                          <AppText
                            style={[styles.scoreText, bWon && styles.winningScoreText]}
                          >
                            {match.score_b !== null ? match.score_b : '-'}
                          </AppText>
                        </View>
                      </View>

                      {/* Match Actions — standardized Button components */}
                      {canManage && (
                        <View style={styles.matchActionsRow}>
                          {isPending && (
                            <>
                              {onStartMatch && (
                                <Button
                                  label={isThisStarting ? 'Starting...' : 'Start Match'}
                                  variant="outline"
                                  size="sm"
                                  onPress={() => { void handleStartMatchPress(match.id); }}
                                  disabled={isThisStarting}
                                  loading={isThisStarting}
                                  style={{ flex: 1 }}
                                />
                              )}

                              <Button
                                label="Enter Score"
                                variant="primary"
                                size="sm"
                                onPress={() => onOpenScoreModal(match)}
                                style={{ flex: 1 }}
                              />
                            </>
                          )}

                          {isInProgress && (
                            <Button
                              label="Enter Score"
                              variant="primary"
                              size="sm"
                              onPress={() => onOpenScoreModal(match)}
                              style={{ flex: 1 }}
                            />
                          )}

                          {isCompleted && !isTournamentCompleted && (
                            <Button
                              label="Edit Score"
                              variant="outline"
                              size="sm"
                              onPress={() => onOpenScoreModal(match)}
                              style={{ flex: 1 }}
                            />
                          )}
                        </View>
                      )}
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
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryCol: {
    alignItems: 'center',
    flex: 1,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#102F2B',
    marginTop: 6,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#71817E',
    marginTop: 2,
    fontWeight: '500',
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
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
    backgroundColor: '#EAF6EF',
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
  emptyActionWrapper: {
    width: '100%',
    maxWidth: 320,
    marginTop: Spacing[4],
  },
  requirementHint: {
    fontSize: 12,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    maxWidth: 280,
  },
  matchesContent: {
    gap: Spacing[3],
  },
  roundSection: {
    gap: Spacing[2],
  },
  roundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  roundHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: 0.5,
  },
  matchesList: {
    gap: Spacing[2],
  },
  matchCard: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  matchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  matchScoresContainer: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    overflow: 'hidden',
  },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  winningSide: {
    backgroundColor: Colors.status.successBg,
  },
  sideInfoCol: {
    flex: 1,
    gap: 2,
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  teamMembersSub: {
    fontSize: 11,
    color: Colors.text.tertiary,
  },
  winningTeamText: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.secondary,
    minWidth: 28,
    textAlign: 'right',
  },
  winningScoreText: {
    color: Colors.status.success,
    fontWeight: '700',
  },
  matchActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: 2,
  },
});
