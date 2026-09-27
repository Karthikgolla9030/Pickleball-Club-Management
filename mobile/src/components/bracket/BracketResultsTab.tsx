/**
 * Aught2 Pickleball — BracketResultsTab
 *
 * Tab 5 for Bracket Tournament Mode:
 * - When in progress: progress summary of completed / remaining matches
 * - When completed: 🏆 CHAMPION card with Team Name, players, and final match scoreline
 * - Chronological match history of all completed tournament matches with scores and winner indicators
 * - Edit score option for authorized staff
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Trophy, CheckCircle, Award } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Court, Match, Team } from '@/types';
import type { BracketProgress } from '@/types/bracket';
import { getBracketRoundName, isMatchBye } from '@/utils/bracketLogic';

interface BracketResultsTabProps {
  matches: Match[];
  teams: Team[];
  courts: Court[];
  progress: BracketProgress;
  canManage: boolean;
  onEditScore: (match: Match) => void;
  isTournamentCompleted?: boolean;
}

export function BracketResultsTab({
  matches,
  teams,
  courts,
  progress,
  canManage,
  onEditScore,
  isTournamentCompleted = false,
}: BracketResultsTabProps) {
  // Only completed, non-BYE matches
  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === 'completed' && !isMatchBye(m)),
    [matches]
  );

  const totalRounds = useMemo(() => {
    if (matches.length === 0) return 1;
    return Math.max(...matches.map((m) => m.bracket_round ?? m.round_number ?? 1), 1);
  }, [matches]);

  const isDoubleElimination = useMemo(
    () =>
      matches.some(
        (m) =>
          m.bracket_section === 'losers' ||
          m.bracket_section === 'grand_final' ||
          m.bracket_section === 'reset_final'
      ),
    [matches]
  );

  // Find champion team details & decider match
  const finalMatch = useMemo(() => {
    if (isDoubleElimination) {
      const resetMatch = matches.find(
        (m) => m.bracket_section === 'reset_final' || m.label?.includes('Reset Match')
      );
      const grandMatch = matches.find(
        (m) => m.bracket_section === 'grand_final' || m.label === 'Grand Final'
      );
      if (resetMatch && resetMatch.status === 'completed' && resetMatch.winner_team_id) {
        return resetMatch;
      }
      if (
        grandMatch &&
        grandMatch.status === 'completed' &&
        grandMatch.winner_team_id &&
        (!resetMatch || resetMatch.status === 'cancelled')
      ) {
        return grandMatch;
      }
      if (resetMatch && resetMatch.status === 'pending') {
        return resetMatch;
      }
      return grandMatch || null;
    }
    return matches.find((m) => m.next_match_id === null && m.bracket_round !== null) || null;
  }, [matches, isDoubleElimination]);

  const resetMatch = useMemo(
    () => matches.find((m) => m.bracket_section === 'reset_final' || m.label?.includes('Reset Match')),
    [matches]
  );

  const championTeam = useMemo(() => {
    if (!finalMatch || finalMatch.status !== 'completed' || !finalMatch.winner_team_id) {
      return null;
    }
    return (
      teams.find((t) => t.id === finalMatch.winner_team_id) ??
      finalMatch.winner_team ??
      (finalMatch.winner_team_id === finalMatch.team_a_id ? finalMatch.team_a : finalMatch.team_b) ??
      null
    );
  }, [finalMatch, teams]);

  const championMembers = useMemo(() => {
    if (!championTeam) return [];
    if ('members' in championTeam && Array.isArray((championTeam as Team).members)) {
      return (championTeam as Team).members;
    }
    const foundTeam = teams.find((t) => t.id === championTeam.id);
    return foundTeam?.members || [];
  }, [championTeam, teams]);

  const runnerUpTeam = useMemo(() => {
    if (!finalMatch || finalMatch.status !== 'completed' || !finalMatch.winner_team_id) {
      return null;
    }
    const runnerUpId =
      finalMatch.winner_team_id === finalMatch.team_a_id ? finalMatch.team_b_id : finalMatch.team_a_id;
    if (!runnerUpId) return null;
    return (
      teams.find((t) => t.id === runnerUpId) ??
      (runnerUpId === finalMatch.team_a_id ? finalMatch.team_a : finalMatch.team_b) ??
      null
    );
  }, [finalMatch, teams]);

  const getCourtName = (courtId?: string | null) => {
    if (!courtId) return null;
    const found = courts.find((c) => c.id === courtId);
    return found ? found.display_name || found.name : 'Court';
  };

  const isFinished = progress.isFinished || (isTournamentCompleted && championTeam !== null);

  return (
    <View style={styles.container}>
      {/* ─── Champion Celebration Card (When Completed) ──────────────────── */}
      {isFinished && championTeam && (
        <Card style={styles.championCard}>
          <View style={styles.championContent}>
            <View style={styles.trophyCircle}>
              <Trophy size={32} color="#F59E0B" />
            </View>
            <AppText variant="caption" style={styles.championOverline}>
              TOURNAMENT CHAMPIONS
            </AppText>
            <AppText variant="heading1" style={styles.championTeamName}>
              {championTeam.name}
            </AppText>

            {/* Players */}
            {championMembers.length > 0 && (
              <View style={styles.championPlayersRow}>
                <AppText variant="body" style={styles.championPlayerName}>
                  {championMembers[0]?.display_name ||
                    championMembers[0]?.user_email ||
                    'Champion'}
                </AppText>
                {championMembers.length > 1 && (
                  <>
                    <AppText variant="body" color="tertiary">
                      •
                    </AppText>
                    <AppText variant="body" style={styles.championPlayerName}>
                      {championMembers[1]?.display_name ||
                        championMembers[1]?.user_email ||
                        'Partner 2'}
                    </AppText>
                  </>
                )}
              </View>
            )}

            {/* Runner-Up */}
            {runnerUpTeam && (
              <View style={styles.runnerUpRow}>
                <AppText variant="caption" style={styles.runnerUpLabel}>
                  Runner-Up:
                </AppText>
                <AppText variant="body" style={styles.runnerUpName}>
                  🥈 {runnerUpTeam.name}
                </AppText>
              </View>
            )}

            {/* Final Match Scoreline */}
            {finalMatch && finalMatch.score_a !== null && finalMatch.score_b !== null && (
              <View style={styles.finalScorePill}>
                <Award size={14} color="#F59E0B" />
                <AppText variant="caption" style={styles.finalScoreText}>
                  {finalMatch.label || 'Championship'}: {finalMatch.score_a} - {finalMatch.score_b}
                </AppText>
              </View>
            )}

            {/* Double Elimination Decider Note */}
            {isDoubleElimination && (
              <View style={styles.deOutcomePill}>
                <AppText variant="caption" style={styles.deOutcomeText}>
                  {resetMatch?.status === 'completed'
                    ? 'Championship decided in Reset Final (Match #15)'
                    : 'Winners Bracket Champion won Grand Final (Reset Final Not Required)'}
                </AppText>
              </View>
            )}
          </View>
        </Card>
      )}

      {/* ─── Tournament Status / Progress Summary ────────────────────────── */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCol}>
            <AppText style={styles.summaryLabel}>
              PLAYED MATCHES
            </AppText>
            <AppText style={styles.summaryNum}>
              {completedMatches.length}
            </AppText>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.summaryCol}>
            <AppText style={styles.summaryLabel}>
              REMAINING
            </AppText>
            <AppText style={styles.summaryNum}>
              {progress.remainingMatches}
            </AppText>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.summaryCol}>
            <AppText style={styles.summaryLabel}>
              STATUS
            </AppText>
            <View style={styles.statusPill}>
              <AppText style={styles.statusPillText}>
                {progress.isFinished ? '100% DONE' : `${progress.percentComplete}% DONE`}
              </AppText>
            </View>
          </View>
        </View>
      </Card>

      {/* ─── Match History List ──────────────────────────────────────────── */}
      <View style={styles.historySection}>
        <AppText style={styles.historyHeaderTitle}>
          Match History ({completedMatches.length})
        </AppText>

        {completedMatches.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <CheckCircle size={32} color="#102F2B" />
            </View>
            <AppText style={styles.emptyTitle}>
              No completed matches
            </AppText>
            <AppText style={styles.emptySubtitle}>
              Recorded scores will appear here chronologically once matches are played.
            </AppText>
          </Card>
        ) : (
          <View style={styles.matchesList}>
            {completedMatches.map((match) => {
              const roundNum = match.bracket_round ?? match.round_number ?? 1;
              const roundName = getBracketRoundName(roundNum, totalRounds);

              const teamAName = match.team_a?.name ?? 'Team A';
              const teamBName = match.team_b?.name ?? 'Team B';
              const winnerIsA = match.winner_team_id === match.team_a_id;
              const winnerName = winnerIsA ? teamAName : teamBName;
              const courtLabel = getCourtName(match.court_id);

              return (
                <Card key={match.id} style={styles.historyCard}>
                  {/* Top Header */}
                  <View style={styles.historyCardHeader}>
                    <View style={styles.headerMetaLeft}>
                      <Badge label={roundName} variant="default" />
                      <AppText variant="caption" color="secondary" style={{ fontWeight: '700' }}>
                        MATCH #{match.match_number ?? match.bracket_position}
                      </AppText>
                      {courtLabel && (
                        <View style={styles.courtPill}>
                          <AppText variant="caption" style={styles.courtPillText}>
                            {courtLabel}
                          </AppText>
                        </View>
                      )}
                    </View>

                    <Badge label="Completed" variant="success" />
                  </View>

                  {/* Scoreboard */}
                  <View style={styles.scoreboard}>
                    {/* Team A */}
                    <View style={styles.scoreRow}>
                      <AppText
                        variant="body"
                        numberOfLines={1}
                        style={[styles.teamLabel, winnerIsA && styles.winnerTeamLabel]}
                      >
                        {teamAName}
                      </AppText>
                      <AppText
                        variant="heading2"
                        style={[styles.scoreValue, winnerIsA && styles.winningScoreValue]}
                      >
                        {match.score_a}
                      </AppText>
                    </View>

                    <View style={styles.scoreDivider} />

                    {/* Team B */}
                    <View style={styles.scoreRow}>
                      <AppText
                        variant="body"
                        numberOfLines={1}
                        style={[styles.teamLabel, !winnerIsA && styles.winnerTeamLabel]}
                      >
                        {teamBName}
                      </AppText>
                      <AppText
                        variant="heading2"
                        style={[styles.scoreValue, !winnerIsA && styles.winningScoreValue]}
                      >
                        {match.score_b}
                      </AppText>
                    </View>
                  </View>

                  {/* Footer: Winner Tag & Edit Action */}
                  <View style={styles.historyCardFooter}>
                    <View style={styles.winnerTag}>
                      <Trophy size={14} color="#F59E0B" />
                      <AppText variant="caption" style={{ color: Colors.text.primary }}>
                        Winner: <AppText style={{ fontWeight: '700' }}>{winnerName}</AppText>
                      </AppText>
                    </View>

                    {canManage && (match.id === finalMatch?.id || (!isTournamentCompleted && !progress.isFinished)) && (
                      <Button
                        label="Edit Score"
                        variant="outline"
                        size="sm"
                        onPress={() => onEditScore(match)}
                      />
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing[4],
    gap: Spacing[4],
  },
  championCard: {
    padding: Spacing[5],
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: Radius.lg,
  },
  championContent: {
    alignItems: 'center',
    gap: Spacing[2],
  },
  trophyCircle: {
    width: 60,
    height: 60,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  championOverline: {
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#F59E0B',
  },
  championTeamName: {
    color: Colors.text.primary,
    textAlign: 'center',
  },
  championPlayersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  championPlayerName: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  runnerUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    marginTop: Spacing[1],
  },
  runnerUpLabel: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  runnerUpName: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  finalScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    marginTop: Spacing[1],
  },
  finalScoreText: {
    color: '#F59E0B',
    fontWeight: '700',
  },
  deOutcomePill: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    backgroundColor: Colors.background.tertiary,
    marginTop: Spacing[1],
  },
  deOutcomeText: {
    color: Colors.text.secondary,
    fontWeight: '600',
    fontSize: 11,
    textAlign: 'center',
  },
  summaryCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE8E2',
    borderWidth: 1,
    borderRadius: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryCol: {
    alignItems: 'center',
    gap: 4,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#71817E',
    letterSpacing: 0.4,
  },
  summaryNum: {
    color: '#102F2B',
    fontSize: 22,
    fontWeight: '800',
  },
  statusPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  statusPillText: {
    color: '#0284C7',
    fontSize: 11,
    fontWeight: '800',
  },
  verticalDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0',
  },
  historySection: {
    gap: Spacing[3],
  },
  historyHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102F2B',
    marginTop: 4,
  },
  emptyCard: {
    padding: Spacing[6],
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE8E2',
    borderWidth: 1,
    borderRadius: 16,
    gap: 8,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EBF4F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2B',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#71817E',
    maxWidth: 280,
  },
  matchesList: {
    gap: Spacing[3],
  },
  historyCard: {
    padding: Spacing[3.5],
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE8E2',
    borderWidth: 1,
    borderRadius: 16,
    gap: Spacing[2],
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  courtPill: {
    paddingHorizontal: Spacing[1.5],
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
  },
  courtPillText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '600',
  },
  scoreboard: {
    backgroundColor: Colors.background.tertiary,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreDivider: {
    height: 1,
    backgroundColor: Colors.surface.border,
  },
  teamLabel: {
    color: Colors.text.secondary,
    flex: 1,
  },
  winnerTeamLabel: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  scoreValue: {
    color: Colors.text.secondary,
    fontWeight: '800',
    minWidth: 32,
    textAlign: 'right',
  },
  winningScoreValue: {
    color: Colors.status.success,
  },
  historyCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[1],
  },
  winnerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
});
